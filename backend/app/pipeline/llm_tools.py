"""Shared Bedrock plumbing for the extraction fallback: one call, one cache,
two backends.

This exists so there is exactly one place that knows how to talk to Bedrock
for extraction, one cache format, and one way to pull a forced tool call out
of a Converse response. It is deliberately separate from app.cloud.llm (the
classification client): that one does freeform JSON-in-text with an
in-memory cache, this one does forced tool-use with an on-disk cache keyed on
the exact prompt. Model id and region come from the same env vars as
app.cloud.llm so there is one place to point at a different model/region,
not two.

The cache is keyed on the exact prompt *and* its version *and* the model id,
so bumping any of the three invalidates cleanly rather than silently mixing
two prompts into one submission. On Lambda the cache lives in /tmp, which
survives across warm invocations of the same execution environment (a retry
of the same email in the same container replays for free) but not across
cold starts - there is no S3-backed shared cache yet.

Owner: pipeline (P2), adapted from feature/llm-extraction-fallback (tools/llm.py).
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from pathlib import Path

from app.cloud.llm import DEFAULT_MODEL

MODEL = (os.environ.get("LLM_MODEL_EXTRACT") or os.environ.get("LLM_MODEL_ID") or DEFAULT_MODEL)
AWS_REGION = os.environ.get("BEDROCK_REGION") or os.environ.get("AWS_REGION") or "ap-southeast-1"

#: Writable in Lambda (/tmp) and in a local checkout (falls back to cwd).
CACHE_DIR = Path(os.environ.get("LLM_CACHE_DIR") or ("/tmp" if os.path.isdir("/tmp") else "."))

#: Greedy decoding is what AWS recommends for Nova tool use, and it is also
#: what makes a re-run reproduce the cache instead of drifting.
TEMPERATURE = 0.0
TOP_P = 1.0
TOP_K = 1


@dataclass
class Call:
    """One model call, reduced to what the cache needs to key on."""
    system: str
    messages: list[dict]
    model: str
    version: str                       # prompt version, e.g. "extract-llm/v1"
    tool_config: dict = field(default_factory=dict)
    max_tokens: int = 512

    def key(self) -> str:
        blob = json.dumps(
            {"v": self.version, "model": self.model,
             "system": self.system, "messages": self.messages},
            sort_keys=True,
        )
        return hashlib.sha256(blob.encode()).hexdigest()[:32]

    def text(self) -> str:
        """The user turn as one string - for the cache probe and the tests."""
        return "".join(b.get("text", "") for m in self.messages for b in m["content"])

    def tool_name(self) -> str:
        return self.tool_config["toolChoice"]["tool"]["name"]


class BedrockBackend:
    """Amazon Nova Lite (or whatever LLM_MODEL_EXTRACT names) through the
    Bedrock Converse API. The client is built lazily so tests and any
    offline path work with no boto3 client construction up front."""

    def __init__(self, model: str = MODEL, region: str = AWS_REGION):
        self.model = model
        self.region = region
        self._client = None

    def client(self):
        if self._client is None:
            import boto3
            from botocore.config import Config

            self._client = boto3.client(
                "bedrock-runtime",
                region_name=self.region,
                config=Config(retries={"max_attempts": 3, "mode": "adaptive"},
                              connect_timeout=5, read_timeout=45),
            )
        return self._client

    def __call__(self, call: Call) -> dict:
        response = self.client().converse(
            modelId=call.model,
            system=[{"text": call.system}],
            messages=call.messages,
            inferenceConfig={"maxTokens": call.max_tokens,
                             "temperature": TEMPERATURE,
                             "topP": TOP_P},
            # topK is not part of the common inferenceConfig; Nova takes it here.
            additionalModelRequestFields={"inferenceConfig": {"topK": TOP_K}},
            toolConfig=call.tool_config,
        )
        return tool_input(response, call.tool_name())


def tool_input(response: dict, name: str) -> dict:
    """The forced tool call's arguments, or a clear failure.

    Converse hands back tool input already decoded, so there is no JSON string
    to parse and no escaping to get wrong.
    """
    stop = response.get("stopReason")
    if stop in ("content_filtered", "guardrail_intervened"):
        raise RuntimeError(f"model declined: stopReason={stop}")
    for block in response["output"]["message"].get("content", []):
        if "toolUse" in block and block["toolUse"]["name"] == name:
            return dict(block["toolUse"]["input"])
    raise RuntimeError(f"no {name} call in response (stopReason={stop})")


class ScriptedBackend:
    """Canned verdicts, keyed by a substring of the rendered evidence.

    Tests only. Exists so the validation, threshold and cache logic can be
    exercised without credentials. "*" matches any call.
    """

    def __init__(self, table: dict[str, dict]):
        self.table = table
        self.calls: list[str] = []

    def __call__(self, call: Call) -> dict:
        text = call.text()
        for marker, verdict in self.table.items():
            if marker == "*" or marker in text:
                self.calls.append(marker)
                return dict(verdict)
        raise AssertionError("ScriptedBackend has no verdict for this call")


class DeadBackend:
    """Every call fails. Proves one dead call loses one item, not the run."""

    def __call__(self, call: Call) -> dict:
        raise RuntimeError("no credentials")


class Cache:
    """Verdicts on disk, keyed by the exact prompt that produced them."""

    def __init__(self, path: Path):
        self.path = path
        self.data: dict[str, dict] = {}
        if path.exists():
            try:
                self.data = json.loads(path.read_text(encoding="utf-8"))
            except (ValueError, OSError):
                self.data = {}  # a corrupt or half-written cache file costs nothing but a refetch
        self.hits = self.misses = 0

    def get(self, call: Call, backend) -> dict:
        key = call.key()
        if key in self.data:
            self.hits += 1
            return self.data[key]["verdict"]
        self.misses += 1
        verdict = backend(call)
        self.data[key] = {"prompt_version": call.version,
                          "model": call.model, "verdict": verdict}
        return verdict

    def save(self) -> None:
        try:
            self.path.write_text(json.dumps(self.data, indent=2, sort_keys=True), encoding="utf-8")
        except OSError:
            pass  # a lost cache write costs a re-fetch next time, never correctness


_extract_cache: Cache | None = None


def extract_cache() -> Cache:
    """One shared on-disk cache per warm Lambda container for extraction fallback calls."""
    global _extract_cache
    if _extract_cache is None:
        _extract_cache = Cache(CACHE_DIR / "llm_extract_cache.json")
    return _extract_cache

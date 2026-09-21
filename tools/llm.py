"""Shared Bedrock plumbing: one call, one cache, two backends.

Both P2 model steps sit on this - classification (llm_classify.py) and field
extraction (llm_extract.py). It exists so there is exactly one place that
knows how to talk to Bedrock, one cache format, and one way to pull a forced
tool call out of a Converse response.

Model: Amazon Nova Lite through the Converse API (SDD constraint C-3). Nova
has no `strict` flag on a tool schema - that is an Anthropic feature - so a
closed schema here is a strong hint to the model, never a guarantee from the
API. Every caller validates what comes back into a Pydantic contract and
drops whatever fails. That gate, not the API, is what satisfies FR-EXT-05.

The cache is keyed on the exact prompt *and* its version *and* the model id,
so bumping any of the three invalidates cleanly rather than silently mixing
two prompts into one submission. Phase 6 depends on this: a cold clone
replays every verdict for free and reproduces the pinned score.
"""
from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent

#: Nova Lite. The bare id works where the model is available in-region; most
#: regions route it through a cross-region inference profile instead, which
#: takes a geography prefix - "us.amazon.nova-lite-v1:0". If a run dies on
#: ValidationException naming the model id, that prefix is the first thing to
#: try. P1 owns the client; we own the string.
MODEL = os.environ.get("SDVS_MODEL", "amazon.nova-lite-v1:0")
AWS_REGION = os.environ.get("AWS_REGION", "us-east-1")

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
    version: str                       # prompt version, e.g. "extract/v1"
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
    """Amazon Nova Lite through the Bedrock Converse API.

    The client is built lazily so every offline subcommand - prompt, selftest,
    and a fully cached run - works with no boto3 and no credentials present.
    """

    def __init__(self, model: str = MODEL, region: str = AWS_REGION):
        self.model = model
        self.region = region
        self._client = None

    def client(self):
        if self._client is None:
            try:
                import boto3
            except ImportError as exc:
                raise RuntimeError(
                    "boto3 is not installed - `pip install boto3`. Every "
                    "offline subcommand (prompt, selftest, tune) works without "
                    "it; only run and audit call Bedrock."
                ) from exc
            self._client = boto3.client("bedrock-runtime", region_name=self.region)
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

    Tests only - it deliberately cannot be selected from the command line.
    Exists so the validation, threshold, conflict and cache logic can be
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
            self.data = json.loads(path.read_text(encoding="utf-8"))
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
        self.path.write_text(json.dumps(self.data, indent=2, sort_keys=True),
                             encoding="utf-8")

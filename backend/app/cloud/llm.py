"""
Single LLM client (Amazon Bedrock, Converse API). All model calls in the app go
through this module so retries, timeouts, logging and output cleaning live in
one place.

    from app.cloud import llm
    data = llm.generate_json(prompt, schema, task="extract")            # -> dict
    data = llm.generate_json(prompt, schema, images=[(png_bytes, "png")])
    text = llm.generate_text(prompt, task="classify")

Failures raise LLMError (with .kind and .retryable) instead of returning junk,
so the pipeline can send the email to the review queue / failure list.

Env:
    LLM_MODEL_CLASSIFY, LLM_MODEL_EXTRACT   model / inference-profile IDs per task
    LLM_MODEL_ID                            fallback for both
    BEDROCK_REGION                          defaults to AWS_REGION, then ap-southeast-1
    LLM_CACHE=0                             disable the in-memory response cache

Owner: cloud. Prompts and schemas belong to the pipeline (classify/extract).
"""
import hashlib
import json
import logging
import os
import re
import time

log = logging.getLogger("sdoc.llm")
logging.getLogger("sdoc").setLevel(logging.INFO)

DEFAULT_MODEL = "apac.amazon.nova-lite-v1:0"
JSON_SYSTEM = (
    "You are a precise data-extraction engine. Respond with a single JSON value only. "
    "No prose, no explanations, no markdown code fences."
)
_CACHE_MAX = 2000


class LLMError(Exception):
    """kind: throttled | timeout | access_denied | validation | service |
    truncated | invalid_json | schema | unknown"""

    def __init__(self, kind, message, retryable=False):
        super().__init__(f"{kind}: {message}")
        self.kind = kind
        self.retryable = retryable


def _extract_json(text):
    """Parse JSON from a model reply, tolerating code fences and stray prose."""
    t = (text or "").strip()
    try:
        return json.loads(t)
    except ValueError:
        pass
    m = re.search(r"```(?:json)?\s*(.*?)```", t, re.DOTALL | re.IGNORECASE)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except ValueError:
            pass
    dec = json.JSONDecoder()
    for i, ch in enumerate(t):
        if ch in "{[":
            try:
                return dec.raw_decode(t[i:])[0]
            except ValueError:
                continue
    raise ValueError("no valid JSON found in model reply")


def _map_error(exc):
    from botocore.exceptions import ClientError, ConnectTimeoutError, EndpointConnectionError, ReadTimeoutError

    if isinstance(exc, (ReadTimeoutError, ConnectTimeoutError)):
        return LLMError("timeout", str(exc), retryable=True)
    if isinstance(exc, EndpointConnectionError):
        return LLMError("service", str(exc), retryable=True)
    if isinstance(exc, ClientError):
        code = exc.response.get("Error", {}).get("Code", "")
        msg = exc.response.get("Error", {}).get("Message", str(exc))
        if code in ("ThrottlingException", "TooManyRequestsException", "ServiceQuotaExceededException"):
            return LLMError("throttled", msg, retryable=True)
        if code == "AccessDeniedException":
            return LLMError("access_denied", msg)
        if code == "ValidationException":
            return LLMError("validation", msg)
        if code in ("ModelTimeoutException", "ServiceUnavailableException", "InternalServerException", "ModelErrorException", "ModelNotReadyException"):
            return LLMError("service", msg, retryable=True)
        return LLMError("unknown", f"{code}: {msg}")
    return LLMError("unknown", repr(exc))


class LLMClient:
    def __init__(self, client=None):
        self._client = client
        self._cache = {}

    def _bedrock(self):
        if self._client is None:
            import boto3
            from botocore.config import Config

            self._client = boto3.client(
                "bedrock-runtime",
                region_name=os.environ.get("BEDROCK_REGION") or os.environ.get("AWS_REGION") or "ap-southeast-1",
                config=Config(
                    retries={"max_attempts": 3, "mode": "adaptive"},
                    connect_timeout=5,
                    read_timeout=45,
                ),
            )
        return self._client

    @staticmethod
    def model_for(task="extract", model=None):
        if model:
            return model
        specific = os.environ.get("LLM_MODEL_CLASSIFY" if task == "classify" else "LLM_MODEL_EXTRACT")
        return specific or os.environ.get("LLM_MODEL_ID") or DEFAULT_MODEL

    def _cache_key(self, model, system, prompt, max_tokens, temperature, images):
        h = hashlib.sha256()
        h.update(json.dumps([model, system, prompt, max_tokens, temperature]).encode())
        for data, fmt in images or []:
            h.update(fmt.encode())
            h.update(hashlib.sha256(data).digest())
        return h.hexdigest()

    def _converse(self, prompt, system, model, max_tokens, temperature, images):
        content = [{"image": {"format": fmt, "source": {"bytes": data}}} for data, fmt in (images or [])]
        content.append({"text": prompt})
        kwargs = {
            "modelId": model,
            "messages": [{"role": "user", "content": content}],
            "inferenceConfig": {"maxTokens": max_tokens, "temperature": temperature},
        }
        if system:
            kwargs["system"] = [{"text": system}]
        t0 = time.time()
        try:
            resp = self._bedrock().converse(**kwargs)
        except Exception as exc:  # mapped to LLMError below
            err = _map_error(exc)
            self._log(model, ok=False, ms=int((time.time() - t0) * 1000), error=err.kind)
            raise err
        blocks = resp.get("output", {}).get("message", {}).get("content", [])
        text = "".join(b["text"] for b in blocks if "text" in b)  # skips reasoning blocks
        usage = resp.get("usage", {})
        self._log(
            model,
            ok=True,
            ms=int((time.time() - t0) * 1000),
            in_tokens=usage.get("inputTokens"),
            out_tokens=usage.get("outputTokens"),
            stop=resp.get("stopReason"),
        )
        return text, resp.get("stopReason")

    @staticmethod
    def _log(model, **fields):
        # Never log prompt or document content, only metadata.
        log.info(json.dumps({"step": "llm_call", "model": model, **fields}))

    # ---- public --------------------------------------------------------
    def generate_text(self, prompt, *, system=None, task="extract", model=None, images=None,
                      max_tokens=1024, temperature=0.0):
        model = self.model_for(task, model)
        use_cache = os.environ.get("LLM_CACHE", "1") != "0"
        key = self._cache_key(model, system, prompt, max_tokens, temperature, images) if use_cache else None
        if key and key in self._cache:
            self._log(model, ok=True, cached=True)
            return self._cache[key]
        text, _ = self._converse(prompt, system, model, max_tokens, temperature, images)
        if key and len(self._cache) < _CACHE_MAX:
            self._cache[key] = text
        return text

    def generate_json(self, prompt, schema=None, *, system=None, task="extract", model=None, images=None,
                      max_tokens=1500, retries=1):
        import jsonschema

        model = self.model_for(task, model)
        full_prompt = prompt
        if schema is not None:
            full_prompt += "\n\nThe JSON must validate against this JSON Schema:\n" + json.dumps(schema)
        sys_prompt = (system + "\n\n" + JSON_SYSTEM) if system else JSON_SYSTEM

        # Cache only validated results, keyed on the full request (incl. schema).
        use_cache = os.environ.get("LLM_CACHE", "1") != "0"
        key = "json:" + self._cache_key(model, sys_prompt, full_prompt, max_tokens, 0.0, images) if use_cache else None
        if key and key in self._cache:
            self._log(model, ok=True, cached=True)
            return json.loads(self._cache[key])

        last_err, stop = None, None
        for attempt in range(retries + 1):
            p = full_prompt if attempt == 0 else (
                full_prompt + f"\n\nYour previous reply was rejected ({last_err}). "
                "Reply again with ONLY valid JSON."
            )
            text, stop = self._converse(p, sys_prompt, model, max_tokens, 0.0, images)
            try:
                data = _extract_json(text)
            except ValueError as e:
                last_err = f"{e}; stopReason={stop}"
                self._log(model, ok=False, error="invalid_json", attempt=attempt)
                continue
            if schema is not None:
                try:
                    jsonschema.validate(data, schema)
                except jsonschema.ValidationError as e:
                    last_err = f"schema violation at {list(e.absolute_path)}: {e.message}"
                    self._log(model, ok=False, error="schema", attempt=attempt)
                    continue
            if key and len(self._cache) < _CACHE_MAX:
                self._cache[key] = json.dumps(data)
            return data
        if stop == "max_tokens":
            raise LLMError("truncated", last_err)
        raise LLMError("schema" if "schema violation" in str(last_err) else "invalid_json", last_err)


_default = LLMClient()


def generate_json(prompt, schema=None, **kw):
    return _default.generate_json(prompt, schema, **kw)


def generate_text(prompt, **kw):
    return _default.generate_text(prompt, **kw)

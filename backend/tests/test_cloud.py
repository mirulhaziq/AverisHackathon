import json
import os
from pathlib import Path

import pytest
from botocore.exceptions import ClientError

from app.cloud import llm
from app.cloud.storage import NotFound, Storage

DATA = Path(os.environ.get("TEST_DATA_DIR", "data"))
needs_data = pytest.mark.skipif(not (DATA / "inbox").exists(), reason="no dataset at TEST_DATA_DIR/data")


# ---------- storage ----------
@needs_data
def test_local_lists_all_emails():
    st = Storage(bucket="", data_dir=DATA)
    assert st.mode == "local"
    assert len(st.emails()) == 520
    e = st.get("email_004")
    assert len(e["attachments"]) == 2
    assert "SI" in st.read_text(e["attachments"][0]) or "BL" in st.read_text(e["attachments"][0])


@needs_data
@pytest.mark.parametrize("bad", ["../x", "/etc/passwd", "attachments/../inbox/email_004.json", "secrets/x", "attachments\\x"])
def test_path_traversal_rejected(bad):
    st = Storage(bucket="", data_dir=DATA)
    with pytest.raises(NotFound):
        st.read_bytes(bad)


@needs_data
def test_bad_email_id_rejected():
    st = Storage(bucket="", data_dir=DATA)
    for bad in ["email_004/../x", "abc", "email_"]:
        with pytest.raises(NotFound):
            st.get(bad)


@needs_data
def test_s3_mode_matches_local():
    from moto import mock_aws
    import boto3

    with mock_aws():
        s3 = boto3.client("s3", region_name="ap-southeast-1")
        s3.create_bucket(Bucket="sdoc-test-bucket", CreateBucketConfiguration={"LocationConstraint": "ap-southeast-1"})
        for sub in ("inbox", "attachments"):
            for p in (DATA / sub).iterdir():
                s3.put_object(Bucket="sdoc-test-bucket", Key=f"{sub}/{p.name}", Body=p.read_bytes())
        st = Storage(bucket="sdoc-test-bucket", s3_client=s3)
        loc = Storage(bucket="", data_dir=DATA)
        assert st.mode == "s3"
        assert st.emails() == loc.emails()
        a = loc.get("email_004")["attachments"][0]
        assert st.read_bytes(a) == loc.read_bytes(a)
        with pytest.raises(NotFound):
            st.get("email_999")
        with pytest.raises(NotFound):
            st.read_bytes("attachments/does_not_exist.txt")


# ---------- llm ----------
class FakeBedrock:
    def __init__(self, replies):
        self.replies, self.calls = list(replies), []

    def converse(self, **kw):
        self.calls.append(kw)
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return {
            "output": {"message": {"content": [{"reasoningContent": {"x": 1}}, {"text": r}]}},
            "usage": {"inputTokens": 10, "outputTokens": 5},
            "stopReason": "end_turn",
        }


def client(*replies):
    return llm.LLMClient(client=FakeBedrock(replies))


def test_plain_json():
    assert client('{"ok": true}').generate_json("x") == {"ok": True}


def test_fenced_json():
    assert client('```json\n{"ok": true}\n```').generate_json("x") == {"ok": True}


def test_json_with_prose():
    assert client('Sure! Here it is: {"a": [1, 2]} hope that helps').generate_json("x") == {"a": [1, 2]}


def test_reasoning_blocks_ignored():
    c = client('{"a": 1}')
    assert c.generate_json("x") == {"a": 1}


def test_retry_on_invalid_json_then_ok():
    c = client("not json at all", '{"ok": true}')
    assert c.generate_json("x") == {"ok": True}
    assert len(c._client.calls) == 2
    assert "rejected" in c._client.calls[1]["messages"][0]["content"][-1]["text"]


def test_invalid_twice_raises():
    with pytest.raises(llm.LLMError) as e:
        client("nope", "still nope").generate_json("x")
    assert e.value.kind == "invalid_json"


SCHEMA = {"type": "object", "properties": {"n": {"type": "integer"}}, "required": ["n"]}


def test_schema_violation_retries_then_ok():
    c = client('{"n": "three"}', '{"n": 3}')
    assert c.generate_json("x", SCHEMA) == {"n": 3}


def test_schema_violation_twice_raises():
    with pytest.raises(llm.LLMError) as e:
        client('{"n": "a"}', '{"n": "b"}').generate_json("x", SCHEMA)
    assert e.value.kind == "schema"


def test_schema_is_in_prompt():
    c = client('{"n": 1}')
    c.generate_json("x", SCHEMA)
    assert '"required"' in c._client.calls[0]["messages"][0]["content"][-1]["text"]


def test_cache_avoids_second_call(monkeypatch):
    monkeypatch.delenv("LLM_CACHE", raising=False)
    c = client('{"n": 1}')
    assert c.generate_json("same", SCHEMA) == {"n": 1}
    assert c.generate_json("same", SCHEMA) == {"n": 1}
    assert len(c._client.calls) == 1


def test_cache_can_be_disabled(monkeypatch):
    monkeypatch.setenv("LLM_CACHE", "0")
    c = client('{"n": 1}', '{"n": 1}')
    c.generate_json("same", SCHEMA)
    c.generate_json("same", SCHEMA)
    assert len(c._client.calls) == 2


def test_invalid_reply_is_not_cached(monkeypatch):
    monkeypatch.delenv("LLM_CACHE", raising=False)
    c = client("garbage", "garbage", '{"n": 2}')
    with pytest.raises(llm.LLMError):
        c.generate_json("p", SCHEMA)
    assert c.generate_json("p", SCHEMA) == {"n": 2}


def _cerr(code):
    return ClientError({"Error": {"Code": code, "Message": "m"}}, "Converse")


@pytest.mark.parametrize("code,kind,retryable", [
    ("ThrottlingException", "throttled", True),
    ("AccessDeniedException", "access_denied", False),
    ("ValidationException", "validation", False),
    ("ModelTimeoutException", "service", True),
])
def test_error_mapping(code, kind, retryable):
    with pytest.raises(llm.LLMError) as e:
        client(_cerr(code)).generate_text("x")
    assert e.value.kind == kind and e.value.retryable is retryable


def test_images_sent_as_image_blocks():
    c = client('{"a": 1}')
    c.generate_json("x", images=[(b"\x89PNG", "png")])
    content = c._client.calls[0]["messages"][0]["content"]
    assert content[0]["image"]["format"] == "png" and "text" in content[-1]


def test_model_selection(monkeypatch):
    for k in ("LLM_MODEL_CLASSIFY", "LLM_MODEL_EXTRACT", "LLM_MODEL_ID"):
        monkeypatch.delenv(k, raising=False)
    assert llm.LLMClient.model_for("classify") == llm.DEFAULT_MODEL
    monkeypatch.setenv("LLM_MODEL_ID", "fallback")
    assert llm.LLMClient.model_for("extract") == "fallback"
    monkeypatch.setenv("LLM_MODEL_CLASSIFY", "cls")
    assert llm.LLMClient.model_for("classify") == "cls"
    assert llm.LLMClient.model_for("extract") == "fallback"


# ---------- API ----------
@needs_data
def test_api(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main
    from app.cloud import storage

    monkeypatch.setenv("DATA_DIR", str(DATA))
    monkeypatch.delenv("S3_BUCKET", raising=False)
    storage.get_storage.cache_clear()
    c = TestClient(main.app)
    assert c.get("/health").json()["storage"] == "local"
    assert c.get("/emails").json()["count"] == 520
    assert c.get("/emails/email_004").status_code == 200
    assert c.get("/emails/email_9999").status_code == 404
    assert c.get("/emails/..%2Fx").status_code in (404, 422)

    # paid endpoint fails closed
    monkeypatch.delenv("DEMO_TOKEN", raising=False)
    assert c.post("/llm/ping").status_code == 503
    monkeypatch.setenv("DEMO_TOKEN", "secret")
    assert c.post("/llm/ping").status_code == 401
    assert c.post("/llm/ping", headers={"X-Demo-Token": "wrong"}).status_code == 401


def test_attachment_endpoints(monkeypatch, tmp_path):
    """Serves an attachment's file and extracted text by position, never by a client-supplied path."""
    import json
    from fastapi.testclient import TestClient
    from app import main
    from app.cloud import storage

    (tmp_path / "inbox").mkdir()
    (tmp_path / "attachments").mkdir()
    (tmp_path / "inbox" / "email_900.json").write_text(json.dumps({
        "email_id": "email_900", "from": "a@b.c", "subject": "SI/BL", "body": "",
        "attachments": ["attachments/email_900_SI.txt", "attachments/email_900_BL.txt"],
    }))
    (tmp_path / "attachments" / "email_900_SI.txt").write_bytes(b"BILL OF LADING\nShipper: ACME")
    (tmp_path / "attachments" / "email_900_BL.txt").write_bytes(b"SHIPPING INSTRUCTION\nShipper: ACME")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.delenv("S3_BUCKET", raising=False)
    storage.get_storage.cache_clear()
    c = TestClient(main.app)

    r = c.get("/emails/email_900/attachments/0")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/plain")
    assert r.headers["content-disposition"] == 'inline; filename="email_900_SI.txt"'
    assert r.content == b"BILL OF LADING\nShipper: ACME"

    t = c.get("/emails/email_900/attachments/0/text").json()
    assert t["filename"] == "email_900_SI.txt"
    assert t["role"] == "BL"          # role comes from the content, not the misleading filename
    assert "Shipper: ACME" in t["text"]
    assert c.get("/emails/email_900/attachments/1/text").json()["role"] == "SI"

    assert c.get("/emails/email_900/attachments/2").status_code == 404
    assert c.get("/emails/email_900/attachments/-1").status_code == 404
    assert c.get("/emails/email_999/attachments/0").status_code == 404
    assert c.get("/emails/..%2Fsecret/attachments/0").status_code == 404
    storage.get_storage.cache_clear()

import os
from pathlib import Path

import pytest

from app.cloud import llm
from app.cloud.storage import Storage
from app.pipeline import classify
from app.pipeline.compare import compare_field, compare_fields, has_uncertain_field
from app.pipeline.documents import Document, read_attachment
from app.pipeline.fields import extract_fields, match_field
from app.pipeline.normalize import normalize, normalize_container_count, normalize_party, normalize_port, normalize_weight_kg
from app.pipeline.run import process_email

DATA = Path(os.environ.get("TEST_DATA_DIR", "data"))
needs_data = pytest.mark.skipif(not (DATA / "inbox").exists(), reason="no dataset at TEST_DATA_DIR/data")


class FakeStorage:
    def __init__(self, files):
        self.files = files

    def read_bytes(self, path):
        if path not in self.files:
            raise FileNotFoundError(path)
        return self.files[path]


# ---------- normalize ----------
def test_party_case_and_suffix_punctuation():
    assert normalize_party("Sdn. Bhd.") == normalize_party("Sdn Bhd")
    assert normalize_party("ACME Paper & Co Ltd") == normalize_party("ACME PAPER AND CO LTD")


def test_port_strips_prefix_and_country():
    # normalize_port receives the VALUE only - label_values() already split off the label at the colon.
    assert normalize_port("Shanghai, China") == normalize_port("SHANGHAI") == "SHANGHAI"
    assert normalize_port("Port of Shanghai") == "SHANGHAI"  # value itself repeats "Port of"


def test_container_count_takes_first_integer():
    assert normalize_container_count("3 containers") == "3"
    assert normalize_container_count("03") == "3"
    assert normalize_container_count("no number here") is None


@pytest.mark.parametrize("value,kg", [
    ("22000", "22000"), ("22000 KG", "22000"), ("22 MT", "22000"), ("22 tonnes", "22000"),
    ("22,000.00 kg", "22000"), ("100 lb", "45.36"),
])
def test_weight_conversion(value, kg):
    assert normalize_weight_kg(value) == kg


def test_weight_ambiguous_unit_is_none_not_a_guess():
    assert normalize_weight_kg("22 tons") is None


def test_normalize_dispatches_by_field():
    assert normalize("shipper", "Sdn. Bhd.") == normalize_party("Sdn. Bhd.")
    assert normalize("gross_weight_kg", None) is None


# ---------- fields ----------
@pytest.mark.parametrize("label,field", [
    ("SHIPPER", "shipper"), ("CONSIGNEE", "consignee"), ("NOTIFY PARTY", "notify_party"),
    ("PORT OF LOADING", "port_of_loading"), ("POL", "port_of_loading"),
    ("PORT OF DISCHARGE", "port_of_discharge"), ("POD", "port_of_discharge"),
    ("TOTAL CONTAINERS", "container_count"), ("GROSS WEIGHT", "gross_weight_kg"),
])
def test_exact_label_matches(label, field):
    assert match_field(label) == field


def test_keyword_fallback_for_unlisted_labels():
    assert match_field("SHIPPER NAME") == "shipper"
    assert match_field("GROSS WEIGHT KGS") == "gross_weight_kg"
    assert match_field("NET WEIGHT") is None  # not gross - must not be misread as the compared field


def test_extract_fields_first_match_wins():
    doc = Document("p", "text", text="Shipper: FIRST CO\nShipper: SECOND CO\n")
    assert extract_fields(doc)["shipper"]["value"] == "FIRST CO"


def test_extract_fields_skips_blank_values():
    doc = Document("p", "text", text="Shipper: \nConsignee: GLOBAL CO\n")
    fields = extract_fields(doc)
    assert "shipper" not in fields
    assert fields["consignee"]["value"] == "GLOBAL CO"


# ---------- compare ----------
def test_compare_field_match_after_normalization():
    si = {"value": "Sdn. Bhd.", "snippet": "x"}
    bl = {"value": "Sdn Bhd", "snippet": "y"}
    assert compare_field("shipper", si, bl)["match"] is True


def test_compare_field_mismatch():
    si = {"value": "3", "snippet": "x"}
    bl = {"value": "4", "snippet": "y"}
    assert compare_field("container_count", si, bl)["match"] is False


def test_compare_field_missing_is_uncertain_not_mismatch():
    si = {"value": "22000", "snippet": "x"}
    assert compare_field("gross_weight_kg", si, None)["match"] is None


def test_compare_fields_and_uncertainty():
    si = {"shipper": {"value": "ACME", "snippet": "x"}}
    bl = {"shipper": {"value": "ACME", "snippet": "y"}}
    comparisons, defects = compare_fields(si, bl)
    assert defects == []
    assert has_uncertain_field(comparisons)  # the other 6 fields are missing on both sides


# ---------- classify (mocked LLM, no real Bedrock call) ----------
class FakeBedrock:
    def __init__(self, reply):
        self.reply = reply

    def converse(self, **kw):
        return {"output": {"message": {"content": [{"text": self.reply}]}},
                "usage": {"inputTokens": 1, "outputTokens": 1}, "stopReason": "end_turn"}


def test_classify_email_parses_llm_json(monkeypatch):
    fake = llm.LLMClient(client=FakeBedrock('{"category": "SPAM", "confidence": 0.9, "reason": "looks like spam"}'))
    monkeypatch.setattr(llm, "_default", fake)
    result = classify.classify_email({"email_id": "e1", "subject": "x", "from": "y", "body": "z", "attachments": []})
    assert result == {"category": "SPAM", "confidence": 0.9, "reason": "looks like spam"}


# ---------- run (orchestration) ----------
# Role assignment and the corpus-wide extraction spread are now covered far
# more thoroughly by test_extract_rules.py (ported from the real-dataset
# selftest in feature/llm-extraction-fallback) - including the exact
# wrong_doc_type regression this file used to test standalone.

def test_process_email_non_comparison_category_short_circuits(monkeypatch):
    monkeypatch.setattr("app.pipeline.run.classify_email",
                        lambda email: {"category": "GENERAL", "confidence": 0.95, "reason": "general update"})
    record = process_email(storage=None, email={"email_id": "email_001", "attachments": []})
    assert record["status"] == "OK" and record["has_defect"] is False and record["review_reason"] is None


def test_process_email_missing_attachment(monkeypatch):
    """Even with one real attachment present (read successfully), fewer than
    two is still missing_attachment - case_review_reasons decides this after
    reading whatever is there, not before, so the evidence isn't wasted."""
    monkeypatch.setattr("app.pipeline.run.classify_email",
                        lambda email: {"category": "BL_COMPARISON", "confidence": 0.9, "reason": "asks to compare"})
    fake_storage = FakeStorage({"attachments/e_SI.txt": b"Shipping Instruction\nShipper: ACME LTD\n"})
    record = process_email(storage=fake_storage, email={"email_id": "email_002", "attachments": ["attachments/e_SI.txt"]})
    assert record["status"] == "NEEDS_REVIEW" and record["review_reason"] == "missing_attachment"


# ---------- full HTTP route, real dataset, mocked Bedrock + DynamoDB ----------
@needs_data
def test_process_endpoint_end_to_end(monkeypatch):
    from moto import mock_aws
    import boto3
    from fastapi.testclient import TestClient
    from app import main
    from app.cloud import db as dbm, storage as storagem

    monkeypatch.setenv("DATA_DIR", str(DATA))
    monkeypatch.delenv("S3_BUCKET", raising=False)
    monkeypatch.setenv("DEMO_TOKEN", "secret")
    monkeypatch.setenv("DDB_RESULTS_TABLE", "sdoc-results-test")
    storagem.get_storage.cache_clear()
    dbm.get_db.cache_clear()

    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="ap-southeast-1")
        ddb.create_table(
            TableName="sdoc-results-test",
            KeySchema=[{"AttributeName": "email_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "email_id", "AttributeType": "S"},
                                  {"AttributeName": "queue", "AttributeType": "S"},
                                  {"AttributeName": "updated_at", "AttributeType": "S"}],
            GlobalSecondaryIndexes=[{
                "IndexName": "by_queue",
                "KeySchema": [{"AttributeName": "queue", "KeyType": "HASH"},
                             {"AttributeName": "updated_at", "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"},
                "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
            }],
            BillingMode="PROVISIONED",
            ProvisionedThroughput={"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
        )

        # email_004 is a real BL_COMPARISON case with an SI+BL pair on disk.
        fake = llm.LLMClient(client=FakeBedrock(
            '{"category": "BL_COMPARISON", "confidence": 0.95, "reason": "asks to check SI vs draft BL"}'
        ))
        monkeypatch.setattr(llm, "_default", fake)

        c = TestClient(main.app)
        headers = {"X-Demo-Token": "secret"}
        r = c.post("/process/email_004", headers=headers)
        assert r.status_code == 200, r.text
        record = r.json()
        assert record["category"] == "BL_COMPARISON"
        assert record["status"] in ("OK", "MISMATCH", "NEEDS_REVIEW")
        assert len(record["comparisons"]) == 7

        # it was actually stored, not just returned
        stored = c.get("/results/email_004").json()
        assert stored["status"] == record["status"]

        # no demo token header -> refused before it ever reaches the pipeline
        assert c.post("/process/email_004").status_code == 401


@needs_data
def test_case_level_review_can_be_acknowledged(monkeypatch):
    """email_501 is a real wrong_doc_type case: no field to decide on, so
    /resolve doesn't apply. /acknowledge takes it out of the queue without
    changing the verdict (which is already correct - it should stay
    NEEDS_REVIEW to match the ground truth)."""
    from moto import mock_aws
    import boto3
    from fastapi.testclient import TestClient
    from app import main
    from app.cloud import db as dbm, storage as storagem

    monkeypatch.setenv("DATA_DIR", str(DATA))
    monkeypatch.delenv("S3_BUCKET", raising=False)
    monkeypatch.setenv("DEMO_TOKEN", "secret")
    monkeypatch.setenv("DDB_RESULTS_TABLE", "sdoc-ack-test")
    storagem.get_storage.cache_clear()
    dbm.get_db.cache_clear()

    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="ap-southeast-1")
        ddb.create_table(
            TableName="sdoc-ack-test",
            KeySchema=[{"AttributeName": "email_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "email_id", "AttributeType": "S"},
                                  {"AttributeName": "queue", "AttributeType": "S"},
                                  {"AttributeName": "updated_at", "AttributeType": "S"}],
            GlobalSecondaryIndexes=[{
                "IndexName": "by_queue",
                "KeySchema": [{"AttributeName": "queue", "KeyType": "HASH"},
                             {"AttributeName": "updated_at", "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"},
                "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
            }],
            BillingMode="PROVISIONED",
            ProvisionedThroughput={"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
        )

        fake = llm.LLMClient(client=FakeBedrock(
            '{"category": "BL_COMPARISON", "confidence": 0.95, "reason": "confirm the BL"}'
        ))
        monkeypatch.setattr(llm, "_default", fake)

        c = TestClient(main.app)
        headers = {"X-Demo-Token": "secret"}
        r = c.post("/process/email_501", headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "NEEDS_REVIEW"
        assert r.json()["review_reason"] == "wrong_doc_type"

        assert any(item["email_id"] == "email_501" for item in c.get("/review").json()["items"])

        # no field decisions exist for this case - /resolve has nothing to apply
        assert c.post("/review/email_501/resolve", json={"decisions": []}, headers=headers).status_code == 422

        ack = c.post("/review/email_501/acknowledge",
                     json={"reviewer": "reviewer-1", "note": "confirmed: second attachment is an invoice"},
                     headers=headers)
        assert ack.status_code == 200, ack.text
        acked = ack.json()
        assert acked["status"] == "NEEDS_REVIEW"          # the verdict is unchanged...
        assert acked["review_reason"] == "wrong_doc_type"

        # ...but it left the review queue
        assert not any(item["email_id"] == "email_501" for item in c.get("/review").json()["items"])
        assert acked["resolutions"][-1]["reviewer"] == "reviewer-1"

        # acknowledging a case that's not (or no longer) in the queue is refused
        assert c.post("/review/email_501/acknowledge", json={"reviewer": "x"}, headers=headers).status_code == 409


@needs_data
def test_export_endpoint_matches_the_submission_shape(monkeypatch):
    """FR-EVL-01: /export must be built from the same fields as /results, not
    reconstructed from whatever the UI happens to have - has_defect and
    review_reason don't round-trip cleanly through the UI's display model."""
    from moto import mock_aws
    import boto3
    from fastapi.testclient import TestClient
    from app import main
    from app.cloud import db as dbm, storage as storagem

    monkeypatch.setenv("DATA_DIR", str(DATA))
    monkeypatch.delenv("S3_BUCKET", raising=False)
    monkeypatch.setenv("DEMO_TOKEN", "secret")
    monkeypatch.setenv("DDB_RESULTS_TABLE", "sdoc-export-test")
    storagem.get_storage.cache_clear()
    dbm.get_db.cache_clear()

    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="ap-southeast-1")
        ddb.create_table(
            TableName="sdoc-export-test",
            KeySchema=[{"AttributeName": "email_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "email_id", "AttributeType": "S"},
                                  {"AttributeName": "queue", "AttributeType": "S"},
                                  {"AttributeName": "updated_at", "AttributeType": "S"}],
            GlobalSecondaryIndexes=[{
                "IndexName": "by_queue",
                "KeySchema": [{"AttributeName": "queue", "KeyType": "HASH"},
                             {"AttributeName": "updated_at", "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"},
                "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
            }],
            BillingMode="PROVISIONED",
            ProvisionedThroughput={"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
        )

        fake = llm.LLMClient(client=FakeBedrock(
            '{"category": "BL_COMPARISON", "confidence": 0.95, "reason": "check SI vs BL"}'
        ))
        monkeypatch.setattr(llm, "_default", fake)

        c = TestClient(main.app)
        headers = {"X-Demo-Token": "secret"}
        assert c.post("/process/email_004", headers=headers).status_code == 200

        exp = c.get("/export").json()
        assert exp["count"] == 1
        assert exp["not_yet_processed"] == exp["total_emails"] - 1
        rec = exp["submission"]["email_004"]
        assert set(rec) == {"category", "status", "review_reason", "has_defect", "defect_fields"}
        assert rec["category"] == "BL_COMPARISON"
        assert rec["has_defect"] is True
        assert "consignee" in rec["defect_fields"]

        # matches /results/{id} exactly - same source, not a separate reconstruction
        full = c.get("/results/email_004").json()
        assert rec["status"] == full["status"] and rec["defect_fields"] == full["defect_fields"]


def test_rate_limiter_unit():
    """The limiter as a pure unit: trips at max_calls within the window,
    refuses with 429 + Retry-After, then recovers once the window slides -
    covers the logic without needing a live pipeline behind it."""
    from fastapi import HTTPException

    from app.main import RateLimiter

    limiter = RateLimiter(max_calls=3, window_s=60)
    for _ in range(3):
        limiter.check()  # does not raise

    with pytest.raises(HTTPException) as exc:
        limiter.check()
    assert exc.value.status_code == 429
    assert "Retry-After" in exc.value.headers

    # the window slides: the oldest call ages out, freeing one slot
    limiter.calls[0] -= 61
    limiter.check()  # does not raise


@needs_data
def test_process_endpoint_is_rate_limited(monkeypatch):
    """The dependency is actually wired to the route: rate_limit_process()
    does a fresh module-global lookup of _process_limiter on every call, so
    swapping the module attribute is enough - no need to reach into
    FastAPI's route internals."""
    from moto import mock_aws
    import boto3
    from fastapi.testclient import TestClient
    from app import main
    from app.cloud import db as dbm, storage as storagem

    monkeypatch.setenv("DATA_DIR", str(DATA))
    monkeypatch.delenv("S3_BUCKET", raising=False)
    monkeypatch.setenv("DEMO_TOKEN", "secret")
    monkeypatch.setenv("DDB_RESULTS_TABLE", "sdoc-ratelimit-test")
    monkeypatch.setattr(main, "_process_limiter", main.RateLimiter(max_calls=2, window_s=60))
    storagem.get_storage.cache_clear()
    dbm.get_db.cache_clear()

    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="ap-southeast-1")
        ddb.create_table(
            TableName="sdoc-ratelimit-test",
            KeySchema=[{"AttributeName": "email_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "email_id", "AttributeType": "S"},
                                  {"AttributeName": "queue", "AttributeType": "S"},
                                  {"AttributeName": "updated_at", "AttributeType": "S"}],
            GlobalSecondaryIndexes=[{
                "IndexName": "by_queue",
                "KeySchema": [{"AttributeName": "queue", "KeyType": "HASH"},
                             {"AttributeName": "updated_at", "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"},
                "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
            }],
            BillingMode="PROVISIONED",
            ProvisionedThroughput={"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
        )
        fake = llm.LLMClient(client=FakeBedrock('{"category": "GENERAL", "confidence": 0.9, "reason": "update"}'))
        monkeypatch.setattr(llm, "_default", fake)

        c = TestClient(main.app)
        headers = {"X-Demo-Token": "secret"}
        assert c.post("/process/email_001", headers=headers).status_code == 200
        assert c.post("/process/email_002", headers=headers).status_code == 200
        blocked = c.post("/process/email_003", headers=headers)
        assert blocked.status_code == 429
        assert "Retry-After" in blocked.headers

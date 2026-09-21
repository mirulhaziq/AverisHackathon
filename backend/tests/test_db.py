import json

import boto3
import pytest
from moto import mock_aws

from app.cloud import db as dbm

TABLE_KW = dict(
    TableName="sdoc-results",
    BillingMode="PAY_PER_REQUEST",
    AttributeDefinitions=[
        {"AttributeName": "email_id", "AttributeType": "S"},
        {"AttributeName": "queue", "AttributeType": "S"},
        {"AttributeName": "updated_at", "AttributeType": "S"},
    ],
    KeySchema=[{"AttributeName": "email_id", "KeyType": "HASH"}],
    GlobalSecondaryIndexes=[{
        "IndexName": "by_queue",
        "KeySchema": [{"AttributeName": "queue", "KeyType": "HASH"}, {"AttributeName": "updated_at", "KeyType": "RANGE"}],
        "Projection": {"ProjectionType": "ALL"},
    }],
)


@pytest.fixture
def db(monkeypatch):
    with mock_aws():
        ddb = boto3.resource("dynamodb", region_name="ap-southeast-1")
        ddb.create_table(**TABLE_KW)
        yield dbm.ResultsDB(table=ddb.Table("sdoc-results"))


def rec(eid, status="OK", **kw):
    return {"email_id": eid, "category": "BL_COMPARISON", "status": status, "review_reason": kw.pop("review_reason", None),
            "has_defect": status == "MISMATCH", "defect_fields": kw.pop("defect_fields", []),
            "comparisons": [{"field": "consignee", "si_value": "A", "bl_value": "B", "match": False}], **kw}


def test_roundtrip_and_meta(db):
    db.put_result(rec("email_004", "MISMATCH", defect_fields=["consignee"]))
    r = db.get("email_004")
    assert r["status"] == "MISMATCH" and r["defect_fields"] == ["consignee"]
    assert r["meta"]["attempts"] == 1 and r["meta"]["proc_state"] == "done" and r["meta"].get("queue") is None
    assert r["comparisons"][0]["si_value"] == "A"


def test_needs_review_is_queued_and_sparse_index(db):
    db.put_result(rec("a", "OK"))
    db.put_result(rec("b", "NEEDS_REVIEW", review_reason="missing_value"))
    q = db.list_queue("review")
    assert [x["email_id"] for x in q] == ["b"] and q[0]["review_reason"] == "missing_value"
    assert db.list_queue("failed") == []


def test_reprocess_increments_attempts_and_clears_queue(db):
    db.put_result(rec("b", "NEEDS_REVIEW", review_reason="unreadable"))
    db.put_result(rec("b", "OK"))
    assert db.get("b")["meta"]["attempts"] == 2
    assert db.list_queue("review") == []


def test_failure_visible_and_recovers_on_success(db):
    db.mark_failed("f", "extract", "throttled", "slow down", True)
    db.mark_failed("f", "extract", "timeout", "again", True)
    q = db.list_queue("failed")
    assert len(q) == 1 and q[0]["attempts"] == 2
    assert q[0]["last_error"]["kind"] == "timeout" and q[0]["last_error"]["retryable"] is True
    db.put_result(rec("f", "OK"))
    assert db.list_queue("failed") == []
    assert db.get("f")["meta"]["attempts"] == 3


def test_resolve_removes_from_queue_and_keeps_audit_trail(db):
    db.put_result(rec("b", "NEEDS_REVIEW", review_reason="missing_value"))
    new = rec("b", "MISMATCH", defect_fields=["gross_weight_kg"])
    out = db.resolve("b", {"decisions": [{"field": "gross_weight_kg", "decision": "mismatch"}]}, "haziq", new)
    assert out["status"] == "MISMATCH" and out["meta"].get("queue") is None
    assert out["resolutions"][0]["reviewer"] == "haziq"
    assert db.list_queue("review") == []
    row = [r for r in db.list_results() if r["email_id"] == "b"][0]
    assert row["status"] == "MISMATCH" and row["review_reason"] is None and row["defect_fields"] == ["gross_weight_kg"]


def test_resolutions_survive_reprocessing(db):
    db.put_result(rec("b", "NEEDS_REVIEW", review_reason="missing_value"))
    db.resolve("b", {"x": 1}, "r1", rec("b", "OK"))
    db.put_result(rec("b", "NEEDS_REVIEW", review_reason="missing_value"))
    assert len(db.get("b")["resolutions"]) == 1


def test_resolve_unknown_raises(db):
    with pytest.raises(dbm.NotFound):
        db.resolve("nope", {}, "r", None)
    with pytest.raises(dbm.NotFound):
        db.get("nope")


def test_list_results_and_stats(db):
    db.put_result(rec("a", "OK"))
    db.put_result(rec("b", "MISMATCH", defect_fields=["consignee"]))
    db.put_result(rec("c", "NEEDS_REVIEW", review_reason="unreadable"))
    db.mark_failed("d", "extract", "throttled", "x")
    rows = db.list_results()
    assert [r["email_id"] for r in rows] == ["a", "b", "c", "d"]
    s = db.stats()
    assert s["processed"] == 4 and s["awaiting_review"] == 1 and s["failed"] == 1
    assert s["by_status"] == {"MISMATCH": 1, "NEEDS_REVIEW": 1, "OK": 1}


def test_not_configured():
    with pytest.raises(dbm.DBNotConfigured):
        dbm.ResultsDB(table_name="").table


# ---------- API layer ----------
@pytest.fixture
def client(db, monkeypatch):
    from fastapi.testclient import TestClient
    from app import main

    monkeypatch.setattr(dbm, "get_db", lambda: db)
    monkeypatch.setenv("DEMO_TOKEN", "tok")
    return TestClient(main.app)


H = {"X-Demo-Token": "tok"}


def test_api_seed_review_resolve_flow(client):
    assert client.post("/dev/seed").status_code == 401
    assert client.post("/dev/seed", headers=H).status_code == 200

    q = client.get("/review").json()
    assert q["count"] == 1 and q["items"][0]["email_id"] == "email_seed_002"
    assert client.get("/failures").json()["items"][0]["last_error"]["kind"] == "throttled"

    detail = client.get("/results/email_seed_002").json()
    assert detail["review"]["items"][0]["field"] == "gross_weight_kg"

    body = {"decisions": [{"field": "gross_weight_kg", "decision": "match", "corrected_bl": "22000"}], "reviewer": "haziq"}
    assert client.post("/review/email_seed_002/resolve", json=body).status_code == 401
    r = client.post("/review/email_seed_002/resolve", json=body, headers=H)
    assert r.status_code == 200 and r.json()["status"] == "OK" and r.json()["review_reason"] is None
    assert r.json()["comparisons"][0]["human_override"] is True and r.json()["comparisons"][0]["bl_value"] == "22000"
    assert client.get("/review").json()["count"] == 0
    # resolving again is refused
    assert client.post("/review/email_seed_002/resolve", json=body, headers=H).status_code == 409
    s = client.get("/stats").json()
    assert s["processed"] == 4 and s["failed"] == 1 and s["awaiting_review"] == 0


def test_api_resolve_can_create_mismatch(client):
    client.post("/dev/seed", headers=H)
    body = {"decisions": [{"field": "gross_weight_kg", "decision": "mismatch"}]}
    r = client.post("/review/email_seed_002/resolve", json=body, headers=H).json()
    assert r["status"] == "MISMATCH" and r["defect_fields"] == ["gross_weight_kg"] and r["has_defect"] is True


def test_api_validation(client):
    client.post("/dev/seed", headers=H)
    bad_field = {"decisions": [{"field": "vessel", "decision": "match"}]}
    assert client.post("/review/email_seed_002/resolve", json=bad_field, headers=H).status_code == 422
    assert client.post("/review/email_seed_002/resolve", json={"decisions": []}, headers=H).status_code == 422
    assert client.get("/results/does_not_exist").status_code == 404
    assert client.get("/results/bad id!").status_code in (404, 422)
    assert client.post("/review/nope/resolve", json={"decisions": [{"field": "shipper", "decision": "match"}]},
                       headers=H).status_code == 404


def test_api_503_when_table_not_configured(monkeypatch):
    from fastapi.testclient import TestClient
    from app import main

    monkeypatch.delenv("DDB_RESULTS_TABLE", raising=False)
    dbm.get_db.cache_clear()
    assert TestClient(main.app).get("/results").status_code == 503

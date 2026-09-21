import copy
import hmac
import os
import re
from typing import List, Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel, Field

from app.cloud import db as dbm
from app.cloud import llm
from app.cloud.storage import NotFound, get_storage

FIELDS = ["shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge",
          "container_count", "gross_weight_kg"]
_ID = re.compile(r"^[A-Za-z0-9_]{1,40}$")

app = FastAPI(title="SDOC Shipping Document Verification API", version="0.2.0")

# The API uses no cookies, so a wildcard origin is safe; tighten via ALLOWED_ORIGINS once the UI URL is fixed.
_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_origins, allow_methods=["*"], allow_headers=["*"])


def require_demo_token(x_demo_token: str = Header(default="")):
    """Guards endpoints that cost money (LLM calls). Fails closed if DEMO_TOKEN is not configured."""
    expected = os.environ.get("DEMO_TOKEN", "")
    if not expected:
        raise HTTPException(503, "DEMO_TOKEN not configured")
    if not hmac.compare_digest(x_demo_token, expected):
        raise HTTPException(401, "invalid or missing X-Demo-Token")


@app.get("/health")
def health():
    """Liveness + which build is running (proves deployed app == repo commit)."""
    return {
        "status": "ok",
        "commit": os.environ.get("GIT_SHA", "dev"),
        "region": os.environ.get("AWS_REGION", "local"),
        "storage": get_storage().mode,
    }


@app.get("/emails")
def list_emails():
    """All emails (id, from, subject, n_attachments) from S3 (or local data dir)."""
    items = get_storage().summary()
    return {"count": len(items), "emails": items}


@app.get("/emails/{email_id}")
def get_email(email_id: str):
    try:
        return get_storage().get(email_id)
    except NotFound:
        raise HTTPException(404, "email not found")


@app.post("/llm/ping", dependencies=[Depends(require_demo_token)])
def llm_ping():
    """Proves Bedrock works from the deployed app. Token-protected because it spends credits."""
    model = llm.LLMClient.model_for("classify")
    try:
        data = llm.generate_json('Return exactly this JSON: {"ok": true}', task="classify", max_tokens=50)
    except llm.LLMError as e:
        raise HTTPException(502, f"{e.kind}: {e}")
    return {"model": model, "reply": data}


@app.post("/process/{email_id}")
def process_email(email_id: str):
    """STUB. Returns a record in the submission shape from sample_submission.json."""
    return {
        "email_id": email_id,
        "category": "GENERAL",
        "status": None,
        "review_reason": None,
        "has_defect": False,
        "defect_fields": [],
        "note": "stub",
    }


def _db():
    try:
        return dbm.get_db()
    except dbm.DBNotConfigured:
        raise HTTPException(503, "DDB_RESULTS_TABLE not configured")


def _check_id(email_id):
    if not _ID.match(email_id):
        raise HTTPException(422, "invalid email id")


@app.get("/results")
def results():
    """Lightweight rows for every processed email (full record: /results/{id})."""
    rows = _db().list_results()
    return {"count": len(rows), "results": rows}


@app.get("/results/{email_id}")
def result(email_id: str):
    _check_id(email_id)
    try:
        return _db().get(email_id)
    except dbm.NotFound:
        raise HTTPException(404, "no result for this email")


@app.get("/review")
def review_queue():
    """Cases waiting for a human. Open /results/{id} for the evidence."""
    rows = _db().list_queue("review")
    return {"count": len(rows), "items": rows}


@app.get("/failures")
def failures():
    """Emails whose processing failed (with step, error kind, retryable flag)."""
    rows = _db().list_queue("failed")
    return {"count": len(rows), "items": rows}


@app.get("/stats")
def stats():
    return _db().stats()


class FieldDecision(BaseModel):
    field: Literal["shipper", "consignee", "notify_party", "port_of_loading", "port_of_discharge",
                   "container_count", "gross_weight_kg"]
    decision: Literal["match", "mismatch"]
    corrected_si: Optional[str] = None
    corrected_bl: Optional[str] = None


class Resolution(BaseModel):
    decisions: List[FieldDecision] = Field(min_length=1)
    note: Optional[str] = None
    reviewer: str = "reviewer"


def apply_resolution(record, res):
    """PLACEHOLDER report update after a human decision: a reviewer's per-field decision overrides the
    machine result and the case status is recomputed. The pipeline owner may replace this with the
    real compare logic; the DB layer only stores whatever record it is given."""
    new = copy.deepcopy(record)
    defects = set(new.get("defect_fields") or [])
    for d in res.decisions:
        (defects.discard if d.decision == "match" else defects.add)(d.field)
        for comp in new.get("comparisons", []):
            if comp.get("field") == d.field:
                comp["match"] = d.decision == "match"
                comp["human_override"] = True
                if d.corrected_si is not None:
                    comp["si_value"] = d.corrected_si
                if d.corrected_bl is not None:
                    comp["bl_value"] = d.corrected_bl
    new["defect_fields"] = sorted(defects, key=FIELDS.index)
    new["has_defect"] = bool(defects)
    new["status"] = "MISMATCH" if defects else "OK"
    new["review_reason"] = None
    return new


@app.post("/review/{email_id}/resolve", dependencies=[Depends(require_demo_token)])
def resolve(email_id: str, res: Resolution):
    _check_id(email_id)
    d = _db()
    try:
        current = d.get(email_id)
    except dbm.NotFound:
        raise HTTPException(404, "no result for this email")
    if current["meta"].get("queue") != "review":
        raise HTTPException(409, "this case is not waiting for review")
    record = {k: v for k, v in current.items() if k not in ("meta", "resolutions")}
    return d.resolve(email_id, res.model_dump(), res.reviewer, apply_resolution(record, res))


@app.post("/dev/seed", dependencies=[Depends(require_demo_token)])
def dev_seed():
    """Writes 4 clearly-marked synthetic cases so the UI can be built before the pipeline exists."""
    d = _db()
    cmp = lambda f, si, bl, m: {"field": f, "si_value": si, "bl_value": bl, "match": m,
                                "si_evidence": {"file": "SI", "snippet": f"{f}: {si}"},
                                "bl_evidence": {"file": "BL", "snippet": f"{f}: {bl}"}}
    steps = [{"step": "classify", "ok": True, "ms": 420}, {"step": "extract", "ok": True, "ms": 1900},
             {"step": "compare", "ok": True, "ms": 3}]
    d.put_result({"email_id": "email_seed_001", "category": "BL_COMPARISON", "status": "MISMATCH",
                  "review_reason": None, "has_defect": True, "defect_fields": ["consignee"],
                  "comparisons": [cmp("shipper", "ACME PAPER LTD", "ACME PAPER LTD", True),
                                  cmp("consignee", "GLOBAL PAPER CO LTD", "NORTHSTAR PAPER CO LTD", False),
                                  cmp("container_count", "3", "3", True)],
                  "steps": steps, "synthetic": True})
    d.put_result({"email_id": "email_seed_002", "category": "BL_COMPARISON", "status": "NEEDS_REVIEW",
                  "review_reason": "missing_value", "has_defect": False, "defect_fields": [],
                  "comparisons": [cmp("gross_weight_kg", "22000", None, False)],
                  "review": {"reason": "missing_value", "items": [
                      {"field": "gross_weight_kg", "extracted_si": "22000", "extracted_bl": None,
                       "source": "BL", "snippet": "GROSS WEIGHT: ______",
                       "why": "BL gross weight is blank"}]},
                  "steps": steps, "synthetic": True})
    d.put_result({"email_id": "email_seed_003", "category": "BL_COMPARISON", "status": "OK",
                  "review_reason": None, "has_defect": False, "defect_fields": [],
                  "comparisons": [cmp("shipper", "ACME PAPER LTD", "ACME PAPER LTD", True)],
                  "steps": steps, "synthetic": True})
    d.mark_failed("email_seed_004", "extract", "throttled", "Bedrock throttled the request (synthetic)", True)
    return {"seeded": ["email_seed_001", "email_seed_002", "email_seed_003", "email_seed_004"]}


# Lambda entry point (Function URL events are handled by Mangum)
handler = Mangum(app, lifespan="off")

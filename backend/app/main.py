import collections
import copy
import hmac
import os
import re
import time
from pathlib import PurePosixPath
from typing import List, Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from pydantic import BaseModel, Field

from app.cloud import db as dbm
from app.cloud import llm
from app.cloud.storage import NotFound, get_storage
from app.pipeline.documents import read_attachment
from app.pipeline.run import process_email as run_pipeline

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


class RateLimiter:
    """A sliding-window limit on the endpoints that spend Bedrock credits.

    Scoped to one warm Lambda container, not the whole account - a cold
    start or a second concurrent container gets its own budget. That is a
    real gap for a determined attacker spinning up many containers, but it
    stops the actual threat this exists for (one script or one curious judge
    hammering /process in a loop from a single warm connection), and a
    correct global limiter needs a shared store (DynamoDB) that isn't worth
    building for a hackathon demo - see docs/ROADMAP.md.
    """

    def __init__(self, max_calls: int, window_s: float):
        self.max_calls = max_calls
        self.window_s = window_s
        self.calls: collections.deque[float] = collections.deque()

    def check(self):
        now = time.monotonic()
        while self.calls and now - self.calls[0] > self.window_s:
            self.calls.popleft()
        if len(self.calls) >= self.max_calls:
            retry_after = int(self.window_s - (now - self.calls[0])) + 1
            raise HTTPException(429, f"Rate limit exceeded ({self.max_calls} calls per {int(self.window_s)}s). "
                                     f"Retry in about {retry_after}s.",
                                headers={"Retry-After": str(retry_after)})
        self.calls.append(now)


# Separate budgets: a slow trickle of single-email calls should not starve
# the batch endpoint, and vice versa.
_process_limiter = RateLimiter(max_calls=int(os.environ.get("RATE_LIMIT_PROCESS", "20")), window_s=60)
_process_all_limiter = RateLimiter(max_calls=int(os.environ.get("RATE_LIMIT_PROCESS_ALL", "6")), window_s=60)


def rate_limit_process():
    _process_limiter.check()


def rate_limit_process_all():
    _process_all_limiter.check()


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


_MEDIA_TYPES = {
    ".pdf": "application/pdf",
    ".txt": "text/plain; charset=utf-8",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def _attachment_path(email_id: str, index: int) -> str:
    """Attachments are addressed by position in the email, never by a client-supplied path."""
    try:
        attachments = get_storage().get(email_id).get("attachments", [])
    except NotFound:
        raise HTTPException(404, "email not found")
    if not 0 <= index < len(attachments):
        raise HTTPException(404, "attachment not found")
    return attachments[index]


@app.get("/emails/{email_id}/attachments/{index}")
def get_attachment_file(email_id: str, index: int):
    """The original file, served inline so a browser can show a PDF in place."""
    path = _attachment_path(email_id, index)
    try:
        raw = get_storage().read_bytes(path)
    except NotFound:
        raise HTTPException(404, "attachment not found")
    name = PurePosixPath(path).name
    return Response(
        raw,
        media_type=_MEDIA_TYPES.get(PurePosixPath(path).suffix.lower(), "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="{name}"', "Cache-Control": "private, max-age=300"},
    )


@app.get("/emails/{email_id}/attachments/{index}/text")
def get_attachment_text(email_id: str, index: int):
    """The text the pipeline read from the file, plus the SI/BL role it assigned from the content -
    what the UI shows so a reviewer sees exactly what the comparison was based on."""
    path = _attachment_path(email_id, index)
    doc = read_attachment(get_storage(), path, page_images=False)  # the viewer shows the original PDF instead
    return {
        "path": path,
        "filename": PurePosixPath(path).name,
        "method": doc.method,
        "role": doc.role if not doc.unreadable else None,
        "text": doc.text,
        "unreadable": doc.unreadable,
    }


@app.post("/llm/ping", dependencies=[Depends(require_demo_token)])
def llm_ping():
    """Proves Bedrock works from the deployed app. Token-protected because it spends credits."""
    model = llm.LLMClient.model_for("classify")
    try:
        data = llm.generate_json('Return exactly this JSON: {"ok": true}', task="classify", max_tokens=50)
    except llm.LLMError as e:
        raise HTTPException(502, f"{e.kind}: {e}")
    return {"model": model, "reply": data}


@app.post("/process/{email_id}", dependencies=[Depends(require_demo_token), Depends(rate_limit_process)])
def process_email(email_id: str):
    """Runs classify -> extract -> compare for one email and stores the result.
    Token-protected: this is the endpoint that spends Bedrock credits."""
    _check_id(email_id)
    storage = get_storage()
    try:
        email = storage.get(email_id)
    except NotFound:
        raise HTTPException(404, "email not found")
    try:
        record = run_pipeline(storage, email)
    except llm.LLMError as e:
        _db().mark_failed(email_id, "classify_or_extract", e.kind, str(e), e.retryable)
        raise HTTPException(502, f"{e.kind}: {e}")
    _db().put_result(record)
    return record


@app.post("/process-all", dependencies=[Depends(require_demo_token), Depends(rate_limit_process_all)])
def process_all(limit: int = 20, retry_failed: bool = False):
    """Processes up to `limit` not-yet-processed emails and returns. Call it
    repeatedly until remaining == 0 - each email is written to DynamoDB as
    soon as it finishes, so a dropped connection or a Lambda timeout loses no
    completed work and a retry just continues where it stopped."""
    storage = get_storage()
    d = _db()
    done_ids = {r["email_id"] for r in d.list_results()
                if r.get("proc_state") == "done" or (r.get("proc_state") == "failed" and not retry_failed)}
    pending = [e for e in storage.emails() if e["email_id"] not in done_ids][:max(1, min(limit, 100))]

    processed, failed = [], []
    for email in pending:
        try:
            record = run_pipeline(storage, email)
            d.put_result(record)
            processed.append(email["email_id"])
        except llm.LLMError as e:
            d.mark_failed(email["email_id"], "classify_or_extract", e.kind, str(e), e.retryable)
            failed.append({"email_id": email["email_id"], "kind": e.kind})
        except Exception as e:  # a bug in the pipeline must not stop the batch (FR-ERR-04)
            d.mark_failed(email["email_id"], "pipeline", "unknown", str(e), False)
            failed.append({"email_id": email["email_id"], "kind": "unknown"})

    total = len(storage.emails())
    remaining = total - len({r["email_id"] for r in d.list_results() if r.get("proc_state") == "done"})
    return {"processed": len(processed), "failed": failed, "remaining": max(remaining, 0), "total": total}


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


@app.get("/export")
def export():
    """FR-EVL-01: one JSON object keyed by email_id, in exactly the shape
    score_cli.py / the server's /submit accept - built server-side from the
    same rows /results returns, not reconstructed from whatever the UI
    happens to have loaded (has_defect and review_reason don't round-trip
    cleanly through the UI's display model). Emails with no result yet are
    reported separately so a real gap is visible instead of silently
    producing an incomplete file."""
    rows = _db().list_results()
    total = len(get_storage().summary())
    submission = {
        r["email_id"]: {
            "category": r["category"],
            "status": r["status"],
            "review_reason": r["review_reason"],
            "has_defect": r["has_defect"],
            "defect_fields": r["defect_fields"],
        }
        for r in rows
        if r.get("proc_state") == "done"
    }
    return {
        "submission": submission,
        "count": len(submission),
        "total_emails": total,
        "not_yet_processed": max(total - len(submission), 0),
        "awaiting_review": sum(1 for r in rows if r.get("queue") == "review"),
    }


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


class Acknowledgement(BaseModel):
    note: Optional[str] = None
    reviewer: str = "reviewer"


@app.post("/review/{email_id}/acknowledge", dependencies=[Depends(require_demo_token)])
def acknowledge(email_id: str, ack: Acknowledgement):
    """For a case-level review (wrong_doc_type / missing_attachment / unreadable) - there is no field
    to decide on, so there is nothing for /resolve to apply. The result itself (still NEEDS_REVIEW) is
    the correct answer and is left unchanged; this only records that a person looked at it and takes
    it out of the queue, the same way /resolve does for a field-level review."""
    _check_id(email_id)
    d = _db()
    try:
        current = d.get(email_id)
    except dbm.NotFound:
        raise HTTPException(404, "no result for this email")
    if current["meta"].get("queue") != "review":
        raise HTTPException(409, "this case is not waiting for review")
    record = {k: v for k, v in current.items() if k not in ("meta", "resolutions")}
    return d.resolve(email_id, {"acknowledged": True, "note": ack.note}, ack.reviewer, record)


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

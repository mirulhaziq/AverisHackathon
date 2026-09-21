import hmac
import os

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum

from app.cloud import llm
from app.cloud.storage import NotFound, get_storage

app = FastAPI(title="SDOC Shipping Document Verification API", version="0.1.0")

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


@app.get("/results")
def results():
    """STUB. Later: read per-email results from DynamoDB."""
    return {"results": {}, "note": "stub"}


# Lambda entry point (Function URL events are handled by Mangum)
handler = Mangum(app, lifespan="off")

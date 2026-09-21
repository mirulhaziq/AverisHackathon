import os

from fastapi import FastAPI
from mangum import Mangum

app = FastAPI(title="SDOC Shipping Document Verification API", version="0.0.1")


@app.get("/health")
def health():
    """Liveness + which build is running (proves deployed app == repo commit)."""
    return {
        "status": "ok",
        "commit": os.environ.get("GIT_SHA", "dev"),
        "region": os.environ.get("AWS_REGION", "local"),
    }


@app.get("/emails")
def list_emails():
    """STUB. Later: read inbox from S3."""
    return {"emails": [], "note": "stub"}


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
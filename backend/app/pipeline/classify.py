"""Email classification: one of 5 categories, using body + attachments together
(FR-CLS-02 — never trust the subject alone). One Bedrock call per email, through
the shared LLM client so retries/caching/logging are free.

    from app.pipeline.classify import classify_email
    result = classify_email(email)   # {"category": ..., "confidence": ..., "reason": ...}

Owner: pipeline (P2/P3).
"""
from app.cloud import llm

CATEGORIES = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]

SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "enum": CATEGORIES},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "reason": {"type": "string"},
    },
    "required": ["category", "confidence", "reason"],
}

PROMPT = """You classify one email from a shipping operations inbox into exactly one category.

Categories:
- BL_COMPARISON: asks the team to check/compare a Shipping Instruction (SI) against a draft \
Bill of Lading (BL), or attaches both an SI and a BL for review.
- SI_REQUEST: asks the team to prepare or send new shipping instructions (no comparison).
- INVOICE_QUERY: asks a question about an invoice, charges, or payment.
- GENERAL: operational updates, confirmations, scheduling, or other business messages.
- SPAM: unwanted, irrelevant, or unsolicited messages.

The subject line is a HINT ONLY, not proof — do not decide from it alone. Weigh the body \
text and the attachment file names together. An email whose subject looks like a comparison \
request but has no SI/BL-shaped attachments is probably not BL_COMPARISON.

Email:
<subject>{subject}</subject>
<sender>{sender}</sender>
<attachments>{attachments}</attachments>
<body>
{body}
</body>

Respond with a single JSON object: {{"category": ..., "confidence": <0..1>, "reason": "<one sentence>"}}.
"""


def classify_email(email: dict) -> dict:
    prompt = PROMPT.format(
        subject=email.get("subject") or "",
        sender=email.get("from") or "",
        attachments=", ".join(email.get("attachments") or []) or "(none)",
        body=(email.get("body") or "")[:4000],
    )
    return llm.generate_json(prompt, SCHEMA, task="classify", max_tokens=200)

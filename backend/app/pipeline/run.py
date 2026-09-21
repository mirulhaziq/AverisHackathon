"""Orchestrates one email end to end: classify -> (for BL_COMPARISON) read
attachments -> assign SI/BL roles from CONTENT -> extract fields -> compare ->
build the result record. This is the module `/process/{email_id}` calls; it
raises llm.LLMError on any LLM failure so the caller can route it to the
failure queue (db.mark_failed) instead of guessing a result (FR-ERR-01, BR-04).

    from app.pipeline.run import process_email
    record = process_email(storage, email)

Owner: pipeline (P2/P3).
"""
import time

from app.pipeline.classify import classify_email
from app.pipeline.compare import compare_fields, has_uncertain_field
from app.pipeline.documents import read_attachment
from app.pipeline.fields import extract_fields

_EMPTY_RESULT = {"status": "OK", "review_reason": None, "has_defect": False, "defect_fields": [], "comparisons": []}


def _step(steps, name, fn, *args):
    t0 = time.time()
    result = fn(*args)  # LLMError propagates - caller decides retry/fail, we never swallow it
    steps.append({"step": name, "ok": True, "ms": int((time.time() - t0) * 1000)})
    return result


def _needs_review(reason, comparisons=(), defect_fields=()):
    return {
        "status": "NEEDS_REVIEW",
        "review_reason": reason,
        "has_defect": bool(defect_fields),
        "defect_fields": list(defect_fields),
        "comparisons": list(comparisons),
    }


def _assign_roles(docs: dict):
    """docs: {path: Document}. Returns (si_path, bl_path) or None.

    Role comes from CONTENT (Document.role, which reads the title text and
    only falls back to the filename when the document has no readable
    title) - never from the filename alone. A file named "..._BL.txt" whose
    content is actually a commercial invoice must NOT be treated as a BL;
    this is exactly the wrong_doc_type case (FR-DOC-01)."""
    si = [p for p, d in docs.items() if d.role == "SI"]
    bl = [p for p, d in docs.items() if d.role == "BL"]
    if len(si) == 1 and len(bl) == 1:
        return si[0], bl[0]
    return None


def _compare_si_bl(storage, attachments, steps):
    docs = {path: read_attachment(storage, path) for path in attachments}
    steps.append({"step": "read_documents", "ok": True,
                  "detail": {path: d.method for path, d in docs.items()}})

    if any(d.unreadable for d in docs.values()):
        return _needs_review("unreadable")

    roles = _assign_roles(docs)
    if roles is None:
        return _needs_review("wrong_doc_type")
    si_doc, bl_doc = docs[roles[0]], docs[roles[1]]

    si_fields = extract_fields(si_doc)
    bl_fields = extract_fields(bl_doc)
    steps.append({"step": "extract", "ok": True,
                  "detail": {"si_fields": list(si_fields), "bl_fields": list(bl_fields)}})

    comparisons, defects = compare_fields(si_fields, bl_fields)
    steps.append({"step": "compare", "ok": True})

    if has_uncertain_field(comparisons):
        return _needs_review("missing_value", comparisons, defects)
    if defects:
        return {"status": "MISMATCH", "review_reason": None, "has_defect": True,
                "defect_fields": defects, "comparisons": comparisons}
    return {"status": "OK", "review_reason": None, "has_defect": False,
            "defect_fields": [], "comparisons": comparisons}


def process_email(storage, email: dict) -> dict:
    steps = []
    cls = _step(steps, "classify", classify_email, email)
    category = cls["category"]
    steps[-1]["detail"] = {"confidence": cls["confidence"], "reason": cls["reason"]}

    if category != "BL_COMPARISON":
        result = dict(_EMPTY_RESULT)
    else:
        attachments = email.get("attachments") or []
        if len(attachments) < 2:
            result = _needs_review("missing_attachment")
        else:
            result = _compare_si_bl(storage, attachments, steps)

    return {
        "email_id": email["email_id"],
        "category": category,
        "category_confidence": cls["confidence"],
        "steps": steps,
        **result,
    }

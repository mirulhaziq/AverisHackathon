"""Orchestrates one email end to end: classify -> (for BL_COMPARISON) read
attachments -> assign SI/BL roles -> extract fields -> compare -> build the
result record. This is the module `/process/{email_id}` calls; it raises
llm.LLMError on any LLM failure so the caller can route it to the failure
queue (db.mark_failed) instead of guessing a result (FR-ERR-01, BR-04).

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


def _compare_si_bl(storage, si_path, bl_path, steps):
    si_doc = read_attachment(storage, si_path)
    bl_doc = read_attachment(storage, bl_path)
    steps.append({"step": "read_documents", "ok": True,
                  "detail": {"si_method": si_doc.method, "bl_method": bl_doc.method}})

    if si_doc.unreadable or bl_doc.unreadable:
        return _needs_review("unreadable")

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


def _assign_roles(storage, attachments):
    """Returns (si_path, bl_path) or None if roles can't be resolved from the
    filename-only signal (cheap, before reading full document content)."""
    from pathlib import Path

    si = [a for a in attachments if Path(a).stem.upper().endswith("_SI")]
    bl = [a for a in attachments if Path(a).stem.upper().endswith("_BL")]
    if len(si) == 1 and len(bl) == 1:
        return si[0], bl[0]
    return None


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
            roles = _assign_roles(storage, attachments)
            if roles is None:
                result = _needs_review("wrong_doc_type")
            else:
                result = _compare_si_bl(storage, roles[0], roles[1], steps)

    return {
        "email_id": email["email_id"],
        "category": category,
        "category_confidence": cls["confidence"],
        "steps": steps,
        **result,
    }

"""Orchestrates one email end to end: classify -> (for BL_COMPARISON) extract
with rules + LLM fallback -> compare -> build the result record. This is the
module `/process/{email_id}` calls; it raises llm.LLMError on any classify
failure so the caller can route it to the failure queue (db.mark_failed)
instead of guessing a result (FR-ERR-01, BR-04). Extraction fallback failures
degrade gracefully instead (see extract_llm.fill_gaps) - a dead Bedrock call
during extraction routes the case to review, not to the failure queue, since
the rules alone may already have everything needed.

Field extraction is rules-first (extract_rules.py, corpus-derived synonyms
and quote verification) with an LLM fallback (extract_llm.py) for whatever
the rules leave genuinely absent - never for a value the rules found or a
placeholder the customer wrote on purpose. Case-level review reasons
(wrong_doc_type / missing_attachment / unreadable / missing_value) come from
contracts.export_reason(), the single agreed mapping from the internal SRS
6.5 vocabulary to the four reasons the submission accepts.

    from app.pipeline.run import process_email
    record = process_email(storage, email)

Owner: pipeline (P2/P3).
"""
import time

from app.pipeline.classify import classify_email
from app.pipeline.compare import compare_field
from app.pipeline.contracts import FIELD_IDS, FieldValue
from app.pipeline.extract_llm import extract_case_with_fallback
from app.pipeline.intake import extract_body, present_count, triage
from app.pipeline.llm_tools import BedrockBackend, extract_cache

_EMPTY_RESULT = {"status": "OK", "review_reason": None, "has_defect": False, "defect_fields": [], "comparisons": []}


def _step(steps, name, fn, *args):
    t0 = time.time()
    result = fn(*args)  # LLMError propagates - caller decides retry/fail, we never swallow it
    steps.append({"step": name, "ok": True, "ms": int((time.time() - t0) * 1000)})
    return result


def _as_legacy(fv):
    """FieldValue -> the {"value", "snippet"} shape compare.py expects, or
    None if nothing was found - normalisation is normalize.py/compare.py's
    job, this only carries what extraction actually produced."""
    if fv.raw is None:
        return None
    return {"value": fv.raw, "snippet": fv.quote or f"(no source line recorded for {fv.raw!r})"}


def _body_fields(sides):
    """extract_body's output -> {"SI": {field: {"value", "snippet"} | None}},
    the same per-value shape the comparisons carry."""
    return {role: {f: _as_legacy(fields[f]) for f in FIELD_IDS} for role, fields in sides.items()}


def _no_attachments(email, steps):
    """A BL_COMPARISON email with no files - see intake.py for the three kinds."""
    sides = extract_body(email)
    info = _step(steps, "intake", triage, email, sides)
    steps[-1]["detail"] = {"kind": info["kind"], "decided_by": info["decided_by"]}

    if info["kind"] == "awaiting_documents":
        # A chaser: nothing to compare and nothing for a person to decide.
        # OK is the committed answer (it is what the gold says for all 91 in
        # the bundle); intake is what stops the UI reading it as a pass.
        return {**_EMPTY_RESULT, "intake": info}

    if info["kind"] == "attachments_missing":
        return {"status": "NEEDS_REVIEW", "review_reason": "missing_attachment", "has_defect": False,
                "defect_fields": [], "comparisons": [], "intake": info}

    # details_in_body: compare what the body says, then always review. A side
    # the body does not carry compares as missing on that side. The export
    # reason stays missing_attachment - the documents themselves were not
    # attached, and that is one of the four reasons the submission accepts;
    # intake carries the detail for the reviewer.
    empty = {f: FieldValue(missing_reason="absent", confidence=0.0) for f in FIELD_IDS}
    si, bl = sides.get("SI", empty), sides.get("BL", empty)
    comparisons = [compare_field(f, _as_legacy(si[f]), _as_legacy(bl[f])) for f in FIELD_IDS]
    steps.append({"step": "compare", "ok": True})
    return {"status": "NEEDS_REVIEW", "review_reason": "missing_attachment", "has_defect": False,
            "defect_fields": [], "comparisons": comparisons, "intake": info,
            "body_fields": _body_fields(sides)}


def _compare_si_bl(storage, email, steps):
    if not email.get("attachments"):
        return _no_attachments(email, steps)

    backend = BedrockBackend()
    cache = extract_cache()
    result = _step(steps, "extract", extract_case_with_fallback, storage, email, backend, cache)
    steps.append({"step": "read_documents", "ok": True,
                  "detail": {r.path: r.role for r in result.roles}})

    reason = result.export_reason  # wrong_doc_type | missing_attachment | unreadable | missing_value | None

    comparisons = []
    defects = []
    # Comparisons are worth showing whenever both sides were at least attempted -
    # even a missing_value review benefits from seeing what WAS extracted. Skip
    # them only when there's nothing meaningful to compare (no attachment, wrong
    # document type, or a file that couldn't be read at all).
    if reason not in ("wrong_doc_type", "missing_attachment", "unreadable"):
        for field in FIELD_IDS:
            si_legacy, bl_legacy = _as_legacy(result.si[field]), _as_legacy(result.bl[field])
            comparisons.append(compare_field(field, si_legacy, bl_legacy))
        defects = [c["field"] for c in comparisons if c["match"] is False]
    steps.append({"step": "compare", "ok": True})

    if reason:
        # Matches the scored submission shape exactly (validated against the
        # organizers' ground truth): a case under review commits no defect
        # verdict yet, even if some fields already look mismatched - that
        # verdict is confirmed after review, not guessed now (BR-04).
        return {"status": "NEEDS_REVIEW", "review_reason": reason, "has_defect": False,
                "defect_fields": [], "comparisons": comparisons}
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

    if category == "SI_REQUEST" and not email.get("attachments"):
        # The SI is typed into the body. Read it for the case page - there is
        # no BL to compare it with, so the verdict is unchanged.
        sides = extract_body(email, default_role="SI")
        result = dict(_EMPTY_RESULT)
        if present_count(sides):
            result["body_fields"] = _body_fields(sides)
        steps.append({"step": "read_body", "ok": True, "detail": {"fields_found": present_count(sides)}})
    elif category != "BL_COMPARISON":
        result = dict(_EMPTY_RESULT)
    else:
        result = _compare_si_bl(storage, email, steps)

    return {
        "email_id": email["email_id"],
        "category": category,
        "category_confidence": cls["confidence"],
        "steps": steps,
        **result,
    }

"""Deterministic field comparison (SDD 6.2, FR-CMP-01..09). No LLM involved -
same inputs always give the same result, which is the whole point.

Simplified from the full SDD algorithm for the hackathon build: there is no
OCR-confidence "possible reading issue" branch yet, because nothing routes a
scanned document through OCR yet (scans correctly extract no fields at all,
so they fall through to the missing-value / review path instead of ever
reaching the mismatch/match decision - see docs/ROADMAP.md Phase 7).

    from app.pipeline.compare import compare_fields
    compare_fields(si_fields, bl_fields) -> (comparisons: list[dict], defect_fields: list[str])

Owner: pipeline (P3).
"""
from app.pipeline.fields import FIELDS
from app.pipeline.normalize import normalize


def compare_field(field: str, si: dict | None, bl: dict | None) -> dict:
    si_value = si["value"] if si else None
    bl_value = bl["value"] if bl else None
    si_norm = normalize(field, si_value)
    bl_norm = normalize(field, bl_value)

    if si_norm is None or bl_norm is None:
        match = None  # missing or ambiguous on at least one side - uncertain, not a mismatch
    else:
        match = si_norm == bl_norm

    return {
        "field": field,
        "si_value": si_value,
        "bl_value": bl_value,
        "match": match,
        "si_evidence": {"file": "SI", "snippet": si["snippet"]} if si else None,
        "bl_evidence": {"file": "BL", "snippet": bl["snippet"]} if bl else None,
    }


def compare_fields(si_fields: dict, bl_fields: dict) -> tuple[list[dict], list[str]]:
    """Returns (comparisons for every field, list of fields that mismatch).
    A field with match=None (missing/ambiguous on either side) is neither a
    match nor a defect - it is what makes the case NEEDS_REVIEW upstream."""
    comparisons = [compare_field(f, si_fields.get(f), bl_fields.get(f)) for f in FIELDS]
    defects = [c["field"] for c in comparisons if c["match"] is False]
    return comparisons, defects


def has_uncertain_field(comparisons: list[dict]) -> bool:
    return any(c["match"] is None for c in comparisons)

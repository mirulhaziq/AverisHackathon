"""Maps the label/value pairs from app.pipeline.documents to the 7 canonical
fields (FR-EXT-01/02) using a synonym dictionary, rules first (SDD 4.5 stage 1).
No LLM fallback yet — a field the rules cannot find is recorded as missing
(FR-EXT-04: never invent a value), which is the correct, safe default and
routes the case to review rather than guessing.

    from app.pipeline.fields import extract_fields
    extract_fields(doc) -> {
        "shipper": {"value": "ACME LTD", "raw_label": "Shipper", "snippet": "Shipper: ACME LTD"},
        ...  # only fields actually found are present
    }

Owner: pipeline (P3).
"""
import re

from app.pipeline.documents import Document, label_values, normalize_label

FIELDS = [
    "shipper", "consignee", "notify_party", "port_of_loading",
    "port_of_discharge", "container_count", "gross_weight_kg",
]

# Exact matches on the normalized label (see documents.normalize_label).
_EXACT = {
    "SHIPPER": "shipper", "SHIPPER EXPORTER": "shipper", "EXPORTER": "shipper", "CONSIGNOR": "shipper",
    "CONSIGNEE": "consignee",
    # A "to order" BL states the consignee as "To the Order of <bank>", not as a "Consignee" line
    # at all - this is real terminology (SRS: "Keep TO ORDER as its own value"), not a typo.
    "TO THE ORDER OF": "consignee", "TO ORDER": "consignee",
    "NOTIFY PARTY": "notify_party", "NOTIFY": "notify_party",
    "PORT OF LOADING": "port_of_loading", "LOAD PORT": "port_of_loading", "POL": "port_of_loading",
    "PORT OF DISCHARGE": "port_of_discharge", "DISCHARGE PORT": "port_of_discharge", "POD": "port_of_discharge",
    "TOTAL CONTAINERS": "container_count", "CONTAINER COUNT": "container_count",
    "NO OF CONTAINERS": "container_count",
    "GROSS WEIGHT": "gross_weight_kg", "GROSS WT": "gross_weight_kg",
}

# Fallback keyword rules, checked in this order, for labels the sample data
# writes differently than the exact list above (e.g. "Shipper Name:").
_KEYWORD_RULES = [
    (re.compile(r"\bNOTIFY\b"), "notify_party"),
    (re.compile(r"\bCONSIGNEE\b"), "consignee"),
    (re.compile(r"\bTO (THE )?ORDER\b"), "consignee"),
    (re.compile(r"\b(SHIPPER|EXPORTER|CONSIGNOR)\b"), "shipper"),
    (re.compile(r"\b(DISCHARGE|POD)\b"), "port_of_discharge"),
    (re.compile(r"\b(LOADING|LOAD PORT|POL)\b"), "port_of_loading"),
    (re.compile(r"\bCONTAINER"), "container_count"),
    (re.compile(r"\bGROSS\b.*\b(WEIGHT|WT)\b"), "gross_weight_kg"),
]


def match_field(normalized_label: str) -> str | None:
    if normalized_label in _EXACT:
        return _EXACT[normalized_label]
    for pattern, field in _KEYWORD_RULES:
        if pattern.search(normalized_label):
            return field
    return None


def extract_fields(doc: Document) -> dict:
    found = {}
    for normalized, raw_label, value in label_values(doc):
        field = match_field(normalized)
        if field and field not in found and value.strip():
            found[field] = {
                "value": value.strip(),
                "raw_label": raw_label,
                "snippet": f"{raw_label}: {value}".strip(),
            }
    return found

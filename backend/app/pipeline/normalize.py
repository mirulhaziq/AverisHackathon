"""Normalization rules (SDD 6.1 / SRS FR-NRM-01..05), so a difference in
spelling, case, punctuation, label, or unit is never reported as a mismatch.

Kept deliberately simple for the hackathon build: no port alias table and no
number-word parsing yet (both are real gaps, tracked in docs/ROADMAP.md and
docs/SRS.md OI items) — but casing/punctuation/suffix collapsing and unit
conversion, the two biggest sources of false alarms, are handled.

    from app.pipeline.normalize import normalize
    normalize("port_of_loading", "Port of Loading, Shanghai") -> "SHANGHAI"

Owner: pipeline (P3). Pure Python, no AWS dependency, unit-testable.
"""
import re
import unicodedata

_PUNCT = re.compile(r"[^A-Z0-9 ]")
_SPACE = re.compile(r"\s+")


def _squash(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).upper().replace("&", " AND ")
    value = _PUNCT.sub(" ", value)
    return _SPACE.sub(" ", value).strip()


def normalize_party(value: str) -> str:
    """Shipper / consignee / notify party (FR-NRM-01). Case, punctuation and
    the ampersand collapse here, which is enough to make 'Sdn. Bhd.' and
    'Sdn Bhd' equal without a separate suffix table."""
    return _squash(value)


_PORT_STRIP = re.compile(r"\b(PORT OF|PORT)\b")


def normalize_port(value: str) -> str:
    """Port of loading / discharge (FR-NRM-03, simplified — no alias table yet:
    open item, see docs/SRS.md OI-*). Drops 'Port of' / 'Port' and anything
    after the first comma (usually a country), so 'Port of Loading, Shanghai,
    China' and 'Load Port: SHANGHAI' both normalize to 'SHANGHAI'."""
    value = value.split(",")[0]
    value = _PORT_STRIP.sub(" ", _squash(value))
    return _SPACE.sub(" ", value).strip()


_INT = re.compile(r"\d+")


def normalize_container_count(value: str) -> str | None:
    """FR-NRM-04. Takes the first integer found; number words are an open
    item (docs/SRS.md OI list) and not handled yet."""
    m = _INT.search(value.replace(",", ""))
    return str(int(m.group())) if m else None


_NUMBER = re.compile(r"[\d,]+(?:\.\d+)?")
_UNIT_TO_KG = {"KG": 1, "KGS": 1, "MT": 1000, "TONNE": 1000, "TONNES": 1000, "LB": 0.453592, "LBS": 0.453592}


def normalize_weight_kg(value: str) -> str | None:
    """FR-NRM-05. Converts kg/kgs/MT/tonnes/lb to kilograms. A bare 'tons' or
    a number with an ambiguous separator is intentionally left unconverted
    (returns None -> the field is treated as missing/ambiguous, per
    FR-NRM-05's 'shall create a review task' rather than guessing)."""
    m = _NUMBER.search(value)
    if not m:
        return None
    number = float(m.group().replace(",", ""))
    unit = _squash(value[m.end():])
    for token, factor in _UNIT_TO_KG.items():
        if unit.startswith(token):
            return _fmt(number * factor)
    if not unit:  # no unit at all - assume already kilograms
        return _fmt(number)
    return None  # ambiguous unit (e.g. bare "tons") - do not guess


def _fmt(kg: float) -> str:
    kg = round(kg, 2)
    return str(int(kg)) if kg == int(kg) else str(kg)


_NORMALIZERS = {
    "shipper": normalize_party,
    "consignee": normalize_party,
    "notify_party": normalize_party,
    "port_of_loading": normalize_port,
    "port_of_discharge": normalize_port,
    "container_count": normalize_container_count,
    "gross_weight_kg": normalize_weight_kg,
}


def normalize(field: str, value: str | None) -> str | None:
    if value is None:
        return None
    return _NORMALIZERS[field](value)

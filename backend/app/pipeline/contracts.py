"""P2 -> everyone. The frozen output shapes for classification and extraction.

This module is the contract between P2 and the rest of the team. P1 persists
these, P3 consumes ExtractionResult, P4 renders all of it. Changing a field
here is a conversation, not a commit.

Two vocabularies are deliberately kept apart:

  * the internal review reasons (11, from SRS 6.5) drive the review UI and
    carry enough detail for a human to act on;
  * the export reasons (4, all the self-evaluation accepts) are what reaches
    the submission.

EXPORT_REASON collapses the first into the second. That collapse is a joint
P2/P3 decision and lives here so there is exactly one copy of it.

    python tools/contracts.py        # validate the golden fixtures

BOUNDARY WITH P3
P2 owns labels: deciding that "Total Containers" and "Container Count" are
both container_count. P3 owns values: deciding that "6 x 40'HC" is 6, and
that 22 MT equals 22,000 KG. FieldValue.raw is handed over unnormalised -
there is no normalised field here on purpose.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, Field, model_validator

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"

# --- vocabularies -----------------------------------------------------

Category = Literal["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]
DecidedBy = Literal["rule", "llm"]
Role = Literal["SI", "BL", "OTHER", "UNREADABLE"]
Method = Literal["rule", "llm", "ocr", "human"]
MissingReason = Literal["absent", "placeholder", "unverified_quote"]

FieldId = Literal[
    "shipper", "consignee", "notify_party",
    "port_of_loading", "port_of_discharge",
    "container_count", "gross_weight_kg",
]
FIELD_IDS: tuple[str, ...] = (
    "shipper", "consignee", "notify_party",
    "port_of_loading", "port_of_discharge",
    "container_count", "gross_weight_kg",
)

ReviewReason = Literal[
    "MISSING_ATTACHMENT", "UNKNOWN_DOCUMENT_ROLE", "UNREADABLE_DOCUMENT",
    "MISSING_FIELD", "LOW_CONFIDENCE_FIELD", "CONFLICTING_VALUES",
    "AMBIGUOUS_FORMAT", "POSSIBLE_READING_ISSUE", "VALIDATION_FAILED",
    "LOW_CLASS_CONFIDENCE", "CONFLICTING_SIGNALS",
]
ExportReason = Literal["wrong_doc_type", "missing_attachment", "unreadable", "missing_value"]

#: SRS 6.5 (11 codes) -> what the self-evaluation accepts (4 codes).
#: A reason with no sensible export form maps to None: the case still carries
#: the internal reason for the reviewer, but the submission commits a decision
#: rather than escalating. See the escalation policy - NEEDS_REVIEW is
#: score-negative on a case we could actually decide.
EXPORT_REASON: dict[str, ExportReason | None] = {
    "MISSING_ATTACHMENT":     "missing_attachment",
    "UNKNOWN_DOCUMENT_ROLE":  "wrong_doc_type",
    "UNREADABLE_DOCUMENT":    "unreadable",
    "MISSING_FIELD":          "missing_value",
    "AMBIGUOUS_FORMAT":       "missing_value",
    "CONFLICTING_VALUES":     "missing_value",
    "VALIDATION_FAILED":      "missing_value",
    "LOW_CONFIDENCE_FIELD":   None,
    "POSSIBLE_READING_ISSUE": None,
    "LOW_CLASS_CONFIDENCE":   None,
    "CONFLICTING_SIGNALS":    None,
}

#: Highest-priority reason wins when a case raises several.
REASON_PRIORITY: tuple[str, ...] = (
    "MISSING_ATTACHMENT", "UNKNOWN_DOCUMENT_ROLE", "UNREADABLE_DOCUMENT",
    "MISSING_FIELD", "AMBIGUOUS_FORMAT", "CONFLICTING_VALUES", "VALIDATION_FAILED",
)


def export_reason(reasons: list[str]) -> ExportReason | None:
    """The single submission-facing reason for a case, or None to commit."""
    for code in REASON_PRIORITY:
        if code in reasons:
            return EXPORT_REASON[code]
    return None


# --- models -----------------------------------------------------------

class Classification(BaseModel):
    """Stage 1. Produced for every email in the inbox, no exceptions."""
    category: Category
    confidence: float = Field(ge=0.0, le=1.0)
    decided_by: DecidedBy
    reason: str = Field(min_length=1, description="One sentence, shown in the UI.")
    signals: list[str] = Field(default_factory=list,
                               description="What drove the decision, for the demo.")
    conflict: bool = Field(default=False,
                           description="The rule ladder and the LLM disagreed.")

    @model_validator(mode="after")
    def _rule_decisions_are_certain(self) -> Classification:
        # A rule that fires is deterministic; a confidence below the review
        # threshold from a rule means the ladder is miscalibrated, not unsure.
        if self.decided_by == "rule" and self.confidence < 0.8:
            raise ValueError("a rule decision below 0.8 means the ladder is wrong")
        return self


class DocumentRole(BaseModel):
    """Which attachment is the SI and which is the BL - content before name."""
    path: str
    role: Role
    detected_type: str | None = Field(
        default=None,
        description="Title-line type when role is OTHER: COMMERCIAL_INVOICE, "
                    "PACKING_LIST, CERTIFICATE_OF_ORIGIN, ...",
    )
    source: Literal["content", "filename"] = "content"
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    unreadable_reason: str | None = None

    @model_validator(mode="after")
    def _explain_the_odd_ones(self) -> DocumentRole:
        if self.role == "OTHER" and not self.detected_type:
            raise ValueError("role OTHER needs detected_type - that is the evidence")
        if self.role == "UNREADABLE" and not self.unreadable_reason:
            raise ValueError("role UNREADABLE needs unreadable_reason")
        return self


class FieldValue(BaseModel):
    """One of the seven fields, from one document, with its evidence.

    raw is verbatim from the document. There is no normalised value here -
    that is P3's output, not P2's.
    """
    raw: str | None = None
    quote: str | None = Field(default=None, description="The line the value came from.")
    page: int | None = Field(default=None, ge=1)
    unit: str | None = Field(default=None, description='"KG", "MT", "TEU", ... P3 converts.')
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    method: Method = "rule"
    derived: bool = Field(default=False,
                          description="Container count summed rather than stated.")
    missing_reason: MissingReason | None = None
    candidates: list[str] = Field(default_factory=list,
                                  description="Populated only when readings conflict.")

    @model_validator(mode="after")
    def _missing_and_present_are_exclusive(self) -> FieldValue:
        if self.raw is None and self.missing_reason is None:
            raise ValueError("a field with no raw value must say why it is missing")
        if self.raw is not None and self.missing_reason is not None:
            raise ValueError("a field with a raw value cannot also be missing")
        # FR-EXT-05 / NFR-ACC-04: an LLM value without a verified quote is
        # exactly the fabrication the spec forbids.
        if self.raw is not None and self.method == "llm" and not self.quote:
            raise ValueError("an LLM value needs the quote it was verified against")
        # SDD 6.3: a value only the LLM produced is capped at 0.90.
        if self.method == "llm" and self.confidence > 0.9:
            raise ValueError("LLM-only values cap at 0.90")
        return self

    @property
    def present(self) -> bool:
        return self.raw is not None


class ExtractionResult(BaseModel):
    """Everything P3 needs to normalise and compare one case."""
    email_id: str
    si: dict[str, FieldValue]
    bl: dict[str, FieldValue]
    roles: list[DocumentRole] = Field(default_factory=list)
    review_reasons: list[ReviewReason] = Field(default_factory=list)
    prompt_version: str = Field(description="Pinned, and stored with every result.")

    @model_validator(mode="after")
    def _both_sides_carry_all_seven(self) -> ExtractionResult:
        for side, values in (("si", self.si), ("bl", self.bl)):
            missing = set(FIELD_IDS) - set(values)
            extra = set(values) - set(FIELD_IDS)
            if missing:
                raise ValueError(f"{side} is missing {sorted(missing)} - "
                                 "absent fields are FieldValue(missing_reason=...), not omitted")
            if extra:
                raise ValueError(f"{side} has unknown fields {sorted(extra)}")
        return self

    @property
    def export_reason(self) -> ExportReason | None:
        return export_reason(list(self.review_reasons))


# --- golden fixtures --------------------------------------------------
# Real values from email_004, whose consignee and notify_party genuinely
# differ between the two documents. P3 and P4 can build against this before
# any of the pipeline runs.

def build_fixtures() -> dict[str, BaseModel]:
    def si_bl(field: str, si_raw: str, bl_raw: str, si_label: str, bl_label: str,
              unit: str | None = None) -> tuple[FieldValue, FieldValue]:
        return (
            FieldValue(raw=si_raw, quote=f"{si_label}: {si_raw}", page=1,
                       unit=unit, confidence=0.98, method="rule"),
            FieldValue(raw=bl_raw, quote=f"{bl_label}: {bl_raw}", page=1,
                       unit=unit, confidence=0.98, method="rule"),
        )

    pairs = {
        "shipper": si_bl("shipper", "APRIL FAR EAST (M) SDN BHD",
                         "APRIL FAR EAST (M) SDN BHD", "Shipper", "SHIPPER"),
        "consignee": si_bl("consignee", "EAST BRIGHT FZ-LLC", "UAB NOVAKOPA",
                           "Consignee (Non-Negotiable)", "To the Order of"),
        "notify_party": si_bl("notify_party", "EAST BRIGHT FZ-LLC", "UAB NOVAKOPA",
                              "Notify", "Notify Party"),
        "port_of_loading": si_bl("port_of_loading", "NANTONG, CHINA (CNNTG)",
                                 "NANTONG, CHINA (CNNTG)",
                                 "Port of Loading (POL)", "Port of Loading (POL)"),
        "port_of_discharge": si_bl("port_of_discharge", "KARACHI, PAKISTAN (PKKHI)",
                                   "KARACHI, PAKISTAN (PKKHI)", "POD", "POD"),
        "container_count": si_bl("container_count", "6 x 40'HC", "6 x 40'HC",
                                 "Total Containers", "Container Count"),
        "gross_weight_kg": si_bl("gross_weight_kg", "131,058 KG", "131,058 KG",
                                 "Gross Wt (kgs)", "Gross Weight (KG)", unit="KG"),
    }

    return {
        "classification": Classification(
            category="BL_COMPARISON",
            confidence=0.97,
            decided_by="rule",
            reason="Body asks for the attached SI and draft BL to be checked, and both are present.",
            signals=["body:attached are the si and draft bl", "attachments:2",
                     "titles:SHIPPING INSTRUCTION+BILL OF LADING (DRAFT)"],
        ),
        "document_role": DocumentRole(
            path="attachments/email_004_BL.txt",
            role="BL",
            source="content",
            confidence=1.0,
        ),
        "document_role_wrong_type": DocumentRole(
            path="attachments/email_501_BL.txt",
            role="OTHER",
            detected_type="COMMERCIAL_INVOICE",
            source="content",
            confidence=1.0,
        ),
        "extraction": ExtractionResult(
            email_id="email_004",
            si={k: v[0] for k, v in pairs.items()},
            bl={k: v[1] for k, v in pairs.items()},
            roles=[
                DocumentRole(path="attachments/email_004_SI.txt", role="SI"),
                DocumentRole(path="attachments/email_004_BL.txt", role="BL"),
            ],
            prompt_version="extract/v0",
        ),
    }


def main() -> int:
    FIXTURES.mkdir(exist_ok=True)
    built = build_fixtures()
    for name, model in built.items():
        path = FIXTURES / f"{name}.json"
        path.write_text(model.model_dump_json(indent=2), encoding="utf-8")
        # Round-trip: what we wrote must validate back into the same model.
        type(model).model_validate_json(path.read_text(encoding="utf-8"))
        print(f"  ok  {path.relative_to(HERE.parent)}")

    ex = built["extraction"]
    assert isinstance(ex, ExtractionResult)
    differing = [f for f in FIELD_IDS if ex.si[f].raw != ex.bl[f].raw]
    print(f"\nemail_004 fixture: {len(differing)} fields differ before "
          f"normalisation -> {differing}")
    print("(P3 decides whether those survive normalisation. P2 only reports "
          "what each document says.)")
    print(f"export_reason for a clean case: {ex.export_reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

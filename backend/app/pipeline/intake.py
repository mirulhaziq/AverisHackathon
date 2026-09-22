"""Emails that arrive with no attachments: what they actually are, and what
their body says.

No attachments is not one situation, it is three, and the old rule
(fewer than two files -> missing_attachment) treated them all as the third:

  awaiting_documents   A chaser in the thread - "Please assist to send the
                       draft BL for SIN832764835 for checking asap." Nothing
                       was meant to be attached; the documents come later.
                       Nothing to compare and nothing for a person to do, so
                       the case is OK, labelled so nobody reads it as a pass.
  attachments_missing  The sender meant to attach the SI and BL and they are
                       not there - "(attachments appear to have been
                       dropped)". This stays missing_attachment, in review.
  details_in_body      The sender typed the SI and/or BL details into the
                       email instead of attaching them. The body is read as a
                       document, compared, and always sent to review - a body
                       mixes greetings, signatures and quoted replies, so a
                       person confirms before anyone relies on it.

Measured on the organizers' bundle before writing a line of this: 94
BL_COMPARISON emails have no attachments. 91 are the chaser above and the
gold marks every one OK; 3 are the dropped-attachment case and the gold marks
them missing_attachment. No email carries both SI and BL in its body, so
details_in_body is built for real inboxes rather than for this dataset - it
never fires on the bundle.

HOW THE KIND IS DECIDED
Rules first, in the order that is safest when they disagree: extracted
fields (the body demonstrably carries data) -> words that say something was
meant to be attached -> words that ask for the documents to be sent. Only an
email none of those recognise goes to the model, and a model failure falls
back to attachments_missing, which puts the case in front of a person rather
than waving it through.

THE EMAIL BODY AS A DOCUMENT
extract_rules is reused unchanged. Two things differ from an attachment:
bodies put a party on the line *under* its label ("Shipper:" then the name),
and state containers as a bare "15X20'GP" line. _unfold joins the first, a
dedicated pass reads the second, and every value is then re-verified against
what the sender actually wrote - the unfolded text is a reading aid, never the
evidence. Quoted replies and forwards are cut off first, so a value is never
read out of an older message in the thread.

    from app.pipeline.intake import triage, extract_body
    intake = triage(email)            # BL_COMPARISON with no attachments
    fields = extract_body(email)      # {"SI": {field: FieldValue}, ...}

Owner: pipeline (P2/P3).
"""
from __future__ import annotations

import re

from app.cloud import llm
from app.pipeline.contracts import FIELD_IDS, FieldValue
from app.pipeline.documents import Document
from app.pipeline.extract_rules import LABEL_LINE, extract_document, verify

BODY_PATH = "email:body"

#: A body counts as carrying details once this many of the seven are found
#: across its sides. Three, because a chaser can mention a port in passing
#: ("the draft BL for the Karachi shipment") but not three labelled fields.
MIN_BODY_FIELDS = 3

# --- the sender's own text ---------------------------------------------

#: Where the quoted thread starts. Outlook's rule of underscores, the
#: "Original Message" banner, a From: header at the start of a line, and the
#: Gmail "On <date>, <name> wrote:" line.
_QUOTE_START = re.compile(
    r"^\s*(?:_{5,}|-{2,}\s*Original Message\s*-{2,}|From:\s|On\b.{0,80}\bwrote:\s*$)",
    re.IGNORECASE | re.MULTILINE,
)


#: Text a mail gateway adds, not the sender: the external-sender banner
#: ("...exercise caution with E-Mail content and any links or attachments")
#: and the confidentiality footer ("This email and any attachments are
#: confidential"). Both mention attachments on every email they touch, which
#: is exactly the word triage listens for - 27 of the bundle's chasers carry
#: the banner.
_BOILERPLATE = re.compile(
    r"^.*(?:originated\s+(?:from\s+)?outside|external\s+(?:sender|email)"
    r"|(?:this|the)\s+(?:e-?mail|message)\s+and\s+any\s+attachments?).*$",
    re.IGNORECASE | re.MULTILINE,
)

#: Where the sender stops and the signature block starts.
_SIGN_OFF = re.compile(r"^\s*(?:best\s+regards|kind\s+regards|warm\s+regards|regards|thanks?(?:\s+you)?|"
                       r"thank\s+you|cheers|sincerely)\b[\s,.!]*$", re.IGNORECASE | re.MULTILINE)


def own_text(body: str) -> str:
    """The part of the body this sender wrote: no quoted thread, no gateway
    banner or footer."""
    m = _QUOTE_START.search(body or "")
    text = (body or "")[: m.start()] if m else (body or "")
    return _BOILERPLATE.sub("", text)


def _message(body: str) -> str:
    """own_text up to the sign-off - the request itself, for triage. Not used
    for extraction, where a detail below "Regards," is still a detail."""
    text = own_text(body)
    m = _SIGN_OFF.search(text)
    return text[: m.start()] if m else text


def _unfold(text: str) -> str:
    """'Shipper:' followed by the name on the next line -> 'Shipper: NAME'.

    Only the first following line is taken: raw holds the party name, never
    the address block, the same rule extract_rules applies to attachments.
    """
    lines = text.splitlines()
    out: list[str] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = LABEL_LINE.match(line)
        if m and not m.group(2).strip():
            j = i + 1
            while j < len(lines) and not lines[j].strip():
                j += 1
            if j < len(lines) and not LABEL_LINE.match(lines[j]):
                out.append(f"{line.rstrip()} {lines[j].strip()}")
                i = j + 1
                continue
        out.append(line)
        i += 1
    return "\n".join(out)


#: "15X20'GP", "6 x 40'HC", "2 X 40 HQ" on a line of their own, or after a
#: short label people type but documents don't use ("Containers: 2 x 40 HC",
#: "Equipment: ..."). Body-only on purpose: adding CONTAINERS to the shared
#: synonym list would change what attachments extract. The size is required,
#: so a line like "3 Original BL + 3 N/N" is not a container count.
_BARE_QUANTITY = re.compile(
    r"^\s*(?:(?:containers?|cntrs?|equipment|qty|quantity|volume)\s*:?\s*)?"
    r"(\d{1,4}\s*[x×]\s*(?:20|40|45)\s*'?\s*(?:GP|HC|HQ|DV|FCL|RF|OT|FR|ST)?)\b",
    re.IGNORECASE,
)


def _bare_quantity(text: str) -> FieldValue | None:
    for line in text.splitlines():
        if m := _BARE_QUANTITY.match(line):
            return FieldValue(raw=m.group(1).strip(), quote=line.strip(), page=1,
                              confidence=0.85, method="rule")
    return None


def _missing(reason: str) -> FieldValue:
    return FieldValue(missing_reason=reason, confidence=0.0, method="rule")


def _extract_section(text: str) -> dict[str, FieldValue]:
    """The seven fields from one stretch of body text, each verified against
    the text as the sender wrote it."""
    original = Document(BODY_PATH, "text", text=text, pages=[text])
    unfolded = _unfold(text)
    out = extract_document(Document(BODY_PATH, "text", text=unfolded, pages=[unfolded]))
    if out["container_count"].raw is None:
        out["container_count"] = _bare_quantity(text) or out["container_count"]
    for fid, value in out.items():
        if value.raw is not None and not verify(original, value.quote, value.raw, derived=value.derived):
            out[fid] = _missing("unverified_quote")
    return out


# --- which side is which ------------------------------------------------

#: A heading line that opens an SI or a BL section inside the body:
#: "SI details:", "--- Draft BL ---", "Bill of Lading particulars".
_SECTION = re.compile(
    r"^[\s\-=*#>]*(?P<doc>shipping instructions?|s\.?i\.?|draft\s+(?:bill of lading|b/?l)|bill of lading|b/?l)"
    r"(?:\s+(?:details|particulars|draft))?[\s:\-=*#]*$",
    re.IGNORECASE,
)


def _role_of(heading: str) -> str:
    h = heading.lower()
    return "BL" if ("bill" in h or re.search(r"\bb/?l\b", h)) else "SI"


_FIRST_DOC = re.compile(r"shipping instructions?|\bSI\b|bill of lading|\bB/?L\b", re.IGNORECASE)


def _sections(text: str, default_role: str | None = None) -> list[tuple[str, str]]:
    """(role, text) per SI/BL section. With no headings the body is one side:
    `default_role` when the caller knows it (an SI_REQUEST is an SI), else the
    first document the text names. Not the most-mentioned one - "Please find
    Shipping instruction ... revert with draft BL ... 3 Original BL" names the
    BL twice and is still an SI."""
    lines = text.splitlines()
    marks = [(i, _role_of(m.group("doc"))) for i, l in enumerate(lines) if (m := _SECTION.match(l))]
    if not marks:
        if default_role:
            return [(default_role, text)]
        first = _FIRST_DOC.search(text)
        return [(_role_of(first.group(0)) if first else "SI", text)]
    out: list[tuple[str, str]] = []
    for n, (start, role) in enumerate(marks):
        end = marks[n + 1][0] if n + 1 < len(marks) else len(lines)
        out.append((role, "\n".join(lines[start + 1:end])))
    return out


def extract_body(email: dict, default_role: str | None = None) -> dict[str, dict[str, FieldValue]]:
    """{"SI": {...seven...}, "BL": {...seven...}} for whichever sides the body
    carries. A side the body does not carry is left out, not filled with
    seven absents - the caller decides what a missing side means."""
    sides: dict[str, dict[str, FieldValue]] = {}
    for role, text in _sections(own_text(email.get("body") or ""), default_role):
        fields = _extract_section(text)
        if role in sides:          # a second section for the same side fills gaps only
            fields = {f: sides[role][f] if sides[role][f].raw is not None else fields[f] for f in FIELD_IDS}
        sides[role] = fields
    return sides


def present_count(sides: dict[str, dict[str, FieldValue]]) -> int:
    return sum(1 for fields in sides.values() for v in fields.values() if v.raw is not None)


# --- triage -------------------------------------------------------------

#: The sender says something was meant to be attached, or asks for a check
#: that needs documents in hand.
_EXPECTS = re.compile(
    r"\battach(?:ed|ment|ments)\b|\benclosed\b|\bplease\s+(?:find|see)\b|\bhere\s+(?:is|are)\s+the\b"
    r"|\bcompare\b|\bcheck\s+(?:the|our|attached)\b",
    re.IGNORECASE,
)

#: The sender asks for the documents to be sent to them.
_AWAITING = re.compile(
    r"\b(?:send|provide|share|forward|resend|revert\s+with|advise)\b[^.\n]{0,40}?"
    r"\b(?:draft\s+)?(?:bl|b/l|bill\s+of\s+lading|si|shipping\s+instructions?|documents?|docs)\b",
    re.IGNORECASE,
)

KINDS = ("awaiting_documents", "attachments_missing", "details_in_body")

SCHEMA = {
    "type": "object",
    "properties": {
        "kind": {"type": "string", "enum": ["awaiting_documents", "attachments_missing"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "reason": {"type": "string"},
    },
    "required": ["kind", "confidence", "reason"],
}

PROMPT = """An email in a shipping operations inbox asks about comparing a Shipping Instruction (SI) \
with a draft Bill of Lading (BL), but it arrived with NO attachments. Decide which it is:

- awaiting_documents: the sender is asking for the documents, chasing them, or following up in a \
thread. Nothing was meant to be attached to THIS email.
- attachments_missing: the sender meant to attach the SI and/or BL (or expects the reader to have \
them) and they are not there.

When unsure, answer attachments_missing - a person will look at it.

<subject>{subject}</subject>
<body>
{body}
</body>

Respond with a single JSON object: {{"kind": ..., "confidence": <0..1>, "reason": "<one sentence>"}}.
"""

#: Below this the model's answer is not trusted and the case goes to a person.
MIN_LLM_CONFIDENCE = 0.7


def _snippet(text: str, m: re.Match) -> str:
    """The line the phrase was found on, for the reviewer."""
    start = text.rfind("\n", 0, m.start()) + 1
    end = text.find("\n", m.end())
    return text[start:end if end != -1 else len(text)].strip()


def triage(email: dict, sides: dict[str, dict[str, FieldValue]] | None = None) -> dict:
    """The intake kind for a BL_COMPARISON email with no attachments, with the
    reason and the line that decided it. `sides` is extract_body's output,
    passed in when the caller already has it."""
    text = _message(email.get("body") or "")
    sides = extract_body(email) if sides is None else sides

    found = present_count(sides)
    if found >= MIN_BODY_FIELDS:
        names = " and ".join(sorted(sides))
        return {"kind": "details_in_body", "decided_by": "rule", "evidence": None,
                "reason": f"No files attached, but the email body carries {found} of the "
                          f"{7 * len(sides)} {names} fields."}

    if m := _EXPECTS.search(text):
        return {"kind": "attachments_missing", "decided_by": "rule", "evidence": _snippet(text, m),
                "reason": "The email refers to documents that should be attached, and none are."}

    if m := _AWAITING.search(text):
        return {"kind": "awaiting_documents", "decided_by": "rule", "evidence": _snippet(text, m),
                "reason": "The email asks for the documents to be sent - nothing was meant to be attached yet."}

    try:
        out = llm.generate_json(
            PROMPT.format(subject=email.get("subject") or "", body=text[:4000]),
            SCHEMA, task="classify", max_tokens=200,
        )
    except llm.LLMError as exc:
        return {"kind": "attachments_missing", "decided_by": "rule", "evidence": None,
                "reason": f"Could not tell whether documents were expected ({exc.kind}), "
                          "so a person should check."}
    if out["kind"] == "awaiting_documents" and out["confidence"] < MIN_LLM_CONFIDENCE:
        return {"kind": "attachments_missing", "decided_by": "llm", "evidence": None,
                "reason": f"Unsure whether documents were expected ({out['reason']}), so a person should check."}
    return {"kind": out["kind"], "decided_by": "llm", "evidence": None, "reason": out["reason"]}

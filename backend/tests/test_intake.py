"""Emails with no attachments: triage into awaiting_documents /
attachments_missing / details_in_body, and reading the SI/BL out of the body.
The unit tests use bodies written in the bundle's own shapes; the dataset
tests pin the counts measured against the organizers' bundle."""
import os
from pathlib import Path

import pytest

from app.cloud import llm
from app.cloud.storage import Storage
from app.pipeline import intake
from app.pipeline.contracts import FIELD_IDS
from app.pipeline.run import process_email

DATA = Path(os.environ.get("TEST_DATA_DIR", "data"))
needs_data = pytest.mark.skipif(not (DATA / "inbox").exists(), reason="no dataset at TEST_DATA_DIR/data")

SIGNATURE = """Best Regards,
Syed Faraz Ali
Shipping Documentation
DID : +971 04 4938295
P.O. Box : 293775, Dubai, United Arab Emirates"""

CHASER = f"""Dear Hari,

Please assist to send the draft BL for SIN832764835 for checking asap.

Thank you.

{SIGNATURE}

______________________________
From: Ooi Sok Yong <sokyong_ooi@aprilasia.com>
Subject: RE: 5ALT-57871

Attached are the SI and draft BL. Please check."""

DROPPED = ("Dear Team,\n\nPlease compare the SI and draft BL for 070500263211 and confirm "
           "(attachments appear to have been dropped). Thank you.")

SI_BODY = f"""Hi Willy

Please find Shipping instruction for 5RFR-37631.

POL: SINGAPORE
POD: GDANSK, POLAND

Shipper:
APRIL FINE PAPER TRADING
ON BEHALF OF VITAL SOLUTIONS PTE LTD

Consignee:
AL GURG STATIONERY LLC
P.O. BOX 5069

Notify Party:
PACIFIC OFFICE (M) SDN BHD

Description of Goods:
15X20'GP
PAPERBOARD
GROSS WT: 354,765 KG

Documents Required:
3) 3 Original BL + 3 N/N
Please revert with draft BL once available.

{SIGNATURE}"""


def email(body, attachments=()):
    return {"email_id": "email_x", "subject": "TO CONFIRM DOCS", "from": "a@b.c",
            "body": body, "attachments": list(attachments)}


@pytest.fixture
def no_llm(monkeypatch):
    def boom(*a, **k):
        raise AssertionError("the rules should have decided this")
    monkeypatch.setattr(llm, "generate_json", boom)


# ---------- the sender's own text ----------

def test_quoted_thread_is_cut_off():
    assert "Attached are the SI" not in intake.own_text(CHASER)


def test_gateway_banner_does_not_count_as_mentioning_attachments(no_llm):
    body = ("WARNING: This email originated outside of our organisation. As a security measure, "
            "please exercise caution with E-Mail content and any links or attachments.\n\n" + CHASER)
    assert intake.triage(email(body))["kind"] == "awaiting_documents"


# ---------- triage ----------

def test_chaser_is_awaiting_documents(no_llm):
    out = intake.triage(email(CHASER))
    assert out["kind"] == "awaiting_documents" and out["decided_by"] == "rule"
    assert "send the draft BL" in out["evidence"]


def test_dropped_attachments_are_missing(no_llm):
    out = intake.triage(email(DROPPED))
    assert out["kind"] == "attachments_missing" and "dropped" in out["evidence"]


def test_mentioning_attachments_wins_over_asking_for_them(no_llm):
    """Both phrases: the safer reading (a person looks) wins."""
    body = "Please send the draft BL. The SI is attached."
    assert intake.triage(email(body))["kind"] == "attachments_missing"


def test_body_with_details_is_details_in_body(no_llm):
    assert intake.triage(email(SI_BODY))["kind"] == "details_in_body"


def test_unclear_email_goes_to_the_model(monkeypatch):
    monkeypatch.setattr(llm, "generate_json", lambda *a, **k: {
        "kind": "awaiting_documents", "confidence": 0.9, "reason": "a follow-up in the thread"})
    out = intake.triage(email("Noted with thanks."))
    assert out == {"kind": "awaiting_documents", "decided_by": "llm", "evidence": None,
                   "reason": "a follow-up in the thread"}


def test_an_unsure_model_does_not_wave_a_case_through(monkeypatch):
    monkeypatch.setattr(llm, "generate_json", lambda *a, **k: {
        "kind": "awaiting_documents", "confidence": 0.4, "reason": "maybe a follow-up"})
    assert intake.triage(email("Noted with thanks."))["kind"] == "attachments_missing"


def test_a_model_failure_puts_the_case_in_front_of_a_person(monkeypatch):
    def fail(*a, **k):
        raise llm.LLMError("throttled", "slow down", retryable=True)
    monkeypatch.setattr(llm, "generate_json", fail)
    out = intake.triage(email("Noted with thanks."))
    assert out["kind"] == "attachments_missing" and "throttled" in out["reason"]


# ---------- the body as a document ----------

def test_si_typed_into_the_body_gives_all_seven_fields():
    si = intake.extract_body(email(SI_BODY))["SI"]
    assert {f: v.raw for f, v in si.items()} == {
        "shipper": "APRIL FINE PAPER TRADING",
        "consignee": "AL GURG STATIONERY LLC",
        "notify_party": "PACIFIC OFFICE (M) SDN BHD",
        "port_of_loading": "SINGAPORE",
        "port_of_discharge": "GDANSK, POLAND",
        "container_count": "15X20'GP",
        "gross_weight_kg": "354,765 KG",
    }


def test_body_is_named_by_the_first_document_it_mentions():
    """It names the BL twice ("revert with draft BL", "3 Original BL") and
    is still an SI."""
    assert list(intake.extract_body(email(SI_BODY))) == ["SI"]


def test_every_body_value_verifies_against_what_the_sender_wrote():
    for v in intake.extract_body(email(SI_BODY))["SI"].values():
        assert intake.verify(intake.Document("b", "text", text=SI_BODY, pages=[SI_BODY]), v.quote, v.raw)


def test_a_typed_container_label_is_read_in_a_body():
    """'Containers' is not an attachment synonym, but people type it."""
    body = "Port of loading: Port Klang\nContainers: 2 x 40 HC\nGross weight: 19,200 kg\n"
    v = intake.extract_body(email(body), "SI")["SI"]["container_count"]
    assert (v.raw, v.quote) == ("2 x 40 HC", "Containers: 2 x 40 HC")


def test_a_document_list_line_is_not_a_container_count():
    body = "POL: SINGAPORE\n3 Original BL + 3 N/N\n"
    assert intake.extract_body(email(body), "SI")["SI"]["container_count"].raw is None


def test_si_and_bl_sections_are_read_as_two_sides():
    body = ("Attachments bounced, details below.\n\nSI details:\nShipper: ACME LTD\nPOL: SINGAPORE\n"
            "POD: KARACHI\n\nDraft BL:\nShipper: ACME LIMITED\nPOL: SINGAPORE\nPOD: DUBAI\n")
    sides = intake.extract_body(email(body))
    assert sides["SI"]["port_of_discharge"].raw == "KARACHI"
    assert sides["BL"]["port_of_discharge"].raw == "DUBAI"


def test_values_from_a_quoted_reply_are_not_read():
    body = "Please send the draft BL.\n\n______\nFrom: x\nPOL: SINGAPORE\nPOD: KARACHI\nGROSS WT: 10 KG\n"
    assert intake.present_count(intake.extract_body(email(body))) == 0


# ---------- the pipeline ----------

def comparison(monkeypatch, category="BL_COMPARISON"):
    monkeypatch.setattr("app.pipeline.run.classify_email",
                        lambda e: {"category": category, "confidence": 0.9, "reason": "r"})


def test_chaser_is_ok_and_not_queued(monkeypatch, no_llm):
    comparison(monkeypatch)
    record = process_email(None, email(CHASER))
    assert record["status"] == "OK" and record["review_reason"] is None
    assert record["intake"]["kind"] == "awaiting_documents" and record["comparisons"] == []


def test_dropped_attachments_stay_missing_attachment(monkeypatch, no_llm):
    comparison(monkeypatch)
    record = process_email(None, email(DROPPED))
    assert (record["status"], record["review_reason"]) == ("NEEDS_REVIEW", "missing_attachment")


def test_details_in_body_are_compared_and_always_reviewed(monkeypatch, no_llm):
    comparison(monkeypatch)
    record = process_email(None, email(SI_BODY))
    assert (record["status"], record["review_reason"]) == ("NEEDS_REVIEW", "missing_attachment")
    assert record["intake"]["kind"] == "details_in_body"
    assert [c["field"] for c in record["comparisons"]] == list(FIELD_IDS)
    # only the SI is in the body, so the BL side is missing, not guessed
    assert all(c["bl_value"] is None and c["match"] is None for c in record["comparisons"])
    assert record["body_fields"]["SI"]["port_of_loading"]["value"] == "SINGAPORE"


def test_si_request_body_is_shown_but_verdict_unchanged(monkeypatch):
    comparison(monkeypatch, "SI_REQUEST")
    record = process_email(None, email(SI_BODY))
    assert record["status"] == "OK" and record["comparisons"] == []
    assert record["body_fields"]["SI"]["consignee"]["value"] == "AL GURG STATIONERY LLC"
    assert "intake" not in record


# ---------- the real bundle ----------

@needs_data
def test_bundle_no_attachment_comparisons_triage_without_the_model(no_llm):
    """94 BL_COMPARISON-shaped emails with no files: 91 chasers the gold marks
    OK, 3 dropped-attachment cases it marks missing_attachment."""
    kinds = {}
    for e in Storage(bucket="", data_dir=DATA).emails():
        body = e["body"]
        if e["attachments"] or not ("send the draft BL" in body or "attachments appear" in body):
            continue
        kinds[e["email_id"]] = intake.triage(e)["kind"]
    awaiting = [k for k in kinds.values() if k == "awaiting_documents"]
    missing = [k for k in kinds.values() if k == "attachments_missing"]
    assert (len(awaiting), len(missing)) == (91, 3)


@needs_data
def test_bundle_si_requests_give_all_seven_fields_from_the_body():
    counts = []
    for e in Storage(bucket="", data_dir=DATA).emails():
        if not e["attachments"] and "POL:" in e["body"] and "Shipper:" in e["body"]:
            counts.append(intake.present_count(intake.extract_body(e, "SI")))
    assert len(counts) == 125 and set(counts) == {7}

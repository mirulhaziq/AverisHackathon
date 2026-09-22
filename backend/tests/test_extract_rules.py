"""Adapted from feature/llm-extraction-fallback's tools/extract.py cmd_selftest -
every check pinned to a real document in the actual dataset, converted from a
print-and-count CLI into real pytest assertions."""
import os
import re
from pathlib import Path

import pytest

from app.cloud.storage import Storage
from app.pipeline.contracts import FIELD_IDS, ExtractionResult
from app.pipeline.documents import Document, read_attachment
from app.pipeline.extract_rules import (
    NEVER,
    extract_case,
    extract_document,
    is_placeholder,
    normalize,
    verify,
)

DATA = Path(os.environ.get("TEST_DATA_DIR", "data"))
needs_data = pytest.mark.skipif(not (DATA / "inbox").exists(), reason="no dataset at TEST_DATA_DIR/data")


@pytest.fixture(scope="module")
def storage():
    return Storage(bucket="", data_dir=DATA)


@pytest.fixture(scope="module")
def by_id(storage):
    return {e["email_id"]: e for e in storage.emails()}


# ---------- placeholders and label normalisation (no dataset needed) ----------

@pytest.mark.parametrize("blank", [
    "", "  ", "N/A", "NA", "TBA", "TBC", "____MT", "_______ MTS", "??? MTS", "-", "---", "n/a",
])
def test_every_corpus_placeholder_spelling_is_caught(blank):
    assert is_placeholder(blank)


@pytest.mark.parametrize("real", [
    "6 x 40'HC", "131,058 KG", "SINGAPORE", "UAB NOVAKOPA", "NHAVA SHEVA, INDIA", "0", "341715",
])
def test_real_values_survive_placeholder_check(real):
    assert not is_placeholder(real)


def test_cjk_annotation_is_stripped():
    assert normalize("Gross Weight毛重(KGS)") == "GROSS WEIGHT"


def test_parenthetical_unit_is_stripped():
    assert normalize("Gross Wt (kgs)") == "GROSS WT"


def test_slash_label_normalises():
    assert normalize("Notify Party/Intermediate Consignee") == "NOTIFY PARTY INTERMEDIATE CONSIGNEE"


def test_net_weight_is_not_a_gross_weight_label():
    assert normalize("NET WEIGHT") in NEVER


# ---------- email_004: the frozen fixture ----------

@needs_data
def test_email_004_extracts_all_fourteen_values(storage, by_id):
    r4 = extract_case(storage, by_id["email_004"])
    assert all(r4.si[f].raw and r4.bl[f].raw for f in FIELD_IDS)


@needs_data
def test_email_004_shipper_is_the_name_not_the_address(storage, by_id):
    r4 = extract_case(storage, by_id["email_004"])
    assert r4.si["shipper"].raw == "APRIL FAR EAST (M) SDN BHD"


@needs_data
def test_email_004_consignee_differs_between_si_and_bl(storage, by_id):
    r4 = extract_case(storage, by_id["email_004"])
    assert r4.si["consignee"].raw == "EAST BRIGHT FZ-LLC"
    assert r4.bl["consignee"].raw == "UAB NOVAKOPA"


@needs_data
def test_to_the_order_of_resolves_to_consignee(storage, by_id):
    r4 = extract_case(storage, by_id["email_004"])
    assert "Order of" in (r4.bl["consignee"].quote or "")


@needs_data
def test_email_004_weight_carries_its_unit(storage, by_id):
    r4 = extract_case(storage, by_id["email_004"])
    assert r4.si["gross_weight_kg"].unit == "KG"


# ---------- email_059: the weight-column trap ----------

@needs_data
@pytest.mark.parametrize("side", ["si", "bl"])
def test_email_059_takes_the_total_not_the_column(storage, by_id, side):
    r59 = extract_case(storage, by_id["email_059"])
    values = getattr(r59, side)
    assert values["gross_weight_kg"].raw == "131,322 KG"


@needs_data
@pytest.mark.parametrize("side", ["si", "bl"])
def test_email_059_container_count_is_stated_not_derived(storage, by_id, side):
    r59 = extract_case(storage, by_id["email_059"])
    values = getattr(r59, side)
    assert values["container_count"].raw == "6 x 40'HC"
    assert not values["container_count"].derived


@needs_data
def test_derived_container_count_from_distinct_numbers(storage):
    doc59 = read_attachment(storage, "attachments/email_059_SI.pdf")
    stripped = Document(
        path=doc59.path, method=doc59.method,
        text="\n".join(l for l in doc59.text.splitlines()
                       if not re.match(r"^\s*No\.? of Containers", l, re.I)),
    )
    stripped.pages = [stripped.text]
    derived = extract_document(stripped)["container_count"]
    assert derived.raw == "6"
    assert derived.derived
    assert derived.method == "rule"
    assert verify(stripped, derived.quote, derived.raw, derived=True)


# ---------- the adversarial placeholder family ----------

@needs_data
def test_516_gross_weight_na_is_placeholder_not_value(storage, by_id):
    r516 = extract_case(storage, by_id["email_516"])
    assert r516.si["gross_weight_kg"].raw is None
    assert r516.si["gross_weight_kg"].missing_reason == "placeholder"


@needs_data
def test_517_placeholders_and_real_value_coexist(storage, by_id):
    r517 = extract_case(storage, by_id["email_517"])
    assert r517.si["port_of_loading"].missing_reason == "placeholder"
    assert r517.si["port_of_discharge"].missing_reason == "placeholder"
    assert r517.si["gross_weight_kg"].raw == "340,770 KG"


@needs_data
def test_519_empty_fields_are_placeholders_not_absent(storage, by_id):
    r519 = extract_case(storage, by_id["email_519"])
    assert r519.si["shipper"].missing_reason == "placeholder"
    assert r519.si["container_count"].missing_reason == "placeholder"
    assert r519.bl["container_count"].raw == "3 x 20'FCL"


@needs_data
def test_520_placeholder_raises_missing_value_export_reason(storage, by_id):
    r520 = extract_case(storage, by_id["email_520"])
    assert r520.si["consignee"].missing_reason == "placeholder"
    assert r520.export_reason == "missing_value"


# ---------- wrong document type and unreadable ----------

@needs_data
def test_501_flags_the_non_bl_attachment(storage, by_id):
    r501 = extract_case(storage, by_id["email_501"])
    assert any(r.role == "OTHER" for r in r501.roles)
    assert r501.export_reason == "wrong_doc_type"


@needs_data
def test_511_corrupt_pdf_is_unreadable(storage, by_id):
    r511 = extract_case(storage, by_id["email_511"])
    assert any(r.role == "UNREADABLE" and r.unreadable_reason for r in r511.roles)
    assert r511.export_reason == "unreadable"


# ---------- the other formats ----------

@needs_data
def test_xlsx_address_after_pipe_is_not_part_of_name(storage, by_id):
    r005 = extract_case(storage, by_id["email_005"])
    assert r005.si["shipper"].raw == "ASIA PACIFIC PAPERBOARD TRADING PTE LTD"


@needs_data
def test_docx_cjk_annotated_label_resolves(storage, by_id):
    r097 = extract_case(storage, by_id["email_097"])
    assert r097.bl["port_of_loading"].raw == "SINGAPORE"


@needs_data
def test_docx_multiline_cell_yields_name_only(storage, by_id):
    r097 = extract_case(storage, by_id["email_097"])
    assert r097.bl["consignee"].raw == "ROXCEL TRADING GMBH"


# ---------- FR-EXT-08: same as consignee ----------

def test_same_as_consignee_resolves_within_document():
    synthetic = Document(path="x.txt", method="text", text=(
        "SHIPPING INSTRUCTION\nConsignee: ACME TRADING GMBH\n"
        "Notify Party: SAME AS CONSIGNEE\nPOL: SINGAPORE\n"))
    synthetic.pages = [synthetic.text]
    same = extract_document(synthetic)
    assert same["notify_party"].raw == "ACME TRADING GMBH"
    assert same["notify_party"].derived


# ---------- the verifier itself ----------

@needs_data
def test_verify_accepts_a_real_quote(storage):
    doc4 = read_attachment(storage, "attachments/email_004_SI.txt")
    assert verify(doc4, "Notify: EAST BRIGHT FZ-LLC", "EAST BRIGHT FZ-LLC")


@needs_data
def test_verify_accepts_whitespace_drift(storage):
    doc4 = read_attachment(storage, "attachments/email_004_SI.txt")
    assert verify(doc4, "Notify:   EAST  BRIGHT   FZ-LLC", "EAST BRIGHT FZ-LLC")


@needs_data
def test_verify_rejects_quote_not_in_document(storage):
    doc4 = read_attachment(storage, "attachments/email_004_SI.txt")
    assert not verify(doc4, "Notify: MAERSK LINE A/S", "MAERSK LINE A/S")


@needs_data
def test_verify_rejects_value_not_in_its_quote(storage):
    doc4 = read_attachment(storage, "attachments/email_004_SI.txt")
    assert not verify(doc4, "Notify: EAST BRIGHT FZ-LLC", "UAB NOVAKOPA")


def test_verify_rejects_missing_quote():
    doc = Document(path="x.txt", method="text", text="anything")
    assert not verify(doc, None, "anything")


# ---------- the contract's own invariants ----------

@needs_data
def test_every_result_carries_all_seven_fields_both_sides(storage, by_id):
    r4 = extract_case(storage, by_id["email_004"])
    assert set(r4.si) == set(FIELD_IDS)
    assert set(r4.bl) == set(FIELD_IDS)


@needs_data
def test_result_round_trips_through_the_contract(storage, by_id):
    r4 = extract_case(storage, by_id["email_004"])
    assert ExtractionResult.model_validate_json(r4.model_dump_json()).email_id == "email_004"

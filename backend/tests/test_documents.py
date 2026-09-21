import os
from pathlib import Path

import pytest

from app.cloud.storage import Storage
from app.pipeline.documents import Document, label_values, normalize_label, read_attachment

DATA = Path(os.environ.get("TEST_DATA_DIR", "data"))
needs_data = pytest.mark.skipif(not (DATA / "inbox").exists(), reason="no dataset at TEST_DATA_DIR/data")


# ---------- unit tests, no dataset required ----------
class FakeStorage:
    def __init__(self, files):
        self.files = files

    def read_bytes(self, path):
        if path not in self.files:
            raise FileNotFoundError(path)
        return self.files[path]


def test_txt_read():
    st = FakeStorage({"attachments/e1/SI.txt": b"Shipping Instruction\nShipper: ACME LTD\n"})
    doc = read_attachment(st, "attachments/e1/SI.txt")
    assert doc.method == "text"
    assert doc.role == "SI"
    assert doc.unreadable is None


def test_missing_file_is_unreadable():
    st = FakeStorage({})
    doc = read_attachment(st, "attachments/e1/missing.txt")
    assert doc.method == "none"
    assert doc.unreadable


def test_empty_file_is_unreadable():
    st = FakeStorage({"attachments/e1/blank.txt": b""})
    doc = read_attachment(st, "attachments/e1/blank.txt")
    assert doc.method == "none"
    assert "empty" in doc.unreadable


def test_unsupported_suffix():
    st = FakeStorage({"attachments/e1/x.zip": b"PK\x03\x04"})
    doc = read_attachment(st, "attachments/e1/x.zip")
    assert doc.method == "none"
    assert "unsupported" in doc.unreadable


@pytest.mark.parametrize("title,role", [
    ("SHIPPING INSTRUCTION", "SI"),
    ("S.I.", "SI"),
    ("BILL OF LADING INSTRUCTION", "SI"),   # INSTRUCTION wins even though it contains "BILL OF LADING"
    ("DRAFT BILL OF LADING", "BL"),
    ("BL", "BL"),
    ("PACKING LIST", None),                  # a real title, but neither SI nor BL
    ("INVOICE", None),
])
def test_role_from_title(title, role):
    doc = Document("attachments/e1/x.txt", "text", text=f"{title}\nrest of document\n")
    assert doc.role == role


def test_role_falls_back_to_filename_when_no_title():
    doc = Document("attachments/e1/booking_SI.txt", "text", text="")
    assert doc.role == "SI"
    doc = Document("attachments/e1/booking_BL.txt", "text", text="")
    assert doc.role == "BL"
    doc = Document("attachments/e1/booking.txt", "text", text="")
    assert doc.role is None


def test_normalize_label_strips_cjk_and_parens():
    # CJK annotation and a parenthetical unit collapse to the same label as the plain one.
    assert normalize_label("Gross Weight毛重(KGS)") == normalize_label("Gross Weight (kgs)")
    assert normalize_label("Gross Weight (kgs)") == "GROSS WEIGHT"
    # normalize_label does NOT do synonym mapping - "Wt" vs "Weight" stay distinct here;
    # synonym resolution happens via BARE_LABELS / the SDD's synonym dictionary, not here.
    assert normalize_label("Gross Wt (kgs)") == "GROSS WT"


def test_label_values_from_colon_lines():
    doc = Document("p", "text", text="Shipper: ACME LTD\nConsignee : GLOBAL CO\nnot a label line\n")
    pairs = label_values(doc)
    assert ("SHIPPER", "Shipper", "ACME LTD") in pairs
    assert ("CONSIGNEE", "Consignee", "GLOBAL CO") in pairs


def test_label_values_from_bare_labels():
    doc = Document("p", "text-layer", text="Shipper APRIL FINE PAPER TRADING\nPOL BUATAN, INDONESIA\n")
    pairs = label_values(doc)
    labels = {p[0] for p in pairs}
    assert "SHIPPER" in labels
    assert "POL" in labels


def test_label_values_from_table_rows():
    doc = Document("p", "docx", rows=[("Shipper", "ACME LTD"), ("", "orphan value")])
    pairs = label_values(doc)
    assert ("SHIPPER", "Shipper", "ACME LTD") in pairs
    assert len(pairs) == 1  # the row with an empty first cell is skipped


# ---------- against the real dataset, once it exists at backend/data ----------
@needs_data
def test_every_attachment_is_readable_or_marked_scan():
    st = Storage(bucket="", data_dir=DATA)
    unsupported = []
    for e in st.emails():
        for a in e.get("attachments", []):
            d = read_attachment(st, a)
            if d.method == "none":
                unsupported.append((a, d.unreadable))
    # Nothing should be silently dropped (FR-DOC-07): every failure has a reason.
    assert all(reason for _, reason in unsupported)


@needs_data
def test_si_and_bl_roles_found_in_sample_email():
    st = Storage(bucket="", data_dir=DATA)
    e = st.get("email_004")
    docs = [read_attachment(st, a) for a in e["attachments"]]
    roles = {d.role for d in docs}
    assert "SI" in roles or "BL" in roles

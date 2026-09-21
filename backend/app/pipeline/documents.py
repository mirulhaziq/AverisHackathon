"""Document reading for the SDOC pipeline: turns .txt / .pdf / .docx / .xlsx
attachments into text, tables and label/value pairs, and decides which
attachment is the SI and which is the BL (FR-DOC-01).

Pure stdlib + pdfplumber / python-docx / openpyxl. Reads bytes through
whatever object is handed in (`app.cloud.storage.Storage` in this app, or the
organizers' `loader.Inbox` directly) -- both expose `.read_bytes(path) -> bytes`,
so this module has no AWS dependency and no dependency on the organizers'
bundle layout. It runs the same locally and inside Lambda.

    from app.cloud.storage import get_storage
    from app.pipeline.documents import read_attachment

    storage = get_storage()
    doc = read_attachment(storage, email["attachments"][0])

Owner: pipeline (P3).
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

# Attachments whose text layer is below this many chars per page are scans.
TEXT_DENSITY_MIN = 100


class ByteReader(Protocol):
    """Anything with this method can be a source for read_attachment --
    app.cloud.storage.Storage and the organizers' loader.Inbox both qualify."""

    def read_bytes(self, path: str) -> bytes: ...


@dataclass
class Document:
    """One attachment, read into a common shape."""
    path: str
    method: str                       # text | text-layer | docx | xlsx | scan | none
    text: str = ""
    rows: list[tuple[str, ...]] = field(default_factory=list)   # docx/xlsx cells
    page_images: list[bytes] = field(default_factory=list)      # PNG, scans only
    unreadable: str | None = None     # reason when method == "none"

    @property
    def title(self) -> str:
        for line in self.text.splitlines():
            if line.strip():
                return line.strip()
        return ""

    @property
    def role(self) -> str | None:
        """SI or BL from content first, filename second (FR-DOC-01).

        None means the content names a document that is neither - a packing
        list, invoice or certificate - which is the wrong_doc_type case.
        """
        head = self.title.upper()
        squashed = re.sub(r"[^A-Z]", "", head)          # "S.I." -> "SI"
        # Check INSTRUCTION first: "BILL OF LADING INSTRUCTION" is an SI, and
        # it contains "BILL OF LADING" as a substring.
        if "INSTRUCTION" in head or squashed == "SI":
            return "SI"
        if "BILL OF LADING" in head or squashed in ("BL", "BLDRAFT", "DRAFTBL"):
            return "BL"
        if head:                      # a title we recognise as neither
            return None
        name = Path(self.path).stem.upper()
        return "SI" if name.endswith("_SI") else "BL" if name.endswith("_BL") else None


def _clean(s) -> str:
    return "" if s is None else str(s).strip()


def read_attachment(storage: ByteReader, path: str) -> Document:
    suffix = Path(path).suffix.lower()
    try:
        raw = storage.read_bytes(path)
    except Exception as exc:
        return Document(path, "none", unreadable=f"cannot read file: {exc}")

    if not raw:
        return Document(path, "none", unreadable="empty file")

    try:
        if suffix == ".txt":
            return Document(path, "text", text=raw.decode("utf-8", errors="replace"))
        if suffix == ".pdf":
            return _read_pdf(path, raw)
        if suffix == ".docx":
            return _read_docx(path, raw)
        if suffix == ".xlsx":
            return _read_xlsx(path, raw)
    except Exception as exc:
        return Document(path, "none", unreadable=f"{type(exc).__name__}: {exc}")

    return Document(path, "none", unreadable=f"unsupported type {suffix}")


def _read_pdf(path: str, raw: bytes) -> Document:
    import pdfplumber

    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        pages = [p.extract_text() or "" for p in pdf.pages]
        rows: list[tuple[str, ...]] = []
        for page in pdf.pages:
            for table in page.extract_tables() or []:
                rows.extend(tuple(_clean(c) for c in r) for r in table)
        text = "\n".join(pages)
        if len(text) >= TEXT_DENSITY_MIN * len(pdf.pages):
            return Document(path, "text-layer", text=text, rows=rows)
        images = [p.to_image(resolution=200).original for p in pdf.pages]

    buffers = []
    for img in images:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buffers.append(buf.getvalue())
    # No text layer: hand the page images to OCR (Textract) or a vision model.
    return Document(path, "scan", text=text, page_images=buffers)


def _read_docx(path: str, raw: bytes) -> Document:
    import docx

    doc = docx.Document(io.BytesIO(raw))
    lines = [p.text for p in doc.paragraphs if p.text.strip()]
    rows: list[tuple[str, ...]] = []
    for table in doc.tables:
        for row in table.rows:
            cells = tuple(_clean(c.text) for c in row.cells)
            rows.append(cells)
            lines.append(": ".join(c for c in cells if c))
    return Document(path, "docx", text="\n".join(lines), rows=rows)


def _read_xlsx(path: str, raw: bytes) -> Document:
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(raw), data_only=True)
    lines, rows = [], []
    for ws in wb.worksheets:
        lines.append(ws.title)        # sheet name is often "SI" / "BL"
        for row in ws.iter_rows(values_only=True):
            cells = tuple(_clean(c) for c in row)
            if any(cells):
                rows.append(cells)
                lines.append(": ".join(c for c in cells if c))
    return Document(path, "xlsx", text="\n".join(lines), rows=rows)


# --- label/value pairs -------------------------------------------------

CJK = re.compile(r"[　-鿿＀-￯]+")
LABEL_LINE = re.compile(r"^\s*([^:]{1,60}?)\s*:\s*(.*)$")

# Text-layer PDFs drop the colon: "Shipper APRIL FINE PAPER TRADING",
# "POL BUATAN, INDONESIA". Only these known labels may start such a line,
# longest first so "Port of Discharge" wins over "Port of".
BARE_LABELS = sorted(
    [
        "Shipper/Exporter", "Shipper", "Exporter", "Consignor", "Consignee",
        "Notify Party", "Notify", "Port of Loading (POL)", "Port of Loading",
        "Load Port", "POL", "Port of Discharge (POD)", "Port of Discharge",
        "Discharge Port", "POD", "Total Containers", "Container Count",
        "No. of Containers", "Gross Weight", "Gross Wt",
    ],
    key=len,
    reverse=True,
)
BARE_LINE = re.compile(
    r"^\s*(" + "|".join(re.escape(x) for x in BARE_LABELS) + r")\s+(\S.*)$",
    re.IGNORECASE,
)


def normalize_label(label: str) -> str:
    """Strip CJK annotations, parentheticals and punctuation so that
    'Gross Weight毛重(KGS)' and 'Gross Wt (kgs)' collapse together."""
    label = CJK.sub(" ", label)
    label = re.sub(r"[(\[].*?[)\]]", " ", label)
    squashed = re.sub(r"[^A-Z ]", " ", label.upper()).split()
    return " ".join(squashed)


def label_values(doc: Document) -> list[tuple[str, str, str]]:
    """Every (normalized_label, raw_label, value) pair in the document."""
    out = []
    for cells in doc.rows:                       # table-shaped documents
        non_empty = [c for c in cells if c]
        if len(non_empty) >= 2:
            out.append((normalize_label(non_empty[0]), non_empty[0], non_empty[1]))
    for line in doc.text.splitlines():           # line-shaped documents
        m = LABEL_LINE.match(line) or BARE_LINE.match(line)
        if m and m.group(2).strip():
            out.append((normalize_label(m.group(1)), m.group(1).strip(), m.group(2).strip()))
    return out


if __name__ == "__main__":
    import collections

    from app.cloud.storage import get_storage

    storage = get_storage()
    emails = storage.emails()
    methods, roles, bad = collections.Counter(), collections.Counter(), []
    for e in emails:
        for a in e["attachments"]:
            d = read_attachment(storage, a)
            methods[d.method] += 1
            roles[d.role] += 1
            if d.unreadable:
                bad.append((a, d.unreadable))
    print(f"{len(emails)} emails, {sum(methods.values())} attachments")
    print("read methods :", dict(methods))
    print("document role:", dict(roles))
    print("unreadable   :")
    for path, why in bad:
        print(f"   {path}: {why}")

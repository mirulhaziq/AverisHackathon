"""Adapted from feature/llm-extraction-fallback's tools/llm_extract.py
cmd_selftest - the whole fallback path against scripted answers, no
credentials or real Bedrock calls needed."""
import os
from pathlib import Path

import pytest

from app.cloud.storage import Storage
from app.pipeline.contracts import FieldValue
from app.pipeline.documents import read_attachment
from app.pipeline.extract_llm import (
    FIELD_IDS,
    INPUT_SCHEMA,
    LLM_CONFIDENCE,
    TOOL_CONFIG,
    TOOL_NAME,
    build_call,
    fill_gaps,
)
from app.pipeline.extract_rules import extract_document
from app.pipeline.llm_tools import Cache, Call, DeadBackend, ScriptedBackend

DATA = Path(os.environ.get("TEST_DATA_DIR", "data"))
needs_data = pytest.mark.skipif(not (DATA / "inbox").exists(), reason="no dataset at TEST_DATA_DIR/data")


@pytest.fixture
def storage():
    return Storage(bucket="", data_dir=DATA)


@pytest.fixture
def doc(storage):
    return read_attachment(storage, "attachments/email_004_SI.txt")


@pytest.fixture
def gapped(doc):
    full = extract_document(doc)
    out = dict(full)
    for fid in ("consignee", "port_of_discharge"):
        out[fid] = FieldValue(missing_reason="absent", confidence=0.0)
    return out


@pytest.fixture
def full(doc):
    return extract_document(doc)


def cache(tmp_path, name):
    return Cache(tmp_path / f"{name}.json")


# ---------- prompt hygiene ----------

@needs_data
def test_document_sits_inside_the_marked_block(doc):
    call = build_call(doc, ["consignee"])
    prompt = call.system + call.text()
    assert "<untrusted_document>" in prompt and "</untrusted_document>" in prompt


@needs_data
def test_only_the_missing_field_is_asked_for(doc):
    call = build_call(doc, ["consignee"])
    assert "consignee" in call.text() and "port_of_loading" not in call.text()


@needs_data
def test_tool_choice_is_forced_to_the_one_tool(doc):
    call = build_call(doc, ["consignee"])
    assert call.tool_name() == TOOL_NAME
    assert len(TOOL_CONFIG["tools"]) == 1


def test_schema_is_closed_and_covers_all_seven():
    assert INPUT_SCHEMA["additionalProperties"] is False
    assert set(INPUT_SCHEMA["properties"]) == set(FIELD_IDS)


@needs_data
def test_a_repair_is_a_different_cache_key(doc):
    call = build_call(doc, ["consignee"])
    assert build_call(doc, ["consignee"], repair="x").key() != call.key()


# ---------- fill_gaps behavior ----------

@needs_data
def test_a_verified_answer_fills_the_gap(doc, gapped, full, tmp_path):
    good = ScriptedBackend({"*": {
        "consignee": {"value": "EAST BRIGHT FZ-LLC",
                      "quote": "Consignee (Non-Negotiable): EAST BRIGHT FZ-LLC"},
        "port_of_discharge": {"value": "KARACHI, PAKISTAN (PKKHI)",
                              "quote": "POD: KARACHI, PAKISTAN (PKKHI)"},
    }})
    filled, stats = fill_gaps(doc, gapped, good, cache(tmp_path, "good"))
    assert filled["consignee"].raw == "EAST BRIGHT FZ-LLC"
    assert filled["consignee"].method == "llm"
    assert filled["consignee"].confidence == LLM_CONFIDENCE  # capped below rule confidence
    assert "EAST BRIGHT" in (filled["consignee"].quote or "")
    assert filled["shipper"].method == "rule" and filled["shipper"].raw == full["shipper"].raw


@needs_data
def test_a_fabricated_quote_is_refused_then_dropped(doc, gapped, tmp_path):
    liar = ScriptedBackend({"*": {
        "consignee": {"value": "MAERSK LINE A/S", "quote": "Consignee: MAERSK LINE A/S"},
        "port_of_discharge": None,
    }})
    filled, stats = fill_gaps(doc, gapped, liar, cache(tmp_path, "liar"))
    assert filled["consignee"].raw is None
    assert filled["consignee"].missing_reason == "unverified_quote"
    assert len(liar.calls) == 2  # one try, one repair, then dropped


@needs_data
def test_a_real_quote_with_invented_value_is_refused(doc, gapped, tmp_path):
    slippery = ScriptedBackend({"*": {
        "consignee": {"value": "UAB NOVAKOPA",
                      "quote": "Consignee (Non-Negotiable): EAST BRIGHT FZ-LLC"},
        "port_of_discharge": None,
    }})
    filled, _ = fill_gaps(doc, gapped, slippery, cache(tmp_path, "slip"))
    assert filled["consignee"].raw is None


@needs_data
def test_repair_retry_works_when_model_fixes_itself(doc, gapped, tmp_path):
    class Repairing:
        def __init__(self):
            self.n = 0

        def __call__(self, call: Call) -> dict:
            self.n += 1
            if self.n == 1:
                return {"consignee": {"value": "EAST BRIGHT FZ-LLC",
                                      "quote": "Consignee: EAST BRIGHT FZ-LLC"},
                        "port_of_discharge": None}
            return {"consignee": {"value": "EAST BRIGHT FZ-LLC",
                                  "quote": "Consignee (Non-Negotiable): EAST BRIGHT FZ-LLC"},
                    "port_of_discharge": None}

    filled, stats = fill_gaps(doc, gapped, Repairing(), cache(tmp_path, "repair"))
    assert filled["consignee"].raw == "EAST BRIGHT FZ-LLC"
    assert stats["repaired"] == 1


@needs_data
def test_null_and_placeholder_answers_stay_missing(doc, gapped, tmp_path):
    empty = ScriptedBackend({"*": {
        "consignee": None,
        "port_of_discharge": {"value": "N/A", "quote": "POD: N/A"},
    }})
    filled, stats = fill_gaps(doc, gapped, empty, cache(tmp_path, "empty"))
    assert filled["consignee"].raw is None
    assert filled["port_of_discharge"].raw is None
    assert stats["filled"] == 0


@needs_data
def test_a_placeholder_the_rules_already_decided_is_never_reasked(storage, tmp_path):
    doc516 = read_attachment(storage, "attachments/email_516_SI.txt")
    v516 = extract_document(doc516)
    assert v516["gross_weight_kg"].missing_reason == "placeholder"

    eager = ScriptedBackend({"*": {f: None for f in FIELD_IDS} | {
        "gross_weight_kg": {"value": "131,058 KG", "quote": "Gross Weight毛重(KGS): N/A"},
    }})
    after, stats = fill_gaps(doc516, v516, eager, cache(tmp_path, "516"))
    assert after["gross_weight_kg"].raw is None


@needs_data
def test_a_complete_document_makes_no_call(doc, full, tmp_path):
    untouched = ScriptedBackend({})
    same, stats = fill_gaps(doc, full, untouched, cache(tmp_path, "none"))
    assert stats["asked"] == 0
    assert not untouched.calls


@needs_data
def test_a_dead_backend_loses_the_gap_not_the_document(doc, gapped, full, tmp_path):
    filled, stats = fill_gaps(doc, gapped, DeadBackend(), cache(tmp_path, "dead"))
    assert filled["shipper"].raw == full["shipper"].raw
    assert "error" in stats
    assert filled["consignee"].raw is None  # a dead call does not invent values

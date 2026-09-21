"""Category dev set for the SDOC inbox, built by template cell rather than by sample.

The inbox is template-generated: 520 emails collapse into 23 instruction
templates and 25 (template x attachment-count) cells, with no singletons.
Labelling one cell therefore labels every email in it, and 25 decisions
cover the whole corpus - where 80 random labels would cover part of it.

    python tools/devset.py plan          # write tools/devset_cells.json
    <fill in the "category" field of each cell by hand>
    python tools/devset.py expand        # -> tools/devset_labels.json (520 ids)
    python tools/devset.py eval sub.json # stage-1 macro-F1 + confusion

WHAT THIS GIVES YOU AND WHAT IT DOES NOT
Cells carry *category*. That is Stage 1 (30% of the score) and the
BL_COMPARISON routing gate that gates the other 70%, so it is the expensive
half. Cells do NOT carry defect_fields: every comparison email has its own
planted defect, and no two share one. Those come from /submit, or from
reading the document pair.
"""
from __future__ import annotations

import collections
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUNDLE = HERE.parent / "sdoc-hackathon-bundle"
CELLS = HERE / "devset_cells.json"
LABELS = HERE / "devset_labels.json"

CATEGORIES = ["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY", "GENERAL", "SPAM"]

# Prepended by the mail gateway on 54 emails; it is boilerplate, not content,
# and it buries the instruction line it sits above.
BANNER = re.compile(
    r"warning[:,]?\s*this email originated outside.*?(?=\n\s*\n|$)", re.I | re.S
)
GREETING = re.compile(r"^(hi|hello|dear)\b", re.I)
SIGNOFF = re.compile(
    r"^(best regards|best,|regards|thank you|thanks|kind regards|br,|sincerely|warm regards)\b",
    re.I,
)


def instruction_lines(body: str) -> list[str]:
    """Body with the banner, greeting and signature block removed."""
    out = []
    for line in (x.strip() for x in BANNER.sub(" ", body).splitlines()):
        if not line:
            continue
        # Only a short line is a greeting. "Dear user, your mailbox has
        # exceeded its storage limit..." is spam content, not a salutation.
        if GREETING.match(line) and len(line) < 40 and len(line.split()) <= 5:
            continue
        if SIGNOFF.match(line):
            break
        out.append(line)
    return out


def template(body: str, width: int = 6) -> str:
    """The first `width` content words, with identifiers masked.

    Six words is what separates the templates without splitting one across
    the vessel or customer name that follows.
    """
    toks = []
    for tok in " ".join(instruction_lines(body)).split():
        core = re.sub(r"[^\w/().-]", "", tok)
        if any(c.isdigit() for c in core) and re.search(r"[A-Za-z]", core):
            toks.append("<REF>")
        elif core.replace(",", "").replace(".", "").isdigit():
            toks.append("<N>")
        else:
            word = re.sub(r"[^A-Za-z]", "", tok).lower()
            if word:
                toks.append(word)
    return " ".join(toks[:width])


def load_emails() -> list[dict]:
    paths = sorted((BUNDLE / "inbox").glob("email_*.json"))
    if not paths:
        sys.exit(f"no emails under {BUNDLE / 'inbox'}")
    return [json.loads(p.read_text(encoding="utf-8")) for p in paths]


def cell_key(email: dict) -> tuple[str, int]:
    return template(email["body"]), len(email["attachments"])


def doc_titles(email: dict) -> list[str]:
    """First non-blank line of each attachment, so a cell can be judged
    without opening files. Falls back to the filename for binaries."""
    try:
        from dataset import read_attachment  # noqa: PLC0415
        from loader import Inbox  # noqa: PLC0415
    except ImportError:
        return [Path(a).name for a in email["attachments"]]
    inbox = Inbox(str(BUNDLE))
    titles = []
    for path in email["attachments"]:
        doc = read_attachment(inbox, path)
        name = Path(path).name
        titles.append(f"{name}: {doc.unreadable or doc.title or '(no title line)'}")
    return titles


# --- suggestions ------------------------------------------------------
# A first pass so the reviewer confirms or overrides rather than typing 25
# categories from scratch. Deliberately crude - every disagreement between
# this and the human label is a case worth reading closely.

SPAM_MARKERS = (
    "congratulations", "you have won", "claim your", "buy now", "weird trick",
    "verify your account", "unpaid customs", "limited time offer",
    "bank officer", "business proposal", "bank details", "next of kin",
)

# Someone sent us two documents and wants them checked against each other.
# Note that the second document is not always really a BL - that is a review
# reason, not a different category.
COMPARISON_MARKERS = (
    "compare the si and draft bl", "attached are the si and draft bl",
    "attached si and draft bl", "check the draft bl against the si",
    "shipping instruction and the draft bill of lading",
    "find attached the si and the",
)


def suggest(body: str, n_att: int, sender: str) -> str:
    """A crude first pass so the reviewer confirms rather than types.

    Returns UNCERTAIN where the call is genuinely contested - those cells
    must be decided by reading, not by accepting a suggestion.
    """
    text = " ".join(instruction_lines(body)).lower()
    if any(w in text for w in SPAM_MARKERS):
        return "SPAM"

    # "Please assist to send the draft BL ... for checking" is us asking a
    # counterparty to send a BL, not them asking us to compare one. It reads
    # like a comparison request and is not obviously one. Decide by reading.
    if "assist to send the draft bl" in text:
        return "UNCERTAIN"

    if any(m in text for m in COMPARISON_MARKERS):
        return "BL_COMPARISON"
    if "find shipping instruction for" in text or "submit si" in text:
        return "SI_REQUEST"
    if "invoice" in text or "gr is still missing" in text:
        return "INVOICE_QUERY"
    return "GENERAL"


def cmd_plan() -> None:
    emails = load_emails()
    cells: dict[tuple[str, int], list[dict]] = collections.defaultdict(list)
    for e in emails:
        cells[cell_key(e)].append(e)

    rows = []
    for i, (key, members) in enumerate(
        sorted(cells.items(), key=lambda kv: -len(kv[1])), 1
    ):
        tmpl, n_att = key
        rep = members[0]
        spot = [m["email_id"] for m in members[1:4]]
        guess = suggest(rep["body"], n_att, rep["from"])
        rows.append({
            "cell_id": f"C{i:02d}",
            "n_emails": len(members),
            "template": tmpl,
            "attachments": n_att,
            "category": "",                      # <- you fill this in
            "suggested": guess,
            # Read these first: either the call is contested, or enough
            # emails ride on it that getting it wrong moves the score.
            "decide_first": guess == "UNCERTAIN" or len(members) >= 20,
            "note": "",
            "representative": rep["email_id"],
            "spot_check": spot,
            "sample": {
                "from": rep["from"],
                "subject": rep["subject"],
                "body": "\n".join(instruction_lines(rep["body"]))[:400],
                "attachment_titles": doc_titles(rep),
            },
            "members": [m["email_id"] for m in members],
        })

    CELLS.write_text(json.dumps(rows, indent=2), encoding="utf-8")
    covered = sum(r["n_emails"] for r in rows)
    print(f"{len(emails)} emails -> {len(rows)} cells -> {CELLS}")
    print(f"coverage if every cell is labelled: {covered}/{len(emails)}\n")
    for r in rows:
        mark = "!" if r["decide_first"] else " "
        print(f'{mark} {r["cell_id"]}  n={r["n_emails"]:3d}  att={r["attachments"]}  '
              f'[{r["suggested"]:<13}] {r["template"][:56]}')

    stake = sum(r["n_emails"] for r in rows if r["decide_first"])
    print(f'\n! = decide by reading first ({stake} emails ride on those cells)')
    print('Fill the "category" field of each cell, then: python tools/devset.py expand')
    print("Read the representative AND each spot_check id before accepting a cell -")
    print("a shared template does not guarantee a shared category.")


def cmd_expand() -> None:
    if not CELLS.exists():
        sys.exit(f"{CELLS} not found - run `plan` first")
    rows = json.loads(CELLS.read_text(encoding="utf-8"))

    blank = [r["cell_id"] for r in rows if not r["category"]]
    bad = [(r["cell_id"], r["category"]) for r in rows
           if r["category"] and r["category"] not in CATEGORIES]
    if bad:
        for cid, cat in bad:
            print(f"  {cid}: {cat!r} is not one of {CATEGORIES}")
        sys.exit("unknown category values - fix those cells")

    labels = {eid: r["category"] for r in rows if r["category"] for eid in r["members"]}
    LABELS.write_text(json.dumps(labels, indent=2, sort_keys=True), encoding="utf-8")

    total = sum(r["n_emails"] for r in rows)
    print(f"{len(labels)}/{total} emails labelled -> {LABELS}")
    print("by category:", dict(collections.Counter(labels.values())))
    if blank:
        print(f"\n{len(blank)} cells still blank: {', '.join(blank)}")
        missing = sum(r["n_emails"] for r in rows if not r["category"])
        print(f"that leaves {missing} emails unlabelled")


def prf(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    p = tp / (tp + fp) if (tp + fp) else 0.0
    r = tp / (tp + fn) if (tp + fn) else 0.0
    return p, r, (2 * p * r / (p + r) if (p + r) else 0.0)


def cmd_eval(path: str) -> None:
    """Stage-1 scoring against the dev labels, using the organizers' own math
    (scoring.py score_stage1) so a local number means what a /submit number
    means. A prediction missing from the submission defaults to GENERAL, as
    it does there."""
    if not LABELS.exists():
        sys.exit(f"{LABELS} not found - run `expand` first")
    truth = json.loads(LABELS.read_text(encoding="utf-8"))
    sub = json.loads(Path(path).read_text(encoding="utf-8"))

    per = {c: {"tp": 0, "fp": 0, "fn": 0} for c in CATEGORIES}
    confusion: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    misses: list[tuple[str, str, str]] = []
    correct = 0
    rule_hits = rule_total = 0

    for eid, actual in truth.items():
        entry = sub.get(eid, {})
        pred = entry.get("category", "GENERAL")
        confusion[actual][pred] += 1
        if pred == actual:
            correct += 1
            per[actual]["tp"] += 1
        else:
            per[actual]["fn"] += 1
            if pred in per:
                per[pred]["fp"] += 1
            misses.append((eid, actual, pred))
        if entry.get("decided_by") is not None:
            rule_total += 1
            rule_hits += entry["decided_by"] == "rule"

    n = len(truth)
    macro = sum(prf(**per[c])[2] for c in CATEGORIES) / len(CATEGORIES)
    print(f"n={n}  accuracy={correct / n:.3f}  macro-F1={macro:.3f}")
    if rule_total:
        print(f"resolved by rules: {rule_hits / rule_total:.0%}")

    print("\n  category         prec / rec  / f1    support")
    for c in CATEGORIES:
        p, r, f = prf(**per[c])
        support = per[c]["tp"] + per[c]["fn"]
        print(f"  {c:<15}  {p:.2f} / {r:.2f} / {f:.2f}   {support:4d}")

    print("\nconfusion (actual -> predicted, errors only)")
    for actual in CATEGORIES:
        for pred, k in sorted(confusion[actual].items(), key=lambda kv: -kv[1]):
            if pred != actual:
                print(f"  {actual:<15} -> {pred:<15} {k:4d}")

    if misses:
        print(f"\nfirst misclassified ids ({len(misses)} total)")
        for eid, actual, pred in misses[:15]:
            print(f"  {eid}  gold={actual:<15} pred={pred}")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "plan":
        cmd_plan()
    elif cmd == "expand":
        cmd_expand()
    elif cmd == "eval" and len(sys.argv) > 2:
        cmd_eval(sys.argv[2])
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    sys.path.insert(0, str(HERE))
    sys.path.insert(0, str(BUNDLE))
    main()

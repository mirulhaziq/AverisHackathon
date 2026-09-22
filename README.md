# Tidemark — Shipping Document Verification System (SDVS)

**Clear documents. Confident departures.**

Tidemark reads a shipping operations inbox, works out what each email is, and — for emails that carry a
Shipping Instruction (SI) and a Bill of Lading (BL) — extracts the key fields from both documents, compares them,
and flags every discrepancy with the evidence behind it. Anything the system can't read or can't trust goes to a
human reviewer instead of being guessed.

Built for the **Averis x Monash Hackathon 2026**.

| | |
|---|---|
| **Live app** | https://d2iqlar05ehorp.cloudfront.net |
| **Live API** | https://shvvk2hpodi2yucfujf4kmsada0ulgnx.lambda-url.ap-southeast-1.on.aws/health |
| **Docs** | [Requirements (SRS)](docs/SRS.md) · [Design (SDD)](docs/SDD.md) · [Build roadmap](docs/ROADMAP.md) · [Brand](BRAND.md) |

---

## What it does

1. **Classify** every email into `BL_COMPARISON`, `SI_REQUEST`, `INVOICE_QUERY`, `GENERAL` or `SPAM` (LLM).
2. **Read attachments** — PDF, Word, Excel and plain text — and decide which document is the SI and which is the BL
   from their *content*, not their filenames, so a mislabelled or wrong document is caught.
3. **Extract** seven fields from each: shipper, consignee, notify party, port of loading, port of discharge,
   container count and gross weight (kg). The LLM returns a fixed JSON schema, validated before use.
4. **Normalize and compare** with deterministic Python — casing, punctuation, labels, company suffixes and units
   are normalized first, so formatting differences don't become false alarms.
5. **Report** each email as `OK`, `MISMATCH` (with the defective fields and SI/BL evidence snippets side by side),
   or `NEEDS_REVIEW` (wrong document type, missing attachment, unreadable file, or missing value).
6. **Human review** — a reviewer confirms or overrides each questionable field in the web app; the case status is
   recomputed and the decision is stored with the reviewer's name and time.
7. **Failures are visible and retryable** — an LLM error puts the email in a failure queue with the step, error
   kind and a retryable flag; one click reprocesses it.

Current run on the full dataset: **520 emails processed, 0 failures** — 357 OK, 46 mismatches, 117 sent to review.

**Scored against the organizers' actual ground truth** (`score_cli.py`, not a guess): **0.9795 final score**
(98.7% classification accuracy, 100% defect recall, 97.8% end-to-end defect catch — 45/46 — 100% escalation
recall on all 20 gold review cases, field-level F1 0.980). This is real validation, not a self-reported estimate,
confirmed identically both offline and on the live deployed API.

## Where AI is used

| Step | How |
|---|---|
| Email classification | Amazon Bedrock (Amazon Nova Lite by default), returns category + confidence + reason |
| Field extraction | Rules first (corpus-derived synonyms, quote verification), Bedrock tool-use fallback only for fields the rules leave genuinely absent — never a placeholder the customer wrote on purpose |
| Comparison | **Not AI** — plain, unit-tested Python, so results are repeatable and explainable |

The LLM client (`backend/app/cloud/llm.py`) adds retries, timeouts, JSON-schema validation and an in-memory cache
of validated responses. Results are stored in DynamoDB, so `/process-all` skips emails that are already done
instead of re-spending credits.

## Architecture

```
            ┌──────────────────────────┐        ┌──────────────────────────────┐
 Browser ──▶│ CloudFront + S3          │        │ Amazon Bedrock (Nova Lite)   │
            │ React UI (Vite build)    │        │  classify · extract          │
            └────────────┬─────────────┘        └──────────────▲───────────────┘
                         │ HTTPS (JSON)                         │
                         ▼                                      │
            ┌──────────────────────────────────────────────────┴──┐
            │ AWS Lambda (container image) — FastAPI via Mangum   │
            │ Function URL · /health returns the deployed commit  │
            │ pipeline: classify → read → extract → normalize →   │
            │           compare → result record                   │
            └───────┬───────────────────────────────┬─────────────┘
                    ▼                               ▼
            ┌───────────────┐              ┌──────────────────────────────┐
            │ Amazon S3     │              │ Amazon DynamoDB              │
            │ emails +      │              │ results · review queue ·     │
            │ attachments   │              │ failure queue · resolutions  │
            └───────────────┘              └──────────────────────────────┘

 GitHub Actions (OIDC, no stored AWS keys):
   push backend/** → build image → ECR → update Lambda → smoke-test /health
   push src/**     → npm build → S3 sync → CloudFront invalidation
```

**Stack:** React 19 + TypeScript + Vite · Python 3.12, FastAPI, Mangum · AWS Lambda, S3, DynamoDB, Bedrock,
CloudFront, ECR · GitHub Actions with OIDC.

## Repository layout

```
backend/
  app/main.py            API endpoints
  app/pipeline/          classify, documents (readers), extract_rules + extract_llm (extraction, rules-first with
                        an LLM fallback), contracts (the extraction data model), llm_tools (Bedrock tool-use
                        client for the fallback), normalize, compare, run (orchestrator)
  app/cloud/             S3/local storage, DynamoDB results store, Bedrock LLM client
  tests/                 pytest suite (S3/DynamoDB mocked with moto)
src/
  api/                   typed API client + adapter from API shapes to UI types
  screens/               Dashboard, Inbox, Case detail, Review queue/task, …
  state/store.tsx        app state; loads live data from the API
docs/                    SRS, SDD, roadmap
.github/workflows/       deploy-backend.yml, deploy-ui.yml
```

## Run it locally

### Frontend (against the live API)

Requires Node 22+.

```bash
npm install
```

Create `.env.local` in the repo root (it is gitignored):

```bash
VITE_API_URL=https://shvvk2hpodi2yucfujf4kmsada0ulgnx.lambda-url.ap-southeast-1.on.aws
# Only needed for the write actions (save a review, retry a case):
VITE_DEMO_TOKEN=<ask the team>
```

```bash
npm run dev        # http://localhost:5173
```

Without `VITE_API_URL` the UI falls back to built-in sample data and shows a banner saying so. Without
`VITE_DEMO_TOKEN` everything is viewable but saving a review or retrying a case is refused by the server.

### Backend

Requires Python 3.12+.

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate            # Windows  (macOS/Linux: source .venv/bin/activate)
pip install -r requirements-dev.txt
python -m pytest -q               # S3 and DynamoDB are mocked; no AWS account needed
```

To serve the API locally against a local copy of the dataset (`DATA_DIR`, not included in this repo) you also
need AWS credentials with Bedrock and DynamoDB access:

```bash
pip install uvicorn
DATA_DIR=./data DDB_RESULTS_TABLE=<table> DEMO_TOKEN=<any-secret> uvicorn app.main:app --reload
```

Tests that need the real dataset are skipped automatically when it isn't present.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | – | Status, deployed commit SHA, region, storage mode |
| GET | `/emails`, `/emails/{id}` | – | Email list / one email with attachments |
| GET | `/results`, `/results/{id}` | – | All results (light) / one full result with comparisons and evidence |
| GET | `/review` | – | Cases waiting for a human |
| GET | `/failures` | – | Cases whose processing failed |
| GET | `/stats` | – | Counts by category and status |
| POST | `/process/{id}` | token | Run the pipeline for one email (spends LLM credits) |
| POST | `/process-all?limit=20` | token | Resumable batch — call repeatedly until `remaining` is 0 |
| POST | `/review/{id}/resolve` | token | Save a reviewer's per-field decisions |

Endpoints that spend money or change data need an `X-Demo-Token` header; read endpoints are open.

## Deployment

Pushing to `main` deploys automatically (see `.github/workflows/`). The workflows read these GitHub repository
**variables**: `AWS_ROLE_ARN`, `API_URL`, `UI_BUCKET`, `UI_DISTRIBUTION_ID`, `DEMO_TOKEN`.

## Known limitations

- **Sample-only screens.** Email imports, export history, settings and activity history have no backend yet; they
  run on example data and are labelled as such in the UI.
- **Evidence viewer shows text and the original file, not a pixel-highlighted page image.** Real cases render the
  actual attachment (text with the matching line highlighted, or the original PDF in an inline viewer) — there's
  no bounding-box overlay on a rendered page, since that needs OCR-derived coordinates (Textract, not built yet).
- **Case-level reviews** (wrong document type, missing attachment, unreadable) have no field to resolve against on
  the server, so acknowledging one is local to the browser.
- **Demo token in the UI bundle.** Accepted for the hackathon so judges can try review and retry; a production
  build would use per-user sign-in (the SDD plans Amazon Cognito) instead of a shared token.
- **No OCR yet.** Scanned PDFs are read from whatever text layer they have; Amazon Textract is designed in the SDD
  but not built.
- **No port alias table.** `SHANGHAI` vs `CNSHA` is not treated as the same port yet.

## Dataset

The organizers' dataset and answer key are **not** in this repository by design (`.gitignore` excludes `data/`,
`ground_truth.json` and scoring scripts). The deployed app reads the emails from a private S3 bucket.

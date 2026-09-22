# Build Roadmap

**System:** Shipping Document Verification System (SDVS)
**Track:** Cloud, ~39 hours total
**Owner:** P1 (infrastructure / backend)
**Related documents:** [Software Requirements Specification](./SRS.md) · [Software Design Description](./SDD.md)

This is the hour-by-hour delivery plan for the AWS backend, agreed by the team. It is more time-boxed and pragmatic than the SDD — the SDD describes the target design (Step Functions, Textract, Cognito, DynamoDB, CDK); this roadmap describes the order in which a small team actually builds toward it under a hard deadline, and where it's acceptable to cut scope.

---

## 1. Phases

| # | Phase | Hours | Deliverable | Gate |
|---|---|---|---|---|
| 0 | Account and safety | H0–1.5 | MFA, budget alert, deployer IAM user, CLI, region | `aws sts get-caller-identity` works |
| 1 | Deployed skeleton | H1.5–4 | FastAPI in a Lambda container image, Function URL, `/health` plus stub endpoints from the contract | **G1:** teammates can hit the public URL |
| 2 | CI/CD and repo hygiene | H3–5 | GitHub Actions with OIDC → ECR → Lambda; `.gitignore`, no secrets, no dataset, no answer key in the repo | Push to `main` redeploys |
| 3 | LLM access (start early, in parallel) | H4–6 | Bedrock model access confirmed in your region, one test call | **G2:** Bedrock or Gemini fallback decided by H6 |
| 4 | Storage | H5–8 | Private S3 bucket, dataset uploaded (never `ground_truth.json`), S3 reader with the same interface as `loader.py`, least-privilege Lambda role | Pipeline reads an email and attachment from S3 in the cloud |
| 5 | LLM client | H8–11 | One module: retries, timeouts, JSON validation hook, response caching, structured logs | P2's prompts run through it on the public URL |
| 6 | State | H10–14 | DynamoDB tables for results, review queue, and processing/retry state; resumable per-email batch processing | **G3: end-to-end demo on the public URL** |
| 7 | Advanced inputs | H14–20 | Textract for PDF tables and scans, wired into the review flow | Scanned PDF gives text or a review item, not a crash |
| 8 | Failure visibility | H20–26 | Failures and step logs exposed to P4's UI, a retry endpoint | A forced failure shows up and retries cleanly |
| 9 | Hardening | H26–32 | Cold-start test, rate-limit test, demo-protection on paid endpoints, logged-out and phone test | Public URL passes from a clean browser |
| 10 | Freeze and support | H32–39 | Infra frozen, architecture diagram plus service spec to P5, pre-warm before recording | Form submitted by about H37 |

> **G3 at H14 is the gate that must hold.** Everything before it (Phases 0–6) is the minimum for a credible end-to-end demo. Phases 7–10 add robustness and polish and can flex if time runs short.

---

## 2. Design decisions to lock in early

- **Batch processing must be resumable.** Don't process hundreds of emails in one request. Loop per email, write each result to DynamoDB, and let a retry pick up where it stopped.
- **Show the deployed version.** `/health` returns the Git commit SHA, which proves the running app matches the repo.
- **Protect paid endpoints.** A public Function URL that triggers Bedrock calls can be hit by anyone. Read endpoints and cached demo results stay open. `/process` and `/process-all` need a demo token, plus caching so judges can't drain the team's credits.

## 3. What P1 needs from the team

| By | From | What |
|---|---|---|
| H3 | Team | The API contract signed off |
| H8 | P3 | The reader interface, so the S3 source can be swapped in |
| H10 | P2 | Extraction prompts and JSON schema |
| H20 | P4 | The working review flow, to design failure visibility against |
| H32 | P1 → P5 | Architecture diagram |

## 4. Risks and how the roadmap handles them

| Risk | Handling |
|---|---|
| Card or billing problem | Answered in Phase 0, before anything else |
| Bedrock access, quota, or cost | Phase 3 runs early and in parallel, with a Gemini fallback behind the same client |
| Low Lambda concurrency on a new account | New accounts may start with a low limit, which can block setting reserved concurrency — unverified, check Service Quotas in Phase 0 |
| Textract not available in the region | Verify in Phase 3. If missing, scans go to the review queue only |
| URL down during judging | Nothing gets torn down after submission until results are out |
| Cost runaway | Budget alert, response caching, protected endpoints |

## 5. Where each phase scores

Mapped to the hackathon's judging criteria (see [Rules & Regulations](<../Averis x Monash Hackathon Rules and Regulations.pdf>)):

- **Working Core Prototype (25 pts):** Phases 1, 6, and 9.
- **System Design (15 pts) and Technology Integration (15 pts):** Phases 4–7 plus the architecture diagram. The deck should name every service and its job.
- **Feasibility and Validation (15 pts):** Phases 8–9 plus the `/submit` score log from P3.

---

## 6. Current status

*Last checked against the repo and the live API on 22 September 2026 (backend commit `0e3ed0c`, UI commit `f575127`).*

| Phase | Status | Evidence |
|---|---|---|
| 0 — Account and safety | ✅ Done | OIDC deployer role in use by both workflows. A second, more tightly scoped IAM user (`teammate-dev`) is in use for day-to-day AWS CLI access, confirming least-privilege access is actually enforced, not just planned. |
| 1 — Deployed skeleton | ✅ Done | FastAPI on Lambda behind a Function URL; `/health` returns the deployed commit, region and storage mode. |
| 2 — CI/CD and repo hygiene | ✅ Done | `deploy-backend.yml` (ECR → Lambda → smoke test) and `deploy-ui.yml` (S3 → CloudFront). Dataset, answer key and scoring scripts are gitignored — including the organizers' full docker/scoring kit (`sdoc-hackathon-docker/`, which carries the real `ground_truth.json`), added to `.gitignore` the same day it arrived. |
| 3 — LLM access | ✅ Done | Amazon Bedrock (Nova Lite by default, configurable per task); `/llm/ping` proves access from the deployed app. |
| 4 — Storage | ✅ Done | Dataset in a private S3 bucket; `backend/app/cloud/storage.py` reads S3 in the cloud and a local folder in dev. |
| 5 — LLM client | ✅ Done | `backend/app/cloud/llm.py`: retries, timeouts, JSON-schema validation, typed `LLMError` with a retryable flag, in-memory cache. |
| 6 — State | ✅ Done — **G3 met** | DynamoDB results store with review and failure queues; `/process-all` is resumable per email. All 520 emails processed on the public URL (357 OK, 46 mismatch, 117 review, 0 failed). |
| 7 — Advanced inputs | 🟡 Partial | PDF text layers, Word and Excel are read directly, and unreadable files go to review. No Textract OCR for scans yet. Real attachment text/original-file rendering is live in the review UI (`LiveDocument.tsx`), including line-level evidence highlighting and an inline PDF viewer. |
| 8 — Failure visibility | ✅ Done | `/failures` exposes step, error kind and retryable flag; the UI's Retry calls `/process/{id}`. |
| 9 — Hardening | 🟡 Partial | Demo token guards every paid or write endpoint (fails closed if unset). No rate limiting; cold-start and phone tests not recorded. |
| 10 — Freeze and support | 🟡 In progress | README with architecture diagram, live app URL and API table added. Deck and demo video outstanding. |

### Validated against the real ground truth (not a self-estimate)

The organizers' full docker/scoring kit (`sdoc-hackathon-docker/`) arrived mid-build and includes `score_cli.py` plus
the actual `ground_truth.json` — both gitignored immediately, never committed. Running the real submission through it:

| Metric | Score |
|---|---|
| **Final score** | **0.9795** |
| Stage 1 classification accuracy / macro-F1 | 98.7% / 98.2% |
| Stage 3 defect recall / precision | 100% / 95.8% |
| Field-level F1 / exact-match rate | 98.0% / 98.5% |
| **End-to-end (headline metric)** | **97.8%** (45/46 defect emails caught fully end to end) |
| Escalation recall (gold `NEEDS_REVIEW` cases caught) | **100%** (20/20) |
| `wrong_doc_type` / `unreadable` / `missing_attachment` / `missing_value` caught | 5/5 each |

This is the evidence the "Feasibility and Validation" judging criterion asks for, and it moved twice, each time
from a real bug found by scoring against ground truth rather than by inspection:

1. **0.9492 → 0.9537**: `_assign_roles` originally trusted the `_SI`/`_BL` filename suffix rather than reading the
   content, missing all 5 `wrong_doc_type` gold cases (a file literally named `..._BL.txt` was a commercial
   invoice); the classifier separately read "the real BL isn't attached" as "this isn't a comparison request,"
   misclassifying the same 5 cases as `GENERAL` before they ever reached document-role logic.
2. **0.9537 → 0.9795**: integrated the corpus-derived rules engine and LLM extraction fallback from
   `feature/llm-extraction-fallback` (see below) — the better rules alone (preference-ranked labels, placeholder
   detection, same-as-consignee resolution) closed the remaining escalation gap; on this dataset the LLM fallback
   itself makes zero calls, since every gap the better rules still leave is a legitimate placeholder or an
   unreadable/wrong-type document a text prompt can't help with anyway. Confirmed identically offline and on the
   redeployed live API — 520/520 processed, 0 failures, same score both times.

   The fallback making zero calls proves it isn't *needed* on this dataset, not that it *works* - that gap was
   closed separately: a real Bedrock call was forced through the exact fallback path (`build_call` +
   `BedrockBackend`, not the scripted-mock tests) against `email_004`, asking for `consignee` and
   `gross_weight_kg` as if the rules hadn't found them. The model (`apac.amazon.nova-lite-v1:0`) returned both
   correctly, with quotes that passed verification - the tool-use call, schema and quote-checking gate are
   confirmed working against real Bedrock, not only against `ScriptedBackend`.

### Feature branch merged: `feature/llm-extraction-fallback`

Previously tracked here as unmerged. It carried a complete parallel extraction design (`tools/contracts.py`,
`tools/extract.py`, `tools/llm_extract.py`, `tools/llm.py`) built independently of `backend/app/pipeline/`.
Reconciling the two meant keeping `documents.py` as-is (it already had fixes — content-based role assignment,
"To the Order of" consignee — that the branch's own `tools/dataset.py` lacked) while adopting the branch's more
corpus-validated rules engine and its LLM fallback, landing as `contracts.py`, `extract_rules.py`, `extract_llm.py`
and `llm_tools.py`. The branch's own selftest suites (every check pinned to a real document, not a synthetic
fixture) were ported into 63 real pytest tests rather than left as a CLI command.

### Remaining gaps

- **UI screens on sample data:** email imports, export history, settings and activity history have no backend endpoints; they are labelled as sample data in the UI.
- **Case-level reviews** (wrong document type, missing attachment, unreadable) cannot be resolved on the server yet — only per-field reviews are.
- **Normalization:** no port alias table (e.g. `CNSHA` vs `SHANGHAI`) and no number-word parsing.
- **Security:** the demo token is baked into the public UI bundle, an accepted hackathon tradeoff. Production would use Cognito sign-in as the SDD describes.

---

*SDVS Build Roadmap, status current as of 22 September 2026.*

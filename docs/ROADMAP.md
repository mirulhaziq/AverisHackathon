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

*Last checked against the repo at commit `e52b8da` (branch `main`).*

| Phase | Status | Evidence |
|---|---|---|
| 0 — Account and safety | ✅ Assumed done | OIDC role-assumption is wired into CI, implying a deployer role exists. Not independently verifiable from the repo — confirm MFA, budget alert, and `aws sts get-caller-identity` directly with whoever holds the account. |
| 1 — Deployed skeleton | ✅ Done | [`backend/app/main.py`](../backend/app/main.py) is a FastAPI app wrapped with Mangum for Lambda. `/health` returns `status`, `commit` (`GIT_SHA` env var), and `region` — satisfies the "show the deployed version" decision. Stub endpoints `/emails`, `/process/{email_id}`, `/results` exist matching the shape of the eventual contract, but all return empty/fake data. |
| 2 — CI/CD and repo hygiene | ✅ Done | [`.github/workflows/deploy-backend.yml`](../.github/workflows/deploy-backend.yml) does OIDC → ECR → Lambda on push to `backend/**`, with a `/health` smoke test after deploy. Root and backend `.gitignore` both exclude `.env`, `data/`, `ground_truth.json`, `score*.py`, and `*.zip` — dataset and answer key are correctly kept out of the repo. |
| 3 — LLM access | ❌ Not started | No Bedrock or Gemini client code anywhere in the repo. This is the next gate (G2) and it's already overdue relative to the H4–6 window if the 39-hour clock started at "first commit." |
| 4 — Storage | ❌ Not started | No S3 bucket provisioning, no reader module. `/emails` just returns `{"emails": [], "note": "stub"}` — nothing reads from S3 yet. |
| 5 — LLM client | ❌ Not started | No retry/timeout/validation/caching module. Depends on Phase 3. |
| 6 — State | ❌ Not started | No DynamoDB tables, no resumable batch loop. `/process/{email_id}` returns a hardcoded stub record and writes nothing. **This is the G3 gate — the one that must hold — and it hasn't been started.** |
| 7 — Advanced inputs | ❌ Not started | No Textract integration. |
| 8 — Failure visibility | ❌ Not started | No retry endpoint, no failure/step logs exposed. (Frontend already has the UI shape for this — see `src/screens/CaseDetail.tsx` and the `TimelineStep`/`failure` fields in `src/types.ts` — but it's fed by seed data, not the real backend.) |
| 9 — Hardening | ❌ Not started | No demo token / auth on `/process`, no rate limiting, no cold-start or phone testing evidence. |
| 10 — Freeze and support | ❌ Not started | No architecture diagram delivered yet — the SDD's Figure 1 can serve as a starting point once the real build settles. |

### Bottom line

**The team is currently sitting between Phase 2 and Phase 3.** Phases 0–2 (account safety, deployed skeleton, CI/CD hygiene) are solid. Everything from Phase 3 onward — LLM access, storage, LLM client, state, advanced inputs, failure visibility, hardening — is unstarted. Given the hackathon submission window closes **22 Sept 2026, 12:00 p.m.** (see [Rules & Regulations](<../Averis x Monash Hackathon Rules and Regulations.pdf>)), and today is 21 Sept, there is realistically not enough runway left to complete Phases 3–10 as scoped in the SDD's full serverless architecture (Step Functions, Textract, Cognito, 6 DynamoDB tables).

**Recommended immediate next step:** collapse Phases 3–6 into the smallest possible slice that still clears G3 — one real Bedrock (or Gemini) call, reading one file from S3, writing one result to a single DynamoDB table, exposed through the existing `/process/{email_id}` endpoint — and treat Phases 7–10 as roadmap items to describe in the deck rather than fully build. This keeps the "Working Core Prototype" and "Technology Integration" scoring categories credible without chasing scope that can't land in time.

---

*SDVS Build Roadmap, status current as of 21 September 2026.*

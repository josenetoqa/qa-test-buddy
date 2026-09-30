# Local API contract

Loopback-only, same-origin JSON. Bodies are bounded to 256 KB. Errors use `{error: message}` with 400 validation, 409 stale/conflicting state, 404 missing/expired records, and 503 storage/readiness errors as applicable. Static serving is allowlisted; private storage is never a static route.

## Generation and readiness

`GET /api/capabilities?refresh=1` returns CLI availability and actual Playwright package/browser-launch readiness with actionable reasons. Cypress remains unavailable.

`POST /api/generate` accepts `{requirements,format:'plain'|'bdd',frameworks:['playwright'],targetUrl,provider:'codex'|'claude'}`. Frameworks can be empty for manual-only cases. At most two concurrent generations; requirements at most 20,000 characters; 120-second provider deadline; combined output at most 128 KB. Model source is never executed. Each case requires its own explicit automation mapping.

`POST /api/demo` or `/api/demo/suites` creates a deterministic three-case suite targeting `/demo/`, with pass/intentional-fail/pass mappings. No AI call.

## Canonical suites

Suites have `{schemaVersion:2,suiteId,revision,provider,targetUrl,createdAt,generationInput,cases}`. `generationInput` preserves the bounded original `{requirements,format,frameworks}` across review, edits, persistence, and restart. Cases have immutable `caseId`, `displayId`, manual fields, and `automation.playwright:{status,reason,operations,reviewedAt?,verification?,code?}`. Status is draft, ready, blocked, or manual-only. IDs/source are server-created; missing mappings cannot borrow another case's operations.

`GET /api/suites/:id?revision=N` reads a canonical revision (current when omitted).

`PATCH /api/suites/:id/review` accepts `{expectedRevision,caseIds,reviewed:true}` and creates the next immutable revision. Blocked/manual-only and known ambiguous mappings cannot be reviewed.

`PATCH /api/suites/:id/cases/:caseId` accepts `{expectedRevision,automationEdit:{operations}}`. Edits create a revision and invalidate changed-case review/verification. Operations include navigation, legacy clickText/fillLabel/expectText, structured click/fill/expectVisible/expectTextExact/expectValue/expectCount/expectURL. Locators are `{kind:'role'|'label'|'text'|'testId',value,role?,exact:true}`. Unknown/executable fields, raw selectors, and cross-origin navigation are rejected.

`POST /api/suites/:id/cases/:caseId/verify` accepts `{revision}`. Returns `{suite,checkedAt,results}`; bounded read-only Chromium checks report counts/visibility/ambiguity and later-state limits without clicks or fills. Verification does not establish business correctness.

`GET /api/suites/:id/export?revision=N&caseId=ID` exports canonical Playwright source. Omit caseId for all supported cases; each is an independent test.

## Server-owned runs

`POST /api/runs` accepts `{schemaVersion:2,suiteId,revision,selectedCaseIds,framework:'playwright',idempotencyKey,mode:'headless'|'headed',slowMo?,recordVideo?,authProfileId?}`. Select 1–8 distinct ready cases. Identical idempotency key/body returns the same run; a changed body returns 409. At most two active/queued batches. Client operations/source/paths cannot execute. Legacy single-case identifiers are converted to a one-case batch.

Response 202 contains a run with `runId`, suite/revision identity, selected case IDs, queued/running/terminal status, timestamps, `cases`, `lastEventSeq`, summary/output and optional evidence warning. Terminal states include passed, failed, error, canceled. Skipped/missing/incomplete reporter cases cannot pass. Each case has actual step/result fields and manifest artifact references. Selected cases execute sequentially in isolated processes/contexts; failures do not stop later cases.

`GET /api/runs/:id` returns the current or hydrated snapshot.

`POST /api/runs/:id/cancel` waits for active child closure before returning the terminal snapshot.

`GET /api/runs/:id/events?afterSeq=N` returns `{events,lastEventSeq,truncated,snapshotRequired}`. Events have bounded sequence/payloads; use a snapshot when replay is incomplete. Cap 5,000 events and 4 KB payload per event.

`GET /api/runs/:id/artifacts/:artifactId` serves only opaque manifest-owned files contained by realpath within that run. Cross-run IDs, path traversal, symlink escape, missing and expired files receive 404. Failure screenshots/traces and optional video are actual captured artifacts; trace downloads are ZIP files.

## History and exports

`GET /api/runs?limit=20&cursor=...` lists retained runs with pagination. `GET /api/runs/:id/export?format=json|markdown` exports a redacted report plus exact suite revision. Evidence references remain local; exports omit auth state/profile identifiers.

Private snapshots are atomically persisted and hydrated on restart. Interrupted jobs become errors and are never restarted. Retention excludes active runs. Target bounds: 100 completed runs/seven days/50 MB per run/500 MB total. Referenced suite revisions survive suite eviction. Expired files are archived by rename because irreversible cleanup was rejected by automatic approval review. Archived bytes remain counted; disk reclamation requires explicit authorization. Expired evidence is labeled accurately without removing verdicts.

## Local auth profiles

`GET /api/auth/profiles` lists public metadata. `POST /api/auth/profiles` accepts `{label,origin}`. `POST /api/auth/profiles/:id/capture` opens a controlled headed login window; the user signs in. `POST /api/auth/profiles/:id/complete` explicitly captures state. `DELETE /api/auth/profiles/:id` closes capture and removes private local profile state. Capture expires after five minutes. Unknown/expired/wrong-origin profiles are rejected. Login redirects must stay within configured profile origins. State is private (0700 directories/0600 files) and excluded from static routes, generation, and exports. Evidence/test data may contain account content; deletion does not revoke remote sessions.

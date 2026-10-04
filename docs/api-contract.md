# Local API contract

Loopback-only, same-origin JSON. Bodies are bounded to 256 KB. Errors use `{error: message}` with 400 validation, 409 stale/conflicting state, 404 missing/expired records, and 503 storage/readiness errors as applicable. Static serving is allowlisted; private storage is never a static route.

## Generation and readiness

`GET /api/capabilities?refresh=1` returns CLI availability and actual Playwright package/browser-launch readiness with actionable reasons. Playwright is the only automation option in the UI; Cypress remains unavailable in the capability response.

`POST /api/generate` accepts `{requirements,format:'plain'|'bdd',frameworks:['playwright'],targetUrl,provider:'codex'|'claude'}`. Frameworks can be empty for manual-only cases. At most two concurrent generations; requirements at most 20,000 characters; 300-second provider deadline; combined output at most 128 KB. The UI always sends `format:'plain'`; the API retains BDD compatibility for existing clients. Model source is never executed. Each case requires its own explicit automation mapping.

With Playwright selected, generation first inspects the initial page in a fresh Chromium context. The bounded metadata includes visible labels, placeholders, control types, and zero-based form scopes; input values, cookies, and login tokens are not collected. No clicks/fills occur. Cross-origin navigation is blocked; inaccessible pages return 422. Page inspection is separate from the CLI deadline.

Codex runs ephemerally in a temporary directory with `--ignore-user-config`, read-only sandboxing, and instructions to return QA JSON without tools or skill workflows. Top-level model/reasoning/OpenAI-provider strings are retained; unrelated MCP/plugin/hook configuration is excluded. Custom providers are rejected explicitly rather than switched silently. Timeout failures return 502 with a five-minute explanation; temporary generation directories are cleaned afterward.

`POST /api/demo` or `/api/demo/suites` creates a deterministic three-case suite targeting `/demo/`, with pass/intentional-fail/pass mappings. No AI call.

## Canonical suites

Suites have `{schemaVersion:2,suiteId,revision,provider,targetUrl,createdAt,generationInput,cases}`. `generationInput` preserves the bounded original `{requirements,format,frameworks}` across review, edits, persistence, and restart. Cases have immutable `caseId`, `displayId`, manual fields, and `automation.playwright:{status,reason,operations,reviewedAt?,verification?,code?}`. Status is draft, ready, blocked, or manual-only. IDs/source are server-created; missing mappings cannot borrow another case's operations.

`GET /api/suites/:id?revision=N` reads a canonical revision (current when omitted).

`PATCH /api/suites/:id/review` accepts `{expectedRevision,caseIds,reviewed:true}` and creates the next immutable revision. Blocked/manual-only and known ambiguous mappings cannot be reviewed.

`PATCH /api/suites/:id/cases/:caseId` accepts `{expectedRevision,automationEdit:{operations}}`. Edits create a revision and invalidate changed-case review/verification. Operations include navigation, legacy clickText/fillLabel/expectText, structured click/fill/expectVisible/expectTextExact/expectValue/expectCount/expectURL. Locators are `{kind:'role'|'label'|'text'|'testId'|'placeholder',value,role?,exact:true,formIndex?}`. `formIndex` is a zero-based integer from 0 through 100 and scopes the locator to that form; it prevents repeated login/registration placeholders from matching the wrong input. Unknown/executable fields, raw selectors, and cross-origin navigation are rejected.

`POST /api/suites/:id/cases/:caseId/verify` accepts `{revision}`. Returns `{suite,checkedAt,results}`; bounded read-only Chromium checks report counts/visibility/ambiguity and later-state limits without clicks or fills. Absent/hidden locators after a planned interaction are marked `deferred`; the probe never executes those interactions. Cases without actions return 409. Verification does not establish business correctness.

`GET /api/suites/:id/export?revision=N&format=text|playwright&caseId=ID` downloads the exact saved revision. `format=text` exports all manual cases with numbered steps as UTF-8 `.txt`; `format=playwright` (the default) exports canonical Playwright `.spec.cjs` source. Omit caseId for all runnable mappings, or provide it for one test; each remains an independent test. No runnable mappings returns 409, an unknown case returns 404, and an unsupported format returns 400.

## Server-owned runs

`POST /api/runs` accepts `{schemaVersion:2,suiteId,revision,selectedCaseIds,framework:'playwright',idempotencyKey,mode:'headless'|'headed',slowMo?,recordVideo?,authProfileId?}`. Select 1–8 distinct ready cases. The UI Run action first reviews selected draft cases through the review endpoint, then starts execution using the resulting revision; backend review checks remain mandatory. Identical idempotency key/body returns the same run; a changed body returns 409. At most two active/queued batches. Client operations/source/paths cannot execute. Legacy single-case identifiers are converted to a one-case batch.

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

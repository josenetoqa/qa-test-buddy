# Local API contract

Loopback-only, same-origin JSON. Bodies are bounded to 256 KB. Errors use `{error: message}` with 400 validation, 409 stale/conflicting state, 404 missing/expired records, and 503 storage/readiness errors as applicable. Static serving is allowlisted; private storage is never a static route.

## Generation and readiness

`GET /api/capabilities?refresh=1` returns CLI availability and actual Playwright package/browser-launch readiness with actionable reasons. Playwright is the only automation option in the UI; Cypress remains unavailable in the capability response.

`POST /api/generate` remains synchronous and returns a decorated suite. It accepts `{requirements,format:'plain'|'bdd',frameworks:['playwright'],targetUrl,provider:'codex'|'claude',context?,pageStateIds?,refreshInspection?}`. Frameworks can be empty for manual cases. Optional context fields are `acceptanceCriteria`, `userRole`, `preconditions`, `testData`, `businessRules` (each a string up to 4,000 characters). Criteria use one nonempty line per requirement, capped at 40; IDs are R1, R2, etc. Without criteria, the full requirements text is R1. Requirements are capped at 20,000 characters. Cases must reference catalog IDs, contain nonempty expected results and 1–24 nonempty steps, and provide each requested framework mapping. A suite contains 1–8 cases and at most 12 operations per runnable case.

`POST /api/generations` accepts the same input and returns 202 `{generationId,status:'running',stage,metrics,createdAt}`. `GET /api/generations/:id` returns progress and terminal `suite` or `error`. Stages are queued, inspection, generating, validating, repairing, saving, completed/failed/canceled. `POST /api/generations/:id/cancel` signals cancellation; no late output is saved. The concurrency slot stays reserved until work settles. At most two jobs run concurrently (429 otherwise); the newest 100 jobs stay in memory. A server restart loses jobs, and reads return 404. The UI clears missing jobs so generation can be restarted. Capabilities includes `generationJobs:true`.

For selected regeneration, submit `{provider,regenerate:{suiteId,expectedRevision,caseIds},refreshInspection?}`. Saved inputs are authoritative. Both admission and final replacement check the expected revision. Exactly the selected IDs are replaced in a new immutable revision; other cases retain their content, identity, and review status. Changed mappings become drafts. A changed expected outcome, incomplete replacement, or save failure preserves the old revision.

Initial inspection uses a fresh anonymous Chromium context, with no clicks or fills. Exact-URL results are cached for five minutes (20 entries); `refreshInspection:true` bypasses the cache. Bounded metadata includes labels, placeholders, control types, form scope, required/disabled state and input constraints, not values/cookies/storage. Controls are ranked for relevance before inclusion; truncation is disclosed in prompt metadata. Inspection failure allows manual generation; without observed initial or captured controls, automation is blocked. The total five-minute job budget includes inspection and a maximum of one targeted repair. Valid cases survive partial repair, and known expected outcomes cannot be weakened by repair. Invalid manual cases may be omitted with warnings; valid manual cases with invalid operations remain blocked. Extra response-envelope metadata is ignored without discarding original cases.

Generation metadata is `{requirements:[{id,text}],quality:{coverage:[{requirementId,text,caseIds}],uncovered,duplicateGroups,warnings},generation:{metrics,warnings,createdAt}}`. Metrics include inspectionMs, aiMs, validationMs, totalMs, repairCount, acceptedWithoutRepair and cacheHit. Mapping and structural validity do not establish semantic coverage. Duplicate warnings compare normalized preconditions, steps and expected outcomes; they do not remove cases.

### Captured page states

`POST /api/page-captures` accepts `{targetUrl,authProfileId?}` and opens a controlled headed same-origin browser, returning `{captureId,status:'capturing'}`. The user performs setup manually. A chosen origin-matching profile is resolved privately; its storage state is never put into prompts. `POST /api/page-captures/:id/snapshot` accepts `{label,setupSteps:[strings]}` and returns `{stateId,label,targetUrl,controls,scope,setupSteps,capturedAt}`. Setup instructions are required, bounded to 20 steps of 500 characters, and never executed by the capture service. Labels are capped at 120 characters.

`GET /api/page-states?targetUrl=...` lists snapshots; `DELETE /api/page-captures/:id` closes the browser. Captures expire after five minutes (maximum two); snapshots expire after 30 minutes (maximum 20). Generation accepts at most ten selected state IDs and rejects expired or different-target states before calling the provider. Captures reject credential-bearing URLs, fragments, and sensitive query parameter names. Safe query parameters remain part of exact target identity. Snapshots are in memory and lost on restart. A state is evidence about controls, not proof that generated steps can reach it. Human review remains required.

Codex runs ephemerally in a temporary directory with `--ignore-user-config`, read-only sandboxing, and instructions to return QA JSON without tools or skill workflows. Top-level model/reasoning/OpenAI-provider strings are retained; unrelated MCP/plugin/hook configuration is excluded. Custom providers are rejected explicitly rather than switched silently. Timeout failures return 502 with a five-minute explanation; temporary generation directories are cleaned afterward.

A provider answer may wrap its JSON in a sentence or a code fence. The first JSON object that holds a `cases` list is used; any other text is ignored and never executed. An answer with no such object still uses the single repair request. When the Claude CLI flags its own error (`is_error`), generation fails with 502 and the CLI's message (at most 300 characters) and makes no repair request.

`POST /api/demo` or `/api/demo/suites` creates a deterministic three-case suite targeting `/demo/`, with pass/intentional-fail/pass mappings. No AI call.

## Canonical suites

Suites have `{schemaVersion:2,suiteId,revision,provider,targetUrl,createdAt,generationInput,cases}`. `generationInput` preserves the bounded original `{requirements,format,frameworks,context?,pageStateIds?}` across review, edits, persistence, and restart. Cases have immutable `caseId`, `displayId`, manual fields, and `automation.playwright:{status,reason,operations,reviewedAt?,verification?,code?}`. Status is draft, ready, blocked, or manual-only. IDs/source are server-created; missing mappings cannot borrow another case's operations.

`GET /api/suites/:id?revision=N` reads a canonical revision (current when omitted).

`PATCH /api/suites/:id/review` accepts `{expectedRevision,caseIds,reviewed:true}` and creates the next immutable revision. Blocked/manual-only and known ambiguous mappings cannot be reviewed.

`PATCH /api/suites/:id/cases/:caseId` accepts `{expectedRevision,automationEdit:{operations}}`. Edits create a revision and invalidate changed-case review/verification. Operations include navigation, legacy clickText/fillLabel/expectText, structured click/fill/expectVisible/expectTextExact/expectValue/expectCount/expectURL. Locators are `{kind:'role'|'label'|'text'|'testId'|'placeholder',value,role?,exact:true,formIndex?}`. `formIndex` is a zero-based integer from 0 through 100 and scopes the locator to that form; it prevents repeated login/registration placeholders from matching the wrong input. Unknown/executable fields, raw selectors, and cross-origin navigation are rejected. A rejection names the unknown fields (names only, at most five, 40 characters each) and lists the allowed fields; field values are never echoed. The same text is the hint for a repair request and can appear in a blocked reason.

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

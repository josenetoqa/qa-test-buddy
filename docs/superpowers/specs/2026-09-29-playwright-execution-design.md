# Playwright execution and demonstration design

Date: September 29, 2026. Status: broader target with a partially implemented core. The user subsequently authorized design and behavior implementation. See the [implementation record](../../implementation-2026-09-29.md) for delivered behavior, tests, and remaining work.

The light workspace and independent Playwright TC review/execution path are implemented. The [implementation plan](../plans/2026-09-29-playwright-execution-plan.md) still describes later capabilities. Do not infer full phase completion from the existence of the core workflow.

## Original baseline and historical evidence (before implementation)

The project is `/Users/joseneto/Documents/Projetos Pessoais/qa-test-buddy`, a vanilla HTML/CSS/JavaScript UI with a Node HTTP server. There is no build step. Treat this path as the source of truth; the old `/Users/joseneto/Documents/qa-test-buddy` location may not exist. Verify working directory and repository status before editing; Git must not be assumed.

- `server.js`: provider invocation, generated-output validation, trusted step compiler, runner lifecycle, memory-only run store, HTTP routes.
- `app.js`: generation form, manual case rendering, framework tabs, run start and polling, clipboard.
- `index.html`, `styles.css`: layout and presentation. Inspect the original screen before planning changes; no proposed redesign has been applied.
- `docs/api-contract.md`, `README.md`: current API and setup documentation; revise with each implemented phase.
- Installed `@playwright/test` is 1.63.0 and its local package declares Node `>=20`; README's Node 18 minimum is stale. Use Node 20 or newer for this plan and verify the installed package again before changing versions.

The earlier chat reported successful Codex/Claude generation, a passing Playwright run, and a correctly failing intentional assertion. Those are historical observations, not a fresh certification. Cypress was unavailable. `listen EPERM` was a sandbox binding issue, and missing `/favicon.ico` was nonblocking.

Source review confirms the main execution gaps: generation returns 1–8 manual cases but only one automation object per framework; `compileSteps()` emits one generic test; execution uses the line reporter and maps process success directly to `passed`; temporary spec/configuration directories are deleted and output is not isolated as retained run evidence; records are memory-only. The browser polls around 80 times at one-second intervals while the server allows 120 seconds. Refresh loses the generation/result context. Requirements plus a URL do not provide locator evidence from the actual target page.

Follow-up checks from the review include combined stdout/stderr limits and useful bounded CLI authentication/startup/JSON error details (phase 1), plus Cypress application-document lookup and exact text-matching parity (phase 8). These must be verified during their owning phase.

The presentation review also identified collapsed logs, indistinct status colors, a misleading disabled cursor, and a stale framework hint. The future visual phase should resolve these without inventing execution progress or per-case results.

## Product behavior

The chosen direction is a light QA workspace: white and neutral surfaces, restrained teal accents, readable type, and clear hierarchy. The previous proposal did not meet the user’s expectations. Use the selected light-workspace direction and review a concrete proposal before choosing final styling. Propose and review the revised screen before future implementation. The screen follows three tasks: describe the behavior, review the cases, inspect the run. Make setup secondary and results primary: a compact setup panel, a larger case review area, and a prominent result box. The result panel should show a clear status, target, actual available timestamps, concise summary, and expandable preformatted output. Empty, running, failed, and unavailable states must be readable. Use proper focus styles, keyboard controls, text labels as well as color, and responsive layouts.

In phase 0, represent the result as the existing aggregate framework run. Never infer a case's verdict from that one run, show fabricated step completion, or present example screenshots as evidence. Future controls appear only when their endpoint/capability is implemented. A bundled demonstration must say “Demo”; a recording must say “Recorded example.”

The future case list shows every manual case and its automation status. Each runnable case has its own `test()` declaration, code, result, and evidence. Selection can run one, several, or all eligible cases. A manual-only case remains visible with a reason. “All generated cases passed” requires every generated case to be eligible, selected, executed, and passed; otherwise say, for example, “3 of 5 generated cases passed; 2 need review.”

## Contracts and ownership

The service owns immutable suite revisions. The model supplies structured operations, never executable source. The browser sends identifiers for a stored revision; it cannot replace a run's code, URL, or operation list.

```js
Suite = { schemaVersion: 2, suiteId, revision, provider, targetUrl, createdAt, cases: [Case] }
Case = { caseId, displayId, title, preconditions, steps, expected, requirementRef,
  automation: { playwright: { status, reason, operations: [Operation], code, reviewedAt } } }
// caseId: server UUID, immutable within a suite; displayId: TC-001, TC-002, ...
// status: draft | ready | blocked | manual-only; reason required except for ready.
Operation = { stepId, op: 'navigate', value }
  | { stepId, op: 'clickText' | 'expectText', value }
  | { stepId, op: 'fillLabel', label, text }
```

Every manual case has an explicit Playwright mapping. Match provider cases by a temporary unique key, assign server IDs once, and reject duplicate/missing mappings. Do not use array position as a durable run identity. Edits preserve case IDs and create a higher immutable revision. A regenerated suite receives a new suite ID. Phase 1 includes a review action for eligible drafts: `PATCH /api/suites/:id/review` accepts only `{ expectedRevision, caseIds, reviewed: true }`, validates server-owned cases, and creates a new revision. It does not accept edited operations; phase 5 adds editing. `GET /api/suites/:id?revision=N` retrieves the stored revision. Generated unknown locators start as drafts; `ready` requires reviewed targets and at least one meaningful assertion corresponding to `expected`. The server can require a supported assertion structurally; human review confirms that it covers the intended expected result. Schema validation alone cannot establish semantic coverage. Navigation alone is never a passing test. Unsupported behavior becomes `blocked` or `manual-only`, with a concrete reason.

```js
POST /api/runs
{ schemaVersion: 2, suiteId, revision, framework: 'playwright', selectedCaseIds,
  mode: 'headless' | 'headed', idempotencyKey }
// No targetUrl, steps, code, file paths, or client-side suite snapshots.
Run = { runId, suiteId, revision, status, selectedCaseIds, startedAt, finishedAt,
  deadlineAt, cases: [CaseResult], summary, output, lastEventSeq }
CaseResult = { caseId, status, startedAt, finishedAt, durationMs,
  expected, actual, error, steps: [StepResult], artifacts: [Artifact] }
// Run/case execution states: queued | running | passed | failed | error | canceled | skipped.
// expected: stored requirement; actual: captured assertion output or null, never an AI guess.
```

The versioned run route may retain the legacy aggregate request for older callers; never mix its result into v2 per-case outcomes. An explicit empty selection is invalid. Unknown case IDs or non-ready cases reject the request before work begins. `Run all ready` sends the complete eligible ID list and shows omitted cases. Stale revisions reject with 409. Identical idempotency keys plus identical request digests return the original run; reusing a key with changed content returns 409.

Use per-case browser contexts, `workers: 1`, `retries: 0`, `maxFailures: 0`, and normal independent tests. Do not use a serial group that skips later cases after one failure. One process per selected suite is adequate; each case retains its own result. Skipped, missing, duplicate, or interrupted reporter results cannot become passes. Passing requires a completed reporter result for every selected ID, a successful reporter end, process exit 0, and no timeout/cancel/infrastructure error. Preserve completed case results when the overall run fails.

## Bounds, lifecycle, and evidence

Preserve the 20,000-character requirements limit. Keep request bodies at 256 KB, generation output and textual run output at 128 KB combined across stdout/stderr, 1–8 cases, and 1–12 operations per case. Limit each manual field to 4,000 characters, title to 240, each manual step to 1,000, at most 24 manual steps, locator strings to 160, and operation values/text to 1,000. Validate explicit operation keys and reject source-code/eval fields. Preserve same-origin navigation validation, loopback binding, and shell-free process arguments. Bound creation to two active/queued suites and two concurrent generations.

Each case has a 120-second timeout; suite deadline in milliseconds is `min(990000, selectedCaseCount * 120000 + 30000)`. Return `deadlineAt` for the browser; poll until terminal state or that deadline plus a 10-second reconciliation window, rather than a fixed attempt count. A temporary fetch failure means connection lost, not test failure. Reload restores IDs and reconnects while the server lives; restart recovery becomes available in phase 6. Cancellation is idempotent, terminates the process tree, and preserves evidence already collected.

Use isolated `.test-buddy-runs/<runId>/` directories for specs, configuration, reporter records, and evidence. Retain completed evidence instead of deleting it during runner cleanup; temporary code can be removed. Expose opaque artifact IDs resolved through the run manifest, never filesystem paths from a request. No directory listing, traversal, cross-run access, or symlink escapes. Do not rely on the static server to expose this directory.

From phase 3, the trusted custom reporter writes bounded NDJSON to a dedicated file inside the run directory, separate from stdout/stderr. Cap this transport at 24 MB, 5,000 records and 4 KB per record; reject malformed records and mark overflow/incomplete reporting as an infrastructure error. Phase 4 exposes the bounded validated stream through the API. Reporter events include `runId`, `caseId`, optional `stepId`, monotonic `seq`, type, timestamp, and bounded data. Cap events at 5,000 per run and each payload at 4 KB; overflow marks the stream truncated, never silently drops terminal results. Keep terminal outcomes separately from the event ring. Snapshot plus `lastEventSeq` permits reconnect without duplicating entries.

Use actual `test.step()` boundaries for the timeline. “Show browser” opens local headed Chromium; it is not a live embedded stream. Add screenshots, retained failure traces, and optional videos; show only files that exist after completion. Trace and video controls must be disabled with an explanation until artifacts exist. Implementation references: Playwright's [reporters](https://playwright.dev/docs/test-reporters) and [trace viewer](https://playwright.dev/docs/trace-viewer-intro). These documented framework capabilities are not evidence that the application exposes them.

New limits and retention values below are proposed engineering defaults, not measurements of the existing application. Default retention: at most 100 completed runs, seven days, 50 MB of artifacts per run, and 500 MB total. Do not evict active work. Reject new runs with a clear storage error if no completed data can be reclaimed. Artifact quota failure must not change a test failure into a pass; report unavailable/truncated evidence separately.

## Later capabilities

A deterministic local demo page provides labeled inputs, validation, and a success state. Its checked-in suite includes a success case, an empty-input validation case, and an explicitly intentional failing case. Cases reset themselves and do not depend on AI generation. Capability detection actually launches Chromium and reports runtime/browser readiness; missing Node/browser/runner states must be distinguishable.

Locator editing remains structured. Add bounded role, label, text, and test-ID locators, exact matching, and allowlisted assertions. Verification visits the authorized target and checks uniqueness/visibility without clicking or submitting. It does not prove all later states; a controlled test run proves those. Return blocked results for unsupported frames or permissions until supported explicitly.

Run history stores canonical suite revisions alongside results. Export code by case or suite, plus JSON and readable summaries. Exports contain actual outcomes and omit secrets/auth state. Persist atomically and mark interrupted active runs as errors after restart; never restart tests silently.

Authentication is a later, separate capability. Store named local profiles outside public paths with restrictive permissions, associate them with an exact target origin, and let the user sign in in a controlled browser. The model never receives credentials. Playwright [authentication state](https://playwright.dev/docs/auth) can contain sensitive session data; do not export or publish it. Revalidate state before execution and show a clear expired-session result.

Cypress parity is optional after the Playwright path is stable. It must preserve the same case identities and honest status semantics without weakening structured compilation. Do not install Cypress while producing this plan or during the future design-only phase.

## Delivery boundaries

Phase 0 proposes and implements the light screen design only when requested; phase 1 establishes per-case generation and compiler contracts; phase 2 adds deterministic demo/readiness; phase 3 adds real selected/all execution and lifecycle; phase 4 adds step events and evidence; phase 5 adds locator review and operations; phase 6 adds history/export/retention; phase 7 adds authentication; phase 8 optionally adds Cypress. Each phase must run, pass its targeted checks, and leave a useful stable app independently. Read both documents, implement only the requested phase, and record its evidence before handing off.

## Proposed screen composition

The visual proposal should contain these areas in this order; this is a wireframe description, not an implemented screen.

| Area | Proposed content | When it becomes functional |
| --- | --- | --- |
| Compact header | Test Buddy, workspace title, actual connection/tool availability | Phase 0, using existing capabilities |
| Setup | Requirements, format, provider, framework and target; desktop width about 320–360 px | Phase 0 |
| Case review | Separate readable TC cards; clear preconditions, steps and expected result | Phase 0 manual cards; phase 1 automation mapping |
| Run controls | Run the current draft, then later run one/selected/all ready cases | Existing draft control in phase 0; independent selections in phase 3 |
| Prominent result box | Text verdict, target, framework, real duration and expandable output | Aggregate result in phase 0; per-case results in phase 3 |
| Result details | Selected TC, expected/actual, actual step timeline, screenshots and trace | Phases 3–4, only when the API provides evidence |

Keep the header compact and results in the first viewport. Avoid a large marketing hero, invented dashboard numbers, decorative navigation, or controls without implemented behavior. Use a consistent 8 px spacing scale, 16 px body text, 14 px labels/logs, and 12 px only for secondary metadata. At narrow widths, stack setup, case review, and results. Verify 375 px, 768 px, 1440 px and 200% zoom. Status needs a text label and icon as well as color.

## Coverage of the requested improvements

| Request or earlier finding | Owning phase | Required proof |
| --- | --- | --- |
| Light workspace and a better demonstration/result box | 0 | Reviewed empty/success/failure designs and responsive checks |
| Cursor, stale framework hint, log formatting and status distinction | 0 | Keyboard/selection checks and readable actual runner output |
| One separate Playwright test for every generated TC | 1, 3 | Stable IDs, one mapped disposition per case, independent executable tests/results |
| Unsupported/uncertain scenarios remain visible | 1 | Blocked/manual-only reason; never counted as passed |
| Run one, selected, or all eligible cases | 3 | Mixed pass/fail/omitted results remain correctly associated |
| Show the real browser and real execution steps | 4 | Headed run and reporter-sourced step events |
| Screenshots, trace and optional recorded video | 4 | Artifacts exist and belong to the selected case/run |
| Predictable demo with a labeled intentional failure | 2 | Repeatable local pass/fail without AI calls |
| Verify/edit locators and stronger assertions | 5 | Ambiguity stays visible; edits invalidate review and create a revision |
| Timeout mismatch, refresh recovery and duplicate runs | 3 | Long-run, reload, disconnect and idempotency checks |
| Cancellation and two simultaneous runs | 3, 4 | Process/output isolation and correct capacity release |
| Save history; copy/download code and reports | 1, 6 | Correct revision exports, restart recovery and retention checks |
| CLI diagnostics, combined output bounds and readiness | 1, 2 | Explicit setup errors, bounded details and Chromium launch proof |
| Authentication | 7 | Controlled login, origin isolation and expired-session handling |
| Cypress and its label/text-matching concerns | 8, optional | Reproduce and verify independently from Playwright |
| Favicon 404 | 0 | Asset loads or is intentionally suppressed |
| Sandbox EPERM | Environment context | Do not classify tool sandbox restrictions as product defects |

# Workspace update — October 4, 2026

## Changes

### Generation and locator mapping

Playwright generation inspects the initial target page before calling the selected AI CLI. The bounded metadata contains visible control labels, placeholders, types, and form indices, without input values, cookies, or authentication state. Inspection uses a fresh context, performs no clicks or fills, and rejects cross-origin navigation.

Exact placeholder locators and optional zero-based `formIndex` scopes work consistently in validation, compilation, verification, and the editor. This separates repeated login/registration inputs. Locator checks remain read-only: absent or hidden controls after a planned interaction are deferred, not treated as proof that the later state fails. Missing action mappings return an actionable 409.

### Codex invocation

Generation uses an ephemeral temporary directory and `--ignore-user-config` to avoid unrelated MCP, plugin, and hook startup. Top-level model/reasoning preferences and the OpenAI provider setting are retained with the existing sign-in. A custom provider is rejected explicitly rather than silently replaced. The invocation asks for QA JSON only without tool or skill workflows.

The provider deadline is five minutes. Timeout messages identify the provider and deadline; irrelevant startup warnings do not replace that explanation. Temporary generation directories are cleaned afterward.

### Configure, review, and results

The workspace follows Configure → Test review → Results on one page. The UI generates plain text and offers Playwright as its only automation option; the API still accepts legacy BDD inputs. Generation and execution scroll to their respective sections.

Run confirms selected draft mappings through the existing immutable review API before starting execution. Backend review checks are preserved. Action editing displays the relevant fields, saves to a new revision, and survives readiness refreshes. An open editor blocks execution until saved/canceled, with a visible explanation and Continue editing link. Changed inputs also block execution; Use suite inputs explicitly restores the displayed revision's inputs.

Code previews start collapsed. Jump to case, Collapse code, and stable selection make long suites easier to navigate. Playwright errors and failed-step details appear on the affected case; a link opens the execution section. Started/Finished timestamps use the browser's local time zone. Case results are tied to the displayed suite/revision and current run.

### Copy and export

Every manual case has Copy case; Copy cases copies the whole suite. The text contains the title, preconditions, numbered steps, expected result, and requirement. Copy code remains inside each code preview.

Downloads work before execution and use the displayed saved revision:

- Text export contains all manual cases, including blocked/manual-only cases.
- Combined Playwright export contains an independent test for every runnable mapping.
- Download this test exports one runnable case.

Empty runnable suites return 409, unknown cases return 404, and unsupported formats return 400. The UI shows export errors and completion feedback. Downloaded source retains its target URLs and test data but does not include captured login state; running it elsewhere requires a Playwright project and browser installation.

## Verification

Commands run against the final code before publication:

- `npm test`: **92 passed**, no failures.
- `npm run test:browser`: **3 passed**, no failures.
- Syntax checks for the changed JavaScript/CommonJS modules and `git diff --check` passed.

The checks include real Chromium execution, read-only page inspection, scoped placeholders, saved edits/reload, single-click execution, execution locks, failure details, and actual browser downloads. The combined Playwright export was also collected by the Playwright CLI as distinct tests.

The README screenshot uses a separate temporary local demo environment. Its expected run outcome is pass / intentional failure / pass; the failing case illustrates error reporting. No live user accounts or AI generation were used for the documentation screenshot.

Local-fixture and browser checks establish the application's workflow, not the correctness of assertions or business behavior on an external target. The existing expected criteria are preserved; generated locators and assertions still need review.

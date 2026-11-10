# Test Buddy user guide

Test Buddy turns requirements into manual test cases and optional Playwright tests. You review the generated actions, run them locally, and inspect the results for each case.

This guide covers the current browser interface. For request and response details, see the [API contract](api-contract.md).

## Contents

- [Install and start](#install-and-start)
- [Try the demo first](#try-the-demo-first)
- [Configure a test suite](#configure-a-test-suite)
- [Understand generation](#understand-generation)
- [Review test cases and code](#review-test-cases-and-code)
- [Edit actions](#edit-actions)
- [Check locators](#check-locators)
- [Run tests](#run-tests)
- [Read execution results](#read-execution-results)
- [Copy and export](#copy-and-export)
- [Use authentication profiles](#use-authentication-profiles)
- [Reopen runs and revisions](#reopen-runs-and-revisions)
- [Troubleshooting](#troubleshooting)
- [Limits and data handling](#limits-and-data-handling)
- [Developer reference](#developer-reference)

## Install and start

You need Node.js 20 or later and npm. Browser inspection and execution also need Playwright's Chromium. AI generation requires a configured, signed-in Codex CLI or Claude CLI; the bundled demo does not require either provider.

```sh
git clone https://github.com/josenetoqa/qa-test-buddy.git
cd qa-test-buddy
npm ci
npx playwright install chromium
npm start
```

The repository currently requires GitHub access to clone. Open [http://127.0.0.1:4173](http://127.0.0.1:4173) after the server starts. Keep that terminal running while you use the app. Stop it with Ctrl+C.

The app has no frontend build step and binds to your computer's loopback interface. To use another port or data directory:

```sh
PORT=4183 npm start
TEST_BUDDY_DATA_DIR=/absolute/path/to/private-data npm start
```

Each command starts a server with the specified override. When changing ports, open the matching URL in your browser.

## Try the demo first

1. Click **Try the local Playwright demo**.
2. Read the three cases in **Test review**.
3. Open the **Playwright** tab and expand a **Playwright code** preview.
4. Click **Run all runnable**.
5. Inspect the case results and the **Results** section.

The expected sequence is **passed, failed, passed**. The second case deliberately contains an assertion that fails. It shows the error and evidence workflow; the third case demonstrates that a failed case does not prevent later independent cases from running.

The demo is useful for checking your local installation before generating tests for another application.

## Configure a test suite

The page has three main sections: **Configure**, **Test review**, and **Results**. The navigation links move between these sections without opening a different page.

| Setting | What to enter or select |
| --- | --- |
| What do you want to test? | The behavior, preconditions, inputs, and expected outcomes you want to test. Use the writing outline if the field is empty. |
| Generate with | An installed and authenticated Codex or Claude CLI, using its configured model. |
| Choose your output | Keep Manual test cases selected, or choose Add Playwright for browser automation drafts as well. |
| Target URL | The initial page to inspect and test. Required for Playwright generation. |
| Execution options | Browser visibility, action delay, video recording, and an optional authentication profile. |

Cases use plain text. There is no format selector or Cypress option in the interface.

The **Your setup** summary shows the selected output and target, explains missing inputs or tools, and keeps **Generate tests** nearby on desktop. Invalid target URLs are explained beside the URL field. Switching output keeps your requirements and optional context. The writing outline never replaces existing text.

**Optional test context**, **Capture page states**, and **Execution options** expand only when you need them. Closing a section preserves its values. Execution options includes a link to manage saved login profiles. On narrow screens, the setup summary follows the form in a single column.

Write requirements that describe observable behavior. For example, a requirement for a contact form might be:

```text
On the contact form, a full name and a valid email address are required.
Submitting valid values displays "Contact created".
Submitting an empty email displays the required-email validation message.
Submitting an invalid email must not create a contact.
Start each case with the form reset.
```

This is an example, not an assumption about your application. Use its actual rules and exact messages when you know them. Do not put passwords, tokens, or other secrets in requirements.

Click **Generate tests** to begin. Progress and errors appear next to the button; **View progress & controls** takes you to Test review to cancel or reconnect. When generation finishes, use **Review generated cases** to continue. Generation does not run the tests. If you change the requirements, URL, or Playwright selection afterward, the previous suite cannot run against those changed inputs. Choose **Use suite inputs** to restore its saved configuration, or generate a new suite for the new configuration.

## Understand generation

The [generation quality guide](generation-quality.md) covers requirement context, per-case regeneration, progress/cancel/reconnect, cached inspection, page-state capture, metrics, and benchmarks.


With Playwright enabled, Test Buddy first opens the target in a fresh Chromium session. It inspects a limited set of visible control metadata, including labels, placeholders, button and link names, the names of custom toggles and choices (switch, checkbox, radio, and combobox roles), input types, and form scopes. A submit, button, or reset input is named by its `value` attribute; text typed into fields is never read. It then sends the requirements and this metadata to the selected AI CLI.

The inspector does not click controls or fill fields. It does not collect input values, cookies, login tokens, or the full page content. It only observes the initial page, so it cannot establish what appears after submitting a form or opening a dialog.

Initial inspection uses a fresh anonymous session. For authenticated or later states, explicitly open a controlled page capture with an optional local login profile. Navigate manually, describe setup steps, capture controls, and select the snapshot for generation. Missing inspection does not prevent manual case generation; automation without observed controls is blocked.

The provider returns structured cases and operations. Test Buddy validates them and compiles supported operations into Playwright source. It does not execute arbitrary source returned by the model. A case can remain blocked or manual-only when there is no usable automation mapping.

Generation has a **five-minute total deadline**, including initial inspection and a maximum of one targeted repair request. Codex runs with unrelated user MCP servers, plugins, and hooks excluded. It retains supported top-level model and reasoning settings and the existing sign-in. Custom Codex providers are currently unsupported by this isolated invocation. Claude runs in its safe mode, so your personal `CLAUDE.md`, skills, plugins, hooks, and MCP servers cannot change the generated cases. It has no tools, the request is not saved as a session, and your sign-in and model selection still apply.

If generation fails, the interface shows the failure. It does not silently substitute demo cases or reuse an earlier suite as the new result.

## Review test cases and code

The **Test cases** tab shows each case's title, preconditions, steps, expected result, and requirement reference. Check that these match the behavior you actually want to test before running automation.

The **Playwright** tab shows the corresponding actions and compiled code. Code previews start collapsed. Expand **Playwright code** for a case, use **Jump to case** to move through the list, or **Collapse code** to close previews.

Automation status is different from an execution result:

| Automation status | Meaning |
| --- | --- |
| `draft` | Actions exist and need review. Clicking Run confirms the displayed actions before execution. |
| `ready` | The saved actions have been reviewed for execution. This does not mean the test passed. |
| `blocked` | The case needs a valid automation mapping or a problem resolved before it can run. Read its reason. |
| `manual-only` | The case has no runnable automation mapping. It can still be reviewed and exported as a manual case. |

Having visible code is not enough to enable Run. The runner must be available, inputs must match the saved suite, and no action editor can remain open. There is no separate **Mark reviewed** button: Run performs that confirmation.

## Edit actions

1. Find the case in the **Playwright** tab and click **Edit actions**.
2. Choose the action type and update the fields shown for that action.
3. Add or remove actions as needed, keeping an observable assertion for the case's expected result.
4. Click **Save actions**.
5. Inspect the updated code before running it.

The editor only shows fields used by the selected operation. Supported operations include navigation, clicking, filling fields, and assertions for visibility, text, values, counts, and URLs.

For structured actions, select a locator by exact text, label, role, test ID, or placeholder. A role locator also needs its role, such as `button`. An optional **Form index** limits a locator to one form: `0` means the first form, `1` means the second. Leave it blank to search the whole page. Use a form scope only when it matches the inspected page structure.

**Save actions** creates a new saved revision and updates the code. **Cancel editing** discards the unsaved edits. While an editor is open, execution and other action controls are blocked. The banner identifies the open case; **Continue editing** takes you back to it so you can save or cancel.

A saved edit changes the code being tested. A result from an older revision is not treated as a result for the edited revision.

## Check locators

Click **Check locators** to inspect matches on the initial page without performing the case's clicks or fills. Many applications render their controls shortly after the page loads, so the check waits up to five seconds in total before it reports an initial-page control as `absent` or `hidden`.

| Result | How to interpret it |
| --- | --- |
| `matched` | A visible match was found on the initial page. |
| `absent` | No match was found in the inspected state. |
| `hidden` | The matching control is not visible in the inspected state. |
| `ambiguous` | More than one control matches. Refine the locator or form scope before running. |
| `deferred` | The target may appear after a planned interaction. That later state has not been verified. |

A successful locator check does not prove that the workflow or assertion is correct. A deferred check is also not a pass; only execution can verify the later state. Cases without actions need a valid mapping before locator checks are available.

## Run tests

Choose one of these controls in the Playwright tab:

- **Run TC-001** or the equivalent case button: run that case.
- **Run selected**: run the checked cases.
- **Run all runnable**: run all cases with runnable mappings.

Clicking Run confirms the displayed draft actions, saves the reviewed revision, and submits it to the server. Execution scrolls the page to **Results**.

Under **Configure → Execution options**:

- **Headless** runs Chromium without a visible window.
- **Show local browser** opens a separate browser window on this computer.
- **Action delay** adds 0–500 milliseconds between actions for easier observation.
- **Record video** enables recorded evidence for the run.
- **Authentication** selects a saved profile that matches the suite's target origin.

The server owns the run. Reloading the app does not by itself stop it. Use **Reconnect to this run** when offered, and **Cancel run** when you want to stop execution. A server restart interrupts active runs; they become errors instead of automatically resuming.

## Read execution results

Read each case's actual result alongside its expected result. Results include step status and duration, errors, and available evidence. A failed case shows the **Playwright error** and failed-step details directly in both the Test cases and Playwright tabs. **View execution results** takes you to the corresponding details.

A failed assertion means the observed result did not satisfy the compiled assertion. Review both the application's behavior and the assertion: generated expectations can be wrong. An infrastructure error, missing result, skipped execution, or incomplete run cannot establish a pass.

The case cards show results for the current run's matching suite and revision. They do not combine all previous runs. After editing actions, run the revised case again to get a result for its new code.

**Started** and **Finished** use a readable date and time in your browser's local time zone, including the zone. A running case or batch can show **In progress**; a completed record with an unavailable timestamp shows a dash.

Expand **Runner output** for diagnostic output. Failure evidence can include screenshots and traces; video is available when recording was enabled. These are captured files, not a live browser stream.

To open a downloaded trace:

```sh
npx playwright show-trace /absolute/path/to/trace.zip
```

## Copy and export

Test exports are available before execution and use the displayed saved revision.

| Control | Output and scope |
| --- | --- |
| **Copy case** | One manual case: title, preconditions, numbered steps, expected result, and requirement. |
| **Copy cases** | All manual cases in the suite. |
| **Download test cases (.txt)** | All manual cases, including blocked and manual-only cases. |
| **Download Playwright tests (.spec.cjs)** | All runnable draft or ready mappings, with one independent test per case. |
| **Copy code** | The source in that case's expanded code preview. |
| **Download this test** | One case's Playwright test, from its expanded preview. |
| **Download JSON report** / **Download Markdown report** | Execution results for a run, rather than test definitions. |

Example filenames are `test-cases-r1.txt`, `playwright-tests-r1.spec.cjs`, and `TC-001-r1.spec.cjs`. The revision identifies the saved definition used by the export. Save open edits before exporting if you want those edits included.

Playwright export is unavailable when there are no runnable mappings. A download error appears as feedback instead of being saved as a fake test file.

To execute exported code elsewhere, use a project with `@playwright/test` and Chromium installed. The target application must still be reachable. Exports retain their target URLs and test data, so a URL on `127.0.0.1` points to the computer running the exported test. Captured authentication profiles are not bundled; configure authentication separately in the destination project when needed.

Execution reports reference evidence on the local Test Buddy server. Those links are not portable to another computer. Review and share evidence files separately when necessary.

## Use authentication profiles

1. Expand **Local authentication profiles** at the bottom of the page.
2. Enter a profile label and the **Site origin**. An origin consists of the scheme, host, and port, such as `http://127.0.0.1:4173`.
3. Click **Create profile**, then **Open login browser**.
4. Sign in yourself in the controlled browser window.
5. Return to Test Buddy and click **Save login session**.
6. Select the matching profile under **Configure → Execution options → Authentication**.

The capture session expires after five minutes. Unknown, expired, or wrong-origin profiles cannot be used. If the target service expires your login, capture a new session.

Profiles apply to execution, locator checks, and explicitly opened page captures. Locator check results say whether a login profile was used. Automatic initial-page inspection still uses a fresh session without the saved profile. Login state is stored privately on your computer and is excluded from AI prompts, reports, and Git. Deleting a profile removes the local copy; it does not revoke sessions at the target service.

## Reopen runs and revisions

Expand **Run history**, use **Refresh history**, and choose an existing run to inspect it. **Load more** appears when additional records are available. Reopening a saved suite restores its original inputs and revision so its results can be understood against the code that actually ran.

A revision is a saved version of a suite. Editing or reviewing actions can create a new revision. Exported files and execution results refer to specific revisions, which prevents an old result from being presented as proof for changed actions.

## Troubleshooting

| Symptom | What to check or do |
| --- | --- |
| No AI CLI is available | Install and sign in to a supported CLI, then click **Recheck local tools**. The demo can still be used without AI generation. |
| Chromium or the runner is unavailable | Run `npx playwright install chromium` from the project directory, then recheck local tools. |
| Generation reports that the CLI took too long | The provider exceeded its five-minute deadline. Check that the selected CLI can complete a request, reduce overly broad requirements, and retry. |
| Generation fails with "Claude CLI reported an error" | The Claude CLI itself refused the request, for example because of sign-in or billing. Read the message, fix it in the CLI, and retry. |
| Generation cannot inspect the target page | Confirm the server is running and the URL is accessible without login in a fresh browser session. Saved run profiles are not used by the inspector. |
| A case has code but Run is disabled | Read the blocker message. Save or cancel the open action editor, restore suite inputs if they changed, and confirm runner readiness. |
| Another case's buttons become disabled after Edit actions | Use **Continue editing** to return to the open editor, then save or cancel it. |
| An edit is not reflected in the code | Click **Save actions** and check its feedback. Correct validation errors before leaving the editor. |
| A case is blocked or manual-only | Read its reason and add a valid action mapping, or keep it as a manual case. A URL alone does not establish working locators. |
| Locator checking says it could not load the target page | The application answered with an HTTP error, was unreachable, or redirected to another site. No locator was checked. Start the application, correct the URL, or sign in, then check again. |
| Locator check results say the page ended at a different address | The target redirected within the same site, often to a login page. The results describe that page. |
| Locator checking reports absent on a page that needs login | Select the matching profile under **Execution options → Authentication** and check again. The results say "Checked without a login profile" when none was used. |
| Locator checking reports ambiguous | Make the locator specific to one control, using its exact label, role, test ID, placeholder, or a valid form scope. |
| Locator checking reports deferred | Run the case to test the later interaction state. The read-only check does not perform earlier clicks or fills. |
| The test fails even though generation succeeded | Inspect the failed step and Playwright error. Verify the locator, test data, and expected behavior against the application. |
| An old result disappears after editing | The new revision has not run yet. Run it again; the old result remains associated with its saved revision. |
| The Playwright download is disabled | The suite has no runnable mappings. Manual cases can still be downloaded as text. |
| Clipboard copying fails | Check browser clipboard permissions and retry. For cases, use the text download as an alternative. |
| A run loses its connection | Use **Reconnect to this run** or reopen it from history. If the server restarted, the interrupted run needs to be started again. |

## Limits and data handling

- Each suite supports 1–8 cases, with 1–12 operations per case. An automatically added navigation operation counts toward this limit.
- Requirements are limited to 20,000 characters.
- The server allows two concurrent generation requests and two active or queued batches. The UI guides one execution at a time.
- Chromium is the implemented browser runner. Cypress execution is not available.
- History targets 100 completed runs, seven days, 50 MB per run, and 500 MB total. Expired records are archived rather than automatically deleted; archived bytes still count toward quotas.

The app and saved history run locally, but AI generation sends requirements and inspected control metadata to the selected provider. Test values and captured evidence may contain private account data. Review exports, screenshots, traces, and videos before sharing them.

Runtime data, profiles, recordings, dependencies, and local agent sessions are excluded from Git. Local fixture tests verify Test Buddy's behavior; they do not establish correctness of your application's business rules or generated assertions.

## Developer reference

The UI is vanilla JavaScript, HTML, and CSS. The Node.js server validates suite revisions, compiles allowlisted operations, runs Playwright, and stores local results.

| Entry point | Responsibility |
| --- | --- |
| `app.js`, `index.html`, `styles.css` | Configure, review, execution, and history interface. |
| `server.js` | Local HTTP API and request handling. |
| `lib/` | Generation, suites, compiler, execution, evidence, history, and authentication. |
| `demo/` | Deterministic local contact-form fixture. |
| `test/` | Unit, integration, and browser verification. |

Run project verification from the repository root:

```sh
npm test
npm run test:browser
```

Related documentation:

- [README](../README.md): project overview and quick start.
- [API contract](api-contract.md): endpoints and data contracts.
- [Workspace update and verification](implementation-2026-10-04.md): implementation changes and dated verification evidence.
- [Execution design](superpowers/specs/2026-09-29-playwright-execution-design.md): execution architecture and design decisions.

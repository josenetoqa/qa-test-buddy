# Generation quality and efficiency

Test Buddy now separates provider invocation, generation jobs, case validation, page evidence, and suite storage. Everything runs locally except requests made by the selected AI CLI to its configured provider.

## Start with explicit context

Use **Optional test context** to add acceptance criteria (one per line), user role, preconditions, test data, and business rules. Each field accepts up to 4,000 characters. The service assigns `R1`, `R2`, etc. to criteria; without criteria, all free-text requirements form `R1`. It does not infer extra business rules to fill the catalog.

Review the **Requirement mapping** panel after generation. Unmapped requirements are visible. Possible duplicate groups compare normalized preconditions, steps, and expected results. Similar titles alone do not establish duplication. Cases are never deleted automatically as duplicates.

A mapped requirement is not verified coverage. You still need to check whether each expected result follows from the requirements and whether its assertions actually prove that outcome. The generator can use text, exact text, visibility, URL, value, and count assertions. Unsupported interactions or missing evidence should remain blocked.

## Repair and regenerate only what needs work

A sentence or code fence around the provider's JSON answer is ignored, so it does not cost a repair request. The service rejects empty expected results, blank manual steps, and unknown requirement references. It validates each case separately and makes at most one repair request for invalid cases. Already valid cases are retained. Repair cannot replace a known nonempty expected result with a different one. If operations remain invalid, valid manual content can survive with blocked automation; invalid manual cases are omitted with a warning. An empty final suite fails visibly.

Use **Regenerate case** or select cases and click **Regenerate selected**. The saved requirements/context are used. Other cases keep their IDs, content, and review status. Replacements create a new revision and require action review again. Old execution results remain tied to their old revision. Selected regeneration cannot change the expected outcome; to change the behavior under test, edit the requirements and generate a new suite.

## Progress, cancellation, and recovery

Generation shows inspection, generating, validating, repairing, and saving stages. The total deadline is five minutes, including inspection and repair. **Cancel generation** signals browser/CLI cancellation; late results are discarded. A concurrency slot remains reserved until cleanup settles. The service allows two active jobs and retains up to 100 job records in memory.

Starting a generation clears the previous run from the Results panel; a failed or canceled generation shows the previous suite again together with its last result. The browser reconnects to a saved job after reload. Connection failure offers reconnect. Edits made after submission are preserved and keep an older suite blocked from execution. Restarting the server clears job records; the UI explains that the job is unavailable and allows a new request. A failed/canceled request retains the previous suite without presenting it as new output.

## Reuse page evidence

Anonymous initial-page inspection is cached by exact URL for five minutes, up to 20 entries. Select **Refresh page inspection (ignore cache)** when the page changes. Generation sends the most relevant observed controls, preserving form scopes. Inspection failure still permits useful manual cases. Automation is blocked when there are no observed controls.

For later or authenticated states:

1. Enable Playwright and enter the target URL.
2. If needed, select an existing local profile under **Execution options → Authentication**.
3. Open **Capture page states**, then **Open capture browser**.
4. Manually reach the desired state in the controlled same-origin browser.
5. Enter a state label and reproducible setup steps, one per line.
6. Click **Capture state**, then select the saved state for generation.
7. Close the capture browser when finished.

The service does not execute setup instructions. They explain how to reach the observed state; a snapshot alone does not prove generated automation can reach it. Captures expire after five minutes and snapshots after 30 minutes. At most two captures, 20 snapshots, and ten selected states are allowed. State selection is target-specific. Unavailable selections can be removed; target changes clear selections.

To regenerate cases after their snapshots expire or the server restarts, refresh the state list, remove unavailable states, and optionally select newly captured states. Regeneration uses this updated selection and saves it with the new suite revision. Changing only the state selection allows regeneration; changing requirements, context, frameworks, or the target still requires a new generation. Original expected outcomes remain protected.

Snapshots contain bounded visible control metadata and setup instructions—not field values, cookies, or browser storage. Labels, button and link names, toggle names, and user-written setup instructions can still contain private information, especially on a signed-in page; review what you capture. Capture URLs reject credentials, fragments, and sensitive query parameter names. Snapshots disappear after server restart.

## Measure improvements

The generation panel records inspection time, provider time, validation time, total time, repair count, cases accepted without repair, and cache use. Millisecond values can be zero for very short stages. `acceptedWithoutRepair` measures structural acceptance, not cases accepted by a human without edits.

Run the deterministic benchmark:

```sh
npm run benchmark:generation
```

Its corpus deliberately includes bad outputs. The valid fraction is a fixture statistic, not the model's success rate. The success criterion is zero fixture-expectation failures.

Run a real-provider benchmark explicitly:

```sh
npm run benchmark:generation -- --live --provider codex --output /tmp/test-buddy-live.json
# Or choose --provider claude.
```

This sends only synthetic manual-test requirements, not project credentials or account data. It makes no browser visits. Reports include initial and repaired provider outputs, timing, structural validity, requirement mapping, and a human-review checklist. Existing report files are not overwritten.

Measure Playwright mappings against the bundled demo page:

```sh
npm run benchmark:generation -- --live --playwright --provider codex --output /tmp/test-buddy-playwright.json
```

This serves a local copy of the demo contact form on a loopback port, inspects it with Chromium, and sends three made-up requirement sets plus the observed control metadata to the provider. The report counts cases that are **not blocked**, blocked, and manual-only, lists every blocked reason, and records the number of provider calls and repair requests. "Not blocked" means the mapping passed structural checks. The benchmark does not execute the cases, so it does not show that they pass or that they prove a requirement. One page and three scenarios cannot describe other applications.

Compare repeated runs using the same corpus, provider settings, and machine conditions. Check coverage and review effort before claiming a faster prompt is better. Structural checks cannot judge business semantics by themselves.

## Verification snapshot — October 8, 2026

- Offline corpus: 11 fixtures, 19 cases, zero expectation failures. The corpus intentionally contains 13 structurally valid and six invalid cases.
- Live Codex: three synthetic manual-only scenarios, eight structurally valid final cases, zero repair requests, no duplicate groups, and no unmapped supplied criteria.
- Live generation durations: approximately 11.2 seconds (required email), 17.2 seconds (quantity boundaries), and 13.2 seconds (role permissions).
- These are one-run observations, not a demonstrated speedup over the old generator. Manual inspection of the outputs showed explicit missing-context notes; the role-permission output added a reload/persistence check that still needs a reviewer to confirm against product requirements.

See [API contract](api-contract.md) for endpoint shapes and limits. Unit, integration, and browser results are recorded in the [implementation record](implementation-2026-10-08.md).

## Verification snapshot — November 10, 2026

Live Playwright baseline against the bundled demo page: one scenario (`demo-contact-messages-known`), one run per provider, with the code at commit `7076e10`. That is before the parser, hint, prompt, inspector, and Claude isolation changes. The committed `--playwright` mode runs three scenarios; a one-off script limited these runs to the first one to stay inside the approved number of provider calls.

| Provider | Cases | Not blocked | Provider calls | Repair requests | Total time |
| --- | --- | --- | --- | --- | --- |
| Codex | 3 | 3 | 2 | 1 | 37 s |
| Claude | 5 | 5 | 2 | 1 | 146 s |

- Both first answers were rejected whole for the same reason: each operation named itself in a field called `type` instead of `op`. The prompt at that commit never named the field, and the repair hint said only "Unsupported or unknown fields." Both repair requests succeeded.
- "Not blocked" is structural. The cases were not executed.
- Claude at that commit loaded personal customizations. Its two session files show about 217,000 input tokens of context per call and ten hook entries (seven successes, one non-blocking error, one system message, one added context). The CLI reported $1.80 and $0.24 for the two calls, and they left two session folders under `~/.claude/projects`.
- Claude isolation check with the shipped arguments (one small prompt, after commit `a3d04d3`): all flags were accepted, sign-in worked, the context was 3,688 input tokens, the CLI reported $0.018, and no session folder was left.
- The live runs dropped the calling session's `CLAUDE*` and `ORCA_CLAUDE*` environment variables, so the CLIs ran as they would from a normal terminal.

Not measured: the same scenario after the changes, the other two scenarios, and repeat runs. One run per provider cannot show a rate.

Raw reports: [Claude baseline](verification/generation-playwright-baseline-2026-11-10-claude.json), [Codex baseline](verification/generation-playwright-baseline-2026-11-10-codex.json), [Claude isolation check](verification/claude-isolation-check-2026-11-10.json).

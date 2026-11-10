const { chromium } = require("playwright");
// How long the check waits, in total, for controls that render after load.
const SETTLE_MS = 5000;
// A page that did not load has no locators to judge. Reporting them as
// "absent" would present an unchecked thing as checked.
const failedCheck = (message) =>
  Object.assign(new Error(`${message} No locator was checked.`), {
    status: 422,
  });
function getLocator(page, l) {
  if (l.formIndex !== undefined) page = page.locator("form").nth(l.formIndex);
  if (l.kind === "placeholder")
    return page.getByPlaceholder(l.value, { exact: true });
  if (l.kind === "role")
    return page.getByRole(l.role, { name: l.value, exact: true });
  if (l.kind === "label") return page.getByLabel(l.value, { exact: true });
  if (l.kind === "text") return page.getByText(l.value, { exact: true });
  return page.getByTestId(l.value);
}
async function verifyLocators(suite, caseId, { storageState } = {}) {
  const item = suite.cases.find((c) => c.caseId === caseId);
  if (!item) throw Object.assign(new Error("Unknown case."), { status: 404 });
  const actions =
    item.automation?.playwright?.operations ||
    item.automation?.playwright?.steps;
  if (!actions?.length)
    throw Object.assign(
      new Error("Add valid automation actions before checking locators."),
      { status: 409 },
    );
  let browser;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    browser?.close().catch(() => {});
  }, 30000);
  try {
    browser = await chromium.launch({ timeout: 10000 });
    if (timedOut) {
      await browser.close();
      throw new Error("Locator probe timed out.");
    }
    const context = await browser.newContext(
      storageState ? { storageState } : {},
    );
    const origin = new URL(suite.targetUrl).origin;
    const page = await context.newPage();
    const requireTargetSite = () => {
      if (new URL(page.url()).origin !== origin)
        throw failedCheck(
          "Locator check stopped: the target redirected to another site, often a login page.",
        );
    };
    let response;
    try {
      response = await page.goto(suite.targetUrl, {
        timeout: 15000,
        waitUntil: "domcontentloaded",
      });
    } catch (error) {
      const cause = timedOut
        ? "the check timed out"
        : /net::[A-Z_]+/.exec(error.message)?.[0] ||
          (/timeout/i.test(error.message) ? "timeout" : "navigation error");
      throw failedCheck(
        `Locator check could not load the target page (${cause}). Check that the application is running and the URL is correct.`,
      );
    }
    if (response && !response.ok())
      throw failedCheck(
        `Locator check could not load the target page (HTTP ${response.status()}).`,
      );
    requireTargetSite();
    let changed = false;
    let settleBudget = SETTLE_MS;
    const results = [];
    for (const step of actions.slice(0, 12)) {
      let l = step.locator;
      if (!l && ["clickText", "expectText"].includes(step.op))
        l = { kind: "text", value: step.value };
      if (!l && step.op === "fillLabel")
        l = { kind: "label", value: step.label };
      if (l) {
        const loc = getLocator(page, l);
        let count = await loc.count();
        let visible = count === 1 ? await loc.isVisible() : false;
        // Many pages render their controls after load. Before calling an
        // initial-page locator absent or hidden, wait for it. All locators
        // share one budget, so several missing controls cost one wait.
        if (!changed && count <= 1 && !visible && settleBudget > 0) {
          const waitStarted = Date.now();
          await loc
            .first()
            .waitFor({ state: "visible", timeout: settleBudget })
            .catch(() => {});
          settleBudget -= Date.now() - waitStarted;
          count = await loc.count();
          visible = count === 1 ? await loc.isVisible() : false;
        }
        const status =
          count > 1
            ? "ambiguous"
            : changed && (count === 0 || !visible)
              ? "deferred"
              : count === 0
                ? "absent"
                : !visible
                  ? "hidden"
                  : "matched";
        results.push({
          stepId: step.stepId,
          count,
          visible,
          status,
          reason: changed
            ? "Checked in initial page state; later interaction state is not verified."
            : status === "matched"
              ? "Exact locator matched current page."
              : `Locator is ${status} in current page state.`,
        });
      }
      if (["click", "clickText", "fill", "fillLabel"].includes(step.op))
        changed = true;
    }
    // The page can also move while the check waits for late controls.
    requireTargetSite();
    const redirected =
      new URL(page.url()).href !== new URL(suite.targetUrl).href;
    return {
      checkedAt: new Date().toISOString(),
      results,
      redirected,
      // Says only whether a login was used, never which one.
      authenticated: Boolean(storageState),
    };
  } finally {
    clearTimeout(timer);
    await browser?.close();
  }
}
module.exports = { verifyLocators, getLocator };

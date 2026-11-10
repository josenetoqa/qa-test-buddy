const { chromium } = require("playwright");
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
    const page = await context.newPage();
    await page.goto(suite.targetUrl, {
      timeout: 15000,
      waitUntil: "domcontentloaded",
    });
    let changed = false;
    const results = [];
    for (const step of actions.slice(0, 12)) {
      let l = step.locator;
      if (!l && ["clickText", "expectText"].includes(step.op))
        l = { kind: "text", value: step.value };
      if (!l && step.op === "fillLabel")
        l = { kind: "label", value: step.label };
      if (l) {
        const loc = getLocator(page, l);
        const count = await loc.count();
        const visible = count === 1 ? await loc.isVisible() : false;
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
    return { checkedAt: new Date().toISOString(), results };
  } finally {
    clearTimeout(timer);
    await browser?.close();
  }
}
module.exports = { verifyLocators, getLocator };

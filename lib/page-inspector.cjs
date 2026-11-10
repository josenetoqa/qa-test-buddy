const { chromium } = require("playwright");

// What counts as a control. Custom toggles and choices are included by role.
const CONTROL_SELECTOR =
  'input,textarea,select,button,a,[role="button"],[role="textbox"],' +
  '[role="switch"],[role="checkbox"],[role="radio"],[role="combobox"]';
// Deliberately excludes values, arbitrary attributes, cookies, storage and page content.
async function readControls(page) {
  const controls = await page.evaluate((selector) => {
    const clean = (value) =>
      String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
    return Array.from(document.querySelectorAll(selector))
      .filter(
        (el) =>
          el.getClientRects().length &&
          getComputedStyle(el).visibility !== "hidden" &&
          el.type !== "hidden" &&
          !el.closest('[inert],[aria-hidden="true"]'),
      )
      .slice(0, 80)
      .map((el) => {
        const labelled = (el.getAttribute("aria-labelledby") || "")
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent || "")
          .join(" ");
        // A submit, button, or reset input shows its value attribute as its
        // name. That is markup, not text a person typed.
        const buttonInput = el.matches(
          'input[type="submit"],input[type="button"],input[type="reset"]',
        );
        const field =
          !buttonInput && el.matches('input,textarea,select,[role="textbox"]');
        // A custom combobox shows its current value as text, so it is not read.
        const ownText =
          field || buttonInput || el.getAttribute("role") === "combobox"
            ? ""
            : el.innerText;
        // Playwright names a submit, button, or reset input by its value even
        // when a <label> wraps it, so label text is not used for those.
        const name = clean(
          labelled ||
            el.getAttribute("aria-label") ||
            (buttonInput
              ? el.getAttribute("value")
              : Array.from(el.labels || [])
                  .map((label) => label.textContent)
                  .join(" ")) ||
            ownText,
        );
        const placeholder = clean(el.getAttribute("placeholder"));
        const testId = clean(el.getAttribute("data-testid"));
        const formIndex = Array.from(document.forms).indexOf(
          el.form || el.closest("form"),
        );
        const scope = formIndex < 0 ? {} : { formIndex };
        const role =
          el.getAttribute("role") ||
          (el.matches("a[href]")
            ? "link"
            : buttonInput || el.matches("button")
              ? "button"
              : null);
        const locator = testId
          ? { kind: "testId", value: testId, exact: true, ...scope }
          : name &&
              [
                "button",
                "link",
                "switch",
                "checkbox",
                "radio",
                "combobox",
              ].includes(role)
            ? { kind: "role", role, value: name, exact: true, ...scope }
            : field && name
              ? { kind: "label", value: name, exact: true, ...scope }
              : placeholder
                ? {
                    kind: "placeholder",
                    value: placeholder,
                    exact: true,
                    ...scope,
                  }
                : null;
        const result = {
          locator,
          formIndex,
          placeholder,
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute("type") || "",
          name,
          disabled:
            el.matches(":disabled") ||
            el.getAttribute("aria-disabled") === "true",
          required:
            el.required === true || el.getAttribute("aria-required") === "true",
        };
        for (const key of ["min", "max"]) {
          const value = el.getAttribute(key);
          if (value && value.length <= 40 && /^[\d.:+T Z-]+$/.test(value))
            result[key] = value;
        }
        if (
          Number.isInteger(el.maxLength) &&
          el.maxLength >= 0 &&
          el.maxLength <= 1000000
        )
          result.maxLength = el.maxLength;
        return result;
      });
  }, CONTROL_SELECTOR);
  return {
    controls,
    scope:
      "Visible controls only. No controls clicked or fields filled during inspection.",
  };
}
async function inspectPage(targetUrl, { signal, storageState } = {}) {
  let browser;
  const aborted = () =>
    Object.assign(new Error("Page inspection canceled."), {
      name: "AbortError",
      status: 499,
    });
  const cancel = () => {
    void browser?.close().catch(() => {});
  };
  try {
    if (signal?.aborted) throw aborted();
    const origin = new URL(targetUrl).origin;
    signal?.addEventListener("abort", cancel, { once: true });
    browser = await chromium.launch({ timeout: 10000 });
    if (signal?.aborted) throw aborted();
    const context = await browser.newContext({
      serviceWorkers: "block",
      ...(storageState ? { storageState } : {}),
    });
    await context.route("**/*", (route) =>
      route.request().isNavigationRequest() &&
      new URL(route.request().url()).origin !== origin
        ? route.abort()
        : route.continue(),
    );
    const page = await context.newPage();
    const response = await page.goto(targetUrl, {
      timeout: 15000,
      waitUntil: "domcontentloaded",
    });
    if (!response?.ok() || new URL(page.url()).origin !== origin)
      throw new Error("Invalid response");
    await page
      .locator(
        CONTROL_SELECTOR.split(",")
          .map((part) => part + ":visible")
          .join(","),
      )
      .first()
      .waitFor({ timeout: 5000 });
    const result = await readControls(page);
    if (!result.controls.length) throw new Error("No visible controls");
    return {
      ...result,
      scope: "Initial page only. No controls clicked or fields filled.",
    };
  } catch (error) {
    if (signal?.aborted || error.name === "AbortError") throw aborted();
    throw Object.assign(
      new Error(
        "Page inspection failed. Check the URL and use a page accessible with the selected authentication and visible controls. Redirects to other sites are not inspected.",
      ),
      { status: 422 },
    );
  } finally {
    signal?.removeEventListener("abort", cancel);
    await browser?.close().catch(() => {});
  }
}
module.exports = { inspectPage, readControls };

const test = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createServer } = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
let server, browser, base;

test.before(async () => {
  server = createServer(async (req, res) => {
    const file = req.url === "/" ? "index.html" : req.url.slice(1);
    if (!["index.html", "app.js", "styles.css"].includes(file)) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html");
    res.end(await fs.readFile(path.join(__dirname, "..", file)));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
test.after(async () => {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
});

async function fixture({ providers = true, runner = true, viewport } = {}) {
  const page = await browser.newPage(viewport ? { viewport } : {});
  const submissions = [];
  let completed = false;
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    let data = {};
    if (url.pathname === "/api/capabilities") data = {
      generationJobs: true,
      providers: [{ id: "codex", label: "Codex CLI", available: providers }],
      runners: { playwright: { available: runner, reason: runner ? "" : "Chromium is not installed." } },
    };
    else if (url.pathname === "/api/auth/profiles") data = { profiles: [] };
    else if (url.pathname === "/api/runs") data = { runs: [] };
    else if (url.pathname === "/api/page-states") data = { states: [] };
    else if (url.pathname === "/api/generations") {
      submissions.push(route.request().postDataJSON());
      data = { generationId: "config-job", status: "running", stage: "generating" };
    } else if (url.pathname === "/api/generations/config-job") data = completed
      ? { status: "failed", error: "Provider unavailable. Try again." }
      : { generationId: "config-job", status: "running", stage: "generating" };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(base);
  await page.waitForFunction(() => !document.querySelector("#provider").textContent.includes("Checking"));
  return { page, submissions, finish: () => { completed = true; } };
}

test("configuration starts in manual mode with a useful next step", async () => {
  const { page } = await fixture();
  try {
    assert.equal(await page.locator("#manual-mode").getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator("#url-field").isVisible(), false);
    assert.match(await page.locator("#setup-status").textContent(), /Add requirements/);
    await page.locator("#requirements").fill("Saving a valid contact shows a confirmation.");
    assert.match(await page.locator("#setup-status").textContent(), /Ready to generate/);
    assert.match(await page.locator("#setup-output").textContent(), /Manual test cases/);
    assert.match(await page.locator("#requirements-count").textContent(), /44 \/ 20,000/);
  } finally { await page.close(); }
});

test("switching output preserves work and removes irrelevant URL validation", async () => {
  const { page, submissions, finish } = await fixture();
  try {
    await page.locator("#requirements").fill("Keep these requirements");
    await page.locator('input[name="framework"]').check();
    assert.equal(await page.locator("#manual-mode").getAttribute("aria-pressed"), "false");
    assert.match(await page.locator("#setup-status").textContent(), /Add a target URL/);
    await page.locator("#target-url").fill("not-a-url");
    await page.locator("#manual-mode").click();
    assert.equal(await page.locator("#requirements").inputValue(), "Keep these requirements");
    assert.equal(await page.locator("#url-field").isVisible(), false);
    await page.locator("#generate-button").click();
    await page.waitForFunction(() => document.querySelector("#configure-generation-feedback").textContent.includes("Generating"));
    assert.deepEqual(submissions[0].frameworks, []);
    finish();
  } finally { await page.close(); }
});

test("unsupported target URLs are explained inline and cannot be submitted", async () => {
  const { page, submissions } = await fixture();
  try {
    await page.locator("#requirements").fill("Check save");
    await page.locator('input[name="framework"]').check();
    await page.locator("#target-url").fill("ftp://example.test/");
    await page.locator("#requirements").click();
    assert.equal(await page.locator("#target-url").getAttribute("aria-invalid"), "true");
    assert.match(await page.locator("#target-url-error").textContent(), /http:\/\/ or https:\/\//);
    await page.locator("#generate-button").click();
    assert.equal(await page.locator("#target-url").evaluate(el => el === document.activeElement), true);
    assert.equal(submissions.length, 0);
    await page.locator("#target-url").fill("https://example.test/form");
    assert.equal(await page.locator("#target-url").getAttribute("aria-invalid"), "false");
    assert.match(await page.locator("#setup-status").textContent(), /Ready to generate/);
  } finally { await page.close(); }
});

test("the requirements outline never replaces existing text", async () => {
  const { page } = await fixture();
  try {
    await page.locator("#requirements-outline").click();
    assert.match(await page.locator("#requirements").inputValue(), /Expected behavior:/);
    assert.equal(await page.locator("#requirements").evaluate(el => el === document.activeElement), true);
    assert.equal(await page.locator("#requirements-outline").isVisible(), false);
    await page.locator("#requirements").fill("My original requirements");
    // Even a programmatic duplicate click cannot overwrite entered work.
    await page.locator("#requirements-outline").evaluate(el => el.click());
    assert.equal(await page.locator("#requirements").inputValue(), "My original requirements");
  } finally { await page.close(); }
});

test("missing CLI explains disabled generation while keeping the demo available", async () => {
  const { page } = await fixture({ providers: false });
  try {
    await page.locator("#requirements").fill("Check save");
    assert.equal(await page.locator("#generate-button").isDisabled(), true);
    assert.match(await page.locator("#setup-status").textContent(), /AI CLI/);
    assert.match(await page.locator("#setup-hint").textContent(), /Codex|Claude/);
    assert.equal(await page.locator("#demo-button").isEnabled(), true);
    assert.equal(await page.locator("#refresh-readiness").isVisible(), true);
  } finally { await page.close(); }
});

test("generation progress and failure stay visible beside the configuration action", async () => {
  const { page, finish, submissions } = await fixture();
  try {
    await page.locator("#requirements").fill("Check save");
    await page.locator("#generate-button").click();
    await page.waitForFunction(() => document.querySelector("#configure-generation-feedback").textContent.includes("Generating"));
    assert.equal(await page.locator("#generate-button").isDisabled(), true);
    assert.equal(submissions.length, 1);
    finish();
    await page.waitForFunction(() => document.querySelector("#configure-generation-feedback").textContent.includes("Provider unavailable"));
    assert.equal(await page.locator("#generate-button").isEnabled(), true);
    assert.equal(await page.locator("#requirements").inputValue(), "Check save");
  } finally { await page.close(); }
});

test("mobile configuration keeps advanced settings usable without horizontal scrolling", async () => {
  const { page } = await fixture({ viewport: { width: 375, height: 812 } });
  try {
    await page.locator("#generation-context summary").click();
    await page.locator("#context-acceptanceCriteria").fill("One criterion\nAnother criterion");
    await page.locator("#generation-context summary").click();
    await page.locator("#execution-options summary").click();
    await page.locator("#slow-mo").fill("250");
    await page.locator("#execution-options summary").click();
    await page.locator("#generation-context summary").click();
    assert.equal(await page.locator("#context-acceptanceCriteria").inputValue(), "One criterion\nAnother criterion");
    assert.equal(await page.locator("#slow-mo").inputValue(), "250");
    await page.locator("#generate-button").scrollIntoViewIfNeeded();
    assert.equal(await page.locator("#generate-button").isVisible(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  } finally { await page.close(); }
});

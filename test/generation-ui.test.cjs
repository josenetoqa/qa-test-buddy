const test = require("node:test");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");
const { createServer } = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
let server, browser, base;
test.before(async () => {
  server = createServer(async (req, res) => {
    try {
      res.setHeader(
        "content-type",
        req.url.endsWith(".js")
          ? "text/javascript"
          : req.url.endsWith(".css")
            ? "text/css"
            : "text/html",
      );
      res.end(
        await fs.readFile(
          path.join(
            __dirname,
            "..",
            req.url === "/" ? "index.html" : req.url.slice(1),
          ),
        ),
      );
    } catch {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
test.after(async () => {
  await browser?.close();
  await new Promise((r) => server.close(r));
});
test("generation jobs reconnect, preserve old suite on cancel, map coverage, and regenerate selected cases", async () => {
  const page = await browser.newPage();
  let status = "running",
    input,
    regenerate;
  const suite = {
    suiteId: "suite1",
    revision: 1,
    provider: "codex",
    generationInput: {
      requirements: "Check login",
      frameworks: [],
      context: { userRole: "Agent" },
    },
    cases: [
      {
        caseId: "c1",
        displayId: "TC-001",
        title: "Login",
        steps: ["Login"],
        expected: "Dashboard",
        automation: {},
      },
    ],
    quality: {
      coverage: [{ requirementId: "R1", text: "Login", caseIds: ["c1"] }],
      uncovered: ["R2"],
      warnings: ["Review missing behavior"],
    },
    generation: { metrics: { totalMs: 120, repairCount: 1, cacheHit: true } },
  };
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let data = {};
    if (p === "/api/capabilities")
      data = {
        generationJobs: true,
        providers: [{ id: "codex", label: "Codex", available: true }],
        runners: { playwright: { available: true } },
      };
    else if (p === "/api/auth/profiles") data = { profiles: [] };
    else if (p === "/api/runs") data = { runs: [] };
    else if (p === "/api/generations") {
      input = route.request().postDataJSON();
      regenerate = input.regenerate;
      data = { generationId: "g1", status: "running", stage: "generating" };
    } else if (p.endsWith("/cancel")) {
      status = "canceled";
      data = { generationId: "g1", status };
    } else if (p === "/api/generations/g1")
      data = {
        generationId: "g1",
        status,
        stage: "validating",
        ...(status === "completed" ? { suite } : {}),
      };
    else if (p.startsWith("/api/suites/")) data = suite;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  try {
    await page.goto(base);
    await page.locator("#requirements").fill("Check login");
    await page.locator("#generation-context summary").click();
    await page.locator("#context-userRole").fill("Agent");
    await page.locator("#generate-button").click();
    await page.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("test-buddy-workspace"))
          ?.generationId === "g1",
    );
    assert.equal(input.context.userRole, "Agent");
    await page.reload();
    await page.locator("#cancel-generation").waitFor();
    status = "completed";
    await page.locator("#generated-state").waitFor();
    assert.match(
      await page.locator("#generation-quality").textContent(),
      /not execution proof/,
    );
    assert.match(await page.locator("#generation-quality").textContent(), /R2/);
    assert.match(
      await page.locator("#generation-quality").textContent(),
      /TC-001/,
    );
    await page.locator("#cases-pane input[type=checkbox]").check();
    status = "running";
    await page
      .getByRole("button", { name: "Regenerate selected", exact: true })
      .click();
    await page.waitForFunction(
      () => document.querySelector("#cancel-generation").hidden === false,
    );
    assert.deepEqual(regenerate, {
      suiteId: "suite1",
      expectedRevision: 1,
      caseIds: ["c1"],
    });
    await page.locator("#cancel-generation").click();
    await page.locator("#generated-state").waitFor();
    assert.equal(await page.locator("#cases-pane .case-card").count(), 1);
  } finally {
    await page.close();
  }
});
test("page capture requires setup steps and sends selected states and context to generation", async () => {
  const page = await browser.newPage();
  const posts = [];
  await page.route("**/api/**", async (route) => {
    const req = route.request(),
      p = new URL(req.url()).pathname;
    let data = {};
    if (req.method() === "POST")
      posts.push({ path: p, body: req.postDataJSON() });
    if (p === "/api/capabilities")
      data = {
        generationJobs: true,
        providers: [{ id: "codex", label: "Codex", available: true }],
        runners: { playwright: { available: true } },
      };
    else if (p === "/api/auth/profiles") data = { profiles: [] };
    else if (p === "/api/runs") data = { runs: [] };
    else if (p === "/api/page-captures")
      data = { captureId: "capture1", status: "open" };
    else if (p === "/api/page-states")
      data = {
        states: [
          {
            stateId: "state1",
            label: "Open dialog",
            setupSteps: ["Click Add"],
          },
        ],
      };
    else if (p === "/api/generations")
      data = { generationId: "g2", status: "running" };
    else if (p === "/api/generations/g2")
      data = { generationId: "g2", status: "failed", error: "Invalid output" };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  try {
    await page.goto(base);
    await page.locator("#requirements").fill("Save a contact");
    await page.locator("#page-state-options summary").click();
    await page.locator("#target-url").fill("https://example.com");
    await page.locator("#open-capture").click();
    await page.locator("#save-capture").click();
    assert.equal(posts.filter((p) => p.path.endsWith("/snapshot")).length, 0);
    assert.match(
      await page.locator("#capture-feedback").textContent(),
      /setup steps/,
    );
    await page.locator("#capture-label").fill("Open dialog");
    await page.locator("#capture-steps").fill("Click Add\nChoose contact");
    await page.locator("#save-capture").click();
    await page.locator("#page-states input").check();
    await page.locator("#generate-button").click();
    await page.locator("#error-state").waitFor();
    assert.deepEqual(posts.find((p) => p.path.endsWith("/snapshot")).body, {
      label: "Open dialog",
      setupSteps: ["Click Add", "Choose contact"],
    });
    assert.deepEqual(
      posts.find((p) => p.path === "/api/generations").body.pageStateIds,
      ["state1"],
    );
  } finally {
    await page.close();
  }
});
test("expired generation clears busy state and acceptance criteria preserve separate lines", async () => {
  const page = await browser.newPage();
  await page.addInitScript(() =>
    localStorage.setItem(
      "test-buddy-workspace",
      JSON.stringify({ generationId: "expired-job" }),
    ),
  );
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let status = 200,
      data = {};
    if (p === "/api/capabilities")
      data = {
        generationJobs: true,
        providers: [{ id: "codex", label: "Codex", available: true }],
        runners: { playwright: { available: true } },
      };
    else if (p === "/api/auth/profiles") data = { profiles: [] };
    else if (p === "/api/runs") data = { runs: [] };
    else if (p === "/api/generations/expired-job") {
      status = 404;
      data = { error: "Generation not found" };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  try {
    await page.goto(base);
    await page.locator("#error-state").waitFor();
    assert.match(
      await page.locator("#error-copy").textContent(),
      /server may have restarted/,
    );
    assert.equal(await page.locator("#generate-button").isDisabled(), false);
    assert.equal(await page.locator("#generation-progress").isVisible(), false);
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("test-buddy-workspace")).generationId,
      ),
      undefined,
    );
    await page.locator("#generation-context summary").click();
    await page
      .locator("textarea#context-acceptanceCriteria")
      .fill("Accept valid input\nReject empty input");
    assert.equal(
      await page.locator("#context-acceptanceCriteria").inputValue(),
      "Accept valid input\nReject empty input",
    );
    assert.equal(
      await page
        .locator("#context-acceptanceCriteria")
        .getAttribute("maxlength"),
      "4000",
    );
  } finally {
    await page.close();
  }
});
test("reconnecting a generation preserves edits made while disconnected, including after reload", async () => {
  for (const reload of [false, true]) {
    const page = await browser.newPage();
    let complete = false;
    const suite = {
      suiteId: "s",
      revision: 1,
      generationInput: { requirements: "Original", frameworks: [] },
      cases: [],
    };
    await page.route("**/api/**", async (route) => {
      const p = new URL(route.request().url()).pathname;
      let status = 200,
        data = {};
      if (p === "/api/capabilities")
        data = {
          generationJobs: true,
          providers: [{ id: "codex", label: "Codex", available: true }],
          runners: { playwright: { available: true } },
        };
      else if (p === "/api/auth/profiles") data = { profiles: [] };
      else if (p === "/api/runs") data = { runs: [] };
      else if (p === "/api/generations")
        data = { generationId: "g", status: "running" };
      else if (p === "/api/generations/g") {
        status = complete ? 200 : 503;
        data = complete
          ? { status: "completed", suite }
          : { error: "Disconnected" };
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    });
    try {
      await page.goto(base);
      await page.locator("#requirements").fill("Original");
      await page.locator("#generate-button").click();
      await page.locator("#reconnect-generation").waitFor();
      if (reload) {
        await page.reload();
        await page.locator("#reconnect-generation").waitFor();
      }
      await page.locator("#requirements").fill("Keep my edits");
      complete = true;
      await page.locator("#reconnect-generation").click();
      await page.locator("#generated-state").waitFor();
      assert.equal(
        await page.locator("#requirements").inputValue(),
        "Keep my edits",
      );
    } finally {
      await page.close();
    }
  }
});
test("unavailable selected states can be removed and changing targets clears state selection", async () => {
  const page = await browser.newPage();
  let states = [{ stateId: "s1", label: "Dialog" }];
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const data =
      p === "/api/capabilities"
        ? {
            providers: [{ id: "codex", label: "Codex", available: true }],
            runners: { playwright: { available: true } },
          }
        : p === "/api/page-states"
          ? { states }
          : p === "/api/auth/profiles"
            ? { profiles: [] }
            : { runs: [] };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  try {
    await page.goto(base);
    await page.locator("#page-state-options summary").click();
    await page.locator("#target-url").fill("https://example.com");
    await page.locator("#refresh-states").click();
    await page.locator("#page-states input").check();
    states = [];
    await page.locator("#refresh-states").click();
    await page
      .getByRole("button", { name: "Remove unavailable state" })
      .click();
    assert.equal(await page.locator("#page-states").textContent(), "");
    states = [{ stateId: "s1", label: "Dialog" }];
    await page.locator("#refresh-states").click();
    await page.locator("#page-states input").check();
    await page.locator("#target-url").fill("https://other.example.com");
    assert.equal(await page.locator("#page-states input:checked").count(), 0);
  } finally {
    await page.close();
  }
});
test("capture controls block duplicate starts and recover after expiration", async () => {
  const page = await browser.newPage();
  let starts = 0;
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    let status = 200,
      data = {};
    if (p === "/api/capabilities")
      data = {
        providers: [{ id: "codex", label: "Codex", available: true }],
        runners: { playwright: { available: true } },
      };
    else if (p === "/api/auth/profiles") data = { profiles: [] };
    else if (p === "/api/runs") data = { runs: [] };
    else if (p === "/api/page-captures") {
      starts++;
      await new Promise((r) => setTimeout(r, 300));
      data = { captureId: "capture" };
    } else if (p.endsWith("/snapshot")) {
      status = 422;
      data = { error: "Capture expired or closed." };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  try {
    await page.goto(base);
    await page.locator("#page-state-options summary").click();
    await page.locator("#target-url").fill("https://example.com");
    await page.evaluate(() => {
      document.querySelector("#open-capture").click();
      document.querySelector("#open-capture").click();
    });
    assert.equal(await page.locator("#open-capture").isDisabled(), true);
    await page.waitForFunction(
      () => !document.querySelector("#save-capture").disabled,
    );
    assert.equal(starts, 1);
    await page.locator("#capture-label").fill("Dialog");
    await page.locator("#capture-steps").fill("Open dialog");
    await page.locator("#save-capture").click();
    await page.waitForFunction(
      () => !document.querySelector("#open-capture").disabled,
    );
    assert.equal(await page.locator("#save-capture").isDisabled(), true);
    assert.equal(await page.locator("#close-capture").isDisabled(), true);
    assert.match(
      await page.locator("#capture-feedback").textContent(),
      /expired/,
    );
  } finally {
    await page.close();
  }
});

test("saved multiline criteria survive reload before opening optional context", async () => {
  const page = await browser.newPage();
  const context = {
    acceptanceCriteria: "Accept valid input\nReject empty input",
  };
  const suite = {
    suiteId: "criteria-suite",
    revision: 1,
    provider: "codex",
    generationInput: {
      requirements: "Validate input",
      format: "plain",
      frameworks: [],
      context,
    },
    cases: [
      {
        caseId: "c1",
        displayId: "TC-001",
        title: "Validate",
        steps: ["Check"],
        expected: "Accepted",
        automation: {},
      },
    ],
  };
  await page.addInitScript(() =>
    localStorage.setItem(
      "test-buddy-workspace",
      JSON.stringify({ suiteId: "criteria-suite", revision: 1 }),
    ),
  );
  await page.route("**/api/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const data =
      p === "/api/capabilities"
        ? {
            generationJobs: true,
            providers: [{ id: "codex", label: "Codex", available: true }],
            runners: { playwright: { available: true } },
          }
        : p.startsWith("/api/suites/")
          ? suite
          : p === "/api/auth/profiles"
            ? { profiles: [] }
            : { runs: [] };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  try {
    await page.goto(base);
    await page.locator("#generated-state").waitFor();
    assert.equal(
      await page.locator("#context-acceptanceCriteria").inputValue(),
      context.acceptanceCriteria,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Regenerate case", exact: true })
        .isDisabled(),
      false,
    );
  } finally {
    await page.close();
  }
});

test("replacement page evidence allows regeneration but changed requirements still block it", async () => {
  const page = await browser.newPage();
  let submitted;
  const suite = {
    suiteId: "evidence-suite", revision: 1, provider: "codex", targetUrl: "https://example.test/",
    generationInput: { requirements: "Check Save", format: "plain", frameworks: ["playwright"], targetUrl: "https://example.test/", pageStateIds: ["expired"] },
    cases: [{ caseId: "c1", displayId: "TC-001", title: "Save", steps: ["Save"], expected: "Saved", automation: {} }],
  };
  await page.addInitScript(() => localStorage.setItem("test-buddy-workspace", JSON.stringify({ suiteId: "evidence-suite", revision: 1 })));
  await page.route("**/api/**", async route => {
    const p = new URL(route.request().url()).pathname;
    let data = {};
    if (p === "/api/capabilities") data = { generationJobs: true, providers: [{ id: "codex", label: "Codex", available: true }], runners: { playwright: { available: true } } };
    else if (p.startsWith("/api/suites/")) data = suite;
    else if (p === "/api/auth/profiles") data = { profiles: [] };
    else if (p === "/api/runs") data = { runs: [] };
    else if (p === "/api/page-states") data = { states: [{ stateId: "fresh", label: "New capture" }] };
    else if (p === "/api/generations") { submitted = route.request().postDataJSON(); data = { generationId: "g-evidence", status: "running" }; }
    else if (p === "/api/generations/g-evidence") data = { status: "failed", error: "Controlled stop" };
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  try {
    await page.goto(base);
    await page.locator("#generated-state").waitFor();
    await page.locator("#page-state-options summary").click();
    await page.locator("#refresh-states").click();
    await page.getByRole("button", { name: "Remove unavailable state" }).click();
    await page.locator('#page-states input[value="fresh"]').check();
    const regenerate = page.getByRole("button", { name: "Regenerate case", exact: true });
    assert.equal(await regenerate.isDisabled(), false);
    await page.locator("#requirements").fill("Changed behavior");
    assert.equal(await regenerate.isDisabled(), true);
    await page.locator("#requirements").fill("Check Save");
    await regenerate.click();
    await page.waitForFunction(() => document.querySelector("#workspace-notice").textContent.includes("Controlled stop"));
    assert.deepEqual(submitted.pageStateIds, ["fresh"]);
    assert.deepEqual(submitted.regenerate.caseIds, ["c1"]);
  } finally { await page.close(); }
});

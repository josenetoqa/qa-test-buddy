const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { createGenerationService } = require("./lib/generation-service.cjs");
const { callProvider } = require("./lib/generation-provider.cjs");
const { createPageStates } = require("./lib/page-states.cjs");
const { inspectPage } = require("./lib/page-inspector.cjs");
const { randomUUID } = require("node:crypto");
const suiteStore = require("./lib/suite.cjs");
const { createSuite, getSuite, reviewCases, reviseSuite, hydrateSuites } =
  suiteStore;
const { compileCase } = require("./lib/playwright-compiler.cjs");
const { createRunManager } = require("./lib/run-manager.cjs");
const { checkReadiness } = require("./lib/readiness.cjs");
const { verifyLocators } = require("./lib/locator-verifier.cjs");
const { createArtifactStore } = require("./lib/artifacts.cjs");
const { createHistoryStore } = require("./lib/history-store.cjs");
const {
  exportRun,
  exportSuiteCode,
  exportSuiteCases,
} = require("./lib/export.cjs");
const { createAuthProfiles } = require("./lib/auth-profiles.cjs");

const cliArgs = process.argv.slice(2);
const argValue = (name) => {
  const index = cliArgs.indexOf(name);
  return index !== -1 ? cliArgs[index + 1] : undefined;
};
const HOST = argValue("--host") || process.env.HOST || "127.0.0.1";
const PORT = Number(argValue("--port") || process.env.PORT || 4173);
const ROOT = __dirname;
const MAX_BODY = 256 * 1024;
const DATA_ROOT = path.resolve(
  process.env.TEST_BUDDY_DATA_DIR || path.join(ROOT, ".test-buddy-data"),
);
const RUNS_ROOT = path.join(DATA_ROOT, "runs");
const history = createHistoryStore({ root: DATA_ROOT, runsRoot: RUNS_ROOT });
const artifacts = createArtifactStore({ runsRoot: RUNS_ROOT });
const auth = createAuthProfiles({ root: path.join(DATA_ROOT, "auth") });
const restored = history.loadHistory();
hydrateSuites(restored.suites);
const manager = createRunManager({
  root: ROOT,
  runsRoot: RUNS_ROOT,
  suiteStore,
  compileCase,
  artifacts,
  history,
  resolveProfile: (id, origin) => auth.resolveProfile(id, origin),
});
manager.hydrateRuns(restored.runs);
suiteStore.configureRetention(() => history.getReferences());
const providers = {
  codex: { label: "Codex CLI", command: "codex" },
  claude: { label: "Claude CLI", command: "claude" },
};

const pageStates = createPageStates({
  resolveProfile: (id, url) => auth.resolveProfile(id, new URL(url).origin),
});
const generation = createGenerationService({
  suiteStore,
  saveSuite: (suite) => history.saveSuite(suite),
  inspect: inspectPage,
  getStates: (ids, url) => (ids.length ? pageStates.getMany(ids, url) : []),
  callProvider: async (prompt, input, options) => {
    if (!(await detect(input.provider)))
      throw Object.assign(new Error("The selected AI CLI was not detected."), {
        status: 409,
      });
    return callProvider(prompt, input, options);
  },
});
function detect(command) {
  return new Promise((resolve) =>
    execFile("/usr/bin/which", [command], { timeout: 3000 }, (error, stdout) =>
      resolve(!error && Boolean(stdout.trim())),
    ),
  );
}

async function capabilities(refresh = false) {
  const [codex, claude, pathPlaywright, pathCypress] = await Promise.all([
    detect("codex"),
    detect("claude"),
    detect("playwright"),
    detect("cypress"),
  ]);
  const localPlaywright = path.join(ROOT, "node_modules", ".bin", "playwright");
  const localCypress = path.join(ROOT, "node_modules", ".bin", "cypress");
  const playwrightLocal = fs.existsSync(localPlaywright);
  const cypressLocal = fs.existsSync(localCypress);
  const readiness = await checkReadiness({
    playwrightCommand: playwrightLocal ? localPlaywright : null,
    refresh,
  });
  return {
    generationJobs: true,
    providers: [
      { id: "codex", label: providers.codex.label, available: codex },
      { id: "claude", label: providers.claude.label, available: claude },
    ],
    runners: {
      playwright: {
        ...readiness,
        command: playwrightLocal ? localPlaywright : null,
      },
      cypress: {
        available: false,
        installed: cypressLocal || pathCypress,
        command: null,
        reason:
          "Optional independent Cypress support requires phase 8. Playwright is the implemented runner.",
      },
    },
  };
}

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    let tooLarge = false;
    req.on("data", (part) => {
      if (tooLarge) return;
      data += part;
      if (Buffer.byteLength(data) > MAX_BODY) {
        tooLarge = true;
        reject(
          Object.assign(new Error("Request body is too large."), {
            status: 413,
          }),
        );
      }
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        resolve(JSON.parse(data || "{}"));
      } catch {
        reject(
          Object.assign(new Error("Request must contain valid JSON."), {
            status: 400,
          }),
        );
      }
    });
    req.on("error", reject);
  });
}

function validateUrl(value) {
  try {
    const parsed = new URL(value);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      return false;
    return true;
  } catch {
    return false;
  }
}

function validateStep(step) {
  if (
    !step ||
    !["navigate", "clickText", "fillLabel", "expectText"].includes(step.op)
  )
    throw new Error("The response included an unsupported automation action.");
  if (step.op === "fillLabel") {
    if (
      typeof step.label !== "string" ||
      !step.label.trim() ||
      step.label.length > 160 ||
      typeof step.text !== "string" ||
      step.text.length > 1000
    )
      throw new Error("A generated field-entry action was invalid.");
    return { op: step.op, label: step.label.trim(), text: step.text };
  }
  if (
    typeof step.value !== "string" ||
    !step.value.trim() ||
    step.value.length > 1000
  )
    throw new Error("A generated automation step was invalid.");
  if (step.op === "navigate" && !validateUrl(step.value))
    throw new Error("A generated navigation URL was invalid.");
  return { op: step.op, value: step.value.trim() };
}

function decorateSuite(suite) {
  suite.cases.forEach((item) => {
    for (const framework of ["playwright", "cypress"]) {
      const draft = item.automation?.[framework];
      if (
        draft &&
        ["draft", "ready"].includes(draft.status) &&
        (draft.operations || draft.steps)?.length
      ) {
        try {
          draft.code =
            framework === "playwright"
              ? compileCase(suite, item.caseId).source
              : "";
          if (framework === "cypress")
            draft.reason = "Optional Cypress execution is not enabled.";
        } catch (error) {
          draft.code = "";
          draft.reason = error.message;
        }
      }
    }
  });
  return suite;
}
function demoSuite() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(ROOT, "demo", "suite.json"), "utf8"),
  );
  const suite = createSuite(raw, {
    provider: "demo",
    targetUrl: `http://${HOST}:${PORT}/demo/`,
    frameworks: ["playwright"],
  });
  history.saveSuite(suite);
  return decorateSuite(suite);
}
function legacyRun(body) {
  if (
    !["playwright", "cypress"].includes(body.framework) ||
    !validateUrl(body.targetUrl) ||
    !Array.isArray(body.steps)
  )
    throw Object.assign(
      new Error("Valid legacy framework, target and steps required."),
      { status: 400 },
    );
  const steps = body.steps.map(validateStep);
  const suite = createSuite(
    {
      cases: [
        {
          title: "Framework draft",
          preconditions: "Legacy aggregate request",
          steps: ["Execute the framework draft"],
          expected: "The draft assertion passes",
          requirementRef: "Legacy request",
          automation: { [body.framework]: { status: "draft", steps } },
        },
      ],
    },
    {
      provider: "legacy",
      targetUrl: body.targetUrl,
      frameworks: [body.framework],
    },
  );
  const reviewed = reviewCases(
    suite.suiteId,
    [suite.cases[0].caseId],
    suite.revision,
    body.framework,
  );
  history.saveSuite(suite);
  history.saveSuite(reviewed);
  return {
    schemaVersion: 2,
    suiteId: reviewed.suiteId,
    revision: reviewed.revision,
    selectedCaseIds: [reviewed.cases[0].caseId],
    framework: body.framework,
    mode: "headless",
    idempotencyKey: randomUUID(),
  };
}
function startRun(body) {
  let input = body;
  if (body.schemaVersion !== 2) input = legacyRun(body);
  else if (body.caseId && !body.selectedCaseIds) {
    input = {
      ...body,
      selectedCaseIds: [body.caseId],
      mode: body.mode || "headless",
      idempotencyKey: body.idempotencyKey || randomUUID(),
    };
    delete input.caseId;
  }
  return manager.createRun(input);
}
function sendFile(res, filePath, contentType, downloadName) {
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "content-type": contentType,
    "content-length": stat.size,
    "cache-control": "no-store",
    ...(downloadName
      ? { "content-disposition": `attachment; filename="${downloadName}"` }
      : {}),
  });
  fs.createReadStream(filePath)
    .on("error", () => res.destroy())
    .pipe(res);
}
function sendExport(res, exported, filename) {
  const body = typeof exported === "string" ? exported : exported.body;
  res.writeHead(200, {
    "content-type":
      typeof exported === "string"
        ? "text/javascript; charset=utf-8"
        : exported.contentType,
    "cache-control": "no-store",
    "content-disposition": `attachment; filename="${filename}"`,
  });
  res.end(body);
}

function serveStatic(req, res) {
  const pathname = decodeURIComponent(
    new URL(req.url, `http://${HOST}:${PORT}`).pathname,
  );
  const relative =
    pathname === "/"
      ? "index.html"
      : ["/demo/", "/demo", "/demo.html"].includes(pathname)
        ? "demo/index.html"
        : pathname.replace(/^\/+/, "");
  if (
    ![
      "index.html",
      "app.js",
      "styles.css",
      "demo/index.html",
      "demo/demo.js",
      "demo/demo.css",
    ].includes(relative)
  )
    return send(res, 404, { error: "Not found." });
  const filePath = path.resolve(ROOT, relative);
  if (!filePath.startsWith(`${ROOT}${path.sep}`))
    return send(res, 403, { error: "Forbidden." });
  fs.readFile(filePath, (error, data) => {
    if (error) return send(res, 404, { error: "Not found." });
    const type = filePath.endsWith(".css")
      ? "text/css"
      : filePath.endsWith(".js")
        ? "text/javascript"
        : filePath.endsWith(".html")
          ? "text/html"
          : "application/octet-stream";
    res.writeHead(200, {
      "content-type": `${type}; charset=utf-8`,
      "cache-control": "no-store",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && origin !== `http://${HOST}:${PORT}`)
    return send(res, 403, { error: "Cross-origin requests are not allowed." });
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (req.method === "GET" && url.pathname === "/api/capabilities")
      return send(
        res,
        200,
        await capabilities(url.searchParams.get("refresh") === "1"),
      );
    if (
      req.method === "POST" &&
      ["/api/demo", "/api/demo/suites"].includes(url.pathname)
    )
      return send(res, 200, demoSuite());
    if (req.method === "POST" && url.pathname === "/api/generate")
      return send(
        res,
        200,
        decorateSuite(await generation.generate(await readJson(req))),
      );
    if (req.method === "POST" && url.pathname === "/api/generations")
      return send(res, 202, generation.start(await readJson(req)));
    const generationMatch = url.pathname.match(
      /^\/api\/generations\/([a-zA-Z0-9_-]+)(?:\/(cancel))?$/,
    );
    if (generationMatch) {
      if (req.method === "POST" && generationMatch[2])
        return send(res, 200, await generation.cancel(generationMatch[1]));
      if (req.method === "GET" && !generationMatch[2]) {
        const job = generation.get(generationMatch[1]);
        if (job.suite) job.suite = decorateSuite(job.suite);
        return send(res, 200, job);
      }
    }
    if (req.method === "GET" && url.pathname === "/api/page-states")
      return send(res, 200, {
        states: pageStates.list(url.searchParams.get("targetUrl") || undefined),
      });
    if (req.method === "POST" && url.pathname === "/api/page-captures")
      return send(res, 201, await pageStates.start(await readJson(req)));
    const captureMatch = url.pathname.match(
      /^\/api\/page-captures\/([a-zA-Z0-9_-]+)(?:\/(snapshot))?$/,
    );
    if (captureMatch) {
      if (req.method === "POST" && captureMatch[2])
        return send(
          res,
          201,
          await pageStates.capture(captureMatch[1], await readJson(req)),
        );
      if (req.method === "DELETE" && !captureMatch[2]) {
        await pageStates.closeCapture(captureMatch[1]);
        return send(res, 200, { closed: true });
      }
    }
    if (url.pathname === "/api/auth/profiles") {
      if (req.method === "GET")
        return send(res, 200, { profiles: auth.listProfiles() });
      if (req.method === "POST")
        return send(res, 201, auth.createProfile(await readJson(req)));
    }
    const profileMatch = url.pathname.match(
      /^\/api\/auth\/profiles\/([a-zA-Z0-9_-]+)(?:\/(capture|complete))?$/,
    );
    if (profileMatch) {
      if (req.method === "DELETE" && !profileMatch[2]) {
        await auth.deleteProfile(profileMatch[1]);
        return send(res, 200, { deleted: true });
      }
      if (req.method === "POST" && profileMatch[2] === "capture")
        return send(res, 200, await auth.startCapture(profileMatch[1]));
      if (req.method === "POST" && profileMatch[2] === "complete")
        return send(res, 200, await auth.finishCapture(profileMatch[1]));
    }
    const suiteMatch = url.pathname.match(
      /^\/api\/suites\/([a-zA-Z0-9_-]+)(?:\/(review|export|cases\/([a-zA-Z0-9_-]+)(?:\/(verify))?))?$/,
    );
    if (suiteMatch) {
      const id = suiteMatch[1];
      const revision = url.searchParams.has("revision")
        ? Number(url.searchParams.get("revision"))
        : undefined;
      if (req.method === "GET" && !suiteMatch[2]) {
        const suite = getSuite(id, revision);
        return suite
          ? send(res, 200, decorateSuite(suite))
          : send(res, 404, { error: "Suite revision not found." });
      }
      if (req.method === "GET" && suiteMatch[2] === "export") {
        const suite = getSuite(id, revision);
        if (!suite)
          return send(res, 404, { error: "Suite revision not found." });
        const format = url.searchParams.get("format") || "playwright";
        if (format === "text")
          return sendExport(
            res,
            exportSuiteCases(suite),
            `test-cases-r${suite.revision}.txt`,
          );
        if (format !== "playwright")
          return send(res, 400, {
            error: "Choose text or playwright for suite export.",
          });
        const caseId = url.searchParams.get("caseId") || undefined,
          item = caseId ? suite.cases.find((c) => c.caseId === caseId) : null;
        return sendExport(
          res,
          exportSuiteCode(suite, caseId),
          `${item?.displayId || "playwright-tests"}-r${suite.revision}.spec.cjs`,
        );
      }
      if (req.method === "PATCH" && suiteMatch[2] === "review") {
        const body = await readJson(req);
        if (body.reviewed !== true)
          return send(res, 400, {
            error: "Confirm the actions and assertions were reviewed.",
          });
        const suite = reviewCases(
          id,
          body.caseIds,
          body.expectedRevision,
          body.framework || "playwright",
        );
        history.saveSuite(suite);
        return send(res, 200, decorateSuite(suite));
      }
      if (req.method === "PATCH" && suiteMatch[3] && !suiteMatch[4]) {
        const body = await readJson(req);
        const suite = reviseSuite(id, body.expectedRevision, {
          caseId: suiteMatch[3],
          automationEdit: body.automationEdit,
        });
        history.saveSuite(suite);
        return send(res, 200, decorateSuite(suite));
      }
      if (req.method === "POST" && suiteMatch[4] === "verify") {
        const body = await readJson(req);
        if (
          Object.keys(body).some(
            (key) => !["revision", "authProfileId"].includes(key),
          )
        )
          return send(res, 400, {
            error:
              "Unsupported locator check field. Send the revision and, if needed, a login profile ID.",
          });
        if (
          body.authProfileId !== undefined &&
          (typeof body.authProfileId !== "string" ||
            body.authProfileId.length > 200)
        )
          return send(res, 400, { error: "Invalid authentication profile." });
        const suite = getSuite(id, body.revision);
        if (!suite)
          return send(res, 404, { error: "Suite revision not found." });
        // The browser sends a profile ID only. The server finds the private
        // login state itself, bound to the target's origin.
        const storageState = body.authProfileId
          ? auth.resolveProfile(
              body.authProfileId,
              new URL(suite.targetUrl).origin,
            )
          : undefined;
        const result = await verifyLocators(suite, suiteMatch[3], {
          storageState,
        });
        const updated = suiteStore.recordVerification(
          id,
          suiteMatch[3],
          body.revision,
          result,
        );
        history.saveSuite(updated);
        return send(res, 200, { ...result, suite: decorateSuite(updated) });
      }
    }
    if (req.method === "GET" && url.pathname === "/api/runs")
      return send(
        res,
        200,
        history.listRuns({
          limit: Number(url.searchParams.get("limit") || 20),
          cursor: url.searchParams.get("cursor") || undefined,
        }),
      );
    if (req.method === "POST" && url.pathname === "/api/runs")
      return send(res, 202, startRun(await readJson(req)));
    const runMatch = url.pathname.match(
      /^\/api\/runs\/([a-zA-Z0-9_-]+)(?:\/(cancel|events|export|artifacts\/([a-zA-Z0-9_-]+)))?$/,
    );
    if (runMatch) {
      const run = manager.getRun(runMatch[1]);
      if (!run) return send(res, 404, { error: "Run not found or expired." });
      if (req.method === "GET" && !runMatch[2]) return send(res, 200, run);
      if (req.method === "POST" && runMatch[2] === "cancel")
        return send(res, 200, await manager.cancelRun(run.runId));
      if (req.method === "GET" && runMatch[2] === "events")
        return send(
          res,
          200,
          manager.readEvents(
            run.runId,
            Number(url.searchParams.get("afterSeq") || 0),
          ),
        );
      if (req.method === "GET" && runMatch[2] === "export") {
        const format = url.searchParams.get("format") || "json";
        if (!["json", "markdown"].includes(format))
          return send(res, 400, { error: "Choose JSON or Markdown export." });
        return sendExport(
          res,
          exportRun(run, getSuite(run.suiteId, run.revision), format),
          `test-buddy-${run.runId}.${format === "json" ? "json" : "md"}`,
        );
      }
      if (req.method === "GET" && runMatch[3]) {
        const artifact = artifacts.resolveArtifact(run.runId, runMatch[3]);
        return sendFile(
          res,
          artifact.path,
          artifact.mimeType,
          artifact.kind === "trace" ? "trace.zip" : undefined,
        );
      }
    }
    if (url.pathname.startsWith("/api/"))
      return send(res, 404, { error: "API route not found." });
    if (!["GET", "HEAD"].includes(req.method))
      return send(res, 405, { error: "Method not allowed." });
    return serveStatic(req, res);
  } catch (error) {
    return send(res, error.status || 500, {
      error: error.message || "Request failed.",
    });
  }
});
server.listen(PORT, HOST, () =>
  console.log(`Test Buddy is available at http://${HOST}:${PORT}`),
);
async function shutdown() {
  server.close();
  try {
    await generation.close();
    await pageStates.close();
  } catch {
    /* Best effort browser shutdown. */
  }
  try {
    await manager.close();
  } catch {
    /* Completed shutdown remains best effort. */
  }
  try {
    await auth.close();
  } catch {
    /* Browser may already have closed. */
  }
  process.exit(0);
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);

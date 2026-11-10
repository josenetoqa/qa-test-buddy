const { randomUUID } = require("node:crypto");
const { chromium } = require("playwright");
const { readControls } = require("./page-inspector.cjs");
const CAPTURE_TTL = 5 * 60 * 1000,
  STATE_TTL = 30 * 60 * 1000;
const fail = (message) => Object.assign(new Error(message), { status: 422 });
function safeTarget(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw fail("Invalid target URL.");
  }
  if (!["http:", "https:"].includes(url.protocol))
    throw fail("Target must use HTTP or HTTPS.");
  if (url.username || url.password)
    throw fail("Target URLs cannot contain credentials.");
  if (
    [...url.searchParams.keys()].some((key) =>
      /token|secret|password|credential|authorization|api[-_]?key|session|code/i.test(
        key,
      ),
    ) ||
    url.hash
  )
    throw fail("Target URLs cannot contain sensitive parameters or fragments.");
  return url.href;
}
function createPageStates({
  resolveProfile,
  launch = (options) => chromium.launch(options),
  now = Date.now,
} = {}) {
  const captures = new Map(),
    states = new Map();
  let closed = false;
  const clone = (value) => structuredClone(value);
  async function closeCapture(id) {
    const entry = captures.get(id);
    if (!entry) return;
    entry.canceled = true;
    clearTimeout(entry.timer);
    captures.delete(id);
    await entry.browser?.close().catch(() => {});
  }
  function prune() {
    for (const [id, state] of states)
      if (now() - state.created > STATE_TTL) states.delete(id);
  }
  async function start({ targetUrl, authProfileId } = {}) {
    if (closed) throw fail("Capture manager is closed.");
    for (const [id, entry] of captures)
      if (now() - entry.created > CAPTURE_TTL) await closeCapture(id);
    if (captures.size >= 2)
      throw fail(
        "Close an existing capture before opening another (maximum 2).",
      );
    const target = safeTarget(targetUrl),
      origin = new URL(target).origin;
    const captureId = randomUUID(),
      entry = { created: now(), target, canceled: false };
    captures.set(captureId, entry);
    entry.timer = setTimeout(() => {
      void closeCapture(captureId);
    }, CAPTURE_TTL);
    entry.timer.unref?.();
    try {
      const profile = authProfileId
        ? await resolveProfile?.(authProfileId, target)
        : undefined;
      if (authProfileId && !profile)
        throw fail("Authentication profile is unavailable.");
      if (entry.canceled || closed) throw fail("Capture canceled.");
      entry.browser = await launch({ headless: false, timeout: 10000 });
      if (entry.canceled || closed) {
        await entry.browser.close();
        entry.browser = null;
        throw fail("Capture canceled.");
      }
      const context = await entry.browser.newContext({
        serviceWorkers: "block",
        ...(profile ? { storageState: profile.storageState || profile } : {}),
      });
      await context.route("**/*", (route) =>
        route.request().isNavigationRequest() &&
        new URL(route.request().url()).origin !== origin
          ? route.abort()
          : route.continue(),
      );
      entry.page = await context.newPage();
      await entry.page.goto(target, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      if (entry.canceled || closed) throw fail("Capture canceled.");
      if (new URL(entry.page.url()).origin !== origin)
        throw fail("Capture must stay on the target origin.");
      return { captureId, status: "capturing" };
    } catch {
      const canceled = closed || entry.canceled;
      await closeCapture(captureId);
      throw fail(
        canceled
          ? "Capture canceled or closed."
          : "Unable to open capture browser.",
      );
    }
  }
  async function capture(id, { label, setupSteps } = {}) {
    const entry = captures.get(id);
    if (!entry || now() - entry.created > CAPTURE_TTL) {
      await closeCapture(id);
      throw fail("Capture expired or closed.");
    }
    if (typeof label !== "string" || !label.trim() || label.length > 120)
      throw fail("State label must contain 1–120 characters.");
    if (
      !Array.isArray(setupSteps) ||
      !setupSteps.length ||
      setupSteps.length > 20 ||
      setupSteps.some(
        (step) => typeof step !== "string" || !step.trim() || step.length > 500,
      )
    )
      throw fail(
        "Setup steps must contain 1–20 manual instructions, each at most 500 characters.",
      );
    if (!entry.page) throw fail("Capture browser is still opening.");
    if (new URL(entry.page.url()).origin !== new URL(entry.target).origin)
      throw fail("Capture must stay on the target origin.");
    prune();
    if (states.size >= 20) throw fail("Maximum 20 saved states reached.");
    const { controls, scope } = await readControls(entry.page);
    if (entry.canceled || now() - entry.created > CAPTURE_TTL)
      throw fail("Capture expired or closed.");
    if (new URL(entry.page.url()).origin !== new URL(entry.target).origin)
      throw fail("Capture must stay on the target origin.");
    if (states.size >= 20) throw fail("Maximum 20 saved states reached.");
    const state = {
      stateId: randomUUID(),
      label: label.trim(),
      targetUrl: entry.target,
      controls,
      scope,
      setupSteps: setupSteps.map((s) => s.trim()),
      capturedAt: new Date(now()).toISOString(),
    };
    states.set(state.stateId, { state: clone(state), created: now() });
    return clone(state);
  }
  function list(targetUrl) {
    prune();
    const target = targetUrl ? safeTarget(targetUrl) : null;
    return [...states.values()]
      .filter((s) => !target || s.state.targetUrl === target)
      .map((s) => clone(s.state));
  }
  function getMany(ids, targetUrl) {
    if (!Array.isArray(ids) || ids.length > 20)
      throw fail("Invalid state selection.");
    const target = safeTarget(targetUrl);
    return ids.map((id) => {
      const entry = states.get(id);
      if (!entry || now() - entry.created > STATE_TTL)
        throw fail("Selected state expired or was not found.");
      if (entry.state.targetUrl !== target)
        throw fail("Selected state belongs to a different target.");
      return clone(entry.state);
    });
  }
  async function close() {
    closed = true;
    await Promise.all([...captures.keys()].map(closeCapture));
    states.clear();
  }
  return { start, capture, list, getMany, closeCapture, close };
}
module.exports = { createPageStates };

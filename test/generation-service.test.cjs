const test = require("node:test");
const assert = require("node:assert/strict");
const { createGenerationService } = require("../lib/generation-service.cjs");
const suiteStore = require("../lib/suite.cjs");
const input = {
  requirements: "Display Saved",
  format: "plain",
  frameworks: ["playwright"],
  targetUrl: "https://example.test/form",
  provider: "codex",
};
const item = (key = "c1") => ({
  key,
  title: key,
  preconditions: "",
  steps: ["Click Save"],
  expected: "Saved",
  requirementRef: "R1",
  automation: {
    playwright: {
      status: "draft",
      operations: [{ op: "expectText", value: "Saved" }],
    },
  },
});
function setup(overrides = {}) {
  const saved = [];
  const service = createGenerationService({
    suiteStore,
    saveSuite: (s) => saved.push(s),
    inspect: async () => ({ controls: [{ name: "Save" }] }),
    callProvider: async () => ({ cases: [item()] }),
    ...overrides,
  });
  return { service, saved };
}
test("repairs only invalid cases once and preserves accepted cases", async () => {
  let n = 0;
  const { service } = setup({
    callProvider: async (prompt) => {
      n++;
      if (n === 1) return { cases: [item(), { ...item("c2"), steps: [""] }] };
      assert.match(prompt, /Repair only/);
      return { cases: [{ ...item("c2"), steps: ["Submit"] }] };
    },
  });
  const suite = await service.generate(input);
  assert.equal(n, 2);
  assert.equal(suite.cases.length, 2);
  assert.equal(suite.cases[0].title, "c1");
  assert.equal(suite.generation.metrics.repairCount, 1);
  assert.equal(suite.generation.metrics.acceptedWithoutRepair, 1);
  await service.close();
});
test("inspection failure preserves manual cases with blocked automation", async () => {
  const { service } = setup({
    inspect: async () => {
      throw Error("offline");
    },
  });
  const suite = await service.generate(input);
  assert.equal(suite.cases[0].automation.playwright.status, "blocked");
  assert.match(suite.generation.warnings.join(" "), /inspection/i);
  await service.close();
});
test("cache is exact URL scoped and refresh bypasses it", async () => {
  let n = 0;
  const { service } = setup({
    inspect: async () => {
      n++;
      return { controls: [{ name: "Save" }] };
    },
  });
  await service.generate(input);
  const s = await service.generate(input);
  assert.equal(n, 1);
  assert.equal(s.generation.metrics.cacheHit, true);
  await service.generate({ ...input, refreshInspection: true });
  await service.generate({ ...input, targetUrl: input.targetUrl + "?mode=2" });
  assert.equal(n, 3);
  await service.close();
});
test("cancellation cannot persist late provider output and slot releases after settle", async () => {
  let resolve;
  const { service, saved } = setup({
    callProvider: () => new Promise((r) => (resolve = r)),
  });
  const job = service.start(input);
  while (!resolve) await new Promise((r) => setTimeout(r, 1));
  await service.cancel(job.generationId);
  resolve({ cases: [item()] });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(service.get(job.generationId).status, "canceled");
  assert.equal(saved.length, 0);
  await service.close();
});
test("selected regeneration preserves unchanged cases and old revision", async () => {
  const { service } = setup({
    callProvider: async () => ({ cases: [item("a"), item("b")] }),
  });
  const suite = await service.generate(input);
  let selected = suite.cases[0];
  const other = suite.cases[1];
  const regen = setup({
    callProvider: async () => ({
      cases: [{ ...item(selected.caseId), title: "Updated" }],
    }),
  });
  const updated = await regen.service.generate({
    provider: "codex",
    regenerate: {
      suiteId: suite.suiteId,
      expectedRevision: 1,
      caseIds: [selected.caseId],
    },
  });
  assert.equal(updated.revision, 2);
  assert.equal(updated.cases[0].caseId, selected.caseId);
  assert.equal(updated.cases[0].title, "Updated");
  assert.deepEqual(updated.cases[1], other);
  assert.equal(suiteStore.getSuite(suite.suiteId, 1).cases[0].title, "a");
  await service.close();
  await regen.service.close();
});
test("regeneration detects concurrent revision changes before saving", async () => {
  const base = setup();
  const suite = await base.service.generate(input);
  let resolve;
  const { service, saved } = setup({
    callProvider: () => new Promise((r) => (resolve = r)),
  });
  const job = service.start({
    provider: "codex",
    regenerate: {
      suiteId: suite.suiteId,
      expectedRevision: 1,
      caseIds: [suite.cases[0].caseId],
    },
  });
  while (!resolve) await new Promise((r) => setTimeout(r, 1));
  suiteStore.reviewCases(suite.suiteId, [suite.cases[0].caseId], 1);
  resolve({ cases: [item(suite.cases[0].caseId)] });
  while (service.get(job.generationId).status === "running")
    await new Promise((r) => setTimeout(r, 1));
  assert.equal(service.get(job.generationId).status, "failed");
  assert.equal(saved.length, 0);
  await service.close();
  await base.service.close();
});
test("repair handles non-string malformed expected without crashing other valid cases", async () => {
  let calls = 0;
  const { service } = setup({
    callProvider: async () =>
      ++calls === 1
        ? { cases: [item(), { ...item("c2"), expected: 42 }] }
        : { cases: [item("c2")] },
  });
  const s = await service.generate(input);
  assert.equal(s.cases.length, 2);
  await service.close();
});
test("regeneration cannot replace the original expected outcome with a weaker one", async () => {
  const base = setup();
  const s = await base.service.generate(input);
  const id = s.cases[0].caseId;
  const regen = setup({
    callProvider: async () => ({
      cases: [{ ...item(id), expected: "Save button visible" }],
    }),
  });
  await assert.rejects(
    regen.service.generate({
      provider: "codex",
      regenerate: { suiteId: s.suiteId, expectedRevision: 1, caseIds: [id] },
    }),
    /expected outcome/i,
  );
  assert.equal(suiteStore.getSuite(s.suiteId).revision, 1);
  await regen.service.close();
  await base.service.close();
});
test("failed regeneration persistence leaves the previous revision current", async () => {
  const base = setup();
  const s = await base.service.generate(input);
  const id = s.cases[0].caseId;
  const regen = setup({
    callProvider: async () => ({ cases: [item(id)] }),
    saveSuite: () => {
      throw Error("Disk full");
    },
  });
  await assert.rejects(
    regen.service.generate({
      provider: "codex",
      regenerate: { suiteId: s.suiteId, expectedRevision: 1, caseIds: [id] },
    }),
    /Disk full/,
  );
  assert.equal(suiteStore.getSuite(s.suiteId).revision, 1);
  await regen.service.close();
  await base.service.close();
});
test("extra response metadata cannot discard accepted cases or change their expectations", async () => {
  let calls = 0;
  const { service } = setup({
    callProvider: async () => {
      calls++;
      return {
        schemaVersion: 2,
        cases: [item()],
        explanation: "Extra metadata",
      };
    },
  });
  const s = await service.generate(input);
  assert.equal(calls, 1);
  assert.equal(s.cases[0].expected, "Saved");
  assert.match(s.generation.warnings.join(" "), /metadata/i);
  await service.close();
});
test("unrepairable mapping keys preserve other valid cases and blocked manual case", async () => {
  const { service } = setup({
    callProvider: async () => ({ cases: [item(), { ...item(), key: 45 }] }),
  });
  const s = await service.generate(input);
  assert.equal(s.cases.length, 2);
  assert.equal(s.cases[1].automation.playwright.status, "blocked");
  await service.close();
});

test("two occupied slots reject a third request until canceled work settles", async () => {
  const completions = [];
  const { service } = setup({
    callProvider: () => new Promise((resolve) => completions.push(resolve)),
  });
  const a = service.start(input),
    b = service.start(input);
  while (completions.length < 2) await new Promise((r) => setTimeout(r, 1));
  assert.throws(
    () => service.start(input),
    (error) => error.status === 429,
  );
  await service.cancel(a.generationId);
  assert.throws(
    () => service.start(input),
    (error) => error.status === 429,
  );
  completions[0]({ cases: [item()] });
  completions[1]({ cases: [item()] });
  await service.close();
  assert.equal(service.get(a.generationId).status, "canceled");
  assert.throws(
    () => service.start(input),
    (error) => error.status === 503,
  );
});

test("expired inspection cache triggers fresh inspection", async () => {
  let clock = 1000,
    count = 0;
  const { service } = setup({
    now: () => clock,
    cacheTtlMs: 100,
    inspect: async () => {
      count++;
      return { controls: [{ name: "Save" }] };
    },
  });
  await service.generate(input);
  clock = 1200;
  const result = await service.generate(input);
  assert.equal(count, 2);
  assert.equal(result.generation.metrics.cacheHit, false);
  await service.close();
});

test("regeneration replaces expired capture IDs and persists the selection without changing requirements", async () => {
  let expired = false, key = "c1";
  const { service } = setup({
    getStates: (ids) => {
      if (expired && ids.includes("old")) throw new Error("Selected state expired");
      return ids.map(stateId => ({ stateId, controls: [{ name: "Save" }] }));
    },
    callProvider: async () => ({ cases: [item(key)] }),
  });
  try {
    const original = await service.generate({ ...input, pageStateIds: ["old"] });
    expired = true;
    key = original.cases[0].caseId;
    const updated = await service.generate({
      ...input, requirements: "Untrusted changed requirements", pageStateIds: ["fresh"],
      regenerate: { suiteId: original.suiteId, expectedRevision: original.revision, caseIds: [key] },
    });
    assert.deepEqual(updated.generationInput.pageStateIds, ["fresh"]);
    assert.equal(updated.generationInput.requirements, input.requirements);
    assert.equal(updated.cases[0].expected, original.cases[0].expected);
    assert.deepEqual(suiteStore.getSuite(original.suiteId, original.revision).generationInput.pageStateIds, ["old"]);
    const cleared = await service.generate({ ...input, pageStateIds: [],
      regenerate: { suiteId: updated.suiteId, expectedRevision: updated.revision, caseIds: [key] } });
    assert.deepEqual(cleared.generationInput.pageStateIds, []);
  } finally { await service.close(); }
});

test("capture, generate, expire, recapture and regenerate works with the real state manager", async () => {
  const { createPageStates } = require("../lib/page-states.cjs");
  let time = 0, key = "c1";
  const states = createPageStates({ now: () => time, launch: async () => ({
    close: async () => {},
    newContext: async () => ({ route: async () => {}, newPage: async () => ({
      goto: async () => {}, url: () => input.targetUrl,
      evaluate: async () => [{ locator: { kind: "role", role: "button", value: "Save", exact: true }, tag: "button" }],
    }) }),
  }) });
  const { service } = setup({ getStates: (ids, url) => states.getMany(ids, url), callProvider: async () => ({ cases: [item(key)] }) });
  const capture = async () => {
    const opened = await states.start({ targetUrl: input.targetUrl });
    const snapshot = await states.capture(opened.captureId, { label: "Form", setupSteps: ["Open form"] });
    await states.closeCapture(opened.captureId);
    return snapshot.stateId;
  };
  try {
    const old = await capture();
    const original = await service.generate({ ...input, pageStateIds: [old] });
    key = original.cases[0].caseId;
    time = 31 * 60 * 1000;
    const regenerate = { suiteId: original.suiteId, expectedRevision: original.revision, caseIds: [key] };
    await assert.rejects(service.generate({ ...input, regenerate }), /expired/);
    const fresh = await capture();
    const result = await service.generate({ ...input, pageStateIds: [fresh], regenerate });
    assert.equal(result.revision, original.revision + 1);
    assert.deepEqual(result.generationInput.pageStateIds, [fresh]);
    assert.equal(result.cases[0].expected, original.cases[0].expected);
  } finally { await service.close(); await states.close(); }
});

for (const [label, pageStateIds] of [
  ["duplicate IDs", ["fresh", "fresh"]],
  ["too many IDs", Array.from({ length: 11 }, (_, i) => `state-${i}`)],
  ["non-string IDs", [42]],
  ["non-array selection", "fresh"],
]) {
  test(`regeneration rejects ${label} before invoking the provider`, async () => {
    const base = setup();
    let calls = 0;
    const regen = setup({ callProvider: async () => { calls++; return { cases: [] }; } });
    try {
      const original = await base.service.generate(input);
      await assert.rejects(regen.service.generate({
        provider: "codex", pageStateIds,
        regenerate: { suiteId: original.suiteId, expectedRevision: original.revision, caseIds: [original.cases[0].caseId] },
      }), /distinct captured states/);
      assert.equal(calls, 0);
      assert.deepEqual(suiteStore.getSuite(original.suiteId), original);
    } finally {
      await regen.service.close();
      await base.service.close();
    }
  });
}

test("failed saving of replacement evidence preserves the original selection and allows retry", async () => {
  const base = setup();
  let failSave = true;
  let key;
  const regen = setup({
    callProvider: async () => ({ cases: [item(key)] }),
    saveSuite: () => { if (failSave) throw new Error("Disk full"); },
  });
  try {
    const original = await base.service.generate({ ...input, pageStateIds: ["old"] });
    key = original.cases[0].caseId;
    const request = { provider: "codex", pageStateIds: ["fresh"],
      regenerate: { suiteId: original.suiteId, expectedRevision: original.revision, caseIds: [key] } };
    await assert.rejects(regen.service.generate(request), /Disk full/);
    assert.deepEqual(suiteStore.getSuite(original.suiteId), original);
    failSave = false;
    const updated = await regen.service.generate(request);
    assert.equal(updated.revision, original.revision + 1);
    assert.deepEqual(updated.generationInput.pageStateIds, ["fresh"]);
    assert.deepEqual(suiteStore.getSuite(original.suiteId, original.revision), original);
  } finally {
    await regen.service.close();
    await base.service.close();
  }
});

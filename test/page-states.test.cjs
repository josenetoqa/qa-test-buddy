const test = require("node:test");
const assert = require("node:assert/strict");
const { createPageStates } = require("../lib/page-states.cjs");
function harness() {
  let time = 0,
    closed = 0,
    url;
  const page = {
    goto: async (value) => {
      url = value;
    },
    url: () => url,
    evaluate: async () => [
      {
        locator: { kind: "role", role: "button", value: "Save", exact: true },
        tag: "button",
      },
    ],
  };
  const manager = createPageStates({
    now: () => time,
    launch: async () => ({
      newContext: async () => ({
        route: async () => {},
        newPage: async () => page,
      }),
      close: async () => {
        closed++;
      },
    }),
  });
  return {
    manager,
    page,
    setTime: (value) => {
      time = value;
    },
    closed: () => closed,
  };
}
test("capture requires manual steps, stores independent snapshots, and validates target", async () => {
  const { manager } = harness();
  try {
    const capture = await manager.start({
      targetUrl: "http://localhost:3000/form",
    });
    await assert.rejects(
      manager.capture(capture.captureId, { label: "Dialog", setupSteps: [] }),
      /steps/i,
    );
    const state = await manager.capture(capture.captureId, {
      label: "Dialog",
      setupSteps: ["Click Open"],
    });
    state.controls.length = 0;
    assert.equal(
      manager.getMany([state.stateId], "http://localhost:3000/form")[0].controls
        .length,
      1,
    );
    assert.throws(
      () => manager.getMany([state.stateId], "http://localhost:3000/other"),
      /target/i,
    );
    assert.equal(manager.list().length, 1);
  } finally {
    await manager.close();
  }
});
test("capture expires and closes; states expire separately", async () => {
  const h = harness();
  const cap = await h.manager.start({
    targetUrl: "http://localhost:3000/form",
  });
  const state = await h.manager.capture(cap.captureId, {
    label: "Dialog",
    setupSteps: ["Click Open"],
  });
  h.setTime(300001);
  await assert.rejects(
    h.manager.capture(cap.captureId, {
      label: "Dialog",
      setupSteps: ["Click Open"],
    }),
    /expired/i,
  );
  assert.equal(h.closed(), 1);
  h.setTime(1800001);
  assert.throws(
    () => h.manager.getMany([state.stateId], "http://localhost:3000/form"),
    /expired/i,
  );
  await h.manager.close();
});
test("closing during launch cleans the eventually launched browser", async () => {
  let finish,
    closed = 0;
  const manager = createPageStates({
    launch: () =>
      new Promise((r) => {
        finish = r;
      }),
  });
  const pending = manager.start({ targetUrl: "http://localhost:3000" });
  await manager.close();
  finish({
    close: async () => {
      closed++;
    },
  });
  await assert.rejects(pending, /closed|cancel/i);
  assert.equal(closed, 1);
});
test("cross-origin final URL and credential URLs are rejected", async () => {
  const h = harness();
  await assert.rejects(
    h.manager.start({ targetUrl: "http://user:password@localhost:3000/form" }),
    /credentials/i,
  );
  await assert.rejects(
    h.manager.start({ targetUrl: "http://localhost:3000/form?token=secret" }),
    /sensitive/i,
  );
  await assert.rejects(
    h.manager.start({ targetUrl: "not a URL" }),
    /Invalid target/i,
  );
  const cap = await h.manager.start({
    targetUrl: "http://localhost:3000/form",
  });
  const state = await h.manager.capture(cap.captureId, {
    label: "Dialog",
    setupSteps: ["Click Open"],
  });
  assert.equal(state.targetUrl, "http://localhost:3000/form");
  h.page.url = () => "https://example.com";
  await assert.rejects(
    h.manager.capture(cap.captureId, {
      label: "Dialog",
      setupSteps: ["Click Open"],
    }),
    /origin/i,
  );
  await h.manager.close();
});

test("query target identities stay distinct and active captures are bounded", async () => {
  const h = harness();
  const cap = await h.manager.start({
    targetUrl: "http://localhost:3000/form?view=one",
  });
  const state = await h.manager.capture(cap.captureId, {
    label: "One",
    setupSteps: ["Open dialog"],
  });
  assert.throws(
    () =>
      h.manager.getMany([state.stateId], "http://localhost:3000/form?view=two"),
    /different target/i,
  );
  assert.equal(h.manager.list("http://localhost:3000/form?view=two").length, 0);
  await h.manager.start({ targetUrl: "http://localhost:3000/form?view=two" });
  await assert.rejects(
    h.manager.start({ targetUrl: "http://localhost:3000/form?view=three" }),
    /maximum 2/i,
  );
  await h.manager.close();
});
test("expired snapshots release the twenty-state limit", async () => {
  const h = harness();
  let cap = await h.manager.start({ targetUrl: "http://localhost:3000/form" });
  for (let i = 0; i < 20; i++)
    await h.manager.capture(cap.captureId, {
      label: String(i),
      setupSteps: ["Open dialog"],
    });
  await assert.rejects(
    h.manager.capture(cap.captureId, {
      label: "Full",
      setupSteps: ["Open dialog"],
    }),
    /Maximum 20/i,
  );
  h.setTime(1800001);
  cap = await h.manager.start({ targetUrl: "http://localhost:3000/form" });
  await h.manager.capture(cap.captureId, {
    label: "New",
    setupSteps: ["Open dialog"],
  });
  assert.equal(h.manager.list().length, 1);
  await h.manager.close();
});

test("browser launch failures are not mislabeled as cancellation and release capacity", async () => {
  const manager = createPageStates({ launch: async () => { throw new Error("Executable missing"); } });
  try {
    for (let i = 0; i < 3; i++) {
      await assert.rejects(manager.start({ targetUrl: "https://example.test/" }), /Unable to open capture browser/);
    }
  } finally { await manager.close(); }
});

for (const stage of ["context", "navigation"]) {
  test(`${stage} failure closes the browser and permits another capture`, async () => {
    let failNext = true;
    let closed = 0;
    const targetUrl = "https://example.test/";
    const manager = createPageStates({ launch: async () => ({
      close: async () => { closed++; },
      newContext: async () => {
        if (failNext && stage === "context") throw new Error("Context failed");
        return { route: async () => {}, newPage: async () => ({
          goto: async () => { if (failNext) throw new Error("Navigation failed"); },
          url: () => targetUrl,
        }) };
      },
    }) });
    try {
      await assert.rejects(manager.start({ targetUrl }), /Unable to open capture browser/);
      assert.equal(closed, 1);
      failNext = false;
      const capture = await manager.start({ targetUrl });
      assert.equal(capture.status, "capturing");
      await manager.closeCapture(capture.captureId);
      assert.equal(closed, 2);
    } finally { await manager.close(); }
  });
}

test("closing a capture while reading controls discards the late snapshot", async () => {
  const h = harness();
  let finishRead;
  h.page.evaluate = () => new Promise(resolve => { finishRead = resolve; });
  try {
    const capture = await h.manager.start({ targetUrl: "https://example.test/" });
    const pending = h.manager.capture(capture.captureId, { label: "Form", setupSteps: ["Open form"] });
    const rejected = assert.rejects(pending, /expired or closed/i);
    await h.manager.closeCapture(capture.captureId);
    finishRead([]);
    await rejected;
    assert.deepEqual(h.manager.list(), []);
    assert.equal(h.closed(), 1);
  } finally { await h.manager.close(); }
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
test(
  "real generation API progresses, persists context, regenerates selected cases, rejects stale revision and cancels",
  { timeout: 30000 },
  async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "test-buddy-jobs-api-"));
    const cli = path.join(tmp, "codex");
    fs.writeFileSync(
      cli,
      "#!" +
        process.execPath +
        "\n" +
        `let prompt='';process.stdin.on('data',c=>prompt+=c);process.stdin.on('end',()=>{const marker='Other cases must not be returned. ';const selected=prompt.includes(marker)?JSON.parse(prompt.slice(prompt.indexOf(marker)+marker.length)):null;const cases=selected?selected.map(c=>({key:c.caseId,title:c.title+' revised',preconditions:c.preconditions,steps:c.steps,expected:c.expected,requirementRef:c.requirementRef,automation:{}})):[1,2].map(n=>({key:'case'+n,title:'Verify outcome '+n,preconditions:'Agent is signed in',steps:['Check item '+n],expected:'Outcome '+n,requirementRef:'R1',automation:{}}));setTimeout(()=>console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify({schemaVersion:2,cases})}})),prompt.includes('CANCEL_ME')?10000:350);});`,
      { mode: 0o700 },
    );
    const child = spawn(process.execPath, ["server.js"], {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        PORT: "4291",
        PATH: tmp + path.delimiter + process.env.PATH,
        TEST_BUDDY_DATA_DIR: path.join(tmp, "data"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c));
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Startup timeout " + stderr)),
          10000,
        );
        child.once("error", reject);
        child.stdout.on("data", (c) => {
          if (c.toString().includes("available at")) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.once("exit", (code) => {
          clearTimeout(timer);
          reject(Error("Server exited " + code + " " + stderr));
        });
      });
      async function api(route, body, method = "POST", expected = 200) {
        const response = await fetch("http://127.0.0.1:4291" + route, {
          method,
          headers: { "content-type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const data = await response.json();
        assert.equal(response.status, expected, JSON.stringify(data));
        return data;
      }
      async function wait(id) {
        for (let i = 0; i < 100; i++) {
          const job = await api("/api/generations/" + id, null, "GET");
          if (job.status !== "running") return job;
          await new Promise((r) => setTimeout(r, 50));
        }
        throw Error("Job timed out");
      }
      const context = {
        acceptanceCriteria: "Agent can check outcomes",
        userRole: "Agent",
        preconditions: "Signed in",
        testData: "Item 1",
        businessRules: "Do not mutate data",
      };
      const input = {
        requirements: "Check outcomes",
        format: "plain",
        frameworks: [],
        provider: "codex",
        context,
        pageStateIds: [],
      };
      let job = await api("/api/generations", input, "POST", 202);
      assert.equal(job.status, "running");
      const progress = await api(
        "/api/generations/" + job.generationId,
        null,
        "GET",
      );
      assert.equal(progress.status, "running");
      job = await wait(job.generationId);
      assert.equal(job.status, "completed", job.error);
      const suite = job.suite;
      assert.deepEqual(suite.generationInput.context, context);
      assert.equal(suite.cases.length, 2);
      assert.equal(suite.requirements[0].id, "R1");
      assert.equal(suite.quality.coverage[0].caseIds.length, 2);
      assert.ok(suite.generation.metrics.aiMs > 0);
      const selected = suite.cases[0],
        unchanged = suite.cases[1];
      let regeneration = await api(
        "/api/generations",
        {
          provider: "codex",
          regenerate: {
            suiteId: suite.suiteId,
            expectedRevision: 1,
            caseIds: [selected.caseId],
          },
        },
        "POST",
        202,
      );
      regeneration = await wait(regeneration.generationId);
      assert.equal(regeneration.status, "completed", regeneration.error);
      assert.equal(regeneration.suite.revision, 2);
      assert.equal(regeneration.suite.cases[0].caseId, selected.caseId);
      assert.match(regeneration.suite.cases[0].title, /revised/);
      assert.deepEqual(regeneration.suite.cases[1], unchanged);
      await api(
        "/api/generations",
        {
          regenerate: {
            suiteId: suite.suiteId,
            expectedRevision: 1,
            caseIds: [selected.caseId],
          },
        },
        "POST",
        409,
      );
      const pending = await api(
        "/api/generations",
        { ...input, requirements: "CANCEL_ME" },
        "POST",
        202,
      );
      const canceled = await api(
        "/api/generations/" + pending.generationId + "/cancel",
        {},
      );
      assert.equal(canceled.status, "canceled");
      assert.equal((await wait(pending.generationId)).status, "canceled");
      assert.equal(
        (await api("/api/suites/" + suite.suiteId, null, "GET")).revision,
        2,
      );
    } finally {
      if (child.exitCode === null) {
        child.kill();
        await new Promise((r) => child.once("exit", r));
      }
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  },
);

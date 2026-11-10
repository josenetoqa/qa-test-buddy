const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const APP = "http://127.0.0.1:4296";
const TARGET = "http://127.0.0.1:4297/";
const SESSION = "qa-session=owned-fixture";

test(
  "locator check signs in with the selected profile and keeps the profile private",
  { timeout: 60000 },
  async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "test-buddy-verify-"));
    const data = path.join(tmp, "data");
    // The generated case looks for a control that exists only after sign-in.
    const answer = {
      schemaVersion: 2,
      cases: [
        {
          key: "archive",
          title: "Archive is available to a signed-in user",
          preconditions: "A user is signed in.",
          steps: ["Open the contact page."],
          expected: "The Archive contact button is visible.",
          requirementRef: "R1",
          automation: {
            playwright: {
              status: "draft",
              operations: [
                {
                  op: "expectVisible",
                  locator: {
                    kind: "role",
                    role: "button",
                    value: "Archive contact",
                    exact: true,
                  },
                },
              ],
            },
          },
        },
      ],
    };
    // A fake AI CLI. PATH holds only this folder, so no real CLI can run.
    fs.writeFileSync(
      path.join(tmp, "codex"),
      `#!${process.execPath}\n` +
        "process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify(" +
        "{type:'item.completed',item:{type:'agent_message',text:" +
        JSON.stringify(JSON.stringify(answer)) +
        "}})));",
      { mode: 0o700 },
    );
    // The target shows a login form unless the session cookie is present.
    const target = http.createServer((req, res) => {
      res.setHeader("content-type", "text/html");
      res.end(
        req.headers.cookie?.includes(SESSION)
          ? "<h1>Contact</h1><button>Archive contact</button>"
          : '<form><label>Test user <input name="name"></label><button>Sign in</button></form>',
      );
    });
    await new Promise((r) => target.listen(4297, "127.0.0.1", r));
    const app = spawn(process.execPath, ["server.js"], {
      cwd: path.resolve(__dirname, ".."),
      env: {
        ...process.env,
        PORT: "4296",
        PATH: tmp,
        CODEX_HOME: tmp,
        TEST_BUDDY_DATA_DIR: data,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("App startup timeout")),
          10000,
        );
        app.once("error", reject);
        app.once("exit", (code) => reject(Error("App exited " + code)));
        app.stdout.on("data", (chunk) => {
          if (chunk.toString().includes("available at")) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      const api = async (route, body, method = "POST") => {
        const response = await fetch(APP + route, {
          method,
          headers: { "content-type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: response.status, body: await response.json() };
      };
      const generated = await api("/api/generate", {
        requirements: "A signed-in user can archive a contact.",
        targetUrl: TARGET,
        provider: "codex",
        format: "plain",
        frameworks: ["playwright"],
      });
      assert.equal(generated.status, 200, JSON.stringify(generated.body));
      const suiteId = generated.body.suiteId;
      const caseId = generated.body.cases[0].caseId;
      const verify = (body) =>
        api(`/api/suites/${suiteId}/cases/${caseId}/verify`, body);

      // A ready login profile, written the way a completed capture stores it.
      const profile = await api("/api/auth/profiles", {
        label: "Owned local QA fixture",
        origin: new URL(TARGET).origin,
      });
      assert.equal(profile.status, 201, JSON.stringify(profile.body));
      const profileId = profile.body.profileId;
      const profileDir = path.join(data, "auth", ".test-buddy-auth", profileId);
      fs.writeFileSync(
        path.join(profileDir, "state.json"),
        JSON.stringify({
          cookies: [
            {
              name: "qa-session",
              value: "owned-fixture",
              domain: "127.0.0.1",
              path: "/",
              expires: -1,
              httpOnly: true,
              secure: false,
              sameSite: "Lax",
            },
          ],
          origins: [],
        }),
        { mode: 0o600 },
      );
      const metadataFile = path.join(profileDir, "metadata.json");
      fs.writeFileSync(
        metadataFile,
        JSON.stringify({
          ...JSON.parse(fs.readFileSync(metadataFile, "utf8")),
          status: "ready",
          capturedAt: new Date().toISOString(),
        }),
        { mode: 0o600 },
      );

      // Without a profile the check sees the login form.
      const anonymous = await verify({ revision: generated.body.revision });
      assert.equal(anonymous.status, 200, JSON.stringify(anonymous.body));
      assert.equal(anonymous.body.authenticated, false);
      assert.deepEqual(
        anonymous.body.results.map((r) => r.status),
        ["absent"],
      );

      // With the profile it sees the signed-in page.
      const signedIn = await verify({
        revision: anonymous.body.suite.revision,
        authProfileId: profileId,
      });
      assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
      assert.equal(signedIn.body.authenticated, true);
      assert.deepEqual(
        signedIn.body.results.map((r) => r.status),
        ["matched"],
      );

      // Private data stays local: no profile ID, state path, or cookie value
      // in the response, the stored suite, or the suite files on disk.
      const current = await api(`/api/suites/${suiteId}`, null, "GET");
      const stored = fs
        .readdirSync(path.join(data, "suites"))
        .map((name) =>
          fs.readFileSync(path.join(data, "suites", name), "utf8"),
        );
      for (const text of [
        JSON.stringify(signedIn.body),
        JSON.stringify(current.body),
        ...stored,
      ])
        for (const secret of [
          profileId,
          "state.json",
          ".test-buddy-auth",
          "owned-fixture",
        ])
          assert.ok(!text.includes(secret), `leaked ${secret}`);

      // The browser may send a profile ID, never a path or login state.
      const revision = signedIn.body.suite.revision;
      const path_ = await verify({
        revision,
        storageState: path.join(profileDir, "state.json"),
      });
      assert.equal(path_.status, 400);
      const unknown = await verify({ revision, authProfileId: "no-such-id" });
      assert.equal(unknown.status, 404);
      const after = await api(`/api/suites/${suiteId}`, null, "GET");
      assert.equal(after.body.revision, revision);
    } finally {
      if (app.exitCode === null) {
        app.kill();
        await new Promise((r) => app.once("exit", r));
      }
      await new Promise((r) => target.close(r));
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  },
);

# Phase 2 verification — actual Chromium readiness

Implemented `lib/readiness.cjs`. Node versions below 20, missing project-local runner, unavailable browser, launch timeout, and close errors are distinct setup failures. The module launches and closes Chromium, bounds launch at 10 seconds, caches non-injected results for 30 seconds, and performs no dependency installation.

`node --test test/readiness.test.cjs`: four deterministic tests passed. Missing-browser and timeout tests use injected launch functions; they are simulated infrastructure checks, not observed machine failures.

Live verification used the installed filesystem CLI path `node_modules/playwright/cli.js` and the default launcher. Result: `{ available: true, node: true, runner: true, browser: true, reason: "" }` on Node 26.8.2. An initial verification command incorrectly requested the package's unexported `playwright/cli` subpath; correcting that verification path succeeded without changing production code.

The root implementation owns demo fixtures, capability routes, engine documentation, and UI readiness presentation. The full API integration exercised the real local demo independently of AI generation.

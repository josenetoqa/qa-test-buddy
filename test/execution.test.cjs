const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'test-buddy-ui-'));
const root = path.resolve(__dirname, '..');
const port = 4193;
const base = `http://127.0.0.1:${port}`;
let child;
test.before(async () => {
  child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), TEST_BUDDY_DATA_DIR: data }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Test server did not start')), 10000);
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Test server exited (${code})`)); });
    child.stdout.on('data', chunk => { if (chunk.toString().includes('available at')) { clearTimeout(timer); resolve(); } });
  });
});
test.after(async () => { if (child && child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); } fs.rmSync(data, { recursive: true, force: true }); });
async function api(endpoint, body, method = 'POST') {
  const response = await fetch(base + endpoint, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json() };
}
test('unreviewed suites and client-supplied operations cannot execute', async () => {
  const { body: suite } = await api('/api/demo', {});
  const payload = { schemaVersion: 2, framework: 'playwright', suiteId: suite.suiteId, revision: 1, caseId: suite.cases[0].caseId };
  assert.equal((await api('/api/runs', payload)).status, 409);
  assert.equal((await api('/api/runs', { ...payload, steps: [] })).status, 400);
  assert.equal((await api(`/api/suites/${suite.suiteId}/review`, { expectedRevision: 2, caseIds: [payload.caseId], reviewed: true }, 'PATCH')).status, 409);
});
test('real UI runs each demo TC separately and retains its own pass/fail verdict', { timeout: 60000 }, async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.locator('#demo-button').click();
    await page.locator('#automation-pane .case-card').first().waitFor();
    assert.equal(await page.locator('#automation-pane .case-card').count(), 3);
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Run all runnable' && !b.disabled));
    assert.equal(await page.getByRole('button', { name: 'Run all runnable', exact: true }).isEnabled(), true);
    await page.getByRole('button', { name: 'Run all runnable', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#coverage-summary').textContent.includes('2 of 3 selected cases passed'), undefined, { timeout: 45000 });
    await page.waitForFunction(() => document.querySelector('#run-status').textContent === 'failed');
    const results = await page.locator('#automation-pane .case-verdict').evaluateAll(elements => elements.map(el => ({ id: el.dataset.caseId, status: el.dataset.status, text: el.textContent })));
    assert.deepEqual(results.map(r => r.status), ['passed', 'failed', 'passed']);
    assert.equal(results.length, 3);
    assert.match(results[1].text, /Wrong receipt|toBeVisible/);
    assert.equal(await page.locator('#run-status').textContent(), 'failed');
    const retained = await page.evaluate(() => JSON.parse(localStorage.getItem('test-buddy-workspace')));
    const liveRun = (await api(`/api/runs/${retained.runId}`, null, 'GET')).body;
    assert.deepEqual(liveRun.cases.map(c => c.status), ['passed', 'failed', 'passed']);
    assert.equal(await page.evaluate(() => localStorage.getItem('test-buddy-case-results')), null);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#coverage-summary').textContent.includes('2 of 3 selected cases passed'));
    await page.locator('[data-tab=playwright]').click();
    await page.locator('[data-tab=playwright]').press('ArrowLeft');
    assert.equal(await page.locator('[data-tab=cases]').getAttribute('aria-selected'), 'true');
    await page.locator('[data-tab=playwright]').click();
    assert.equal(await page.getByRole('button', { name: 'Run all runnable', exact: true }).isEnabled(), true);
    await page.locator('[data-tab=cases]').click();
    assert.equal(await page.locator('#run-result').isVisible(), true);
    const artifactRoot = process.env.QA_SCREENSHOTS;
    if (artifactRoot) await page.screenshot({ path: path.join(artifactRoot, 'real-demo-desktop.png'), fullPage: true });
    for (const width of [375, 768]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (artifactRoot) await page.screenshot({ path: path.join(artifactRoot, `real-demo-${width}.png`), fullPage: true });
    }
    const manualSuite = { schemaVersion: 2, suiteId: 'manual-fixture', revision: 1, provider: 'codex', cases: [{ caseId: 'manual-case', displayId: 'TC-001', automation: {}, title: 'Manual case', preconditions: 'None', steps: ['Check manually'], expected: 'Confirmed by a person', requirementRef: 'R1' }], automation: {} };
    await page.route(/\/api\/generations(?:\/manual-generation)?$/, route => route.fulfill({ json: route.request().method() === 'POST' ? {generationId:'manual-generation',status:'running'} : {generationId:'manual-generation',status:'completed',suite:manualSuite} }));
    await page.locator('#requirements').fill('A manual-only case to check stale result cleanup.');
    await page.locator('input[value=playwright]').uncheck();
    await page.locator('#generate-button').click();
    await page.getByRole('heading', { name: 'TC-001 · Manual case', exact: true }).waitFor();
    assert.equal(await page.locator('#coverage-summary').textContent(), '');
    assert.equal(await page.locator('#run-status').textContent(), 'Not run');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});

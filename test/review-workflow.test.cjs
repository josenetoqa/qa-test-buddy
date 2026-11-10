const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const base = 'http://127.0.0.1:4218';
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-review-ui-'));
let server, browser;
test.before(async () => {
  server = spawn(process.execPath, ['server.js'], { cwd:path.resolve(__dirname, '..'), env:{...process.env, PORT:'4218', TEST_BUDDY_DATA_DIR:data}, stdio:['ignore','pipe','pipe'] });
  await new Promise((resolve,reject) => { let errors='';server.stderr.on('data',p=>errors+=p);const timer=setTimeout(()=>reject(Error('Startup timed out: '+errors)),10000); server.once('exit',code=>{clearTimeout(timer);reject(Error('Server exited '+code+': '+errors));});server.once('error',reject);server.stdout.on('data',p=>{if(p.toString().includes('available at')){clearTimeout(timer);resolve();}}); });
  browser = await chromium.launch();
});
test.after(async () => { await browser?.close();if(server?.exitCode===null){server.kill();await new Promise(r=>server.once('exit',r));}fs.rmSync(data,{recursive:true,force:true}); });
async function demo(){const page=await browser.newPage();await page.goto(base);await page.locator('#demo-button').click();await page.locator('#automation-pane .case-card').first().waitFor();return page;}
test('code starts collapsed and real action edits survive save and reload',async()=>{
 const page=await demo();try{
  let card=page.locator('#automation-pane .case-card').first();assert.equal(await card.locator('.code-preview').isVisible(),false);await card.locator('summary').click();assert.equal(await card.locator('.code-preview').isVisible(),true);
  await card.getByRole('button',{name:'Edit actions',exact:true}).click();const row=card.locator('.operation-row').last();assert.equal(await row.getByLabel('Locator name',{exact:true}).isVisible(),false);
  await row.getByLabel('Expected text',{exact:true}).fill('Edited receipt.');await card.getByRole('button',{name:'Save actions',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#result-count').textContent.includes('revision 2'));
  card=page.locator('#automation-pane .case-card').first();assert.match(await card.locator('.code-preview').textContent(),/Edited receipt\./);assert.match(await card.locator('.action-feedback').textContent(),/saved/i);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('test-buddy-workspace')));const suite=await (await page.request.get(base+`/api/suites/${saved.suiteId}?revision=${saved.revision}`)).json();assert.equal(suite.cases[0].automation.playwright.operations.at(-1).value,'Edited receipt.');await page.reload();await page.locator('[data-tab=playwright]').click();assert.match(await page.locator('#automation-pane .code-preview').first().textContent(),/Edited receipt\./);
 }finally{await page.close();}
});
test('Run executes a draft without a separate mark-reviewed click',async()=>{
 const page=await demo();try{const card=page.locator('#automation-pane .case-card').first();assert.equal(await card.getByRole('button',{name:'Mark reviewed',exact:true}).count(),0);await card.getByRole('button',{name:'Run TC-001',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#run-status').textContent==='passed',{},{timeout:15000});assert.match(await page.locator('#run-summary').textContent(),/1 passed/);}finally{await page.close();}
});
test('locator checks show results and explain untested interaction states',async()=>{
 const page=await demo();try{let card=page.locator('#automation-pane .case-card').first();await card.getByRole('button',{name:'Check locators',exact:true}).click();await card.locator('.verification-results').waitFor();assert.match(await card.locator('.verification-results').textContent(),/deferred/);await page.locator('#automation-pane input[type=checkbox]').first().check();card=page.locator('#automation-pane .case-card').first();assert.equal(await card.locator('.verification-results').isVisible(),true);}finally{await page.close();}
});

test('invalid edits show an error and keep the editor open',async()=>{
 const page=await demo();try{const card=page.locator('#automation-pane .case-card').first();await card.getByRole('button',{name:'Edit actions',exact:true}).click();await card.locator('.operation-row').last().getByLabel('Expected text',{exact:true}).fill('');await card.getByRole('button',{name:'Save actions',exact:true}).click();await card.locator('.editor-feedback[role=alert]').waitFor();assert.equal(await card.locator('.operation-editor').isVisible(),true);assert.match(await page.locator('#result-count').textContent(),/revision 1/);await card.getByRole('button',{name:'Cancel editing',exact:true}).click();assert.equal(await card.getByRole('button',{name:'Run TC-001',exact:true}).isEnabled(),true);}finally{await page.close();}
});
test('Copy code copies the visible code and reports success',async()=>{
 const page=await demo();try{await page.evaluate(()=>{navigator.clipboard.writeText=async text=>{window.copiedCode=text;};});const card=page.locator('#automation-pane .case-card').first();await card.locator('summary').click();const source=await card.locator('.code-preview').textContent();await card.getByRole('button',{name:'Copy code',exact:true}).click();assert.equal(await page.evaluate(()=>window.copiedCode),source);assert.match(await card.locator('.action-feedback').textContent(),/Code copied/);}finally{await page.close();}
});

test('changed demo inputs explain the lock and can be restored before a real run',async()=>{
 const page=await demo();try{
  const original=await page.locator('#target-url').inputValue();await page.locator('#target-url').fill('https://changed.example/');
  assert.equal(await page.getByRole('button',{name:'Run TC-001',exact:true}).isDisabled(),true);assert.match(await page.locator('.execution-blocker').textContent(),/Requirements or URL/);
  await page.getByRole('button',{name:'Use suite inputs',exact:true}).click();assert.equal(await page.locator('#target-url').inputValue(),original);assert.equal(await page.getByRole('button',{name:'Run TC-001',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'Run TC-001',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#run-status').textContent==='passed',{}, {timeout:15000});
 }finally{await page.close();}
});
test('an open editor explains why other case actions are disabled',async()=>{
 const page=await demo();try{
  await page.locator('#automation-pane .case-card').nth(1).getByRole('button',{name:'Edit actions',exact:true}).click();assert.match(await page.locator('.execution-blocker').textContent(),/Save or cancel/);assert.equal(await page.locator('.execution-blocker a').getAttribute('href'),'#actions-editor');
  assert.equal(await page.getByRole('button',{name:'Run TC-001',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'Cancel editing',exact:true}).click();assert.equal(await page.locator('.execution-blocker').isVisible(),false);assert.equal(await page.getByRole('button',{name:'Run TC-001',exact:true}).isEnabled(),true);
 }finally{await page.close();}
});

test('download buttons export all cases, combined Playwright tests, and one test before running',async()=>{
 const page=await demo();try{
  let pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download test cases (.txt)',exact:true}).click();let download=await pending;assert.match(download.suggestedFilename(),/\.txt$/);const text=fs.readFileSync(await download.path(),'utf8');assert.match(text,/TC-001/);assert.match(text,/TC-003/);assert.match(text,/Expected result: Contact created/);
  pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download Playwright tests (.spec.cjs)',exact:true}).click();download=await pending;assert.match(download.suggestedFilename(),/\.spec\.cjs$/);let source=fs.readFileSync(await download.path(),'utf8');assert.equal((source.match(/test\(/g)||[]).length,3);new (require('node:vm').Script)(source);
  const card=page.locator('#automation-pane .case-card').first();await card.locator('summary').click();pending=page.waitForEvent('download');await card.getByRole('button',{name:'Download this test',exact:true}).click();download=await pending;source=fs.readFileSync(await download.path(),'utf8');assert.equal((source.match(/test\(/g)||[]).length,1);assert.match(source,/TC-001/);assert.equal(await page.locator('#run-status').textContent(),'Not run');
 }finally{await page.close();}
});

test('locator check results say when the page ended at a different address', async () => {
  const page = await demo();
  try {
    let card = page.locator('#automation-pane .case-card').first();
    await card.getByRole('button', { name: 'Check locators', exact: true }).click();
    await card.locator('.verification-results').waitFor();
    assert.doesNotMatch(await card.locator('.verification-results').textContent(), /different address/);
    // Same real check, with the redirect flag set as the server sets it for a redirected page.
    await page.route('**/verify', async route => {
      const response = await route.fetch();
      const body = await response.json();
      for (const item of body.suite.cases)
        if (item.automation.playwright.verification) item.automation.playwright.verification.redirected = true;
      await route.fulfill({ response, json: body });
    });
    card = page.locator('#automation-pane .case-card').first();
    await card.getByRole('button', { name: 'Check locators', exact: true }).click();
    await page.locator('#automation-pane .case-card').first().locator('.verification-results', { hasText: 'different address' }).waitFor({ timeout: 10000 });
  } finally { await page.close(); }
});

test('Check locators sends the selected login profile and says whether a login was used', async () => {
  const page = await browser.newPage();
  try {
    // One login profile for the demo target's origin.
    await page.route('**/api/auth/profiles', route => route.request().method() === 'GET'
      ? route.fulfill({ json: { profiles: [{ profileId: 'profile-fixture', label: 'QA login', origin: base, status: 'ready' }] } })
      : route.continue());
    const sent = [];
    await page.route('**/verify', async route => {
      const body = route.request().postDataJSON();
      sent.push(body);
      // The real server has no such profile. Run the real check without it,
      // then mark the result the way the server marks a signed-in check.
      const response = await route.fetch({ postData: JSON.stringify({ revision: body.revision }) });
      const result = await response.json();
      if (body.authProfileId)
        for (const item of result.suite.cases)
          if (item.automation.playwright.verification) item.automation.playwright.verification.authenticated = true;
      await route.fulfill({ response, json: result });
    });
    await page.goto(base);
    await page.locator('#demo-button').click();
    const card = () => page.locator('#automation-pane .case-card').first();
    await card().waitFor();
    await card().getByRole('button', { name: 'Check locators', exact: true }).click();
    await card().locator('.verification-results', { hasText: 'Checked without a login profile' }).waitFor({ timeout: 10000 });
    assert.deepEqual(Object.keys(sent[0]), ['revision']);
    await page.locator('#execution-options > summary').click();
    await page.locator('#auth-profile').selectOption('profile-fixture');
    await card().getByRole('button', { name: 'Check locators', exact: true }).click();
    await card().locator('.verification-results', { hasText: 'signed in with the selected login profile' }).waitFor({ timeout: 10000 });
    assert.deepEqual(Object.keys(sent[1]).sort(), ['authProfileId', 'revision']);
    assert.equal(sent[1].authProfileId, 'profile-fixture');
  } finally { await page.close(); }
});

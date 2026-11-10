const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { inspectPage } = require('../lib/page-inspector.cjs');
test('inspection reads visible labels without collecting values or submitting', async () => {
  let submitted = false;
  const server = createServer((req, res) => {
    if (req.url === '/submit') submitted = true;
    res.setHeader('content-type', 'text/html');
    res.end('<label>Email<input value="private-value"></label><input type="password" value="private-password"><input type="hidden" value="private-token"><button hidden>Hidden control</button><button onclick="fetch(\'/submit\')">Register</button>');
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try {
    const result = await inspectPage(`http://127.0.0.1:${server.address().port}`);
    const data = JSON.stringify(result);
    assert.ok(data.includes('Email')); assert.ok(data.includes('Register'));
    assert.ok(!data.includes('private-')); assert.ok(!data.includes('Hidden control'));
    assert.equal(submitted, false);
  } finally { await new Promise(r => server.close(r)); }
});
test('inspection fails clearly for HTTP errors', async () => {
  const server = createServer((req, res) => { res.writeHead(403); res.end('Private page'); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { await assert.rejects(inspectPage(`http://127.0.0.1:${server.address().port}`), /Page inspection failed/); }
  finally { await new Promise(r => server.close(r)); }
});
test('inspection produces scoped roles and bounded field metadata', async () => {
  const server = createServer((req,res)=>{res.setHeader('content-type','text/html');res.end('<form><label>Age<input type="number" min="1" max="99" required></label><input data-testid="email" placeholder="Email" maxlength="120"><button disabled>Save</button><a href="/next">Continue</a></form>');});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const result = await inspectPage(`http://127.0.0.1:${server.address().port}`);
    const age = result.controls.find(c=>c.name === 'Age');
    assert.equal(age.locator.kind,'label'); assert.equal(age.required,true); assert.equal(age.min,'1'); assert.equal(age.max,'99');
    const button = result.controls.find(c=>c.name === 'Save');
    assert.deepEqual(button.locator,{kind:'role',role:'button',value:'Save',exact:true,formIndex:0}); assert.equal(button.disabled,true);
    const field = result.controls.find(c=>c.placeholder === 'Email'); assert.equal(field.locator.kind,'testId'); assert.equal(field.maxLength,120);
    assert.equal(result.controls.find(c=>c.name === 'Continue').locator.role,'link');
  } finally {await new Promise(r=>server.close(r));}
});
test('pre-aborted inspection does not launch', async()=>{
  const controller = new AbortController();controller.abort();
  await assert.rejects(inspectPage('http://localhost',{signal:controller.signal}),{name:'AbortError'});
});
test('aborting an in-flight navigation returns a cancellation', async()=>{
  const server = createServer((req,res)=>{});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),350);
  try {await assert.rejects(inspectPage(`http://127.0.0.1:${server.address().port}`,{signal:controller.signal}),{name:'AbortError'});}
  finally {clearTimeout(timer);server.closeAllConnections();await new Promise(r=>server.close(r));}
});

async function withFixture(html, run) {
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(html);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  try { return await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(r => server.close(r)); }
}
const byName = (result, name) => result.controls.find(c => c.name === name);

test('submit, button, and reset inputs are named by their value attribute', async () => {
  const html = '<form><label>Email<input value="typed-private-text"></label>' +
    '<input type="submit" value="Register"><input type="button" value="Clear form">' +
    '<input type="reset" value="Start over"><input type="submit"></form>';
  await withFixture(html, async url => {
    const result = await inspectPage(url);
    for (const name of ['Register', 'Clear form', 'Start over'])
      assert.deepEqual(byName(result, name)?.locator, { kind: 'role', role: 'button', value: name, exact: true, formIndex: 0 });
    // No default name is invented for a submit input without a value.
    const unnamed = result.controls.filter(c => c.type === 'submit' && !c.name);
    assert.equal(unnamed.length, 1);
    assert.equal(unnamed[0].locator, null);
    // Text typed into a normal field is still never read.
    assert.ok(!JSON.stringify(result).includes('typed-private-text'));
  });
});

test('custom switch, checkbox, radio, and combobox roles are observed by name', async () => {
  const html = '<button>Save</button>' +
    '<div role="switch" aria-checked="false" aria-label="Show balance" tabindex="0">off</div>' +
    '<span role="checkbox" aria-checked="false" tabindex="0">Accept terms</span>' +
    '<span role="radio" aria-checked="false" tabindex="0">Monthly</span>' +
    '<div role="combobox" aria-label="Country" tabindex="0">Selected-private-country</div>';
  await withFixture(html, async url => {
    const result = await inspectPage(url);
    const roleLocator = (role, value) => ({ kind: 'role', role, value, exact: true });
    assert.deepEqual(byName(result, 'Show balance')?.locator, roleLocator('switch', 'Show balance'));
    assert.deepEqual(byName(result, 'Accept terms')?.locator, roleLocator('checkbox', 'Accept terms'));
    assert.deepEqual(byName(result, 'Monthly')?.locator, roleLocator('radio', 'Monthly'));
    assert.deepEqual(byName(result, 'Country')?.locator, roleLocator('combobox', 'Country'));
    // A custom combobox shows its current value as text. That value is not read.
    assert.ok(!JSON.stringify(result).includes('Selected-private-country'));
  });
});

test('every locator the inspector emits matches exactly one element in Playwright', async () => {
  const { chromium } = require('playwright');
  const { readControls } = require('../lib/page-inspector.cjs');
  const { getLocator } = require('../lib/locator-verifier.cjs');
  const html = '<form><label for="mail">Email</label><input id="mail"><input type="password" placeholder="Password">' +
    '<label><input type="checkbox"> Remember me</label><input type="submit" value="Register">' +
    '<input type="button" value="Clear form"><input type="reset" value="Start over"><button type="button">Help</button>' +
    '<label>Step 2 <input type="submit" value="Continue"></label></form>' +
    '<a href="/terms">Terms</a><div role="switch" aria-checked="false" aria-label="Show balance" tabindex="0">off</div>' +
    '<span role="checkbox" aria-checked="false" tabindex="0">Accept terms</span>' +
    '<span role="radio" aria-checked="false" tabindex="0">Monthly</span>' +
    '<div role="combobox" aria-label="Country" tabindex="0">Brazil</div>';
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    const { controls } = await readControls(page);
    const located = controls.filter(c => c.locator);
    assert.equal(located.length, 13);
    for (const control of located)
      assert.equal(await getLocator(page, control.locator).count(), 1, JSON.stringify(control.locator));
  } finally { await browser.close(); }
});

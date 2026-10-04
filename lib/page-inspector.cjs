const { chromium } = require('playwright');

// Never collect input values, cookies, storage, or full page content.
async function inspectPage(targetUrl) {
  const origin = new URL(targetUrl).origin;
  let browser;
  try {
    browser = await chromium.launch({ timeout: 10000 });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const request = route.request();
      if (request.isNavigationRequest() && new URL(request.url()).origin !== origin) return route.abort();
      return route.continue();
    });
    const page = await context.newPage();
    const response = await page.goto(targetUrl, { timeout: 15000, waitUntil: 'domcontentloaded' });
    if (!response?.ok()) throw new Error('The target returned an unsuccessful HTTP response.');
    await page.locator('input:visible,textarea:visible,select:visible,button:visible,a:visible,[role="button"]:visible').first().waitFor({ timeout: 5000 });
    const controls = await page.evaluate(() => {
      const clean = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
      return Array.from(document.querySelectorAll('input,textarea,select,button,a,[role="button"],[role="textbox"]'))
        .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && el.type !== 'hidden')
        .slice(0, 80).map(el => {
          const labelled = (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ');
          const name = clean(labelled || el.getAttribute('aria-label') || Array.from(el.labels || []).map(label => label.textContent).join(' ') || (el.matches('button,a,[role="button"]') ? el.innerText : ''));
          const placeholder = clean(el.getAttribute('placeholder'));
          const formIndex = Array.from(document.forms).indexOf(el.form || el.closest('form'));
          const scope = formIndex < 0 ? {} : { formIndex };
          const locator = name ? {kind: el.matches('input,textarea,select') ? 'label' : 'text', value:name,exact:true,...scope} : placeholder ? {kind:'placeholder',value:placeholder,exact:true,...scope} : null;
          return { locator, formIndex, placeholder, tag: el.tagName.toLowerCase(), type: el.getAttribute('type') || '', name, disabled: el.matches(':disabled') };
        });
    });
    if (!controls.length) throw new Error('No visible controls were found.');
    return { controls, scope: 'Initial page only. No controls clicked or fields filled.' };
  } catch {
    throw Object.assign(new Error('Page inspection failed. Check the URL and use a page accessible without login with visible controls. Redirects to other sites are not inspected.'), { status: 422 });
  } finally {
    await browser?.close();
  }
}
module.exports = { inspectPage };

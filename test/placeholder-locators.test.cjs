const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {validateLocator}=require('../lib/suite-schema.cjs');
const {locatorSource}=require('../lib/playwright-compiler.cjs');
const {getLocator}=require('../lib/locator-verifier.cjs');
test('placeholder locators target the specified form, not a duplicate login field',async()=>{
 const locator={kind:'placeholder',value:'Email',exact:true,formIndex:1};
 assert.deepEqual(validateLocator(locator),locator);
 assert.equal(locatorSource(locator),'page.locator("form").nth(1).getByPlaceholder("Email", {exact:true})');
 const b=await chromium.launch();try{const p=await b.newPage();await p.setContent('<form><input placeholder="Email"></form><form><input placeholder="Email"></form>');await getLocator(p,locator).fill('registration@example.com');assert.equal(await p.locator('input').nth(0).inputValue(),'');assert.equal(await p.locator('input').nth(1).inputValue(),'registration@example.com');}finally{await b.close();}
});
test('form scope rejects invalid indices',()=>{for(const formIndex of [-1,1.5,'1',101])assert.throws(()=>validateLocator({kind:'placeholder',value:'Email',exact:true,formIndex}));});

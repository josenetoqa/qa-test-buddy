const test=require('node:test');const assert=require('node:assert/strict');const {exportRun,exportSuiteCases,exportSuiteCode}=require('../lib/export.cjs');
test('exports exact case outcomes and exclude private auth fields',()=>{const run={runId:'r',suiteId:'s',revision:2,status:'failed',authProfileId:'secret-profile',storageState:'/private/secret',cases:[{caseId:'c',status:'failed',actual:'Not visible',artifacts:[{artifactId:'a'}]}]};const suite={cases:[{caseId:'c',displayId:'TC-001',title:'Verify contact',expected:'Visible',requirementRef:'R1'}]};const json=exportRun(run,suite,'json').body;assert.doesNotMatch(json,/secret-profile|private\/secret/);const md=exportRun(run,suite,'markdown').body;assert.match(md,/Expected: Visible/);assert.match(md,/Actual: Not visible/);assert.match(md,/Evidence: \/api\/runs\/r\/artifacts\/a/);});

test('case text export includes manual cases, numbered steps, and the saved revision',()=>{
 const suite={suiteId:'suite',revision:4,targetUrl:'https://example.com',authProfileId:'private-profile',cases:[{caseId:'a',displayId:'TC-001',title:'Create contact',preconditions:'Open form',steps:['Enter José','Click Save'],expected:'Contact created',requirementRef:'R1',automation:{}},{caseId:'b',displayId:'TC-002',title:'Check manually',steps:['Inspect result'],expected:'Visible',automation:{}}]};
 const exported=exportSuiteCases(suite);assert.match(exported.contentType,/text\/plain/);assert.match(exported.body,/revision 4/);assert.match(exported.body,/1\. Enter José\n2\. Click Save/);assert.match(exported.body,/Expected result: Contact created/);assert.match(exported.body,/TC-002/);assert.doesNotMatch(exported.body,/private-profile/);
});
test('code export rejects an empty runnable suite and unknown case instead of an empty file',()=>{
 const suite={cases:[{caseId:'manual',automation:{}}]};assert.throws(()=>exportSuiteCode(suite),error=>error.status===409);assert.throws(()=>exportSuiteCode(suite,'missing'),error=>error.status===404);
});

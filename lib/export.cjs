const {redacted}=require('./history-store.cjs');const {compileCase}=require('./playwright-compiler.cjs');
function exportRun(run,suite,format){const safe=redacted({run,suite,notice:'Evidence references are local to this Test Buddy server and may expire.'});if(format==='json')return{body:JSON.stringify(safe,null,2),contentType:'application/json'};if(format!=='markdown')throw Object.assign(new Error('Unsupported export format.'),{status:400});const lines=[`# Test Buddy run ${run.runId}`,`Status: ${run.status}`,`Suite: ${run.suiteId} revision ${run.revision}`,`Summary: ${run.summary||''}`,'','Evidence references are local to this server and may expire.'];for(const result of run.cases||[]){const c=suite?.cases.find(c=>c.caseId===result.caseId);lines.push('',`## ${c?.displayId||result.caseId}: ${c?.title||''}`,`Status: ${result.status}`,`Expected: ${c?.expected||result.expected||''}`,`Actual: ${result.actual||result.error||''}`,`Requirement: ${c?.requirementRef||''}`);for(const a of result.artifacts||[])lines.push(`Evidence: /api/runs/${run.runId}/artifacts/${a.artifactId}`);}return{body:lines.join('\n'),contentType:'text/markdown; charset=utf-8'};}
function exportSuiteCases(suite){
 const lines=['Test Buddy test cases',`Suite: ${suite.suiteId} · revision ${suite.revision}`,`Target: ${suite.targetUrl||'Manual testing'}`];
 for(const item of suite.cases){lines.push('',`${item.displayId}: ${item.title}`,`Preconditions: ${item.preconditions||'None'}`,'Steps:',...item.steps.map((step,index)=>`${index+1}. ${step}`),`Expected result: ${item.expected}`,`Requirement: ${item.requirementRef||'—'}`);}
 return {body:lines.join('\n')+'\n',contentType:'text/plain; charset=utf-8'};
}
function exportSuiteCode(suite,caseId){
 const cases=caseId?suite.cases.filter(c=>c.caseId===caseId):suite.cases.filter(c=>['draft','ready'].includes(c.automation?.playwright?.status));
 if(caseId&&!cases.length)throw Object.assign(new Error('Test case not found.'),{status:404});
 if(!cases.length||cases.some(c=>!['draft','ready'].includes(c.automation?.playwright?.status)))throw Object.assign(new Error('No runnable Playwright tests to export. Add valid actions first.'),{status:409});
 return{body:cases.map((c,index)=>{const source=compileCase(suite,c.caseId).source;return index===0?source:source.replace(/^const \{test,expect\}=require\('@playwright\/test'\);\n/,'');}).join('\n'),contentType:'text/javascript; charset=utf-8'};}
module.exports={exportRun,exportSuiteCode,exportSuiteCases};

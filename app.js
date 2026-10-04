const $ = selector => document.querySelector(selector);
const form = $('#generate-form');
const frameworkChecks = [...document.querySelectorAll('input[name="framework"]')];
let generated, activeRun, capabilities, polling = 0, starting = false, generating=false, generationSnapshot=null, workspaceActionVersion=0;
const selected = new Set();
const caseFeedbacks = new Map();
const codeViews = new Map();
const terminal = status => !['queued','running'].includes(status);
const storage = {get(key){try{return localStorage.getItem(key);}catch{return null;}},set(key,value){try{localStorage.setItem(key,value);}catch{}},remove(key){try{localStorage.removeItem(key);}catch{}}};
for (const key of ['test-buddy-draft','test-buddy-run','test-buddy-case-results','test-buddy-pending']) storage.remove(key);
function save(){storage.set('test-buddy-workspace',JSON.stringify({suiteId:generated?.suiteId,revision:generated?.revision,runId:activeRun?.runId}));}
async function request(url,options={}){const response=await fetch(url,{...options,headers:{...(options.body?{'content-type':'application/json'}:{}),...options.headers}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||`Request failed (${response.status}).`);return data;}
const post=(url,body,method='POST')=>request(url,{method,body:JSON.stringify(body)});
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function button(text,action,disabled=false,className='secondary-button'){
  const b=node('button',text,className);b.type='button';b.disabled=disabled;
  b.addEventListener('click',async()=>{
    b.disabled=true;b.setAttribute('aria-busy','true');
    try{await action();}catch(error){
      const local=b.closest('.operation-editor')?.querySelector('.editor-feedback')||b.closest('.case-card')?.querySelector('.action-feedback')||b.closest('.suite-exports')?.querySelector('.suite-export-feedback');
      if(local){local.textContent=error.message;local.setAttribute('role','alert');}
      notice(error.message);
    }finally{b.disabled=disabled;b.removeAttribute('aria-busy');}
  });return b;
}
function notice(message){$('#workspace-notice').textContent=message;}
function row(label,value){const el=node('div',undefined,'case-row');el.append(node('b',label),node('span',value||'—'));return el;}
function busy(){return generating||starting||Boolean(activeRun&&!terminal(activeRun.status));}
function state(name){for(const item of ['empty','loading','error','generated'])$(`#${item}-state`).hidden=item!==name;$('#result-count').textContent=name==='generated'?`${generated.cases.length} cases · revision ${generated.revision}`:name==='loading'?'Generating…':'No cases yet';}
function syncUrl(){const needed=frameworkChecks.some(c=>c.checked);$('#url-field').hidden=!needed;$('#target-url').required=needed;$('#capability-note').textContent=needed?'Review every generated action and expected result before execution.':'Automation is optional. Select Playwright to add a target URL.';}
async function loadCapabilities(refresh=false){try{capabilities=await request(`/api/capabilities${refresh?'?refresh=1':''}`);const select=$('#provider'),saved=storage.get('test-buddy-provider');select.replaceChildren();for(const provider of capabilities.providers.filter(p=>p.available))select.add(new Option(provider.label,provider.id));if(!select.options.length)select.add(new Option('No supported AI CLI found',''));select.value=[...select.options].some(o=>o.value===saved)?saved:select.options[0].value;$('#generate-button').disabled=!select.value||busy();$('#readiness').textContent=Object.entries(capabilities.runners).filter(([name])=>name==='playwright').map(([name,r])=>`${name}: ${r.available?'ready':r.reason||'unavailable'}${r.node===false?' · unsupported Node':''}${r.browser===false?' · browser unavailable':''}`).join(' · ');renderAutomationIfVisible();}catch(error){notice(error.message);}}
frameworkChecks.forEach(c=>c.addEventListener('change',syncUrl));$('#provider').addEventListener('change',()=>storage.set('test-buddy-provider',$('#provider').value));
function currentInputs(){return{requirements:$('#requirements').value.trim(),format:'plain',frameworks:frameworkChecks.filter(c=>c.checked).map(c=>c.value).sort(),targetUrl:$('#target-url').value.trim()};}
function normalizedInputs(input){return{requirements:input.requirements||'',format:'plain',frameworks:[...(input.frameworks||[])].filter(name=>name==='playwright').sort(),targetUrl:input.targetUrl||''};}
function inputsChanged(){return Boolean(generated&&generationSnapshot&&JSON.stringify(currentInputs())!==JSON.stringify(normalizedInputs(generationSnapshot)));}
function requireCurrentInputs(){if(!generated||inputsChanged()){notice('Generate tests to use updated URL and requirements.');return false;}return true;}
function blocked(){return busy()||inputsChanged()||Boolean($('#automation-pane .operation-editor'));}
function restoreSuiteInputs(){
  if(!generated||busy())return;const source=normalizedInputs(generationSnapshot);workspaceActionVersion++;
  $('#requirements').value=source.requirements;$('#target-url').value=source.targetUrl;frameworkChecks.forEach(check=>check.checked=source.frameworks.includes(check.value));syncUrl();inputsEdited();
}
function updateExecutionBlocker(){
  const pane=$('#automation-pane'),banner=pane.querySelector('.execution-blocker');if(!banner)return;
  const panel=pane.querySelector('.operation-editor'),framework=document.querySelector('.tab.active')?.dataset.tab;
  let message='',action;
  if(panel){message=`Save or cancel the action edits for ${panel.dataset.displayId} to enable Run.`;action=node('a','Continue editing');action.href='#actions-editor';}
  else if(generating)message='Wait for test generation to finish before running.';
  else if(starting)message='Starting execution. Please wait.';
  else if(activeRun&&!terminal(activeRun.status)){message='Another execution is in progress. Wait for it to finish or cancel it in Results.';action=node('a','View execution');action.href='#run-result';}
  else if(inputsChanged()){message='Requirements or URL differ from this suite. Use the saved suite inputs to run this code, or generate new tests with your changes.';action=button('Use suite inputs',restoreSuiteInputs);}
  else if(!capabilities?.runners[framework]?.available)message=capabilities?.runners[framework]?.reason||'Checking Playwright readiness. Use Recheck local tools if this continues.';
  banner.replaceChildren();if(message)banner.append(node('p',message));if(action)banner.append(action);
  for(const note of pane.querySelectorAll('.run-blocked-reason'))note.textContent=message;
  if(panel)panel.style.scrollMarginTop=`${pane.querySelector('.case-navigation').getBoundingClientRect().height+28}px`;
}
function inputsEdited(){if(inputsChanged())notice('Inputs changed. Generate tests to use updated URL and requirements.');else notice('');renderAutomationIfVisible();updateExecutionBlocker();}
for(const id of ['requirements','target-url'])$(`#${id}`).addEventListener('input',()=>{workspaceActionVersion++;inputsEdited();});
frameworkChecks.forEach(check=>check.addEventListener('change',()=>{workspaceActionVersion++;inputsEdited();}));
function adopt(suite,{restoreInputs=false,input=null}={}){const previousId=generated?.suiteId;generated=suite;selected.clear();if(previousId!==suite.suiteId){caseFeedbacks.clear();codeViews.clear();}if(suite.generationInput)generationSnapshot={...suite.generationInput,targetUrl:suite.targetUrl||''};else if(input)generationSnapshot={...input,targetUrl:suite.targetUrl||input.targetUrl||''};else if(previousId!==suite.suiteId||!generationSnapshot)generationSnapshot={...currentInputs(),targetUrl:suite.targetUrl||'',frameworks:frameworkChecks.map(c=>c.value).filter(name=>suite.cases.some(item=>item.automation?.[name]))};if(restoreInputs){const source=normalizedInputs(generationSnapshot);$('#requirements').value=source.requirements;$('#target-url').value=source.targetUrl;frameworkChecks.forEach(c=>c.checked=source.frameworks.includes(c.value));}syncUrl();renderCases();state('generated');inputsEdited();save();loadProfiles().catch(error=>notice(error.message));}
form.addEventListener('submit',async event=>{event.preventDefault();if(busy()||!form.reportValidity())return;const submissionVersion=++workspaceActionVersion;generating=true;const input={schemaVersion:2,...currentInputs(),provider:$('#provider').value};polling++;activeRun=null;generated=null;generationSnapshot=null;$('#automation-pane').replaceChildren();$('#cases-pane').replaceChildren();save();paintRun();state('loading');$('#test-review').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});$('#generate-button').disabled=true;try{const suite=await post('/api/generate',input);adopt(suite,{restoreInputs:workspaceActionVersion===submissionVersion,input});setTab('cases');paintRun();}catch(error){$('#error-copy').textContent=error.message;state('error');notice('Generation failed. Generate tests again to use your URL and requirements.');}finally{generating=false;$('#generate-button').disabled=!$('#provider').value||busy();renderAutomationIfVisible();}});
$('#retry-button').addEventListener('click',()=>form.requestSubmit());
$('#demo-button').addEventListener('click',async()=>{if(busy())return;const demoVersion=++workspaceActionVersion;generating=true;try{polling++;activeRun=null;adopt(await post('/api/demo/suites',{}),{restoreInputs:workspaceActionVersion===demoVersion});setTab('playwright');paintRun();}catch(error){notice(error.message);}finally{generating=false;renderAutomationIfVisible();}});
function caseResult(caseId){return activeRun?.suiteId===generated?.suiteId&&activeRun?.revision===generated?.revision?activeRun.cases?.find(c=>c.caseId===caseId):null;}
function verdict(item){
  const result=caseResult(item.caseId),el=node('div',undefined,'case-verdict');el.dataset.status=result?.status||'not-run';
  if(!result){el.textContent='Not run · no execution result for this case';return el;}
  const failedSteps=(result.steps||[]).filter(step=>step.error);
  const error=['failed','error'].includes(result.status)?result.error||failedSteps[0]?.error||result.actual:null;
  el.append(node('p',`${result.status.toUpperCase()} · ${error&&result.actual===error?'Playwright execution failed.':result.actual||'Awaiting result'}`,'verdict-summary'));
  if(error){
    const details=node('div',undefined,'case-error');details.append(node('strong','Playwright error'),node('pre',error,'case-error-output'));
    for(const step of failedSteps){details.append(node('p',`Failed step: ${step.label||step.stepId}`));if(step.error!==error)details.append(node('pre',step.error,'case-error-output'));}
    const link=node('a','View execution results');link.href='#run-result';details.append(link);el.append(details);
  }
  return el;
}
function renderSuiteExports(){
  const count=generated?.cases.filter(item=>['draft','ready'].includes(item.automation?.playwright?.status)).length||0;
  $('#export-cases').disabled=!generated;$('#export-code').disabled=!count;
  $('#export-note').textContent=generated?`Downloads use saved revision ${generated.revision}. All ${generated.cases.length} test cases are included in the text file; ${count} runnable Playwright test${count===1?'':'s'} are included in the code file.`:'';
}
async function downloadSuite(format,caseId){
  if(!generated)return;const suite=generated,query=new URLSearchParams({revision:String(suite.revision),format});if(caseId)query.set('caseId',caseId);
  const feedback=$('.suite-export-feedback');feedback.setAttribute('role','status');feedback.textContent='Preparing download…';
  try{
    const response=await fetch(`/api/suites/${suite.suiteId}/export?${query}`);
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(data.error||`Download failed (${response.status}).`);}
    const filename=response.headers.get('content-disposition')?.match(/filename="([^"\r\n]+)"/)?.[1]||(format==='text'?'test-cases.txt':'playwright-tests.spec.cjs');
    const url=URL.createObjectURL(await response.blob()),link=node('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);feedback.textContent=`Downloaded ${filename}.`;
  }catch(error){feedback.textContent=error.message;feedback.setAttribute('role','alert');throw error;}
}
function caseText(item){return [`${item.displayId}: ${item.title}`,`Preconditions: ${item.preconditions||'None'}`,'Steps:',...item.steps.map((step,index)=>`${index+1}. ${step}`),`Expected result: ${item.expected}`,`Requirement: ${item.requirementRef||'—'}`].join('\n');}
function renderCases(){
  renderSuiteExports();const pane=$('#cases-pane');pane.replaceChildren();$('#case-tab-count').textContent=generated.cases.length;
  $('#generated-by').textContent=`${generated.provider==='demo'?'Demo suite':generated.provider||'Saved suite'} · ${generated.targetUrl||'manual cases'} · review the draft before running`;
  for(const item of generated.cases){
    const card=node('article',undefined,'case-card'),heading=node('div',undefined,'case-heading'),feedback=node('p','','action-feedback');card.dataset.caseId=item.caseId;feedback.setAttribute('role','status');
    heading.append(node('h3',`${item.displayId} · ${item.title}`),button('Copy case',async()=>{await navigator.clipboard.writeText(caseText(item));feedback.setAttribute('role','status');feedback.textContent=`${item.displayId} copied.`;}));
    card.append(heading,feedback,row('Preconditions',item.preconditions));const list=node('ol');for(const step of item.steps)list.append(node('li',step));
    card.append(list,row('Expected result',item.expected),row('Requirement',item.requirementRef),verdict(item));pane.append(card);
  }
  for(const framework of ['playwright'])document.querySelector(`[data-tab="${framework}"]`).hidden=!generated.cases.some(c=>c.automation?.[framework])&&!generated.automation?.[framework];renderAutomationIfVisible();
}
function setTab(name){for(const tab of document.querySelectorAll('.tab')){const active=tab.dataset.tab===name;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}$('#cases-pane').hidden=name!=='cases';$('#automation-pane').hidden=name==='cases';if(name!=='cases')renderAutomation(name);}
function renderAutomationIfVisible(){if(generated&&!$('#automation-pane').hidden&&!$('#automation-pane .operation-editor'))renderAutomation(document.querySelector('.tab.active').dataset.tab);}
for(const tab of document.querySelectorAll('.tab'))tab.addEventListener('click',()=>setTab(tab.dataset.tab));
document.querySelector('.tabs').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...document.querySelectorAll('.tab')].filter(t=>!t.hidden),i=tabs.indexOf(document.activeElement);if(i<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;setTab(tabs[next].dataset.tab);tabs[next].focus();});
function verificationDetails(verification){
  const details=node('div',undefined,'verification-results');
  details.append(node('p','Initial-page check only. No clicks or fills were executed. Later page states are checked when you run the test.'));
  for(const r of verification.results)details.append(node('p',`${r.stepId}: ${r.status} · ${r.count} match(es) · ${r.reason||''}`));
  return details;
}
function renderAutomation(framework='playwright'){
  const pane=$('#automation-pane');
  if(pane.dataset.suiteId===generated?.suiteId)for(const details of pane.querySelectorAll('.case-code'))codeViews.set(details.dataset.viewKey,details.open);
  pane.replaceChildren();if(!generated)return;pane.dataset.suiteId=generated.suiteId;

  const runnable=generated.cases.filter(c=>['draft','ready'].includes(c.automation?.[framework]?.status));
  const controls=node('nav',undefined,'suite-actions case-navigation');controls.setAttribute('aria-label','Automation case navigation');const blocker=node('div',undefined,'execution-blocker');blocker.setAttribute('role','status');controls.append(blocker);
  const jump=node('select');jump.setAttribute('aria-label','Jump to case');jump.add(new Option('Jump to case…',''));
  for(const item of generated.cases)jump.add(new Option(`${item.displayId} · ${item.title}`,item.caseId));
  jump.addEventListener('change',()=>{
    const card=[...pane.querySelectorAll('.case-card')].find(card=>card.dataset.caseId===jump.value);if(!card)return;
    card.style.scrollMarginTop=`${controls.getBoundingClientRect().height+28}px`;
    card.querySelector('.case-select span').focus({preventScroll:true});
    card.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  });
  const count=node('span',`${selected.size} selected`,'selection-count');count.setAttribute('role','status');
  const runSelected=button('Run selected',()=>runCases([...selected],framework),blocked()||!selected.size||!capabilities?.runners[framework]?.available);
  const collapse=button('Collapse code',()=>{for(const details of pane.querySelectorAll('.case-code')){details.open=false;codeViews.set(details.dataset.viewKey,false);}});
  controls.append(jump,count,collapse,runSelected,button('Run all runnable',()=>runCases(runnable.map(c=>c.caseId),framework),blocked()||!runnable.length||!capabilities?.runners[framework]?.available,'run-button'));
  pane.append(node('p','Check the actions and code below. Clicking Run confirms these actions and starts execution. Each case has its own result.','automation-note'),controls);
  for(const item of generated.cases){
    const a=item.automation?.[framework]||{status:'manual-only',reason:'No automation mapping.'};
    const card=node('article',undefined,'case-card'),check=node('input');card.dataset.caseId=item.caseId;
    const canRun=['draft','ready'].includes(a.status);
    check.type='checkbox';check.checked=selected.has(item.caseId);check.disabled=blocked()||!canRun;
    check.setAttribute('aria-label',`Select ${item.displayId}`);
    check.addEventListener('change',()=>{check.checked?selected.add(item.caseId):selected.delete(item.caseId);count.textContent=`${selected.size} selected`;runSelected.disabled=blocked()||!selected.size||!capabilities?.runners[framework]?.available;});
    const label=node('label',undefined,'case-select'),title=node('span',`${item.displayId} · ${item.title}`);title.tabIndex=-1;label.append(check,title);
    card.append(label,node('p',`${a.status}${a.reason?` · ${a.reason}`:''}`,'case-status'),row('Expected result',item.expected));
    const feedback=node('p',caseFeedbacks.get(item.caseId)||'','action-feedback');feedback.setAttribute('role','status');
    const actions=node('div',undefined,'case-actions');
    if(canRun)actions.append(button(`Run ${item.displayId}`,()=>runCases([item.caseId],framework),blocked()||!capabilities?.runners[framework]?.available,'run-button'));
    if(a.code){
      const details=node('details',undefined,'case-code'),viewKey=`${framework}:${item.caseId}`;details.dataset.viewKey=viewKey;details.open=codeViews.get(viewKey)===true;
      const summary=node('summary','Playwright code');summary.setAttribute('aria-label',`View Playwright code for ${item.displayId}`);
      const tools=node('div',undefined,'code-tools');tools.append(button('Copy code',async()=>{await navigator.clipboard.writeText(a.code);caseFeedbacks.set(item.caseId,'Code copied.');feedback.textContent='Code copied.';}),button('Download this test',()=>downloadSuite('playwright',item.caseId)));
      details.append(summary,tools,node('pre',a.code,'code-preview'));card.append(details);
      details.addEventListener('toggle',()=>{if(details.isConnected)codeViews.set(viewKey,details.open);});
    }
    if(framework==='playwright'){
      const hasActions=(a.operations||a.steps||[]).length>0;
      actions.append(button('Edit actions',()=>editor(item,card),blocked()),button('Check locators',async()=>{
        feedback.textContent='Checking locators on the initial page…';
        const data=await post(`/api/suites/${generated.suiteId}/cases/${item.caseId}/verify`,{revision:generated.revision});
        const chosen=[...selected];caseFeedbacks.set(item.caseId,'Locator check completed. See the results below.');
        if(data.suite){adopt(data.suite);chosen.forEach(id=>selected.add(id));setTab('playwright');}
        else{card.querySelector('.verification-results')?.remove();card.append(verificationDetails(data));feedback.textContent='Locator check completed.';}
      },blocked()||!hasActions));
      if(a.verification)card.append(verificationDetails(a.verification));
      if(!hasActions)card.append(node('p','Add valid actions before checking locators or running this case.','helper'));
    }
    const lockNote=node('p','','run-blocked-reason');card.append(actions,lockNote,feedback,verdict(item));pane.append(card);
  }
  updateExecutionBlocker();
}
function field(label,value,type='text'){const wrap=node('label',label),input=node('input');input.type=type;input.value=value??'';wrap.append(input);return{wrap,input};}
function selectField(label,values,value){const wrap=node('label',label),input=node('select');for(const v of values)input.add(new Option(v,v));input.value=value;wrap.append(input);return{wrap,input};}
function editor(item,card){
  if(card.querySelector('.operation-editor'))return;
  if($('#automation-pane .operation-editor')){notice('Save or cancel the current action edits first.');return;}
  for(const control of $('#automation-pane').querySelectorAll('.suite-actions button,.case-actions button,.case-select input'))control.disabled=true;
  const panel=node('div',undefined,'operation-editor');panel.id='actions-editor';panel.dataset.displayId=item.displayId;panel.style.scrollMarginTop=`${$('#automation-pane .case-navigation').getBoundingClientRect().height+28}px`;
  panel.append(node('h3','Edit actions'),node('p','Save changes to update the generated code. Only fields used by the selected action are shown.','helper'));
  const feedback=node('p','','editor-feedback');feedback.setAttribute('role','status');
  const rows=node('div');const operations=item.automation.playwright.operations||item.automation.playwright.steps||[];
  function add(op={op:'expectText',value:''}){
    const stepId=op.stepId||`step-${crypto.randomUUID()}`,line=node('div',undefined,'operation-row');
    const kind=selectField('Action',['navigate','clickText','fillLabel','expectText','click','fill','expectVisible','expectTextExact','expectValue','expectCount','expectURL'],op.op);
    const locator=selectField('Locator',['text','label','role','testId','placeholder'],op.locator?.kind||'text');
    const value=field('Text / URL / expected value',op.value??op.text??'');
    const name=field('Locator name',op.locator?.name||op.locator?.value||op.label||'');
    const formScope=field('Form index (blank for whole page)',op.locator?.formIndex??'','number');formScope.input.min='0';formScope.input.max='100';formScope.input.step='1';
    const role=field('Role',op.locator?.role||'button');
    line.append(kind.wrap,locator.wrap,name.wrap,role.wrap,formScope.wrap,value.wrap,button('Remove action',()=>line.remove()));
    function sync(){
      const action=kind.input.value,structured=['click','fill','expectVisible','expectTextExact','expectValue','expectCount'].includes(action);
      locator.wrap.hidden=!structured;name.wrap.hidden=!structured&&action!=='fillLabel';formScope.wrap.hidden=!structured;role.wrap.hidden=!structured||locator.input.value!=='role';
      value.wrap.hidden=['click','expectVisible'].includes(action);
      const title=action==='navigate'||action==='expectURL'?'URL':action==='expectText'||action==='expectTextExact'?'Expected text':action==='clickText'?'Button / link text':action==='expectCount'?'Expected count':action==='expectValue'?'Expected value':'Input value';
      value.wrap.firstChild.textContent=title;
      value.input.type=action==='expectCount'?'number':'text';
    }
    kind.input.addEventListener('change',sync);locator.input.addEventListener('change',sync);sync();
    line.read=()=>{
      const result={stepId,op:kind.input.value};
      if(['navigate','clickText','expectText','expectURL'].includes(result.op))result.value=value.input.value;
      else if(result.op==='fillLabel'){result.label=name.input.value;result.text=value.input.value;}
      else{result.locator={kind:locator.input.value,...(locator.input.value==='role'?{role:role.input.value,value:name.input.value}:{value:name.input.value}),exact:true};if(formScope.input.value!=='')result.locator.formIndex=Number(formScope.input.value);if(['fill','expectTextExact','expectValue'].includes(result.op))result.value=value.input.value;if(result.op==='expectCount')result.value=Number(value.input.value);}
      return result;
    };rows.append(line);
  }
  operations.forEach(add);
  panel.append(rows,feedback,button('Add action',()=>add()),button('Save actions',async()=>{
    if(!requireCurrentInputs()){feedback.textContent='Requirements or URL changed. Generate a new suite before saving these actions.';return;}
    feedback.textContent='Saving actions…';
    const updated=await post(`/api/suites/${generated.suiteId}/cases/${item.caseId}`,{expectedRevision:generated.revision,automationEdit:{operations:[...rows.children].map(line=>line.read())}},'PATCH');
    caseFeedbacks.set(item.caseId,`Actions saved · revision ${updated.revision}. Open the code preview above to see your changes.`);
    adopt(updated);setTab('playwright');
  }),button('Cancel editing',()=>{panel.remove();renderAutomationIfVisible();}));card.append(panel);updateExecutionBlocker();
}
async function runCases(ids,framework='playwright'){
  if(!ids.length||busy()||!requireCurrentInputs())return;
  const cases=ids.map(id=>generated.cases.find(c=>c.caseId===id));
  if(cases.some(item=>!item||!['draft','ready'].includes(item.automation?.[framework]?.status)))throw new Error('Choose cases with valid automation actions.');
  starting=true;renderAutomation(framework);
  try{
    const draftIds=cases.filter(c=>c.automation[framework].status==='draft').map(c=>c.caseId);
    if(draftIds.length){const updated=await post(`/api/suites/${generated.suiteId}/review`,{expectedRevision:generated.revision,caseIds:draftIds,reviewed:true,framework},'PATCH');adopt(updated);ids.forEach(id=>selected.add(id));setTab(framework);}
    const body={schemaVersion:2,suiteId:generated.suiteId,revision:generated.revision,framework,selectedCaseIds:ids,mode:$('#run-mode').value,idempotencyKey:crypto.randomUUID(),slowMo:Number($('#slow-mo').value),recordVideo:$('#record-video').checked};
    if($('#auth-profile').value)body.authProfileId=$('#auth-profile').value;
    activeRun=await post('/api/runs',body);save();paintRun();$('#run-result').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});pollRun(activeRun.runId);
  }finally{starting=false;renderAutomationIfVisible();}
}
const timestampFormatter=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'});
function formatTimestamp(value){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.getTime())?'—':timestampFormatter.format(date);}
function paintRun(){const panel=$('#run-result');$('#cancel-run').hidden=!activeRun||terminal(activeRun.status);$('#run-log-section').hidden=!activeRun;$('#run-metadata').hidden=!activeRun;$('#run-details').replaceChildren();if(!activeRun){$('#coverage-summary').textContent='';$('#run-exports').hidden=true;$('#run-exports').querySelectorAll('a').forEach(link=>link.removeAttribute('href'));$('#run-output').textContent='';$('#run-metadata').replaceChildren();$('#run-expected').textContent='';$('#run-actual').textContent='';$('#run-actual').hidden=true;$('#batch-note').textContent='';$('#reconnect-button').hidden=true;panel.removeAttribute('data-status');$('#run-status').textContent='Not run';$('#run-heading').textContent='Your next run starts here';$('#run-summary').textContent='Review a draft, then run it to inspect real results.';return;}panel.dataset.status=activeRun.status;$('#run-status').textContent=activeRun.status;$('#run-heading').textContent=terminal(activeRun.status)?`Execution completed · revision ${activeRun.revision}`:`Execution in progress · revision ${activeRun.revision}`;const cases=activeRun.cases||[];const counts=['passed','failed','error','canceled','skipped','queued','running'].map(status=>[status,cases.filter(c=>c.status===status).length]).filter(([,count])=>count);$('#run-summary').textContent=typeof activeRun.summary==='string'?activeRun.summary:counts.map(([s,n])=>`${n} ${s}`).join(' · ');$('#coverage-summary').textContent=`${cases.filter(c=>c.status==='passed').length} of ${cases.length} selected cases passed`;$('#run-output').textContent=activeRun.output||'Waiting for runner output.';$('#run-metadata').replaceChildren();for(const [label,value]of [['Target',activeRun.targetUrl],['Started',formatTimestamp(activeRun.startedAt)],['Finished',activeRun.finishedAt?formatTimestamp(activeRun.finishedAt):terminal(activeRun.status)?'—':'In progress']]){const group=node('div');group.append(node('dt',label),node('dd',value||'—'));$('#run-metadata').append(group);}if(activeRun.evidenceWarning)$('#run-details').append(node('p',activeRun.evidenceWarning,'workspace-notice'));for(const result of cases){const card=node('article',undefined,'case-card');const item=generated?.cases.find(c=>c.caseId===result.caseId);card.append(node('h3',`${item?.displayId||result.caseId} · ${result.status}`),row('Expected',result.expected),row('Actual',result.actual||result.error||'Waiting for execution'));const steps=node('ol',undefined,'step-timeline');for(const step of result.steps||[])steps.append(node('li',`${step.status} · ${step.label||step.stepId}${step.durationMs!==undefined?` · ${step.durationMs} ms`:''}`));card.append(steps);if(result.evidenceWarning)card.append(node('p',result.evidenceWarning,'workspace-notice'));for(const artifact of result.artifacts||[]){if(artifact.expired){card.append(node('p',`${artifact.kind} evidence expired · retained result remains available.`,'helper'));continue;}const url=`/api/runs/${activeRun.runId}/artifacts/${artifact.artifactId}`;const link=node('a',artifact.kind==='video'?'Recorded video':`Open ${artifact.kind}`);link.href=url;link.target='_blank';link.rel='noopener';card.append(link);if(artifact.kind==='screenshot'){const image=node('img');image.src=url;image.alt=`Screenshot for ${item?.displayId||result.caseId}`;image.className='evidence-image';card.append(image);}}$('#run-details').append(card);}$('#run-exports').hidden=false;for(const link of $('#run-exports').querySelectorAll('a'))link.href=`/api/runs/${activeRun.runId}/export?format=${link.dataset.format}`;renderCases();save();}
async function pollRun(id){const version=++polling;while(version===polling){try{const run=await request(`/api/runs/${id}`);if(version!==polling)return;activeRun=run;paintRun();$('#reconnect-button').hidden=true;if(terminal(run.status)){loadHistory().catch(()=>{});return;}const events=await request(`/api/runs/${id}/events?afterSeq=${run.lastEventSeq||0}`).catch(()=>null);if(events?.snapshotRequired)notice('Timeline refreshed from the current server snapshot.');if(run.deadlineAt&&Date.now()>Date.parse(run.deadlineAt)+10000)notice('The run exceeded its deadline. Waiting for the server to reconcile its final status.');}catch(error){if(version!==polling)return;notice(`Reconnecting: ${error.message}. The server keeps the batch running.`);$('#reconnect-button').hidden=false;}await new Promise(resolve=>setTimeout(resolve,1000));}}
$('#cancel-run').addEventListener('click',async()=>{try{activeRun=await post(`/api/runs/${activeRun.runId}/cancel`,{});paintRun();}catch(error){notice(error.message);}});$('#reconnect-button').addEventListener('click',()=>activeRun&&pollRun(activeRun.runId));
async function loadHistory(cursor){const data=await request(`/api/runs?limit=20${cursor?`&cursor=${encodeURIComponent(cursor)}`:''}`);const pane=$('#history-list');if(!cursor)pane.replaceChildren();for(const run of data.runs)pane.append(button(`${run.status} · ${run.startedAt||run.runId}`,async()=>{workspaceActionVersion++;polling++;activeRun=await request(`/api/runs/${run.runId}`);adopt(await request(`/api/suites/${activeRun.suiteId}?revision=${activeRun.revision}`),{restoreInputs:true});paintRun();if(!terminal(activeRun.status))pollRun(activeRun.runId);}));$('#history-more').hidden=!data.nextCursor;$('#history-more').onclick=()=>loadHistory(data.nextCursor).catch(error=>notice(error.message));}
async function loadProfiles(){const data=await request('/api/auth/profiles');const select=$('#auth-profile');select.replaceChildren(new Option('No authentication profile',''));const origin=generated?.targetUrl?new URL(generated.targetUrl).origin:null;for(const profile of data.profiles)if(profile.origin===origin)select.add(new Option(profile.label,profile.profileId||profile.id));$('#profile-list').replaceChildren();for(const profile of data.profiles){const id=profile.profileId||profile.id,line=node('div',undefined,'case-actions');line.append(node('span',`${profile.label} · ${profile.origin}`),button('Open login browser',async()=>{await post(`/api/auth/profiles/${id}/capture`,{});notice('Complete login in the opened local browser, then choose Save login session.');}),button('Save login session',async()=>{await post(`/api/auth/profiles/${id}/complete`,{});await loadProfiles();}),button('Delete',async()=>{await request(`/api/auth/profiles/${id}`,{method:'DELETE'});await loadProfiles();}));$('#profile-list').append(line);}}
$('#create-profile').addEventListener('click',async()=>{try{await post('/api/auth/profiles',{label:$('#profile-label').value,origin:$('#profile-origin').value});await loadProfiles();}catch(error){notice(error.message);}});$('#refresh-readiness').addEventListener('click',()=>loadCapabilities(true));$('#refresh-history').addEventListener('click',()=>loadHistory().catch(error=>notice(error.message)));$('#copy-button').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(generated.cases.map(caseText).join('\n\n'));notice('Cases copied.');}catch(error){notice(error.message);}});for(const [id,format] of [['export-cases','text'],['export-code','playwright']])$(`#${id}`).addEventListener('click',async()=>{const control=$(`#${id}`);control.disabled=true;try{await downloadSuite(format);}catch(error){notice(error.message);}finally{renderSuiteExports();}});
(async()=>{let saved;try{saved=JSON.parse(storage.get('test-buddy-workspace')||'null');}catch{}const initialVersion=workspaceActionVersion;await loadCapabilities();loadHistory().catch(()=>{});loadProfiles().catch(()=>{});try{if(workspaceActionVersion!==initialVersion)return;if(saved?.suiteId){const suite=await request(`/api/suites/${saved.suiteId}?revision=${saved.revision}`);if(workspaceActionVersion!==initialVersion)return;adopt(suite,{restoreInputs:true});}if(saved?.runId){const run=await request(`/api/runs/${saved.runId}`);if(workspaceActionVersion!==initialVersion)return;activeRun=run;paintRun();if(!terminal(activeRun.status))pollRun(activeRun.runId);}}catch(error){notice(`Saved workspace unavailable: ${error.message}. Load the demo or generate a new suite.`);}})();

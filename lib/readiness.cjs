const fs=require('node:fs');const path=require('node:path');const cache=new Map();
async function checkReadiness({nodeVersion=process.versions.node,playwrightCommand,timeoutMs=10000,refresh=false,launch}={}){
 const key=`${nodeVersion}|${playwrightCommand}`;if(!refresh&&!launch&&cache.has(key)&&Date.now()-cache.get(key).at<30000)return structuredClone(cache.get(key).result);
 const result={available:false,node:Number(String(nodeVersion).replace(/^v/,'').split('.')[0])>=20,runner:false,browser:false,reason:''};
 if(!result.node){result.reason='Node 20 or newer is required.';return result;}
 if(!playwrightCommand||!fs.existsSync(playwrightCommand)){result.reason='Project-local Playwright runner is missing. Run npm install in this project.';return result;}
 result.runner=true;let browser,timer,expired=false;
 try{
  const factory=launch||(()=>{const location=require.resolve('playwright',{paths:[path.dirname(playwrightCommand),process.cwd(),path.resolve(__dirname,'..')]});return require(location).chromium.launch({headless:true,timeout:timeoutMs});});
  const pending=Promise.resolve().then(factory).then(async b=>{if(expired){await b.close().catch(()=>{});throw Error('Chromium readiness timed out.');}browser=b;return b;});
  await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('Chromium readiness timed out.'));},timeoutMs);})]);
  result.browser=true;result.available=true;
 }catch(error){result.reason=`Chromium is not ready: ${String(error.message).slice(0,700)}. Install the matching browser with npx playwright install chromium if it is missing.`;}
 finally{clearTimeout(timer);if(browser)try{await browser.close();}catch(error){result.available=false;result.browser=false;result.reason=`Chromium could not close: ${String(error.message).slice(0,500)}`;}}
 if(!launch)cache.set(key,{at:Date.now(),result:structuredClone(result)});return result;
}
module.exports={checkReadiness};

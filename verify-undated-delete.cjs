const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium,webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=fs.readFileSync(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':'changepoint.html','utf8');
const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'');
const mock=`const Chart=class{destroy(){}};
const initializeApp=()=>({}),getFirestore=()=>({}),getStorage=()=>({}),getAuth=()=>({currentUser:{uid:'test'}}),setPersistence=async()=>{},browserLocalPersistence={},onAuthStateChanged=()=>{},signInAnonymously=async()=>{};
const collection=(_, ...p)=>p.join('/'),doc=(_, ...p)=>p.join('/'),query=x=>x,orderBy=()=>{},onSnapshot=()=>{},serverTimestamp=()=>new Date();
const getDocs=async()=>({docs:[]}),getDoc=async()=>({exists:()=>false}),ref=()=>{},uploadBytesResumable=()=>{},getDownloadURL=()=>{};
const addDoc=async()=>{throw Error('unexpected create')},updateDoc=async()=>{throw Error('unexpected update')},runTransaction=async()=>{throw Error('unexpected transaction')};
window.__deletes=[];window.__attempts=[];
const deleteDoc=async target=>{window.__attempts.push(target);if(window.__hold)await new Promise(r=>window.__release=r);if(window.__fail)throw Error('offline fixture');window.__deletes.push(target)};
localStorage.setItem('changepointActorName','テスト');`;
const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module">${mock}${source}
await initApp();document.getElementById('authGate').style.display='none';showScreen('menu');
window.__show=showDetail;window.__setData=items=>{changepointData=items;setupTopicsDeptFilter();updateTopics()};window.__ready=true;</script>`);
const item={_id:'undated',type:'planned',workflowManaged:true,approvalStatus:'draft',switchStatus:'undecided',occurrenceDate:'',planneddepartment:'品質',department:'製造',category:'設備',lineName:'94-300',serialNo:'7106',content:'日程未確定の削除確認',checklistItems:[],evidenceAttachments:[]};
async function main(){
 fs.mkdirSync('outputs/undated-delete',{recursive:true});
 for(const engine of ['chromium','webkit']){
  const browser=await(engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{
   const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],alerts=[];let confirmDelete=false;
   page.on('pageerror',e=>errors.push(e.message));
   page.on('dialog',async d=>{if(d.type()==='confirm'){if(confirmDelete)await d.accept();else await d.dismiss();}else{alerts.push(d.message());await d.dismiss();}});
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));
   await page.goto('http://127.0.0.1/delete-test');await page.waitForFunction(()=>window.__ready);
   await page.evaluate(x=>window.__setData([x]),item);
   await page.getByText('日程未確定',{exact:false}).filter({has:page.locator('#boardUndecidedCount')}).click();
   await page.locator('#topicsUndecided [data-change-id="undated"]').click();
   const button=page.locator('#btnDetailDelete'),modal=page.locator('#detailModal');
   await modal.waitFor({state:'visible'});assert(await button.isVisible());assert(!(await page.locator('#btnDetailEdit').isVisible()));
   for(const width of [390,1280]){await page.setViewportSize({width,height:900});await button.scrollIntoViewIfNeeded();await page.screenshot({path:`outputs/undated-delete/${engine}-${width}.png`});}
   // Cancellation and failure must preserve the card and allow another attempt.
   await button.click();await page.waitForFunction(()=>!document.getElementById('btnDetailDelete').disabled);
   assert(await modal.isVisible());assert.equal(await page.evaluate(()=>window.__attempts.length),0);
   confirmDelete=true;await page.evaluate(()=>window.__fail=true);await button.click();
   await page.waitForFunction(()=>!document.getElementById('btnDetailDelete').disabled);
   assert(await modal.isVisible());assert(alerts.some(x=>x.includes('削除に失敗')));assert.equal(await page.evaluate(()=>window.__deletes.length),0);
   await page.evaluate(()=>{window.__fail=false;window.__hold=true});await button.click();
   await page.waitForFunction(()=>!!window.__release);assert(await button.isDisabled());
   await button.evaluate(el=>el.click());assert.equal(await page.evaluate(()=>window.__attempts.length),2);
   await page.evaluate(()=>{window.__hold=false;window.__release()});await modal.waitFor({state:'hidden'});
   assert.deepEqual(await page.evaluate(()=>window.__deletes),['changepoints/undated']);
   // Null/missing dates and dated cards use the same delete control.
   for(const date of [null,undefined,'2026-10-22']){
    await page.evaluate(x=>window.__show(x),{...item,occurrenceDate:date,switchStatus:date?'scheduled':'undecided'});assert(await button.isVisible());
   }
   // A delayed deletion must not close a different card opened in the meantime.
   await page.evaluate(()=>{window.__hold=true;window.__release=null});await button.click();await page.waitForFunction(()=>!!window.__release);
   await page.evaluate(x=>window.__show(x),{...item,_id:'another'});await page.evaluate(()=>{window.__hold=false;window.__release()});
   await page.waitForFunction(()=>!document.getElementById('btnDetailDelete').disabled);assert(await modal.isVisible());
   await page.evaluate(()=>window.__show({_id:'anomaly',type:'anomaly'}));assert(!(await button.isVisible()));
   assert.deepEqual(errors,[]);console.log('PASS '+engine+': undated board card deletion, empty/null/missing dates, dated cards, cancel, failure/retry, double tap, target isolation, anomaly protection. Mock DB only.');
  }finally{await browser.close()}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});

const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=fs.readFileSync(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':'changepoint.html','utf8');
const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'');
const mock=`
const initializeApp=()=>({}),getFirestore=()=>({}),getStorage=()=>({}),getAuth=()=>({currentUser:{uid:'fixture'}}),setPersistence=async()=>{},browserLocalPersistence={},onAuthStateChanged=()=>{},signInAnonymously=async()=>{};
const collection=(_, ...p)=>p.join('/'),doc=(_, ...p)=>p.join('/'),query=x=>x,orderBy=()=>{},serverTimestamp=()=>new Date();
window.__reads=[];window.__subs=[];window.__pending={};window.__callbacks={};
const getDocs=ref=>{window.__reads.push(ref);return new Promise((resolve,reject)=>window.__pending[ref]={resolve,reject})};
const onSnapshot=(ref,next,error)=>{window.__subs.push(ref);window.__callbacks[ref]={next,error};return ()=>{}};
const getDoc=async()=>{throw Error('unexpected document read')},ref=()=>{},uploadBytesResumable=()=>{},getDownloadURL=()=>{};
const addDoc=async()=>{throw Error('unexpected write')},deleteDoc=addDoc,updateDoc=addDoc,runTransaction=addDoc;
window.__masters=(fail=false)=>{for(const [ref,p] of Object.entries(window.__pending)){
 if(fail && ref.includes('changeChecklist')){p.reject(Error('master unavailable'));continue;}
 const data=ref.includes('changeChecklist')?[{id:'new-check',data:()=>({category:'設備',name:'追加された安全チェック',criteria:'危険がないこと'})}]:[];
 p.resolve({docs:data});}}
window.__emit=data=>window.__callbacks['changepoints/fixture'].next({id:'fixture',exists:()=>!!data,data:()=>structuredClone(data)});
window.__error=()=>window.__callbacks['changepoints/fixture'].error(Error('fixture denied'));
`;
const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module">${mock}${source}\nwindow.__init=initApp();document.getElementById('authGate').style.display='none';window.__started=true;</script>`);
const planned=(status='sender_approved')=>({type:'planned',workflowManaged:true,approvalStatus:status,category:'設備',planneddepartment:'品質',department:'製造',lineName:'94-300',processName:'溶接',serialNo:'7106',content:'溶接条件変更後の確認',occurrenceDate:'2026-10-14',checklistItems:[{key:'stored',label:'以前の項目',receiverResult:'ok'}],evidenceAttachments:[]});
async function main(){
 fs.mkdirSync('outputs/qr-startup',{recursive:true});
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{
   const page=await browser.newPage({viewport:{width:390,height:850}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));
   async function start(query='?changepointId=fixture'){
    await page.goto('http://127.0.0.1/qr-startup'+query);await page.waitForFunction(()=>window.__started);
   }
   const emit=item=>page.evaluate(item=>window.__emit(item),item);
   await start();
   assert.deepEqual(await page.evaluate(()=>window.__subs),['changepoints/fixture']);
   assert.deepEqual(await page.evaluate(()=>window.__reads),['masters/department/items','masters/changeChecklist/items']);
   // Approval displays while both necessary master reads are deliberately unresolved.
   await emit(planned('draft'));assert(await page.locator('#quickApproverName').isVisible());
   assert(!(await page.locator('#mainMenu').isVisible()));
   await page.evaluate(()=>window.__masters());await page.evaluate(()=>window.__init);
   assert.deepEqual(await page.evaluate(()=>window.__subs),['changepoints/fixture']);
   await start();
   await page.evaluate(item=>{window.__emit(item)},planned());
   await page.waitForFunction(()=>document.querySelector('#quickApprovalScreen').textContent.includes('チェック項目を読み込み中'));
   assert.equal(await page.locator('#receiverStampButton').count(),0);
   await page.evaluate(()=>window.__masters());await page.evaluate(()=>window.__init);
   await page.locator('#receiverStampButton').waitFor();
   assert(await page.locator('#receiverStampButton').isDisabled());
   assert((await page.locator('#approvalWorkflow').textContent()).includes('追加された安全チェック'));
   assert(!(await page.locator('#quickApprovalScreen').isVisible()));
   assert.equal(await page.locator('#detailTitle').textContent(),'対応者チェック');
   assert.equal(await page.locator('#evidenceHost,#qualityEvaluationHost').count(),0);
   await page.locator('#workflowStampName').fill('入力途中');
   await emit(planned());assert.equal(await page.locator('#workflowStampName').inputValue(),'入力途中');
   for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:850});
    assert(await page.locator('#detailModal .modal-content').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    await page.screenshot({path:path.resolve('outputs/qr-startup/'+engine+'-'+width+'.png')});
   }
   await emit(planned('receiver_confirmed'));assert(await page.locator('#quickApproverName').isVisible());assert.equal(await page.locator('#quickApproverName').inputValue(),'');
   await emit(null);assert((await page.locator('#quickApprovalScreen').textContent()).includes('見つかりません'));
   await emit(planned('draft'));assert(await page.locator('#quickApproverName').isVisible());
   await page.evaluate(()=>window.__error());assert(await page.locator('#retryLinkedEntry').isVisible());assert.equal(await page.locator('#quickApproverName').count(),0);
   // Checklist failure must not expose an actionable responder stamp.
   await start();await page.evaluate(item=>{window.__emit(item)},planned());await page.evaluate(()=>window.__masters(true));await page.evaluate(()=>window.__init);
   await page.locator('#retryLinkedEntry').waitFor();assert.equal(await page.locator('#receiverStampButton').count(),0);
   // An older waiting callback must not reopen a deleted/canceled record.
   await start();await page.evaluate(item=>{window.__emit(item)},planned());await emit(null);await page.evaluate(()=>window.__masters());await page.evaluate(()=>window.__init);
   assert((await page.locator('#quickApprovalScreen').textContent()).includes('見つかりません'));assert.equal(await page.locator('#receiverStampButton').count(),0);
   // Normal board and explicit full detail retain collection subscriptions.
   for(const query of ['', '?changepointId=fixture&view=detail','?changepointId=fixture&qualityEvaluation=1','?productionDateId=fixture']){
    await start(query);await page.evaluate(()=>window.__masters());await page.evaluate(()=>window.__init);
    assert.deepEqual(await page.evaluate(()=>window.__subs),['anomalies','changepoints']);
   }
   assert.deepEqual(errors,[]);
   console.log('PASS '+engine+': single-document QR startup, parallel masters, early approval, gated direct checks, new master checks, preserved input, stage refresh, errors/missing/stale callbacks, normal routes, responsive. No production writes.');
  }finally{await browser.close()}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});

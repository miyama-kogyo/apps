const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=fs.readFileSync(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':'changepoint.html','utf8');
const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'');
const mock=`const initializeApp=()=>({}),getFirestore=()=>({}),getStorage=()=>({}),getAuth=()=>({currentUser:{uid:'test'}}),setPersistence=async()=>{},browserLocalPersistence={},onAuthStateChanged=()=>{},signInAnonymously=async()=>{};
const collection=(_, ...p)=>p.join('/'),doc=(_, ...p)=>p.join('/'),query=x=>x,orderBy=()=>{},onSnapshot=()=>{},serverTimestamp=()=>new Date();
const getDocs=async()=>({docs:[]}),getDoc=async()=>({exists:()=>false}),ref=()=>{},uploadBytesResumable=()=>{},getDownloadURL=()=>{};
const addDoc=async()=>{throw Error('unexpected create')},deleteDoc=async()=>{throw Error('unexpected delete')},updateDoc=async()=>{throw Error('unexpected nontransaction write')};
window.__records={};window.__writes=[];window.__fail=false;
const runTransaction=async(_,fn)=>{if(window.__hold)await new Promise(r=>window.__release=r);if(window.__fail)throw Error('offline test failure');return fn({get:async ref=>{const data=window.__records[ref.split('/').pop()];return {exists:()=>!!data,data:()=>structuredClone(data)}},update:(ref,p)=>{Object.assign(window.__records[ref.split('/').pop()],p);window.__writes.push(p)}})};
localStorage.setItem('changepointActorName','対応者テスト');`;
const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module">${mock}${source}\nawait initApp();document.getElementById('authGate').style.display='none';window.__show=item=>{window.__records[item._id]=structuredClone(item);showDetail(item)};window.__snapshot=items=>{changepointData=items;refreshQuickApprovalFromSnapshot()};window.__linked=items=>{changepointData=items;linkedChangepointOpened=false;openLinkedChangepointIfReady()};window.__ticket=item=>renderChangeTicket(item,'原本','品質');window.__ready=true;</script>`);
const planned=(status='sender_approved')=>({_id:'fixture',type:'planned',workflowManaged:true,approvalStatus:status,planneddepartment:'品質',department:'製造',lineName:'94-300',serialNo:'7106',content:'溶接条件変更後の確認',createdBy:'作成者',senderApprovedBy:'発信上司',checklistItems:[{key:'a',label:'安全面に問題はないか',receiverResult:'ok'}],actualSwitchDate:'2026-10-13',actualSwitchTime:'09:15',evidenceAttachments:[]});
async function main(){
 fs.mkdirSync('outputs/quality-check',{recursive:true});
 assert(!html.includes('bulkUnplanned'));
 for(const engine of ['chromium','webkit']){
  const b=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{
   const page=await b.newPage({viewport:{width:1280,height:900}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));
   await page.goto('http://127.0.0.1/quality-test');await page.waitForFunction(()=>window.__ready);
   const item={...planned('post_check'),type:'sudden',content:'金型条件変更の確認',workflowKind:'unplanned_response_v2',postCheckRevision:0,checklistItems:[{key:'old',receiverResult:'ng'}]};
   const show=async patch=>page.evaluate(x=>window.__show(x),{...item,...patch});
   const count=()=>page.evaluate(()=>window.__writes.length);
   for(const workflowKind of [undefined,'unplanned_postcheck_v1','unplanned_response_v2']){
    await show({workflowKind});assert.equal(await page.locator('#unplannedCheckForm').count(),0);
    await page.locator('#qualityCheckName').fill('');await page.locator('#qualityCheckToggle').click();
    assert.equal(await page.locator('#qualityCheckToggle').isChecked(),false);
    const before=await count();
    await page.locator('#qualityCheckName').fill('品質テスト');await page.locator('#qualityCheckToggle').click();
    await page.waitForFunction(()=>window.__records.fixture.qualityCheckedBy==='品質テスト');
    assert.equal(await count(),before+1);
    assert.deepEqual(await page.evaluate(()=>window.__records.fixture.checklistItems),item.checklistItems);
    assert.equal(await page.evaluate(()=>window.__records.fixture.postCheckedBy),undefined);
    assert((await page.locator('#approvalWorkflow').textContent()).includes('品管チェック ☑（品質テスト）'));
    assert.equal(await page.locator('#qualityCheckToggle').count(),0);
    const ticket=await page.evaluate(()=>window.__ticket(window.__records.fixture));
    assert(ticket.includes('品管チェック ☑（品質テスト）'));assert(!ticket.includes('対応者判定'));assert(!ticket.includes('data-card-qr'));
   }
   for(const patch of [{content:'changed'},{switchStatus:'canceled'},{switchStatus:'completed'},{postCheckRevision:1}]){
    await show({});const before=await count();
    await page.evaluate(p=>Object.assign(window.__records.fixture,p),patch);
    await page.locator('#qualityCheckToggle').click();
    await page.waitForFunction(()=>document.getElementById('qualityCheckStatus').textContent.includes('保存できません'));
    assert.equal(await count(),before);assert(!(await page.locator('#qualityCheckToggle').isChecked()));
   }
   await show({});await page.evaluate(()=>window.__fail=true);const before=await count();
   await page.locator('#qualityCheckToggle').click();
   await page.waitForFunction(()=>document.getElementById('qualityCheckStatus').textContent.includes('offline'));
   assert.equal(await count(),before);await page.evaluate(()=>{window.__fail=false;window.__hold=true});
   await page.locator('#qualityCheckToggle').click();assert(await page.locator('#qualityCheckToggle').isDisabled());
   await page.evaluate(()=>window.saveQualityCheck(document.getElementById('qualityCheckToggle')));
   await page.evaluate(()=>{window.__hold=false;window.__release()});await page.waitForFunction(()=>window.__records.fixture.qualityCheckedBy);
   assert.equal(await count(),before+1);
   for(const patch of [{switchStatus:'completed',responseApprovedBy:'旧承認者'},{switchStatus:'canceled'}]){
    await show(patch);assert.equal(await page.locator('#qualityCheckToggle').count(),0);
    assert(!(await page.locator('#approvalWorkflow').textContent()).includes('品管チェック ☑'));
   }
   await page.evaluate(()=>history.replaceState(null,'','?changepointId=fixture'));
   await show({});assert(await page.locator('#quickApprovalScreen').isVisible());
   for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:850});
    assert(await page.locator('#quickApprovalScreen').evaluate(e=>e.scrollWidth<=e.clientWidth));
    await page.screenshot({path:path.resolve('outputs/quality-check/'+engine+'-'+width+'.png')});
   }
   await page.locator('#qualityCheckName').fill('品管担当');await page.locator('#qualityCheckToggle').click();
   await page.waitForFunction(()=>document.getElementById('quickApprovalScreen').textContent.includes('品管チェック ☑（品管担当）'));
   assert.equal(await page.locator('#stampApprovalDialog').evaluate(e=>e.open),false);
   assert.deepEqual(errors,[]);
   console.log('PASS '+engine+': quality-only, no bulk, legacy/pending/completed/canceled, name, concurrency, retry, double-click, preserved history, print and mobile.');
  }finally{await b.close()}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});

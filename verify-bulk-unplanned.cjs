const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=fs.readFileSync(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':'changepoint.html','utf8');
const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'');
const mock=`const initializeApp=()=>({}),getFirestore=()=>({}),getStorage=()=>({}),getAuth=()=>({currentUser:{uid:'fixture'}}),setPersistence=async()=>{},browserLocalPersistence={},onAuthStateChanged=()=>{},signInAnonymously=async()=>{};
const collection=(_, ...p)=>p.join('/'),doc=(_, ...p)=>p.join('/'),query=x=>x,orderBy=()=>{},onSnapshot=()=>{},serverTimestamp=()=>new Date();
const getDocs=async ref=>({docs:ref.includes('department')?['製造','保全'].map((name,i)=>({id:String(i),data:()=>({name})})):[]}),getDoc=async()=>({exists:()=>false}),ref=()=>{},uploadBytesResumable=()=>{},getDownloadURL=()=>{};
const addDoc=async()=>{throw Error('unexpected create')},deleteDoc=addDoc,updateDoc=addDoc;
window.__records={};window.__writes=[];window.__fail=[];
const runTransaction=async(_,fn)=>{if(window.__hold)await new Promise(resolve=>window.__release=resolve);let changes=[];const result=await fn({get:async ref=>{const id=ref.split('/').pop();if(window.__fail.includes(id))throw Error('テスト通信エラー');const data=window.__records[id];return {exists:()=>!!data,data:()=>{const copy=structuredClone(data);if(copy?.checklistItems)copy.checklistItems=copy.checklistItems.map(x=>Object.fromEntries(Object.entries(x).reverse()));return copy}}},update:(ref,p)=>changes.push({id:ref.split('/').pop(),p})});for(const {id,p} of changes){Object.assign(window.__records[id],p);window.__writes.push({id,p})}return result};`;
const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module">${mock}${source}\nawait initApp();document.getElementById('authGate').style.display='none';updateTopics=()=>{};renderPlannedHistory=()=>{};window.__load=items=>{window.__records=Object.fromEntries(items.map(x=>[x._id,structuredClone(x)]));changepointData=items;bulkUnplanned.mode='check';bulkUnplanned.drafts.clear();showScreen('bulkUnplanned');openBulkUnplanned()};window.__ready=true;</script>`);
const item=(id,extra={})=>({_id:id,type:'sudden',category:'設備',workflowKind:'unplanned_response_v2',approvalStatus:'post_check',department:'製造',lineName:'94-300',serialNo:id,content:'溶接条件変更 '+id,occurrenceDate:'2026-10-14',postCheckRevision:0,evidenceAttachments:[],...extra});
async function main(){
 fs.mkdirSync('outputs/bulk-unplanned',{recursive:true});
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{
   const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto('http://127.0.0.1/bulk-test');await page.waitForFunction(()=>window.__ready);
   const records=[item('a',{workflowKind:'',category:'',workflowComment:'既存の所見'}),item('b',{temporaryChange:true,temporaryUntil:'2026-10-31',checklistItems:[{key:'post_safety',receiverResult:'ng'}],content:'<img src=x onerror=alert(1)> 工程変更'}),item('c',{switchStatus:'canceled'}),item('d',{type:'planned'}),item('e',{approvalStatus:'approved'})];
   await page.evaluate(items=>window.__load(items),records);
   assert.equal(await page.locator('#bulkRows tr').count(),2);assert.equal(await page.locator('#bulkRows img').count(),0);
   await page.locator('#bulkSelectAll').check();await page.locator('#bulkActor').fill('対応者テスト');await page.locator('#bulkReview').click();
   assert.equal(await page.locator('#bulkConfirm').evaluate(e=>e.open),false);assert((await page.locator('#bulkResult').textContent()).includes('未確認'));assert.equal(await page.evaluate(()=>window.__writes.length),0);
   await page.locator('#bulkCommon summary').click();
   for(const id of ['bulkSafety','bulkProducts','bulkWorkability'])await page.locator('#'+id).check();
   await page.locator('#bulkCategory').selectOption('設備');await page.locator('#bulkDepartment').selectOption('保全');
   await page.locator('#bulkTemporary').selectOption('yes');await page.locator('#bulkApply').click();await page.locator('#bulkReview').click();
   assert.equal(await page.locator('#bulkConfirm').evaluate(e=>e.open),false);
   await page.locator('#bulkUntil').fill('2026-11-01');await page.locator('#bulkPeriodChecked').check();await page.locator('#bulkApply').click();
   await page.locator('#bulkReview').click();assert.equal(await page.locator('#bulkConfirm').evaluate(e=>e.open),true);assert.equal(await page.locator('#bulkConfirmList li').count(),2);
   await page.locator('#bulkConfirmCancel').click();assert.equal(await page.evaluate(()=>window.__writes.length),0);
   // No hidden selection after filtering; entered checks stay intact.
   await page.locator('#bulkSearch').fill('工程変更');assert.equal(await page.locator('#bulkSelected').textContent(),'0件選択');assert.equal(await page.locator('#bulkRows tr').count(),1);
   await page.locator('#bulkSearch').fill('');await page.locator('#bulkSelectAll').check();
   assert(await page.locator('[data-bulk-id="a"] [data-bulk-field="safety"]').isChecked());
   for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:1000});
    assert(await page.locator('#bulkUnplannedScreen').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    await page.screenshot({path:path.resolve('outputs/bulk-unplanned/'+engine+'-'+width+'.png'),fullPage:true});
   }
   await page.locator('#bulkReview').click();
   await page.evaluate(()=>{window.__fail=['b'];window.__hold=true;document.getElementById('bulkConfirmCommit').onclick();document.getElementById('bulkConfirmCommit').onclick()});
   assert(await page.locator('#bulkConfirmCommit').isDisabled());assert(await page.locator('#bulkConfirmCancel').isDisabled());assert(await page.locator('#bulkUnplannedScreen').evaluate(e=>e.inert));
   await page.evaluate(()=>{window.__hold=false;window.__release()});await page.waitForFunction(()=>!document.getElementById('bulkConfirm').open);
   assert.equal(await page.evaluate(()=>window.__writes.length),1);assert.equal(await page.evaluate(()=>window.__records.a.approvalStatus),'draft');assert.equal(await page.evaluate(()=>window.__records.a.workflowComment),'既存の所見');
   assert.equal(await page.evaluate(()=>window.__records.a.postCheckedBy),'対応者テスト');assert.equal(await page.evaluate(()=>window.__records.a.temporaryUntil),'2026-11-01');
   assert.equal(await page.locator('#bulkRows tr').count(),1);assert.equal(await page.locator('#bulkSelected').textContent(),'1件選択');assert((await page.locator('#bulkResult').textContent()).includes('未保存：1件'));
   await page.evaluate(()=>window.__fail=[]);await page.locator('#bulkReview').click();await page.locator('#bulkConfirmCommit').click();await page.waitForFunction(()=>!document.getElementById('bulkConfirm').open);
   assert.equal(await page.evaluate(()=>window.__writes.length),2);assert.equal(await page.evaluate(()=>window.__writes.filter(x=>x.id==='a').length),1);assert.equal(await page.locator('#bulkRows tr').count(),0);
   // Switching roles clears the responder name; no automatic supervisor approval.
   await page.locator('[data-bulk-mode="approve"]').click();assert.equal(await page.locator('#bulkActor').inputValue(),'');assert.equal(await page.locator('#bulkRows tr').count(),2);assert(!(await page.locator('#bulkCommon').isVisible()));
   await page.locator('#bulkSelectAll').check();await page.locator('#bulkReview').click();assert.equal(await page.locator('#bulkConfirm').evaluate(e=>e.open),false);
   await page.locator('#bulkActor').fill('上司テスト');await page.locator('#bulkReview').click();assert.equal(await page.evaluate(()=>window.__writes.length),2);
   // A department change after confirmation blocks only that record.
   await page.evaluate(()=>window.__records.b.responseDepartment='変更後部署');await page.locator('#bulkConfirmCommit').click();await page.waitForFunction(()=>!document.getElementById('bulkConfirm').open);
   assert.equal(await page.evaluate(()=>window.__records.a.approvalStatus),'approved');assert.equal(await page.evaluate(()=>window.__records.a.responseApprovedBy),'上司テスト');assert.equal(await page.evaluate(()=>window.__records.b.approvalStatus),'draft');assert.equal(await page.evaluate(()=>window.__writes.length),3);
   assert.equal(await page.locator('#bulkActor').inputValue(),'');assert((await page.locator('#bulkResult').textContent()).includes('未保存：1件'));
   assert.equal(await page.evaluate(()=>window.__records.c.switchStatus),'canceled');assert.equal(await page.evaluate(()=>window.__records.d.type),'planned');
   // A concurrent comment/date edit, stage change, or deletion cannot be overwritten.
   const ready=item('conflict',{responseDepartment:'保全',temporaryChange:false,checklistItems:['safety','products','workability'].map(key=>({key:'post_'+key,receiverResult:'ok'}))});
   for(const patch of [{workflowComment:'他者の所見'},{occurrenceDate:'2026-11-02'},{postCheckRevision:1},{switchStatus:'canceled'},null]){
    await page.evaluate(items=>window.__load(items),[ready]);await page.locator('#bulkSelectAll').check();await page.locator('#bulkActor').fill('対応者');await page.locator('#bulkReview').click();
    const before=await page.evaluate(()=>window.__writes.length);await page.evaluate(p=>{if(p)Object.assign(window.__records.conflict,p);else delete window.__records.conflict},patch);
    await page.locator('#bulkConfirmCommit').click();await page.waitForFunction(()=>!document.getElementById('bulkConfirm').open);assert.equal(await page.evaluate(()=>window.__writes.length),before);assert((await page.locator('#bulkResult').textContent()).includes('未保存：1件'));
   }
   // Large lists are paged; selecting more than 50 is rejected.
   await page.evaluate(items=>window.__load(items),Array.from({length:51},(_,i)=>item('many'+i)));
   assert.equal(await page.locator('#bulkRows tr').count(),50);await page.locator('#bulkMore').click();assert.equal(await page.locator('#bulkRows tr').count(),51);await page.locator('#bulkSelectAll').click();assert.equal(await page.locator('#bulkSelected').textContent(),'0件選択');
   assert.deepEqual(errors,[]);console.log('PASS '+engine+': bulk checks/temporary deadline/category/department/name gates, selection/filtering, confirmation/cancel, preserved comments, partial failures/retry, double taps, fresh approver name, conflicts, closed/planned exclusion, pagination, escaped content, responsive. Offline only.');
  }finally{await browser.close()}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});

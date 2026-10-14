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
const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module">${mock}${source}\nawait initApp();document.getElementById('authGate').style.display='none';window.__show=item=>{window.__records[item._id]=structuredClone(item);showDetail(item)};window.__ready=true;</script>`);
const planned=(status='sender_approved')=>({_id:'fixture',type:'planned',workflowManaged:true,approvalStatus:status,planneddepartment:'品質',department:'製造',lineName:'94-300',serialNo:'7106',content:'溶接条件変更後の確認',createdBy:'作成者',senderApprovedBy:'発信上司',checklistItems:[{key:'a',label:'安全面に問題はないか',receiverResult:'ok'}],actualSwitchDate:'2026-10-13',actualSwitchTime:'09:15',evidenceAttachments:[]});
async function main(){
 fs.mkdirSync('outputs/approval-screen',{recursive:true});
 for(const engine of ['chromium','webkit']){
  const b=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{
   const page=await b.newPage({viewport:{width:1280,height:900}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto('http://127.0.0.1/approval-test');await page.waitForFunction(()=>window.__ready);
   const show=async item=>page.evaluate(item=>window.__show(item),item);
   const count=()=>page.evaluate(()=>window.__writes.length);
   const open=async()=>{await page.getByRole('button',{name:'承認者用画面を開く',exact:true}).click();assert.equal(await page.locator('#stampApproverName').inputValue(),'')};
   const review=async(name='承認者テスト')=>{await page.locator('#stampApproverName').fill(name);await page.locator('#stampApprovalReview').click()};
   const commit=async()=>{await page.locator('#stampApprovalCommit').click();await page.waitForFunction(()=>!document.getElementById('stampApprovalDialog').open)};
   await show(planned());await page.locator('#receiverStampButton').click();
   await page.waitForFunction(()=>window.__records.fixture.approvalStatus==='receiver_confirmed');
   assert.equal(await count(),1);assert.equal(await page.locator('#workflowStampName,#receiverStampButton').count(),0);assert.equal(await page.locator('#stampApprovalDialog').evaluate(e=>e.open),false);
   assert((await page.locator('.approval-entry').textContent()).includes('対応者の操作は完了'));
   await page.evaluate(()=>window.commitStampApproval());assert.equal(await count(),1);
   await open();assert.equal(await count(),1);await page.locator('#stampApprovalReview').click();assert((await page.locator('#stampApprovalError').textContent()).includes('氏名'));
   await review();assert.equal(await count(),1);
   for(const width of [320,390,1280]){await page.setViewportSize({width,height:850});assert(await page.locator('#stampApprovalDialog').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:path.resolve(`outputs/approval-screen/confirm-${engine}-${width}.png`)});}
   await page.getByRole('button',{name:'戻る',exact:true}).click();assert.equal(await page.locator('#stampApproverName').inputValue(),'承認者テスト');await review();await commit();
   assert.equal(await count(),2);assert.equal(await page.evaluate(()=>window.__records.fixture.receiverApprovedBy),'承認者テスト');assert.equal(await page.evaluate(()=>window.__records.fixture.receiverConfirmedBy),'対応者テスト');
   assert.equal(await page.evaluate(()=>localStorage.getItem('changepointActorName')),'対応者テスト');
   // Approval stays independent of checklist, quality judgment and legacy business gates.
   for(const status of ['draft','receiver_confirmed']){
    await show({...planned(status),qualityEvaluationRequired:true,qualityEvaluationVerdict:'fail',checklistItems:[{key:'a',receiverResult:'ng'}],relatedReviewCompleted:false});
    await open();await review();await commit();assert.equal(await page.evaluate(()=>window.__records.fixture.approvalStatus),status==='draft'?'sender_approved':'approved');
   }
   await show(planned('receiver_confirmed'));await open();await review();const n=await count();
   await page.getByRole('button',{name:'キャンセル',exact:true}).filter({visible:true}).click();assert.equal(await count(),n);await open();assert.equal(await page.locator('#stampApproverName').inputValue(),'');await review();
   await page.evaluate(()=>window.__records.fixture.approvalStatus='approved');await page.locator('#stampApprovalCommit').click();await page.waitForFunction(()=>document.getElementById('stampApprovalError').textContent.includes('変更'));assert.equal(await count(),n);await page.evaluate(()=>window.closeStampApproval());
   for(const patch of [{switchStatus:'canceled'},{content:'other content'},{department:'other department'}]){
    await show(planned('receiver_confirmed'));await open();await review();await page.evaluate(p=>Object.assign(window.__records.fixture,p),patch);await page.locator('#stampApprovalCommit').click();await page.waitForFunction(()=>document.getElementById('stampApprovalError').textContent.includes('変更'));assert.equal(await count(),n);await page.evaluate(()=>window.closeStampApproval());
   }
   await show(planned('receiver_confirmed'));await open();await review();await page.evaluate(()=>window.__fail=true);await page.locator('#stampApprovalCommit').click();await page.waitForFunction(()=>document.getElementById('stampApprovalError').textContent.includes('offline'));assert.equal(await count(),n);await page.evaluate(()=>window.__fail=false);
   await page.evaluate(()=>{window.__hold=true;window.commitStampApproval();window.commitStampApproval()});assert(await page.locator('#stampApprovalCommit').isDisabled());assert.equal(await page.evaluate(()=>window.closeStampApproval()),false);await page.evaluate(()=>{window.__hold=false;window.__release()});await page.waitForFunction(()=>!document.getElementById('stampApprovalDialog').open);assert.equal(await count(),n+1);
   await show({...planned(),checklistItems:[{key:'a',label:'安全面',receiverResult:''}]});assert(await page.locator('#receiverStampButton').isDisabled());
   await show({...planned(),actualSwitchDate:''});assert(await page.locator('#receiverStampButton').isDisabled());
   const unplanned={...planned('post_check'),type:'sudden',workflowKind:'unplanned_response_v2',category:'設備',responseDepartment:'保全',temporaryChange:false,checklistItems:['safety','products','workability'].map(x=>({key:'post_'+x,receiverResult:'ok'}))};
   await show(unplanned);await page.getByRole('button',{name:'確認完了・承認依頼',exact:true}).click();await page.waitForFunction(()=>window.__records.fixture.approvalStatus==='draft');assert.equal(await page.locator('#postActor').count(),0);await open();await review('保全上司');await commit();assert.equal(await page.evaluate(()=>window.__records.fixture.responseApprovedBy),'保全上司');
   await show({...planned('receiver_confirmed'),receiverConfirmedBy:'対応者テスト'});await page.setViewportSize({width:390,height:850});await page.locator('.approval-entry').scrollIntoViewIfNeeded();await page.screenshot({path:path.resolve(`outputs/approval-screen/waiting-${engine}.png`)});
   assert.deepEqual(errors,[]);console.log(`PASS ${engine}: responder handoff, isolated approval, empty name, two-step confirmation, cancellation, stale data, concurrent taps, retry, unconditional approval, unplanned, mobile. Offline only.`);
  }finally{await b.close()}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});

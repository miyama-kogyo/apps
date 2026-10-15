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
const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module">${mock}${source}\nawait initApp();document.getElementById('authGate').style.display='none';window.__show=item=>{window.__records[item._id]=structuredClone(item);showDetail(item)};window.__snapshot=items=>{changepointData=items;refreshQuickApprovalFromSnapshot()};window.__linked=items=>{changepointData=items;linkedChangepointOpened=false;openLinkedChangepointIfReady()};window.__ticket=item=>renderChangeTicket(item,'原本','品質');window.__rerender=()=>renderApprovalWorkflow(currentDetailItem);window.__ready=true;</script>`);
const planned=(status='sender_approved')=>({_id:'fixture',type:'planned',workflowManaged:true,approvalStatus:status,planneddepartment:'品質',department:'製造',lineName:'94-300',serialNo:'7106',content:'溶接条件変更後の確認',createdBy:'作成者',senderApprovedBy:'発信上司',checklistItems:[{key:'a',label:'安全面に問題はないか',receiverResult:'ok'}],actualSwitchDate:'2026-10-13',actualSwitchTime:'09:15',evidenceAttachments:[]});
async function main(){
 fs.mkdirSync('outputs/switch-default',{recursive:true});
 for(const engine of ['chromium','webkit']){
  const b=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{
   const page=await b.newPage({viewport:{width:390,height:850},timezoneId:'America/Los_Angeles'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
   await page.clock.setFixedTime(new Date('2026-10-15T15:05:59Z'));
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));
   await page.goto('http://127.0.0.1/default-test?changepointId=fixture');await page.waitForFunction(()=>window.__ready);
   const record={...planned(),actualSwitchDate:'',actualSwitchTime:''};
   const show=x=>page.evaluate(x=>window.__show(x),x);
   await show(record);
   assert.equal(await page.locator('#actualSwitchDate').inputValue(),'2026-10-16');
   assert.equal(await page.locator('#actualSwitchTime').inputValue(),'00:05');
   assert.equal(await page.evaluate(()=>window.__writes.length),0);
   assert.equal(await page.evaluate(()=>window.__records.fixture.actualSwitchDate),'');
   await page.clock.setFixedTime(new Date('2026-10-16T01:20:00Z'));
   await page.evaluate(()=>window.__rerender());
   assert.equal(await page.locator('#actualSwitchTime').inputValue(),'00:05');
   await show(record);assert.equal(await page.locator('#actualSwitchTime').inputValue(),'10:20');
   await page.locator('#actualSwitchDate').fill('2026-10-14');await page.locator('#actualSwitchTime').fill('08:32');
   await page.evaluate(()=>window.__rerender());
   assert.equal(await page.locator('#actualSwitchDate').inputValue(),'2026-10-14');
   assert.equal(await page.locator('#actualSwitchTime').inputValue(),'08:32');
   await page.locator('#actualSwitchTime').fill('');await page.evaluate(()=>window.__rerender());
   assert.equal(await page.locator('#actualSwitchTime').inputValue(),'');assert(await page.locator('#receiverStampButton').isDisabled());
   await page.locator('#actualSwitchTime').fill('08:32');
   await page.locator('#receiverStampButton').click();await page.waitForFunction(()=>window.__records.fixture.approvalStatus==='receiver_confirmed');
   assert.equal(await page.evaluate(()=>window.__records.fixture.actualSwitchTime),'08:32');
   assert.equal(await page.evaluate(()=>window.__records.fixture.actualSwitchDate),'2026-10-14');
   await show({...record,actualSwitchDate:'2026-10-13',actualSwitchTime:'11:45'});
   assert.equal(await page.locator('#actualSwitchDate').inputValue(),'2026-10-13');
   assert.equal(await page.locator('#actualSwitchTime').inputValue(),'11:45');
   await show({...record,_id:'fresh'});await page.evaluate(()=>history.replaceState(null,'','?changepointId=fresh'));await show({...record,_id:'fresh'});
   for(const width of [390,1280]){
    await page.setViewportSize({width,height:850});
    await page.locator('#actualSwitchDate').scrollIntoViewIfNeeded();
    assert(await page.locator('.actual-switch-fields').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    await page.screenshot({path:path.resolve('outputs/switch-default/'+engine+'-'+width+'.png')});
   }
   await show({...record,_id:'fresh',type:'sudden'});assert(!(await page.locator('#actualSwitchDate').isVisible()));
   assert.deepEqual(errors,[]);console.log('PASS '+engine+': JST current default, midnight, no background writes, stable rerender, reopen, saved values, manual edits/clear, stamping, unplanned exclusion and responsive.');
  }finally{await b.close()}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});

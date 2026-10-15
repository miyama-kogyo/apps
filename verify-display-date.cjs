const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=fs.readFileSync(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':'changepoint.html','utf8');
const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'');
const mock=`const Chart=class{destroy(){}};const initializeApp=()=>({}),getFirestore=()=>({}),getStorage=()=>({}),getAuth=()=>({currentUser:{uid:'test'}}),setPersistence=async()=>{},browserLocalPersistence={},onAuthStateChanged=()=>{},signInAnonymously=async()=>{};
const collection=(_, ...p)=>p.join('/'),doc=(_, ...p)=>p.join('/'),query=x=>x,orderBy=()=>{},onSnapshot=()=>{},serverTimestamp=()=>new Date();
const getDocs=async()=>({docs:[]}),getDoc=async()=>({exists:()=>false}),ref=()=>{},uploadBytesResumable=()=>{},getDownloadURL=()=>{};
const addDoc=async()=>{throw Error('unexpected create')},deleteDoc=async()=>{throw Error('unexpected delete')},updateDoc=async()=>{throw Error('unexpected nontransaction write')};
window.__records={};window.__writes=[];window.__fail=false;
const runTransaction=async(_,fn)=>{if(window.__hold)await new Promise(r=>window.__release=r);if(window.__fail)throw Error('offline test failure');return fn({get:async ref=>{const data=window.__records[ref.split('/').pop()];return {exists:()=>!!data,data:()=>structuredClone(data)}},update:(ref,p)=>{Object.assign(window.__records[ref.split('/').pop()],p);window.__writes.push(p)}})};
localStorage.setItem('changepointActorName','対応者テスト');`;
const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module">${mock}${source}\nawait initApp();document.getElementById('authGate').style.display='none';window.__show=item=>{window.__records[item._id]=structuredClone(item);showDetail(item)};window.__snapshot=items=>{changepointData=items;refreshQuickApprovalFromSnapshot()};window.__linked=items=>{changepointData=items;linkedChangepointOpened=false;openLinkedChangepointIfReady()};window.__ticket=item=>renderChangeTicket(item,'原本','品質');window.__dates={hasActualDisplayDate,changeDisplayDate,changeDisplayTime};window.__setData=items=>{showScreen('menu');changepointData=items;anomalyData=[];calendarYear=2026;calendarMonth=9;buildTopicsDeptOptions();updateTopics();renderCalendar();renderPlannedHistory()};window.__month=(y,m)=>{calendarYear=y;calendarMonth=m;renderCalendar()};window.__ready=true;</script>`);
const planned=(status='sender_approved')=>({_id:'fixture',type:'planned',workflowManaged:true,approvalStatus:status,planneddepartment:'品質',department:'製造',lineName:'94-300',serialNo:'7106',content:'溶接条件変更後の確認',createdBy:'作成者',senderApprovedBy:'発信上司',checklistItems:[{key:'a',label:'安全面に問題はないか',receiverResult:'ok'}],actualSwitchDate:'2026-10-13',actualSwitchTime:'09:15',evidenceAttachments:[]});
async function main(){
 fs.mkdirSync('outputs/display-date',{recursive:true});
 for(const engine of ['chromium','webkit']){
  const b=await(engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{
   const page=await b.newPage({viewport:{width:1280,height:900},timezoneId:'Asia/Tokyo'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.clock.setFixedTime(new Date('2026-10-15T01:00:00Z'));
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));
   await page.goto('http://127.0.0.1/date-test');await page.waitForFunction(()=>window.__ready);
   const base={...planned('receiver_confirmed'),category:'設備',department:'製造',actualSwitchTime:'09:30'};
   const items=[
    {...base,_id:'moved',occurrenceDate:'2026-09-30',actualSwitchDate:'2026-10-15',content:'対応日へ移動'},
    {...base,_id:'early',occurrenceDate:'2026-10-20',actualSwitchDate:'2026-10-14',content:'前倒し対応'},
    {...base,_id:'pending',approvalStatus:'sender_approved',occurrenceDate:'2026-10-15',actualSwitchDate:'',actualSwitchTime:'',content:'未対応'},
    {...base,_id:'done',approvalStatus:'approved',switchStatus:'completed',occurrenceDate:'2026-10-16',actualSwitchDate:'2026-10-15',receiverApprovedAt:'2026-10-18T01:00:00Z',content:'対応日と承認日が異なる'},
    {...base,_id:'undecided',occurrenceDate:null,actualSwitchDate:'2026-10-15',content:'予定日未定から対応'},
    {...base,_id:'sudden',type:'sudden',occurrenceDate:'2026-10-14',actualSwitchDate:'2026-10-15',qualityCheckedAt:'2026-10-17T01:00:00Z',content:'計画外'},
    {...base,_id:'future',approvalStatus:'draft',occurrenceDate:'2026-10-20',actualSwitchDate:'',content:'未来予定'}
   ];
   const original=JSON.stringify(items);
   await page.evaluate(items=>window.__setData(items),items);
   const event=(date,id)=>page.locator('[data-date="'+date+'"] .calendar-event[data-id="'+id+'"]');
   assert.equal(await event('2026-10-15','moved').count(),1);assert.equal(await event('2026-10-14','early').count(),1);
   assert.equal(await event('2026-10-20','early').count(),0);assert.equal(await event('2026-10-15','pending').count(),1);
   assert.equal(await page.locator('#topicsToday [data-change-id="moved"]').count(),1);
   assert.equal(await page.locator('#topicsToday [data-change-id="done"]').count(),1);
   assert.equal(await page.locator('#boardFuture [data-change-id="early"]').count(),0);
   assert.equal(await page.locator('#boardCarry [data-change-id="early"]').count(),1);
   assert.equal(await page.locator('#topicsUndecided [data-change-id="undecided"]').count(),0);
   assert.equal(await page.locator('#topicsToday [data-change-id="sudden"]').count(),0);
   assert.equal(await page.locator('#boardFuture [data-change-id="future"]').count(),1);
   await page.evaluate(()=>window.__month(2026,8));assert.equal(await event('2026-09-30','moved').count(),0);
   await page.evaluate(()=>window.__month(2026,9));
   const moved=items[0];
   const ticket=await page.evaluate(x=>window.__ticket(x),moved);
   assert(ticket.includes('<b>対応日</b>2026-10-15'));assert(!ticket.includes('<b>対応日</b>2026-09-30'));
   for(const bad of ['', '2026-02-30','bad']){
    const date=await page.evaluate(x=>window.__dates.changeDisplayDate(x),{...moved,actualSwitchDate:bad});
    assert.equal(date,'2026-09-30');
   }
   await page.locator('.menu-card[data-screen="timeline"]').click();
   await page.locator('#filterType').selectOption('planned');
   await page.locator('#filterDateFrom').fill('2026-10-15');await page.locator('#filterDateTo').fill('2026-10-15');
   await page.locator('#btnSearch').click();
   assert((await page.locator('#timelineView').textContent()).includes('対応日へ移動'));
   assert(!(await page.locator('#timelineView').textContent()).includes('前倒し対応'));
   await page.locator('#filterDateFrom').fill('2026-09-30');await page.locator('#filterDateTo').fill('2026-09-30');await page.locator('#btnSearch').click();
   assert(await page.locator('#timelineEmpty').isVisible());
   await page.evaluate(x=>window.__show(x),moved);
   assert((await page.locator('#detailDate').textContent()).includes('2026-10-15'));
   assert((await page.locator('#detailBody').textContent()).includes('2026-09-30'));
   await page.locator('#detailClose').click();
   await page.locator('#timelineScreen [data-back]').click();
   await page.locator('.menu-card[data-screen="calendar"]').click();
   for(const width of [390,1280]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.resolve('outputs/display-date/'+engine+'-'+width+'.png')});}
   assert.equal(await page.evaluate(()=>window.__writes.length),0);assert.equal(JSON.stringify(items),original);
   assert.deepEqual(errors,[]);console.log('PASS '+engine+': actual-date calendar/board/history/filter/print/detail, cross-month/early/late/undated, pending fallback, sudden unchanged, no writes.');
  }finally{await b.close()}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});

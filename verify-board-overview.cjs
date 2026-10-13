const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=fs.readFileSync(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':'changepoint.html','utf8');
const moduleSource=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'');
const mock=`const initializeApp=()=>({}),getFirestore=()=>({}),getStorage=()=>({}),getAuth=()=>({currentUser:{uid:'test'}}),setPersistence=async()=>{},browserLocalPersistence={},onAuthStateChanged=()=>{},signInAnonymously=async()=>{};
 const collection=(_, ...p)=>p.join('/'),doc=(_, ...p)=>p.join('/'),query=x=>x,orderBy=()=>{},onSnapshot=()=>{},serverTimestamp=()=>new Date(),getDocs=async()=>({docs:[]});
 const addDoc=async()=>{throw Error('Unexpected write')},updateDoc=addDoc,deleteDoc=addDoc,runTransaction=addDoc;
 const getDoc=async()=>({exists:()=>false}),ref=()=>{},uploadBytesResumable=()=>{},getDownloadURL=()=>{};
 localStorage.setItem('changepointActorName','テスト担当者');`;
const setup=`await initApp();document.getElementById('authGate').style.display='none';
 const date=offset=>{const d=new Date();d.setDate(d.getDate()+offset);return ymdLocal(d);};
 const base={type:'planned',workflowManaged:true,approvalStatus:'sender_approved',department:'製造1課',planneddepartment:'品質',category:'設備',lineName:'94-300',serialNo:'7106',content:'センサー交換後の初品・寸法確認',occurrenceDate:date(0),checklistItems:[{key:'safe',label:'安全面の確認',criteria:'危険箇所がないこと'}]};
 const records=[...Array.from({length:24},(_,i)=>({...base,_id:'today-'+i,lineName:i===23?'長いライン名称ABCDEFGHIJKLMN0123456789':i%2?'組立B':'94-300',serialNo:i===23?'123456789012345678901234567890':String(7106+i),category:['設備','人','材料','方法','金型'][i%5],type:i%3?'planned':'sudden',department:i%2?'製造2課':'製造1課'})),
 ...Array.from({length:18},(_,i)=>({...base,_id:'carry-'+i,occurrenceDate:date(-8-i),approvalStatus:'receiver_confirmed'})),
 {...base,_id:'future',occurrenceDate:date(15)}, {...base,_id:'undated',occurrenceDate:''},
 {...base,_id:'done',occurrenceDate:date(-12),approvalStatus:'approved'}, {...base,_id:'canceled',switchStatus:'canceled'}];
 window.__setRecords=items=>{changepointData=items;window.changepointData=items;buildTopicsDeptOptions();updateTopics();};
 window.__records=records;window.__setRecords(records);setupTopicsDeptFilter();showScreen('menu');window.__ready=true;`;
const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module">${mock}${moduleSource}\n${setup}</script>`);
const out=path.resolve('outputs/board-compact');fs.mkdirSync(out,{recursive:true});
async function main(){
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{
   const page=await browser.newPage({timezoneId:'Asia/Tokyo'}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto('http://127.0.0.1/board-fixture');await page.waitForFunction(()=>window.__ready);
   assert.equal(await page.locator('#boardTodayCount').textContent(),'24件');assert.equal(await page.locator('#boardCarryCount').textContent(),'18件');
   assert.equal(await page.locator('.board-overview,.board-panel-scroll').count(),0);
   assert.equal(await page.locator('#topicsToday .ticket').count(),24);
   for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1024,600],[768,1024],[390,844],[320,568],[844,390]]){
    await page.setViewportSize({width,height});
    await page.evaluate(()=>scrollTo(0,0));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`horizontal overflow ${width}x${height}`);
    assert(await page.locator('#topicsToday .ticket table').evaluateAll(tables=>tables.every(el=>getComputedStyle(el).display==='none')));
    const card=page.locator('#topicsToday .ticket').first();
    const size=await card.boundingBox();assert(size.height<410,JSON.stringify({width,height,size}));
    assert(await card.locator('.content').isVisible());assert(await card.locator('.sign').isVisible());
    if(width>700){
     const boxes=await page.locator('[data-board-panel]').evaluateAll(panels=>panels.map(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));
     assert(boxes[1].top>=boxes[0].bottom && boxes[2].top>=boxes[1].bottom,'vertical sections restored');
    }
    if(width===1366){const tops=await page.locator('#topicsToday .board-lane').first().locator('.ticket').evaluateAll(cards=>cards.slice(0,3).map(c=>c.getBoundingClientRect().top));assert.equal(new Set(tops).size,1,'three compact cards per row');}
    await page.screenshot({path:path.join(out,`${engine}-${width}x${height}.png`)});
   }
   await page.setViewportSize({width:390,height:844});
   await page.locator('#topicsToday [data-change-id="today-0"]').click();await page.locator('#detailModal.active').waitFor();assert((await page.locator('#detailBody').textContent()).includes('7106'));assert(await page.locator('#post_safety').isVisible());await page.locator('#detailClose').click();
   await page.locator('button[data-board-view="week"]').click();assert(await page.locator('#boardWeekPanel').isVisible());assert(!(await page.locator('#boardTodayPanel').isVisible()));
   await page.locator('button[data-board-view="carry"]').click();assert(await page.locator('#boardCarryPanel').isVisible());
   await page.locator('[data-board-more="boardCarry"]').scrollIntoViewIfNeeded();await page.locator('[data-board-more="boardCarry"]').click();assert.equal(await page.locator('#boardCarry .board-change').count(),18);
   await page.locator('button[data-board-view="today"]').click();
   await page.locator('#boardFilterToggle').click();await page.locator('#topicsDeptFilter').selectOption('製造2課');assert.equal(await page.locator('#boardTodayCount').textContent(),'12件');
   await page.locator('#boardSearch').fill('not-found-xyz');assert.equal(await page.locator('#boardTodayCount').textContent(),'0件');await page.locator('#boardReset').click();
   await page.locator('#boardFilterToggle').click();assert.equal(await page.locator('#boardFilterToggle').getAttribute('aria-expanded'),'false');
   await page.locator('.board-details summary').filter({hasText:'日程未確定'}).click();await page.locator('#topicsUndecided [data-change-id="undated"]').click();await page.locator('#detailModal.active').waitFor();await page.locator('#detailClose').click();
   await page.locator('.board-details summary').filter({hasText:'日程未確定'}).click();
   await page.locator('[data-screen="planned"]').click();assert(await page.locator('#plannedScreen').isVisible());await page.locator('#plannedScreen [data-back]').click();assert(await page.locator('#mainMenu').isVisible());
   await page.evaluate(()=>window.__setRecords([]));assert.equal(await page.locator('#boardTodayCount').textContent(),'0件');assert(await page.locator('#topicsToday .board-empty').isVisible());
   assert.deepEqual(errors,[]);console.log(`PASS ${engine}: previous vertical board and mobile tabs, compact cards without visible checklist, details retain checks, 8 viewport sizes, more, filters, navigation and empty state; no database writes.`);
  }finally{await browser.close();}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});

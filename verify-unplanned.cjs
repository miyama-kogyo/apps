const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,fs.existsSync(path.join(__dirname,'変化点管理システム.html'))?'変化点管理システム.html':'changepoint.html'),'utf8');
const slice=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j)};
const core=slice('    function isUnplannedPostcheck','    const APPROVAL_STAGES');
const guards=slice('    function boardCompleted','    function buildTopicsDeptOptions');
const validate=slice('    function validateActualSwitch','    async function saveReceiverStamp');
const escaping=slice('    function escapeHtml','    function csvEscape');
const stamps=slice('    function workflowStampEntries','    function readStampName');
const related=slice('    function relatedAnomalyHtml','    function showDetail');
const categories=['人','設備','材料','方法','金型'];
const record=()=>({_id:'fixture',type:'sudden',workflowManaged:true,workflowKind:'unplanned_postcheck_v1',approvalStatus:'post_check',postCheckRevision:0,planneddepartment:'品質',department:'製造',category:'',createdBy:'作成者',createdAt:'2026-10-12T09:00:00+09:00',evidenceAttachments:[{id:'preserve'}]});
const data=()=>({category:'設備',planneddepartment:'品質',actualSwitchDate:'2026-10-12',actualSwitchTime:'09:15',temporaryChange:false,temporaryUntil:'',workflowComment:'確認結果',checklistItems:['safety','products','workability'].map(x=>({key:'post_'+x,receiverResult:'ok'}))});
async function unit(){
 const ctx={Date,Map,Set,URL,window:{},console,CHANGE_CATEGORIES:categories,db:{},doc:(_,c,id)=>({c,id}),serverTimestamp:()=> 'SERVER',latest:record(),writes:[]};
 ctx.runTransaction=async(_,fn)=>fn({get:async()=>({exists:()=>!!ctx.latest,data:()=>ctx.latest}),update:(ref,patch)=>{ctx.writes.push(patch);ctx.latest={...ctx.latest,...patch}}});
 vm.createContext(ctx);vm.runInContext(core+guards+validate+escaping+stamps+related,ctx);
 new vm.SourceTextModule(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
 assert.equal(ctx.unplannedChecklist({}).length,4);
 assert.equal(ctx.unplannedChecklist(data())[3].receiverResult,'na');
 for(const change of [{category:''},{planneddepartment:''},{actualSwitchTime:''},{temporaryChange:null},{temporaryChange:true},{temporaryChange:true,temporaryUntil:'2026-02-30'}, {temporaryChange:true,temporaryUntil:'2026-10-11'}, {checklistItems:[]}, {checklistItems:[{key:'post_safety',receiverResult:'na'}]}]) assert.throws(()=>ctx.validateUnplannedCheck({...data(),...change}));
 const temporary={...data(),temporaryChange:true,temporaryUntil:'2026-10-20',checklistItems:[...data().checklistItems,{key:'post_temporary',receiverResult:'ok'}]};
 ctx.validateUnplannedCheck(temporary);
 await ctx.saveUnplannedRecord('fixture',0,{...data(),category:''},'担当者',false);
 assert.equal(ctx.latest.approvalStatus,'post_check');assert(!ctx.latest.approvalRequestedAt);
 await assert.rejects(ctx.saveUnplannedRecord('fixture',0,data(),'担当者',true));
 const saved=await ctx.saveUnplannedRecord('fixture',1,temporary,'担当者',true);
 assert.equal(saved.approvalStatus,'draft');assert.equal(ctx.latest.approvalRequestedAt,'SERVER');assert.equal(ctx.latest.postCheckedBy,'担当者');assert.equal(ctx.latest.evidenceAttachments[0].id,'preserve');
 await assert.rejects(ctx.saveUnplannedRecord('fixture',2,data(),'担当者',false));
 await assert.rejects(ctx.approveUnplannedRecord('fixture',1,'上司'));
 await ctx.approveUnplannedRecord('fixture',2,'上司');assert.equal(ctx.latest.approvalStatus,'approved');assert.equal(ctx.latest.senderApprovedBy,'上司');assert.equal(ctx.latest.receiverApprovedBy,undefined);
 await assert.rejects(ctx.approveUnplannedRecord('fixture',2,'上司'));
 for(const change of [null,{type:'planned'},{approvalStatus:'draft'},{switchStatus:'canceled'},{switchStatus:'completed'}]){ctx.latest=change===null?null:{...record(),...change};await assert.rejects(ctx.saveUnplannedRecord('fixture',0,data(),'担当者',true));}
 assert.equal(ctx.workflowStampEntries(record()).length,3);assert.equal(ctx.workflowStampEntries({type:'planned'}).length,4);
 const rendered=ctx.relatedAnomalyHtml({anomalyContent:'<script>bad</script>',actionTaken:'交換',rootCauseAction:'再調整',mfgPhotoUrls:['https://example.com/photo.png','javascript:alert(1)'],techPhotoUrls:['https://example.com/photo.png']});
 assert(!rendered.includes('<script>'));assert(!rendered.includes('javascript:'));assert.equal((rendered.match(/<img /g)||[]).length,1);assert(rendered.includes('交換'));
 console.log('PASS unplanned: four checks, 5M, dates, temporary deadline, NG, draft, atomic submission/approval, concurrency, closed/canceled/planned guards, stamps, related anomaly escaping/photos. No live writes.');
}
async function browser(){
 const {chromium,webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
 const script=`const CHANGE_CATEGORIES=${JSON.stringify(categories)},masterDepartments=['品質','製造'];let currentDetailItem=${JSON.stringify(record())};const db={},doc=(_,c,id)=>({c,id}),serverTimestamp=()=>new Date();let latest=currentDetailItem;
 const runTransaction=async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>latest}),update:(_,p)=>{latest={...latest,...p}}});
 const getActorName=()=> '担当者';const isQrWorkflow=()=>true;const approvalStatusOf=i=>i.approvalStatus;
 const renderApprovalWorkflow=i=>renderUnplannedWorkflow(i,document.getElementById('approvalWorkflow'));const showDetail=renderApprovalWorkflow;
 ${escaping}${validate}${guards}${stamps}${core}${related}
 let missing=false,fail=false;const getDoc=async()=>{if(fail)throw Error('fixture failure');return {exists:()=>!missing,data:()=>({anomalyContent:'異常内容のテスト',actionTaken:'部品交換',rootCauseAction:'再確認'})}};
 renderApprovalWorkflow(currentDetailItem);`;
 const fixture=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div class="modal active qr-workflow" id="detailModal"><div class="modal-content"><div class="modal-header"><h3>チェック・承認</h3></div><div id="detailBody" class="modal-body"><h4>関連する異常内容</h4><div id="relatedAnomalyHost"></div></div><div id="approvalWorkflow"></div></div></div><script>${script}</script></html>`;
 const out=path.join(__dirname,'outputs','unplanned-test');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'index.html'),fixture);
 for(const engine of ['chromium','webkit']){
  const b=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{const page=await b.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto('http://127.0.0.1/fixture');
   for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('#postCategory').count(),1);const overflow=await page.locator('#unplannedCheckForm').evaluate(el=>[el,...el.querySelectorAll('input,select,textarea')].filter(x=>x.getBoundingClientRect().width && x.getBoundingClientRect().right>innerWidth+1).map(x=>x.id));assert.deepEqual(overflow,[]);await page.screenshot({path:path.join(out,`${engine}-${width}.png`)});}
   await page.setViewportSize({width:390,height:900});
   await page.locator('#postCategory').selectOption('設備');await page.locator('#postDate').fill('2026-10-12');await page.locator('#postTime').fill('09:15');await page.locator('#postActor').fill('担当者');
   for(const id of ['post_safety','post_products','post_workability'])await page.locator('#'+id).selectOption('ok');
   await page.locator('#postTemporary').selectOption('yes');assert(await page.locator('#postUntil').isVisible());await page.locator('#postUntil').fill('2026-10-20');await page.locator('#post_temporary').selectOption('ok');
   await page.getByRole('button',{name:'一時保存',exact:true}).click();assert.equal(await page.locator('#postUntil').inputValue(),'2026-10-20');
   await page.getByRole('button',{name:'確認完了・承認依頼',exact:true}).click();assert(await page.getByRole('button',{name:'承認して完了する'}).isVisible());assert(await page.locator('#postCategory').isDisabled());
   await page.locator('#postActor').fill('発信部署の上司');await page.getByRole('button',{name:'承認して完了する'}).click();assert.equal(await page.evaluate(()=>latest.approvalStatus),'approved');assert.equal(await page.locator('.workflow-stamp').count(),3);
   await page.evaluate(()=>renderRelatedAnomaly(currentDetailItem));assert((await page.locator('#relatedAnomalyHost').textContent()).includes('未設定'));
   await page.evaluate(()=>renderRelatedAnomaly({...currentDetailItem,relatedAnomalyId:'anomaly'}));assert((await page.locator('#relatedAnomalyHost').textContent()).includes('部品交換'));
   await page.evaluate(()=>{missing=true;return renderRelatedAnomaly({...currentDetailItem,relatedAnomalyId:'missing'})});assert((await page.locator('#relatedAnomalyHost').textContent()).includes('見つかりません'));
   await page.evaluate(()=>{fail=true;return renderRelatedAnomaly({...currentDetailItem,relatedAnomalyId:'failure'})});assert(await page.getByRole('button',{name:'再読み込み'}).isVisible());
   assert.deepEqual(errors,[]);console.log(`PASS ${engine}: responsive 320/390/768/1440, temporary date, draft persistence, submit, sole supervisor approval, related/missing/error states`);
  }finally{await b.close();}
 }
}
async function fullApp(){
 const {chromium}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const mock=`const initializeApp=()=>({}),getFirestore=()=>({}),getStorage=()=>({}),getAuth=()=>({currentUser:{uid:'test'}}),setPersistence=async()=>{},browserLocalPersistence={},onAuthStateChanged=()=>{},signInAnonymously=async()=>{};
 const collection=(_, ...p)=>p.join('/'),doc=(_, ...p)=>p.join('/'),query=x=>x,orderBy=()=>{},onSnapshot=()=>{},serverTimestamp=()=>new Date(),getDocs=async p=>({docs:(p.includes('department')?[{name:'品質'},{name:'製造'}]:p.includes('changeChecklist')?[{name:'計画用チェック',category:'設備'}]:[]).map((x,i)=>({id:String(i),data:()=>x}))});
 window.__writes=[];window.__latest=null;const addDoc=async(_,x)=>{window.__writes.push(x);return {id:'new-record'}},updateDoc=async()=>{throw Error('Unexpected write')},deleteDoc=async()=>{throw Error('Unexpected delete')};
 const getDoc=async()=>({exists:()=>true,data:()=>({anomalyContent:'センサーが反応しない',actionTaken:'センサー交換',rootCauseAction:'再調整',occurrenceDate:'2026-10-12'})});
 const runTransaction=async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>window.__latest}),update:(_,p)=>{window.__latest={...window.__latest,...p}}});
 const ref=()=>{},uploadBytesResumable=()=>{},getDownloadURL=()=>{};
 localStorage.setItem('changepointActorName','テスト担当者');`;
 const module=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'');
 const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module">${mock}${module}\nawait initApp();document.getElementById('authGate').style.display='none';showScreen('planned');window.__ticket=renderChangeTicket;window.__ready=true;</script>`);
 const b=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{const p=await b.newPage({viewport:{width:390,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));await p.goto('http://127.0.0.1/full');await p.waitForFunction(()=>window.__ready);
  await p.locator('#planType').selectOption('sudden');assert(await p.locator('#planChecklistPreview').isVisible());assert.equal(await p.locator('#planChecklistPreview .checklist-row').count(),4);assert(!(await p.locator('#planCustomCheckText').isVisible()));
  await p.locator('#planDepartment').selectOption('品質');await p.locator('#planDepartmentOccur').selectOption('製造');await p.locator('#planLineName').fill('94-300');await p.locator('#planProcessName').fill('溶接');await p.locator('#planContent').fill('センサー交換');await p.locator('#planDate').fill('2026-10-12');await p.locator('#btnRegisterPlanned').click();await p.locator('#btnConfirmOk').click();await p.locator('#registrationPrintDialog').waitFor();
  const written=await p.evaluate(()=>window.__writes[0]);assert.equal(written.category,'');assert.equal(written.checklistItems.length,4);assert.equal(written.approvalStatus,'post_check');assert.equal(written.approvalRequestedAt,null);
  await p.evaluate(()=>document.getElementById('registrationPrintDialog').close());
  const legacy={_id:'old',type:'sudden',relatedAnomalyId:'abn',category:'設備',department:'製造',content:'センサー交換',lineName:'94-300',serialNo:'7089',occurrenceDate:'2026-10-12'};
  await p.evaluate(x=>{window.__latest=x;window.showDetail(x)},legacy);await p.getByText('センサーが反応しない',{exact:true}).waitFor();assert(await p.getByRole('button',{name:'事後チェックを開始する'}).isVisible());await p.getByRole('button',{name:'事後チェックを開始する'}).click();await p.locator('#postCategory').waitFor();assert.equal(await p.locator('#postDepartment').inputValue(),'');assert.equal(await p.evaluate(()=>window.__latest.workflowKind),'unplanned_postcheck_v1');
  const ticket=await p.evaluate(()=>window.__ticket(window.__latest,'原本','発信部署'));assert(ticket.includes('安全面に問題が無いか'));assert(!ticket.includes('関係部署確認'));assert(!ticket.includes('発生部署 承認者'));
  await p.screenshot({path:path.join(__dirname,'outputs/unplanned-test/related-anomaly-mobile.png')});
  await p.evaluate(()=>window.showDetail({_id:'planned',type:'planned',workflowManaged:true,category:'設備',approvalStatus:'draft',checklistItems:[],department:'製造',planneddepartment:'品質'}));assert.equal(await p.locator('.workflow-stamp').count(),4);assert(await p.getByRole('button',{name:'承認スタンプを押す',exact:true}).isVisible());assert.equal(await p.locator('#relatedAnomalyHost').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS full application: init, planned master checklist, unplanned registration without 5M, four check persistence, related anomaly detail, legacy opt-in migration, print and planned four-stamp regression.');
 }finally{await b.close();}
}
unit().then(browser).then(fullApp).catch(e=>{console.error(e);process.exitCode=1});

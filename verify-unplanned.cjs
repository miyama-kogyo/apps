const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,fs.existsSync(path.join(__dirname,'変化点管理システム.html'))?'変化点管理システム.html':'changepoint.html'),'utf8');
const slice=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j)};
const core=slice('    function isUnplannedPostcheck','    const APPROVAL_STAGES');
const guards=slice('    function boardCompleted','    function buildTopicsDeptOptions');
const validate=slice('    function validateActualSwitch','    async function saveReceiverStamp');
const escaping=slice('    function escapeHtml','    function csvEscape')+slice('    function categoryOptions','    function refreshChangeCategories');
const stamps=slice('    function workflowStampEntries','    function readStampName');
const related=slice('    function relatedAnomalyHtml','    function showDetail');
const categories=['人','設備','材料','方法','金型'];
const record=()=>({_id:'fixture',type:'sudden',workflowManaged:true,workflowKind:'unplanned_response_v2',approvalStatus:'post_check',postCheckRevision:0,planneddepartment:'品質',department:'製造',category:'',createdBy:'作成者',createdAt:'2026-10-12T09:00:00+09:00',evidenceAttachments:[{id:'preserve'}]});
const data=()=>({category:'設備',responseDepartment:'保全',temporaryChange:false,temporaryUntil:'',workflowComment:'確認結果',checklistItems:['safety','products','workability'].map(x=>({key:'post_'+x,receiverResult:'ok'}))});
async function unit(){
 const ctx={Date,Map,Set,URL,window:{},console,CHANGE_CATEGORIES:categories,db:{},doc:(_,c,id)=>({c,id}),serverTimestamp:()=> 'SERVER',latest:record(),writes:[]};
 ctx.runTransaction=async(_,fn)=>fn({get:async()=>({exists:()=>!!ctx.latest,data:()=>ctx.latest}),update:(ref,patch)=>{ctx.writes.push(patch);ctx.latest={...ctx.latest,...patch}}});
 vm.createContext(ctx);vm.runInContext(core+guards+validate+escaping+stamps+related,ctx);
 new vm.SourceTextModule(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
 assert.equal(ctx.unplannedChecklist({}).length,4);
 assert.equal(ctx.unplannedChecklist(data())[3].receiverResult,'na');
 for(const change of [{category:''},{responseDepartment:''},{temporaryChange:null},{temporaryChange:true},{temporaryChange:true,temporaryUntil:'2026-02-30'}, {checklistItems:[]}, {checklistItems:[{key:'post_safety',receiverResult:'na'}]}]) assert.throws(()=>ctx.validateUnplannedCheck({...data(),...change}));
 ctx.validateUnplannedCheck(data());
 const temporary={...data(),temporaryChange:true,temporaryUntil:'2026-10-20',checklistItems:[...data().checklistItems,{key:'post_temporary',receiverResult:'ok'}]};
 ctx.validateUnplannedCheck(temporary);
 await ctx.saveUnplannedRecord('fixture',0,{...data(),category:''},'担当者',false);
 assert.equal(ctx.latest.approvalStatus,'post_check');assert(!ctx.latest.approvalRequestedAt);
 await assert.rejects(ctx.saveUnplannedRecord('fixture',0,data(),'担当者',true));
 const saved=await ctx.saveUnplannedRecord('fixture',1,temporary,'担当者',true);
 assert.equal(saved.approvalStatus,'draft');assert.equal(ctx.latest.approvalRequestedAt,'SERVER');assert.equal(ctx.latest.postCheckedBy,'担当者');assert.equal(ctx.latest.evidenceAttachments[0].id,'preserve');
 assert(!Object.hasOwn(ctx.latest,'actualSwitchDate'));assert(!Object.hasOwn(ctx.latest,'actualSwitchTime'));
 await assert.rejects(ctx.saveUnplannedRecord('fixture',2,data(),'担当者',false));
 await assert.rejects(ctx.approveUnplannedRecord('fixture',1,'上司'));
 await ctx.approveUnplannedRecord('fixture',2,'上司');assert.equal(ctx.latest.approvalStatus,'approved');assert.equal(ctx.latest.responseApprovedBy,'上司');assert.equal(ctx.latest.senderApprovedBy,undefined);assert.equal(ctx.latest.receiverApprovedBy,undefined);assert.equal(ctx.latest.department,'製造');assert.equal(ctx.latest.planneddepartment,'品質');assert.equal(ctx.latest.responseDepartment,'保全');
 await assert.rejects(ctx.approveUnplannedRecord('fixture',2,'上司'));
 for(const change of [null,{type:'planned'},{approvalStatus:'draft'},{switchStatus:'canceled'},{switchStatus:'completed'}]){ctx.latest=change===null?null:{...record(),...change};await assert.rejects(ctx.saveUnplannedRecord('fixture',0,data(),'担当者',true));}
 assert.equal(ctx.workflowStampEntries(record()).length,1);assert.equal(ctx.workflowStampEntries({type:'sudden'}).length,1);assert.equal(ctx.workflowStampEntries({type:'planned'}).length,4);
 for(const legacy of [{...record(),workflowKind:undefined,approvalStatus:undefined},{...record(),workflowKind:'unplanned_postcheck_v1',approvalStatus:'draft',senderApprovedBy:'Old Boss',checklistItems:[{key:'legacy',receiverResult:'ok'}]}]){
  ctx.latest=legacy;await ctx.saveUnplannedRecord('fixture',0,data(),'担当者',true,legacy);assert.equal(ctx.latest.workflowKind,'unplanned_response_v2');assert.equal(ctx.latest.responseDepartment,'保全');assert.equal(ctx.latest.previousWorkflow.senderApprovedBy,legacy.senderApprovedBy || '');assert.equal(ctx.latest.senderApprovedBy,null);
 }
 ctx.latest={...record(),content:'updated'};await assert.rejects(ctx.saveUnplannedRecord('fixture',0,data(),'担当者',true,{...record(),content:'original'}));
 for(const submit of [false,true]){
  ctx.latest={...record(),actualSwitchDate:'2026-10-12',actualSwitchTime:'09:15'};
  await ctx.saveUnplannedRecord('fixture',0,{...data(),actualSwitchDate:'',actualSwitchTime:''},'担当者',submit);
  assert.equal(ctx.latest.actualSwitchDate,'2026-10-12');assert.equal(ctx.latest.actualSwitchTime,'09:15');
  assert(!Object.hasOwn(ctx.writes.at(-1),'actualSwitchDate'));assert(!Object.hasOwn(ctx.writes.at(-1),'actualSwitchTime'));
 }
 const rendered=ctx.relatedAnomalyHtml({anomalyContent:'<script>bad</script>',actionTaken:'交換',rootCauseAction:'再調整',mfgPhotoUrls:['https://example.com/photo.png','javascript:alert(1)'],techPhotoUrls:['https://example.com/photo.png']});
 assert(!rendered.includes('<script>'));assert(!rendered.includes('javascript:'));assert.equal((rendered.match(/<img /g)||[]).length,1);assert(rendered.includes('交換'));
 console.log('PASS unplanned: four checks, 5M, dates, temporary deadline, NG, draft, atomic submission/approval, concurrency, closed/canceled/planned guards, stamps, related anomaly escaping/photos. No live writes.');
}
async function browser(){
 const {chromium,webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
 const script=`const CHANGE_CATEGORIES=${JSON.stringify(categories)},masterDepartments=['品質','製造','保全'];let currentDetailItem=${JSON.stringify(record())};const db={},doc=(_,c,id)=>({c,id}),serverTimestamp=()=>new Date();let latest=currentDetailItem;
 const runTransaction=async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>latest}),update:(_,p)=>{latest={...latest,...p}}});
 const getActorName=()=> '担当者';const isQrWorkflow=()=>true;const approvalStatusOf=i=>i.approvalStatus;
 const renderApprovalWorkflow=i=>renderUnplannedWorkflow(i,document.getElementById('approvalWorkflow'));const showDetail=renderApprovalWorkflow;
 ${escaping}${validate}${guards}${stamps}${core}${related}${slice('    let stampApprovalSession','    function createQrDataUrl')}
 let missing=false,fail=false;const getDoc=async()=>{if(fail)throw Error('fixture failure');return {exists:()=>!missing,data:()=>({anomalyContent:'異常内容のテスト',actionTaken:'部品交換',rootCauseAction:'再確認'})}};
 renderApprovalWorkflow(currentDetailItem);`;
 const fixture=`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><dialog id="stampApprovalDialog"></dialog><div class="modal active qr-workflow" id="detailModal"><div class="modal-content"><div class="modal-header"><h3>チェック・承認</h3></div><div id="detailBody" class="modal-body"><h4>関連する異常内容</h4><div id="relatedAnomalyHost"></div></div><div id="approvalWorkflow"></div></div></div><script>${script}</script></html>`;
 const out=path.join(__dirname,'outputs','unplanned-test');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'index.html'),fixture);
 for(const engine of ['chromium','webkit']){
  const b=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{const page=await b.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto('http://127.0.0.1/fixture');
   for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.locator('#postCategory').count(),1);const overflow=await page.locator('#unplannedCheckForm').evaluate(el=>[el,...el.querySelectorAll('input,select,textarea')].filter(x=>x.getBoundingClientRect().width && x.getBoundingClientRect().right>innerWidth+1).map(x=>x.id));assert.deepEqual(overflow,[]);await page.screenshot({path:path.join(out,`${engine}-${width}.png`)});}
   assert(await page.locator('.tap-check-label').first().evaluate(label=>label.querySelector('input').getBoundingClientRect().left>=label.querySelector('span').getBoundingClientRect().right));
   await page.setViewportSize({width:390,height:900});
   assert(await page.locator('#postDepartment').isDisabled());
   assert(await page.getByRole('button',{name:'確認完了・承認依頼',exact:true}).isDisabled());
   assert.equal(await page.locator('#postDate,#postTime').count(),0);
   await page.locator('#postCategory').selectOption('設備');await page.locator('#postActor').fill('担当者');
   for(const id of ['post_safety','post_products','post_workability'])await page.locator('#'+id).check();
   await page.locator('#post_safety').uncheck();assert(await page.locator('#postDepartment').isDisabled());await page.locator('[data-check-key="post_safety"] .tap-check-label').click();assert(await page.locator('#post_safety').isChecked());
   await page.locator('#postTemporary').selectOption('yes');assert(await page.locator('#postUntil').isVisible());await page.locator('#postUntil').fill('2026-10-20');await page.locator('#post_temporary').check();
   assert(await page.locator('#postDepartment').isEnabled());await page.locator('#postDepartment').selectOption('保全');
   assert(await page.getByRole('button',{name:'確認完了・承認依頼',exact:true}).isEnabled());
   await page.locator('[data-check-key="post_safety"] summary').click();await page.locator('[data-check-key="post_safety"] select').selectOption('ng');assert(!(await page.locator('#post_safety').isChecked()));assert(await page.locator('#postDepartment').isDisabled());
   await page.getByRole('button',{name:'一時保存',exact:true}).click();assert.equal(await page.locator('#post_safety').getAttribute('data-result'),'ng');assert.equal(await page.locator('#postUntil').inputValue(),'2026-10-20');
   assert(await page.getByRole('button',{name:'確認完了・承認依頼',exact:true}).isDisabled());
   await page.locator('#post_safety').check();await page.getByRole('button',{name:'一時保存',exact:true}).click();assert(await page.locator('#post_safety').isChecked());
   await page.getByRole('button',{name:'確認完了・承認依頼',exact:true}).click();assert(await page.getByRole('button',{name:'承認して完了する'}).isVisible());assert(await page.locator('#postCategory').isDisabled());
   assert.equal(await page.locator('#postActor').inputValue(),'');await page.locator('#postActor').fill('対応部署の上司');await page.getByRole('button',{name:'承認して完了する'}).click();await page.locator('#stampApprovalCommit').click();assert.equal(await page.evaluate(()=>latest.approvalStatus),'approved');assert.equal(await page.locator('.workflow-stamp').count(),1);assert.equal(await page.evaluate(()=>latest.responseDepartment),'保全');
   await page.evaluate(()=>renderRelatedAnomaly(currentDetailItem));assert((await page.locator('#relatedAnomalyHost').textContent()).includes('未設定'));
   await page.evaluate(()=>renderRelatedAnomaly({...currentDetailItem,relatedAnomalyId:'anomaly'}));assert((await page.locator('#relatedAnomalyHost').textContent()).includes('部品交換'));
   await page.evaluate(()=>{missing=true;return renderRelatedAnomaly({...currentDetailItem,relatedAnomalyId:'missing'})});assert((await page.locator('#relatedAnomalyHost').textContent()).includes('見つかりません'));
   await page.evaluate(()=>{fail=true;return renderRelatedAnomaly({...currentDetailItem,relatedAnomalyId:'failure'})});assert(await page.getByRole('button',{name:'再読み込み'}).isVisible());
   assert.deepEqual(errors,[]);console.log(`PASS ${engine}: responsive 320/390/768/1440, temporary date, draft persistence, submit, sole supervisor approval, related/missing/error states`);
  }finally{await b.close();}
 }
}
async function fullApp(engine='chromium'){
 const {chromium,webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const mock=`const initializeApp=()=>({}),getFirestore=()=>({}),getStorage=()=>({}),getAuth=()=>({currentUser:{uid:'test'}}),setPersistence=async()=>{},browserLocalPersistence={},onAuthStateChanged=()=>{},signInAnonymously=async()=>{};
 const collection=(_, ...p)=>p.join('/'),doc=(_, ...p)=>p.join('/'),query=x=>x,orderBy=()=>{},onSnapshot=()=>{},serverTimestamp=()=>new Date(),getDocs=async p=>({docs:(p.includes('department')?[{name:'品質'},{name:'製造'}]:p.includes('changeChecklist')?[{name:'計画用チェック',category:'設備'}]:[]).map((x,i)=>({id:String(i),data:()=>x}))});
 window.__writes=[];window.__latest=null;const addDoc=async(_,x)=>{window.__writes.push(x);return {id:'new-record'}},updateDoc=async(_,patch)=>{if(!Object.hasOwn(patch,'workflowComment'))throw Error('Unexpected write');if(window.__holdComment)await new Promise(resolve=>window.__releaseComment=resolve);window.__latest={...window.__latest,...patch}},deleteDoc=async()=>{throw Error('Unexpected delete')};
 const getDoc=async()=>({exists:()=>true,data:()=>({anomalyContent:'センサーが反応しない',actionTaken:'センサー交換',rootCauseAction:'再調整',occurrenceDate:'2026-10-12'})});
 const runTransaction=async(_,fn)=>fn({get:async()=>{if(window.__holdTx)await new Promise(resolve=>window.__releaseTx=resolve);return {exists:()=>true,data:()=>window.__latest}},update:(_,p)=>{window.__latest={...window.__latest,...p}}});
 const ref=()=>{},uploadBytesResumable=()=>{},getDownloadURL=()=>{};
 localStorage.setItem('changepointActorName','テスト担当者');`;
 const module=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'');
 const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module">${mock}${module}\nawait initApp();document.getElementById('authGate').style.display='none';showScreen('planned');window.__ticket=renderChangeTicket;window.__ready=true;</script>`);
 const b=await (engine==='webkit'?webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}));
 try{const p=await b.newPage({viewport:{width:390,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.type()==='confirm'?d.accept():d.dismiss());await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));await p.goto('http://127.0.0.1/full');await p.waitForFunction(()=>window.__ready);
  await p.locator('#planType').selectOption('sudden');assert(await p.locator('#planChecklistPreview').isVisible());assert.equal(await p.locator('#planChecklistPreview .checklist-row').count(),4);assert(!(await p.locator('#planCustomCheckText').isVisible()));
  await p.locator('#planDepartment').selectOption('品質');await p.locator('#planDepartmentOccur').selectOption('製造');await p.locator('#planLineName').fill('94-300');await p.locator('#planProcessName').fill('溶接');await p.locator('#planContent').fill('センサー交換');await p.locator('#planDate').fill('2026-10-12');await p.locator('#btnRegisterPlanned').click();await p.locator('#btnConfirmOk').click();await p.locator('#registrationPrintDialog').waitFor();
  const written=await p.evaluate(()=>window.__writes[0]);assert.equal(written.category,'');assert.equal(written.checklistItems.length,4);assert.equal(written.approvalStatus,'post_check');assert.equal(written.approvalRequestedAt,null);
  await p.evaluate(()=>document.getElementById('registrationPrintDialog').close());
  const legacy={_id:'old',type:'sudden',relatedAnomalyId:'abn',category:'設備',department:'製造',content:'センサー交換',lineName:'94-300',serialNo:'7089',occurrenceDate:'2026-10-12'};
  await p.evaluate(x=>{window.__latest=x;window.showDetail(x)},legacy);await p.getByText('センサーが反応しない',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'事後チェックを開始する'}).count(),0);await p.locator('#postCategory').waitFor();assert.equal(await p.locator('#postDepartment').inputValue(),'');assert.equal(await p.evaluate(()=>window.__latest.workflowKind),undefined);
  const ticket=await p.evaluate(()=>window.__ticket(window.__latest,'原本','発信部署'));assert(ticket.includes('安全面に問題が無いか'));assert(!ticket.includes('関係部署確認'));assert(!ticket.includes('発生部署 承認者'));assert(!ticket.includes('data-card-qr'));assert(!ticket.includes('QR'));assert(ticket.includes('対応部署 承認'));assert(!ticket.includes('チェック項目なし'));
  assert.equal(await p.locator('#postDate,#postTime').count(),0);for(const id of ['post_safety','post_products','post_workability'])await p.locator('#'+id).check();await p.locator('#postTemporary').selectOption('no');await p.locator('#postDepartment').selectOption('製造');await p.getByRole('button',{name:'確認完了・承認依頼'}).click();await p.getByRole('button',{name:'承認して完了する'}).waitFor();assert.equal(await p.evaluate(()=>window.__latest.workflowKind),'unplanned_response_v2');assert.equal(await p.evaluate(()=>window.__latest.responseDepartment),'製造');assert.equal(await p.evaluate(()=>window.__latest.actualSwitchDate),undefined);
  const preview=await b.newPage();await preview.setContent('<style>'+html.match(/<style>([\s\S]*?)<\/style>/)[1]+'</style><div class="issued-card-preview" style="width:510px">'+ticket+'</div>');await preview.screenshot({path:path.join(__dirname,'outputs/unplanned-test/card-no-qr.png')});assert.equal(await preview.locator('.sign > div').count(),1);assert.equal(await preview.locator('.card-qrs').count(),0);await preview.close();
  const printResult=await p.evaluate(async x=>{const original=window.open;window.open=()=>({closed:false,document:{body:{},open(){},write(h){window.__printed=h},close(){}}});try{return await window.printChangeCard(x)}finally{window.open=original}},legacy);assert(printResult);const printed=await p.evaluate(()=>window.__printed);assert(!printed.includes('data-card-qr'));assert.equal((printed.match(/<td>安全面に問題が無いか/g)||[]).length,2);
  const plannedTicket=await p.evaluate(()=>window.__ticket({type:'planned',category:'設備'},'原本','発信部署'));assert.equal((plannedTicket.match(/data-card-qr=/g)||[]).length,2);
  const checkboxRecord={...legacy,temporaryChange:false,checklistItems:[{key:'post_safety',receiverResult:'ok'},{key:'post_products',receiverResult:'ng'}]};
  const checkboxTicket=await p.evaluate(x=>window.__ticket(x,'原本','発信部署'),checkboxRecord);
  assert(!checkboxTicket.includes('未判定'));
  await p.evaluate(async x=>{const original=window.open;window.open=()=>({closed:false,document:{body:{},open(){},write(h){window.__printed=h},close(){}}});try{await window.printChangeCard(x)}finally{window.open=original}},checkboxRecord);
  const checkboxPrint=(await p.evaluate(()=>window.__printed)).replace(/<script>[\s\S]*?<\/script>/g,'');
  const legacyTicket=await p.evaluate(()=>window.__ticket({type:'planned',category:'人',checklistItems:[{label:'旧チェック " <test>',receiverChecked:true}]},'原本','発信部署'));
  const {webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  for(const engine of ['chromium','webkit']){
   const browser=engine==='chromium'?b:await webkit.launch({headless:true});
   try{const page=await browser.newPage({viewport:{width:510,height:900}});
    await page.setContent('<style>'+html.match(/<style>([\s\S]*?)<\/style>/)[1]+'</style><article class="board-issued-card"><div class="issued-card-preview">'+checkboxTicket+'</div></article>');
    assert.equal(await page.locator('.ticket table').isVisible(),false);
    assert.equal(await page.locator('.ticket-checkbox').count(),4);assert.equal(await page.locator('.ticket-checkbox:checked').count(),1);assert.equal(await page.locator('.ticket-checkbox:disabled').count(),4);
    assert.deepEqual(await page.locator('.ticket-check').allTextContents(),['','NG','','該当なし']);
    assert.equal(await page.locator('.ticket-checkbox:checked').evaluate(el=>getComputedStyle(el,'::after').borderRightWidth),'2px');
    for(const width of [320,510]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.join(__dirname,`outputs/unplanned-test/checkbox-${engine}-${width}.png`)});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,JSON.stringify(await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>e.className)}))));}
    await page.setContent('<div>'+legacyTicket+'</div>');assert.equal(await page.locator('.ticket-checkbox:checked').count(),1);assert.equal(await page.locator('test').count(),0);
    await page.setContent(checkboxPrint);await page.setViewportSize({width:800,height:1123});await page.emulateMedia({media:'print'});
    assert.equal(await page.locator('.ticket-checkbox').count(),8);assert.equal(await page.locator('.ticket-checkbox:checked').count(),2);
    assert(await page.locator('.ticket-checkbox').first().evaluate(el=>parseFloat(getComputedStyle(el).borderTopWidth)>=1));
    await page.screenshot({path:path.join(__dirname,`outputs/unplanned-test/checkbox-print-${engine}.png`),fullPage:true});await page.close();
   }finally{if(engine==='webkit')await browser.close();}
  }
  console.log('PASS card checkboxes: blank/OK/NG/NA, legacy checked state, escaped label, read-only, 320px layout and printed original/copy in Chromium/WebKit.');
  await p.screenshot({path:path.join(__dirname,'outputs/unplanned-test/related-anomaly-mobile.png')});
  await p.evaluate(()=>window.showDetail({_id:'planned',type:'planned',workflowManaged:true,category:'設備',approvalStatus:'draft',checklistItems:[],department:'製造',planneddepartment:'品質'}));assert.equal(await p.locator('.workflow-stamp').count(),4);assert(await p.getByRole('button',{name:'承認スタンプを押す',exact:true}).isVisible());assert.equal(await p.locator('#relatedAnomalyHost').count(),0);assert.deepEqual(errors,[]);
  const plannedCheck={_id:'planned-checkbox',type:'planned',workflowManaged:true,category:'人',approvalStatus:'sender_approved',department:'製造',planneddepartment:'品質',checklistItems:[{key:'a',label:'安全面を確認',criteria:'安全に作業できること',receiverResult:''},{key:'b',label:'変化点前後の物を確認',receiverResult:'ng'},{key:'c',label:'作業性を確認',receiverResult:'na'},{key:'d',label:'旧データの確認',receiverChecked:true}]};
  await p.evaluate(x=>{window.__latest=x;window.showDetail(x)},plannedCheck);
  assert.equal(await p.locator('#actualSwitchDate,#actualSwitchTime').count(),2);
  const check=key=>p.locator(`[data-check-key="${key}"] input[type="checkbox"]`);
  assert(await check('d').isChecked());assert(!(await check('c').isChecked()));assert.equal(await p.locator('[data-check-key="c"] summary').textContent(),'該当なし');
  for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:1000});assert.deepEqual(await p.locator('.tap-check-row').evaluateAll(rows=>rows.filter(r=>r.getBoundingClientRect().right>innerWidth+1).map(r=>r.dataset.checkKey)),[]);await p.screenshot({path:path.join(__dirname,`outputs/unplanned-test/planned-checkbox-${engine}-${width}.png`)});}
  assert(await p.locator('[data-check-key="a"] .tap-check-label').evaluate(label=>label.querySelector('input').getBoundingClientRect().left>=label.querySelector('span').getBoundingClientRect().right));
  await p.locator('[data-check-key="a"] .tap-check-label').click();await p.waitForFunction(()=>window.__latest.checklistItems[0].receiverResult==='ok');assert(await check('a').isChecked());
  await check('a').uncheck();await p.waitForFunction(()=>window.__latest.checklistItems[0].receiverResult==='');
  await check('b').check();await p.waitForFunction(()=>window.__latest.checklistItems[1].receiverResult==='ok');
  await p.locator('[data-check-key="b"] summary').click();await p.locator('[data-check-key="b"] select').selectOption('ng');await p.waitForFunction(()=>window.__latest.checklistItems[1].receiverResult==='ng');assert(!(await check('b').isChecked()));
  await p.evaluate(()=>window.showDetail(window.__latest));assert.equal(await p.locator('[data-check-key="b"] summary').textContent(),'NG');
  assert(await p.locator('#receiverStampButton').isDisabled());
  await p.locator('#actualSwitchDate').fill('2026-10-13');await p.locator('#actualSwitchTime').fill('09:30');
  await check('a').check();await p.waitForFunction(()=>!window.setApprovalResult.pending.size);
  await p.evaluate(()=>window.__holdTx=true);await check('b').check();
  await p.waitForFunction(()=>!!window.__releaseTx);assert(await p.locator('#receiverStampButton').isDisabled());
  await p.evaluate(()=>{window.__holdTx=false;window.__releaseTx()});await p.waitForFunction(()=>!window.setApprovalResult.pending.size);
  assert(await p.locator('#receiverStampButton').isEnabled());
  await p.locator('#actualSwitchTime').fill('');assert(await p.locator('#receiverStampButton').isDisabled());
  await p.locator('#actualSwitchTime').fill('09:30');assert(await p.locator('#receiverStampButton').isEnabled());
  await p.locator('#workflowCommentText').fill('未保存の所見');assert(await p.locator('#receiverStampButton').isDisabled());
  await p.evaluate(()=>window.__holdComment=true);await p.locator('#btnSaveWorkflowComment').click();
  await p.waitForFunction(()=>!!window.__releaseComment);assert(await p.locator('#receiverStampButton').isDisabled());
  await p.evaluate(()=>{window.__holdComment=false;window.__releaseComment()});
  await p.waitForFunction(()=>!document.getElementById('receiverStampButton').disabled);
  assert.equal(await p.evaluate(()=>window.__latest.workflowComment),'未保存の所見');
  await check('a').uncheck();assert(await p.locator('#receiverStampButton').isDisabled());await p.waitForFunction(()=>!window.setApprovalResult.pending.size);
  await check('a').check();await p.waitForFunction(()=>!window.setApprovalResult.pending.size);
  await p.evaluate(()=>{history.replaceState(null,'','?changepointId=planned-checkbox');window.showDetail(window.__latest)});
  for(const width of [320,390,768,1440]){
   await p.setViewportSize({width,height:900});
   const positions=await p.locator('#approvalWorkflow').evaluate(el=>Object.fromEntries(['workflow-checks','workflow-fold','workflow-comment','workflow-signoff'].map(c=>{const r=el.querySelector('.'+c).getBoundingClientRect();return [c,{top:r.top,bottom:r.bottom}]})));
   assert(positions['workflow-checks'].bottom<=positions['workflow-fold'].top);
   assert(positions['workflow-fold'].bottom<=positions['workflow-comment'].top);
   assert(positions['workflow-comment'].bottom<=positions['workflow-signoff'].top);
   await p.locator('.workflow-signoff').screenshot({path:path.join(__dirname,`outputs/unplanned-test/check-then-stamp-${engine}-${width}.png`)});
   if(width===390)await p.locator('#approvalWorkflow').screenshot({path:path.join(__dirname,`outputs/unplanned-test/check-then-stamp-flow-${engine}.png`)});
  }
  assert(await p.locator('#receiverStampButton').isEnabled());await p.locator('#receiverStampButton').click();
  await p.waitForFunction(()=>window.__latest.approvalStatus==='receiver_confirmed');
  assert.equal(await p.evaluate(()=>window.__latest.actualSwitchTime),'09:30');
  assert(await p.getByRole('button',{name:'承認して完了する',exact:true}).isEnabled());
  assert.equal(await p.locator('#workflowStampName').inputValue(),'');
  await p.evaluate(()=>window.showDetail({...window.__latest,approvalStatus:'approved'}));assert(await check('a').isDisabled());assert(await p.locator('[data-check-key="a"] select').isDisabled());assert.deepEqual(errors,[]);
  console.log(`PASS ${engine} full application: check-before-stamp order, incomplete/pending checks, actual time and comment save gates, successful stamp, unplanned submission readiness, responsive layout, print and four-stamp regression.`);
 }finally{await b.close();}
}
unit().then(browser).then(()=>fullApp('chromium')).then(()=>fullApp('webkit')).catch(e=>{console.error(e);process.exitCode=1});

const fs=require('fs'),vm=require('vm'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file=path.resolve(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':'changepoint.html'),html=fs.readFileSync(file,'utf8');
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
async function unit(){
 const ctx={window:{},quickApprovalId:null,quickApprovalReceipt:null,screens:{quickApproval:{style:{display:'none'}}},workflowCommentDrafts:new Map(),workflowCommentSaves:new Set(),APPROVAL_STAGES:['draft','sender_approved','receiver_confirmed','approved'],currentDetailItem:null,
  getRecordChecklist:i=>i.checklistItems,document:{querySelector:()=>null,getElementById:id=>({value:id==='actualSwitchDate'?'2026-10-08':id==='actualSwitchTime'?'09:15':ctx.actor,focus(){},showModal(){},close(){}})},
  localStorage:{setItem(){}},updateActorNameButton(){},alert:m=>ctx.messages.push(m),confirm:m=>{ctx.confirmed.push(m);return true},
  doc:(_,collection,id)=>({collection,id}),db:{},serverTimestamp:()=> 'SERVER_TIME',
  updateDoc:async(ref,payload)=>ctx.writes.push({ref,payload}),saveChecklist:async items=>ctx.writes.push({checklistItems:items}),renderApprovalWorkflow(){},console,
  ymdLocal:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
 ctx.runTransaction=async(_,f)=>f({get:async()=>({exists:()=>true,data:()=>ctx.currentDetailItem}),update:(ref,payload)=>ctx.writes.push({ref,payload})});
 vm.createContext(ctx);
 vm.runInContext(slice('    const actualSwitchDrafts','    function isQrWorkflow')+slice('    function boardCompleted','    function boardTracked'),ctx);
 vm.runInContext(slice('    function approvalStatusOf','    function renderApprovalChecklist')+
  slice('function workflowStampEntries','    function renderApprovalWorkflow')+
  slice('    window.approveSender =','    function createQrDataUrl')+
  slice('    window.setApprovalResult =','    window.excludeApprovalItem'),ctx);
 // Keep the existing business-rule assertions, using the new explicit approval steps.
 vm.runInContext(`renderStampApproval=()=>{if(stampApprovalSession?.error)alert(stampApprovalSession.error)};`,ctx);
 for(const method of ['approveSender','approveReceiver']){
  const open=ctx.window[method];ctx.window[method]=async()=>{await open();await ctx.window.commitStampApproval();};
 }
 const base=()=>({_id:'fixture-only',type:'planned',approvalStatus:'draft',occurrenceDate:'2020-01-01',
 checklistItems:[{key:'a',owner:'both',senderResult:'ok',receiverResult:'ok'}],
 specialHandlingStatus:'not_required',relatedReviewCompleted:true});
 const reset=(overrides={})=>{ctx.window.closeStampApproval();ctx.currentDetailItem={...base(),...overrides};ctx.messages=[];ctx.writes=[];ctx.confirmed=[];ctx.actor='試験 承認者';};
 reset();await ctx.window.approveSender();assert(ctx.writes[0].payload.senderApprovedBy==='試験 承認者','sender name');
 assert(ctx.writes[0].payload.senderApprovedAt==='SERVER_TIME','sender timestamp');assert(ctx.currentDetailItem.approvalStatus==='sender_approved','sender stage');
 ctx.actor='試験 対応者';await ctx.window.confirmReceiver();assert(ctx.writes[1].payload.receiverConfirmedBy===ctx.actor,'receiver name');
 assert(ctx.writes[1].payload.receiverConfirmedAt==='SERVER_TIME','receiver timestamp');
 ctx.actor='試験 最終承認者';await ctx.window.approveReceiver();assert(ctx.writes[2].payload.receiverApprovedBy===ctx.actor,'final name');
 assert(ctx.writes[2].payload.switchStatus==='completed','final completion');assert(ctx.writes[2].payload.receiverApprovedAt==='SERVER_TIME','final timestamp');
 for(const value of ['', '過去の確認者']){
  reset({approvalStatus:'receiver_confirmed',completionConfirmers:value});await ctx.window.approveReceiver();
  assert(ctx.writes.length===1&&ctx.writes[0].payload.switchStatus==='completed','completion no longer requires confirmers');
  assert(ctx.currentDetailItem.completionConfirmers===value&&!Object.hasOwn(ctx.writes[0].payload,'completionConfirmers'),'legacy confirmers not overwritten');
 }
 reset();ctx.actor='';await ctx.window.approveSender();assert(ctx.writes.length===0&&ctx.messages.length===1,'empty name blocked');
 reset();ctx.workflowCommentDrafts.set('fixture-only','未保存の所見');await ctx.window.approveSender();assert(ctx.writes.length===1&&ctx.writes[0].payload.workflowComment==='未保存の所見'&&ctx.writes[0].payload.workflowCommentAt==='SERVER_TIME','sender approval saves comment atomically');ctx.workflowCommentDrafts.clear();
 reset();ctx.workflowCommentSaves.add('fixture-only');await ctx.window.approveSender();assert(ctx.writes.length===1,'pending comment does not block approval');ctx.workflowCommentSaves.clear();
 reset({approvalStatus:'receiver_confirmed'});ctx.workflowCommentDrafts.set('fixture-only','最終承認所見');await ctx.window.approveReceiver();assert(ctx.writes.length===1&&ctx.writes[0].payload.workflowComment==='最終承認所見'&&ctx.writes[0].payload.workflowCommentBy===ctx.actor,'final approval saves comment atomically');ctx.workflowCommentDrafts.clear();
 reset({approvalStatus:'sender_approved'});ctx.workflowCommentDrafts.set('fixture-only','対応者所見');await ctx.window.confirmReceiver();assert(ctx.writes.length===0&&ctx.messages[0].includes('所見コメント'),'responder comment guard retained');ctx.workflowCommentDrafts.clear();
 reset();await ctx.window.confirmReceiver();await ctx.window.approveReceiver();assert(ctx.writes.length===0,'out of order blocked');
 reset({checklistItems:[{key:'a',senderResult:'',receiverResult:''}]});await ctx.window.approveSender();assert(ctx.writes.length===1,'sender approval needs no checks');
 reset({approvalStatus:'sender_approved',checklistItems:[{key:'a',receiverResult:'ng'}]});await ctx.window.confirmReceiver();assert(ctx.writes.length===0&&ctx.messages.length===1,'responder NG blocked');
 reset({approvalStatus:'sender_approved',checklistItems:[{key:'a',owner:'sender',senderResult:'ok',receiverResult:''}]});await ctx.window.confirmReceiver();assert(ctx.writes.length===0,'issuer-added item must be checked by responder');
 reset({approvalStatus:'sender_approved'});await ctx.window.setApprovalResult('a','sender','ok');assert(ctx.writes.length===0,'sender check API blocked');
 await ctx.window.setApprovalResult('a','receiver','na');assert(ctx.writes.length===1,'responder check enabled');
 reset({approvalStatus:'approved'});await ctx.window.setApprovalResult('a','receiver','ok');assert(ctx.writes.length===0,'completed checks locked');
 reset();await ctx.window.setApprovalResult('a','receiver','ok');assert(ctx.writes.length===0,'draft checks locked');
 const cases=[
  {checklistItems:[{key:'a',receiverResult:'ng'}]},
  {checklistItems:[{key:'a',receiverResult:''}]},
  {specialHandlingStatus:''},
  {specialHandlingStatus:'in_progress'},
  {specialHandlingStatus:'completed',specialNotes:''},
  {relatedReviewCompleted:false},
  {occurrenceDate:ctx.ymdLocal(new Date())},
  {occurrenceDate:'2099-12-31'},
  {continuedManagementRequired:true,managementUntil:''},
  {continuedManagementRequired:true,managementUntil:'2099-12-31'}
 ];
 for(const c of cases){reset({approvalStatus:'receiver_confirmed',...c});await ctx.window.approveReceiver();assert(ctx.writes.length===1&&ctx.writes[0].payload.switchStatus==='completed','unconditional final approval '+JSON.stringify(c));}
 reset({approvalStatus:'receiver_confirmed'});ctx.actor='';await ctx.window.approveReceiver();assert(ctx.writes.length===0,'final stamp requires name');
 reset({approvalStatus:'receiver_confirmed'});ctx.workflowCommentDrafts.set('fixture-only','保存失敗でも残す');const update=ctx.runTransaction;ctx.runTransaction=async()=>{throw new Error('expected save failure')};await ctx.window.approveReceiver();assert(ctx.currentDetailItem.approvalStatus==='receiver_confirmed'&&ctx.workflowCommentDrafts.get('fixture-only')==='保存失敗でも残す','failed approval preserves stage and comment');ctx.runTransaction=update;ctx.workflowCommentDrafts.clear();
 reset({approvalStatus:'sender_approved'});const transaction=ctx.runTransaction;
 ctx.runTransaction=async()=>{throw new Error('expected responder save failure')};await ctx.window.confirmReceiver();
 assert(ctx.currentDetailItem.approvalStatus==='sender_approved'&&ctx.writes.length===0,'failed responder stamp retains stage');
 assert(vm.runInContext("actualSwitchDrafts.get('fixture-only').actualSwitchTime==='09:15' && !receiverStampSaves.has('fixture-only')",ctx),'failed save retains actual datetime and unlocks retry');
 ctx.runTransaction=transaction;
 let release;ctx.runTransaction=()=>new Promise(resolve=>{release=resolve});
 const first=ctx.window.confirmReceiver();await ctx.window.confirmReceiver();
 ctx.currentDetailItem={...base(),_id:'another-record'};release({...base(),_id:'fixture-only',approvalStatus:'receiver_confirmed'});await first;
 assert(ctx.currentDetailItem._id==='another-record','pending stamp does not overwrite another open record');ctx.runTransaction=transaction;
 reset({approvalStatus:'sender_approved',checklistItems:[{key:'a',receiverResult:'ok'},{key:'b',receiverResult:'ok'}]});
 let server=structuredClone(ctx.currentDetailItem),fail=false;
 ctx.runTransaction=async(_,fn)=>{await new Promise(r=>setTimeout(r,20));if(fail){fail=false;throw Error('expected checkbox failure');}return fn({get:async()=>({exists:()=>true,data:()=>structuredClone(server)}),update:(ref,payload)=>{server={...server,...payload};ctx.writes.push({ref,payload});}});};
 const taps=[ctx.window.toggleApprovalCheck('a','receiver',true),ctx.window.toggleApprovalCheck('b','receiver',true),ctx.window.toggleApprovalCheck('a','receiver',false)];
 await ctx.window.confirmReceiver();assert(ctx.writes.length===0&&ctx.messages.at(-1).includes('保存中'),'stamp blocked while checkbox saves pending');
 await Promise.all(taps);assert(server.checklistItems[0].receiverResult===''&&server.checklistItems[1].receiverResult==='ok','rapid taps merged in order');
 fail=true;await ctx.window.toggleApprovalCheck('a','receiver',true);assert(ctx.currentDetailItem.checklistItems[0].receiverResult===''&&server.checklistItems[0].receiverResult==='','failed checkbox rolls back');
 await ctx.window.toggleApprovalCheck('a','receiver',true);assert(server.checklistItems.every(x=>x.receiverResult==='ok'),'checkbox retry');
 const navigating=ctx.window.toggleApprovalCheck('a','receiver',false);ctx.currentDetailItem={...base(),_id:'different'};await navigating;assert(ctx.currentDetailItem._id==='different'&&server.checklistItems[0].receiverResult==='','checkbox save targets original record');
 ctx.currentDetailItem={...server};server.approvalStatus='approved';await ctx.window.toggleApprovalCheck('a','receiver',true);assert(server.checklistItems[0].receiverResult==='','server completion locks checkbox writes');ctx.runTransaction=transaction;
 console.log('PASS UNIT: approvals ignore business conditions, responder checks remain required, names/stage order retained, comments saved atomically, legacy data preserved; writes mocked');
}
async function browserTest(){
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--allow-file-access-from-files']});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
 await page.goto(process.env.BOARD_URL||pathToFileURL(file).href);
 await page.waitForFunction(()=>window.changepointData?.length>0,{},{timeout:60000});
 const show=async(status)=>page.evaluate(status=>{
  window.showDetail({_id:'stamp-preview-only',type:'planned',workflowManaged:true,
   planneddepartment:'生産技術',department:'製造1課',lineName:'プレスA',processName:'プレス',serialNo:'7089',category:'設備',
   content:'センサー交換後の初品確認',occurrenceDate:'2026-10-07',createdBy:'作成 太郎',createdAt:new Date('2026-10-06T08:00:00+09:00'),
   approvalStatus:status,
   senderApprovedBy:status==='draft'?null:'承認 花子',senderApprovedAt:new Date('2026-10-06T09:00:00+09:00'),
   receiverConfirmedBy:['receiver_confirmed','approved'].includes(status)?'対応 次郎':null,receiverConfirmedAt:new Date('2026-10-07T09:00:00+09:00'),
   receiverApprovedBy:status==='approved'?'承認 三郎':null,receiverApprovedAt:new Date('2026-10-08T09:00:00+09:00')});
 },status);
 for(const [i,status] of ['draft','sender_approved','receiver_confirmed','approved'].entries()){
  await show(status);
  assert(await page.locator('.workflow-stamp').count()===4,'four stamps '+status);
  assert(await page.locator('textarea[onblur*="completionConfirmers"]').count()===0,'confirmers field removed '+status);
  assert((await page.locator('[data-workflow-section="completion"] summary').innerText())==='追加記録（任意）','optional records label');
  assert(await page.locator('[data-workflow-section="completion"] .required').count()===0,'no approval required markers');
  assert(await page.locator('.workflow-stamp.is-stamped').count()===i+1,'stamped count '+status);
  assert(await page.locator('.stamp-action button').count()===(status==='approved'?0:1),'one next action '+status);
  assert(await page.locator('.workflow-fold[open]').count()===0,'folded initially '+status);
  assert(await page.locator('.workflow-checks .check-label').first().isVisible(),'checks always shown '+status);
  assert(await page.evaluate(()=>{
   const body=document.getElementById('detailBody'),checks=document.querySelector('.workflow-checks'),stamps=document.querySelector('.workflow-stamps');
   return !!(body.compareDocumentPosition(checks)&Node.DOCUMENT_POSITION_FOLLOWING) &&
    !!(checks.compareDocumentPosition(stamps)&Node.DOCUMENT_POSITION_FOLLOWING) &&
    stamps.parentElement===document.querySelector('.workflow-signoff') &&
    document.getElementById('approvalWorkflow')===document.querySelector('#detailModal .modal-content').lastElementChild;
  }),'content then checks then stamps at bottom '+status);
  assert(await page.locator('[data-check-role="sender"]').count()===0,'no sender check input');
  const editable=await page.locator('[data-check-role="receiver"] input[type="checkbox"]:not([disabled])').count();
  assert(['sender_approved','receiver_confirmed'].includes(status)?editable>0:editable===0,'responder check editing '+status);
  if(status==='approved'){
   const promise=page.waitForEvent('popup');await page.locator('#btnCardPrint').click();const print=await promise;await print.waitForLoadState();
   assert(await print.locator('.ticket .sign>div').count()===8,'four print stamps per copy');
   assert(!(await print.locator('body').innerText()).includes('完了後確認者'),'confirmers removed from printed cards');
   assert(await print.locator('thead th').count()===6,'three checklist columns per copy');
   assert((await print.locator('thead').first().innerText()).includes('対応者判定'),'responder print result only');
   assert((await print.locator('.sign').first().innerText()).includes('作成 太郎'),'creator on print');
   assert(await print.locator('img[alt="ワークフローQR"]').count()===2,'QR preserved');
   await print.setViewportSize({width:734,height:1060});
   await print.emulateMedia({media:'print'});
   assert(await print.evaluate(()=>[...document.querySelectorAll('.ticket')].every(el=>el.scrollHeight<=el.clientHeight)),'print ticket fits A4 half');
   await print.screenshot({path:'workflow-stamps-print.png',fullPage:true});await print.close();
  }
 }
 await show('sender_approved');await page.locator('.stamp-action button').click();
 assert(await page.locator('[data-workflow-section="checks"] .check-label').first().isVisible(),'missing checks remain visible');
 await show('receiver_confirmed');
 for(const width of [320,390,1440]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(()=>document.querySelector('#detailModal .modal-content').scrollTop=0);
  assert(await page.evaluate(()=>{const m=document.querySelector('#detailModal .modal-content');return m.scrollWidth<=m.clientWidth}),'modal overflow '+width);
  const stamps=await page.locator('.workflow-stamps').boundingBox();assert(stamps.width<=width,'stamp width');
  await page.locator('.workflow-checks').scrollIntoViewIfNeeded();
  await page.screenshot({path:'workflow-checks-first-'+width+'.png',fullPage:false});
  await page.locator('.workflow-stamps').scrollIntoViewIfNeeded();
  await page.screenshot({path:'workflow-stamps-'+width+'.png',fullPage:false});
 }
 assert(errors.length===0,'page errors '+errors.join(';'));
 console.log('PASS BROWSER: four stages, folding, name fields, print stamps and QR, 320/390/1440 layout; no live writes');
 }finally{await browser.close();}
}
(async()=>{await unit();if(!process.env.UNIT_ONLY)await browserTest()})().catch(e=>{console.error(e);process.exitCode=1});

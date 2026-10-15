const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('変化点管理システム.html','utf8');
const slice=(a,b)=>{const start=html.indexOf(a),end=html.indexOf(b,start);assert(start>=0&&end>start);return html.slice(start,end)};
const core=slice('    const actualSwitchDrafts','    function isQrWorkflow')+
 slice('    function boardCompleted','    function boardTracked')+
 slice('    function approvalStatusOf','    function renderApprovalChecklist');
const valid={actualSwitchDate:'2026-10-08',actualSwitchTime:'09:15'};
const base=()=>({_id:'fixture',type:'planned',approvalStatus:'sender_approved',occurrenceDate:'2026-10-12',occurrenceTime:'11:00',checklistItems:[{key:'safety',label:'安全確認',criteria:'危険箇所がないこと',receiverResult:'ok'}]});
async function unit(){
 const writes=[],ctx={window:{},Date,Map,Set,db:{},APPROVAL_STAGES:['draft','sender_approved','receiver_confirmed','approved'],getRecordChecklist:i=>i.checklistItems,
  doc:(_,collection,id)=>({collection,id}),serverTimestamp:()=> 'SERVER',latest:base()};
 ctx.runTransaction=async(_,fn)=>fn({get:async()=>({exists:()=>!!ctx.latest,data:()=>ctx.latest}),update:(ref,data)=>writes.push({ref,data})});
 vm.createContext(ctx);vm.runInContext(core,ctx);
 const at=new Date('2026-10-15T15:05:59Z');
 assert.equal(ctx.actualSwitchValues(base(),at).actualSwitchDate,'2026-10-16');
 assert.equal(ctx.actualSwitchValues(base(),at).actualSwitchTime,'00:05');
 assert.equal(ctx.actualSwitchValues(base(),new Date('2026-10-17T12:00:00Z')).actualSwitchTime,'00:05');
 assert.equal(ctx.actualSwitchValues({...base(),actualSwitchDate:'2026-10-01'},at).actualSwitchDate,'2026-10-01');
 assert.equal(ctx.actualSwitchValues({...base(),actualSwitchTime:'13:24'},at).actualSwitchTime,'13:24');
 assert.equal(ctx.actualSwitchValues({...base(),...valid},at).actualSwitchTime,'09:15');
 for(const patch of [{type:'sudden'},{approvalStatus:'draft'},{approvalStatus:'approved'},{switchStatus:'completed'},{switchStatus:'canceled'}])assert.equal(ctx.actualSwitchValues({...base(),...patch},at).actualSwitchDate,undefined);
 vm.runInContext("actualSwitchDrafts.set('fixture',{actualSwitchDate:'',actualSwitchTime:'10:20'})",ctx);
 assert.equal(ctx.actualSwitchValues(base(),at).actualSwitchDate,'');
 assert.equal(ctx.actualSwitchValues(base(),at).actualSwitchTime,'10:20');
 vm.runInContext('actualSwitchDrafts.clear();actualSwitchDefaults.clear()',ctx);
 for(const [date,time] of [['',''],['2026-10-08',''],['2026-02-30','12:00'],['2026-10-08','24:00'],['2026-10-08','09:60'],['2026-10-08','9:15']]){
  await assert.rejects(ctx.saveReceiverStamp('fixture','対応者',{actualSwitchDate:date,actualSwitchTime:time}));
 }
 assert.equal(writes.length,0);
 for(const time of ['00:00','09:15','23:59']){
  ctx.latest=base();const saved=await ctx.saveReceiverStamp('fixture','対応者',{...valid,actualSwitchTime:time});
  assert.equal(saved.actualSwitchTime,time);assert.equal(saved.occurrenceDate,'2026-10-12');assert.equal(saved.occurrenceTime,'11:00');
  const data=writes.at(-1).data;assert.equal(data.receiverConfirmedBy,'対応者');assert.equal(data.receiverConfirmedAt,'SERVER');
  assert.equal(data.approvalRequestedAt,'SERVER');assert(!Object.hasOwn(data,'occurrenceDate'));assert(!Object.hasOwn(data,'occurrenceTime'));
 }
 for(const change of [null,{approvalStatus:'draft'},{approvalStatus:'receiver_confirmed'},{approvalStatus:'approved'},{switchStatus:'canceled'},{switchState:'canceled'},{type:'anomaly'},{checklistItems:[{receiverResult:'ng'}]},{checklistItems:[{receiverResult:''}]}]){
  ctx.latest=change===null?null:{...base(),...change};const n=writes.length;
  await assert.rejects(ctx.saveReceiverStamp('fixture','対応者',valid));assert.equal(writes.length,n);
 }
 assert.equal(ctx.actualSwitchLabel(base()),'未記録');
 new vm.SourceTextModule(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
 console.log('PASS actual switch: date/time validation, midnight, minute precision, atomic stamp, current-stage/check guards, planned values untouched, legacy missing values and module syntax. No live writes.');
}
async function fixture(){
 const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
 const record={...base(),occurrenceDate:null,planneddepartment:'品質',department:'1G',createdBy:'作成者',createdAtLocal:'2026-10-08T08:00:00+09:00',senderApprovedBy:'承認者',senderApprovedAt:'2026-10-08T08:30:00+09:00',processName:'プレス',serialNo:'7089',lineName:'プレスA',category:'設備',content:'センサー交換後の初品確認'};
 const workflow=slice('    function isQrWorkflow','    window.setWorkflowCommentDraft');
 const stamps=slice('    window.approveSender =','    function createQrDataUrl');
 const ticket=slice('    function hasActualDisplayDate','    function escapeHtml')+slice('    function renderChangeTicket','    const todayCardQrCache');
 const escape=slice('    function escapeHtml','    function csvEscape');
 const buildUrl=slice('    function buildProductionDateUrl','    function updatePlanDateMode');
 let printHtml='';
 const printContext={window:{open:()=>({document:{body:{},open(){},write:value=>printHtml=value,close(){}},closed:false})},Map,Set,Date,
  isUnplannedPostcheck:i=>i?.workflowKind==='unplanned_postcheck_v1',getRecordChecklist:i=>i.checklistItems,getProposalDate:()=> '2026-10-08',APPROVAL_STAGES:['draft','sender_approved','receiver_confirmed','approved'],
  buildWorkflowUrl:()=> 'https://example.com/check',buildProductionDateUrl:()=> 'https://example.com/date',
  createQrDataUrl:async()=> 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1sAAAAASUVORK5CYII=',console};
 vm.createContext(printContext);
 vm.runInContext(core+escape+slice('    function workflowStampEntries','    function readStampName')+ticket+slice('    window.printChangeCard =','    function showDetail'),printContext);
 await printContext.window.printChangeCard({...record,...valid});
 printHtml=printHtml.replace('window.print();','');
 assert.equal((printHtml.match(/実際の切替日時：/g)||[]).length,2);
 assert.equal((printHtml.match(/2026-10-08 09:15/g)||[]).length,4);
 const script=`let currentDetailItem=${JSON.stringify(record)},quickApprovalId=null,quickApprovalReceipt=null;const screens={quickApproval:{style:{display:'none'}}};const workflowCommentDrafts=new Map(),workflowCommentSaves=new Set();
 const WORKFLOW_APP_URL='https://miyama-kogyo.github.io/apps/changepoint.html';
 const getRecordChecklist=i=>i.checklistItems;const updateActorNameButton=()=>{};const getProposalDate=()=> '2026-10-08';
 const testStatus=document.createElement('p');testStatus.id='testStatus';document.querySelector('.modal-content').append(testStatus);
 window.alert=message=>{testStatus.textContent=message;};window.confirm=()=>true;
 const db={},doc=(_,c,id)=>({id}),serverTimestamp=()=>new Date();
 let latest=currentDetailItem;const runTransaction=async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>latest}),update:(_,data)=>{latest={...latest,...data};document.getElementById('savedPayload').textContent=JSON.stringify(data);}});
 const updateDoc=async(_,data)=>{latest={...latest,...data};};
 ${escape}${buildUrl}${core.replace(slice('    function approvalStatusOf','    function renderApprovalChecklist'),'')}${workflow}${stamps}${ticket}
 window.setWorkflowCommentDraft=()=>{};window.saveWorkflowComment=()=>{};
 window.setApprovalResult=async(key,role,result)=>{currentDetailItem={...currentDetailItem,checklistItems:currentDetailItem.checklistItems.map(x=>({...x,receiverResult:result}))};latest=currentDetailItem;renderApprovalWorkflow(currentDetailItem);};
 document.getElementById('mode').onchange=e=>{document.getElementById('detailModal').classList.toggle('qr-workflow',e.target.value==='qr');renderApprovalWorkflow(currentDetailItem);};
 isQrWorkflow=()=>document.getElementById('mode').value==='qr';
 document.getElementById('printPreview').onclick=()=>{const frame=document.createElement('iframe');frame.title='印刷レイアウト確認';frame.style='width:800px;height:1100px;border:0';frame.srcdoc=${JSON.stringify(printHtml).replace(/<\//g,'<\\/')};document.getElementById('preview').replaceChildren(frame);};
 renderApprovalWorkflow(currentDetailItem);`;
 fs.writeFileSync('outputs/actual-switch-fixture.html',`<!doctype html><html lang="ja"><meta charset="utf-8"><title>切替日時 検証用（保存は模擬）</title><style>${css}\n.fixture-toolbar{position:fixed;z-index:5000;top:0;left:0;background:white;padding:4px;font-size:12px}#detailModal{padding-top:38px}#detailModal .modal-content{height:calc(100dvh - 40px);max-height:calc(100dvh - 40px)}#preview{position:relative;background:white;z-index:5001}</style><div class="fixture-toolbar"><label>画面<select id="mode"><option value="qr">QR</option><option value="normal">通常</option></select></label><button id="printPreview">カード確認</button></div><div id="detailModal" class="modal active qr-workflow"><div class="modal-content"><h2 style="padding:16px">チェック・承認</h2><div class="qr-basic" style="margin:16px"><div><span>実施日</span><strong>未定</strong></div><div><span>工程</span><strong>プレス</strong></div><div><span>整理No</span><strong>7089</strong></div><div class="qr-basic-content"><span>変化点内容</span><p>センサー交換後の初品確認</p></div></div><div id="approvalWorkflow"></div><pre id="savedPayload" hidden></pre></div></div><div id="preview"></div><script>${script}</script></html>`);
 console.log('Created outputs/actual-switch-fixture.html (offline, mocked database).');
}
unit().then(fixture).catch(e=>{console.error(e);process.exitCode=1});

const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':`${__dirname}/../../changepoint.html`,'utf8');
const part=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const fields={planDepartment:'Sender',planDepartmentOccur:'Receiver',planType:'planned',planCategory:'Equipment',planLineName:'Line A',planProcessName:'Process',planSerialNo:'1234',planContent:'Test change',planDate:'2026-10-20'};
const elements=new Map(), events=[],alerts=[],writes=[];
function element(id){
  if(!elements.has(id))elements.set(id,{value:fields[id]||'',innerHTML:'',style:{},disabled:false,checked:false,hidden:true,
    addEventListener(type,handler){this[type]=handler;},reset(){events.push('reset');},
    showModal(){this.open=true;events.push('dialog');},close(){this.open=false;}});
  return elements.get(id);
}
let saveFails=false,releaseSave,waitSave=false;
const ctx={console,window:{},document:{getElementById:element},auth:{currentUser:{}},db:{},
  masterDepartments:['Sender','Receiver','Extra'],deptDocs:[{name:'Sender',distributionEmail:'s@example.com'},{name:'Receiver',distributionEmail:'r@example.com'},{name:'Extra'}],
  parseDepartmentEmails:value=>value?value.split(','):[],escapeAttr:String,escapeHtml:String,
  getActorName:()=>'Creator',buildRecordChecklist:()=>[{label:'Check'}],plannedExcludedChecklist:new Map(),plannedCustomChecklist:[],
  ymdLocal:()=> '2026-10-08',serverTimestamp:()=>({server:true}),collection:()=>({}),selectedFile:null,
  addDoc:async(_,data)=>{writes.push(data);if(waitSave)await new Promise(r=>releaseSave=r);if(saveFails)throw Error('save failed');events.push('saved');return{id:'new-record'};},
  alert:m=>alerts.push(m),lastRegisteredPlanned:null,lastDetailHtmlUrl:null,changepointData:[],
  setExportButtonEnabled(){events.push('export');},updatePlanDateMode(){},renderPlanCustomChecklist(){},renderPlanChecklistPreview(){}};
vm.createContext(ctx);
vm.runInContext(part('    const additionalDistributionDepartments =','    function showConfirmDialog()'),ctx);
vm.runInContext(part('    let registrationSaving =','    function renderPlannedHistory()'),ctx);
vm.runInContext(part('    function setupPlannedForm()','    const additionalDistributionDepartments ='),ctx);
vm.runInContext(part('    window.printChangeCard =','    function showDetail('),ctx);
ctx.setupPlannedForm();
(async()=>{
  assert.deepEqual(Array.from(ctx.selectedDistributionDepartments()),['Sender','Receiver']);
  ctx.renderDistributionDepartments();
  assert.match(element('planDistributionDepartments').innerHTML,/value="Sender" checked disabled/);
  assert.match(element('planDistributionDepartments').innerHTML,/展開先アドレス未設定/);
  element('planDistributionDepartments').change({target:{type:'checkbox',disabled:false,value:'Extra',checked:true}});
  assert.deepEqual(Array.from(ctx.selectedDistributionDepartments()),['Sender','Receiver','Extra']);
  element('planDepartmentOccur').value='Sender';ctx.renderDistributionDepartments();
  assert.deepEqual(Array.from(ctx.selectedDistributionDepartments()),['Sender','Extra']);
  element('planDepartmentOccur').value='Receiver';
  saveFails=true;await ctx.executeRegistration();assert.equal(events.includes('dialog'),false);assert.equal(events.includes('reset'),false);assert.equal(element('btnRegisterPlanned').disabled,false);
  saveFails=false;waitSave=true;const saving=ctx.executeRegistration();await ctx.executeRegistration();assert.equal(writes.length,2,'double click does not duplicate writes');
  releaseSave();await saving;waitSave=false;
  assert.equal(writes[1].distributionRequestedAt.server,true);assert.deepEqual(Array.from(writes[1].distributionDepartments),['Sender','Receiver','Extra']);
  assert.ok(events.indexOf('saved')<events.indexOf('dialog'));assert.equal(ctx.lastRegisteredPlanned.docId,'new-record');
  assert.deepEqual(Array.from(ctx.selectedDistributionDepartments()),['Sender','Receiver'],'optional selection resets');
  const popup={closed:false,document:{body:{},open(){},write(text){this.html=text;},close(){}},close(){this.closed=true;}};
  ctx.window.open=()=>{events.push('popup');return popup;};
  ctx.buildWorkflowUrl=id=>'https://example.test/?changepointId='+id;
  ctx.buildProductionDateUrl=id=>'https://example.test/?productionDateId='+id;
  ctx.createQrDataUrl=async url=>{assert.equal(events.at(-1),'popup','popup opens before async QR to retain click activation');return url;};
  ctx.renderChangeTicket=(item,copy)=>`<article class="ticket">${item._id} ${copy}</article>`;
  ctx.currentDetailItem={_id:'old-record',type:'planned'};
  await element('btnPrintRegistered').click();
  assert.match(popup.document.html,/new-record 原本/);assert.match(popup.document.html,/new-record コピー/);assert.ok(!popup.document.html.includes('old-record'));assert.match(popup.document.html,/window.print\(\)/);assert.equal(element('registrationPrintDialog').open,false);
  element('registrationPrintDialog').showModal();ctx.window.open=()=>null;await element('btnPrintRegistered').click();assert.equal(element('registrationPrintDialog').open,true,'blocked popup can retry without registering again');
  assert.equal(writes.length,2);
  ctx.window.open=()=>popup;ctx.createQrDataUrl=async()=>{throw Error('expected QR error');};
  await element('btnPrintRegistered').click();assert.equal(popup.closed,true);assert.equal(element('registrationPrintDialog').open,true);assert.equal(element('btnPrintRegistered').disabled,false);
  assert.ok(html.includes('変化点カードを印刷して現場リーダーへ渡してください'));
  assert.ok(!part('    async function executeRegistration()','    function renderPlannedHistory()').includes('openMailDraft'));
  console.log('PASS: mandatory and optional distribution; atomic registration; save errors and duplicate clicks; print guidance; correct new record; popup timing/failure/retry. No real data writes or printing.');
})().catch(e=>{console.error(e);process.exitCode=1;});

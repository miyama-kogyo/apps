const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(process.argv[2] || (fs.existsSync('changepoint.html') ? 'changepoint.html' : '変化点管理システム.html'),'utf8');
const context={masterChecklistFor:()=>[],window:{},console,serverTimestamp:()=> 'server-time',db:{},doc:()=>({}),alert:message=>{throw Error(message);},updateReceiverStampReadiness(){},renderApprovalWorkflow(){}};
vm.createContext(context);
const load=(start,end)=>vm.runInContext(html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start))),context);
load('    function normalizeChecklistKeys(', '    function renderPlanChecklistPreview(');
load('    const APPROVAL_STAGES =', '    function renderApprovalChecklist(');
load('    function validateActualSwitch(', '    function isQrWorkflow(');
load('    window.setApprovalResult =', '    window.toggleApprovalCheck =');
context.boardCompleted=item=>item.approvalStatus==='approved'||item.switchStatus==='completed';
context.boardCanceled=item=>item.switchStatus==='canceled';
const original={type:'planned',approvalStatus:'sender_approved',switchStatus:'scheduled',senderApprovedBy:'Boss',actualSwitchDate:'2026-11-24',actualSwitchTime:'01:50',checklistItems:[{key:'master_first',masterId:'first',receiverChecked:true,receiverResult:'ok'},{masterId:'missing',label:'Unkeyed check',receiverChecked:false,receiverResult:''}]};
const normalize=items=>JSON.parse(JSON.stringify(context.normalizeChecklistKeys(items)));
assert.equal(normalize(original.checklistItems)[1].key,'master_missing');
assert(!original.checklistItems[1].key);
for(const inputs of [[{},{},{key:'legacy_check_0'}],[{key:'same'},{key:'same'},{key:'  '},{key:123}],[{key:'master_a'},{masterId:'a'}]]){
 const normalized=normalize(inputs);assert.equal(new Set(normalized.map(x=>x.key)).size,inputs.length);assert(normalized.every(x=>typeof x.key==='string'&&x.key.trim()));assert.deepEqual(normalize(normalized),normalized);
}
let stored=structuredClone(original),writes=[];
context.currentDetailItem={...stored,_id:'test'};
context.runTransaction=async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>structuredClone(stored)}),update:(_,fields)=>{writes.push(fields);stored={...stored,...JSON.parse(JSON.stringify(fields))};}});
(async()=>{
 assert.equal(context.allRoleChecksDone(context.getRecordChecklist(stored),'receiver'),false);
 await assert.rejects(()=>context.saveReceiverStamp('test','Worker',{actualSwitchDate:'2026-11-24',actualSwitchTime:'01:50'}));
 assert.equal(writes.length,0);
 await context.window.setApprovalResult('master_missing','receiver','ok');
 assert.equal(stored.checklistItems[1].receiverResult,'ok');assert.equal(stored.checklistItems[1].key,'master_missing');
 assert.equal(stored.checklistItems[0].receiverResult,'ok');assert.equal(stored.approvalStatus,'sender_approved');assert.equal(stored.senderApprovedBy,'Boss');
 assert(context.allRoleChecksDone(context.getRecordChecklist(stored),'receiver'));
 await context.saveReceiverStamp('test','Worker',{actualSwitchDate:'2026-11-24',actualSwitchTime:'01:50'});
 assert.equal(stored.approvalStatus,'receiver_confirmed');assert.equal(stored.receiverConfirmedBy,'Worker');assert.equal(stored.senderApprovedBy,'Boss');
 assert(!stored.receiverApprovedAt);assert.equal(stored.actualSwitchTime,'01:50');
 const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]+['"];?/gm,'');new vm.Script(script);
 console.log('PASS missing/blank/duplicate keys, stable IDs, no source mutation, real check-save + responder-stamp handlers (mock DB), approval preservation, JS syntax. No production writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});

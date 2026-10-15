const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':'changepoint.html','utf8');
const slice=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j)};
const ctx={Date,Map,Set,window:{},db:{},doc:(_,c,id)=>({id}),serverTimestamp:()=> 'SERVER',writes:[]};
ctx.runTransaction=async(_,fn)=>fn({get:async()=>({exists:()=>!!ctx.latest,data:()=>ctx.latest}),update:(_,p)=>{ctx.writes.push(p);ctx.latest={...ctx.latest,...p}}});
vm.createContext(ctx);
vm.runInContext(slice('    function canQualityCheck','    function renderWorkflowCheck')+slice('    function boardCompleted','    function boardTracked'),ctx);
async function main(){
 assert(!html.includes('bulkUnplanned'));
 assert(!html.includes('saveUnplannedRecord'));
 assert(!html.includes('unplannedCheckForm'));
 const base={type:'sudden',content:'Test',department:'1G',postCheckRevision:0,checklistItems:[{key:'old',receiverResult:'ng'}],evidenceAttachments:[{id:'evidence'}],actualSwitchDate:'2026-10-12'};
 for(const workflowKind of [undefined,'unplanned_postcheck_v1','unplanned_response_v2']){
  ctx.latest={...base,workflowKind,approvalStatus:'post_check'};
  const old={...ctx.latest};await ctx.approveUnplannedRecord('x',0,'品質',old);
  assert.equal(ctx.latest.qualityCheckedBy,'品質');assert.equal(ctx.latest.qualityCheckedAt,'SERVER');
  assert.equal(ctx.latest.switchStatus,'completed');assert.equal(ctx.latest.approvalStatus,'approved');
  assert.equal(ctx.latest.checklistItems,base.checklistItems);assert.equal(ctx.latest.evidenceAttachments,base.evidenceAttachments);
  assert.equal(ctx.latest.actualSwitchDate,base.actualSwitchDate);assert.equal(ctx.latest.postCheckedBy,undefined);
  await assert.rejects(ctx.approveUnplannedRecord('x',0,'品質',old));
 }
 for(const patch of [{type:'planned'},{switchStatus:'canceled'},{switchStatus:'completed'},{postCheckRevision:2}]){
  ctx.latest={...base,...patch};const count=ctx.writes.length;
  await assert.rejects(ctx.approveUnplannedRecord('x',0,'品質',base));assert.equal(ctx.writes.length,count);
 }
 for(const who of ['', ' ', 'x'.repeat(81)]){ctx.latest={...base};await assert.rejects(ctx.approveUnplannedRecord('x',0,who,base));}
 ctx.latest=null;await assert.rejects(ctx.approveUnplannedRecord('x',0,'品質',base));
 ctx.latest={...base,content:'Changed'};await assert.rejects(ctx.approveUnplannedRecord('x',0,'品質',base));
 console.log('PASS unplanned quality check: no bulk or responder writes, historical data preserved, guards and atomic completion.');
}
main().catch(e=>{console.error(e);process.exitCode=1});

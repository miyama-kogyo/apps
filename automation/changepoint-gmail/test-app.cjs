const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':`${__dirname}/../../changepoint.html`,'utf8');
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(match[1].includes('src='))continue;
  if(match[1].includes('module'))new vm.SourceTextModule(match[2]);else new vm.Script(match[2]);
}
const start=html.indexOf('    function parseDepartmentEmails(');
const end=html.indexOf('    window.deleteMaster =',start);
let replies=[],writes=[],messages=[];
const ctx={window:{},deptDocs:[{id:'test',name:'Dept'}],prompt:()=>replies.shift(),alert:m=>messages.push(m),console,
  db:{},doc:(_, ...path)=>path,serverTimestamp:()=>'SERVER_TIME',getActorName:()=>'Actor',
  updateDoc:async(ref,payload)=>writes.push({ref,payload}),loadMasters:async()=>{},renderMasterTables(){}};
vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
(async()=>{
  for(const answers of [[null],['Boss',null],['','boss@example.com'],['Boss','a@example.com,invalid'],['Boss','invalid'],['Boss',',;']]){
    replies=answers;writes=[];await ctx.window.editDepartmentApprover('test');assert.equal(writes.length,0);
  }
  replies=[' Boss ',' boss@example.com '];await ctx.window.editDepartmentApprover('test');
  assert.equal(writes.length,1);assert.equal(writes[0].ref.join('/'),'masters/department/items/test');assert.equal(writes[0].payload.approverEmail,'boss@example.com');assert.equal(writes[0].payload.approverName,'Boss');
  writes=[];replies=['Boss',''];await ctx.window.editDepartmentApprover('test');assert.equal(writes[0].payload.approverEmail,'');assert.equal(writes[0].payload.approverName,'');
  for(const answer of [null,'bad','a@example.com,bad']){
    replies=[answer];writes=[];await ctx.window.editDepartmentNotification('test');assert.equal(writes.length,0);
  }
  replies=[' notice@example.com '];writes=[];await ctx.window.editDepartmentNotification('test');
  assert.equal(writes[0].payload.notificationEmail,'notice@example.com');assert.ok(!Object.hasOwn(writes[0].payload,'approverEmail'));
  replies=[''];writes=[];await ctx.window.editDepartmentNotification('test');assert.equal(writes[0].payload.notificationEmail,'');
  const mixed=' First@example.com, second@example.com；FIRST@EXAMPLE.COM\nthird@example.com、fourth@example.com';
  const normalized='first@example.com,second@example.com,third@example.com,fourth@example.com';
  replies=['Boss',mixed];writes=[];await ctx.window.editDepartmentApprover('test');assert.equal(writes[0].payload.approverEmail,normalized);
  replies=[mixed];writes=[];await ctx.window.editDepartmentNotification('test');assert.equal(writes[0].payload.notificationEmail,normalized);
  replies=[mixed];writes=[];await ctx.window.editDepartmentDistribution('test');assert.equal(writes[0].payload.distributionEmail,normalized);
  assert.deepEqual(Object.keys(writes[0].payload).sort(),['distributionEmail','updatedAt','updatedBy']);
  for(const answer of [null,'bad','a@example.com,bad']){
    replies=[answer];writes=[];await ctx.window.editDepartmentDistribution('test');assert.equal(writes.length,0);
  }
  replies=[''];writes=[];await ctx.window.editDepartmentDistribution('test');assert.equal(writes[0].payload.distributionEmail,'');
  const fifty=Array.from({length:50},(_,i)=>`user${i}@example.com`).join(',');
  assert.equal(ctx.parseDepartmentEmails(fifty).length,50);assert.throws(()=>ctx.parseDepartmentEmails(fifty+',extra@example.com'));
  assert.throws(()=>ctx.parseDepartmentEmails('Name <name@example.com>'));
  console.log('PASS: multiple recipients accepted for both settings; mixed separators normalized; duplicates removed; invalid and oversized lists rejected.');
  assert.equal((html.match(/approvalRequestedAt: serverTimestamp\(\)/g)||[]).length,2);
  assert.ok(html.includes('receiverConfirmedAt:serverTimestamp(), approvalRequestedAt:serverTimestamp()'));
  console.log('PASS: HTML script syntax; department recipient validation/save/clear; request timestamps on create, edit and responder stamp. Database writes mocked.');
})().catch(e=>{console.error(e);process.exitCode=1;});

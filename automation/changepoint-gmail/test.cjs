const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const source = fs.readFileSync(`${__dirname}/Code.gs`, 'utf8');
const prefix = 'projects/abnreport-fd733/databases/(default)/documents';
const at = '2026-10-08T01:00:00.123456Z';
const record = (overrides = {}) => ({_name:`${prefix}/changepoints/test card`,type:'planned',approvalStatus:'draft',approvalRequestedAt:at,planneddepartment:'Sender',department:'Receiver',createdBy:'Creator',content:'Test only',...overrides});
function encoded(item) {
  return {name:item._name,fields:Object.fromEntries(Object.entries(item).filter(([k])=>k!=='_name').map(([k,v])=>[k,typeof v==='boolean'?{booleanValue:v}:k.endsWith('At')?{timestampValue:v}:{stringValue:v}]))};
}
function setup() {
  const state = {ALLOWED_RECIPIENTS:'sender@example.com,receiver@example.com',START_AT:'2026-10-08T00:00:00Z',ENABLED:'true'};
  const writes = [], sent = [], requests = [], triggers = [];
  const props = {getProperty:k=>state[k]??null,getProperties:()=>({...state}),setProperty(k,v){writes.push(k);state[k]=v;return this;},deleteProperty(k){delete state[k];return this;}};
  const env = {owner:'miyama.firebase@gmail.com',quota:100,records:[record()],lock:true,
    departments:[{_name:'sender',name:'Sender',approverName:'Sender Boss',approverEmail:'sender@example.com',notificationEmail:'origin-notify@example.com'},{_name:'receiver',name:'Receiver',approverName:'Receiver Boss',approverEmail:'receiver@example.com',notificationEmail:'receiver-notify@example.com'}]};
  const ctx = {console:{log(){},warn(){},error(){}},PropertiesService:{getScriptProperties:()=>props},Session:{getEffectiveUser:()=>({getEmail:()=>env.owner})},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),formatDate:d=>d.toISOString()},
    LockService:{getScriptLock:()=>({tryLock:()=>env.lock,releaseLock(){env.released=true;}})},
    MailApp:{getRemainingDailyQuota:()=>env.quota,sendEmail:m=>{sent.push(m);if(env.sendError)throw new Error('uncertain transport');}},
    ScriptApp:{getOAuthToken:()=>'test-token',getProjectTriggers:()=>triggers,deleteTrigger:t=>triggers.splice(triggers.indexOf(t),1),newTrigger:name=>({timeBased:()=>({everyMinutes:n=>({create(){assert.equal(n,5);triggers.push({getHandlerFunction:()=>name});}})})})},
    UrlFetchApp:{fetch(url,options){
      requests.push({url,options});
      assert.equal(options.headers.Authorization,'Bearer test-token');
      assert.ok(['get','post'].includes(options.method));
      let data;
      if(url.includes('/masters/department/items'))data={documents:env.departments.map(encoded)};
      else if(url.endsWith(':runQuery')){
        const query=JSON.parse(options.payload).structuredQuery;
        const field=query.where.fieldFilter.field.fieldPath;
        data=env.records.filter(r=>r[field]&&r[field]>=query.where.fieldFilter.value.timestampValue).map(r=>({document:encoded(r)}));
      }
      else {assert.equal(options.method,'get');const item=env.records.find(r=>url.endsWith(r._name.slice(prefix.length)));data=item?encoded(item):null;}
      return {getResponseCode:()=>data?200:404,getContentText:()=>JSON.stringify(data)};
    }}};
  vm.createContext(ctx);vm.runInContext(source,ctx);
  const jobs=()=>Object.entries(state).filter(([k])=>k.startsWith('job_')).map(([key,v])=>({key,...JSON.parse(v)}));
  return {ctx,state,sent,requests,triggers,writes,env,jobs};
}
let t=setup();
t.ctx.pollApprovalNotifications();
assert.equal(t.sent.length,1);assert.equal(t.sent[0].to,'sender@example.com');
assert.ok(t.sent[0].body.includes('?changepointId=test%20card'));
assert.equal(t.jobs()[0].state,'sent');
assert.ok(t.writes.findIndex(k=>k.startsWith('job_'))<t.writes.indexOf('CURSOR'));
const query=JSON.parse(t.requests.find(r=>r.url.endsWith(':runQuery')).options.payload).structuredQuery;
assert.equal(query.where.fieldFilter.value.timestampValue,t.state.START_AT);
assert.equal(query.orderBy[1].field.fieldPath,'__name__');
t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1);
const nextQuery=JSON.parse(t.requests.filter(r=>r.url.endsWith(':runQuery')&&JSON.parse(r.options.payload).structuredQuery.orderBy[0].field.fieldPath==='approvalRequestedAt').at(-1).options.payload).structuredQuery;
assert.equal(nextQuery.startAt.before,false);assert.equal(nextQuery.startAt.values[0].timestampValue,at);
for (const override of [{approvalStatus:'approved'},{switchStatus:'completed'},{switchState:'canceled'},{type:'sudden'},{activatedAt:at}]) {
  t=setup();t.env.records=[record(override)];t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0);
}
t=setup();t.env.records=[record({approvalStatus:'receiver_confirmed',receiverConfirmedBy:'Responder'})];t.ctx.pollApprovalNotifications();assert.equal(t.sent[0].to,'receiver@example.com');
for(const change of ['deleted','approved','edited']){
  t=setup();t.ctx.collectApprovalRequests();
  if(change==='deleted')t.env.records=[];
  if(change==='approved')t.env.records[0].approvalStatus='approved';
  if(change==='edited')t.env.records[0].approvalRequestedAt='2026-10-08T02:00:00Z';
  t.ctx.processApprovalJobs();assert.equal(t.sent.length,0);assert.equal(t.jobs()[0].state,'skipped');
}
for(const change of ['notAllowed','duplicate','missing']){
  t=setup();
  if(change==='notAllowed')t.state.ALLOWED_RECIPIENTS='receiver@example.com';
  if(change==='duplicate')t.env.departments.push({...t.env.departments[0]});
  if(change==='missing')t.env.departments[0].approverEmail='';
  t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0);assert.equal(t.jobs()[0].state,'pending');assert.ok(t.jobs()[0].nextAttempt);
}
t=setup();t.env.quota=0;t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0);assert.equal(t.jobs()[0].state,'pending');
t.env.quota=1;t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1);
t=setup();t.env.sendError=true;t.ctx.pollApprovalNotifications();assert.equal(t.jobs()[0].state,'uncertain');t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1);
t.state.REVIEW_JOB_KEY=t.jobs()[0].key;t.state.REVIEW_ACTION='sent';t.ctx.resolveUncertainNotification();assert.equal(t.jobs()[0].state,'sent');
t=setup();t.env.owner='different@example.com';assert.throws(()=>t.ctx.startApprovalNotifications());assert.equal(t.triggers.length,0);
t=setup();delete t.state.START_AT;t.ctx.startApprovalNotifications();const start=t.state.START_AT;assert.ok(Date.parse(start));t.ctx.startApprovalNotifications();assert.equal(t.state.START_AT,start);assert.equal(t.triggers.length,1);
t.ctx.stopApprovalNotifications();t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0);assert.equal(t.triggers.length,0);
t=setup();t.env.lock=false;t.ctx.pollApprovalNotifications();assert.equal(t.requests.length,0);
t=setup();t.ctx.collectApprovalRequests();
for(let i=0;i<199;i++)t.state['job_held'+i]=JSON.stringify({state:'uncertain',createdAt:at});
t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1,'full queue must still process existing pending jobs');
t=setup();t.state.job_old=JSON.stringify({state:'sent',finishedAt:'2020-01-01T00:00:00Z'});t.state.job_hold=JSON.stringify({state:'uncertain',finishedAt:'2020-01-01T00:00:00Z'});t.ctx.pruneNotificationJobs();assert.equal(t.state.job_old,undefined);assert.ok(t.state.job_hold);
JSON.parse(fs.readFileSync(`${__dirname}/appsscript.json`,'utf8'));
for(const kind of ['production_date','receiver_approved']){
  t=setup();t.state.ALLOWED_RECIPIENTS+=',origin-notify@example.com';
  const field=kind==='production_date'?'productionDateUpdatedAt':'receiverApprovedAt';
  t.env.records=[record({approvalStatus:'approved',switchStatus:'completed',occurrenceDate:'2026-10-20',[field]:at,productionDateUpdatedBy:'Manager',receiverApprovedBy:'Final Boss'})];
  t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1);assert.equal(t.sent[0].to,'origin-notify@example.com');
  assert.ok(t.sent[0].subject.includes(kind==='production_date'?'生産予定日':'承認完了'));
  assert.ok(t.sent[0].body.includes('2026-10-20'));t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1);
  t=setup();t.state.ALLOWED_RECIPIENTS+=',origin-notify@example.com';
  t.env.records=[record({approvalStatus:'approved',occurrenceDate:'2026-10-20',[field]:at})];
  t.env.departments[0].notificationEmail='';t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0,'never fall back to approver when result address missing');
  t=setup();t.env.records=[record({approvalStatus:'approved',occurrenceDate:'2026-10-20',[field]:at})];
  t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0,'result recipient must be allowlisted');
}
t=setup();t.state.ALLOWED_RECIPIENTS+=',origin-notify@example.com';
t.env.records=[record({approvalStatus:'receiver_confirmed',receiverConfirmedAt:at})];
t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1);assert.equal(t.sent[0].to,'receiver@example.com','responder stamp only requests final approval, does not notify origin');
t=setup();t.state.ALLOWED_RECIPIENTS+=',origin-notify@example.com';
t.env.records=[record({approvalStatus:'sender_approved',occurrenceDate:'2026-10-20',productionDateUpdatedAt:at})];
t.ctx.collectApprovalRequests();t.env.records[0].productionDateUpdatedAt='2026-10-08T02:00:00Z';t.ctx.processApprovalJobs();assert.equal(t.sent.length,0);assert.equal(t.jobs()[0].state,'skipped','old date update superseded');
t.ctx.collectApprovalRequests();t.ctx.processApprovalJobs();assert.equal(t.sent.length,1,'latest production date notified');
for(const kind of ['approval_request','production_date','receiver_approved']){
  t=setup();t.state.ALLOWED_RECIPIENTS+='; second@example.com';
  if(kind==='approval_request')t.env.departments[0].approverEmail=' SENDER@EXAMPLE.COM、second@example.com;sender@example.com';
  else{
    t.state.ALLOWED_RECIPIENTS+=',origin-notify@example.com';
    t.env.departments[0].notificationEmail='ORIGIN-NOTIFY@example.com，second@example.com\norigin-notify@example.com';
    t.env.records=[record({approvalStatus:'approved',occurrenceDate:'2026-10-20',[kind==='production_date'?'productionDateUpdatedAt':'receiverApprovedAt']:at})];
  }
  t.env.quota=1;t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0,'defer whole group when quota insufficient');assert.equal(t.jobs()[0].state,'pending');
  t.env.quota=2;t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1);assert.equal(t.sent[0].to,(kind==='approval_request'?'sender@example.com':'origin-notify@example.com')+',second@example.com');
  t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1,'group is not resent');
}
t=setup();t.state.ALLOWED_RECIPIENTS+=',second@example.com';t.env.departments[0].approverEmail='sender@example.com,second@example.com';t.env.quota=3;
t.env.records=[record(),record({_name:prefix+'/changepoints/another'})];t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1,'quota counts recipients rather than messages');assert.equal(t.jobs().filter(j=>j.state==='pending').length,1);
for(const emails of ['sender@example.com,not-allowed@example.com','sender@example.com,invalid']){
  t=setup();t.env.departments[0].approverEmail=emails;t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0,'invalid or unapproved group is not partially sent');
}
t=setup();t.env.quota=1;t.env.departments[0].approverEmail='sender@example.com,SENDER@example.com';t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1);assert.equal(t.sent[0].to,'sender@example.com');
const fifty=Array.from({length:50},(_,i)=>`user${i}@example.com`).join(',');assert.equal(t.ctx.parseDepartmentEmails(fifty).length,50);assert.throws(()=>t.ctx.parseDepartmentEmails(fifty+',extra@example.com'));
console.log('PASS: multiple-recipient approvals and results; deduplication; whole-group allowlist; quota accounting and defer/retry.');
console.log('PASS: mocked Gmail/Firestore tests; routing, allowlist, stages, cursor, duplicate prevention, stale requests, quotas, uncertain send, owner, trigger lifecycle and queue capacity. No real email or database writes.');

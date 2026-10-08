const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const source = fs.readFileSync(`${__dirname}/Code.gs`, 'utf8');
const prefix = 'projects/abnreport-fd733/databases/(default)/documents';
const at = '2026-10-08T01:00:00.123456Z';
const record = (overrides = {}) => ({_name:`${prefix}/changepoints/test card`,type:'planned',approvalStatus:'draft',approvalRequestedAt:at,planneddepartment:'Sender',department:'Receiver',createdBy:'Creator',content:'Test only',...overrides});
function encoded(item) {
  const encode = (v,k='') => Array.isArray(v)?{arrayValue:{values:v.map(x=>encode(x))}}:typeof v==='boolean'?{booleanValue:v}:k.endsWith('At')?{timestampValue:v}:{stringValue:v};
  return {name:item._name,fields:Object.fromEntries(Object.entries(item).filter(([k])=>k!=='_name').map(([k,v])=>[k,encode(v,k)]))};
}
function setup() {
  const state = {ALLOWED_RECIPIENTS:'sender@example.com,receiver@example.com',START_AT:'2026-10-08T00:00:00Z',ENABLED:'true'};
  const writes = [], sent = [], requests = [], triggers = [];
  const props = {getProperty:k=>state[k]??null,getProperties:()=>({...state}),setProperty(k,v){writes.push(k);state[k]=v;return this;},deleteProperty(k){delete state[k];return this;}};
  const env = {owner:'miyama.firebase@gmail.com',quota:100,records:[record()],lock:true,
    departments:[{_name:'sender',name:'Sender',approverName:'Sender Boss',approverEmail:'sender@example.com',notificationEmail:'origin-notify@example.com'},{_name:'receiver',name:'Receiver',approverName:'Receiver Boss',approverEmail:'receiver@example.com',notificationEmail:'receiver-notify@example.com'}]};
  const ctx = {console:{log(){},warn(){},error(){}},PropertiesService:{getScriptProperties:()=>props},Session:{getEffectiveUser:()=>({getEmail:()=>env.owner})},
    Date:class extends Date { constructor(...args){super(...(args.length?args:[env.now||Date.now()]));} static now(){return env.now?Date.parse(env.now):Date.now();} },
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(s).digest()),formatDate(d,zone,format){
      const jst=new Date(d.getTime()+9*60*60*1000);
      if(format==='yyyy-MM-dd')return jst.toISOString().slice(0,10);
      if(format==='HH')return String(jst.getUTCHours()).padStart(2,'0');
      if(format==='u')return String(jst.getUTCDay()||7);
      return d.toISOString();
    }},
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
        if(query.where.fieldFilter.op==='IN'){
          if(env.reminderQueryError)throw Error('expected reminder query failure');
          const values=query.where.fieldFilter.value.arrayValue.values.map(x=>x.stringValue);
          data=env.records.filter(r=>values.includes(r[field])&&(!query.startAt||r._name>query.startAt.values[0].referenceValue))
            .sort((a,b)=>a._name.localeCompare(b._name)).slice(0,query.limit).map(r=>({document:encoded(r)}));
        }else data=env.records.filter(r=>r[field]&&r[field]>=query.where.fieldFilter.value.timestampValue).map(r=>({document:encoded(r)}));
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
function distributionSetup(overrides={}){
  const t=setup();
  t.env.records=[record({approvalStatus:'approved',distributionRequestedAt:at,distributionDepartments:['Sender','Receiver','Extra'],...overrides})];
  t.env.departments[0].distributionEmail='sender@example.com';
  t.env.departments[1].distributionEmail='receiver@example.com';
  t.env.departments.push({_name:'extra',name:'Extra',distributionEmail:'SENDER@example.com;extra@example.com'});
  t.state.ALLOWED_RECIPIENTS+=',extra@example.com';
  return t;
}
t=distributionSetup();t.ctx.pollApprovalNotifications();
assert.equal(t.sent.length,1);assert.equal(t.sent[0].to,'sender@example.com,receiver@example.com,extra@example.com');
assert.ok(t.sent[0].subject.includes('変化点展開'));assert.ok(t.sent[0].body.includes('現場リーダー'));
assert.ok(t.state.CURSOR_DISTRIBUTION);t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1);
t=distributionSetup({distributionDepartments:['Extra']});t.ctx.pollApprovalNotifications();assert.equal(t.sent[0].to,'sender@example.com,receiver@example.com,extra@example.com','mandatory departments enforced by worker too');
for(const change of ['missing','notAllowed','duplicate','malformed','emptyEntry','quota']){
  t=distributionSetup();
  if(change==='missing')t.env.departments[1].distributionEmail='';
  if(change==='notAllowed')t.state.ALLOWED_RECIPIENTS='sender@example.com';
  if(change==='duplicate')t.env.departments.push({...t.env.departments[0]});
  if(change==='malformed')t.env.records[0].distributionDepartments='Sender';
  if(change==='emptyEntry')t.env.records[0].distributionDepartments=[''];
  if(change==='quota')t.env.quota=2;
  t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0,change+' never sends partial distribution');assert.equal(t.jobs()[0].state,'pending');
}
t=distributionSetup({switchStatus:'completed'});t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1);
t=distributionSetup({switchStatus:'canceled'});t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0);
t=distributionSetup({distributionRequestedAt:undefined});t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0,'legacy records never queued');
t=distributionSetup({distributionRequestedAt:'2020-01-01T00:00:00Z'});t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0,'pre-start records never queued');
t=distributionSetup({approvalStatus:'sender_approved'});t.ctx.collectApprovalRequests();t.env.records[0].approvalStatus='approved';t.ctx.processApprovalJobs();assert.equal(t.sent.length,1,'approval advancing does not lose distribution');
t=distributionSetup();t.ctx.collectApprovalRequests();t.env.records=[];t.ctx.processApprovalJobs();assert.equal(t.jobs()[0].state,'skipped');
console.log('PASS: registration distribution; mandatory departments; all-recipient safety; array decoding; no historical flood; deduplication and independent cursor.');
function reminderSetup(stage='sender_approved'){
  const t=setup();t.env.now='2026-10-09T00:05:00Z';
  Object.assign(t.state,{REMINDERS_ENABLED:'true',REMINDERS_START_DAY:'2026-10-09',REMINDER_WEEKDAYS_ONLY:'false'});
  t.env.records=[record({approvalStatus:stage,approvalRequestedAt:undefined,occurrenceDate:'2026-10-08'})];
  t.env.departments[1].distributionEmail='receiver@example.com';
  return t;
}
for(const stage of ['draft','sender_approved','receiver_confirmed']){
  t=reminderSetup(stage);t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1);
  assert.equal(t.sent[0].to,stage==='draft'?'sender@example.com':'receiver@example.com');
  assert.ok(t.sent[0].subject.includes('状況確認'));assert.ok(t.sent[0].body.includes('?changepointId=test%20card'));
  t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1,'only once per card per day');
  t.env.records[0].approvalStatus='receiver_confirmed';t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1,'same-day stage advance does not resend');
  t.env.now='2026-10-10T00:05:00Z';t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,2,'next day repeats while unfinished');
  t.env.records[0].approvalStatus='approved';t.env.now='2026-10-11T00:05:00Z';t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,2,'final approval stops reminders');
}
for(const overrides of [{approvalStatus:'approved'},{approvalStatus:undefined},{switchStatus:'canceled'},{switchState:'completed'},{activatedAt:at},{occurrenceDate:null},{occurrenceDate:'2026-10-09'},{occurrenceDate:'2026-10-20'},{occurrenceDate:'2026-02-30'},{type:'sudden',workflowManaged:false}]){
  t=reminderSetup();Object.assign(t.env.records[0],overrides);t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0,JSON.stringify(overrides));
}
t=reminderSetup();t.env.now='2026-10-08T23:59:00Z';t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0,'not before 9 JST');
t=reminderSetup();t.env.now='2026-10-08T00:05:00Z';t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0,'not before configured start day');
t=reminderSetup();t.env.now='2026-10-10T00:05:00Z';t.state.REMINDER_WEEKDAYS_ONLY='true';t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0,'weekday-only mode skips Saturday');
t=reminderSetup();t.ctx.disableDailyOverdueReminders();t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0);
t=reminderSetup();delete t.state.REMINDERS_START_DAY;t.ctx.enableDailyOverdueReminders();assert.equal(t.state.REMINDERS_START_DAY,'2026-10-10');assert.equal(t.state.START_AT,'2026-10-08T00:00:00Z');assert.equal(t.triggers.length,0,'reuse existing trigger');
t=reminderSetup();delete t.state.REMINDER_WEEKDAYS_ONLY;t.ctx.enableDailyOverdueReminders();assert.equal(t.state.REMINDER_WEEKDAYS_ONLY,'true','weekdays are the default');
t=reminderSetup('draft');t.ctx.collectOverdueReminders();t.env.records[0].approvalStatus='sender_approved';t.ctx.processApprovalJobs();assert.equal(t.sent[0].to,'receiver@example.com','route to current blocker at send time');
for(const change of ['completed','deleted','rescheduled']){
  t=reminderSetup();t.ctx.collectOverdueReminders();
  if(change==='completed')t.env.records[0].approvalStatus='approved';
  if(change==='deleted')t.env.records=[];
  if(change==='rescheduled')t.env.records[0].occurrenceDate='2026-10-20';
  t.ctx.processApprovalJobs();assert.equal(t.sent.length,0);assert.equal(t.jobs()[0].state,'skipped');
}
for(const addresses of ['', 'receiver@example.com,unknown@example.com','receiver@example.com,invalid']){
  t=reminderSetup();t.env.departments[1].distributionEmail=addresses;t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,0);assert.equal(t.jobs()[0].state,'pending');
  t.env.now='2026-10-10T00:05:00Z';t.ctx.pollApprovalNotifications();assert.equal(t.jobs().filter(j=>j.state==='pending').length,1,'old unsent reminders do not pile up');
}
t=reminderSetup();t.env.sendError=true;t.ctx.pollApprovalNotifications();assert.equal(t.jobs()[0].state,'uncertain');t.env.now='2026-10-10T00:05:00Z';t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1,'uncertain sends block following-day reminder until manual review');
t=reminderSetup();t.env.records=Array.from({length:85},(_,i)=>record({_name:prefix+'/changepoints/reminder'+String(i).padStart(3,'0'),approvalStatus:'sender_approved',approvalRequestedAt:undefined,occurrenceDate:'2026-10-08'}));
for(let i=0;i<10;i++)t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,85,'daily scan paginates all pending records');assert.equal(new Set(t.sent.map(m=>m.body)).size,85);
assert.equal(JSON.parse(t.state.REMINDER_SCAN).done,true);
t=reminderSetup('draft');t.env.records[0].approvalRequestedAt=at;t.env.reminderQueryError=true;t.ctx.pollApprovalNotifications();assert.equal(t.sent.length,1,'reminder collection failure does not stop existing approval mail');assert.ok(t.state.REMINDER_LAST_ERROR);assert.equal(t.state.LAST_ERROR,undefined);
console.log('PASS: daily overdue reminders; JST schedule; current-stage routing; direct links; same-day dedup; next-day repeat; completion/reschedule/cancel stop; pending expiry; uncertain hold; pagination.');
console.log('PASS: mocked Gmail/Firestore tests; routing, allowlist, stages, cursor, duplicate prevention, stale requests, quotas, uncertain send, owner, trigger lifecycle and queue capacity. No real email or database writes.');

const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('crypto');
const code=fs.readFileSync(__dirname+'/DeviceRequestNotification.gs','utf8');
function setup(){
 const props={},sent=[],triggers=[];let rows=[],docs={},quota=30,fail=false;
 const p={getProperty:k=>props[k]??null,setProperty:(k,v)=>props[k]=v,getProperties:()=>({...props}),deleteProperty:k=>delete props[k]};
 const c={console:{log(){}},Date,verifyNotifierOwner(){},NOTIFIER:{project:'test'},notifierProperties:()=>p,LockService:{getScriptLock:()=>({waitLock(){},tryLock:()=>true,releaseLock(){}})},ScriptApp:{getProjectTriggers:()=>triggers,newTrigger:name=>({timeBased:()=>({everyMinutes:n=>({create:()=>triggers.push({getHandlerFunction:()=>name})})})})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>crypto.createHash('sha256').update(s).digest(),base64EncodeWebSafe:b=>b.toString('base64url'),formatDate:d=>d.toISOString()},MailApp:{getRemainingDailyQuota:()=>quota,sendEmail:m=>{sent.push(m);if(fail)throw Error('unknown');}},decodeDocument:d=>({...d}),firestoreRead:(path,body)=>{if(body){const q=body.structuredQuery;assert.equal(q.from[0].collectionId,'deviceRequests');return rows;}return docs[path]||null;}};
 vm.createContext(c);vm.runInContext(code,c);c.enableDeviceRequestNotifications();
 function add(id,status='pending'){const name='projects/test/databases/(default)/documents/deviceRequests/'+id;const item={_name:name,name,requestedAt:props.DEVICE_NOTICE_START,status,applicantName:'試験担当',deviceId:'device-1',deviceName:'PC0001',userEmail:'test@example.test'};rows=[{document:item}];docs['/deviceRequests/'+id]=item;return item;}
 return {c,props,sent,triggers,add,set quota(v){quota=v;},set fail(v){fail=v;},set rows(v){rows=v;},docs};
}
{
 const t=setup();t.c.enableDeviceRequestNotifications();assert.equal(t.triggers.length,1);t.add('one');t.c.pollDeviceRequestNotifications();assert.equal(t.sent.length,1);assert.equal(t.sent[0].to,'ktakada@miyama-unitec.co.jp,ktachino@miyama-unitec.co.jp,mii@miyama-unitec.co.jp');assert.match(t.sent[0].body,/PC0001/);t.c.pollDeviceRequestNotifications();assert.equal(t.sent.length,1);
}
for(const status of ['approved','rejected']){const t=setup();t.add(status,status);t.c.pollDeviceRequestNotifications();assert.equal(t.sent.length,0);}
{const t=setup();t.add('quota');t.quota=2;t.c.pollDeviceRequestNotifications();assert.equal(t.sent.length,0);t.quota=30;t.c.pollDeviceRequestNotifications();assert.equal(t.sent.length,1);}
{const t=setup();t.add('failure');t.fail=true;assert.throws(()=>t.c.pollDeviceRequestNotifications(),/unknown/);t.fail=false;t.c.pollDeviceRequestNotifications();assert.equal(t.sent.length,1);assert.ok(Object.values(t.props).some(v=>v.includes('uncertain')));}
{const t=setup();t.add('deleted');t.c.collectDeviceNoticeJobs();delete t.docs['/deviceRequests/deleted'];t.c.processDeviceNoticeJobs();assert.equal(t.sent.length,0);}
{const t=setup();t.c.firestoreRead=()=>{throw Error('fetch failed');};assert.throws(()=>t.c.pollDeviceRequestNotifications(),/fetch failed/);assert.equal(t.sent.length,0);assert.equal(t.props.DEVICE_NOTICE_CURSOR,undefined);}
{const t=setup();t.props.DEVICE_NOTICE_RECIPIENTS='other@example.test';assert.throws(()=>t.c.pollDeviceRequestNotifications(),/宛先/);assert.equal(t.sent.length,0);}
{const t=setup();const item=t.add('old');item.requestedAt='2020-01-01T00:00:00Z';t.c.pollDeviceRequestNotifications();assert.equal(t.sent.length,0);}
console.log('PASS: recipients, new requests, duplicates, completed/deleted/old requests, quota, uncertain send, fetch failure, trigger preservation');

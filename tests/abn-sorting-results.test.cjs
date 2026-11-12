const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'assets/abn-sorting-results.js'),'utf8');
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const input={date:'2026-11-12',operator:'担当者',lotNo:'LOT-1',quantity:'100',goodQuantity:'97',badQuantity:'3',notes:'キズ品を除去'};
async function fixture(){
  const {createSortingRepository}=await modulePromise;
  const original={serialNo:'7556',status:'complete',anomalyContent:'異常内容',mfgPhotoUrls:['https://example.com/photo.png'],rootCauseAction:'処置内容'};
  const store=new Map([['anomalies/case-1',structuredClone(original)]]),writes=[];
  const auth={currentUser:{uid:'alice',email:'alice@example.test'}};
  let seq=0,lock=Promise.resolve(),failAudit=false;
  const snapshot=ref=>({exists:()=>store.has(ref),data:()=>structuredClone(store.get(ref))});
  const repository=createSortingRepository({db:'db',auth,doc:(...args)=>args.length===1?args[0]+'/'+(++seq):args.slice(1).join('/'),collection:(_,name)=>name,getDoc:async ref=>snapshot(ref),FieldPath:class{constructor(...parts){this.parts=parts;}},serverTimestamp:()=>({seconds:123456789}),deviceId:'test-device',runTransaction:(_,fn)=>{
    const operation=lock.then(async()=>{
      const staged=[];
      const result=await fn({get:async ref=>snapshot(ref),update:(ref,field,value)=>staged.push({type:'update',ref,field,value}),set:(ref,value)=>{if(failAudit)throw Error('audit denied');staged.push({type:'set',ref,value});}});
      for(const op of staged){writes.push(op);if(op.type==='set')store.set(op.ref,op.value);else{const data=store.get(op.ref);assert.deepEqual(op.field.parts.slice(0,1),['sortingResults']);data.sortingResults??={};data.sortingResults[op.field.parts[1]]=structuredClone(op.value);}}
      return result;
    });lock=operation.catch(()=>{});return operation;
  }});
  return {repository,store,writes,original,auth,set failAudit(value){failAudit=value;}};
}
test('counts are required nonnegative integers and must reconcile',async()=>{
  const {validateSortingResult}=await modulePromise;
  assert.deepEqual(validateSortingResult(input),{...input,quantity:100,goodQuantity:97,badQuantity:3});
  for(const change of [{quantity:''},{goodQuantity:''},{badQuantity:'-1'},{badQuantity:'1.5'},{quantity:'1e2'},{quantity:'0',goodQuantity:'0',badQuantity:'0'},{quantity:'101'},{operator:' '},{date:'2026-02-30'},{notes:'x'.repeat(2001)}])assert.throws(()=>validateSortingResult({...input,...change}));
  assert.equal(validateSortingResult({...input,date:'2028-02-29',goodQuantity:'100',badQuantity:'0'}).badQuantity,0);
});
test('multiple appends preserve the anomaly and all previous results',async()=>{
  const f=await fixture();
  await f.repository.save({anomalyId:'case-1',resultId:'r1',revision:null,operationId:'op1',input});
  await f.repository.save({anomalyId:'case-1',resultId:'r2',revision:null,operationId:'op2',input:{...input,lotNo:'LOT-2'}});
  const saved=f.store.get('anomalies/case-1');
  for(const key of Object.keys(f.original))assert.deepEqual(saved[key],f.original[key]);
  assert.equal(Object.keys(saved.sortingResults).length,2);
  const {sortingTotals}=await modulePromise;assert.deepEqual(sortingTotals(saved),{count:2,quantity:200,goodQuantity:194,badQuantity:6});
  assert.equal(f.writes.filter(w=>w.type==='set').length,2);
  assert.equal(f.writes.find(w=>w.type==='set').value.action,'anomaly_sorting_add');
});
test('corrections retain creator and store before/after in the atomic audit',async()=>{
  const f=await fixture();
  await f.repository.save({anomalyId:'case-1',resultId:'r1',revision:null,operationId:'op1',input});
  f.auth.currentUser={uid:'bob',email:'bob@example.test'};
  await f.repository.save({anomalyId:'case-1',resultId:'r1',revision:1,operationId:'op2',input:{...input,goodQuantity:'95',badQuantity:'5'}});
  const row=f.store.get('anomalies/case-1').sortingResults.r1;
  assert.equal(row.revision,2);assert.equal(row.createdBy.uid,'alice');assert.equal(row.updatedBy.uid,'bob');
  const audit=f.writes.filter(w=>w.type==='set').at(-1).value;
  assert.equal(audit.action,'anomaly_sorting_edit');assert.equal(audit.detail.before.badQuantity,3);assert.equal(audit.detail.after.badQuantity,5);
  await assert.rejects(()=>f.repository.save({anomalyId:'case-1',resultId:'r1',revision:1,operationId:'stale',input}),/別の画面/);
});
test('retrying a confirmed operation does not duplicate its result or audit',async()=>{
  const f=await fixture(),request={anomalyId:'case-1',resultId:'r1',revision:null,operationId:'same-op',input};
  await f.repository.save(request);await f.repository.save(request);
  assert.equal(f.writes.length,2);assert.equal(Object.keys(f.store.get('anomalies/case-1').sortingResults).length,1);
});
test('two writers can append different records without dropping either one',async()=>{
  const f=await fixture();
  const first=f.repository.save({anomalyId:'case-1',resultId:'parallel-1',revision:null,operationId:'op1',input});
  const second=f.repository.save({anomalyId:'case-1',resultId:'parallel-2',revision:null,operationId:'op2',input});
  await first;await second;
  assert.deepEqual(Object.keys(f.store.get('anomalies/case-1').sortingResults).sort(),['parallel-1','parallel-2']);
});
test('the selected Firestore document ID wins over any legacy ID stored in its data',async()=>{
  const f=await fixture();f.store.get('anomalies/case-1')._id='wrong-case';
  assert.equal((await f.repository.load('case-1'))._id,'case-1');
  const saved=await f.repository.save({anomalyId:'case-1',resultId:'r1',revision:null,operationId:'op1',input});
  assert.equal(saved._id,'case-1');assert.equal(f.store.has('anomalies/wrong-case'),false);
});
test('audit rejection, missing anomaly and signed-out user never save a result',async()=>{
  const f=await fixture(),request={anomalyId:'case-1',resultId:'r1',revision:null,operationId:'op1',input};
  f.failAudit=true;await assert.rejects(()=>f.repository.save(request),/audit denied/);assert.deepEqual(f.store.get('anomalies/case-1'),f.original);
  f.failAudit=false;f.store.delete('anomalies/case-1');await assert.rejects(()=>f.repository.save(request),/削除/);assert.equal(f.store.has('anomalies/case-1'),false);
  f.auth.currentUser=null;await assert.rejects(()=>f.repository.save(request),/ログイン/);
});
test('read and CSV output include all entries and escape spreadsheet formulas',async()=>{
  const {sortingEntries,sortingSummary,sortingCsv}=await modulePromise;
  assert.equal(sortingSummary({}),'未記録');assert.deepEqual(sortingEntries({sortingResults:null}),[]);
  const item={serialNo:'7556',sortingResults:{r1:{...input,quantity:100,goodQuantity:97,badQuantity:3,notes:'=1+1',operator:'a,"b"\nc'}}};
  assert.match(sortingSummary(item),/1件.*100.*97.*3/);
  const csv=sortingCsv(item);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=1+1"'));assert.ok(csv.includes('"a,""b""\nc"'));
});
test('integration has history actions and never uses the draft anomaly ID to save selection results',()=>{
  const html=fs.readFileSync(path.join(root,'abnreport.html'),'utf8');
  assert.match(html,/data-sorting="\$\{escapeHtml\(item\._id\)\}"/);
  assert.match(html,/data-sorting="\$\{escapeHtml\(it\._id\)\}"/);
  assert.match(html,/sortingController\.clear\(\)/);
  assert.doesNotMatch(code,/state\.anomalyId|setDoc\(|deleteDoc\(/);
});

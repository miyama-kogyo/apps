const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=__dirname,html=fs.readFileSync(path.join(root,fs.existsSync(path.join(root,'変化点管理システム.html'))?'変化点管理システム.html':'changepoint.html'),'utf8');
const slice=(a,b)=>{const start=html.indexOf(a),end=html.indexOf(b,start);assert(start>=0&&end>start);return html.slice(start,end)};
const source=slice('    const EVIDENCE_TYPES','    const workflowCommentDrafts');
const escape=slice('    function escapeHtml','    function csvEscape');
const stamp=slice('    function stampDate','    function readStampName');
const bucket='abnreport-fd733.firebasestorage.app';
const url=id=>`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/changepoints%2Frecord%2F${id}?alt=media&token=test`;
const file=(name='断面評価.xlsx',size=500)=>({name,size,lastModified:1});
const record=()=>({_id:'record',approvalStatus:'approved',switchStatus:'completed',receiverApprovedBy:'最終承認者',occurrenceDate:'2026-10-08',evidenceAttachments:[],documentUrl:url('original')});
async function unit(){
 const writes=[],uploads=[],storage={};let latest=record(),fail=false,urlFail=false;
 const ctx={URL,Date,Map,Set,Array,crypto:require('node:crypto').webcrypto,console:{error(){}},window:{addEventListener(){}},firebaseConfig:{storageBucket:bucket},db:{},storage,
  currentDetailItem:record(),changepointData:[],localStorage:{getItem:()=> '登録者',setItem(){}},updateActorNameButton(){},document:{getElementById:()=>null},
  doc:(_,collection,id)=>({collection,id}),ref:(_,storagePath)=>({storagePath}),serverTimestamp:()=> 'SERVER',
  getDownloadURL:async ref=>{if(urlFail)throw Error('URL failure');return url(ref.storagePath)},
  uploadBytesResumable(ref,file,metadata){uploads.push({ref,file,metadata});const task={snapshot:{ref,metadata:{timeCreated:'2026-10-09T01:00:00Z'}}};task.on=(_,progress,error,done)=>{progress({bytesTransferred:file.size,totalBytes:file.size});done()};return task},
  runTransaction:async(_,callback)=>callback({get:async()=>({exists:()=>!!latest,data:()=>latest}),update:(ref,patch)=>{if(fail)throw Error('expected failure');writes.push({ref,patch});latest={...latest,...patch};}})};
 vm.createContext(ctx);vm.runInContext(escape+stamp+source,ctx);
 new vm.SourceTextModule(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);
 for(const name of ['評価.xlsx','評価.xls','評価.csv','評価.PDF','断面.JPG','強度.png','条件.webp','photo.HEIC']) assert(ctx.evidenceFileType(file(name)));
 for(const value of [file('x.html'),file('x.svg'),file('x.exe'),file('x.constructor'),file('x.__proto__'),file('x.xlsx',0),file('x.png',5*1024*1024+1),file('a'.repeat(241)+'.xlsx')])assert.throws(()=>ctx.evidenceFileType(value));
 assert.equal(ctx.evidenceUrl('javascript:alert(1)'),'');assert.equal(ctx.evidenceUrl('https://evil.example/a.png'),'');assert.equal(ctx.evidenceUrl(url('x')),url('x'));
 let attachment={id:'one',name:'評価.xlsx',size:500,contentType:'application/vnd.ms-excel',url:url('one'),storagePath:'changepoints/record/one',uploadedBy:'評価者',uploadedAt:'2026-10-09T01:00:00Z',category:'強度評価',note:'合格'};
 await ctx.appendEvidence('record',attachment);assert.equal(writes.length,1);assert.equal(latest.approvalStatus,'approved');assert.equal(latest.receiverApprovedBy,'最終承認者');assert.equal(latest.documentUrl,url('original'));
 assert.deepEqual(Object.keys(writes[0].patch).sort(),['evidenceAttachments','evidenceUpdatedAt','evidenceUpdatedBy']);
 await ctx.appendEvidence('record',attachment);assert.equal(writes.length,1,'ambiguous-response retry is idempotent');
 latest.evidenceAttachments.push({...attachment,id:'concurrent'});await ctx.appendEvidence('record',{...attachment,id:'two'});assert.equal(latest.evidenceAttachments.length,3,'latest attachments survive append');
 latest=null;await assert.rejects(ctx.appendEvidence('record',attachment));
 latest={...record(),evidenceAttachments:Array.from({length:100},(_,i)=>({...attachment,id:String(i)}))};await assert.rejects(ctx.appendEvidence('record',attachment));
 let progress=0;await ctx.uploadEvidenceFile(file('評価.xlsx'),'record','unique',p=>progress=p);assert.equal(progress,100);assert(uploads.at(-1).metadata.contentDisposition.startsWith('attachment;'));assert.equal(uploads.at(-1).ref.storagePath,'changepoints/record/evidence_unique.xlsx');
 await ctx.uploadEvidenceFile(file('評価.png'),'record','image',()=>{});assert(uploads.at(-1).metadata.contentDisposition.startsWith('inline;'));
 urlFail=true;await assert.rejects(ctx.uploadEvidenceFile(file(),'record','bad-url',()=>{}));urlFail=false;
 latest=record();ctx.currentDetailItem=record();ctx.changepointData=[latest];
 ctx.selectEvidenceFiles('record',[file(),file()]);assert.equal(ctx.evidenceDraft('record').jobs.length,1,'duplicate selections ignored');
 fail=true;const previousUploads=uploads.length;await ctx.saveEvidenceFiles('record');
 assert.equal(ctx.evidenceDraft('record').jobs.length,1);assert(ctx.evidenceDraft('record').jobs[0].uploaded);assert(!ctx.evidenceDraft('record').busy);
 fail=false;await ctx.saveEvidenceFiles('record');assert.equal(uploads.length,previousUploads+1,'Firestore retry reuses uploaded file');assert.equal(ctx.evidenceDraft('record').jobs.length,0);assert.equal(latest.evidenceAttachments.length,1);
 ctx.selectEvidenceFiles('record',[file('a.png'),file('b.xlsx')]);ctx.evidenceDraft('record').actor='';await ctx.saveEvidenceFiles('record');assert.equal(ctx.evidenceDraft('record').jobs.length,2,'name required');
 ctx.evidenceDraft('record').actor='評価者';ctx.currentDetailItem={_id:'another-record'};await ctx.saveEvidenceFiles('record');assert.equal(ctx.currentDetailItem._id,'another-record');assert.equal(latest.evidenceAttachments.length,3);
 assert.deepEqual(Array.from(vm.runInContext('EVIDENCE_TYPES',ctx)),['断面評価','強度評価','寸法データ','VLデータ','条件表','その他']);
 for(const category of ['寸法データ','VLデータ']){
  ctx.evidenceDraft('record').category=category;ctx.selectEvidenceFiles('record',[file(category+'.xlsx')]);await ctx.saveEvidenceFiles('record');
  assert.equal(ctx.evidenceDraft('record').jobs.length,0);assert.equal(latest.evidenceAttachments.at(-1).category,category);
  assert(ctx.evidenceListHtml(latest).includes(category));
 }
 const unsafe=ctx.evidenceListHtml({evidenceAttachments:[{...attachment,name:'<img onerror="alert(1)">.xlsx',note:'<script>bad</script>',url:'javascript:alert(1)'}]});assert(!unsafe.includes('<script>'));assert(!unsafe.includes('href="javascript:'));
 const picture=ctx.evidenceListHtml({evidenceAttachments:[{...attachment,url:url('image'),contentType:'image/png'}]});assert(picture.includes('<img '));assert(picture.includes('loading="lazy"'));
 latest={...record(),qualityEvaluationRequired:true};ctx.currentDetailItem={...latest};ctx.changepointData=[latest];
 const q=ctx.qualityDraft(ctx.currentDetailItem);Object.assign(q,{verdict:'pass',actor:'品技担当',note:'強度評価済み'});
 ctx.selectEvidenceFiles('record',[file('品質評価.xlsx')]);const qualityWritesBefore=writes.length;
 fail=true;await ctx.saveQualityEvaluation('record');assert.equal(writes.length,qualityWritesBefore);assert(q.message.includes('未保存の添付'));assert.equal(latest.qualityEvaluationUpdatedAt,undefined);
 fail=false;await ctx.saveQualityEvaluation('record');assert.equal(latest.qualityEvaluationVerdict,'pass');assert.equal(latest.qualityEvaluationHistory[0].attachmentIds.length,1);assert.equal(latest.approvalStatus,'approved');assert.equal(latest.receiverApprovedBy,'最終承認者');assert.equal(q.revision,1);
 q.verdict='fail';await ctx.saveQualityEvaluation('record');assert.equal(latest.qualityEvaluationVerdict,'fail');assert.equal(latest.approvalStatus,'approved');assert.equal(latest.qualityEvaluationHistory.length,2);
 latest.qualityEvaluationRevision++;const beforeConflict=writes.length;await ctx.saveQualityEvaluation('record');assert.equal(writes.length,beforeConflict);assert(q.message.includes('別の評価結果'));
 latest=null;await ctx.saveQualityEvaluation('record');assert(q.message.includes('削除'));
 console.log('PASS evidence and quality unit: formats/size, safe URLs, concurrent append, idempotent retry, failed upload blocks result notification, attachment snapshot, verdict history, unchanged workflow/stamps, revision conflict and deleted record; no live writes.');
}
function fixture(){
 const out=path.join(root,'outputs','evidence-test');fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'evidence-test.csv'),'item,value\nStrength,100\n');
 fs.writeFileSync(path.join(out,'evidence-test.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1sAAAAASUVORK5CYII=','base64'));
 const css=html.match(/<style>([\s\S]*?)<\/style>/)[1];
 const data={...record(),documentUrl:'',evidenceAttachments:[{id:'sample',name:'断面評価写真.png',size:54000,contentType:'image/png',url:'/evidence-test.png',category:'断面評価',note:'断面評価の記録（検証用）',uploadedBy:'評価担当',uploadedAt:'2026-10-09T01:00:00Z'}]};
 const script=`const firebaseConfig={storageBucket:${JSON.stringify(bucket)}};let currentDetailItem=${JSON.stringify(data)},changepointData=[currentDetailItem];
 const updateActorNameButton=()=>{};${escape}${stamp}${source}
 evidenceUrl=value=>value.startsWith('/')?value:'';
 const db={},doc=(_,c,id)=>({id}),serverTimestamp=()=>new Date();
 let latest=currentDetailItem;
 const runTransaction=async(_,fn)=>fn({get:async()=>({exists:()=>true,data:()=>latest}),update:(_,patch)=>{if(document.getElementById('fail').checked)throw Error('test failure');latest={...latest,...patch};document.getElementById('payload').textContent=JSON.stringify(patch);}});
 uploadEvidenceFile=async(file,id,key,progress)=>{progress(100);return {id:key,name:file.name,size:file.size,contentType:evidenceFileType(file).contentType,storagePath:key,url:'/evidence-test.png',uploadedAt:new Date().toISOString()};};
 renderEvidencePanel(currentDetailItem);document.getElementById('mode').onchange=e=>document.getElementById('detailModal').classList.toggle('qr-workflow',e.target.value==='qr');`;
 fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>評価エビデンス 検証用</title><style>${css}</style><div style="position:fixed;z-index:4000;background:white;top:0"><select id="mode" aria-label="検証画面"><option value="normal">通常</option><option value="qr">QR</option></select><label><input type="checkbox" id="fail">保存失敗テスト</label></div><div class="modal active" id="detailModal"><div class="modal-content" style="max-width:1100px"><div class="modal-header"><h3>変化点カード</h3></div><div class="modal-body" id="detailBody"><p>溶接条件変更 / 完了済み（検証用データ）</p><section id="evidenceHost" aria-label="評価エビデンス"></section></div></div></div><pre id="payload" hidden></pre><script>${script}</script></html>`);
 console.log('Created isolated mocked fixture: outputs/evidence-test/index.html');
}
unit().then(fixture).catch(e=>{console.error(e);process.exitCode=1});

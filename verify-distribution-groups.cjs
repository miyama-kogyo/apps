const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=fs.readFileSync(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':'changepoint.html','utf8');
const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'');
const mock=`const initializeApp=()=>({}),getFirestore=()=>({}),getStorage=()=>({}),getAuth=()=>({currentUser:{uid:'test'}}),setPersistence=async()=>{},browserLocalPersistence={},onAuthStateChanged=()=>{},signInAnonymously=async()=>{};
 const collection=(_, ...p)=>p.join('/'),doc=(_, ...p)=>p.join('/'),query=x=>x,orderBy=()=>{},onSnapshot=()=>{},serverTimestamp=()=>new Date();
 window.__groups={};window.__records={};window.__writes=[];window.__qualityWrites=[];window.__masterWrites=[];window.__masterReadFail=false;
 const getDocs=async p=>{if(p.includes('changeDistribution')&&window.__masterReadFail)throw Error('test read failure');return {docs:(p.includes('changeDistribution')?Object.entries(window.__groups).map(([id,data])=>({id,data:()=>data})):p.includes('department')?['品質','製造'].map(name=>({id:name,data:()=>({name,distributionEmail:name==='品質'?'qa@example.com':'production@example.com'})})):[])}};
 const addDoc=async(_,data)=>{window.__writes.push(data);return {id:'registered'}},updateDoc=async()=>{throw Error('Unexpected update')},deleteDoc=async()=>{throw Error('Unexpected delete')};
 const runTransaction=async(_,fn)=>fn({get:async ref=>{const data=(ref.startsWith('changepoints/')?window.__records:window.__groups)[ref.split('/').pop()];return {exists:()=>!!data,data:()=>structuredClone(data)}},set:(ref,data)=>{window.__groups[ref.split('/').pop()]=data;window.__masterWrites.push(ref)},update:(ref,data)=>{if(ref.startsWith('changepoints/')){Object.assign(window.__records[ref.split('/').pop()],data);window.__qualityWrites.push(data)}else{window.__groups[ref.split('/').pop()]={...window.__groups[ref.split('/').pop()],...data};window.__masterWrites.push(ref)}}});
 const getDoc=async()=>({exists:()=>false}),ref=()=>{},uploadBytesResumable=()=>{},getDownloadURL=()=>{};
 localStorage.setItem('changepointActorName','テスト');`;
const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module">${mock}${source}\nawait initApp();document.getElementById('authGate').style.display='none';showScreen('master');window.__load=loadMasters;window.__render=renderMasterTables;window.__detail=showDetail;window.__saveQuality=saveQualityEvaluation;window.__evidenceDraft=evidenceDraft;window.__ready=true;</script>`);
async function main(){
 fs.mkdirSync('outputs/distribution-groups',{recursive:true});
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{
   const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];let answer='';
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='prompt'?d.accept(answer):d.dismiss());
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto('http://127.0.0.1/distribution-test');await page.waitForFunction(()=>window.__ready);
   await page.evaluate(()=>window.__render());await page.locator('[data-tab="distribution"]').click();assert.equal(await page.locator('#distributionTableBody tr').count(),4);
   const row=name=>page.locator('#distributionTableBody tr').filter({hasText:name});
   answer='PROCESS@example.com; second@example.com, process@example.com';await row('工程変更').getByRole('button',{name:'変更'}).click();await page.locator('#distributionEmailInput').fill(answer);await page.locator('#saveDistributionButton').click();
   await page.waitForFunction(()=>window.__groups['工程変更']?.distributionEmail==='process@example.com,second@example.com');
   answer='initial@example.com';await row('初期管理').getByRole('button',{name:'変更'}).click();await page.locator('#distributionEmailInput').fill(answer);await page.locator('#saveDistributionButton').click();await page.waitForFunction(()=>!!window.__groups['初期管理']);
   answer='invalid';await row('工程変更').getByRole('button',{name:'変更'}).click();await page.locator('#distributionEmailInput').fill(answer);await page.locator('#saveDistributionButton').click();assert.equal(await page.evaluate(()=>window.__masterWrites.length),2);assert((await page.locator('#distributionEditStatus').textContent()).includes('誤り'));await page.getByRole('button',{name:'キャンセル',exact:true}).filter({visible:true}).click();
   await row('検査G').getByRole('button',{name:'変更'}).click();await page.locator('#distributionEmailInput').fill('kensa@miyama-unitec.co.jp');await page.locator('#saveDistributionButton').click();await page.waitForFunction(()=>window.__groups['検査G']?.distributionEmail==='kensa@miyama-unitec.co.jp');
   for(const width of [390,1280]){await page.setViewportSize({width,height:900});await page.screenshot({path:path.resolve(`outputs/distribution-groups/master-${engine}-${width}.png`),fullPage:true});}
   await page.locator('#masterScreen [data-back]').click();await page.locator('.menu-card[data-screen="planned"]').click();await page.locator('#planType').selectOption('sudden');
   assert.equal(await page.locator('#planDepartment option').allTextContents().then(xs=>xs.includes('工程変更')),false);
   await page.locator('#planDepartment').selectOption('品質');await page.locator('#planDepartmentOccur').selectOption('製造');
   const group=name=>page.locator('[data-distribution-group]').filter({visible:true}).and(page.locator('[value="'+name+'"]'));
   await page.locator('#planQualityEvaluation').selectOption('yes');assert(await group('品技G').isChecked());assert(await group('品技G').isDisabled());
   await page.locator('#planQualityEvaluation').selectOption('no');assert(!(await group('品技G').isChecked()));assert(!(await group('品技G').isDisabled()));
   await page.locator('#planQualityEvaluation').selectOption('yes');
   await group('工程変更').check();await group('初期管理').check();await group('初期管理').uncheck();await group('検査G').check();
   assert(await page.locator('#planDistributionDepartments input[value="品質"]').isDisabled());
   await page.locator('#planDepartmentOccur').selectOption('品質');assert(await group('工程変更').isChecked());await page.locator('#planDepartmentOccur').selectOption('製造');
   await page.locator('#planLineName').fill('94-300');await page.locator('#planProcessName').fill('溶接');await page.locator('#planContent').fill('テスト変化点');await page.locator('#planDate').fill('2026-10-14');
   await page.locator('#planDistributionDepartments').screenshot({path:path.resolve(`outputs/distribution-groups/options-${engine}.png`)});
   await page.locator('#btnRegisterPlanned').click();assert((await page.locator('#confirmModal').textContent()).includes('工程変更'));await page.locator('#btnConfirmOk').click();await page.locator('#registrationPrintDialog').waitFor();
   assert.deepEqual((await page.evaluate(()=>window.__writes[0].distributionGroups)).sort(),['工程変更','品技G','検査G'].sort());assert.equal(await page.evaluate(()=>window.__writes[0].qualityEvaluationRequired),true);assert.deepEqual(await page.evaluate(()=>window.__writes[0].distributionDepartments),['品質','製造']);
   await page.evaluate(()=>document.getElementById('registrationPrintDialog').close());assert(!(await group('工程変更').isChecked()));
   await page.evaluate(async()=>{window.__masterReadFail=true;await window.__load()});assert((await page.locator('#planDistributionDepartments').textContent()).includes('展開先アドレス未設定'));
   await page.evaluate(()=>{
     history.replaceState({},'', '?changepointId=quality&qualityEvaluation=1');
     window.__records.quality={_id:'quality',_kind:'changepoint',type:'planned',workflowManaged:true,qualityEvaluationRequired:true,approvalStatus:'draft',planneddepartment:'品質',department:'製造',lineName:'94-300',processName:'溶接',serialNo:'7106',content:'品質評価のテスト',checklistItems:[],evidenceAttachments:[]};
     window.__detail(structuredClone(window.__records.quality));
   });
   assert.equal(await page.locator('#detailTitle').textContent(),'品質評価');assert(await page.locator('#evidencePanel').getAttribute('open')!==null);
   await page.locator('#qualityVerdict').selectOption('conditional');await page.locator('#qualityActor').fill('品技担当');
   await page.evaluate(()=>window.__saveQuality('quality'));assert.equal(await page.evaluate(()=>window.__qualityWrites.length),0);
   await page.locator('#qualityCondition').fill('初品の寸法を確認する');await page.locator('#qualityNote').fill('断面と強度を確認');
   await page.locator('#qualityEvaluationForm button').click();await page.waitForFunction(()=>window.__qualityWrites.length===1);
   assert.equal(await page.evaluate(()=>window.__records.quality.approvalStatus),'draft');assert.equal(await page.evaluate(()=>window.__records.quality.qualityEvaluationVerdict),'conditional');
   assert((await page.locator('#qualityEvaluationStatus').textContent()).includes('予約'));
   for(const width of [390,1280]){await page.setViewportSize({width,height:900});await page.locator('#qualityEvaluationHost').scrollIntoViewIfNeeded();await page.screenshot({path:path.resolve(`outputs/distribution-groups/quality-${engine}-${width}.png`)});assert(await page.locator('#qualityEvaluationHost').evaluate(el=>el.scrollWidth<=el.clientWidth+1));}
   await page.locator('#qualityVerdict').selectOption('fail');await page.locator('#qualityEvaluationForm button').click();await page.waitForFunction(()=>window.__qualityWrites.length===2);assert.equal(await page.evaluate(()=>window.__records.quality.qualityEvaluationHistory.length),2);assert.equal(await page.evaluate(()=>window.__records.quality.approvalStatus),'draft');
   await page.evaluate(()=>window.__records.quality.qualityEvaluationRevision++);await page.locator('#qualityVerdict').selectOption('pass');await page.locator('#qualityEvaluationForm button').click();await page.waitForFunction(()=>document.getElementById('qualityEvaluationStatus').textContent.includes('別の評価結果'));assert.equal(await page.evaluate(()=>window.__qualityWrites.length),2);
   await page.evaluate(()=>window.__detail(structuredClone(window.__records.quality)));await page.locator('#qualityVerdict').selectOption('pass');await page.locator('#qualityEvaluationForm button').click();await page.waitForFunction(()=>window.__qualityWrites.length===3);
   await page.evaluate(()=>{window.__evidenceDraft('quality').busy=true});await page.locator('#qualityEvaluationForm button').click();await page.waitForFunction(()=>document.getElementById('qualityEvaluationStatus').textContent.includes('添付を保存中'));assert.equal(await page.evaluate(()=>window.__qualityWrites.length),3);
   await page.evaluate(()=>{window.__evidenceDraft('quality').busy=false;window.__detail({_id:'legacy',type:'planned',approvalStatus:'draft'});});assert((await page.locator('#qualityEvaluationHost').textContent()).includes('不要'));
   assert.deepEqual(errors,[]);console.log('PASS '+engine+': separate master, multiple emails, validation, optional selection, mandatory departments, payload, reset and failed master read. No live writes/mail.');
  }finally{await browser.close();}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});

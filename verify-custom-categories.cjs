const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=fs.readFileSync(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':'changepoint.html','utf8');
const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/import\s*\{[\s\S]*?\}\s*from\s*'[^']+';/g,'');
const mock=`const initializeApp=()=>({}),getFirestore=()=>({}),getStorage=()=>({}),getAuth=()=>({currentUser:{uid:'test'}}),setPersistence=async()=>{},browserLocalPersistence={},onAuthStateChanged=()=>{},signInAnonymously=async()=>{};
 const collection=(_, ...p)=>p.join('/'),doc=(_, ...p)=>p.join('/'),query=x=>x,orderBy=()=>{},onSnapshot=()=>{},serverTimestamp=()=>new Date();
 window.__checks={old:{category:'人',name:'従来項目',criteria:'従来基準'}};window.__writes=[];window.__records={};window.__fail=false;
 const getDocs=async p=>({docs:p.includes('changeChecklist')?Object.entries(window.__checks).map(([id,data])=>({id,data:()=>structuredClone(data)})):p.includes('department')?['品質','製造'].map(name=>({id:name,data:()=>({name,distributionEmail:'test@example.com'})})):[]});
 const addDoc=async(p,data)=>{if(p.includes('changeChecklist'))window.__checks['check'+Object.keys(window.__checks).length]=structuredClone(data);else window.__writes.push(structuredClone(data));return {id:'created'}};
 const updateDoc=async()=>{},deleteDoc=async()=>{},getDoc=async()=>({exists:()=>false}),ref=()=>{},uploadBytesResumable=()=>{},getDownloadURL=()=>{};
 const runTransaction=async(_,fn)=>fn({get:async ref=>({exists:()=>!!window.__checks[ref.split('/').pop()],data:()=>structuredClone(window.__checks[ref.split('/').pop()])}),set:(ref,data)=>{if(window.__fail)throw Error('通信テスト');window.__checks[ref.split('/').pop()]=structuredClone(data)},update:(ref,data)=>{if(window.__fail)throw Error('通信テスト');Object.assign(window.__checks[ref.split('/').pop()],structuredClone(data))}});
 localStorage.setItem('changepointActorName','検証者');`;
const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,`<script type="module">${mock}${source}
 await initApp();document.getElementById('authGate').style.display='none';showScreen('master');renderMasterTables();
 window.__reload=async()=>{await loadMasters();renderMasterTables()};window.__add=addChangeCategory;window.__detail=showDetail;window.__edit=item=>{changepointData=[item];openEditFromHistory(item._id)};
 window.__check=validateUnplannedCheck;window.__ticket=renderChangeTicket;window.__ready=true;</script>`);
async function main(){
 fs.mkdirSync('outputs/custom-categories',{recursive:true});
 for(const engine of ['chromium','webkit']){
  const browser=await (engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{
   const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='prompt'?d.accept('検証者'):d.dismiss());
   await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));await page.goto('http://127.0.0.1/category-test');await page.waitForFunction(()=>window.__ready);
   await page.locator('[data-tab="checklist"]').click();
   assert.deepEqual(await page.locator('#addChecklistCategory option').allTextContents(),['人','設備','材料','方法','金型']);
   await page.locator('#addChangeCategory').fill('検査');await page.locator('#btnAddChangeCategory').click();await page.waitForFunction(()=>window.__checks._categories?.categories.includes('検査'));
   assert.equal(await page.locator('#addChecklistCategory').inputValue(),'検査');assert.equal(await page.locator('#checklistTableBody tr').count(),1,'registry is not a checklist item');
   await page.locator('#addChecklistName').fill('検査方法の妥当性');await page.locator('#addChecklistCriteria').fill('判定基準を満たす');await page.locator('#btnAddChecklist').click();await page.waitForFunction(()=>Object.values(window.__checks).some(x=>x.name==='検査方法の妥当性'));
   await page.evaluate(()=>window.__reload());assert((await page.locator('#checklistTableBody').textContent()).includes('検査方法の妥当性'));
   for(const id of ['planCategory','addChecklistCategory','boardCategoryFilter','calendarCatFilter'])assert((await page.locator('#'+id+' option').allTextContents()).includes('検査'));
   await page.locator('#addChangeCategory').fill(' 検査 ');await page.locator('#btnAddChangeCategory').click();await page.waitForFunction(()=>document.getElementById('categoryMasterStatus').textContent.includes('同じ分類'));assert.deepEqual(await page.evaluate(()=>window.__checks._categories.categories),['検査']);
   await page.evaluate(()=>window.__checks._categories.categories.push('環境'));await page.evaluate(()=>window.__add('測定'));assert.deepEqual(await page.evaluate(()=>window.__checks._categories.categories),['検査','環境','測定'],'transaction preserves concurrent additions');
   await assert.rejects(page.evaluate(()=>window.__add(' 環境 ')));await assert.rejects(page.evaluate(()=>window.__add('x'.repeat(41))));await assert.rejects(page.evaluate(()=>window.__add('   ')));
   await page.evaluate(()=>window.__fail=true);await assert.rejects(page.evaluate(()=>window.__add('失敗分類')));assert(!(await page.locator('#planCategory option').allTextContents()).includes('失敗分類'));await page.evaluate(()=>window.__fail=false);
   await page.evaluate(async()=>{await window.__add('constructor');await window.__add('A"<B>');await window.__reload()});assert((await page.locator('#planCategory option').allTextContents()).includes('A"<B>'));
   assert((await page.evaluate(()=>window.__ticket({_id:'test',type:'sudden',category:'constructor',checklistItems:[]},'原本','品質'))).includes('constructor'));
   for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});await page.locator('#categoryMasterForm').scrollIntoViewIfNeeded();assert(await page.locator('#categoryMasterForm').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:path.resolve('outputs/custom-categories/master-'+engine+'-'+width+'.png')});}
   await page.locator('#masterScreen [data-back]').click();await page.locator('.menu-card[data-screen="planned"]').click();await page.locator('#planCategory').selectOption('検査');
   assert((await page.locator('#planChecklistPreview').textContent()).includes('検査方法の妥当性'));await page.locator('#planDepartment').selectOption('品質');await page.locator('#planDepartmentOccur').selectOption('製造');await page.locator('#planLineName').fill('94-300');await page.locator('#planProcessName').fill('検査');await page.locator('#planContent').fill('検査方法変更');await page.locator('#planDate').fill('2026-10-14');
   await page.locator('#btnRegisterPlanned').click();await page.locator('#btnConfirmOk').click();await page.locator('#registrationPrintDialog').waitFor();assert.equal(await page.evaluate(()=>window.__writes[0].category),'検査');assert.equal(await page.evaluate(()=>window.__writes[0].checklistItems[0].label),'検査方法の妥当性');await page.evaluate(()=>document.getElementById('registrationPrintDialog').close());
   await page.evaluate(()=>window.__edit({_id:'edit',type:'planned',category:'検査',planneddepartment:'品質',department:'製造'}));assert.equal(await page.locator('#editCategory').inputValue(),'検査');
   await page.evaluate(()=>{document.getElementById('editModal').style.display='none';window.__detail({_id:'post',type:'sudden',workflowManaged:true,workflowKind:'unplanned_response_v2',approvalStatus:'post_check',category:'検査',checklistItems:[]})});assert.equal(await page.locator('#postCategory').inputValue(),'検査');
   await page.evaluate(()=>window.__check({category:'検査',responseDepartment:'品質',temporaryChange:false,checklistItems:['safety','products','workability'].map(key=>({key:'post_'+key,receiverResult:'ok'}))}));
   await page.evaluate(async()=>{window.__checks.legacy={category:'旧追加分類',name:'旧項目',criteria:'基準'};await window.__reload()});assert((await page.locator('#planCategory option').allTextContents()).includes('旧追加分類'));
   assert.deepEqual(errors,[]);console.log('PASS '+engine+': persistent custom categories, base 5M, checklist storage, duplicate/concurrent/failure handling, escaping, responsive master, planned registration/edit, unplanned checks, filters and legacy categories. No live writes.');
  }finally{await browser.close();}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});

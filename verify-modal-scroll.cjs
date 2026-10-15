const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium,webkit}=require('C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=fs.readFileSync(fs.existsSync('変化点管理システム.html')?'変化点管理システム.html':'changepoint.html','utf8');
const fixture=html.replace(/<script src="[^"]+"><\/script>/g,'').replace(/<script type="module">[\s\S]*?<\/script>/,'');
async function main(){
 fs.mkdirSync('outputs/modal-scroll',{recursive:true});
 for(const engine of ['chromium','webkit']){
  const browser=await(engine==='chromium'?chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}):webkit.launch({headless:true}));
  try{
   for(const width of [390,1280]){
    const page=await browser.newPage({viewport:{width,height:850}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:fixture}));
    await page.goto('http://127.0.0.1/scroll-test');
    await page.evaluate(()=>{
     document.getElementById('authGate').remove();
     const board=document.getElementById('mainMenu');board.style.display='block';board.style.height='4000px';
     document.body.style.paddingRight='7px';
     for(const overlay of document.querySelectorAll('.modal,.confirm-modal,dialog')){
      const content=overlay.tagName==='DIALOG'?overlay:overlay.querySelector('.modal-content,.confirm-modal-content');
      content.innerHTML='<h2>スクロール確認</h2><div style="height:1600px;padding:20px">モーダル内の内容</div><button type="button">末尾</button>';
     }
     window.scrollTo(0,420);
    });
    await page.waitForFunction(()=>scrollY===420);
    const before=await page.evaluate(()=>({y:scrollY,padding:document.body.style.paddingRight,rect:document.getElementById('mainMenu').getBoundingClientRect().top}));
    for(const id of ['detailModal','editModal','productionDateModal','qrModal','confirmModal','stampApprovalDialog','distributionEditDialog','registrationPrintDialog']){
     await page.evaluate(id=>{const e=document.getElementById(id);if(e.tagName==='DIALOG')e.showModal();else if(id==='confirmModal')e.style.display='block';else e.classList.add('active')},id);
     await page.waitForFunction(()=>document.body.style.position==='fixed');
     const content=page.locator('#'+id+(id.endsWith('Dialog')?'':' .modal-content, #'+id+' .confirm-modal-content'));
     const box=await content.boundingBox();
     await content.evaluate(e=>e.scrollTop=0);
     const top=await content.evaluate(e=>e.scrollTop);
     await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,350);
     await page.waitForFunction(id=>{const e=document.getElementById(id);return (e.tagName==='DIALOG'?e:e.querySelector('.modal-content,.confirm-modal-content')).scrollTop>0},id);
     assert(await content.evaluate(e=>e.scrollTop)>top);
     await content.evaluate(e=>e.scrollTop=e.scrollHeight);
     await page.mouse.wheel(0,900);
     await page.mouse.move(2,2);await page.mouse.wheel(0,700);
     assert.equal(await page.evaluate(()=>document.getElementById('mainMenu').getBoundingClientRect().top),before.rect);
     assert.equal(await page.evaluate(()=>document.body.style.top),'-420px');
     if(id==='detailModal')await page.screenshot({path:path.resolve(`outputs/modal-scroll/${engine}-${width}.png`)});
     await page.evaluate(id=>{const e=document.getElementById(id);if(e.tagName==='DIALOG')e.close();else if(id==='confirmModal')e.style.display='none';else e.classList.remove('active')},id);
     await page.waitForFunction(()=>document.body.style.position!=='fixed');
     assert.equal(await page.evaluate(()=>scrollY),before.y);
     assert.equal(await page.evaluate(()=>document.body.style.paddingRight),before.padding);
    }
    await page.evaluate(()=>document.getElementById('detailModal').classList.add('active'));
    await page.waitForFunction(()=>document.body.style.position==='fixed');
    await page.evaluate(()=>document.getElementById('distributionEditDialog').showModal());
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.getElementById('distributionEditDialog').open);
    assert.equal(await page.evaluate(()=>document.body.style.position),'fixed');
    await page.evaluate(()=>{document.getElementById('detailModal').classList.remove('active');document.getElementById('editModal').classList.add('active')});
    assert.equal(await page.evaluate(()=>document.body.style.top),'-420px');
    await page.evaluate(()=>document.getElementById('editModal').classList.remove('active'));
    await page.waitForFunction(()=>document.body.style.position!=='fixed');
    assert.equal(await page.evaluate(()=>scrollY),420);
    await page.mouse.move(20,20);await page.mouse.wheel(0,300);await page.waitForFunction(()=>scrollY>420);
    assert.deepEqual(errors,[]);await page.close();
    console.log(`PASS ${engine} ${width}: all 8 modals, inner scroll, boundary/backdrop, nested Escape, modal handoff, restored position/styles and unlocked background.`);
   }
  }finally{await browser.close()}
 }
}
main().catch(e=>{console.error(e);process.exitCode=1});

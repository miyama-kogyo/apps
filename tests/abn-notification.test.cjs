const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('New badge expires at the fixed deadline, including on an already-open page',()=>{
  const html=fs.readFileSync(path.join(root,'abnreport.html'),'utf8');
  const until=html.match(/id="notificationNewBadge"[^>]*data-until="([^"]+)"/)[1];
  const source=html.match(/<script id="notificationNewBadgeScript">([\s\S]*?)<\/script>/)[1];
  const deadline=Date.parse(until);
  assert.equal(until,'2026-11-16T10:55:00+09:00');
  function load(now){
    const badge={dataset:{until},hidden:true},clock={now};let callback,delay,visibility;
    vm.runInNewContext(source,{document:{getElementById:()=>badge,addEventListener:(name,fn)=>visibility=fn},Date:{parse:Date.parse,now:()=>clock.now},clearTimeout(){},setTimeout:(fn,ms)=>{callback=fn;delay=ms;}});
    return {badge,clock,callback,delay,visibility};
  }
  const open=load(deadline-7*24*60*60*1000);
  assert.equal(open.badge.hidden,false);
  assert.equal(open.delay,7*24*60*60*1000);
  open.clock.now=deadline;open.callback();assert.equal(open.badge.hidden,true);
  assert.equal(load(deadline-1).badge.hidden,false);
  assert.equal(load(deadline).badge.hidden,true);
  assert.equal(load(deadline+1).badge.hidden,true);
  const resumed=load(deadline-100);resumed.clock.now=deadline+100;resumed.visibility();assert.equal(resumed.badge.hidden,true);
});
function worker(){
  const events={},opened=[],shown=[];
  const self={location:{href:'https://miyama-kogyo.github.io/apps/abnreport-push-sw.js'},addEventListener:(name,fn)=>events[name]=fn,registration:{showNotification:async(title,options)=>shown.push({title,options})}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'abnreport-push-sw.js'),'utf8'),{self,URL,clients:{openWindow:async url=>opened.push(url)}});
  return {events,opened,shown};
}
test('push keeps the line/serial title, content and read-only anomaly ID',async()=>{
  const w=worker();let pending;
  w.events.push({data:{json:()=>({data:{noticeId:'notice-1',anomalyId:'history-1',title:'RL-3 / 7556',body:'content'}})},waitUntil:p=>pending=p});
  await pending;
  assert.equal(w.shown[0].title,'RL-3 / 7556');
  assert.equal(w.shown[0].options.body,'content');
  assert.equal(w.shown[0].options.data.anomalyId,'history-1');
});
test('notification opens a new app window without assigning the draft ID',async()=>{
  const w=worker();let pending,closed=false;
  w.events.notificationclick({notification:{data:{anomalyId:'history-1',noticeId:'notice-1'},close:()=>closed=true},waitUntil:p=>pending=p});
  await pending;
  const url=new URL(w.opened[0]);
  assert.equal(url.pathname,'/apps/abnreport.html');
  assert.equal(url.searchParams.get('notifyAnomalyId'),'history-1');
  assert.equal(url.searchParams.has('anomalyId'),false);
  assert.equal(url.searchParams.has('focusAnomalyId'),false);
  assert.equal(closed,true);
});
test('test notifications open the notification view without an anomaly ID',async()=>{
  const w=worker();let pending;
  w.events.notificationclick({notification:{data:{noticeId:'test'},close(){}},waitUntil:p=>pending=p});
  await pending;
  assert.equal(new URL(w.opened[0]).searchParams.get('notifyNotice'),'test');
});
test('invalid push messages do not display notifications',()=>{
  const w=worker();
  w.events.push({data:{json:()=>{throw Error('invalid');}}});
  w.events.push({data:{json:()=>({data:{}})}});
  assert.equal(w.shown.length,0);
});
test('integration uses existing auth, read-only detail loading and an app-only worker scope',()=>{
  const source=fs.readFileSync(path.join(root,'assets/abn-notification-integration.js'),'utf8');
  assert.match(source,/scope:'\.\/abnreport\.html'/);
  assert.match(source,/auth\.currentUser\?\.uid!==uid/);
  assert.doesNotMatch(source,/signInAnonymously|setDoc|updateDoc|deleteDoc/);
  const html=fs.readFileSync(path.join(root,'abnreport.html'),'utf8');
  assert.match(html,/const allowed = await isDeviceAllowed\(\)/);
  assert.match(html,/if \(!allowed\)/);
});

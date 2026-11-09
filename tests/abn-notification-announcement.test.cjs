const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/abn-notification-announcement.js'),'utf8');
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function fixture(storage){
  const buttons={};let settings=0;
  const dialog={open:false,querySelector:name=>buttons[name]??=(new EventTarget()),showModal(){this.open=true;},close(){this.open=false;}};
  return {dialog,storage,onSettings:()=>settings++,buttons,get settings(){return settings;}};
}
test('announcement is shown only once per browser/account and survives reload',async()=>{
  const {createNotificationAnnouncement}=await modulePromise;
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const f=fixture(storage),notice=createNotificationAnnouncement(f);
  assert.equal(notice.show(null),false);assert.equal(values.size,0);
  assert.equal(notice.show('alice'),true);
  notice.clear();assert.equal(f.dialog.open,false);
  assert.equal(notice.show('alice'),false);
  const reloaded=createNotificationAnnouncement(fixture(storage));
  assert.equal(reloaded.show('alice'),false);
  assert.equal(reloaded.show('bob'),true);
});
test('settings button closes the announcement and opens the notification tab',async()=>{
  const {createNotificationAnnouncement}=await modulePromise;
  const f=fixture({getItem(){},setItem(){}}),notice=createNotificationAnnouncement(f);
  notice.show('alice');f.buttons['[data-announcement-settings]'].dispatchEvent(new Event('click'));
  assert.equal(f.dialog.open,false);assert.equal(f.settings,1);
});
test('unavailable storage never blocks the app or repeats within the same session',async()=>{
  const {createNotificationAnnouncement}=await modulePromise;
  const f=fixture({getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}}),notice=createNotificationAnnouncement(f);
  assert.equal(notice.show('alice'),true);
  f.buttons['[data-announcement-close]'].dispatchEvent(new Event('click'));
  assert.equal(f.dialog.open,false);assert.equal(notice.show('alice'),false);
});
test('announcement is gated by login and skips notification deep links',()=>{
  const html=fs.readFileSync(path.join(root,'abnreport.html'),'utf8');
  assert.match(html,/if\(auth\.currentUser\?\.uid===uid&&!params\.has\('notifyAnomalyId'\)&&!params\.has\('notifyNotice'\)\)notificationAnnouncement\.show\(uid\)/);
  assert.match(html,/notificationAnnouncement\.clear\(\)/);
});

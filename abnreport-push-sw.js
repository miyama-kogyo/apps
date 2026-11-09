self.addEventListener('push',event=>{
  let data;try{data=event.data.json().data;}catch{return;}
  if(!data?.noticeId)return;
  event.waitUntil(self.registration.showNotification(data.title||'異常履歴の通知',{body:data.body||'',icon:'./assets/abn-notify-icon.png',tag:data.noticeId,data:{anomalyId:data.anomalyId,noticeId:data.noticeId}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const d=event.notification.data||{},url=new URL('./abnreport.html',self.location.href);
  if(d.anomalyId)url.searchParams.set('notifyAnomalyId',d.anomalyId);
  else url.searchParams.set('notifyNotice',d.noticeId||'test');
  // Preserve any report currently being entered in an existing tab.
  event.waitUntil(clients.openWindow(url.href));
});

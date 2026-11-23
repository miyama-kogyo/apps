const DEVICE_NOTICE = Object.freeze({
  recipients: 'ktakada@miyama-unitec.co.jp,ktachino@miyama-unitec.co.jp,mii@miyama-unitec.co.jp',
  prefix: 'DEVICE_NOTICE_JOB_',
  appUrl: 'https://miyama-kogyo.github.io/apps/idmng.html'
});

function enableDeviceRequestNotifications() {
  verifyNotifierOwner();
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const p=notifierProperties();
    if(!p.getProperty('DEVICE_NOTICE_START'))p.setProperty('DEVICE_NOTICE_START',new Date().toISOString());
    p.setProperty('DEVICE_NOTICE_RECIPIENTS',DEVICE_NOTICE.recipients);
    if(!ScriptApp.getProjectTriggers().some(t=>t.getHandlerFunction()==='pollDeviceRequestNotifications'))ScriptApp.newTrigger('pollDeviceRequestNotifications').timeBased().everyMinutes(5).create();
    p.setProperty('DEVICE_NOTICE_ENABLED','true');
    console.log('端末申請メールを有効化しました。開始日時: '+p.getProperty('DEVICE_NOTICE_START')+' / 宛先: '+DEVICE_NOTICE.recipients+' / 5分間隔');
  } finally {lock.releaseLock();}
}

function disableDeviceRequestNotifications() {
  verifyNotifierOwner();notifierProperties().setProperty('DEVICE_NOTICE_ENABLED','false');
}

function deviceNoticeKey(name) {
  return DEVICE_NOTICE.prefix+Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,name)).replace(/=+$/,'');
}

function deviceNoticeMessage(item) {
  const clean=value=>String(value||'（未入力）').slice(0,500);
  const date=new Date(item.requestedAt);
  return {
    to:DEVICE_NOTICE.recipients,
    subject:'【異常履歴アプリ】端末アクセス申請を受け付けました',
    name:'ミヤマ工業 業務アプリ通知',
    body:[
      'IT管理者 各位','',
      '異常履歴入力ツールで、以下の端末アクセス申請が登録されました。',
      '申請者名: '+clean(item.applicantName),
      'メールアドレス: '+clean(item.userEmail),
      'PC・スマホ名: '+clean(item.deviceName),
      '端末ID: '+clean(item.deviceId),
      '申請日時: '+Utilities.formatDate(date,'Asia/Tokyo','yyyy/MM/dd HH:mm:ss')+'（日本時間）','',
      '管理コンソール: '+DEVICE_NOTICE.appUrl,'',
      '使用開始には、この端末申請と「ワークフロー【IT】異常履歴アプリ使用申請書」の両方が必要です。',
      'ワークフローの提出状況も別途ご確認のうえ、承認をお願いします。',
      'このメールは端末申請の受付通知です。ワークフローの提出完了や端末承認を示すものではありません。'
    ].join('\n')
  };
}

function collectDeviceNoticeJobs() {
  const p=notifierProperties(),all=p.getProperties();
  const count=Object.keys(all).filter(k=>k.indexOf(DEVICE_NOTICE.prefix)===0).length;
  if(count>=200)throw Error('端末申請メールの保留記録が200件に達しました。送信履歴を確認してください。');
  const start=p.getProperty('DEVICE_NOTICE_START');
  if(!start)throw Error('端末申請メールの開始日時が未設定です。');
  const cursor=JSON.parse(p.getProperty('DEVICE_NOTICE_CURSOR')||'null');
  const q={from:[{collectionId:'deviceRequests'}],where:{fieldFilter:{field:{fieldPath:'requestedAt'},op:'GREATER_THAN_OR_EQUAL',value:{timestampValue:start}}},orderBy:[{field:{fieldPath:'requestedAt'},direction:'ASCENDING'},{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:Math.min(40,200-count)};
  if(cursor)q.startAt={values:[{timestampValue:cursor.time},{referenceValue:cursor.name}],before:false};
  const rows=firestoreRead(':runQuery',{structuredQuery:q});
  if(!Array.isArray(rows))throw Error('端末申請の取得結果が不正です。');
  rows.forEach(row=>{
    if(!row.document)return;
    const item=decodeDocument(row.document),key=deviceNoticeKey(item._name);
    if(!item.requestedAt||!Number.isFinite(Date.parse(item.requestedAt)))throw Error('端末申請日時が不正です。');
    if(!p.getProperty(key))p.setProperty(key,JSON.stringify({name:item._name,state:'pending',time:item.requestedAt,at:Date.now()}));
    p.setProperty('DEVICE_NOTICE_CURSOR',JSON.stringify({time:item.requestedAt,name:item._name}));
  });
}

function processDeviceNoticeJobs() {
  const p=notifierProperties();
  if(p.getProperty('DEVICE_NOTICE_RECIPIENTS')!==DEVICE_NOTICE.recipients)throw Error('端末申請通知の宛先設定が一致しません。');
  let quota=MailApp.getRemainingDailyQuota(),sent=0;
  const all=p.getProperties();
  for(const key of Object.keys(all).filter(k=>k.indexOf(DEVICE_NOTICE.prefix)===0)){
    const job=JSON.parse(all[key]);
    if(job.state!=='pending')continue;
    if(sent>=10||quota<3)break;
    const prefix='projects/'+NOTIFIER.project+'/databases/(default)/documents';
    if(!job.name.startsWith(prefix+'/deviceRequests/'))throw Error('端末申請のパスが不正です。');
    const doc=firestoreRead(job.name.slice(prefix.length));
    const item=doc?decodeDocument(doc):null;
    if(!item||item.status!=='pending'||item.requestedAt!==job.time||Date.parse(item.requestedAt)<Date.parse(p.getProperty('DEVICE_NOTICE_START'))){
      job.state='skipped';job.at=Date.now();p.setProperty(key,JSON.stringify(job));continue;
    }
    const message=deviceNoticeMessage(item);
    job.state='sending';job.at=Date.now();p.setProperty(key,JSON.stringify(job));
    try{
      MailApp.sendEmail(message);
      job.state='sent';job.at=Date.now();p.setProperty(key,JSON.stringify(job));quota-=3;sent++;
    }catch(error){job.state='uncertain';p.setProperty(key,JSON.stringify(job));throw error;}
  }
  console.log('端末申請通知: '+sent+'件送信');
}

function pollDeviceRequestNotifications() {
  verifyNotifierOwner();
  const p=notifierProperties();if(p.getProperty('DEVICE_NOTICE_ENABLED')!=='true')return;
  const lock=LockService.getScriptLock();if(!lock.tryLock(1000))return;
  try{
    // Terminal jobs can be removed only once the collector has advanced past them.
    const cursor=JSON.parse(p.getProperty('DEVICE_NOTICE_CURSOR')||'null');
    const all=p.getProperties();
    Object.keys(all).filter(k=>k.indexOf(DEVICE_NOTICE.prefix)===0).forEach(key=>{
      const job=JSON.parse(all[key]);
      if(['sent','skipped'].includes(job.state)&&Date.now()-job.at>7*86400000&&cursor&&(job.time<cursor.time||(job.time===cursor.time&&job.name<=cursor.name)))p.deleteProperty(key);
    });
    processDeviceNoticeJobs();collectDeviceNoticeJobs();processDeviceNoticeJobs();
    p.deleteProperty('DEVICE_NOTICE_LAST_ERROR');p.setProperty('DEVICE_NOTICE_LAST_RUN',new Date().toISOString());
  }catch(error){p.setProperty('DEVICE_NOTICE_LAST_ERROR',String(error.message||error));throw error;}
  finally{lock.releaseLock();}
}

function showDeviceRequestNotificationStatus() {
  verifyNotifierOwner();const p=notifierProperties(),all=p.getProperties(),states={};
  Object.keys(all).filter(k=>k.indexOf(DEVICE_NOTICE.prefix)===0).forEach(key=>{const job=JSON.parse(all[key]);states[job.state]=(states[job.state]||0)+1;});
  console.log(JSON.stringify({enabled:p.getProperty('DEVICE_NOTICE_ENABLED'),start:p.getProperty('DEVICE_NOTICE_START'),recipients:p.getProperty('DEVICE_NOTICE_RECIPIENTS'),lastRun:p.getProperty('DEVICE_NOTICE_LAST_RUN'),lastError:p.getProperty('DEVICE_NOTICE_LAST_ERROR'),states:states,triggers:ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='pollDeviceRequestNotifications').length}));
}

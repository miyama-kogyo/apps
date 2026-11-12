import {getFunctions,httpsCallable} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-functions.js';
import {getMessaging,getToken,deleteToken,isSupported} from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-messaging.js';
import {mountNotifications} from './abn-notifications.js';
import {sortingSummary} from './abn-sorting-results.js';
const vapidKey='BMpSoxSeXqGkIkft_CnmXNANamny68cyWVRuq2Ki8uzKL4oscEmY37DJbOrRVMYxoRtSLyJYGg7JKeQcm0RzGXA';
export function integrateNotifications({app,auth,container,loadAnomaly,activate,openSorting}) {
  const root=container.attachShadow({mode:'open'});root.innerHTML='<div id="app"></div>';
  const call=httpsCallable(getFunctions(app,'asia-northeast1'),'anomalyNotifyApi');let detail;
  const openAnomaly=async id=>{
    if(!auth.currentUser)throw Error('ログインしてください。');
    const uid=auth.currentUser.uid;
    if(!/^[\w-]{1,150}$/.test(id))throw Error('案件IDが不正です。');
    const data=await loadAnomaly(id);if(auth.currentUser?.uid!==uid)return;
    if(!data)throw Error('この異常履歴は削除されたか、見つかりません。');
    activate();detail?.remove();detail=document.createElement('dialog');
    detail.style.cssText='width:min(800px,94vw);max-height:90dvh;overflow:auto;border:1px solid #bbb;border-radius:8px;padding:22px;margin:auto;color:#222;background:white';
    detail.setAttribute('aria-label','異常履歴の詳細');
    const h=document.createElement('h2');h.textContent='異常履歴の詳細';h.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px';detail.append(h);
    const fields=[['整理No','serialNo'],['発信部署','department'],['ライン','lineName'],['発生日','occurrenceDate'],['発生時刻','occurrenceTime'],['再開時刻','restartTime'],['ロットNo','lotNo'],['異常内容','anomalyContent'],['現場対応','actionTaken'],['遡り','traceback'],['品質対応','qualityResponse'],['原因','cause'],['発信部署の処置者','handler'],['異常分類','anomalyCategory'],['発生タイミング','occurrenceTiming'],['発見タイミング','discoveryTiming'],['新規・再発','recurrenceType'],['対応部署の処置者','techHandler'],['保全単位','maintenanceUnit'],['処置内容','rootCauseAction'],['原因分類','causeCategory'],['対策状況','measureStatus'],['命数','lifespan'],['命数到達','lifespanReached'],['変化点分類','changePointCategory'],['変化点内容','changePointContent']];
    const status=document.createElement('p');status.textContent='状態：'+(data.status==='complete'?'完了':'対応部署入力待ち');detail.append(status);
    const sorting=document.createElement('p');sorting.textContent='選別結果：'+sortingSummary(data);detail.append(sorting);
    if(openSorting){const button=document.createElement('button');button.type='button';button.textContent='選別結果を開く';button.onclick=()=>{detail.close();Promise.resolve(openSorting(id)).catch(error=>alert(error.message));};detail.append(button);}
    const list=document.createElement('dl');list.style.cssText='display:grid;grid-template-columns:110px minmax(0,1fr);gap:10px;margin:18px 0;font-size:14px';
    for(const [label,key] of fields){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(data[key]||'未入力');dd.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;margin:0';list.append(dt,dd);}detail.append(list);
    for(const [title,key] of [['発信部署の写真','mfgPhotoUrls'],['対応部署の写真','techPhotoUrls']]){
      const h=document.createElement('h3');h.textContent=title;detail.append(h);
      const photos=document.createElement('div');photos.style.cssText='display:flex;flex-wrap:wrap;gap:12px;margin:12px 0 20px';
      for(const raw of Array.isArray(data[key])?data[key]:[]){let url;try{url=new URL(raw);}catch{continue;}if(url.protocol!=='https:')continue;const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener';const img=document.createElement('img');img.src=url.href;img.alt=title;img.loading='lazy';img.style.cssText='width:150px;height:120px;object-fit:contain;background:#f5f5f5';a.append(img);photos.append(a);}
      if(!photos.children.length)photos.textContent='写真なし';detail.append(photos);
    }
    const close=document.createElement('button');close.type='button';close.textContent='閉じる';close.style.cssText='padding:10px 16px;font-size:14px;cursor:pointer;flex-shrink:0';close.onclick=()=>detail.close();h.append(close);
    root.append(detail);detail.showModal();
    const url=new URL(location.href);url.searchParams.set('notifyAnomalyId',id);history.replaceState(null,'',url);
  };
  const ui=mountNotifications({root,auth,call,openAnomaly,
    enablePush:async()=>{
      if(!await isSupported())throw Error('通知非対応です。iPhoneはSafariからホーム画面に追加して開いてください。');
      if(await Notification.requestPermission()!=='granted')throw Error('ブラウザの通知を許可してください。');
      const registration=await navigator.serviceWorker.register('./abnreport-push-sw.js',{scope:'./abnreport.html'});
      if(!registration.active)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('通知の準備が完了しません。再試行してください。')),15000);const worker=registration.installing||registration.waiting;if(!worker){clearTimeout(timer);resolve();return;}worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}});});
      return getToken(getMessaging(app),{vapidKey,serviceWorkerRegistration:registration});
    },disablePush:async()=>{if(await isSupported())await deleteToken(getMessaging(app));}
  });
  return {...ui,openAnomaly,clear:()=>{ui.clear();detail?.remove();},removeDevice:async()=>{const deviceId=localStorage.getItem('anomaly-notice-device');if(deviceId)await call({action:'remove',deviceId});}};
}

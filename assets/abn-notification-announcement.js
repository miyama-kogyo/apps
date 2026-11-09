export function createNotificationAnnouncement({dialog,onSettings,storage}){
  const shown=new Set();
  const key=uid=>`abnreport:feature-notice:notifications-20261109:${uid}`;
  const getStorage=()=>storage??window.localStorage;
  dialog.querySelector('[data-announcement-close]').addEventListener('click',()=>dialog.close());
  dialog.querySelector('[data-announcement-settings]').addEventListener('click',()=>{
    dialog.close();
    onSettings();
  });
  return {
    show(uid){
      if(!uid||dialog.open||shown.has(uid))return false;
      try{if(getStorage().getItem(key(uid))==='1')return false;}catch{}
      dialog.showModal();
      shown.add(uid);
      // Remember a successful display even if the page is reloaded before dismissal.
      try{getStorage().setItem(key(uid),'1');}catch{}
      return true;
    },
    clear(){if(dialog.open)dialog.close();}
  };
}

const fields=['date','operator','lotNo','quantity','goodQuantity','badQuantity','notes'];
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validateSortingResult(input){
  const result={};
  for(const [key,label,max,required] of [['date','選別日',10,true],['operator','担当者',100,true],['lotNo','対象ロット',120,false],['notes','結果メモ',2000,false]]){
    result[key]=String(input[key]??'').trim();
    if(required&&!result[key])throw Error(`${label}を入力してください。`);
    if(result[key].length>max)throw Error(`${label}は${max}文字以内で入力してください。`);
  }
  const date=new Date(result.date+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(result.date)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==result.date)throw Error('選別日が正しくありません。');
  for(const [key,label] of [['quantity','選別数'],['goodQuantity','良品数'],['badQuantity','不良数']]){
    const raw=String(input[key]??'').trim();
    if(!/^\d+$/.test(raw)||Number(raw)>1000000000)throw Error(`${label}は0以上の整数で入力してください（上限10億）。`);
    result[key]=Number(raw);
  }
  if(result.quantity===0)throw Error('選別数は1以上で入力してください。');
  if(result.goodQuantity+result.badQuantity!==result.quantity)throw Error('選別数と「良品数＋不良数」が一致していません。');
  return result;
}
export function sortingEntries(item){
  const map=item?.sortingResults;
  if(!map||typeof map!=='object'||Array.isArray(map))return [];
  return Object.entries(map).filter(([,row])=>row&&typeof row==='object').map(([id,row])=>({...row,id})).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.id).localeCompare(String(a.id)));
}
export function sortingTotals(item){
  return sortingEntries(item).reduce((sum,row)=>{sum.count++;for(const key of ['quantity','goodQuantity','badQuantity'])if(Number.isSafeInteger(row[key])&&row[key]>=0)sum[key]+=row[key];return sum;},{count:0,quantity:0,goodQuantity:0,badQuantity:0});
}
export function sortingSummary(item){
  const t=sortingTotals(item);
  return t.count?`${t.count}件 / 選別 ${t.quantity.toLocaleString('ja-JP')}・良品 ${t.goodQuantity.toLocaleString('ja-JP')}・不良 ${t.badQuantity.toLocaleString('ja-JP')}`:'未記録';
}
export function sortingCsv(item){
  const rows=[['整理No','部署','ライン','異常内容','選別日','担当者','対象ロット','選別数','良品数','不良数','結果メモ','記録者','最終更新者','改訂番号','記録ID'],...sortingEntries(item).map(r=>[item.serialNo,item.department,item.lineName,item.anomalyContent,r.date,r.operator,r.lotNo,r.quantity,r.goodQuantity,r.badQuantity,r.notes,r.createdBy?.email,r.updatedBy?.email,r.revision,r.id])];
  const cell=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
export function createSortingRepository({db,auth,doc,collection,getDoc,runTransaction,FieldPath,serverTimestamp,deviceId}){
  const checkId=id=>{if(typeof id!=='string'||!id||id.includes('/')||id.length>150)throw Error('案件または記録のIDが不正です。');};
  return {
    async load(id){
      checkId(id);if(!auth.currentUser)throw Error('ログインしてください。');
      const snap=await getDoc(doc(db,'anomalies',id));
      if(!snap.exists())throw Error('異常履歴が見つかりません。削除された可能性があります。');
      return {...snap.data(),_id:id};
    },
    async save({anomalyId,resultId,revision,operationId,input}){
      checkId(anomalyId);checkId(resultId);checkId(operationId);
      const values=validateSortingResult(input),user=auth.currentUser;
      if(!user)throw Error('ログインしてください。');
      const actor={uid:user.uid,email:user.email||''},ref=doc(db,'anomalies',anomalyId),audit=doc(collection(db,'auditLogs'));
      return runTransaction(db,async tx=>{
        if(auth.currentUser?.uid!==actor.uid)throw Error('ログイン状態が変わりました。開き直してください。');
        const snap=await tx.get(ref);
        if(auth.currentUser?.uid!==actor.uid)throw Error('ログイン状態が変わりました。開き直してください。');
        if(!snap.exists())throw Error('異常履歴が削除されています。保存できません。');
        const data=snap.data(),map=data.sortingResults||{};
        if(typeof map!=='object'||Array.isArray(map))throw Error('選別記録の形式を確認できません。管理者に連絡してください。');
        const previous=Object.hasOwn(map,resultId)?map[resultId]:null;
        if(previous?.operationId===operationId&&previous.updatedBy?.uid===actor.uid&&fields.every(k=>previous[k]===values[k]))return {...data,_id:anomalyId};
        if(previous?(previous.revision!==revision||revision===null):revision!==null)throw Error('別の画面で記録が更新されています。「再読み込み」してから修正してください。');
        if(!previous&&Object.keys(map).length>=100)throw Error('1案件あたりの選別記録は100件までです。');
        const entry={...values,revision:(previous?.revision||0)+1,operationId,createdBy:previous?.createdBy||actor,createdAt:previous?.createdAt||serverTimestamp(),updatedBy:actor,updatedAt:serverTimestamp()};
        // Update only this result; keep the anomaly and other operators' results untouched.
        tx.update(ref,new FieldPath('sortingResults',resultId),entry);
        tx.set(audit,{action:previous?'anomaly_sorting_edit':'anomaly_sorting_add',uid:actor.uid,email:actor.email,deviceId:deviceId||'',createdAt:serverTimestamp(),detail:{anomalyId,serialNo:data.serialNo||'',department:data.department||'',lineName:data.lineName||'',resultId,before:previous,after:entry,changedFields:['sortingResults']}});
        return {...data,sortingResults:{...map,[resultId]:entry},_id:anomalyId};
      });
    }
  };
}
export function createSortingController({load,save,getUser,onSaved=()=>{},document=globalThis.document}){
  const dialog=document.createElement('dialog');dialog.className='sorting-dialog';dialog.setAttribute('aria-labelledby','sortingTitle');
  dialog.innerHTML=`<header class="sorting-header"><h2 id="sortingTitle" tabindex="-1" autofocus>選別結果</h2><button type="button" data-close>閉じる</button></header>
    <div class="sorting-context"></div><p class="sorting-message" role="status" hidden></p>
    <div class="sorting-toolbar"><strong class="sorting-totals"></strong><div><button type="button" data-reload>再読み込み</button><button type="button" data-export>CSV出力</button></div></div>
    <div class="sorting-records"></div>
    <form class="sorting-form"><h3 data-form-title>選別結果を追加</h3><div class="sorting-grid">
    <label>選別日 *<input name="date" type="date" required></label><label>担当者 *<input name="operator" maxlength="100" required></label>
    <label class="sorting-lot">対象ロット<input name="lotNo" maxlength="120"></label>
    <label>選別数 *<input name="quantity" type="number" min="1" max="1000000000" step="1" inputmode="numeric" required></label>
    <label>良品数 *<input name="goodQuantity" type="number" min="0" max="1000000000" step="1" inputmode="numeric" required></label>
    <label>不良数 *<input name="badQuantity" type="number" min="0" max="1000000000" step="1" inputmode="numeric" required></label>
    <label class="sorting-wide">結果メモ<textarea name="notes" rows="3" maxlength="2000"></textarea></label></div>
    <p class="sorting-balance" aria-live="polite"></p><footer><button type="button" data-cancel hidden>修正をやめる</button><button type="submit" class="sorting-primary">追加して保存</button></footer></form>`;
  document.body.append(dialog);
  const $=selector=>dialog.querySelector(selector),form=$('form');
  let item=null,targetId=null,owner=null,generation=0,busy=false,dirty=false,revision=null,resultId=null,operationId=null;
  const uid=()=>getUser()?.uid;
  function message(text,error=false){const box=$('.sorting-message');box.textContent=text;box.hidden=!text;box.classList.toggle('sorting-error',error);}
  function setBusy(value){busy=value;dialog.querySelectorAll('button,input,textarea').forEach(el=>el.disabled=value);}
  function balance(){const values=['quantity','goodQuantity','badQuantity'].map(k=>form.elements[k].value);const target=$('.sorting-balance');target.textContent=values.every(v=>v!=='')?`良品数＋不良数：${Number(values[1])+Number(values[2])} / 選別数：${values[0]}`:'';}
  function reset(){form.reset();const now=new Date();form.elements.date.value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;form.elements.lotNo.value=item?.lotNo||'';form.elements.operator.value=getUser()?.displayName||'';revision=null;resultId=crypto.randomUUID();operationId=crypto.randomUUID();dirty=false;$('[data-form-title]').textContent='選別結果を追加';form.querySelector('[type=submit]').textContent='追加して保存';$('[data-cancel]').hidden=true;balance();}
  function render(){
    $('.sorting-context').textContent=`整理No ${item.serialNo||'-'} / ${item.department||'-'} / ${item.lineName||'-'}\n${item.occurrenceDate||''} ${item.occurrenceTime||''}\n${item.anomalyContent||''}`;
    $('.sorting-totals').textContent=sortingSummary(item);
    const rows=sortingEntries(item);$('[data-export]').hidden=!rows.length;
    $('.sorting-records').innerHTML=rows.length?`<div class="sorting-table-scroll"><table><thead><tr><th>選別日 / 担当者</th><th>対象ロット</th><th>選別数</th><th>良品数</th><th>不良数</th><th>結果メモ / 記録者</th><th>操作</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.date)}<br>${escapeHtml(r.operator)}</td><td>${escapeHtml(r.lotNo||'-')}</td><td class="sorting-number">${escapeHtml(r.quantity)}</td><td class="sorting-number">${escapeHtml(r.goodQuantity)}</td><td class="sorting-number">${escapeHtml(r.badQuantity)}</td><td><div class="sorting-notes">${escapeHtml(r.notes||'-')}</div><small>${escapeHtml(r.createdBy?.email||'')} ${r.revision>1?`/ 修正 ${escapeHtml(r.updatedBy?.email||'')}（${r.revision}版）`:''}</small></td><td><button type="button" data-result="${escapeHtml(r.id)}">修正</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="sorting-empty">選別結果は未記録です。</p>';
  }
  function mayDiscard(){return !dirty||globalThis.confirm('入力中の選別結果を破棄しますか？');}
  function close(force=false){if(!force&&(busy||!mayDiscard()))return;generation++;dialog.close();item=null;owner=null;dirty=false;}
  $('[data-close]').onclick=()=>close();dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  form.addEventListener('input',()=>{dirty=true;operationId=crypto.randomUUID();balance();});
  globalThis.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
  $('[data-cancel]').onclick=()=>{if(mayDiscard()){reset();message('');}};
  $('.sorting-records').addEventListener('click',e=>{
    const button=e.target.closest('[data-result]');if(!button||busy||!mayDiscard())return;
    const row=sortingEntries(item).find(r=>r.id===button.dataset.result);if(!row)return;
    reset();resultId=row.id;revision=row.revision;for(const key of fields)form.elements[key].value=row[key]??'';
    $('[data-form-title]').textContent='選別結果を修正';form.querySelector('[type=submit]').textContent='修正して保存';$('[data-cancel]').hidden=false;balance();form.elements.date.focus();
  });
  $('[data-export]').onclick=()=>{if(!item)return;const url=URL.createObjectURL(new Blob([sortingCsv(item)],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download=`選別結果_${String(item.serialNo||'案件').replace(/[\\/:*?"<>|]/g,'_')}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  async function open(id,discard=true){
    if(busy)return;if(!uid())throw Error('ログインしてください。');if(discard&&dialog.open&&!mayDiscard())return;
    const token=++generation;targetId=id;owner=uid();item=null;dirty=false;message('読み込み中...');form.hidden=true;$('[data-export]').hidden=true;$('.sorting-context').textContent='';$('.sorting-totals').textContent='';$('.sorting-records').textContent='';if(!dialog.open)dialog.showModal();setBusy(true);
    try{const result=await load(id);if(token!==generation||uid()!==owner)return;item=result;render();reset();form.hidden=false;message('');}
    catch(error){if(token===generation)message(error.message,true);}
    finally{if(token===generation)setBusy(false);}
  }
  $('[data-reload]').onclick=()=>{if(targetId)open(targetId);};
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!item||uid()!==owner)return;if(!form.reportValidity())return;
    const token=generation;const input=Object.fromEntries(new FormData(form));
    try{validateSortingResult(input);}catch(error){message(error.message,true);return;}
    setBusy(true);message('保存中...');
    try{const result=await save({anomalyId:item._id,resultId,revision,operationId,input});if(token!==generation||uid()!==owner)return;item=result;render();reset();message('選別結果を保存しました。');onSaved(item);}
    catch(error){if(token===generation)message(error.message,true);}
    finally{if(token===generation)setBusy(false);}
  });
  return {open,clear(){close(true);setBusy(false);},dialog};
}

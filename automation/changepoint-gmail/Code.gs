// Install with the dedicated Gmail owner. See README.md before starting triggers.
const NOTIFIER = Object.freeze({
  sender: 'miyama.firebase@gmail.com',
  project: 'abnreport-fd733',
  appUrl: 'https://miyama-kogyo.github.io/apps/changepoint.html',
  batchSize: 40,
  maxJobs: 200,
  maxSendsPerRun: 10
});

function notifierProperties() { return PropertiesService.getScriptProperties(); }

function verifyNotifierOwner() {
  if (Session.getEffectiveUser().getEmail().toLowerCase() !== NOTIFIER.sender) {
    throw new Error('送信元アカウント ' + NOTIFIER.sender + ' で実行してください。');
  }
}

function firestoreRead(path, body) {
  const options = {
    method: body ? 'post' : 'get',
    headers: {Authorization: 'Bearer ' + ScriptApp.getOAuthToken()},
    muteHttpExceptions: true
  };
  if (body) { options.contentType = 'application/json'; options.payload = JSON.stringify(body); }
  const base = 'https://firestore.googleapis.com/v1/projects/' + NOTIFIER.project + '/databases/(default)/documents';
  const response = UrlFetchApp.fetch(base + path, options);
  const code = response.getResponseCode();
  if (code === 404) return null;
  if (code < 200 || code >= 300) throw new Error('Firestore読み取りエラー HTTP ' + code);
  return JSON.parse(response.getContentText());
}

function firestoreValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('nullValue' in value) return null;
  return undefined;
}

function decodeDocument(doc) {
  const item = {_name: doc.name};
  Object.keys(doc.fields || {}).forEach(key => { item[key] = firestoreValue(doc.fields[key]); });
  return item;
}

function readDepartments() {
  let token = '', result = [];
  do {
    const page = firestoreRead('/masters/department/items?pageSize=100' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    result = result.concat((page.documents || []).map(decodeDocument));
    token = page.nextPageToken || '';
  } while (token);
  return result;
}

function allowedRecipients() {
  return (notifierProperties().getProperty('ALLOWED_RECIPIENTS') || '')
    .split(/[,;\s、，；]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
}

function parseDepartmentEmails(value){
  const text = String(value || '').trim();
  if (!text) return [];
  const emails = [...new Set(text.split(/[,;\s、，；]+/).filter(Boolean).map(x => x.toLowerCase()))];
  if (!emails.length || emails.some(x => x.length > 254 || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(x))){
    throw new Error('メールアドレスに誤りがあります。複数の宛先はカンマで区切ってください。');
  }
  if (emails.length > 50 || emails.join(',').length > 6000) throw new Error('宛先は50件以内、合計6000文字以内で入力してください。');
  return emails;
}

function previewNotifierConfiguration() {
  verifyNotifierOwner();
  const departments = readDepartments().map(d => ({department:d.name,name:d.approverName || '',approvalEmail:d.approverEmail || '',notificationEmail:d.notificationEmail || ''}));
  console.log(JSON.stringify({sender:NOTIFIER.sender,allowedRecipients:allowedRecipients(),departments:departments}, null, 2));
  return departments;
}

function startApprovalNotifications() {
  verifyNotifierOwner();
  if (!allowedRecipients().length) throw new Error('ALLOWED_RECIPIENTSに確認済みの承認先を設定してください。');
  readDepartments();
  const props = notifierProperties();
  // The first start never mails old records. Resume keeps the cursor and queued jobs.
  if (!props.getProperty('START_AT')) props.setProperty('START_AT', new Date().toISOString());
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'pollApprovalNotifications').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pollApprovalNotifications').timeBased().everyMinutes(5).create();
  props.setProperty('ENABLED', 'true');
}

function stopApprovalNotifications() {
  verifyNotifierOwner();
  notifierProperties().setProperty('ENABLED', 'false');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'pollApprovalNotifications').forEach(t => ScriptApp.deleteTrigger(t));
}

function notificationStage(item) {
  if (!(item.type === 'planned' || item.workflowManaged === true)) return '';
  if (['completed','canceled'].includes(item.switchStatus) || ['completed','canceled'].includes(item.switchState) ||
      item.activatedAt || item.effectiveAt || item.isActivated || item.effectiveStatus === 'active' || item.activationStatus === 'activated') return '';
  return ['draft','receiver_confirmed'].includes(item.approvalStatus) ? item.approvalStatus : '';
}

function notificationKey(item, kind, timestampField) {
  const source = !kind || kind === 'approval_request'
    ? item._name + '|' + item.approvalRequestedAt + '|' + item.approvalStatus
    : item._name + '|' + item[timestampField] + '|' + kind;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, source, Utilities.Charset.UTF_8);
  return 'job_' + digest.map(n => ('0' + ((n + 256) % 256).toString(16)).slice(-2)).join('');
}

function notificationStreams() {
  return [
    {kind:'approval_request',field:'approvalRequestedAt',cursor:'CURSOR'},
    {kind:'production_date',field:'productionDateUpdatedAt',cursor:'CURSOR_PRODUCTION_DATE'},
    {kind:'receiver_approved',field:'receiverApprovedAt',cursor:'CURSOR_APPROVED'}
  ];
}

function isResultNotificationCurrent(item, kind) {
  if (!item || !(item.type === 'planned' || item.workflowManaged === true)) return false;
  if (item.switchStatus === 'canceled' || item.switchState === 'canceled') return false;
  if (kind === 'production_date') return Boolean(item.occurrenceDate && item.productionDateUpdatedAt);
  if (kind === 'receiver_approved') return item.approvalStatus === 'approved';
  return false;
}

function collectApprovalRequests() {
  notificationStreams().forEach(collectNotificationStream);
}

function collectNotificationStream(stream) {
  const props = notifierProperties();
  const start = props.getProperty('START_AT');
  if (!start) throw new Error('開始日時が未設定です。');
  const state = props.getProperties();
  let count = Object.keys(state).filter(k => k.startsWith('job_')).length;
  if (count >= NOTIFIER.maxJobs) {
    console.warn('通知記録が上限のため新規取得を保留します。既存の保留通知を処理します。');
    return;
  }
  const query = {
    from: [{collectionId:'changepoints'}],
    where: {fieldFilter:{field:{fieldPath:stream.field},op:'GREATER_THAN_OR_EQUAL',value:{timestampValue:start}}},
    orderBy: [{field:{fieldPath:stream.field},direction:'ASCENDING'},{field:{fieldPath:'__name__'},direction:'ASCENDING'}],
    limit: NOTIFIER.batchSize
  };
  const cursor = JSON.parse(props.getProperty(stream.cursor) || 'null');
  if (cursor) query.startAt = {before:false,values:[{timestampValue:cursor.at},{referenceValue:cursor.name}]};
  const rows = firestoreRead(':runQuery', {structuredQuery:query});
  for (const row of rows) {
    if (!row.document) continue;
    const item = decodeDocument(row.document);
    if (stream.kind === 'approval_request' ? notificationStage(item) : isResultNotificationCurrent(item,stream.kind)) {
      const key = notificationKey(item,stream.kind,stream.field);
      if (!props.getProperty(key)) {
        if (count >= NOTIFIER.maxJobs) break;
        props.setProperty(key, JSON.stringify({document:item._name,requestedAt:item[stream.field],stage:item.approvalStatus,kind:stream.kind,timestampField:stream.field,state:'pending',createdAt:new Date().toISOString()}));
        count++;
      }
    }
    // Enqueue first, then advance. A crash cannot silently lose an unqueued request.
    props.setProperty(stream.cursor, JSON.stringify({at:item[stream.field],name:item._name}));
  }
}

function resolveRecipient(item, departments, kind) {
  const resultNotification = kind && kind !== 'approval_request';
  const department = resultNotification || item.approvalStatus === 'draft' ? item.planneddepartment : item.department;
  const matches = departments.filter(d => d.name === department);
  if (matches.length !== 1) throw new Error('承認先の部署が未登録、または重複しています: ' + (department || '未設定'));
  const master = matches[0];
  const separate = resultNotification;
  const emails = parseDepartmentEmails(separate ? master.notificationEmail : master.approverEmail);
  const name = separate ? department : master.approverName;
  if (!emails.length || !name) throw new Error('部署の通知先が未設定です: ' + department);
  const allowed = allowedRecipients();
  if (emails.some(email => !allowed.includes(email))) throw new Error('許可されていない宛先が含まれています: ' + department);
  return {email:emails.join(','),emails:emails,name:name,department:department};
}

function resultMessage(item, recipient, kind) {
  const labels = {production_date:'生産予定日の入力・変更',receiver_approved:'発生部署の承認完了'};
  const actors = {production_date:item.productionDateUpdatedBy,receiver_approved:item.receiverApprovedBy};
  const fields = {production_date:'productionDateUpdatedAt',receiver_approved:'receiverApprovedAt'};
  const label = labels[kind], timestamp = item[fields[kind]];
  const message = approvalMessage(item,recipient);
  message.subject = ('【変化点通知】' + label + ' / ' + (item.lineName || '-') + ' / 整理No ' + (item.serialNo || '-')).replace(/[\r\n]/g,' ').slice(0,180);
  message.body = [recipient.name + ' 様','',label + 'が行われました。','',
    'ライン: ' + (item.lineName || '-'),'工程: ' + (item.processName || '-'),'整理No: ' + (item.serialNo || '-'),
    '生産予定日: ' + (item.occurrenceDate || '未確定'),'作成部署: ' + (item.planneddepartment || '-'),
    '発生部署: ' + (item.department || '-'),'操作した人: ' + (actors[kind] || '-'),
    '操作日時: ' + Utilities.formatDate(new Date(timestamp),'Asia/Tokyo','yyyy/MM/dd HH:mm:ss'),
    '','変化点内容:',String(item.content || '').slice(0,4000),'','変化点カード:',
    NOTIFIER.appUrl + '?changepointId=' + encodeURIComponent(item._name.split('/').pop()),
    '','変化点管理アプリからの自動通知です。'].join('\n');
  return message;
}

function approvalMessage(item, recipient) {
  const stage = item.approvalStatus === 'draft' ? '発信部署承認' : '発生部署承認';
  const id = item._name.split('/').pop();
  const who = item.approvalStatus === 'draft' ? item.createdBy : item.receiverConfirmedBy;
  return {
    to:recipient.email,
    name:'変化点管理',
    subject:('【変化点承認依頼】' + stage + ' / ' + (item.lineName || '-') + ' / 整理No ' + (item.serialNo || '-')).replace(/[\r\n]/g,' ').slice(0,180),
    body:[recipient.name + ' 様','',stage + 'をお願いします。','',
      'ライン: ' + (item.lineName || '-'),'工程: ' + (item.processName || '-'),
      '整理No: ' + (item.serialNo || '-'),'実施予定日: ' + (item.occurrenceDate || '未確定'),
      '発信部署: ' + (item.planneddepartment || '-'),'発生部署: ' + (item.department || '-'),
      '作成・対応者: ' + (who || '-'),'','変化点内容:',String(item.content || '').slice(0,4000),
      '','承認画面:',NOTIFIER.appUrl + '?changepointId=' + encodeURIComponent(id),
      '','変化点管理アプリからの自動通知です。'].join('\n')
  };
}

function processApprovalJobs() {
  const props = notifierProperties();
  const departments = readDepartments();
  const state = props.getProperties();
  let remaining = MailApp.getRemainingDailyQuota();
  let sent = 0;
  const jobs = Object.keys(state).filter(k => k.startsWith('job_')).map(key => ({key:key,job:JSON.parse(state[key])}))
    .sort((a,b) => a.job.createdAt.localeCompare(b.job.createdAt));
  for (const entry of jobs) {
    const key = entry.key, job = entry.job;
    if (job.state !== 'pending' || (job.nextAttempt && Date.parse(job.nextAttempt) > Date.now())) continue;
    if (remaining < 1 || sent >= NOTIFIER.maxSendsPerRun) break;
    try {
      const prefix = 'projects/' + NOTIFIER.project + '/databases/(default)/documents';
      if (!job.document.startsWith(prefix + '/changepoints/')) throw new Error('不正な通知対象です。');
      const doc = firestoreRead(job.document.slice(prefix.length));
      const item = doc ? decodeDocument(doc) : null;
      const kind = job.kind || 'approval_request';
      const matches = kind === 'approval_request' ? item && notificationStage(item) === job.stage : isResultNotificationCurrent(item,kind);
      if (!matches || item[job.timestampField || 'approvalRequestedAt'] !== job.requestedAt) {
        job.state = 'skipped'; job.finishedAt = new Date().toISOString();
        props.setProperty(key, JSON.stringify(job)); continue;
      }
      const recipient = resolveRecipient(item, departments, kind);
      if (recipient.emails.length > remaining) {
        job.error = '全宛先分の送信可能数が不足しています。次回以降に再確認します。';
        props.setProperty(key,JSON.stringify(job));
        continue;
      }
      const message = kind === 'approval_request' ? approvalMessage(item, recipient) : resultMessage(item,recipient,kind);
      job.state = 'sending'; job.recipient = recipient.email;
      job.attemptedAt = new Date().toISOString();
      delete job.error;
      props.setProperty(key, JSON.stringify(job));
      // MailApp has no idempotency key. An interrupted send requires manual review.
      MailApp.sendEmail(message);
      job.state = 'sent'; job.finishedAt = new Date().toISOString();
      props.setProperty(key, JSON.stringify(job));
      remaining -= recipient.emails.length; sent++;
    } catch (error) {
      if (job.state === 'sending' || job.state === 'sent') {
        job.state = 'uncertain';
        job.error = '送信結果不明。送信済みメールを確認するまで自動再送しません。';
      } else {
        job.error = String(error.message || error).slice(0,300);
        job.nextAttempt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      }
      props.setProperty(key, JSON.stringify(job));
      console.error(key + ': ' + job.error);
    }
  }
}

function pruneNotificationJobs() {
  const props = notifierProperties(), state = props.getProperties();
  // The cursor prevents repeats after removal. Keep unresolved jobs for manual review.
  Object.keys(state).filter(k => k.startsWith('job_')).forEach(key => {
    const job = JSON.parse(state[key]);
    if (['sent','skipped'].includes(job.state) && Date.parse(job.finishedAt) < Date.now() - 86400000) props.deleteProperty(key);
  });
}

function pollApprovalNotifications() {
  verifyNotifierOwner();
  const props = notifierProperties();
  if (props.getProperty('ENABLED') !== 'true') return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    pruneNotificationJobs();
    collectApprovalRequests();
    processApprovalJobs();
    props.setProperty('LAST_SUCCESS_AT', new Date().toISOString());
    props.deleteProperty('LAST_ERROR');
  } catch (error) {
    props.setProperty('LAST_ERROR', String(error.message || error).slice(0,500));
    throw error;
  } finally { lock.releaseLock(); }
}

function showNotificationStatus() {
  verifyNotifierOwner();
  const state = notifierProperties().getProperties();
  console.log(JSON.stringify({enabled:state.ENABLED,start:state.START_AT,lastRun:state.LAST_SUCCESS_AT,error:state.LAST_ERROR,
    jobs:Object.keys(state).filter(k => k.startsWith('job_')).map(key => ({key:key,details:JSON.parse(state[key])}))},null,2));
}

// After checking Sent Mail, set REVIEW_JOB_KEY and REVIEW_ACTION (sent or retry).
function resolveUncertainNotification() {
  verifyNotifierOwner();
  const props = notifierProperties(), key = props.getProperty('REVIEW_JOB_KEY'), action = props.getProperty('REVIEW_ACTION');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('送信処理中です。少し待ってください。');
  try {
    const job = JSON.parse(props.getProperty(key || '') || 'null');
    if (!key || !key.startsWith('job_') || !job || !['sending','uncertain'].includes(job.state) || !['sent','retry'].includes(action)) throw new Error('確認対象または操作が不正です。');
    job.state = action === 'sent' ? 'sent' : 'pending';
    if (action === 'sent') job.finishedAt = new Date().toISOString();
    delete job.error; delete job.nextAttempt;
    props.setProperty(key,JSON.stringify(job));
    props.deleteProperty('REVIEW_JOB_KEY'); props.deleteProperty('REVIEW_ACTION');
  } finally { lock.releaseLock(); }
}

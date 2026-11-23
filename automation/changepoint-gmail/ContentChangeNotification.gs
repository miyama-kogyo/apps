// Content edits never create a new approval request or reset workflow stamps.
function resolveContentChangeRecipient(item, departments) {
  const addresses = [], names = [...new Set([item.planneddepartment,item.department])];
  names.forEach(name => {
    const matches = departments.filter(d => d.name === name);
    if (!name || matches.length !== 1) throw new Error('変更通知の部署が未登録、または重複しています: ' + (name || '未設定'));
    const master = matches[0], approvals = parseDepartmentEmails(master.approverEmail);
    if (!approvals.length) throw new Error('変更通知の承認先が未設定です: ' + name);
    addresses.push(...approvals);
    if (name === item.planneddepartment) {
      const notifications = parseDepartmentEmails(master.notificationEmail);
      if (!notifications.length) throw new Error('発信部署の通知先が未設定です: ' + name);
      addresses.push(...notifications);
    }
  });
  const emails = parseDepartmentEmails(addresses.join(','));
  if (!areDepartmentRecipientsAllowed(emails)) throw new Error('許可されていない変更通知先が含まれています。');
  return {email:emails.join(','),emails:emails,name:names.join('・'),department:names.join('・')};
}

function contentChangeMessage(item, recipient) {
  return {
    to:recipient.email,name:'変化点管理',
    subject:('【変化点 内容変更通知】' + (item.lineName || '-') + ' / 整理No ' + (item.serialNo || '-')).replace(/[\r\n]/g,' ').slice(0,180),
    body:[recipient.name + ' 承認者・発信部署の皆様','','変化点の登録内容が変更されました。',
      'チェック結果・承認スタンプ・進行状況は維持されています。このメールは再承認の依頼ではありません。','',
      '変更者: ' + item.contentChangedBy,
      '変更日時: ' + Utilities.formatDate(new Date(item.contentChangedAt),'Asia/Tokyo','yyyy/MM/dd HH:mm') + '（日本時間）',
      '発信部署: ' + (item.planneddepartment || '-'),'発生部署: ' + (item.department || '-'),
      'ライン: ' + (item.lineName || '-'),'工程: ' + (item.processName || '-'),'整理No: ' + (item.serialNo || '-'),
      '','変更内容:',String(item.contentChangeSummary || '').slice(0,16000),'',
      '変化点情報リンク:',NOTIFIER.appUrl + '?changepointId=' + encodeURIComponent(item._name.split('/').pop()) + '&view=detail',
      '','変化点管理アプリからの自動通知です。'].join('\n')
  };
}

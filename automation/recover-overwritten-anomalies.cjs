const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ID = 'abnreport-fd733';
const DATABASE = '(default)';
const BUCKET = 'abnreport-fd733.firebasestorage.app';
const apply = process.argv.includes('--apply');

const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const accessToken = JSON.parse(fs.readFileSync(configPath, 'utf8')).tokens?.access_token;
if (!accessToken) throw new Error('Firebase CLI access token was not found.');

const headers = { Authorization: `Bearer ${accessToken}` };
const documentsBase = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents`;

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json();
}

function decode(value) {
  if (!value) return null;
  for (const key of ['stringValue', 'timestampValue', 'integerValue', 'doubleValue', 'booleanValue']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  }
  if (value.nullValue !== undefined) return null;
  if (value.arrayValue) return (value.arrayValue.values || []).map(decode);
  if (value.mapValue) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  }
  return null;
}

function encode(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  }
  return { stringValue: String(value) };
}

function fields(object) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, encode(value)]));
}

function decodeDocument(document) {
  return {
    id: document.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)])),
  };
}

function anomalySignature(item) {
  return [
    item.serialNo || '', item.department || '', item.lineName || '',
    item.occurrenceDate || '', item.occurrenceTime || '', item.anomalyContent || '',
  ].join('\u001f');
}

async function loadAuditCreates() {
  const body = {
    structuredQuery: {
      from: [{ collectionId: 'auditLogs' }],
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
      limit: 2000,
    },
  };
  const rows = await request(`${documentsBase}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return rows
    .filter(row => row.document)
    .map(row => decodeDocument(row.document))
    .filter(row => row.action === 'anomaly_create' && row.detail?.anomalyId);
}

async function getDocument(collection, id) {
  const response = await fetch(`${documentsBase}/${collection}/${encodeURIComponent(id)}`, { headers });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return decodeDocument(await response.json());
}

async function listPhotos(anomalyId) {
  const prefix = encodeURIComponent(`anomalies/${anomalyId}/mfg/`);
  const result = await request(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?maxResults=1000&prefix=${prefix}`);
  return (result.items || []).map(item => ({
    name: item.name,
    createdAt: new Date(item.timeCreated),
    url: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(item.name)}?alt=media&token=${item.metadata?.firebaseStorageDownloadTokens || ''}`,
  })).sort((a, b) => a.createdAt - b.createdAt);
}

function assignPhotos(group, photos) {
  const assigned = new Set();
  const ordered = [...group].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  for (let index = 0; index < ordered.length; index += 1) {
    const row = ordered[index];
    const count = Number(row.detail?.mfgPhotoCount || 0);
    if (!count) {
      row.recoveredPhotoUrls = [];
      continue;
    }
    const currentTime = new Date(row.createdAt).getTime();
    const previousTime = index > 0 ? new Date(ordered[index - 1].createdAt).getTime() : -Infinity;
    const eligible = photos.filter(photo =>
      !assigned.has(photo.name)
      && photo.createdAt.getTime() > previousTime
      && photo.createdAt.getTime() <= currentTime + 120000
    );
    const selected = eligible.slice(-count);
    selected.forEach(photo => assigned.add(photo.name));
    row.recoveredPhotoUrls = selected.map(photo => photo.url);
  }
}

async function buildCandidates() {
  const auditRows = await loadAuditCreates();
  const groups = Map.groupBy(auditRows, row => row.detail.anomalyId);
  const candidates = [];

  for (const [anomalyId, group] of groups) {
    const signatures = new Set(group.map(row => anomalySignature(row.detail)));
    if (signatures.size < 2) continue;

    const current = await getDocument('anomalies', anomalyId);
    const currentSignature = current ? anomalySignature(current) : null;
    const photos = await listPhotos(anomalyId);
    assignPhotos(group, photos);

    let survivorSkipped = false;
    const seenAuditSignatures = new Set();
    for (const row of [...group].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))) {
      const signature = anomalySignature(row.detail);
      if (!survivorSkipped && currentSignature && signature === currentSignature) {
        survivorSkipped = true;
        continue;
      }
      // Exact retry logs represent the same registration, not separate anomalies.
      if (seenAuditSignatures.has(signature)) continue;
      seenAuditSignatures.add(signature);
      candidates.push({ ...row, sourceAnomalyId: anomalyId });
    }
  }
  return candidates.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function recoveryDocument(row) {
  const detail = row.detail || {};
  return {
    serialNo: detail.serialNo || '',
    department: detail.department || '',
    lineName: detail.lineName || '',
    occurrenceDate: detail.occurrenceDate || '',
    occurrenceTime: detail.occurrenceTime || '',
    anomalyContent: detail.anomalyContent || '',
    status: detail.status || 'complete',
    techRequest: detail.techRequest || '',
    mfgPhotoUrls: row.recoveredPhotoUrls || [],
    techPhotoUrls: [],
    lotNo: '', restartTime: '', actionTaken: '', traceback: '', qualityResponse: '',
    anomalyCategory: '', cause: '', handler: '', techHandler: '', lifespan: '',
    lifespanReached: '', maintenanceUnit: '', rootCauseAction: '', discoveryTiming: '',
    occurrenceTiming: '', recurrenceType: '', measureStatus: '', affirmation: '',
    previousCheck: '', changePointCategory: '', changePointContent: '',
    createdAt: new Date(row.createdAt),
    recoveredAt: new Date(),
    recoveredFromAudit: true,
    tags: ['復元データ'],
    recoveryAuditLogId: row.id,
    recoverySourceAnomalyId: row.sourceAnomalyId,
    recoveryNote: '上書き事故の監査ログから復元。空欄項目は監査ログに記録がなかった項目です。',
  };
}

async function createRecovered(row) {
  const id = `recovered_${row.id}`;
  if (await getDocument('anomalies', id)) return { id, status: 'already-exists' };
  await request(`${documentsBase}/anomalies?documentId=${encodeURIComponent(id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: fields(recoveryDocument(row)) }),
  });
  return { id, status: 'created' };
}

(async () => {
  const candidates = await buildCandidates();
  const summary = candidates.map(row => ({
    auditLogId: row.id,
    sourceAnomalyId: row.sourceAnomalyId,
    createdAt: row.createdAt,
    occurrenceDate: row.detail.occurrenceDate,
    occurrenceTime: row.detail.occurrenceTime,
    serialNo: row.detail.serialNo,
    department: row.detail.department,
    lineName: row.detail.lineName,
    anomalyContent: row.detail.anomalyContent,
    photoCount: (row.recoveredPhotoUrls || []).length,
  }));

  if (!apply) {
    console.log(JSON.stringify({ mode: 'dry-run', candidateCount: summary.length, candidates: summary }, null, 2));
    return;
  }

  const results = [];
  for (const row of candidates) results.push({ ...await createRecovered(row), auditLogId: row.id });
  console.log(JSON.stringify({ mode: 'apply', candidateCount: summary.length, results, candidates: summary }, null, 2));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

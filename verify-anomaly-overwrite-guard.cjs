const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('abnreport.html', 'utf8');

assert.match(html, /const existingDraft = await getDoc\(draftRef\)/);
assert.match(html, /if \(existingDraft\.exists\(\)\) \{[\s\S]*?addDoc\(collection\(db, 'anomalies'\), base\)/);
assert.match(html, /else \{[\s\S]*?setDoc\(draftRef, base\)/);
assert.match(html, /url\.searchParams\.delete\('anomalyId'\)/);
assert.match(html, /clearCurrentAnomalyId\(\);/);
assert.match(html, /avoidedOverwriteId/);

console.log('anomaly overwrite guard verification passed');

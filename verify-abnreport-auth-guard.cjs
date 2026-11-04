const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('abnreport.html', 'utf8');

assert.match(html, /function canUseAbnreportWithUser\(user\)/);
assert.match(html, /if \(!user \|\| user\.isAnonymous\) return false/);
assert.match(html, /providerIds\.includes\('password'\)/);
assert.match(html, /providerIds\.includes\('google\.com'\)/);
assert.match(html, /if \(!canUseAbnreportWithUser\(user\)\) \{[\s\S]*?await signOut\(auth\)/);
assert.match(html, /異常履歴アプリのアカウントでログインしてください/);

console.log('abnreport auth guard verification passed');

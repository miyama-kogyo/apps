const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const modules = 'C:/Users/ysugimoto/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/';
const { chromium, webkit } = require(modules + 'playwright');
const { PDFDocument } = require(modules + 'pdf-lib');
const source = process.argv[2] || (fs.existsSync('変化点管理システム.html') ? '変化点管理システム.html' : 'changepoint.html');
const html = fs.readFileSync(source, 'utf8');
const slice = (a, b) => { const start = html.indexOf(a), end = html.indexOf(b, start); assert(start >= 0 && end > start); return html.slice(start, end); };
let printed = '';
const ctx = {
  window: { open: () => ({ closed: false, document: { body: {}, open() {}, write(h) { printed = h; }, close() {} } }) },
  console, Date, getRecordChecklist: x => x.checklistItems,
  boardStatus: () => '事後チェック待ち', approvalStatusOf: x => x.approvalStatus,
  approvalStatusLabel: () => '発生部署 対応待ち', getProposalDate: () => '2026-10-12',
  actualSwitchLabel: () => '未記録', buildWorkflowUrl: () => 'https://example.com/workflow',
  buildProductionDateUrl: () => 'https://example.com/production',
  createQrDataUrl: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1sAAAAASUVORK5CYII='
};
vm.createContext(ctx);
vm.runInContext(slice('    function escapeHtml', '    function csvEscape') +
  slice('    function checklistResult', '    function allRoleChecksDone') +
  slice('    function workflowStampEntries', '    function readStampName') +
  slice('    function renderChangeTicket', '    const todayCardQrCache') +
  slice('    window.printChangeCard =', '    function relatedAnomalyHtml'), ctx);
const checks = [
  ['変化点後の安全面に問題はないか', '変化点後の危険箇所がないこと'],
  ['変更前後の切替の段取りはしたか（旧材・在庫・先入れ先出し等）', '混在なく切替できること'],
  ['切替後の出来栄え確認はしたか', '製品検査・条件寸法・外観等が規格内であること'],
  ['作業の生産性は低下していないか', '切替前と同等の時間で作業できること'],
  ['標準書の修正は出来ているか', '標準書に変更内容が反映されていること'],
  ['図面で指定された材料が使用されているか', '指定された材料であること'],
  ['変更後の作業指導は実施したか', '指示どおり正しく作業できていること']
].map(([label, criteria], i) => ({key: 'check-' + i, label, criteria, receiverResult: i === 0 ? 'ok' : ''}));
const base = { _id: 'print-fixture', type: 'planned', category: '材料', approvalStatus: 'sender_approved',
  issuedDate: '2026-10-12', occurrenceDate: '2026-10-13', planneddepartment: '品質', department: '1G',
  lineName: '94-300', processName: '順送プレス', serialNo: '7106', content: '材料・材質の変更',
  createdBy: '作成者', createdAt: '2026-10-12T18:11:00+09:00', senderApprovedBy: '承認者', senderApprovedAt: '2026-10-13T07:12:00+09:00', checklistItems: checks };
const cases = [
  ['planned-seven', base],
  ['planned-long', { ...base, content: '条件を変更し、製品の寸法と作業性を確認します。'.repeat(20), checklistItems: Array.from({length: 22}, (_, i) => ({...checks[i % checks.length], key: 'long-' + i})) }],
  ['unplanned-four', { ...base, type: 'sudden', category: '設備', responseDepartment: '製造', checklistItems: checks.slice(0, 4) }]
];
async function main() {
  const baseline = process.env.PRINT_BASELINE === '1';
  const out = path.resolve('outputs/print-a4' + (baseline ? '-before' : ''));
  fs.mkdirSync(out, {recursive: true});
  for (const engine of ['chromium', 'webkit']) {
    const browser = await (engine === 'chromium' ? chromium.launch({headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe'}) : webkit.launch({headless: true}));
    try {
      const page = await browser.newPage({viewport: {width: 800, height: 1123}});
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.emulateMedia({media: 'print'});
      for (const [name, record] of cases) {
        await ctx.window.printChangeCard(record);
        await page.setContent(printed.replace('window.print();', ''), {waitUntil: 'load'});
        await page.evaluate(async () => { await document.fonts.ready; fitCards(); });
        const layout = await page.evaluate(() => Array.from(document.querySelectorAll('.ticket')).map(card => {
          const rect = card.getBoundingClientRect(), footer = card.querySelector('footer').getBoundingClientRect(), slot = card.parentElement.getBoundingClientRect();
          return {font: getComputedStyle(card).fontSize, bottom: rect.bottom, footer: footer.bottom, top: rect.top, right: rect.right, slotBottom: slot.bottom, scale: card.style.transform};
        }));
        if (!baseline) {
          assert.equal(await page.locator('.card-slot').count(), 2);
          assert.equal(await page.locator('.cut').isVisible(), true);
          for (const card of layout) { assert(card.bottom <= card.slotBottom + 1); assert(card.footer <= card.bottom + 1); assert(card.right <= 735); }
          assert(layout[1].bottom <= 1052);
          if (name === 'planned-seven') assert(parseFloat(layout[0].font) >= 11 && !layout[0].scale, 'normal card must not be scaled excessively');
          const once = JSON.stringify(layout);
          await page.evaluate(() => fitCards());
          assert.equal(await page.locator('.ticket').first().evaluate(el => el.style.transform), layout[0].scale, once);
        }
        await page.screenshot({path: path.join(out, `${name}-${engine}.png`), fullPage: true});
        if (engine === 'chromium') {
          for (const background of [true, false]) {
            const pdf = await page.pdf({preferCSSPageSize: true, printBackground: background, displayHeaderFooter: false});
            const parsed = await PDFDocument.load(pdf);
            fs.writeFileSync(path.join(out, `${name}-${background ? 'color' : 'plain'}.pdf`), pdf);
            console.log(name, {pages: parsed.getPageCount(), size: parsed.getPages()[0].getSize(), background, layout});
            if (!baseline) { assert.equal(parsed.getPageCount(), 1); assert(Math.abs(parsed.getPages()[0].getSize().height - 841.89) < 2); }
          }
        }
        if (!baseline) assert.equal(await page.locator('[data-card-qr]').count(), record.type === 'sudden' ? 0 : 4);
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
  console.log(baseline ? 'Baseline measured' : 'PASS A4: original/copy on one page, repeated print fitting, all rows/footer inside slots, planned QR and unplanned no QR; no live writes.');
}
main().catch(e => {console.error(e);process.exitCode = 1;});

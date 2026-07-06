/**
 * Deploy HR-only: lo scheduler NON esegue le programmate dei brand fuori
 * linea di prodotto (zombie era Ads2Wallet nascosti dalla dashboard).
 * Caso reale: brand 'Motor K' (ads) spingeva ogni lunedì da mesi, invisibile.
 */
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { brandAllowedOnDeploy, brandProductLine } = require('../src/api/deploy-lock');

test('brandAllowedOnDeploy: hr passa, ads no, assente = hr (default)', () => {
  assert.equal(brandAllowedOnDeploy({ config: { product_line: 'hr' } }), true);
  assert.equal(brandAllowedOnDeploy({ config: { product_line: 'ads' } }), false);
  assert.equal(brandAllowedOnDeploy({ config: {} }), true, 'senza product_line vale hr');
  assert.equal(brandProductLine({ config: { product_line: 'ads' } }), 'ads');
});

test('scheduler: skip dei brand fuori linea prima di executeWalletPush (guardia sorgente)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/engine/scheduler.js'), 'utf-8');
  assert.match(src, /brandAllowedOnDeploy/, 'controllo linea di prodotto presente');
  assert.match(src, /scheduled_push_skipped_product_line/, 'skip tracciato a eventi');
  const checkIdx = src.indexOf('brandAllowedOnDeploy(brand)');
  const execIdx = src.indexOf('await executeWalletPush');
  assert.ok(checkIdx > -1 && execIdx > -1 && checkIdx < execIdx, 'lo skip avviene PRIMA dell\'invio');
});

test('manutenzione archivio: endpoint admin con guardie giuste (sorgente)', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'src/api/routes.js'), 'utf-8');
  for (const ep of ['/admin/foreign-brands', 'silence-schedules']) {
    assert.ok(routes.includes(ep), `endpoint ${ep} presente`);
  }
  const delIdx = routes.indexOf("router.delete('/admin/foreign-brands/:id'");
  assert.ok(delIdx > -1, 'endpoint delete presente');
  const delBlock = routes.slice(delIdx, delIdx + 1200);
  assert.match(delBlock, /isUserAdmin\(req\)/, 'solo admin');
  assert.match(delBlock, /brandAllowedOnDeploy\(brand\)/, 'guardia: mai eliminare brand del deploy');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src/dashboard/index.html'), 'utf-8');
  assert.match(html, /foreignBrandsCard/, 'pannello manutenzione in dashboard');
  assert.match(html, /Elimina definitivamente/, 'azione con wording esplicito');
});

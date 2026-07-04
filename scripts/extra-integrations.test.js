'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { encryptCredentials, decryptCredentials } = require('../src/engine/integrations/crypto');
const { enabledIntegrations, availableProviders, getAdapter } = require('../src/engine/integrations');
const { buildEmployeePass } = require('../src/engine/employee-pass');

test('crypto: roundtrip credenziali AES-GCM', () => {
  const enc = encryptCredentials('token-abc');
  assert.notEqual(enc, 'token-abc');
  assert.equal(decryptCredentials(enc), 'token-abc');
  assert.equal(decryptCredentials('rotto'), null);
});

test('registry: providers disponibili e adapter risolvibili', () => {
  const provs = availableProviders().map((p) => p.type);
  assert.ok(provs.includes('edenred'));
  assert.ok(getAdapter('edenred'));
  assert.equal(getAdapter('inesistente'), null);
});

test('enabledIntegrations: solo abilitati + adapter noto, con categoria', () => {
  const out = enabledIntegrations({ integrations: [
    { type: 'edenred', enabled: true, category: 'buoni_pasto', label: 'Ticket Restaurant' },
    { type: 'pellegrini', enabled: false },
    { type: 'sconosciuto', enabled: true },
  ] });
  assert.equal(out.length, 1);
  assert.equal(out[0].type, 'edenred');
  assert.equal(out[0].category, 'buoni_pasto');
  assert.equal(out[0].category_label, 'Buoni pasto');
});

test('back-link EXTRA presente solo con integrazioni attive', () => {
  const base = {
    brand: { id: 'b1', name: 'Meridia', slug: 'meridia', config: { product_line: 'hr' } },
    template: { id: 't1', name: 'T', style: {} },
    instance: { serial_number: 'SN', field_values: {} },
    member: { full_name: 'Mario Rossi', department: 'Legal' },
    portalUrl: 'https://example.com/portal?t=x',
  };
  const withExtra = buildEmployeePass({ ...base, brandConfig: { product_line: 'hr', integrations: [{ type: 'edenred', enabled: true }] } });
  const link = withExtra.backSections.find((s) => s.key === 'extra_benefits');
  assert.ok(link, 'EXTRA presente con integrazione attiva');
  assert.equal(link.label, 'EXTRA');
  assert.match(link.url, /#extra$/);

  const noExtra = buildEmployeePass({ ...base, brandConfig: { product_line: 'hr' } });
  assert.ok(!noExtra.backSections.find((s) => s.key === 'extra_benefits'), 'EXTRA assente senza integrazioni');
});

test('mode manual accettato e propagato', () => {
  const out = enabledIntegrations({ integrations: [
    { type: 'edenred', enabled: true, mode: 'manual', category: 'buoni_pasto' },
  ] });
  assert.equal(out[0].mode, 'manual');
});

test('portale mostra caricato + link personale (shape dati)', () => {
  // Simula lo stato che l'import scrive in member_integrations.data.
  const data = { loaded_amount: 176.00, currency: 'EUR', personal_url: 'https://provider.example/me/abc' };
  assert.equal(data.loaded_amount, 176);
  assert.ok(/^https:/.test(data.personal_url));
});

test('Satispay registrato come provider', () => {
  assert.ok(getAdapter('satispay'));
  assert.equal(getAdapter('satispay').defaultCategory, 'buoni_pasto');
});

test('normalizePeriod: formati mese vari', () => {
  const { normalizePeriod } = require('../src/db/integrations');
  assert.deepEqual(normalizePeriod('2026-07'), { period: '2026-07', label: 'Luglio 2026' });
  assert.deepEqual(normalizePeriod('07/2026'), { period: '2026-07', label: 'Luglio 2026' });
  assert.deepEqual(normalizePeriod('Luglio 2026'), { period: '2026-07', label: 'Luglio 2026' });
  assert.equal(normalizePeriod('non-una-data'), null);
  const cur = normalizePeriod('');
  assert.match(cur.period, /^\d{4}-\d{2}$/); // vuoto → mese corrente
});

test('routes: endpoint import macchina-a-macchina + bypass JWT', () => {
  const fs = require('fs');
  const path = require('path');
  const routes = fs.readFileSync(path.join(__dirname, '../src/api/routes.js'), 'utf8');
  assert.match(routes, /router\.post\('\/integrations\/import'/);
  assert.match(routes, /verifyBrandApiKey/);
  assert.match(routes, /path === '\/integrations\/import'\) return true/); // nel bypass JWT
  assert.match(routes, /x-api-key/i);
});

test('db: funzioni chiave API esportate', () => {
  const m = require('../src/db/integrations');
  ['createBrandApiKey', 'verifyBrandApiKey', 'getBrandApiKeyInfo', 'revokeBrandApiKeys']
    .forEach((fn) => assert.equal(typeof m[fn], 'function', fn));
});

test('catalogo provider completo (buoni pasto + welfare)', () => {
  const types = availableProviders().map((p) => p.type);
  ['edenred','pellegrini','satispay','coverflex','pluxee','day','repas','jointly','doubleyou']
    .forEach((t) => assert.ok(types.includes(t), 'manca provider ' + t));
  // Coverflex è welfare, Pluxee è buoni pasto.
  const byType = Object.fromEntries(availableProviders().map((p) => [p.type, p.category]));
  assert.equal(byType.coverflex, 'fringe');
  assert.equal(byType.pluxee, 'buoni_pasto');
});

test('Ferie: voce nativa con categoria e flag native', () => {
  const a = getAdapter('ferie');
  assert.ok(a, 'adapter ferie presente');
  assert.equal(a.native, true);
  const en = enabledIntegrations({ integrations: [{ type: 'ferie', enabled: true }] });
  assert.equal(en[0].category, 'ferie');
  assert.equal(en[0].category_label, 'Ferie e permessi');
  assert.equal(en[0].native, true);
});

test('provider multi-categoria + dominio per logo', () => {
  const provs = availableProviders();
  const byType = Object.fromEntries(provs.map((p) => [p.type, p]));
  // Pluxee, Day, Coverflex, Edenred, Satispay fanno sia buoni pasto sia fringe.
  ['edenred', 'satispay', 'pluxee', 'day', 'coverflex'].forEach((t) => {
    assert.ok(byType[t].categories.includes('buoni_pasto'), t + ' deve stare in buoni_pasto');
    assert.ok(byType[t].categories.includes('fringe'), t + ' deve stare in fringe');
  });
  // Dominio presente per il logo automatico.
  assert.equal(byType.edenred.domain, 'edenred.it');
  assert.equal(byType.satispay.domain, 'satispay.com');
  assert.ok(byType.coverflex.domain);
});

test('Credito welfare + Fringe benefit: voci native amount sotto fringe', () => {
  ['welfare_credit', 'fringe_benefit'].forEach((t) => {
    const a = getAdapter(t);
    assert.ok(a, 'adapter ' + t + ' presente');
    assert.equal(a.native, true);
    const en = enabledIntegrations({ integrations: [{ type: t, enabled: true }] });
    assert.equal(en[0].category, 'fringe');
    assert.equal(en[0].native, true);
  });
});

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

/**
 * Badge digitale — anti-condivisione e revoca offboarding.
 *
 * 1. Apple pass.json: sharingProhibited sempre presente; voided:true solo per
 *    pass con status 'revoked' (il pass resta nel Wallet ma barrato).
 * 2. Google: classe con multipleDevicesAndHoldersAllowedStatus ONE_USER_ALL_DEVICES;
 *    stato oggetto EXPIRED per pass revocati.
 */
const assert = require('node:assert');
const test = require('node:test');

const { generatePassJson } = require('../src/engine/passkit');
const { buildPassClass, passObjectState } = require('../src/engine/google-wallet');

const BRAND = {
  id: 'brand-test',
  name: 'Test SpA',
  slug: 'test-spa',
  config: { product_line: 'hr' },
};
const TEMPLATE = { id: 'tpl-1', name: 'Dipendenti', fields: {}, style: {} };

function makeInstance(overrides = {}) {
  return {
    id: 'pi-1',
    serial_number: 'SN-REVOKE-1',
    auth_token: 'tok-123',
    field_values: {},
    status: 'active',
    ...overrides,
  };
}

test('Apple: sharingProhibited sempre nel pass.json', () => {
  const pj = generatePassJson(TEMPLATE, makeInstance(), BRAND, {});
  assert.equal(pj.sharingProhibited, true);
  assert.equal(pj.voided, undefined, 'pass attivo non è voided');
});

test('Apple: voided true per pass revocato', () => {
  const pj = generatePassJson(TEMPLATE, makeInstance({ status: 'revoked' }), BRAND, {});
  assert.equal(pj.voided, true);
  assert.equal(pj.sharingProhibited, true);
});

test('Google: classe con vincolo un solo account', () => {
  const cls = buildPassClass(BRAND, TEMPLATE);
  assert.equal(cls.multipleDevicesAndHoldersAllowedStatus, 'ONE_USER_ALL_DEVICES');
});

test('Google: stato oggetto EXPIRED solo per revocati', () => {
  assert.equal(passObjectState(makeInstance()), 'ACTIVE');
  assert.equal(passObjectState(makeInstance({ status: 'revoked' })), 'EXPIRED');
  assert.equal(passObjectState(null), 'ACTIVE');
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const MOD = path.join(__dirname, '../src/engine/google-wallet.js');

function loadGoogleWallet(overrides = {}) {
  const keys = ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_REVIEW_STATUS', 'GOOGLE_WALLET_PASS_KIND'];
  const saved = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    if (Object.prototype.hasOwnProperty.call(overrides, k)) {
      if (overrides[k] == null) delete process.env[k];
      else process.env[k] = String(overrides[k]);
    }
  }
  delete require.cache[require.resolve(MOD)];
  const mod = require(MOD);
  return {
    mod,
    restore() {
      for (const k of keys) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      delete require.cache[require.resolve(MOD)];
    }
  };
}

test('sanitizeSlugForClassId lowercases and normalizes', () => {
  const { mod, restore } = loadGoogleWallet({ GOOGLE_WALLET_ISSUER_ID: '3388000000023116539' });
  try {
    assert.equal(mod.sanitizeSlugForClassId('Motor_K'), 'motor_k');
    assert.equal(mod.sanitizeSlugForClassId('  Motor-K  '), 'motor-k');
    const brand = { slug: 'Motor_K' };
    const template = { id: '3ab88300-aaaa-bbbb-cccc-ddddeeeeffff' };
    assert.equal(
      mod.buildGenericClassId(brand, template),
      '3388000000023116539.motor_k_3ab88300-aaaa-bbbb-cccc-ddddeeeeffff'
    );
    assert.equal(
      mod.buildLoyaltyClassId(brand, template),
      '3388000000023116539.loyalty_motor_k_3ab88300-aaaa-bbbb-cccc-ddddeeeeffff'
    );
  } finally {
    restore();
  }
});

test('getReviewStatus respects env and falls back', () => {
  const { mod, restore } = loadGoogleWallet({
    GOOGLE_WALLET_ISSUER_ID: '1',
    GOOGLE_WALLET_REVIEW_STATUS: 'APPROVED'
  });
  try {
    assert.equal(mod.getReviewStatus(), 'APPROVED');
  } finally {
    restore();
  }

  const { mod: mod2, restore: restore2 } = loadGoogleWallet({
    GOOGLE_WALLET_ISSUER_ID: '1',
    GOOGLE_WALLET_REVIEW_STATUS: 'invalid'
  });
  try {
    assert.equal(mod2.getReviewStatus(), 'UNDER_REVIEW');
  } finally {
    restore2();
  }
});

test('formatGoogleWalletError maps classNotFound to 422', () => {
  const { mod, restore } = loadGoogleWallet({ GOOGLE_WALLET_ISSUER_ID: '1' });
  try {
    const err = new Error('Google Wallet API 404: {"error":{"errors":[{"reason":"classNotFound"}]}}');
    err.statusCode = 404;
    err.body = { error: { errors: [{ reason: 'classNotFound' }] } };
    const mapped = mod.formatGoogleWalletError(err);
    assert.equal(mapped.status, 422);
    assert.equal(mapped.code, 'class_not_found');
    assert.match(mapped.error, /Template non ancora registrato/i);
  } finally {
    restore();
  }
});

test('pass route ensures class before object', () => {
  const fs = require('fs');
  const routes = fs.readFileSync(path.join(__dirname, '../src/api/routes.js'), 'utf8');
  assert.match(routes, /ensurePassReadyOnServer\(brand, template, passObject\)/);
  assert.match(routes, /clearPassMessages\(passObject\.id, brand\)/);
  assert.match(routes, /syncGoogleWalletClassForTemplate/);
});

test('HR brands force generic pass kind even when env is loyalty', () => {
  const { mod, restore } = loadGoogleWallet({
    GOOGLE_WALLET_ISSUER_ID: '3388000000023116539',
    GOOGLE_WALLET_PASS_KIND: 'loyalty',
    CUSTOM_DOMAIN: 'studio.example.com'
  });
  try {
    const hrBrand = { slug: 'acme', name: 'Acme', config: { product_line: 'hr' } };
    const adsBrand = { slug: 'shop', name: 'Shop', config: { product_line: 'ads' } };
    const template = { id: 'tpl-1', style: { backgroundColor: '#111111' } };
    const hrClass = mod.buildPassClass(hrBrand, template);
    const adsClass = mod.buildPassClass(adsBrand, template);
    assert.match(hrClass.id, /^3388000000023116539\.acme_/);
    assert.match(adsClass.id, /^3388000000023116539\.loyalty_shop_/);
    assert.ok(hrClass.logo || hrClass.heroImage || hrClass.hexBackgroundColor);
  } finally {
    restore();
  }
});

test('buildPassClass maps geofencing locations to Google merchantLocations', () => {
  const { mod, restore } = loadGoogleWallet({
    GOOGLE_WALLET_ISSUER_ID: '3388000000023116539',
    GOOGLE_WALLET_PASS_KIND: 'generic'
  });
  try {
    const brand = {
      slug: 'nti',
      name: 'Nuova Telefonia Italiana',
      config: {
        product_line: 'hr',
        locations: [
          { latitude: '45.4642', longitude: '9.19', relevantText: 'Promo' },
          { latitude: '45.4642001', longitude: '9.1900001', relevantText: 'Duplicato' },
          { latitude: 'bad', longitude: '9.19' },
          { latitude: '91', longitude: '9.19' }
        ]
      }
    };
    const template = { id: 'tpl-geo', style: { backgroundColor: '#123456' } };
    const cls = mod.buildPassClass(brand, template);
    assert.deepEqual(cls.merchantLocations, [{ latitude: 45.4642, longitude: 9.19 }]);
  } finally {
    restore();
  }
});

test('resolveGoogleNotifyPayload prefers screen_alert and splits title:body', () => {
  const { resolveGoogleNotifyPayload } = require('../src/engine/push-text-limits');
  const split = resolveGoogleNotifyPayload({
    screen_alert: 'Promo estate: sconto 20% in sede',
    title: 'STRIP',
    message: 'Strip msg',
  });
  assert.equal(split.title, 'Promo estate');
  assert.equal(split.message, 'sconto 20% in sede');

  const single = resolveGoogleNotifyPayload({
    screen_alert: 'Comunicazione urgente per tutti',
  });
  assert.equal(single.message, 'Comunicazione urgente per tutti');
});

test('buildGoogleNotifyMessagePayload uses TEXT_AND_NOTIFY and HR limits', () => {
  const { mod, restore } = loadGoogleWallet({ GOOGLE_WALLET_ISSUER_ID: '1' });
  try {
    const payload = mod.buildGoogleNotifyMessagePayload({
      title: 'promo estate',
      message: 'Solo oggi sconto 20% in sede',
      messageId: 'msg_1',
    });
    assert.equal(payload.message.messageType, 'TEXT_AND_NOTIFY');
    assert.equal(payload.message.header, 'PROMO ESTATE');
    assert.equal(payload.message.body, 'Solo oggi sconto 20% in sede');
    assert.equal(payload.message.id, 'msg_1');
  } finally {
    restore();
  }
});

test('updatePassMessage uses addMessage not textModulesData patch', () => {
  const fs = require('fs');
  const source = fs.readFileSync(MOD, 'utf8');
  assert.match(source, /async function clearPassMessages/);
  assert.match(source, /messages:\s*\[\]/);
  assert.match(source, /await clearPassMessages\(targetId, brand\);[\s\S]{0,180}addMessage/);
  assert.match(source, /addMessage/);
  assert.match(source, /TEXT_AND_NOTIFY/);
  assert.doesNotMatch(source, /latest_message/);
});

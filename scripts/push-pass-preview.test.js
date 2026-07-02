'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPushPassPreview } = require('../src/engine/push-pass-preview');

test('buildPushPassPreview returns lock screen and front fields', async () => {
  const brand = {
    name: 'Nuova Telefonia Italiana',
    config: { product_line: 'hr' },
  };
  const template = { style: { images: {} }, fields: {} };
  const preview = await buildPushPassPreview({
    brand,
    template,
    body: {
      title: '2X1 OCCHIALI',
      message: 'Solo fino a domenica',
      update_pass: true,
      back_details: 'Non cumulabile.',
      include_pass_link: true,
      pass_link_url: 'https://example.com/offerta',
      pass_link_label: 'Scopri offerta',
    },
  });

  assert.match(preview.lock_screen.body, /2X1 OCCHIALI/);
  assert.match(preview.lock_screen.body, /Solo fino a domenica/);
  assert.equal(preview.header, null);
  assert.ok(preview.secondary.some((f) => f.label === 'NOME'));
  // Il carrier notifica vive nei headerFields: nessun campo auxiliary visibile.
  assert.equal(preview.auxiliary.find((f) => f.key === 'announcement'), undefined);
  assert.ok(preview.back.some((r) => r.key === 'dynamic_push_link'));
  assert.ok(preview.back.some((r) => r.key === 'push_back_details'));
  assert.equal(preview.back.find((r) => r.key === 'wallet_push_alert'), undefined);
  assert.ok(preview.strip_preview?.startsWith('data:image/png;base64,'));
});

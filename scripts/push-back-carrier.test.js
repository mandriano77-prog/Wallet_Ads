/**
 * Esperimento carrier retro (stile Maisons du Monde) — variante SOLO test.
 *
 * Con push_announcement.carrier === 'back':
 *  - il fronte NON cambia (niente token nell'header, niente campo announcement)
 *  - la notifica viaggia su un back field visibile: value = testo + token
 *    invisibile, changeMessage = '%@'
 * Senza carrier: comportamento identico al meccanismo blindato.
 */
const assert = require('node:assert');
const test = require('node:test');

const {
  buildEmployeePass,
  toApplePass,
} = require('../src/engine/employee-pass');
const { parsePushAnnouncementRecord } = require('../src/engine/pass-push-state');

const BRAND = {
  id: 'brand-test',
  name: 'Test SpA',
  config: {
    product_line: 'hr',
    pass_header_hint: { key: 'info_hint', label: 'INFO', value: 'CLICCA SUI 3 PUNTINI' },
  },
};
const TEMPLATE = { id: 'tpl-test', name: 'Dipendenti', fields: {}, style: {} };
const MEMBER = { id: 'm1', first_name: 'Mario', last_name: 'Rossi' };

function makeInstance(ann) {
  return {
    id: 'pi1',
    serial_number: 'SN-TEST-1',
    member_id: 'm1',
    push_announcement: JSON.stringify(ann),
  };
}

function buildApple(instance) {
  const ep = buildEmployeePass({
    brand: BRAND,
    template: TEMPLATE,
    instance,
    member: MEMBER,
    apiBase: 'https://example.test/api/v1',
  });
  return { ep, apple: toApplePass(ep) };
}

const ANN_BACK = {
  title: 'Saldi',
  message: 'Sconti fino al 50%',
  screen_alert: 'Fino al -50%: i saldi sono iniziati!',
  ts: 1751600000000,
  carrier: 'back',
};

test('parsePushAnnouncementRecord preserva carrier back', () => {
  const parsed = parsePushAnnouncementRecord(JSON.stringify(ANN_BACK));
  assert.equal(parsed.carrier, 'back');
  const std = parsePushAnnouncementRecord(JSON.stringify({ ...ANN_BACK, carrier: undefined }));
  assert.equal(std.carrier, undefined);
});

test('carrier back: fronte intatto — header hint senza token né changeMessage', () => {
  const { apple } = buildApple(makeInstance(ANN_BACK));
  const headers = apple.passStructure.headerFields;
  const hint = headers.find((f) => f.key === 'info_hint');
  assert.ok(hint, 'header hint presente');
  assert.equal(hint.value, 'CLICCA SUI 3 PUNTINI', 'valore didascalia invariato (no token)');
  assert.equal(hint.changeMessage, undefined, 'nessun changeMessage sul fronte');
  assert.ok(!headers.some((f) => f.key === 'announcement'), 'nessun campo announcement sul fronte');
});

test('carrier back: back field con testo visibile + token e changeMessage %@', () => {
  const { apple } = buildApple(makeInstance(ANN_BACK));
  const back = apple.passStructure.backFields || [];
  assert.equal(back[0]?.key, 'announcement_back', 'campo carrier primo sul retro');
  assert.ok(back[0].value.startsWith(ANN_BACK.screen_alert), 'testo notifica visibile sul retro');
  assert.ok(back[0].value.length > ANN_BACK.screen_alert.length, 'token invisibile accodato');
  assert.equal(back[0].changeMessage, '%@', 'changeMessage mostra il valore');
  assert.equal(back[0].label, 'SALDI');
});

test('senza carrier: meccanismo standard invariato (lock)', () => {
  const { apple } = buildApple(makeInstance({ ...ANN_BACK, carrier: undefined }));
  const headers = apple.passStructure.headerFields;
  const hint = headers.find((f) => f.key === 'info_hint');
  assert.ok(hint.changeMessage?.includes('%@'), 'carrier standard fuso in didascalia');
  assert.ok(hint.value.length > 'CLICCA SUI 3 PUNTINI'.length, 'token nel valore header');
  const back = apple.passStructure.backFields || [];
  assert.ok(!back.some((f) => f.key === 'announcement_back'), 'nessun carrier sul retro');
});

test('carrier back: due push con ts diversi producono value diversi (change garantito)', () => {
  const a = buildApple(makeInstance({ ...ANN_BACK, ts: 1751600000000 })).apple;
  const b = buildApple(makeInstance({ ...ANN_BACK, ts: 1751600099999 })).apple;
  assert.notEqual(
    a.passStructure.backFields[0].value,
    b.passStructure.backFields[0].value,
    'il token deve cambiare a ogni push'
  );
});

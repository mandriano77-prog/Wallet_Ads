/**
 * «Collega contenuto» push: il gioco (instant win / challenge) occupa il
 * Link 1 del retro HR e sostituisce ogni link manuale (o uno o l'altro).
 */
const assert = require('node:assert');
const test = require('node:test');

const { buildEmployeePass, toApplePass, resolveVariableLink } = require('../src/engine/employee-pass');

const BASE = 'https://studio.test/api/v1';
const BRAND = { id: 'b1', name: 'Test SpA', config: { product_line: 'hr' } };
const TEMPLATE = { id: 't1', name: 'Dipendenti', fields: {}, style: {} };
const MEMBER = { id: 'm1', first_name: 'Mario', last_name: 'Rossi' };
const INSTANCE = { id: 'p1', serial_number: 'SN-GAME-1', field_values: {} };

test('instant win (es. Ruota): link /play/:serial sul retro, primo link', () => {
  const ep = buildEmployeePass({
    brand: BRAND,
    template: TEMPLATE,
    instance: INSTANCE,
    member: MEMBER,
    brandConfig: { product_line: 'hr', instantWinActive: { campaign_id: 'iw1', label: 'Gira la ruota!', game_type: 'wheel' } },
    apiBase: BASE,
  });
  const apple = toApplePass(ep);
  const back = apple.passStructure.backFields || [];
  const gameField = back.find((f) => f && String(f.attributedValue || '').includes('/play/SN-GAME-1'));
  assert.ok(gameField, 'link /play/:serial presente sul retro');
  assert.ok(String(gameField.attributedValue).includes('Gira la ruota!'), 'label della campagna');
});

test('gamification (quiz): link /game/quiz/:serial sul retro', () => {
  const link = resolveVariableLink(INSTANCE, TEMPLATE,
    { gamificationActive: { campaign_id: 'g1', label: 'Quiz time', game_type: 'quiz' } },
    { publicBaseUrl: 'https://studio.test' });
  assert.equal(link.url, 'https://studio.test/game/quiz/SN-GAME-1');
  assert.equal(link.label, 'Quiz time');
});

test('esclusività: il gioco vince su link manuale (dynamic) e pushLinkOut', () => {
  const withManual = { ...INSTANCE, dynamic_link_url: 'https://manuale.test', dynamic_link_label: 'MANUALE' };
  const link = resolveVariableLink(withManual, TEMPLATE,
    { instantWinActive: { label: 'Gioca!', game_type: 'wheel' }, pushLinkOut: { url: 'https://out.test' } },
    { publicBaseUrl: 'https://studio.test' });
  assert.ok(link.url.includes('/play/SN-GAME-1'), 'gioco vince su tutto');
});

test('senza contenuto collegato: catena classica invariata (dynamic link)', () => {
  const withManual = { ...INSTANCE, dynamic_link_url: 'https://manuale.test', dynamic_link_label: 'MANUALE' };
  const link = resolveVariableLink(withManual, TEMPLATE, {}, { publicBaseUrl: 'https://studio.test' });
  assert.equal(link.url, 'https://manuale.test');
});

test('senza publicBaseUrl (chiamanti legacy): nessun crash, catena classica', () => {
  const link = resolveVariableLink(INSTANCE, TEMPLATE, { instantWinActive: { game_type: 'wheel' } });
  assert.equal(link, null, 'senza base URL il gioco non può costruire il link');
});

test('dispatch: le chiavi config si azzerano con null, mai con delete (updateBrand fa merge)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/engine/push-dispatch.js'), 'utf-8');
  // 'delete config.X' locale non rimuove la chiave dal DB: il merge di
  // updateBrand la fa risorgere (bug: la Ruota di ieri vinceva sul puzzle di oggi).
  assert.ok(!/delete config\.(instantWinActive|gamificationActive|pushAnnouncement|stripOverride|pushLinkOut)/.test(src),
    'niente delete sulle chiavi config che devono azzerarsi');
  assert.match(src, /config\.instantWinActive = null/);
  assert.match(src, /config\.gamificationActive = null/);
  assert.match(src, /config\.pushLinkOut = null/);
});

test('resolveVariableLink: flag null (azzerato) non attiva il gioco', () => {
  const link = resolveVariableLink(INSTANCE, TEMPLATE,
    { instantWinActive: null, gamificationActive: { label: 'Puzzle!', game_type: 'puzzle' } },
    { publicBaseUrl: 'https://studio.test' });
  assert.equal(link.url, 'https://studio.test/game/puzzle/SN-GAME-1', 'null saltato, puzzle attivo');
});

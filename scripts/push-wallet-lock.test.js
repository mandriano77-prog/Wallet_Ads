'use strict';

/**
 * ⚠️ LOCK TEST — NON MODIFICARE QUESTI CONTRATTI SENZA APPROVAZIONE ESPLICITA.
 *
 * Blinda il meccanismo di notifica push Apple Wallet HR validato su device
 * (luglio 2026). Se un test qui fallisce, la modifica sta rompendo un
 * comportamento verificato su iPhone reale:
 *
 * 1. La notifica lock screen funziona SOLO con un campo FRONT che cambia
 *    valore e ha changeMessage '%@' (iOS ignora changeMessage senza %@ e i
 *    back fields aggiornano in silenzio).
 * 2. screen_alert è la fonte unica del testo notifica: obbligatorio su
 *    /push/send, /push/scheduled, e derivato per W.AI e righe legacy.
 * 3. relevantDate non va mai sui pass HR (genera la notifica generica
 *    "Carta punto vendita modificata").
 *
 * Vedi CLAUDE.md sezione "Push Wallet HR — invarianti bloccate".
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function visiblePassValue(value) {
  return String(value || '').replace(/[\u200b\u200c\u200d\u2060]/g, '');
}

// ── 1. Meccanismo notifica lock screen (front announcement + changeMessage %@) ──

test('LOCK: alert Wallet su campo header con changeMessage template %@', () => {
  const src = read('src/engine/employee-pass.js');
  assert.match(src, /function buildPushAnnouncementField/);
  assert.match(src, /function mergePushAlertIntoHeaderHint/);
  assert.match(src, /key: 'announcement'/);
  assert.match(src, /changeMessage: `\$\{alertText\}%@`/);
  // Carrier: merged into info_hint when present, else standalone announcement header field.
  assert.match(src, /mergePushAlertIntoHeaderHint/);
  // Vietato tornare agli approcci falliti: aux screen_alert / back wallet_push_alert.
  assert.doesNotMatch(src, /key: 'screen_alert'/);
  assert.doesNotMatch(src, /key: 'wallet_push_alert'/);
});

test('LOCK: announcement in header con valore invisibile e testo nel changeMessage', () => {
  const { buildEmployeePass, toApplePass } = require('../src/engine/employee-pass');
  const ep = buildEmployeePass({
    brand: { id: 'b1', name: 'NTI', slug: 'nti', config: {} },
    template: { name: 'HR', style: {}, fields: {} },
    instance: {
      serial_number: 'SN1',
      push_announcement: {
        title: '2x1 OCCHIALI',
        message: 'Solo questa settimana',
        screen_alert: '2X1 OCCHIALI: Solo questa settimana',
        ts: 1710000000001,
      },
    },
    member: { full_name: 'Test', department: 'HR' },
    brandConfig: {},
  });
  const apple = toApplePass(ep);
  const alert = (apple.passStructure.headerFields || []).find((f) => f.key === 'announcement');
  assert.ok(alert, 'campo announcement mancante nei headerFields: la notifica custom non parte');
  // changeMessage DEVE contenere %@ (iOS lo esige) preceduto dal testo screen_alert.
  assert.equal(alert.changeMessage, '2X1 OCCHIALI: Solo questa settimana%@');
  // Valore = solo token invisibile che cambia col ts (header visivamente vuoto).
  assert.equal(visiblePassValue(alert.value), '');
  assert.ok(alert.value.length > 0, 'serve un valore che cambia per far scattare la notifica');
  assert.equal(alert.label, '');
  // La riga NOME/AREA/COIN resta a 3 colonne: nessun campo auxiliary.
  assert.equal((apple.passStructure.auxiliaryFields || []).length, 0);
  // Il COIN mantiene il proprio changeMessage dedicato.
  const coin = (apple.passStructure.secondaryFields || []).find((f) => f.key === 'coin_balance');
  assert.equal(coin.changeMessage, 'Hai %@ coin');
});

test('LOCK: didascalia header decorativa convive col carrier notifica', () => {
  const { buildEmployeePass, toApplePass } = require('../src/engine/employee-pass');
  const ep = buildEmployeePass({
    brand: { id: 'b1', name: 'NTI', slug: 'nti', config: {} },
    template: {
      name: 'HR',
      style: {},
      fields: { headerFields: [{ key: 'info_hint', label: 'CLICCA SUI', value: 'Per ulteriori info' }] }
    },
    instance: {
      serial_number: 'SN1',
      push_announcement: {
        title: 'PROMO',
        message: 'Solo oggi',
        screen_alert: 'PROMO: Solo oggi',
        ts: 1710000000001,
      },
    },
    member: { full_name: 'Test', department: 'HR' },
    brandConfig: {},
  });
  assert.ok(ep.headerHint, 'la didascalia decorativa non deve più essere soppressa');
  assert.equal(ep.headerHint.label, 'CLICCA SUI');
  assert.equal(ep.headerHint.changeMessage, 'PROMO: Solo oggi%@');
  assert.equal(visiblePassValue(ep.headerHint.value), 'Per ulteriori info');
  assert.ok(ep.headerHint.value.length > 'Per ulteriori info'.length);
  assert.equal(ep.pushAlert, null, 'con didascalia il carrier va fuso in info_hint, non in un secondo campo');
  const apple = toApplePass(ep);
  const keys = (apple.passStructure.headerFields || []).map((f) => f.key);
  assert.deepEqual(keys, ['info_hint'], 'un solo header field: didascalia visibile, niente cerchietto');
});

test('LOCK: i campi retro non hanno mai changeMessage vuoto (causa notifica generica)', () => {
  const { buildBackSections, sectionsToAppleBackFields } = require('../src/engine/employee-pass');
  const sections = buildBackSections({
    brand: { hr_email: 'supporto@nti.it' },
    template: {},
    instance: {
      dynamic_link_url: 'https://example.com/offerta',
      dynamic_link_label: 'Vai all\'offerta',
      dynamic_link_expires_at: new Date(Date.now() + 86400000).toISOString(),
      push_announcement: {
        title: '2x1 OCCHIALI',
        message: 'Solo questa settimana',
        screen_alert: '2X1 OCCHIALI: Solo questa settimana',
        back_details: 'Non cumulabile. Valido fino al 31/12.',
        ts: 1710000000001,
      },
    },
    member: {},
    hubUrl: 'https://studio.example.com/hub/conv?token=t',
    portalUrl: 'https://studio.example.com/portal/?t=t',
  });
  const backFields = sectionsToAppleBackFields(sections);
  backFields.forEach((f) => {
    if ('changeMessage' in f) {
      assert.ok(String(f.changeMessage).length > 0, `campo retro ${f.key} con changeMessage vuoto`);
      assert.match(String(f.changeMessage), /%@/, `campo retro ${f.key}: changeMessage senza %@`);
    }
  });
  const details = backFields.find((f) => f.key === 'push_back_details');
  assert.ok(details);
  assert.equal('changeMessage' in details, false, 'push_back_details deve aggiornarsi in silenzio');
});

test('LOCK: senza push attiva nessun campo announcement sul fronte', () => {
  const { buildEmployeePass, toApplePass } = require('../src/engine/employee-pass');
  const ep = buildEmployeePass({
    brand: { id: 'b1', name: 'NTI', slug: 'nti', config: {} },
    template: { name: 'HR', style: {}, fields: {} },
    instance: { serial_number: 'SN1' },
    member: { full_name: 'Test', department: 'HR' },
    brandConfig: {},
  });
  const apple = toApplePass(ep);
  assert.equal((apple.passStructure.auxiliaryFields || []).length, 0);
  assert.equal((apple.passStructure.headerFields || []).find((f) => f.key === 'announcement'), undefined);
  assert.deepEqual(
    (apple.passStructure.secondaryFields || []).map((f) => f.key),
    ['name', 'area', 'coin_balance']
  );
});

// ── 2. relevantDate mai sui pass HR (causa notifica generica) ──

test('LOCK: relevantDate escluso dai pass HR', () => {
  assert.match(read('src/engine/passkit.js'), /brandConfig\.relevantDate && !useHrBack/);
  assert.match(read('src/engine/pass-push-state.js'), /delete base\.relevantDate/);
});

// ── 3. screen_alert obbligatorio e limiti testo ──

test('LOCK: screen_alert obbligatorio con max 178 caratteri', () => {
  const { validatePushScreenAlert, PUSH_SCREEN_ALERT_MAX } = require('../src/engine/push-text-limits');
  assert.equal(PUSH_SCREEN_ALERT_MAX, 178);
  assert.equal(validatePushScreenAlert('').length, 1);
  assert.equal(validatePushScreenAlert('x'.repeat(179)).length, 1);
  assert.equal(validatePushScreenAlert('SALDI ESTIVI: -50%').length, 0);
});

test('LOCK: API push valida screen_alert su send e scheduled', () => {
  const routes = read('src/api/routes.js');
  assert.match(routes, /validatePushScreenAlert\(screen_alert\)/);
  assert.match(routes, /validatePushScreenAlert\(req\.body\.screen_alert\)/);
  assert.match(read('src/engine/push-dispatch.js'), /screen_alert richiesto per la notifica Wallet/);
  assert.match(read('src/engine/push-dispatch.js'), /resolvePushScreenAlert\(\{ screen_alert, title, message \}\)/);
});

// ── 4. Push programmata: persistenza + fallback legacy ──

test('LOCK: scheduled_push persiste screen_alert e lo scheduler normalizza come send', () => {
  const db = read('src/db/index.js');
  assert.match(db, /scheduled_push ADD COLUMN IF NOT EXISTS screen_alert/);
  assert.match(db, /INSERT INTO scheduled_push[\s\S]{0,400}screen_alert/);
  assert.match(db, /'screen_alert'\]/);
  const scheduler = read('src/engine/scheduler.js');
  assert.match(scheduler, /normalizeHrPushPayload\(schedule\)/);
  assert.match(scheduler, /resolvePushScreenAlert\(normalized\)/);
  assert.match(read('src/api/routes.js'), /normalizeHrPushPayload\(req\.body\)/);
});

// ── 4b. Storico push: screen_alert salvato e reinvio con fallback ──

test('LOCK: push_log persiste screen_alert e il reinvio ha il fallback', () => {
  const db = read('src/db/index.js');
  assert.match(db, /push_log ADD COLUMN IF NOT EXISTS screen_alert/);
  assert.match(db, /INSERT INTO push_log[\s\S]{0,200}screen_alert/);
  assert.match(read('src/engine/push-dispatch.js'), /logPush\(\{[\s\S]{0,200}screen_alert: screenTextInput/);
  const dashboard = read('src/dashboard/index.html');
  assert.match(dashboard, /resendPushFromHistory[\s\S]{0,900}log\.screen_alert/);
  assert.match(dashboard, /resendPushFromHistory[\s\S]{0,1200}screen_alert: screenAlert\.slice\(0, 178\)/);
});

// ── 5. W.AI deriva screen_alert (mai push bloccate dall'assistente) ──

test('LOCK: W.AI deriva screen_alert da titolo e messaggio', () => {
  const { validateWaiResponse } = require('../src/engine/wai');
  const out = validateWaiResponse({
    intent: 'push.send',
    type: 'create',
    payload: { title: 'PROMO', message: 'Dettagli sul pass' },
    preview: { summary: '', details: {}, warnings: [] },
  }, 'brand-1', 'manda una push');
  assert.equal(out.payload.screen_alert, 'PROMO: Dettagli sul pass');
});

// ── 6. Dashboard: campo obbligatorio su push immediata e programmata ──

test('LOCK: dashboard richiede il testo notifica Wallet su entrambi i pannelli', () => {
  const dashboard = read('src/dashboard/index.html');
  assert.match(dashboard, /id="pushScreenAlert"/);
  assert.match(dashboard, /id="schedScreenAlert"/);
  assert.match(dashboard, /body\.screen_alert = screenAlert/);
  assert.match(dashboard, /screen_alert: schedScreenAlert/);
  const fdPush = read('src/filodiretto/fd-push.js');
  assert.match(fdPush, /body\.screen_alert = screenAlert/);
});

// ── 7. Icona notifica quadrata (mai il logo pass rettangolare) ──

test('LOCK: brand mark usa solo icona notifica quadrata, email senza allegato logo', () => {
  const logo = read('src/engine/brand-wallet-logo.js');
  assert.match(logo, /Square notification icon only/);
  assert.doesNotMatch(logo, /resolveBrandMarkRawBuffer[\s\S]{0,220}resolveBrandLogoRawBuffer/);
  const mailer = read('src/engine/mailer.js');
  assert.match(mailer, /inlineLogoAttachment && !brandLogo\?\.url/);
});

// ── 8. Retro pass: link senza titolo duplicato ──

test('LOCK: link retro senza riga di testo duplicata', () => {
  const { buildBackSections, sectionsToAppleBackFields } = require('../src/engine/employee-pass');
  const sections = buildBackSections({
    brand: {},
    template: {},
    instance: {},
    member: {},
    hubUrl: 'https://studio.example.com/hub/conv?token=t',
  });
  const fields = sectionsToAppleBackFields(sections.filter((s) => s.kind === 'link'));
  assert.ok(fields.length >= 1);
  fields.forEach((f) => {
    assert.equal(f.value, '\u200b', 'il titolo del link deve vivere solo in attributedValue');
    assert.match(f.attributedValue, /<a href=/);
  });
});

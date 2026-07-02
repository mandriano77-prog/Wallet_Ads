'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function visiblePassValue(value) {
  return String(value || '').replace(/[\u200b\u200c\u200d\u2060]/g, '');
}

test('AC-017: enabling PGA seeds default experiences via upsertPgaSettings', () => {
  const db = read('src/db/index.js');
  const seed = read('src/engine/pga-seed.js');
  assert.match(db, /async function upsertPgaSettings/);
  assert.match(db, /seedPgaDefaultsForBrand/);
  assert.match(seed, /PGA_DEFAULT_EXPERIENCES/);
  assert.match(seed, /COIN_ACTIONS_DEFAULT/);
  assert.equal(JSON.parse(JSON.stringify(require('../src/engine/pga-seed').PGA_DEFAULT_EXPERIENCES)).length, 10);
});

test('Sprint 1: PGA dashboard API routes registered', () => {
  const api = read('src/api/pga-dashboard.js');
  const routes = read('src/api/routes.js');
  assert.match(api, /\/brands\/:id\/pga-settings/);
  assert.match(api, /\/experiences/);
  assert.match(api, /\/coins\/actions/);
  assert.match(api, /\/coins\/manual-grant/);
  assert.match(api, /\/brands\/:id\/engagement-analytics/);
  assert.match(routes, /registerPgaDashboardRoutes/);
});

test('AC-007/010: passkit adds PGA link when enabled and always loads coin balance', () => {
  const passkit = read('src/engine/passkit.js');
  const employee = read('src/engine/employee-pass.js');
  assert.match(passkit, /buildHubAppUrl\(token, brand\.slug, 'pga'\)/);
  assert.match(passkit, /buildHubAppUrl\(token, brand\.slug, 'me'\)/);
  assert.match(passkit, /coin balance load failed/);
  assert.match(passkit, /getCurrentBalance\(brand\.id, instance\.serial_number\)/);
  assert.match(employee, /HR_HUB_BACK_TITLE/);
  assert.match(employee, /HUB PERSONALE/);
  assert.match(employee, /label: 'SUPPORT'/);
  assert.match(employee, /HR_PORTAL_BACK_TITLE/);
  assert.match(employee, /AREA PRIVATA/);
  assert.match(employee, /key: 'coin_balance'/);
  assert.match(employee, /isCoinPassField/);
});

test('AC-010: coin balance renders on secondary row (not header or auxiliary)', () => {
  const { buildEmployeePass, toApplePass } = require('../src/engine/employee-pass');
  const employeePass = buildEmployeePass({
    brand: { id: 'b1', name: 'Acme', config: { pass_header_hint: { label: 'COIN', value: '999' } } },
    template: { name: 'HR', fields: { headerFields: [{ key: 'coin_balance', label: 'COIN', value: '0' }] } },
    instance: { serial_number: 'SN1', field_values: {} },
    member: {
      first_name: 'Mario',
      last_name: 'Rossi',
      employee_id: '4721',
      department: 'Engineering',
      office_location: 'Milano'
    },
    brandConfig: {},
    apiBase: 'https://studio.example.com/api/v1',
    coinBalance: 247
  });
  const apple = toApplePass(employeePass);
  const headerKeys = (apple.passStructure.headerFields || []).map((f) => f.key);
  const auxKeys = (apple.passStructure.auxiliaryFields || []).map((f) => f.key);
  const secKeys = (apple.passStructure.secondaryFields || []).map((f) => f.key);
  assert.equal(headerKeys.includes('coin_balance'), false);
  assert.equal(auxKeys.includes('coin_balance'), false);
  assert.deepEqual(secKeys, ['name', 'area', 'coin_balance']);
  const areaField = apple.passStructure.secondaryFields.find((f) => f.key === 'area');
  assert.equal(areaField.label, 'AREA');
  assert.equal(areaField.value, 'Engineering');
  const coinField = apple.passStructure.secondaryFields.find((f) => f.key === 'coin_balance');
  assert.equal(coinField.value, '247');
});

test('AC-010b: COIN row always present on HR pass (defaults to 0)', () => {
  const { buildEmployeePass, toApplePass } = require('../src/engine/employee-pass');
  const employeePass = buildEmployeePass({
    brand: { id: 'b1', name: 'Acme', config: {} },
    template: { name: 'HR' },
    instance: { serial_number: 'SN1', field_values: {} },
    member: { first_name: 'Mario', last_name: 'Rossi', employee_id: '1' },
    brandConfig: {},
    apiBase: 'https://studio.example.com/api/v1'
  });
  const apple = toApplePass(employeePass);
  const coinField = (apple.passStructure.secondaryFields || []).find((f) => f.key === 'coin_balance');
  assert.ok(coinField);
  assert.equal(coinField.label, 'COIN');
  assert.equal(coinField.value, '0');
});

test('HR push promo: strip overlay only — frozen template header and secondary fields', () => {
  const { buildEmployeePass, toApplePass, resolvePushAnnouncement } = require('../src/engine/employee-pass');
  const annPayload = {
    title: 'Fratelli La Pizza',
    message: 'Dal lunedì al venerdì, con il pass hai lo sconto del 20%',
    screen_alert: 'FRATELLI LA PIZZA: Dal lunedì al venerdì, con il pass hai lo sconto del 20%',
    ts: Date.now()
  };
  const ann = resolvePushAnnouncement({}, { push_announcement: annPayload });
  assert.ok(ann);
  assert.match(ann.screen_alert, /FRATELLI LA PIZZA/);

  const employeePass = buildEmployeePass({
    brand: { id: 'b1', name: 'NTI', config: {} },
    template: { name: 'HR' },
    instance: {
      serial_number: 'SN1',
      field_values: {},
      push_announcement: annPayload,
    },
    member: { first_name: 'Adriano', last_name: 'Coccia', department: 'Direzione' },
    brandConfig: {},
    apiBase: 'https://studio.example.com/api/v1',
    coinBalance: 25
  });
  const apple = toApplePass(employeePass);
  const alertField = (apple.passStructure.headerFields || []).find((f) => f.key === 'announcement');
  assert.ok(alertField);
  assert.equal(alertField.changeMessage, 'FRATELLI LA PIZZA: Dal lunedì al venerdì, con il pass hai lo sconto del 20%%@');
  assert.equal(visiblePassValue(alertField.value), '');
  assert.ok(alertField.value.length > 0);
  assert.equal((apple.passStructure.auxiliaryFields || []).find((f) => f.key === 'announcement'), undefined);
  assert.equal((apple.passStructure.auxiliaryFields || []).find((f) => f.key === 'wallet_push_alert'), undefined);
  assert.equal((apple.passStructure.backFields || []).find((f) => f.key === 'wallet_push_alert'), undefined);
  const coinField = (apple.passStructure.secondaryFields || []).find((f) => f.key === 'coin_balance');
  assert.ok(coinField);
  assert.equal(coinField.value, '25');
  assert.equal(coinField.changeMessage, 'Hai %@ coin');
  assert.deepEqual(
    (apple.passStructure.secondaryFields || []).map((f) => f.key),
    ['name', 'area', 'coin_balance']
  );

  const passkit = read('src/engine/passkit.js');
  assert.match(passkit, /composePushTextOnStrip/);
  assert.match(passkit, /resolvePushAnnouncement/);
  assert.doesNotMatch(passkit, /compositeThumbnailOnStrip/);
  assert.doesNotMatch(passkit, /prepareThumbForStripOverlay/);
  assert.match(passkit, /generateCoverThumbnailBuffers/);
  assert.doesNotMatch(passkit, /files\['thumbnail@3x\.png'\]/);
  assert.doesNotMatch(passkit, /Employee pass: thumbnail composita/);
  assert.doesNotMatch(passkit, /rgba\(0,0,0,0\.62\)/);
  assert.doesNotMatch(passkit, /stripGrad/);
  assert.doesNotMatch(passkit, /lengthAdjust/);
});

test('HR push default copy uses back details for Apple alert and no INFO PASS back label', () => {
  const { buildEmployeePass, toApplePass } = require('../src/engine/employee-pass');
  const employeePass = buildEmployeePass({
    brand: { id: 'b1', name: 'NTI', config: {} },
    template: { name: 'HR' },
    instance: {
      serial_number: 'SN1',
      field_values: {},
      push_announcement: {
        title: 'INFO PASS',
        message: 'Apri il pass per i dettagli',
        screen_alert: 'Lorem Ipsum tutti i brand aderenti, sconti fino al 50%',
        back_details: 'Lorem Ipsum tutti i brand aderenti, sconti fino al 50%',
        ts: Date.now()
      },
    },
    member: { first_name: 'Adriano', last_name: 'Coccia', department: 'Direzione' },
    brandConfig: {},
    apiBase: 'https://studio.example.com/api/v1',
    coinBalance: 0
  });
  const apple = toApplePass(employeePass);
  const alertField = (apple.passStructure.headerFields || []).find((f) => f.key === 'announcement');
  assert.ok(alertField);
  assert.equal(alertField.changeMessage, 'Lorem Ipsum tutti i brand aderenti, sconti fino al 50%%@');
  assert.equal(visiblePassValue(alertField.value), '');
  assert.equal((apple.passStructure.auxiliaryFields || []).find((f) => f.key === 'announcement'), undefined);
  assert.equal((apple.passStructure.auxiliaryFields || []).find((f) => f.key === 'wallet_push_alert'), undefined);
  assert.equal((apple.passStructure.backFields || []).find((f) => f.key === 'wallet_push_alert'), undefined);
  const promoBack = (apple.passStructure.backFields || []).find((f) => f.key === 'push_back_details');
  assert.equal(promoBack, undefined);
});

test('SUPPORT back: single mailto CTA (no DPO on pass)', () => {
  const { buildBackSections, sectionsToAppleBackFields } = require('../src/engine/employee-pass');
  const sections = buildBackSections({
    brand: { hr_email: 'supporto@nti.it', dpo_email: 'privacy@nti.it' },
    template: {},
    instance: {},
    member: {}
  });
  const support = sections.find((s) => s.key === 'support');
  assert.ok(support);
  assert.equal(support.kind, 'link');
  assert.equal(support.label, 'SUPPORT');
  assert.equal(support.url, 'mailto:supporto@nti.it');
  const appleField = sectionsToAppleBackFields([support])[0];
  assert.equal(appleField.label, '');
  assert.equal(appleField.value, '\u200b');
  assert.match(appleField.attributedValue, /SUPPORT/);
  assert.match(appleField.attributedValue, /mailto:supporto@nti\.it/);
});

test('HR back links: title-only embedded CTA (no duplicate label row)', () => {
  const { buildBackSections, sectionsToAppleBackFields } = require('../src/engine/employee-pass');
  const sections = buildBackSections({
    brand: {},
    template: {},
    instance: {},
    member: {},
    hubUrl: 'https://studio.example.com/hub/conv?token=t',
    portalUrl: 'https://studio.example.com/portal/?t=t'
  });
  const fields = sectionsToAppleBackFields(sections.filter((s) => s.kind === 'link'));
  assert.equal(fields.length, 2);
  assert.equal(fields[0].label, '');
  assert.equal(fields[0].value, '\u200b');
  assert.match(fields[0].attributedValue, /<a href="[^"]+">HUB PERSONALE<\/a>/);
  assert.equal(fields[1].label, '');
  assert.equal(fields[1].value, '\u200b');
  assert.match(fields[1].attributedValue, /<a href="[^"]+">AREA PRIVATA<\/a>/);
});

test('HR back: dynamic push link appears first when instance has dynamic_link_url', () => {
  const { buildBackSections, sectionsToAppleBackFields } = require('../src/engine/employee-pass');
  const sections = buildBackSections({
    brand: { hr_email: 'supporto@nti.it' },
    template: {},
    instance: {
      dynamic_link_url: 'https://example.com/offerta',
      dynamic_link_label: 'Compila il questionario',
      dynamic_link_expires_at: new Date(Date.now() + 86400000).toISOString()
    },
    member: {},
    hubUrl: 'https://studio.example.com/hub/conv?token=t',
    portalUrl: 'https://studio.example.com/portal/?t=t'
  });
  assert.equal(sections[0].key, 'dynamic_push_link');
  assert.equal(sections[0].kind, 'link');
  assert.equal(sections[0].label, 'Compila il questionario');
  assert.equal(sections[0].url, 'https://example.com/offerta');
  assert.equal(sections[1].key, 'hub_employee');
  const linkFields = sectionsToAppleBackFields(sections.filter((s) => s.kind === 'link'));
  assert.equal(linkFields.length, 4);
  assert.equal(linkFields[0].value, '\u200b');
  assert.match(linkFields[0].attributedValue, /https:\/\/example\.com\/offerta/);
  assert.match(linkFields[0].attributedValue, /Compila il questionario/);
});

test('HR back: push back_details after dynamic link', () => {
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
  assert.equal(sections[0].key, 'dynamic_push_link');
  assert.equal(sections[1].key, 'push_back_details');
  assert.equal(sections[1].label, ' ');
  assert.match(sections[1].body, /Non cumulabile/);
  const backFields = sectionsToAppleBackFields(sections);
  const detailsField = backFields.find((f) => f.key === 'push_back_details');
  assert.ok(detailsField);
  assert.equal(detailsField.label, ' ');
  assert.match(detailsField.value, /Non cumulabile/);
});

test('HR push: lock-screen alert on invisible header announcement field, caption preserved', () => {
  const { buildEmployeePass, toApplePass } = require('../src/engine/employee-pass');
  const ep = buildEmployeePass({
    brand: { id: 'b1', name: 'NTI', slug: 'nti', config: {} },
    template: {
      style: {},
      fields: {
        headerFields: [{ key: 'info_hint', label: 'CLICCA SUI', value: 'Per altre informazioni' }]
      }
    },
    instance: {
      serial_number: 'SN1',
      push_announcement: {
        title: '2x1 OCCHIALI',
        message: 'Solo questa settimana',
        screen_alert: '2X1 OCCHIALI: Solo questa settimana',
        ts: 1710000000001
      },
    },
    member: { full_name: 'Test', department: 'HR' },
    brandConfig: {},
  });
  assert.equal(ep.front.auxiliary.length, 0);
  // La didascalia decorativa non viene più soppressa.
  assert.ok(ep.headerHint);
  assert.equal(ep.headerHint.label, 'CLICCA SUI');
  assert.ok(ep.pushAlert);
  assert.equal(ep.pushAlert.changeMessage, '2X1 OCCHIALI: Solo questa settimana%@');
  assert.equal(visiblePassValue(ep.pushAlert.value), '');
  assert.ok(ep.pushAlert.value.length > 0);
  assert.equal(ep.backSections.find((s) => s.key === 'wallet_push_alert'), undefined);
  const coin = ep.front.secondary.find((f) => f.key === 'coin_balance');
  assert.ok(coin);
  assert.equal(coin.changeMessage, 'Hai %@ coin');
  const apple = toApplePass(ep);
  const appleAlert = (apple.passStructure.headerFields || []).find((f) => f.key === 'announcement');
  assert.ok(appleAlert);
  assert.equal(appleAlert.changeMessage, '2X1 OCCHIALI: Solo questa settimana%@');
  assert.equal(visiblePassValue(appleAlert.value), '');
  assert.ok((apple.passStructure.headerFields || []).some((f) => f.key === 'info_hint'));
  assert.equal((apple.passStructure.auxiliaryFields || []).length, 0);
  assert.equal((apple.passStructure.backFields || []).find((f) => f.key === 'wallet_push_alert'), undefined);
});

test('strip overlay: normalize enforces HR strip char limits', () => {
  const { normalizePushAnnouncementForStrip, STRIP_OVERLAY_TITLE_MAX_1X, STRIP_OVERLAY_MSG_MAX_1X, STRIP_OVERLAY_MSG_LINES } = require('../src/engine/passkit');
  const out = normalizePushAnnouncementForStrip({
    title: 'Salmoiraghi & Viganò: 2x1 occhiali',
    message: 'Solo questa settimana acquisti due occhiali da sole il meno caro è in omaggio per te'
  });
  assert.ok(out);
  assert.ok(out.title.length <= STRIP_OVERLAY_TITLE_MAX_1X);
  assert.ok(out.message.length <= STRIP_OVERLAY_MSG_MAX_1X * STRIP_OVERLAY_MSG_LINES + 4);
});

test('strip overlay: emoji stripped for SVG render (Linux/sharp safe)', () => {
  const { sanitizeStripSvgText } = require('../src/engine/passkit');
  assert.equal(sanitizeStripSvgText('BUON WEEKEND! ☀️'), 'BUON WEEKEND!');
  assert.equal(sanitizeStripSvgText('Caffè ☕️ oggi'), 'Caffè oggi');
});

test('strip overlay: title truncates and message wraps with ellipsis', () => {
  const { wrapStripOverlayLines, truncateStripOverlayTitle, stripOverlayTextMaxWidth } = require('../src/engine/passkit');
  assert.equal(truncateStripOverlayTitle('Fratelli La Pizza Special Edition', 22), 'FRATELLI LA PIZZA SPE…');
  const lines = wrapStripOverlayLines(
    'Dal lunedì al venerdì con il pass hai lo sconto del venti per cento su tutto',
    26,
    2
  );
  assert.equal(lines.length, 2);
  assert.match(lines[1], /…$/);
  assert.ok(stripOverlayTextMaxWidth(375, true) < stripOverlayTextMaxWidth(375, false));
});

test('strip preview API route registered', () => {
  assert.match(read('src/api/routes.js'), /\/brands\/:id\/push\/strip-preview/);
  assert.doesNotMatch(read('src/api/routes.js'), /composePushTextOnStrip\(strip/);
});

test('scheduled push: back_details stored and applied on execute', () => {
  assert.match(read('src/db/index.js'), /scheduled_push ADD COLUMN IF NOT EXISTS back_details/);
  assert.match(read('src/db/index.js'), /back_details/);
  assert.match(read('src/engine/scheduler.js'), /executeWalletPush\(\{ \.\.\.schedule/);
  assert.match(read('src/engine/push-dispatch.js'), /attachBackDetailsToAnnouncement/);
  assert.match(read('src/api/routes.js'), /validatePushBackDetails\(req\.body\.back_details\)/);
  assert.match(read('src/dashboard/index.html'), /schedBackDetails/);
});

test('scheduled push: screen_alert stored, validated, and derived on execute', () => {
  const db = read('src/db/index.js');
  assert.match(db, /scheduled_push ADD COLUMN IF NOT EXISTS screen_alert/);
  assert.match(db, /screen_alert(?:.|\n){0,600}INSERT INTO scheduled_push/);
  assert.match(db, /'screen_alert'\]/);
  const scheduler = read('src/engine/scheduler.js');
  assert.match(scheduler, /schedule\.screen_alert/);
  assert.match(scheduler, /screen_alert: screenAlert\.slice\(0, 178\)/);
  const routes = read('src/api/routes.js');
  assert.match(routes, /validatePushScreenAlert\(req\.body\.screen_alert\)/);
  const dashboard = read('src/dashboard/index.html');
  assert.match(dashboard, /schedScreenAlert/);
  assert.match(dashboard, /screen_alert: schedScreenAlert/);
});

test('pass preview API route registered', () => {
  assert.match(read('src/api/routes.js'), /\/brands\/:id\/push\/pass-preview/);
  assert.match(read('src/api/routes.js'), /buildPushPassPreview/);
});

test('AC-025: coin anniversaries cron scheduled at boot', () => {
  assert.match(read('src/engine/coin-anniversaries.js'), /runCoinAnniversariesJob/);
  assert.match(read('src/server.js'), /scheduleCoinAnniversariesJob/);
});

test('hub-jwt buildHubUrl targets /conv path', () => {
  const { buildHubUrl, buildHubAppUrl } = require('../src/engine/hub-jwt');
  const url = buildHubUrl('tok', 'acme');
  assert.match(url, /\/conv\?token=tok/);
  assert.match(buildHubAppUrl('tok', 'acme', 'pga'), /\/pga\?token=tok/);
});

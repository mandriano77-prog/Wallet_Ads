/**
 * Report email post-invio push: riepilogo esiti e scelta destinatario.
 */
const assert = require('node:assert');
const test = require('node:test');

const { summarizeOutcome, resolveReportRecipient } = require('../src/engine/push-report');

test('summarizeOutcome: invio pulito', () => {
  const o = summarizeOutcome({
    sent_apns: 2, total_apns: 2,
    google: { updated: 1, errors: 0 },
    samsung: { skipped: true },
    apns_results: [],
  });
  assert.equal(o.delivered, 3);
  assert.equal(o.hasErrors, false);
});

test('summarizeOutcome: errori APNs rilevati', () => {
  const o = summarizeOutcome({
    sent_apns: 1, total_apns: 2,
    google: { updated: 0 },
    apns_results: [{ success: false, token: 'abc', reason: 'BadDeviceToken' }],
  });
  assert.equal(o.hasErrors, true);
  assert.equal(o.failures.length, 1);
});

test('summarizeOutcome: zero consegne con device presenti = errore', () => {
  const o = summarizeOutcome({ sent_apns: 0, total_apns: 3, google: { skipped: true }, apns_results: [] });
  assert.equal(o.hasErrors, true);
});

test('summarizeOutcome: nessun device Apple non è errore (brand solo Google)', () => {
  const o = summarizeOutcome({ sent_apns: 0, total_apns: 0, google: { updated: 4, errors: 0 }, apns_results: [] });
  assert.equal(o.hasErrors, false);
  assert.equal(o.delivered, 4);
});

test('resolveReportRecipient: config del brand vince, fallback allowlist', () => {
  assert.equal(
    resolveReportRecipient({ config: { push_report_email: 'hr@azienda.it' } }),
    'hr@azienda.it'
  );
  // Senza config: fallback al primo operatore allowlist (default deploy HR).
  const fallback = resolveReportRecipient({ config: {} });
  assert.ok(fallback === null || /@/.test(fallback));
});

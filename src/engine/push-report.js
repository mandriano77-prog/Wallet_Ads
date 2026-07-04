/**
 * Report email post-invio push: dopo ogni invio reale (manuale o programmato)
 * parte un recap con i numeri di consegna per canale e gli eventuali errori.
 * Ragione d'essere: le push programmate partono senza nessuno davanti alla
 * dashboard — un errore silenzioso resterebbe invisibile.
 *
 * Destinatario: brand.config.push_report_email se impostata, altrimenti il
 * primo operatore dell'allowlist deploy (l'admin piattaforma).
 * Best-effort: mai propagare errori (il report non deve far fallire l'invio).
 */
'use strict';

function resolveReportRecipient(brand) {
  const cfgEmail = String(brand?.config?.push_report_email || '').trim();
  if (cfgEmail) return cfgEmail;
  try {
    const { deployLoginAllowlistEmails } = require('../db');
    const list = deployLoginAllowlistEmails();
    if (list && list.length) return list[0];
  } catch (_) { /* fallthrough */ }
  return null;
}

function summarizeOutcome(result) {
  const apnsSent = result?.sent_apns || 0;
  const apnsTotal = result?.total_apns || 0;
  const gw = result?.google || {};
  const sam = result?.samsung || {};
  const failures = (result?.apns_results || []).filter((r) => !r.success);
  const delivered = apnsSent + (gw.updated || 0) + (sam.notified || 0);
  const hasErrors = failures.length > 0
    || (gw.errors || 0) > 0
    || (apnsTotal > 0 && apnsSent === 0);
  return { apnsSent, apnsTotal, gw, sam, failures, delivered, hasErrors };
}

async function sendPushReportSafe({ brand, title, screenAlert, result, origin }) {
  try {
    const to = resolveReportRecipient(brand);
    if (!to) return { skipped: true, reason: 'nessun destinatario' };
    const { sendPushReportEmail } = require('./mailer');
    const outcome = summarizeOutcome(result);
    await sendPushReportEmail({
      to,
      brandName: brand?.name || '',
      title: title || '',
      screenAlert: screenAlert || '',
      origin: origin === 'programmata' ? 'programmata' : 'manuale',
      outcome,
    });
    return { sent: true, to };
  } catch (err) {
    console.warn('[push-report] invio report fallito:', err.message);
    return { error: err.message };
  }
}

module.exports = { sendPushReportSafe, summarizeOutcome, resolveReportRecipient };

/**
 * Report email post-invio push: dopo ogni invio reale (manuale o programmato)
 * parte un recap con i numeri di consegna per canale e gli eventuali errori.
 * Ragione d'essere: le push programmate partono senza nessuno davanti alla
 * dashboard — un errore silenzioso resterebbe invisibile.
 *
 * Destinatari: tutti gli utenti dashboard che vedono il brand (manager del
 * brand + admin piattaforma, che ricevono i report di tutti i brand), più
 * l'eventuale brand.config.push_report_email e l'operatore allowlist.
 * Best-effort: mai propagare errori (il report non deve far fallire l'invio).
 */
'use strict';

async function resolveReportRecipients(brand) {
  const emails = new Set();
  const add = (e) => {
    const v = String(e || '').trim().toLowerCase();
    if (v && v.includes('@')) emails.add(v);
  };

  // Manager del brand + admin piattaforma (brand_id NULL) — solo account attivi.
  try {
    const { listUsers } = require('../db');
    const users = await listUsers(brand?.id || null);
    for (const u of users || []) {
      if (u.active === false) continue;
      add(u.email);
    }
  } catch (err) {
    console.warn('[push-report] listUsers fallita:', err.message);
  }

  // Destinatario extra per-brand (config) + operatore allowlist come rete di sicurezza.
  add(brand?.config?.push_report_email);
  try {
    const { deployLoginAllowlistEmails } = require('../db');
    for (const e of deployLoginAllowlistEmails() || []) add(e);
  } catch (_) { /* fallthrough */ }

  return [...emails];
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
    const to = await resolveReportRecipients(brand);
    if (!to.length) return { skipped: true, reason: 'nessun destinatario' };
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

module.exports = { sendPushReportSafe, summarizeOutcome, resolveReportRecipients };

const googleWallet = require('./google-wallet');
const { getTemplate, markGoogleWalletUpdateStatus, updateGoogleWalletStatus, updatePassDeviceId } = require('../db');
const { parsePushAnnouncementRecord } = require('./pass-push-state');
const { resolveGoogleNotifyPayload } = require('./push-text-limits');

const DEFAULT_CONCURRENCY = Math.max(
  1,
  Math.min(parseInt(process.env.GOOGLE_WALLET_SYNC_CONCURRENCY || '15', 10) || 15, 32)
);

async function syncGoogleWalletObjectsForPasses({
  brand,
  passes,
  message,
  title,
  screen_alert,
  back_details,
  passLink = null,
  concurrency = DEFAULT_CONCURRENCY,
  onProgress = null,
}) {
  if (!googleWallet.isConfigured()) {
    return { attempted: 0, updated: 0, errors: 0, skipped: true };
  }
  if (!Array.isArray(passes) || passes.length === 0) {
    return { attempted: 0, updated: 0, errors: 0, skipped: false };
  }

  const eligible = passes.filter((pass) => pass.google_wallet_object_id);
  if (!eligible.length) {
    return { attempted: 0, updated: 0, errors: 0, skipped: false };
  }

  const outcomes = new Array(eligible.length);
  let cursor = 0;
  let processed = 0;
  let updatedCount = 0;
  let errorCount = 0;
  let notifyDelivered = 0;
  let notifySilent = 0;
  let notifyQuotaHit = 0;
  const notifyCopy = resolveGoogleNotifyPayload({ screen_alert, title, message });
  const workers = Math.max(1, Math.min(concurrency, eligible.length));

  async function emitProgress() {
    if (typeof onProgress !== 'function') return;
    await onProgress({
      attempted: eligible.length,
      processed,
      updated: updatedCount,
      errors: errorCount,
    });
  }

  await emitProgress();

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= eligible.length) break;
      const pass = eligible[index];
      try {
        const template = await getTemplate(pass.template_id);
        if (!template) {
          outcomes[index] = { ok: false, error: 'missing_template' };
          processed++;
          errorCount++;
          await emitProgress();
          continue;
        }
        const passForGoogle = withCurrentPushDetails(pass, { title, message, back_details, passLink });
        const passObject = await googleWallet.buildPassObject(brand, template, passForGoogle, passForGoogle.customer_data || {});
        const serverObject = await googleWallet.ensurePassReadyOnServer(brand, template, passObject);
        if (serverObject?.hasUsers === true || serverObject?.hasUsers === 'true') {
          const savedPass = await updateGoogleWalletStatus(passObject.id, true);
          await updatePassDeviceId(savedPass?.serial_number || pass.serial_number, passObject.id, 'google');
        }
        let notifyResult = null;
        const savedOnDevice = pass.google_wallet_saved === true
          || pass.google_wallet_saved === 'true'
          || pass.google_wallet_saved === 1
          || serverObject?.hasUsers === true
          || serverObject?.hasUsers === 'true';
        if (notifyCopy.message && savedOnDevice) {
          notifyResult = await googleWallet.updatePassMessage(
            pass.serial_number,
            notifyCopy.message,
            brand,
            {
              title: notifyCopy.title,
              objectId: pass.google_wallet_object_id || passObject.id || null,
            }
          );
        } else if (notifyCopy.message && !savedOnDevice) {
          console.warn(
            `[GoogleWallet] skip notify for ${pass.serial_number}: pass not saved on device (hasUsers=false)`
          );
        }
        const googleStatus = !notifyCopy.message
          ? 'updated'
          : !savedOnDevice
            ? 'pending_save'
            : (notifyResult?.messageType === 'TEXT_AND_NOTIFY'
              ? 'delivered'
              : (notifyResult?.quotaExceeded ? 'quota_exceeded' : 'silent'));
        if (googleStatus === 'delivered') notifyDelivered += 1;
        else if (googleStatus === 'quota_exceeded') notifyQuotaHit += 1;
        else if (googleStatus === 'silent') notifySilent += 1;
        await markGoogleWalletUpdateStatus(pass.serial_number, googleStatus);
        outcomes[index] = { ok: true };
        processed++;
        updatedCount++;
        await emitProgress();
      } catch (err) {
        console.error('[GoogleWallet] Sync error for serial', pass.serial_number, err.message);
        await markGoogleWalletUpdateStatus(pass.serial_number, err.message || 'failed').catch(() => {});
        outcomes[index] = { ok: false, error: err.message };
        processed++;
        errorCount++;
        await emitProgress();
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));

  const attempted = eligible.length;
  const updated = outcomes.filter((o) => o?.ok).length;
  const errors = outcomes.filter((o) => o && !o.ok).length;
  return {
    attempted,
    updated,
    errors,
    skipped: false,
    notify_delivered: notifyDelivered,
    notify_silent: notifySilent,
    notify_quota_hit: notifyQuotaHit,
  };
}

function withCurrentPushDetails(pass, { title, message, back_details, passLink } = {}) {
  let nextPass = pass;
  if (passLink?.url) {
    nextPass = {
      ...nextPass,
      dynamic_link_label: passLink.label || 'AZIONE RICHIESTA',
      dynamic_link_url: passLink.url,
      dynamic_link_expires_at: passLink.expiresAt || null,
    };
  }
  const backDetails = String(back_details || '').trim();
  if (!backDetails) return nextPass;
  const current = parsePushAnnouncementRecord(nextPass?.push_announcement) || {};
  const next = {
    ...current,
    title: String(title || current.title || '').trim(),
    message: String(message || current.message || '').trim(),
    back_details: backDetails.slice(0, 500),
    ts: Number(current.ts) || Date.now(),
  };
  if (!next.message) return nextPass;
  return { ...nextPass, push_announcement: next };
}

module.exports = {
  syncGoogleWalletObjectsForPasses,
  DEFAULT_CONCURRENCY,
  withCurrentPushDetails,
};

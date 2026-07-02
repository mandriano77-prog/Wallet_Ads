/**
 * Optimized wallet push dispatch: bulk pass touch, batched APNs, async job support.
 */
const {
  pool,
  getBrand,
  updateBrand,
  getInstantWinCampaign,
  getGamificationCampaign,
  updatePassDynamicLinks,
  clearPassDynamicLinks,
  updatePassPushOverlays,
  touchPassesByIds,
  markPassesPushDelivered,
  markPassPushStatus,
  unregisterDevice,
  logPush,
  getPushJob,
  claimPushJob,
  updatePushJob,
} = require('../db');
const { getTargetPassesForPush, getAppleDevicesForAudience } = require('./audiences');
const { sendPushBatch, closeApnsSession, shouldPruneApnsRegistration } = require('./apns');
const { syncGoogleWalletObjectsForPasses } = require('./google-wallet-sync');
const googleWallet = require('./google-wallet');
const samsungWallet = require('./samsung-wallet');
const { attachBackDetailsToAnnouncement, resolvePushScreenAlert } = require('./push-text-limits');
const { activePushChannelKeys } = require('./wallet-channels');

const activeJobIds = new Set();
const APNS_RESULT_SAMPLE_LIMIT = Math.max(0, Math.min(parseInt(process.env.APNS_RESULT_SAMPLE_LIMIT || '50', 10) || 50, 200));

function pushChannelKeys() {
  return activePushChannelKeys();
}

function normalizePushChannelList(channel) {
  const allowed = pushChannelKeys();
  const raw = String(channel || 'all').trim().toLowerCase();
  if (!raw) return [...allowed];
  if (raw === 'both') return ['apple', 'google'];
  if (raw === 'all') return [...allowed];
  if (raw.includes(',')) {
    const parts = raw.split(',').map((s) => s.trim()).filter((k) => allowed.includes(k));
    return parts.length ? [...new Set(parts)] : null;
  }
  return allowed.includes(raw) ? [raw] : null;
}

function parseWalletPushFlags(channel) {
  const parts = normalizePushChannelList(channel);
  if (!parts || !parts.length) {
    return { sendApple: true, sendGoogle: true, sendSamsung: true };
  }
  return {
    sendApple: parts.includes('apple'),
    sendGoogle: parts.includes('google'),
    sendSamsung: parts.includes('samsung'),
  };
}

function assertHttpsUrl(url, fieldName = 'URL') {
  const u = String(url || '').trim();
  if (!u) return null;
  if (!/^https:\/\/.+/i.test(u)) {
    throw new Error(`${fieldName} deve iniziare con https://`);
  }
  return u;
}

function parsePassLinkFromPushBody(body, title) {
  const explicitToggle = body.include_pass_link;
  const urlRaw = (body.pass_link_url || body.back_link_url || '').trim();
  const enabled = explicitToggle === true || (explicitToggle !== false && !!urlRaw);
  if (!enabled || !urlRaw) return null;
  const url = assertHttpsUrl(urlRaw, 'Link pass');
  const label = String(body.pass_link_label || body.back_link_label || title || 'AZIONE RICHIESTA').trim().slice(0, 64);
  let expiresAt = body.pass_link_expires_at || body.dynamic_link_expires_at || null;
  if (!expiresAt) {
    expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  return { label, url, expiresAt };
}

async function notifySamsungSavedPasses(passes) {
  return samsungWallet.notifySavedPassesUpdates(passes);
}

async function applyApplePushResults(devices, batchResults, { onProgress } = {}) {
  const pushFailures = [];
  const deliveredSerials = [];
  let sentAppleCount = 0;

  for (let i = 0; i < devices.length; i++) {
    const device = devices[i];
    const result = batchResults[i] || { success: false, reason: 'missing_result' };

    if (result.success) {
      sentAppleCount++;
      if (device.serial_number) deliveredSerials.push(device.serial_number);
    } else {
      if (pushFailures.length < APNS_RESULT_SAMPLE_LIMIT) {
        pushFailures.push({
          success: false,
          token: device.push_token ? `${device.push_token.substring(0, 12)}...` : 'unknown',
          serial: device.serial_number,
          statusCode: result.statusCode || null,
          reason: result.reason || 'failed',
          error: result.error || null,
        });
      }
    }

    if (!result.success && shouldPruneApnsRegistration(result) && device.device_library_id && device.serial_number) {
      try {
        await unregisterDevice(device.device_library_id, device.serial_number);
        console.warn(`[PUSH] removed invalid APNs registration device=${device.device_library_id.substring(0, 8)}... serial=${device.serial_number}`);
      } catch (cleanupErr) {
        console.warn('[PUSH] failed to cleanup invalid registration:', cleanupErr.message);
      }
      if (device.serial_number) {
        await markPassPushStatus(device.serial_number, result.reason || 'failed');
      }
    } else if (device.serial_number) {
      await markPassPushStatus(device.serial_number, result.reason || 'failed');
    }

    if (onProgress && (i + 1) % 25 === 0) {
      await onProgress({ phase: 'apns', sent: sentAppleCount, processed: i + 1, total: devices.length });
    }
  }

  if (deliveredSerials.length) {
    await markPassesPushDelivered(deliveredSerials);
  }

  return { sentAppleCount, pushResults: pushFailures };
}

async function executeWalletPush(body, ctx = {}) {
  const {
    brand_id,
    title,
    message,
    campaign_id,
    audience_id,
    update_pass,
    instant_win_id,
    gamification_id,
    channel = 'all',
    back_link_label,
    back_link_url,
    include_pass_link,
    pass_link_url,
    pass_link_label,
    pass_link_expires_at,
    back_details,
    screen_alert,
    test_pass_id,
  } = body;

  if (!brand_id) {
    throw new Error('brand_id richiesto');
  }
  const screenTextInput = resolvePushScreenAlert({ screen_alert, title, message });
  const effectiveTitle = String(title || screenTextInput || 'Aggiornamento').trim().slice(0, 22);
  const effectiveMessage = String(message || screenTextInput || 'Apri il pass per i dettagli').trim().slice(0, 66);

  const { sendApple, sendGoogle, sendSamsung } = parseWalletPushFlags(channel);
  const pushTargetOpts = { campaign_id, audience_id };
  let targetPasses = await getTargetPassesForPush(brand_id, pushTargetOpts);

  if (test_pass_id) {
    targetPasses = targetPasses.filter((p) => String(p.id) === String(test_pass_id));
    if (!targetPasses.length) {
      throw new Error('Pass di prova non trovato per questo brand');
    }
  }

  const googleEligible = targetPasses.filter((p) => p.google_wallet_object_id);
  const samsungEligible = targetPasses.filter((p) => p.samsung_wallet_ref_id && p.samsung_wallet_saved);
  let overlayStrip = null;
  let passLink = null;

  let devices = [];
  if (sendApple) {
    devices = await getAppleDevicesForAudience(brand_id, pushTargetOpts);
    if (test_pass_id && targetPasses.length === 1) {
      const testSerial = targetPasses[0].serial_number;
      devices = devices.filter((d) => d.serial_number === testSerial);
    }
  }

  const appleEmpty = !sendApple || devices.length === 0;
  const googleEmpty = !sendGoogle || googleEligible.length === 0;
  const samsungEmpty = !sendSamsung || samsungEligible.length === 0 || !samsungWallet.isConfigured();

  if (ctx.onProgress) {
    await ctx.onProgress({
      phase: 'targets',
      target_passes: targetPasses.length,
      apple_total: sendApple ? devices.length : 0,
      google_total: sendGoogle ? googleEligible.length : 0,
      samsung_total: sendSamsung ? samsungEligible.length : 0,
    });
  }

  if (appleEmpty && googleEmpty && samsungEmpty) {
    const allDevices = await pool.query('SELECT COUNT(*) as count FROM device_registrations');
    const allPasses = await pool.query('SELECT DISTINCT brand_id FROM pass_instances');
    return {
      sent_apns: 0,
      total_apns: sendApple ? devices.length : 0,
      google: { attempted: sendGoogle ? googleEligible.length : 0, updated: 0, errors: 0, skipped: !sendGoogle || !googleWallet.isConfigured() },
      samsung: {
        attempted: sendSamsung ? samsungEligible.length : 0,
        notified: 0,
        skipped: !sendSamsung || !samsungWallet.isConfigured(),
      },
      message: 'Nessun destinatario per i canali selezionati',
      debug: {
        brand_id_sent: brand_id,
        total_devices_in_db: parseInt(allDevices.rows[0].count, 10),
        brand_ids_in_passes: allPasses.rows.map((r) => r.brand_id),
      },
    };
  }

  if (update_pass !== false) {
    let brand = await getBrand(brand_id);
    const { syncWalletLogoFromBrandIdentity, syncWalletIconFromBrandIdentity } = require('./brand-wallet-logo');
    const hrDeploy = Boolean(ctx.hrDeploy);

    try {
      if (!hrDeploy) {
        await syncWalletLogoFromBrandIdentity(brand_id, brand, { syncTemplates: false });
        brand = await getBrand(brand_id);
        await syncWalletIconFromBrandIdentity(brand_id, brand, { touchPasses: false });
        brand = await getBrand(brand_id);
      }
    } catch (syncErr) {
      console.warn('[PUSH] wallet logo sync skipped:', syncErr.message);
    }

    const config = { ...(brand.config || {}) };
    const screenText = screenTextInput;
    if (ctx.hrDeploy && update_pass !== false && !screenText) {
      throw new Error('screen_alert richiesto per la notifica Wallet');
    }
    const announcement = attachBackDetailsToAnnouncement(
      {
        title: effectiveTitle,
        message: effectiveMessage,
        ts: Date.now(),
        ...(screenText ? { screen_alert: screenText.slice(0, 178) } : {}),
      },
      back_details
    );

    if (!instant_win_id) delete config.instantWinActive;
    if (!gamification_id) delete config.gamificationActive;

    const pushStripB64 = ctx.resolvedStripBase64 || null;
    overlayStrip = pushStripB64 || null;
    delete config.pushAnnouncement;
    delete config.stripOverride;

    passLink = parsePassLinkFromPushBody(
      { include_pass_link, pass_link_url, pass_link_label, pass_link_expires_at, back_link_url, back_link_label },
      effectiveTitle
    );
    if (!passLink && include_pass_link !== false) {
      const linkOutUrl = (back_link_url || pass_link_url || '').trim();
      if (linkOutUrl) {
        passLink = parsePassLinkFromPushBody(
          {
            include_pass_link: true,
            pass_link_url: linkOutUrl,
            pass_link_label: back_link_label || pass_link_label,
            pass_link_expires_at,
          },
          title
        );
      }
    }

    const passIds = targetPasses.map((p) => p.id);
    if (passLink) {
      await updatePassDynamicLinks(passIds, passLink);
      delete config.pushLinkOut;
    } else if (passIds.length) {
      await clearPassDynamicLinks(passIds);
      delete config.pushLinkOut;
    } else {
      delete config.pushLinkOut;
    }

    if (pushStripB64 && !hrDeploy) {
      config.stripOverride = pushStripB64;
    }

    if (instant_win_id) {
      const iwCampaign = await getInstantWinCampaign(instant_win_id);
      if (iwCampaign && iwCampaign.status === 'active') {
        config.instantWinActive = {
          campaign_id: iwCampaign.id,
          label: iwCampaign.push_message || iwCampaign.name || 'Gioca e Vinci!',
          game_type: iwCampaign.game_type,
        };
        if (!overlayStrip && iwCampaign.strip_base64) {
          overlayStrip = iwCampaign.strip_base64;
          if (!hrDeploy) config.stripOverride = iwCampaign.strip_base64;
        }
      }
    }

    if (gamification_id) {
      const gamCampaign = await getGamificationCampaign(gamification_id);
      if (gamCampaign && gamCampaign.status === 'active') {
        config.gamificationActive = {
          campaign_id: gamCampaign.id,
          label: gamCampaign.push_message || gamCampaign.name || 'Gioca ora!',
          game_type: gamCampaign.game_type,
        };
        if (!overlayStrip && gamCampaign.strip_base64) {
          overlayStrip = gamCampaign.strip_base64;
          if (!hrDeploy) config.stripOverride = gamCampaign.strip_base64;
        }
      }
    }

    await updateBrand(brand_id, { config });

    if (targetPasses.length) {
      if (hrDeploy) {
        await updatePassPushOverlays(targetPasses.map((p) => p.id), {
          announcement,
          stripBase64: overlayStrip || null,
        });
      }
      await touchPassesByIds(targetPasses.map((p) => p.id));
      targetPasses = await getTargetPassesForPush(brand_id, pushTargetOpts);
      if (test_pass_id) {
        targetPasses = targetPasses.filter((p) => String(p.id) === String(test_pass_id));
      }
    }
  }

  if (ctx.onProgress) {
    await ctx.onProgress({
      phase: 'wallet_sync',
      total_apns: devices.length,
      google_total: sendGoogle ? googleEligible.length : 0,
      samsung_total: sendSamsung ? samsungEligible.length : 0,
    });
  }

  let googleSync = { attempted: 0, updated: 0, errors: 0, skipped: !sendGoogle };
  if (sendGoogle) {
    const brand = await getBrand(brand_id);
    googleSync = await syncGoogleWalletObjectsForPasses({
      brand,
      passes: targetPasses,
      title: effectiveTitle,
      message: effectiveMessage,
      screen_alert: screenTextInput,
      back_details,
      passLink,
      onProgress: ctx.onProgress
        ? (progress) => ctx.onProgress({ phase: 'google', ...progress })
        : null,
    });
  }

  let samsungSync = { attempted: 0, notified: 0, skipped: !sendSamsung || !samsungWallet.isConfigured() };
  if (sendSamsung && samsungWallet.isConfigured()) {
    samsungSync = await notifySamsungSavedPasses(targetPasses);
  }

  let sentAppleCount = 0;
  let pushResults = [];
  if (sendApple && devices.length) {
    const batchResults = await sendPushBatch(
      devices.map((d) => d.push_token),
      { concurrency: ctx.apnsConcurrency }
    );
    const applied = await applyApplePushResults(devices, batchResults, ctx);
    sentAppleCount = applied.sentAppleCount;
    pushResults = applied.pushResults;
    if (ctx.onProgress) {
      await ctx.onProgress({
        phase: 'apns',
        sent: sentAppleCount,
        processed: devices.length,
        total: devices.length,
      });
    }
  }

  const sentCombined = sentAppleCount + (googleSync.updated || 0) + (samsungSync.notified || 0);
  await logPush({ brand_id, title, message, campaign_id, sent_count: sentCombined, channel, strip_base64: overlayStrip || null, screen_alert: screenTextInput || null });

  return {
    sent_apns: sentAppleCount,
    total_apns: sendApple ? devices.length : 0,
    google: googleSync,
    samsung: samsungSync,
    sent: sentCombined,
    apns_results: pushResults,
  };
}

function enqueuePushJob(jobId, ctx = {}) {
  if (activeJobIds.has(jobId)) return;
  activeJobIds.add(jobId);

  setImmediate(async () => {
    try {
      await runPushJob(jobId, ctx);
    } catch (err) {
      console.error(`[PUSH JOB] ${jobId} crashed:`, err.message);
      await updatePushJob(jobId, {
        status: 'failed',
        error: err.message,
        completed_at: new Date(),
      });
    } finally {
      activeJobIds.delete(jobId);
      closeApnsSession();
    }
  });
}

async function runPushJob(jobId, ctx = {}) {
  const job = await claimPushJob(jobId);
  if (!job) {
    const existing = await getPushJob(jobId);
    if (existing && (existing.status === 'running' || existing.status === 'completed')) {
      return;
    }
    console.warn(`[PUSH JOB] ${jobId} not claimed (status=${existing?.status || 'missing'})`);
    return;
  }

  const startedAt = Date.now();
  try {
    const result = await executeWalletPush(job.payload, {
      ...ctx,
      onProgress: async (progress) => {
        await updatePushJob(jobId, { progress });
      },
    });

    const durationMs = Date.now() - startedAt;
    console.log(
      `[PUSH JOB] ${jobId} completed apns=${result.sent_apns}/${result.total_apns} duration_ms=${durationMs}`
    );

    await updatePushJob(jobId, {
      status: 'completed',
      result,
      completed_at: new Date(),
      progress: {
        phase: 'done',
        sent_apns: result.sent_apns,
        total_apns: result.total_apns,
        duration_ms: durationMs,
      },
    });
  } catch (err) {
    await updatePushJob(jobId, {
      status: 'failed',
      error: err.message,
      completed_at: new Date(),
    });
    throw err;
  }
}

module.exports = {
  executeWalletPush,
  enqueuePushJob,
  runPushJob,
  parseWalletPushFlags,
};

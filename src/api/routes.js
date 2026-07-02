const express = require('express');
const {
  normalizeRole,
  isValidRole,
  userMayAccessBrand: rbacUserMayAccessBrand,
  classifyApiRoute,
  enforceApiPermission,
  rbacApiMiddleware,
  canExecuteWaiIntent,
} = require('../engine/rbac');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const { createHash, randomBytes, timingSafeEqual } = require('crypto');
const {
  createBrand, getBrand, getBrandBySlug, listBrands, updateBrand, deleteBrand,
  createTemplate, getTemplate, listTemplates, updateTemplate, deleteTemplate,
  createCampaign, getCampaign, listCampaigns, updateCampaign, deleteCampaign,
  incrementCampaignDownloads, incrementCampaignInstalls,
  createPassInstance, getPassInstance, getPassBySerial, updatePassInstance, touchPass, touchPassesByIds, touchPassesForTemplate, listPasses, countPasses, deletePass, clearPassPushOverlay,
  getMemberForPass, listEmployeesForBrand, getEmployeeFieldOptionsForBrand,
  isEmployeeMatricolaAvailable, importEmployeesBatch,
  findMemberByBrandKey, createMemberRecord, updateMemberRecord, deleteMemberRecord,
  logEnrollmentAttempt,
  createImportError, listImportErrors,
  updatePassDynamicLinks,
  logEvent, listEvents,
  registerDevice, getDevicesForPass, getDevicesForBrand, getDevicesForTemplate, unregisterDevice, getSerialsForDevice,
  getAnalytics, getCampaignAnalytics,
  logPush, listPushes, deletePush, clearPushHistory,
  createPushJob, getPushJob,
  createScheduledPush, listScheduledPush, getScheduledPush, updateScheduledPush, deleteScheduledPush, logPushAssistantInteraction, logWaiInteraction, listWaiLog,
  createStripPromo, listStripPromos, getStripPromo, updateStripPromo, deleteStripPromo,
  createUser, getUserByEmail, getUser, listUsers, updateUser, deleteUser, verifyPassword,
  createPasswordResetToken, getPasswordResetUserByToken, markPasswordResetTokenUsed,
  createMedia, listMedia, getMedia, deleteMedia,
  logAdEvent, getAdStats, getAdTimeline,
  createCreativeAsset, getCreativeAsset, listCreativeAssets, deleteCreativeAsset,
  createInstantWinCampaign, getInstantWinCampaign, listInstantWinCampaigns,
  updateInstantWinCampaign, deleteInstantWinCampaign,
  createInstantWinPlay, listInstantWinPlays, countPlaysForUser, getInstantWinStats,
  createGamificationCampaign, getGamificationCampaign, listGamificationCampaigns,
  updateGamificationCampaign, deleteGamificationCampaign,
  createGamificationPlay, listGamificationPlays, countGamificationPlaysForUser, getGamificationStats,
  pool,
  updatePassDeviceId,
  updateGoogleWalletStatus,
  updateSamsungWalletStatus,
  getPassBySamsungRefId,
  registerWalletCallbackEvent,
  finalizeWalletCallbackEvent,
  createAudience,
  getAudience,
  listAudiences,
  updateAudience,
  deleteAudience,
  getHubSettings,
  listMerchantGeofenceLocationsForBrand
} = require('../db');
const { buildGeofenceDiagnostics } = require('../engine/geofencing');
const {
  getPassHoldersInsights,
  countAudienceMembers,
  listAudienceMembers,
  normalizeRules,
  hasActiveRules,
  getTargetPassesForPush,
  getAppleDevicesForAudience,
  ALLOWED_EVENT_ACTIONS
} = require('../engine/audiences');
const { executeAudienceQuery, mergeSpecToAudienceRules } = require('../engine/audience-query');
const {
  resolveAudienceQueryWindow,
  buildAudienceQueryServerWarnings,
  formatAudienceQueryAnswer,
  todayInTimezone,
  dateDaysAgoInTimezone,
  TZ
} = require('../engine/audience-prompt');
const { getHolderBehaviorInsights, listRecentHolderEvents, exportHolderEvents } = require('../engine/holder-events');
const { createPkpass, STRIP_OVERLAY_TITLE_MAX_1X, STRIP_OVERLAY_MSG_MAX_1X } = require('../engine/passkit');
const {
  validatePushText,
  validatePushScreenAlert,
  validatePushBackDetails,
  PUSH_SCREEN_ALERT_MAX,
  normalizePushBackDetails,
  normalizeHrPushPayload,
  PUSH_TITLE_MAX,
  PUSH_MESSAGE_MAX,
  PUSH_BACK_DETAILS_MAX,
} = require('../engine/push-text-limits');
const { buildPkpassCached } = require('../engine/pkpass-cache');
const googleWallet = require('../engine/google-wallet');
const samsungWallet = require('../engine/samsung-wallet');
const { resolvePortalHref } = require('../engine/thank-you-html');
const { getFormats, getFormat, generateWithFal, composeCreative } = require('../engine/creative-ai');
const { generateBanner, BANNER_TEMPLATES, IAB_FORMATS } = require('../engine/banner-builder');
const { generateVideo, cleanupVideo, VIDEO_FORMATS, VIDEO_TEMPLATES } = require('../engine/video-builder');
const { sendPushUpdate, sendPushBatch, shouldPruneApnsRegistration } = require('../engine/apns');
const { executeWalletPush, enqueuePushJob } = require('../engine/push-dispatch');
const { syncGoogleWalletObjectsForPasses } = require('../engine/google-wallet-sync');
const { computeInitialScheduledRun } = require('../engine/scheduler');

async function syncGoogleWalletClassForTemplate(brand, template) {
  if (!googleWallet.isConfigured() || !brand || !template) return;
  try {
    await googleWallet.createOrUpdatePassClass(brand, template);
  } catch (err) {
    console.error('[GoogleWallet] template class sync failed:', template.id, err.message);
  }
}
const { generateLandingCopy, generateCreativeCopy } = require('../engine/ai-copy');
const { planScheduledPush } = require('../engine/push-assistant');
const { draftImmediatePushCopy } = require('../engine/push-draft-copy');
const { askWai, EXECUTABLE_INTENTS, validateWaiResponse } = require('../engine/wai');
const { resolveBaseUrl, getProductBrandName } = require('../engine/base-url');
const { requiredSecret, requireDebugAccess } = require('../engine/security-config');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const { execFile } = require('child_process');
const os = require('os');

const router = express.Router();
const { registerHubMerchantRoutes } = require('./hub-merchants');
const { registerHubPwaRoutes } = require('./hub-pwa');
const { registerPgaDashboardRoutes } = require('./pga-dashboard');

function uuidv4() {
  return randomUUID();
}

const DEPLOY_PRODUCT_LINES = ['ads', 'hr', 'engage', 'live'];
/** Filo_Diretto repo: deploy is HR-only. */
function deployProductLineLock() {
  return 'hr';
}
function brandProductLine(brand) {
  const pl = brand?.config?.product_line;
  return DEPLOY_PRODUCT_LINES.includes(pl) ? pl : 'hr';
}
function brandAllowedOnDeploy(brand) {
  const lock = deployProductLineLock();
  if (!lock) return true;
  return brandProductLine(brand) === lock;
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

function validateBrandBackLinks(data) {
  if (data.back_resources) {
    for (const row of data.back_resources) {
      if (row?.url) assertHttpsUrl(row.url, 'URL risorsa');
    }
  }
  if (data.back_documents) {
    for (const row of data.back_documents) {
      if (row?.url) assertHttpsUrl(row.url, 'URL documento');
    }
  }
}

function validateTemplateBackPayload(body) {
  if (body.back_fixed_link_url) assertHttpsUrl(body.back_fixed_link_url, 'Link fisso fallback');
  validateBrandBackLinks(body);
}

/** Comma-separated deploy operator emails (platform bootstrap + protected admins on HR deploys). */
function dashboardLoginAllowlist() {
  const raw = String(process.env.DASHBOARD_LOGIN_ALLOWLIST || '').trim();
  if (raw) {
    return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  }
  if (deployProductLineLock() === 'hr') return ['admin@nudj.studio'];
  return null;
}

function isDashboardOperatorEmail(email) {
  const list = dashboardLoginAllowlist();
  if (!list) return false;
  return list.includes(String(email || '').trim().toLowerCase());
}

/** Whether a stored dashboard account may sign in on a locked HR deploy. */
function canDashboardUserLogin(user) {
  const list = dashboardLoginAllowlist();
  if (!list) return true;
  const email = String(user?.email || '').trim().toLowerCase();
  if (isDashboardOperatorEmail(email)) return true;
  // Default dev seed must not bypass operator lock on existing HR databases.
  if (email === 'admin@ads2wallet.com' || email === 'admin@filodiretto.app') return false;
  return Boolean(user?.id);
}

function rejectIfDeployOperatorNotAllowed(req, res) {
  if (dashboardLoginAllowlist() && !isDashboardOperatorEmail(req.user?.email)) {
    res.status(403).json({ error: 'Accesso non autorizzato su questa istanza dashboard' });
    return true;
  }
  return false;
}

/** Canali wallet singoli. Legacy `both` resta nei record DB ma non è più selezionabile in UI. */
const PUSH_CHANNEL_KEYS = ['apple', 'google', 'samsung'];
const PUSH_CHANNELS = [
  'apple', 'google', 'samsung', 'all',
  'apple,google', 'apple,samsung', 'google,samsung'
];

function normalizePushChannelList(channel) {
  const raw = String(channel || 'all').trim().toLowerCase();
  if (!raw) return [...PUSH_CHANNEL_KEYS];
  if (raw === 'both') return ['apple', 'google'];
  if (raw === 'all') return [...PUSH_CHANNEL_KEYS];
  if (raw.includes(',')) {
    const parts = raw.split(',').map((s) => s.trim()).filter((k) => PUSH_CHANNEL_KEYS.includes(k));
    return parts.length ? [...new Set(parts)] : null;
  }
  return PUSH_CHANNEL_KEYS.includes(raw) ? [raw] : null;
}

function assertPushChannel(ch) {
  if (ch === 'both') return true;
  if (PUSH_CHANNELS.includes(String(ch || '').trim().toLowerCase())) return true;
  const parts = normalizePushChannelList(ch);
  return !!(parts && parts.length >= 1 && parts.length <= PUSH_CHANNEL_KEYS.length);
}

function parseWalletPushFlags(channel) {
  const parts = normalizePushChannelList(channel);
  if (!parts || !parts.length) {
    return { sendApple: true, sendGoogle: false, sendSamsung: false };
  }
  return {
    sendApple: parts.includes('apple'),
    sendGoogle: parts.includes('google'),
    sendSamsung: parts.includes('samsung')
  };
}

/**
 * Convert a base64 PDF (first page) to base64 PNG using pdftoppm (poppler-utils).
 * If input is not a PDF (no %PDF header), returns it unchanged.
 */
async function pdfToPngIfNeeded(base64Data) {
  const buf = Buffer.from(base64Data, 'base64');
  // Check PDF magic bytes: %PDF
  if (buf.length < 4 || buf.toString('ascii', 0, 4) !== '%PDF') return base64Data;
  const tmpDir = os.tmpdir();
  const tmpId = `pdf-conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const pdfPath = path.join(tmpDir, `${tmpId}.pdf`);
  const outPrefix = path.join(tmpDir, tmpId);
  fs.writeFileSync(pdfPath, buf);
  try {
    await new Promise((resolve, reject) => {
      execFile('pdftoppm', ['-png', '-f', '1', '-l', '1', '-r', '300', '-singlefile', pdfPath, outPrefix], { timeout: 15000 }, (err) => {
        if (err) reject(err); else resolve();
      });
    });
    const pngPath = `${outPrefix}.png`;
    const pngBuf = fs.readFileSync(pngPath);
    // Cleanup
    try { fs.unlinkSync(pdfPath); } catch (e) { }
    try { fs.unlinkSync(pngPath); } catch (e) { }
    return pngBuf.toString('base64');
  } catch (err) {
    console.error('PDFÃÂÃÂ¢ÃÂÃÂÃÂÃÂPNG conversion error:', err.message);
    try { fs.unlinkSync(pdfPath); } catch (e) { }
    throw new Error('Impossibile convertire il PDF in immagine. Verifica che il file sia un PDF valido.');
  }
}

/** Strip per push: media library id o base64 inline; verifica tenant. */
async function resolvePushStripBase64({ brand_id, strip_media_id, strip_base64 }) {
  if (strip_media_id) {
    const media = await getMedia(strip_media_id);
    if (!media || String(media.brand_id) !== String(brand_id)) {
      throw new Error('Media strip non trovato o non appartiene al brand');
    }
    if (!media.image_base64) throw new Error('Media senza immagine');
    return pdfToPngIfNeeded(media.image_base64);
  }
  if (strip_base64) {
    return pdfToPngIfNeeded(strip_base64);
  }
  return null;
}

async function notifySamsungSavedPasses(passes) {
  return samsungWallet.notifySavedPassesUpdates(passes);
}

const JWT_SECRET = requiredSecret('JWT_SECRET', { fallback: 'nudj-secret-change-me-in-prod' });
const JWT_EXPIRES = '7d';


// =====================================================================// PUBLIC ENDPOINTS (before auth middleware)
// =====================================================================
// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Auth ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e password richiesti' });
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Credenziali non valide' });
    if (!canDashboardUserLogin(user)) {
      return res.status(403).json({ error: 'Accesso non autorizzato su questa istanza dashboard' });
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenziali non valide' });
    const operator = await ensurePlatformAdminIfAllowlisted(user);
    const token = jwt.sign({ id: operator.id, email: operator.email, name: operator.name, role: operator.role, brand_id: operator.brand_id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, user: { id: operator.id, email: operator.email, name: operator.name, role: operator.role, brand_id: operator.brand_id } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Errore login' });
  }
});

const forgotPasswordBuckets = new Map();

function enforceForgotPasswordRateLimit(key) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 5;
  const bucket = forgotPasswordBuckets.get(key) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    const err = new Error('Troppe richieste. Riprova tra qualche minuto.');
    err.status = 429;
    throw err;
  }
  recent.push(now);
  forgotPasswordBuckets.set(key, recent);
}

function buildDashboardPublicUrl(req, query = '') {
  const domain = process.env.CUSTOM_DOMAIN || req.headers.host || 'localhost';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
  const q = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  return `${proto}://${domain}/dashboard${q}`;
}

function dashboardProductTitle() {
  return String(process.env.DASHBOARD_PRODUCT_TITLE || '').trim() || 'FiloDiretto';
}

function buildPublicBrandLogoUrl(brand) {
  if (!brand?.slug) return null;
  const raw = String(process.env.CUSTOM_DOMAIN || process.env.BASE_URL || '').trim();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const { publicBrandMarkVersion } = require('../engine/brand-wallet-logo');
  const version = publicBrandMarkVersion(brand);
  return `https://${host}/api/v1/brands/by-slug/${encodeURIComponent(brand.slug)}/mark?v=${encodeURIComponent(version)}`;
}

const { publicBrandTheme } = require('../engine/public-brand-theme');

function publicBrandLogoPath(brand) {
  const slug = brand?.slug;
  if (!slug) return null;
  const { publicBrandMarkVersion } = require('../engine/brand-wallet-logo');
  const version = publicBrandMarkVersion(brand);
  return `/api/v1/brands/by-slug/${encodeURIComponent(slug)}/mark?v=${encodeURIComponent(version)}`;
}

async function resolveUserInviteBrandContext(user) {
  if (!user?.brand_id) return { brandName: null, brandLogo: null, brandLogoAttachment: null };
  const brand = await getBrand(user.brand_id);
  if (!brand) return { brandName: null, brandLogo: null, brandLogoAttachment: null };
  const logoUrl = buildPublicBrandLogoUrl(brand);

  return {
    brandName: brand.name || null,
    brandLogo: logoUrl ? { url: logoUrl } : null,
    brandLogoAttachment: null,
  };
}

async function sendDashboardUserInviteEmail(req, user) {
  const token = await createPasswordResetToken(user.id, 72 * 60 * 60 * 1000);
  const activateUrl = buildDashboardPublicUrl(req, `reset=${encodeURIComponent(token)}`);
  const { brandName, brandLogo, brandLogoAttachment } = await resolveUserInviteBrandContext(user);
  const { sendUserInviteEmail } = require('../engine/mailer');
  await sendUserInviteEmail({
    to: user.email,
    name: user.name,
    role: user.role || 'manager',
    brandName,
    brandLogo,
    brandLogoAttachment,
    activateUrl,
    productTitle: dashboardProductTitle()
  });
}

router.post('/auth/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email richiesta' });
    enforceForgotPasswordRateLimit(email);

    const generic = {
      success: true,
      message: 'Se l\'email è registrata, riceverai le istruzioni per reimpostare la password.'
    };

    const user = await getUserByEmail(email);
    if (user) {
      const token = await createPasswordResetToken(user.id);
      const resetUrl = buildDashboardPublicUrl(req, `reset=${encodeURIComponent(token)}`);
      try {
        const { sendPasswordResetEmail } = require('../engine/mailer');
        await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
      } catch (emailErr) {
        console.error('Password reset email failed:', emailErr.message);
      }
    }

    res.json(generic);
  } catch (err) {
    if (err.status === 429) return res.status(429).json({ error: err.message });
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Errore richiesta recupero password' });
  }
});

router.post('/auth/reset-password', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.new_password || '');
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token e nuova password richiesti' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password minimo 6 caratteri' });
    }

    const row = await getPasswordResetUserByToken(token);
    if (!row) return res.status(400).json({ error: 'Link non valido o scaduto' });

    await updateUser(row.user_id, { password: newPassword });
    await markPasswordResetTokenUsed(token);
    res.json({ success: true, message: 'Password aggiornata. Puoi accedere.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: err.message || 'Errore reimpostazione password' });
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Debug: Full push diagnostics ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.get('/debug/push-diagnostics', requireDebugAccess, async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const certPath = process.env.CERT_PATH || path.join(__dirname, '../../certs/signerCert.pem');
    const keyPath = process.env.KEY_PATH || path.join(__dirname, '../../certs/signerKey.pem');

    const deviceCount = await pool.query('SELECT COUNT(*) as count FROM device_registrations');
    const passCount = await pool.query('SELECT COUNT(*) as count FROM pass_instances');
    const devices = await pool.query('SELECT device_library_id, push_token, serial_number, created_at FROM device_registrations ORDER BY created_at DESC LIMIT 20');
    const passes = await pool.query('SELECT id, serial_number, brand_id, auth_token, created_at FROM pass_instances ORDER BY created_at DESC LIMIT 20');
    const recentEvents = await pool.query("SELECT event_type, metadata, created_at FROM events ORDER BY created_at DESC LIMIT 30");

    // Check certs
    const certsExist = {
      signerCert: fs.existsSync(certPath),
      signerKey: fs.existsSync(keyPath),
      certPath,
      keyPath
    };

    // Check if serial_numbers match between passes and devices
    const orphanDevices = await pool.query(
      `SELECT dr.* FROM device_registrations dr
       LEFT JOIN pass_instances pi ON dr.serial_number = pi.serial_number
       WHERE pi.id IS NULL`
    );

    const debugBaseUrl = resolveBaseUrl(req);

    res.json({
      status: 'ok',
      build_version: '3.0.0-' + Date.now(),
      env: {
        CUSTOM_DOMAIN: process.env.CUSTOM_DOMAIN || 'NOT SET',
        PASS_TYPE_IDENTIFIER: process.env.PASS_TYPE_IDENTIFIER || 'NOT SET',
        TEAM_IDENTIFIER: process.env.TEAM_IDENTIFIER || 'NOT SET',
        APNS_ENV: process.env.APNS_ENV || 'production (default)',
        NODE_ENV: process.env.NODE_ENV || 'NOT SET'
      },
      webServiceURL_in_pass: `${debugBaseUrl}/api`,
      apple_will_call: `${debugBaseUrl}/api/v1/devices/{did}/registrations/{ptid}/{sn}`,
      certs: certsExist,
      counts: {
        registered_devices: parseInt(deviceCount.rows[0].count),
        total_passes: parseInt(passCount.rows[0].count),
        orphan_device_registrations: orphanDevices.rows.length
      },
      devices: devices.rows.map(d => ({
        device: d.device_library_id?.substring(0, 16) + '...',
        token: d.push_token?.substring(0, 16) + '...',
        serial: d.serial_number,
        created: d.created_at
      })),
      passes: passes.rows.map(p => ({
        id: p.id?.substring(0, 12) + '...',
        serial: p.serial_number,
        brand: p.brand_id?.substring(0, 12) + '...',
        auth_token_length: p.auth_token?.length,
        created: p.created_at
      })),
      recent_events: recentEvents.rows.map(e => ({
        type: e.event_type,
        meta: e.metadata,
        at: e.created_at
      })),
      troubleshooting: [
        'If registered_devices=0: pass in Wallet may have wrong webServiceURL',
        'Check that webServiceURL in pass.json is baseUrl/api (NOT /api/v1)',
        'Apple adds /v1/ prefix automatically',
        'Fix: delete pass from Wallet, re-download from dashboard, re-add',
        'If certs missing: push will silently fail'
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Brand lookup by slug (used by landing page) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.get('/brands/by-slug/:slug', async (req, res) => {
  try {
    const brand = await getBrandBySlug(req.params.slug);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    // Strip heavy base64 data from public response ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ images served via dedicated endpoints
    const safeConfig = { ...(brand.config || {}) };
    delete safeConfig.logos;
    delete safeConfig.landingBg;
    delete safeConfig.privacy_document;
    res.json({
      ...brand,
      config: safeConfig,
      brand_theme: publicBrandTheme(brand),
      wallet: { google: googleWallet.isConfigured(), samsung: samsungWallet.isConfigured() }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Brand logo by slug (public, for landing page) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.get('/brands/by-slug/:slug/logo', async (req, res) => {
  try {
    const brand = await getBrandBySlug(req.params.slug);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    let template = null;
    const passId = String(req.query.pass_id || '').trim();
    const templateId = String(req.query.template_id || '').trim();
    if (passId) {
      const pass = await getPassInstance(passId);
      if (pass && String(pass.brand_id) === String(brand.id) && pass.template_id) {
        template = await getTemplate(pass.template_id);
      }
    } else if (templateId) {
      const tpl = await getTemplate(templateId);
      if (tpl && String(tpl.brand_id) === String(brand.id)) {
        template = tpl;
      }
    }

    const { resolveWalletLogoRawBuffer } = require('../engine/brand-wallet-logo');
    const resolved = await resolveWalletLogoRawBuffer(brand, template);
    if (resolved?.buffer) {
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      return res.send(resolved.buffer);
    }
    const logoB64 = brand?.config?.logos?.['logo@2x'] || brand?.config?.logos?.logo;
    if (!logoB64) return res.status(404).json({ error: 'Nessun logo' });
    const buf = Buffer.from(logoB64, 'base64');
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brands/by-slug/:slug/mark', async (req, res) => {
  try {
    const brand = await getBrandBySlug(req.params.slug);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    const sharp = require('sharp');
    const { resolveBrandMarkRawBuffer, buildNotificationIconFromRaw } = require('../engine/brand-wallet-logo');
    const resolved = await resolveBrandMarkRawBuffer(brand);
    if (!resolved?.buffer) return res.status(404).json({ error: 'Nessuna icona notifiche' });
    const iconPack = await buildNotificationIconFromRaw(resolved.buffer);
    const png = await sharp(iconPack.icon2x)
      .resize(256, 256, { fit: 'cover', position: 'centre' })
      .png()
      .toBuffer();
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(png);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brands/by-slug/:slug/strip', async (req, res) => {
  try {
    const brand = await getBrandBySlug(req.params.slug);
    const stripBase64 = brand?.config?.logos?.strip || brand?.config?.strip_base64 || null;
    if (!stripBase64) return res.status(404).json({ error: 'Nessuna strip' });
    const buf = Buffer.from(stripBase64, 'base64');
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Brand landing background by slug (public) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.get('/brands/by-slug/:slug/landing-bg', async (req, res) => {
  try {
    const brand = await getBrandBySlug(req.params.slug);
    if (!brand?.config?.landingBg) return res.status(404).json({ error: 'Nessuna immagine' });
    const buf = Buffer.from(brand.config.landingBg, 'base64');
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'no-cache, must-revalidate');
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Anonymous signup ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ zero data, just download .pkpass ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.post('/signup', async (req, res) => {
  try {
    const { brand_slug, campaign_id, utm } = req.body;
    if (!brand_slug) return res.status(400).json({ error: 'brand_slug richiesto' });

    // Find brand
    const brand = await getBrandBySlug(brand_slug);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    // Find template (use campaign template if specified, otherwise first active template)
    let template = null;
    if (campaign_id) {
      const campaign = await getCampaign(campaign_id);
      if (campaign && campaign.template_id) {
        template = await getTemplate(campaign.template_id);
      }
    }
    if (!template) {
      const templates = await listTemplates(brand.id);
      template = templates[0];
    }
    if (!template) return res.status(400).json({ error: 'Nessun template configurato per questo brand' });

    // Create anonymous pass instance with browser metadata
    const passData = {
      template_id: template.id,
      brand_id: brand.id,
      campaign_id: campaign_id || null,
      field_values: {},
      utm: utm || {},
      user_agent: req.headers['user-agent'] || null,
      referrer_url: req.headers['referer'] || req.body.referrer || null
    };
    const passInstance = await createPassInstance(passData);

    // Log event
    await logEvent({ pass_id: passInstance.id, brand_id: brand.id, event_type: 'pass_created', metadata: { source: 'landing', campaign_id, utm } });

    // Increment campaign downloads
    if (campaign_id) await incrementCampaignDownloads(campaign_id);

    const passDownloadUrl = `/api/v1/passes/${passInstance.id}/download`;
    const portalHref = await resolvePortalHref(passInstance.id, brand.id);

    // Generate .pkpass
    const baseUrl = resolveBaseUrl(req);

    const pkpassBuffer = await createPkpass(template, passInstance, brand, {
      baseUrl,
      passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER || 'pass.com.nudj',
      teamIdentifier: process.env.TEAM_IDENTIFIER || 'YOUR_TEAM_ID'
    });

    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="${brand.slug || 'pass'}.pkpass"`,
      'Content-Length': pkpassBuffer.length,
      'X-Pass-Id': passInstance.id,
      'X-Pass-Download-Url': passDownloadUrl,
      ...(portalHref ? { 'X-Portal-Href': portalHref } : {})
    });
    res.send(pkpassBuffer);

  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Errore creazione pass: ' + err.message });
  }
});

// =====================================================================// GOOGLE WALLET SIGNUP â same flow as /signup but returns Google Wallet save link
// =====================================================================

router.post('/signup/google-wallet', async (req, res) => {
  try {
    if (!googleWallet.isConfigured()) {
      return res.status(501).json({ error: 'Google Wallet non configurato' });
    }

    const { brand_slug, campaign_id, utm } = req.body;
    if (!brand_slug) return res.status(400).json({ error: 'brand_slug richiesto' });

    const brand = await getBrandBySlug(brand_slug);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    let template = null;
    if (campaign_id) {
      const campaign = await getCampaign(campaign_id);
      if (campaign && campaign.template_id) {
        template = await getTemplate(campaign.template_id);
      }
    }
    if (!template) {
      const templates = await listTemplates(brand.id);
      template = templates[0];
    }
    if (!template) return res.status(400).json({ error: 'Nessun template configurato' });

    // Create anonymous pass instance (same as Apple Wallet signup)
    const passData = {
      template_id: template.id,
      brand_id: brand.id,
      campaign_id: campaign_id || null,
      field_values: {},
      utm: utm || {},
      user_agent: req.headers['user-agent'] || null,
      referrer_url: req.headers['referer'] || req.body.referrer || null
    };
    const passInstance = await createPassInstance(passData);

    await logEvent({ pass_id: passInstance.id, brand_id: brand.id, event_type: 'pass_created', metadata: { source: 'landing_google', campaign_id, utm } });
    if (campaign_id) await incrementCampaignDownloads(campaign_id);

    // Create/update class + object first. In Generic mode this ensures class/object exist before save link.
    const passObject = await googleWallet.buildPassObject(brand, template, passInstance, passInstance.customer_data || {});
    await googleWallet.ensurePassReadyOnServer(brand, template, passObject);

    const saveLink = googleWallet.generateSaveLink(brand, template, passObject);

    await updatePassInstance(passInstance.id, {
      google_wallet_object_id: passObject.id,
      google_wallet_saved: false,
      google_installed_at: null
    });

    await logEvent({ brand_id: brand.id, pass_id: passInstance.id, event_type: 'google_wallet_link_generated', metadata: {} });

    res.json({ save_link: saveLink, pass_id: passInstance.id });
  } catch (err) {
    console.error('Google Wallet signup error:', err);
    res.status(500).json({ error: 'Errore Google Wallet: ' + err.message });
  }
});


// =====================================================================// SAMSUNG WALLET SIGNUP — Data Fetch Link (loyalty card, Partner portal)
// =====================================================================

router.post('/signup/samsung-wallet', async (req, res) => {
  try {
    if (!samsungWallet.isConfigured()) {
      return res.status(501).json({ error: 'Samsung Wallet non configurato sul server' });
    }

    const { brand_slug, campaign_id, utm } = req.body;
    if (!brand_slug) return res.status(400).json({ error: 'brand_slug richiesto' });

    const brand = await getBrandBySlug(brand_slug);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    let template = null;
    if (campaign_id) {
      const campaign = await getCampaign(campaign_id);
      if (campaign && campaign.template_id) template = await getTemplate(campaign.template_id);
    }
    if (!template) {
      const templates = await listTemplates(brand.id);
      template = templates[0];
    }
    if (!template) return res.status(400).json({ error: 'Nessun template configurato' });

    const passData = {
      template_id: template.id,
      brand_id: brand.id,
      campaign_id: campaign_id || null,
      field_values: {},
      utm: utm || {},
      user_agent: req.headers['user-agent'] || null,
      referrer_url: req.headers['referer'] || req.body.referrer || null
    };
    const passInstance = await createPassInstance(passData);

    await logEvent({
      pass_id: passInstance.id,
      brand_id: brand.id,
      event_type: 'pass_created',
      metadata: { source: 'landing_samsung', campaign_id, utm }
    });
    if (campaign_id) await incrementCampaignDownloads(campaign_id);

    const refId = samsungWallet.refIdForPass(passInstance.id);
    await updatePassInstance(passInstance.id, {
      samsung_wallet_ref_id: refId,
      samsung_wallet_saved: false,
      samsung_installed_at: null
    });

    const save_link = samsungWallet.generateDataFetchLink(refId);

    await logEvent({
      brand_id: brand.id,
      pass_id: passInstance.id,
      event_type: 'samsung_wallet_link_generated',
      metadata: { refId }
    });

    res.json({ save_link, pass_id: passInstance.id, ref_id: refId });
  } catch (err) {
    console.error('[SamsungWallet] signup error:', err);
    res.status(500).json({ error: 'Errore Samsung Wallet: ' + err.message });
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Pass download ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.get('/passes/:id/download', async (req, res) => {
  try {
    const passInstance = await getPassInstance(req.params.id);
    if (!passInstance) return res.status(404).json({ error: 'Pass non trovato' });
    const brand = await getBrand(passInstance.brand_id);
    const template = await getTemplate(passInstance.template_id);
    if (!brand || !template) return res.status(404).json({ error: 'Dati incompleti' });

    const baseUrl = resolveBaseUrl(req);

    const pkpassBuffer = await buildPkpassCached(template, passInstance, brand, {
      baseUrl,
      passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER || 'pass.com.nudj',
      teamIdentifier: process.env.TEAM_IDENTIFIER || 'YOUR_TEAM_ID'
    });

    await logEvent({ pass_id: passInstance.id, brand_id: brand.id, event_type: 'pass_downloaded' });

    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="${brand.slug || 'pass'}.pkpass"`,
      'Content-Length': pkpassBuffer.length
    });
    res.send(pkpassBuffer);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/passes/:id/wallet-strip', async (req, res) => {
  try {
    const passInstance = await getPassInstance(req.params.id);
    if (!passInstance) return res.status(404).json({ error: 'Pass non trovato' });
    const brand = await getBrand(passInstance.brand_id);
    const template = await getTemplate(passInstance.template_id);
    if (!brand || !template) return res.status(404).json({ error: 'Dati incompleti' });

    const { isHrPassBrand, loadHrStripBuffers } = require('../engine/passkit');
    const { brandConfigForHrPass } = require('../engine/pass-push-state');

    const passBrand = isHrPassBrand(brand)
      ? { ...brand, config: brandConfigForHrPass(brand, passInstance) }
      : brand;
    const cfg = passBrand.config || {};
    const stripBuffers = await loadHrStripBuffers({
      brand: passBrand,
      template,
      stripOverrideBase64: cfg.stripOverride || null
    });

    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=120'
    });
    res.send(stripBuffers.strip);
  } catch (err) {
    console.error('[wallet-strip] error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Apple Wallet Protocol ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

// Log all Apple Wallet protocol calls for debugging

// Must be registered before /passes/:passTypeId/:serialNumber (Apple Wallet protocol).
router.get('/passes/:id/wallet-icon-debug', async (req, res) => {
  try {
    const passInstance = await getPassInstance(req.params.id);
    if (!passInstance) return res.status(404).json({ error: 'Pass non trovato' });
    const brand = await getBrand(passInstance.brand_id);
    const template = await getTemplate(passInstance.template_id);
    if (!brand || !template) return res.status(404).json({ error: 'Dati incompleti' });
    const baseUrl = resolveBaseUrl(req);
    const pkpassBuffer = await createPkpass(template, passInstance, brand, {
      baseUrl,
      passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER || 'pass.com.nudj',
      teamIdentifier: process.env.TEAM_IDENTIFIER || 'YOUR_TEAM_ID'
    });
    const {
      inspectPkpassIcon,
      resolveBrandLogoRawBuffer,
      resolveWalletLogoRawBuffer,
      resolvePassIconBuffers
    } = require('../engine/brand-wallet-logo');
    const icon = await inspectPkpassIcon(pkpassBuffer);
    const resolvedLogo = await resolveWalletLogoRawBuffer(brand, template);
    const resolved = await resolveBrandLogoRawBuffer(brand);
    const passIcon = await resolvePassIconBuffers(brand, resolvedLogo);
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(pkpassBuffer);
    const pkpassFiles = zip.getEntries().map((entry) => entry.entryName).sort();
    let passJsonDebug = null;
    const passJsonEntry = zip.getEntry('pass.json');
    if (passJsonEntry) {
      try {
        const parsedPassJson = JSON.parse(passJsonEntry.getData().toString('utf8'));
        const structure = parsedPassJson.storeCard || parsedPassJson.generic || parsedPassJson.eventTicket || parsedPassJson.coupon || {};
        passJsonDebug = {
          pass_type: parsedPassJson.storeCard ? 'storeCard'
            : parsedPassJson.generic ? 'generic'
              : parsedPassJson.eventTicket ? 'eventTicket'
                : parsedPassJson.coupon ? 'coupon'
                  : 'unknown',
          backgroundColor: parsedPassJson.backgroundColor,
          foregroundColor: parsedPassJson.foregroundColor,
          labelColor: parsedPassJson.labelColor,
          header_count: (structure.headerFields || []).length,
          primary_count: (structure.primaryFields || []).length,
          secondary_count: (structure.secondaryFields || []).length,
          auxiliary_count: (structure.auxiliaryFields || []).length,
          secondary_keys: (structure.secondaryFields || []).map((f) => f.key),
          auxiliary_keys: (structure.auxiliaryFields || []).map((f) => f.key),
          has_push_announcement_field: [...(structure.headerFields || []), ...(structure.auxiliaryFields || [])].some((f) => f.key === 'announcement'),
          coin_has_change_message: (structure.secondaryFields || []).some((f) => f.key === 'coin_balance' && !!f.changeMessage),
          webServiceURL: parsedPassJson.webServiceURL || null,
          has_authentication_token: !!parsedPassJson.authenticationToken,
          locations_count: Array.isArray(parsedPassJson.locations) ? parsedPassJson.locations.length : 0,
          locations: Array.isArray(parsedPassJson.locations) ? parsedPassJson.locations : [],
          maxDistance: parsedPassJson.maxDistance || null,
          relevantDate: parsedPassJson.relevantDate || null
        };
      } catch (parseErr) {
        passJsonDebug = { error: parseErr.message };
      }
    }
    const walletIconMediaId = brand?.config?.brand_identity_assets?.wallet_icon || null;
    const cfg = brand?.config || {};
    res.json({
      pass_id: passInstance.id,
      serial_number: passInstance.serial_number,
      brand_id: brand.id,
      brand_name: brand.name,
      wallet_icon_media_id: walletIconMediaId,
      wallet_icon_rev: cfg.wallet_icon_rev || 0,
      wallet_icon_synced_at: cfg.wallet_icon_synced_at || null,
      notification_icon_source: passIcon.source,
      has_config_logos_icon: !!(cfg.logos?.icon),
      resolved_wallet_logo_source: resolvedLogo?.source || resolved?.source || null,
      pkpass_icon: icon,
      pkpass_files: pkpassFiles,
      has_thumbnail_files: pkpassFiles.some((file) => /^thumbnail(@\dx)?\.png$/.test(file)),
      pass_json_debug: passJsonDebug,
      pkpass_bytes: pkpassBuffer.length,
      pass_type_identifier: process.env.PASS_TYPE_IDENTIFIER || 'pass.com.nudj',
      preview_url: '/api/v1/passes/' + passInstance.id + '/wallet-icon.png',
      ios_cache_hint: passIcon.source === 'logo_derived'
        ? 'Il server usa ancora il logo orizzontale per icon.png — carica icona quadrata e Salva Template / Brand Identity.'
        : 'Se preview_url è ok ma la notifica no: elimina il pass da Wallet, riscarica il .pkpass, poi reinvia push. iOS può tenere in cache l\'icona finché il pass non viene reinstallato.'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/passes/:id/wallet-icon.png', async (req, res) => {
  try {
    const passInstance = await getPassInstance(req.params.id);
    if (!passInstance) return res.status(404).json({ error: 'Pass non trovato' });
    const brand = await getBrand(passInstance.brand_id);
    const template = await getTemplate(passInstance.template_id);
    if (!brand || !template) return res.status(404).json({ error: 'Dati incompleti' });
    const baseUrl = resolveBaseUrl(req);
    const pkpassBuffer = await createPkpass(template, passInstance, brand, {
      baseUrl,
      passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER || 'pass.com.nudj',
      teamIdentifier: process.env.TEAM_IDENTIFIER || 'YOUR_TEAM_ID'
    });
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(pkpassBuffer);
    const entry = zip.getEntry('icon@2x.png') || zip.getEntry('icon.png');
    if (!entry) return res.status(404).json({ error: 'icon.png assente nel pass generato' });
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    res.send(entry.getData());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Apple Wallet web service auth: iOS invia "Authorization: ApplePass <authenticationToken>"
// (il token è quello embeddato nel pass.json alla generazione). Kill switch di emergenza:
// APPLE_WALLET_AUTH_DISABLED=1 disattiva l'enforcement senza redeploy del codice.
const APPLE_WALLET_AUTH_DISABLED = String(process.env.APPLE_WALLET_AUTH_DISABLED || '').trim() === '1';

function applePassAuthMatches(req, pass) {
  if (APPLE_WALLET_AUTH_DISABLED) return true;
  const expected = String(pass?.auth_token || '').trim();
  if (!expected) return true; // pass legacy senza token: non bloccare gli aggiornamenti
  const provided = String(req.headers.authorization || '').replace(/^ApplePass\s+/i, '').trim();
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function rejectApplePassAuth(req, res) {
  console.warn(`[Apple Wallet] 401 unauthorized ${req.method} ${req.originalUrl} | Auth header: ${req.headers.authorization ? 'present' : 'missing'}`);
  return res.status(401).send();
}

router.all('/devices/*', (req, res, next) => {
  console.log(`[Apple Wallet] ${req.method} ${req.originalUrl} | Auth: ${req.headers.authorization ? 'yes' : 'no'} | Body: ${JSON.stringify(req.body || {})}`);
  next();
});
router.all('/passes/:passTypeId/:serialNumber', (req, res, next) => {
  if (req.params.passTypeId && req.params.serialNumber && !req.path.includes('/download') && !req.path.includes('/regenerate')) {
    console.log(`[Apple Wallet] ${req.method} ${req.originalUrl} | Auth: ${req.headers.authorization ? 'yes' : 'no'}`);
  }
  next();
});

// Register device for push notifications
router.post('/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber', async (req, res) => {
  try {
    const { deviceLibraryId, serialNumber } = req.params;
    const pushToken = req.body.pushToken;
    console.log(`[Apple Wallet] REGISTER device=${deviceLibraryId.substring(0, 8)}... serial=${serialNumber.substring(0, 8)}... pushToken=${pushToken ? pushToken.substring(0, 8) + '...' : 'MISSING'}`);
    if (!pushToken) return res.status(400).send();

    const pass = await getPassBySerial(serialNumber);
    if (!pass) {
      console.warn(`[Apple Wallet] REGISTER: no pass found for serial ${serialNumber}`);
      return res.status(404).send();
    }
    if (!applePassAuthMatches(req, pass)) return rejectApplePassAuth(req, res);

    await registerDevice({ device_library_id: deviceLibraryId, push_token: pushToken, serial_number: serialNumber });
    await updatePassDeviceId(serialNumber, deviceLibraryId, 'apple');

    // Track install
    await logEvent({ pass_id: pass.id, brand_id: pass.brand_id, event_type: 'pass_installed', device_id: deviceLibraryId });
    if (pass.campaign_id) await incrementCampaignInstalls(pass.campaign_id);
    console.log(`[Apple Wallet] Device registered for pass ${pass.id}`);

    res.status(201).send();
  } catch (err) {
    console.error('[Apple Wallet] Registration error:', err);
    res.status(200).send(); // Apple expects 200 if already registered
  }
});

// Unregister device
router.delete('/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber', async (req, res) => {
  try {
    const { deviceLibraryId, serialNumber } = req.params;
    const pass = await getPassBySerial(serialNumber);
    // Se il pass non esiste più in DB, consenti comunque la pulizia della registrazione.
    if (pass && !applePassAuthMatches(req, pass)) return rejectApplePassAuth(req, res);

    await unregisterDevice(deviceLibraryId, serialNumber);

    if (pass) {
      await logEvent({ pass_id: pass.id, brand_id: pass.brand_id, event_type: 'pass_removed', device_id: deviceLibraryId });
      if (pass.device_source === 'apple') {
        const { rows } = await pool.query(
          'SELECT COUNT(*)::int AS c FROM device_registrations WHERE serial_number = $1',
          [serialNumber]
        );
        if (rows[0].c === 0) {
          await updatePassInstance(pass.id, { device_id: null, device_source: null });
        }
      }
    }

    res.status(200).send();
  } catch (err) {
    console.error('Device unregister error:', err);
    res.status(200).send();
  }
});

// Get serial numbers for device
router.get('/devices/:deviceLibraryId/registrations/:passTypeId', async (req, res) => {
  try {
    const tag = req.query.passesUpdatedSince || null;
    const serials = await getSerialsForDevice(req.params.deviceLibraryId, tag);
    if (serials.length === 0) return res.status(204).send();
    res.json({ serialNumbers: serials, lastUpdated: new Date().toISOString() });
  } catch (err) {
    console.error('Get serials error:', err);
    res.status(500).send();
  }
});

// Get latest pass (Apple Wallet refresh)
router.get('/passes/:passTypeId/:serialNumber', async (req, res) => {
  try {
    const pass = await getPassBySerial(req.params.serialNumber);
    if (!pass) return res.status(404).send();
    if (!applePassAuthMatches(req, pass)) return rejectApplePassAuth(req, res);

    // Conditional GET (spec Apple): se il pass non è cambiato dopo If-Modified-Since,
    // rispondi 304 senza rigenerare/firmare il .pkpass. Confronto a risoluzione di
    // secondi perché le date HTTP non hanno i millisecondi.
    const lastUpdated = new Date(pass.last_updated);
    const ifModifiedSince = req.headers['if-modified-since'];
    if (ifModifiedSince && !Number.isNaN(lastUpdated.getTime())) {
      const since = new Date(ifModifiedSince);
      if (!Number.isNaN(since.getTime()) &&
          Math.floor(lastUpdated.getTime() / 1000) <= Math.floor(since.getTime() / 1000)) {
        res.set('Last-Modified', lastUpdated.toUTCString());
        return res.status(304).send();
      }
    }

    const brand = await getBrand(pass.brand_id);
    const template = await getTemplate(pass.template_id);
    if (!brand || !template) return res.status(404).send();

    const baseUrl = resolveBaseUrl(req);

    const pkpassBuffer = await buildPkpassCached(template, pass, brand, {
      baseUrl,
      passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER || 'pass.com.nudj',
      teamIdentifier: process.env.TEAM_IDENTIFIER || 'YOUR_TEAM_ID'
    });

    await logEvent({ pass_id: pass.id, brand_id: pass.brand_id, event_type: 'pass_fetched' });

    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Last-Modified': lastUpdated.toUTCString(),
      // no-cache (non no-store): il client può conservare il pass ma deve rivalidare
      // con If-Modified-Since, così sfrutta il 304 qui sopra.
      'Cache-Control': 'no-cache, must-revalidate'
    });
    res.send(pkpassBuffer);
  } catch (err) {
    console.error('Pass fetch error:', err);
    res.status(500).send();
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Creative asset image (public, used by <img> tags) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.get('/creative-assets/:id/image', async (req, res) => {
  try {
    const asset = await getCreativeAsset(req.params.id);
    if (!asset || !asset.image_base64) return res.status(404).send('No image');
    const buf = Buffer.from(asset.image_base64, 'base64');
    res.set({ 'Content-Type': 'image/png', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=3600' });
    res.send(buf);
  } catch (err) {
    console.error('Creative image error:', err);
    res.status(500).send('Error');
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Media image (public, used by <img> tags) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.get('/media/:id/image', async (req, res) => {
  try {
    const item = await getMedia(req.params.id);
    if (!item || !item.image_base64) return res.status(404).send('No image');
    const buf = Buffer.from(item.image_base64, 'base64');
    res.set({ 'Content-Type': 'image/png', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=3600' });
    res.send(buf);
  } catch (err) {
    console.error('Media image error:', err);
    res.status(500).send('Error');
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Ad Serving (public) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

const PIXEL_1x1 = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

// Serve ad tag ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ returns HTML snippet with creative + impression pixel
router.get('/serve/:campaign_id', async (req, res) => {
  try {
    const campaign = await getCampaign(req.params.campaign_id);
    if (!campaign) return res.status(404).send('Campaign not found');
    const brand = await getBrand(campaign.brand_id);
    if (!brand) return res.status(404).send('Brand not found');

    // Check for HTML5 banner creative first (type: 'banner' in media table)
    const reqW = parseInt(req.query.w) || 300;
    const reqH = parseInt(req.query.h) || 250;
    const bannerMedia = await listMedia(campaign.brand_id, 'banner');
    const matchedBanner = bannerMedia.find(m => m.width === reqW && m.height === reqH);
    if (matchedBanner && req.query.format !== 'json') {
      // Serve the HTML5 animated banner directly
      const bannerHtml = Buffer.from(matchedBanner.image_base64, 'base64').toString('utf-8');
      // Inject campaign tracking
      const baseUrl = `${req.protocol}://${req.get('host')}/api/v1`;
      const pixelTag = `<img src="${baseUrl}/pixel/${campaign.id}" width="1" height="1" style="position:absolute;opacity:0">`;
      const tracked = bannerHtml.replace('</body>', pixelTag + '</body>')
        .replace('href="#"', `href="${baseUrl}/click/${campaign.id}"`);
      res.set({ 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=300' });
      return res.send(tracked);
    }

    // Find best creative for this campaign
    const creatives = await listCreativeAssets(campaign.brand_id, { campaign_id: campaign.id, limit: 1 });
    const creative = creatives[0] || null;

    // Determine dimensions from query or creative
    const width = reqW || (creative ? creative.width : 300);
    const height = reqH || (creative ? creative.height : 250);

    const baseUrl = `${req.protocol}://${req.get('host')}/api/v1`;
    const cid = campaign.id;
    const crId = creative ? creative.id : '';
    const clickUrl = `${baseUrl}/click/${cid}?cr=${crId}`;
    const pixelUrl = `${baseUrl}/pixel/${cid}?cr=${crId}`;
    const imageUrl = creative ? `${baseUrl}/serve/${cid}/image?cr=${crId}` : '';
    const landingUrl = `${req.protocol}://${req.get('host')}/${brand.slug}?utm_source=${campaign.utm_source || 'walletad'}&utm_medium=${campaign.utm_medium || 'display'}&utm_campaign=${campaign.utm_campaign || campaign.name}`;

    const config = brand.config || {};
    const bgColor = config.backgroundColor || '#000000';
    const fgColor = config.foregroundColor || '#ffffff';
    const brandName = brand.name || '';

    // Return format based on query param
    const format = req.query.format || 'html';

    if (format === 'json') {
      return res.json({
        campaign_id: cid, brand: brandName, creative_id: crId,
        click_url: clickUrl, pixel_url: pixelUrl, image_url: imageUrl,
        landing_url: landingUrl, width, height
      });
    }

    // HTML ad tag
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
body{overflow:hidden}
.wa-ad{position:relative;width:${width}px;height:${height}px;background:${bgColor};cursor:pointer;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,sans-serif}
.wa-ad img.wa-creative{width:100%;height:100%;object-fit:cover}
.wa-ad .wa-overlay{position:absolute;bottom:0;left:0;right:0;padding:8px 12px;background:linear-gradient(transparent,rgba(0,0,0,.7))}
.wa-ad .wa-brand{color:${fgColor};font-size:${height > 100 ? 14 : 11}px;font-weight:700}
.wa-ad .wa-cta{display:inline-block;margin-top:4px;padding:4px 12px;background:${fgColor};color:${bgColor};border-radius:4px;font-size:${height > 100 ? 12 : 10}px;font-weight:600}
.wa-ad .wa-badge{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.5);color:#fff;font-size:8px;padding:2px 5px;border-radius:3px}
</style></head><body>
<div class="wa-ad" onclick="window.open('${clickUrl}','_blank')">
${imageUrl ? `<img class="wa-creative" src="${imageUrl}" alt="${brandName}">` : ''}
<div class="wa-overlay">
<div class="wa-brand">${brandName}</div>
<span class="wa-cta">${creative?.cta_text || 'Aggiungi a Wallet'}</span>
</div>
<div class="wa-badge">Ad</div>
</div>
<img src="${pixelUrl}" width="1" height="1" style="position:absolute;opacity:0">
</body></html>`;

    res.set({ 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
    res.send(html);
  } catch (err) {
    console.error('Ad serve error:', err);
    res.status(500).send('Error');
  }
});

// Serve creative image for ad tag
router.get('/serve/:campaign_id/image', async (req, res) => {
  try {
    const crId = req.query.cr;
    let imageData = null;
    if (crId) {
      const asset = await getCreativeAsset(crId);
      if (asset?.image_base64) imageData = asset.image_base64;
    }
    if (!imageData) {
      const campaign = await getCampaign(req.params.campaign_id);
      if (campaign) {
        const creatives = await listCreativeAssets(campaign.brand_id, { campaign_id: campaign.id, limit: 1 });
        if (creatives[0]?.image_base64) imageData = creatives[0].image_base64;
      }
    }
    if (!imageData) return res.status(404).send('No image');
    const buf = Buffer.from(imageData, 'base64');
    res.set({ 'Content-Type': 'image/png', 'Content-Length': buf.length, 'Cache-Control': 'public, max-age=3600' });
    res.send(buf);
  } catch (err) {
    console.error('Ad image error:', err);
    res.status(500).send('Error');
  }
});

// Impression tracking pixel
router.get('/pixel/:campaign_id', async (req, res) => {
  try {
    const campaign = await getCampaign(req.params.campaign_id);
    if (campaign) {
      logAdEvent({
        brand_id: campaign.brand_id,
        campaign_id: campaign.id,
        creative_id: req.query.cr || null,
        event_type: 'impression',
        ip: req.ip || req.headers['x-forwarded-for'],
        user_agent: req.headers['user-agent'],
        referer: req.headers['referer'] || req.headers['referrer']
      }).catch(err => console.error('Pixel log error:', err));
    }
  } catch (e) { /* fire-and-forget */ }
  res.set({ 'Content-Type': 'image/gif', 'Content-Length': PIXEL_1x1.length, 'Cache-Control': 'no-store, no-cache' });
  res.send(PIXEL_1x1);
});

// Pass back-link click tracking (retro Wallet → redirect)
router.get('/track/pass-link', async (req, res) => {
  try {
    const serial = String(req.query.sn || '').trim();
    const destination = String(req.query.to || '').trim();
    const key = String(req.query.key || 'link').trim();
    const label = String(req.query.label || '').trim();
    if (!destination) return res.status(400).send('Link non valido');
    if (serial) {
      const pass = await getPassBySerial(serial);
      if (pass) {
        const { logHolderEvent } = require('../engine/holder-events');
        await logHolderEvent({
          brand_id: pass.brand_id,
          pass_id: pass.id,
          serial_number: pass.serial_number,
          event_category: 'link',
          event_action: 'link_click',
          target_type: 'pass_back_link',
          target_key: key,
          target_label: label || null,
          target_url: destination,
          metadata: {
            user_agent: req.headers['user-agent'],
            referer: req.headers.referer || req.headers.referrer
          }
        });
      }
    }
    res.redirect(302, destination);
  } catch (err) {
    console.error('track/pass-link error:', err);
    const fallback = String(req.query.to || '').trim();
    if (fallback) return res.redirect(302, fallback);
    res.status(400).send('Errore link');
  }
});

// Click redirect + tracking
router.get('/click/:campaign_id', async (req, res) => {
  try {
    const campaign = await getCampaign(req.params.campaign_id);
    if (!campaign) return res.status(404).send('Campaign not found');
    const brand = await getBrand(campaign.brand_id);
    if (!brand) return res.status(404).send('Brand not found');

    // Log click
    logAdEvent({
      brand_id: campaign.brand_id,
      campaign_id: campaign.id,
      creative_id: req.query.cr || null,
      event_type: 'click',
      ip: req.ip || req.headers['x-forwarded-for'],
      user_agent: req.headers['user-agent'],
      referer: req.headers['referer'] || req.headers['referrer']
    }).catch(err => console.error('Click log error:', err));

    // Redirect to landing
    const landingUrl = `${req.protocol}://${req.get('host')}/${brand.slug}?utm_source=${campaign.utm_source || 'walletad'}&utm_medium=${campaign.utm_medium || 'display'}&utm_campaign=${campaign.utm_campaign || campaign.name}`;
    res.redirect(302, landingUrl);
  } catch (err) {
    console.error('Click redirect error:', err);
    res.status(500).send('Error');
  }
});

const {
  findBrandForPublicJoin,
  publicJoinByEmail,
  getMemberForActivationToken,
  confirmMemberActivation,
  distributeActivationEmails,
  resendMemberActivationEmail,
  joinUrl,
  PRIVACY_POLICY_VERSION
} = require('../engine/hr-activation');
const { resolveBrandPrivacyUrl } = require('../engine/brand-privacy-url');

function hrActivationDb() {
  return {
    pool,
    getBrand,
    getTemplate,
    listTemplates,
    getPassInstance,
    updateMemberRecord,
    updatePassInstance,
    createPassInstance,
    logEvent,
    logEnrollmentAttempt
  };
}

function clientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    ''
  );
}

function activationThankYouUrl(passId) {
  if (!passId) return null;
  return `/activate/thank-you/${encodeURIComponent(String(passId))}`;
}

router.get('/join/:slug/info', async (req, res) => {
  try {
    const brand = await findBrandForPublicJoin(hrActivationDb(), req.params.slug);
    if (!brand) return res.status(404).json({ error: 'Programma non disponibile' });
    res.json({
      brand_name: brand.name,
      slug: brand.public_qr_slug || brand.slug,
      logo_url: publicBrandLogoPath(brand),
      brand_theme: publicBrandTheme(brand)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/join/:slug', async (req, res) => {
  try {
    const { email } = req.body || {};
    const result = await publicJoinByEmail(hrActivationDb(), {
      slug: req.params.slug,
      email,
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || ''
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function extractActivationTokenFromRequest(req) {
  const raw = req.params.token || req.query.token || req.query.t || '';
  return String(raw).trim();
}

function activationApiCacheHeaders(res) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
}

router.get('/activate/:token', async (req, res) => {
  try {
    activationApiCacheHeaders(res);
    const token = extractActivationTokenFromRequest(req);
    const member = await getMemberForActivationToken(hrActivationDb(), token);
    if (!member) return res.status(404).json({ error: 'Link non valido o scaduto' });
    const templates = await listTemplates(member.brand_id);
    const hrTemplates = templates.filter((t) => t.pass_type === 'employee_pass');
    res.json({
      member: {
        first_name: member.first_name,
        last_name: member.last_name,
        email: member.email,
        employee_id: member.employee_id,
        brand_name: member.brand_name,
        brand_slug: member.brand_slug,
        logo_url: publicBrandLogoPath({
          slug: member.brand_slug,
          config: member.brand_config
        }),
        brand_theme: publicBrandTheme({ config: member.brand_config })
      },
      templates: hrTemplates.map((t) => ({ id: t.id, name: t.name })),
      consent_types: ['birthday', 'welfare_geo', 'gamification', 'climate_survey', 'partner_offers'],
      privacy_policy_version: PRIVACY_POLICY_VERSION,
      privacy_url: resolveBrandPrivacyUrl(
        { config: member.brand_config, slug: member.brand_slug },
        { localhostPort: process.env.PORT }
      ),
      already_activated: member.activation_status === 'activated',
      pass_id: member.pass_id || null,
      thank_you_url: activationThankYouUrl(member.pass_id)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/activate/:token', async (req, res) => {
  try {
    activationApiCacheHeaders(res);
    const { consents, template_id, privacy_accepted } = req.body || {};
    if (!privacy_accepted) {
      return res.status(400).json({ error: 'Privacy policy acceptance required' });
    }
    const token = extractActivationTokenFromRequest(req);
    const result = await confirmMemberActivation(hrActivationDb(), token, {
      consents: consents || {},
      template_id,
      privacy_accepted: !!privacy_accepted,
      ip: clientIp(req),
      userAgent: req.headers['user-agent'] || ''
    });
    res.json({
      success: true,
      pass_id: result.pass.id,
      download_url: result.download_url,
      brand_name: result.brand_name,
      thank_you_url: activationThankYouUrl(result.pass.id),
      already_activated: !!result.already_activated
    });
  } catch (err) {
    const status = /non valido|scaduto/i.test(err.message) ? 404 : 400;
    res.status(status).json({ error: err.message });
  }
});


// =====================================================================// AUTH MIDDLEWARE ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ everything below requires JWT
// =====================================================================
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token mancante. Effettua il login.' });
  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Token non valido o scaduto' });
    try {
      const dbUser = await getUser(decoded.id);
      if (!dbUser || dbUser.active === false) {
        return res.status(401).json({ error: 'Utente non trovato o disattivato' });
      }
      req.user = applyAllowlistOperatorContext({
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
        brand_id: dbUser.brand_id,
      });
      next();
    } catch (e) {
      console.error('authMiddleware user load failed:', e.message);
      return res.status(500).json({ error: 'Errore autenticazione' });
    }
  });
}

/** Multi-tenant: admin vede tutti i brand; altri ruoli solo `users.brand_id` assegnato. */
function userMayAccessBrand(user, brandId) {
  return rbacUserMayAccessBrand(user, brandId);
}

function requireBrandId(req, res, brandId) {
  if (brandId === undefined || brandId === null || String(brandId).trim() === '') {
    res.status(400).json({ error: 'brand_id richiesto' });
    return false;
  }
  if (!userMayAccessBrand(req.user, brandId)) {
    res.status(403).json({ error: 'Accesso negato per questo brand' });
    return false;
  }
  return true;
}

function requireWriteAccess(req, res) {
  if (!req.user) {
    res.status(401).json({ error: 'Non autenticato' });
    return false;
  }
  const role = normalizeRole(req.user.role);
  if (role === 'reporter') {
    res.status(403).json({ error: 'Permessi insufficienti (solo lettura)' });
    return false;
  }
  const rule = classifyApiRoute(req.method, req.path);
  if (rule && rule.write) {
    const result = enforceApiPermission(req.user, req.method, req.path);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return false;
    }
    return true;
  }
  if (role === 'sender') {
    res.status(403).json({ error: 'Permessi insufficienti per questa operazione' });
    return false;
  }
  return true;
}

/** Brand PK (UUID nel path tipo `/brands/:id`). */
function requireOwnedBrandPk(req, res, brandPk) {
  return requireBrandId(req, res, brandPk);
}

function requireAdmin(req, res) {
  if (normalizeRole(req.user?.role) !== 'admin') {
    res.status(403).json({ error: 'Richiede privilegi amministratore' });
    return false;
  }
  return true;
}

function isUserAdmin(req) {
  return normalizeRole(req.user?.role) === 'admin';
}

function isUserManager(req) {
  return normalizeRole(req.user?.role) === 'manager';
}

function requireUserManagerAccess(req, res) {
  if (isUserAdmin(req)) return true;
  if (isUserManager(req) && req.user?.brand_id) return true;
  res.status(403).json({ error: 'Puoi gestire utenti solo per il tuo brand' });
  return false;
}

function requireManagedUserTarget(req, res, target) {
  if (isUserAdmin(req)) return true;
  if (!target) {
    res.status(404).json({ error: 'Utente non trovato' });
    return false;
  }
  if (!req.user?.brand_id || String(target.brand_id || '') !== String(req.user.brand_id)) {
    res.status(403).json({ error: 'Puoi gestire solo utenti del tuo brand' });
    return false;
  }
  if (normalizeRole(target.role) === 'admin') {
    res.status(403).json({ error: 'Un manager non può gestire utenti admin' });
    return false;
  }
  return true;
}

function normalizeManagerUserPayload(req, role) {
  if (isUserAdmin(req)) return null;
  const r = normalizeRole(role);
  if (r === 'admin') return 'Un manager non può creare o modificare utenti admin';
  req.body.role = r;
  req.body.brand_id = req.user.brand_id;
  return null;
}

function normalizeUserBrandPayload(body, role) {
  const r = normalizeRole(role || body.role || 'manager');
  if (r === 'admin') {
    if (body.role !== undefined || body.brand_id !== undefined) {
      body.brand_id = null;
    }
    return r;
  }
  if (body.brand_id !== undefined) {
    body.brand_id = body.brand_id != null && String(body.brand_id).trim() !== ''
      ? String(body.brand_id).trim()
      : null;
  }
  return r;
}

function validateScopedUserBrand(role, brandId) {
  if (normalizeRole(role) === 'admin') return null;
  if (!brandId) return 'Seleziona un brand per questo ruolo';
  return null;
}

/** On restricted HR deploys, allowlisted operator emails are always platform admins (all brands + Utenti). */
async function ensurePlatformAdminIfAllowlisted(user) {
  const list = dashboardLoginAllowlist();
  if (!list || !user) return user;
  const email = String(user.email || '').trim().toLowerCase();
  if (!list.includes(email)) return user;
  if (normalizeRole(user.role) === 'admin' && user.brand_id == null) return user;
  await updateUser(user.id, { role: 'admin', brand_id: null });
  return { ...user, role: 'admin', brand_id: null };
}

function applyAllowlistOperatorContext(user) {
  if (!user) return user;
  const list = dashboardLoginAllowlist();
  if (!list) return user;
  const email = String(user.email || '').trim().toLowerCase();
  if (!list.includes(email)) return user;
  return { ...user, role: 'admin', brand_id: null };
}

/**
 * Routes registered *after* this middleware still include partner/public flows
 * (Instant Win play, Gamification game, creatives serving, Wallet callbacks).
 */
function isJwtBypassRoute(req) {
  if (req.method === 'OPTIONS') return true;
  const path = req.path || '';
  const m = req.method;
  if (m === 'GET' && /^\/play\/[^/]+\/info$/.test(path)) return true;
  if (m === 'POST' && /^\/play\/[^/]+$/.test(path)) return true;
  if (m === 'GET' && /^\/game\/[^/]+\/info$/.test(path)) return true;
  if (m === 'POST' && /^\/game\/[^/]+$/.test(path)) return true;
  if (m === 'GET' && /^\/banners\/[^/]+\/serve$/.test(path)) return true;
  if (m === 'GET' && /^\/videos\/[^/]+\/serve$/.test(path)) return true;
  if (m === 'GET' && path.startsWith('/ad-tag/')) return true;
  if (m === 'GET' && path.startsWith('/google-wallet/pass/')) return true;
  if (path === '/google-wallet/callback' && (m === 'GET' || m === 'POST')) return true;
  if (m === 'GET' && path.startsWith('/samsung-wallet/pass/')) return true;
  if ((m === 'GET' || m === 'POST') && /^\/samsung-wallet\/cards\//.test(path)) return true;
  if (m === 'GET' && /^\/join\/[^/]+\/info$/.test(path)) return true;
  if (m === 'POST' && /^\/join\/[^/]+$/.test(path)) return true;
  if (m === 'GET' && /^\/activate\/[^/]+$/.test(path)) return true;
  if (m === 'POST' && /^\/activate\/[^/]+$/.test(path)) return true;
  if (path.startsWith('/portal/')) return true;
  if (path.startsWith('/hub/')) return true;
  return false;
}

registerHubPwaRoutes(router);

router.use((req, res, next) => {
  if (isJwtBypassRoute(req)) return next();
  return authMiddleware(req, res, () => rbacApiMiddleware(req, res, next));
});

registerHubMerchantRoutes(router, {
  requireBrandId,
  requireOwnedBrandPk,
  requireWriteAccess
});

registerPgaDashboardRoutes(router, {
  requireBrandId,
  requireOwnedBrandPk,
  requireWriteAccess
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Auth (authenticated) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.get('/auth/me', (req, res) => {
  res.json({ user: applyAllowlistOperatorContext(req.user) });
});

router.put('/auth/change-password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Entrambe le password richieste' });
    const user = await getUser(req.user.id);
    const fullUser = await getUserByEmail(user.email);
    const valid = await verifyPassword(current_password, fullUser.password_hash);
    if (!valid) return res.status(401).json({ error: 'Password attuale errata' });
    await updateUser(req.user.id, { password: new_password });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Users: admin all brands; manager only own brand.
router.get('/users', async (req, res) => {
  try {
    if (!requireUserManagerAccess(req, res)) return;
    const qBrand = isUserAdmin(req) ? (req.query.brand_id || null) : req.user.brand_id;
    const users = await listUsers(qBrand || null);
    res.json(users);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users', async (req, res) => {
  try {
    if (!requireUserManagerAccess(req, res)) return;
    if (isUserAdmin(req) && rejectIfDeployOperatorNotAllowed(req, res)) return;
    const tempPassword = req.body.password || randomBytes(12).toString('base64url');
    req.body.password = tempPassword;
    const role = normalizeRole(req.body.role || 'manager');
    if (!isValidRole(role)) return res.status(400).json({ error: 'Ruolo non valido' });
    req.body.role = role;
    const managerErr = normalizeManagerUserPayload(req, role);
    if (managerErr) return res.status(403).json({ error: managerErr });
    normalizeUserBrandPayload(req.body, role);
    const brandErr = validateScopedUserBrand(role, req.body.brand_id);
    if (brandErr) return res.status(400).json({ error: brandErr });
    const user = await createUser(req.body);
    try {
      await sendDashboardUserInviteEmail(req, user);
    } catch (emailErr) { console.error('Invite email failed:', emailErr.message); }
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/users/:id/resend-invite', async (req, res) => {
  try {
    if (!requireUserManagerAccess(req, res)) return;
    const user = await getUser(req.params.id);
    if (!user) return res.status(404).json({ error: 'Utente non trovato' });
    if (!requireManagedUserTarget(req, res, user)) return;

    await sendDashboardUserInviteEmail(req, user);

    res.json({ success: true, message: 'Email di invito reinviata' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/users/:id', async (req, res) => {
  try {
    if (!requireUserManagerAccess(req, res)) return;
    const existing = await getUser(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Utente non trovato' });
    if (!requireManagedUserTarget(req, res, existing)) return;
    if (req.body.role !== undefined) {
      const role = normalizeRole(req.body.role);
      if (!isValidRole(role)) return res.status(400).json({ error: 'Ruolo non valido' });
      req.body.role = role;
    }
    const effectiveRole = normalizeRole(req.body.role ?? existing.role);
    const managerErr = normalizeManagerUserPayload(req, effectiveRole);
    if (managerErr) return res.status(403).json({ error: managerErr });
    normalizeUserBrandPayload(req.body, effectiveRole);
    const effectiveBrandId = req.body.brand_id !== undefined ? req.body.brand_id : existing.brand_id;
    const brandErr = validateScopedUserBrand(effectiveRole, effectiveBrandId);
    if (brandErr) return res.status(400).json({ error: brandErr });
    const user = await updateUser(req.params.id, req.body);
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/users/:id', async (req, res) => {
  try {
    if (!requireUserManagerAccess(req, res)) return;
    if (isUserAdmin(req) && rejectIfDeployOperatorNotAllowed(req, res)) return;
    const target = await getUser(req.params.id);
    if (!target) return res.status(404).json({ error: 'Utente non trovato' });
    if (!requireManagedUserTarget(req, res, target)) return;
    if (String(target.id) === String(req.user.id)) {
      return res.status(400).json({ error: 'Non puoi eliminare il tuo account mentre sei connesso' });
    }
    const allowlist = dashboardLoginAllowlist();
    if (allowlist && isDashboardOperatorEmail(target.email)) {
      return res.status(400).json({ error: 'Non puoi eliminare un account amministratore autorizzato su questo deploy' });
    }
    await deleteUser(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Brands ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

router.get('/brands', async (req, res) => {
  try {
    let brands = await listBrands();
    const u = req.user;
    if (u && normalizeRole(u.role) !== 'admin') {
      if (u.brand_id) brands = brands.filter((b) => String(b.id) === String(u.brand_id));
      else brands = [];
    }
    const lock = deployProductLineLock();
    if (lock) brands = brands.filter((b) => brandProductLine(b) === lock);
    res.json(brands);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/brands', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const lock = deployProductLineLock();
    const body = { ...req.body };
    if (lock) {
      body.config = { ...(body.config || {}), product_line: lock };
    }
    const brand = await createBrand(body);
    res.json(brand);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brands/:id', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    if (!brandAllowedOnDeploy(brand)) return res.status(404).json({ error: 'Brand non trovato' });
    const { sanitizeBrandForApi } = require('../engine/brand-privacy-document');
    res.json(sanitizeBrandForApi(brand));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/brands/:id', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    validateBrandBackLinks(req.body);
    const brand = await updateBrand(req.params.id, req.body);
    const { syncWalletLogoFromBrandIdentity, syncWalletIconFromBrandIdentity } = require('../engine/brand-wallet-logo');
    const synced = await syncWalletLogoFromBrandIdentity(req.params.id, brand, {
      syncTemplates: isHrBrand(brand, req)
    });
    await syncWalletIconFromBrandIdentity(req.params.id, brand, { touchPasses: true });
    if (synced) {
      const refreshed = await getBrand(req.params.id);
      return res.json(refreshed);
    }
    res.json(brand);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/brands/:id', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    await deleteBrand(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Brand logo upload ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.get('/brands/:id/privacy/export', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    const { buildDefaultPrivacyExportHtml } = require('../engine/privacy-default-export');
    const html = buildDefaultPrivacyExportHtml(brand, {
      platformName: process.env.DASHBOARD_PRODUCT_TITLE || 'FiloDiretto'
    });
    const slug = String(brand.slug || 'brand').trim() || 'brand';
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="informativa-privacy-${slug}.html"`);
    res.send(html);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/brands/:id/privacy-document', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    const {
      buildPrivacyDocumentConfigUpdate,
      privacyDocumentMeta,
      sanitizeBrandForApi
    } = require('../engine/brand-privacy-document');
    const config = buildPrivacyDocumentConfigUpdate(brand, req.body || {});
    const updated = await updateBrand(req.params.id, { config });
    const meta = privacyDocumentMeta(config);
    res.json({
      success: true,
      privacy_url: config.privacy_url,
      privacy_document: meta,
      brand: sanitizeBrandForApi(updated)
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/brands/:id/privacy-document', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    const {
      buildPrivacyDocumentRemovalConfig,
      sanitizeBrandForApi
    } = require('../engine/brand-privacy-document');
    const config = buildPrivacyDocumentRemovalConfig(brand);
    const updated = await updateBrand(req.params.id, { config });
    res.json({ success: true, brand: sanitizeBrandForApi(updated) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/brands/by-slug/:slug/privacy-document', async (req, res) => {
  try {
    const brand = await getBrandBySlug(req.params.slug);
    if (!brand) return res.status(404).send('Documento non trovato');
    const { servePrivacyDocumentResponse } = require('../engine/brand-privacy-document');
    return servePrivacyDocumentResponse(res, brand);
  } catch (err) {
    res.status(500).send('Errore caricamento documento');
  }
});

router.post('/brands/:id/logo', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    let { logo_base64 } = req.body;
    if (!logo_base64) return res.status(400).json({ error: 'logo_base64 richiesto' });

  // Convert PDF to PNG if needed
    logo_base64 = await pdfToPngIfNeeded(logo_base64);
    const { applyBrandLogoBase64 } = require('../engine/brand-wallet-logo');
    await applyBrandLogoBase64(req.params.id, logo_base64, {
      brand,
      syncTemplates: isHrBrand(brand, req)
    });

    res.json({ success: true, templates_synced: isHrBrand(brand, req) });
  } catch (err) {
    console.error('Logo upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/brands/:id/wallet-icon', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    let { icon_base64, logo_base64 } = req.body;
    const raw = icon_base64 || logo_base64;
    if (!raw) return res.status(400).json({ error: 'icon_base64 richiesto' });

    const iconB64 = await pdfToPngIfNeeded(raw);
    const { applyWalletIconBase64 } = require('../engine/brand-wallet-logo');

    const media = await createMedia({
      brand_id: req.params.id,
      type: 'wallet_icon',
      title: `Icona notifiche (${new Date().toISOString().slice(0, 10)})`,
      image_base64: iconB64,
      width: 512,
      height: 512
    });

    const config = { ...(brand.config || {}) };
    config.brand_identity_assets = {
      ...(config.brand_identity_assets || {}),
      wallet_icon: media.id
    };
    await updateBrand(req.params.id, { config });
    const refreshed = await getBrand(req.params.id);
    await applyWalletIconBase64(req.params.id, iconB64, { brand: refreshed, touchPasses: true });

    res.json({
      success: true,
      wallet_icon_media_id: media.id,
      wallet_icon_rev: (refreshed.config?.wallet_icon_rev || 0) + 1,
      hint: 'I pass sono stati aggiornati. Su iPhone la notifica può mostrare ancora la vecchia icona finché Wallet non scarica il pass aggiornato (apri Wallet o reinvia una push).'
    });
  } catch (err) {
    console.error('Wallet icon upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/brands/:id/wallet-icon/sync', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    const { assignWalletIconMedia, syncWalletIconFromBrandIdentity } = require('../engine/brand-wallet-logo');
    const mediaId = req.body?.media_id || brand?.config?.brand_identity_assets?.wallet_icon;
    if (!mediaId) {
      return res.status(400).json({ error: 'Nessuna icona notifiche configurata per questo brand' });
    }
    const synced = await assignWalletIconMedia(req.params.id, mediaId, { touchPasses: true })
      || await syncWalletIconFromBrandIdentity(req.params.id, brand, { touchPasses: true, mediaId });
    if (!synced) return res.status(400).json({ error: 'Impossibile sincronizzare icona notifiche' });
    const latest = await getBrand(req.params.id);
    res.json({
      success: true,
      wallet_icon_media_id: mediaId,
      wallet_icon_rev: latest?.config?.wallet_icon_rev || 0,
    });
  } catch (err) {
    console.error('Wallet icon sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/brands/:id/logo', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    const mediaId = brand?.config?.brand_identity_assets?.logo;
    if (mediaId) {
      const media = await getMedia(mediaId);
      if (media?.image_base64) {
        const buf = Buffer.from(media.image_base64, 'base64');
        res.set('Content-Type', 'image/png');
        return res.send(buf);
      }
    }
    if (!brand?.config?.logos?.logo) return res.status(404).json({ error: 'Nessun logo' });
    const buf = Buffer.from(brand.config.logos.logo, 'base64');
    res.set('Content-Type', 'image/png');
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Brand landing background upload ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

router.get('/brands/:id/wallet-logo-debug', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    const crypto = require('crypto');
    const { resolveBrandLogoRawBuffer } = require('../engine/brand-wallet-logo');
    const resolved = await resolveBrandLogoRawBuffer(brand);
    const mediaId = brand?.config?.brand_identity_assets?.logo || null;
    let identityMedia = null;
    if (mediaId) {
      const media = await getMedia(mediaId);
      if (media) {
        identityMedia = {
          id: media.id,
          title: media.title || null,
          type: media.type || null,
          image_bytes: media.image_base64 ? Buffer.from(media.image_base64, 'base64').length : 0,
          sha256_prefix: media.image_base64
            ? crypto.createHash('sha256').update(Buffer.from(media.image_base64, 'base64')).digest('hex').slice(0, 16)
            : null
        };
      }
    }
    const logoMedia = await listMedia(brand.id, 'logo');
    const templates = await listTemplates(brand.id);
    const templateHasLogo = templates.some((t) => !!(t.style?.images?.logo));
    res.json({
      brand_id: brand.id,
      brand_name: brand.name,
      deploy_product_line: 'hr',
      brand_product_line: brand?.config?.product_line || null,
      brand_identity_logo_media_id: mediaId,
      identity_media: identityMedia,
      resolved_wallet_source: resolved?.source || null,
      resolved_wallet_sha256_prefix: resolved
        ? crypto.createHash('sha256').update(resolved.buffer).digest('hex').slice(0, 16)
        : null,
      config_logos_present: !!(brand?.config?.logos?.logo),
      config_icon_present: !!(brand?.config?.logos?.icon),
      template_logo_present: templateHasLogo,
      logo_media_count: Array.isArray(logoMedia) ? logoMedia.length : 0,
      logo_media_titles: (logoMedia || []).map((m) => ({ id: m.id, title: m.title || m.filename || null })),
      hint: 'Se identity_media e il logo in preview sono Hirostar, ricarica il logo corretto in Brand Identity e Salva.'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/brands/:id/logo/sync-from-identity', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    const { syncWalletLogoFromBrandIdentity } = require('../engine/brand-wallet-logo');
    const synced = await syncWalletLogoFromBrandIdentity(req.params.id, brand, {
      syncTemplates: isHrBrand(brand, req)
    });
    if (!synced) return res.status(400).json({ error: 'Nessun logo Brand Identity da sincronizzare' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/brands/:id/landing-bg', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    let { image_base64 } = req.body;
    if (!image_base64) return res.status(400).json({ error: 'image_base64 richiesto' });
    // Convert PDF to PNG if needed
    image_base64 = await pdfToPngIfNeeded(image_base64);
    const imgBuffer = Buffer.from(image_base64, 'base64');
    // Resize to max 1200px wide, optimize as JPEG for faster loading
    const optimized = await sharp(imgBuffer)
      .resize(1200, 2400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const config = brand.config || {};
    config.landingBg = optimized.toString('base64');
    await updateBrand(req.params.id, { config });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Brand strip upload ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.post('/brands/:id/strip', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    let { strip_base64 } = req.body;
    if (!strip_base64) return res.status(400).json({ error: 'strip_base64 richiesto' });

    // Convert PDF to PNG if needed
    strip_base64 = await pdfToPngIfNeeded(strip_base64);

    const config = brand.config || {};
    config.logos = config.logos || {};
    config.logos.strip = strip_base64;

    await updateBrand(req.params.id, { config });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brands/:id/strip', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    const stripBase64 = brand?.config?.logos?.strip || brand?.config?.strip_base64 || null;
    if (!stripBase64) return res.status(404).json({ error: 'Nessuna strip' });
    const buf = Buffer.from(stripBase64, 'base64');
    res.set('Content-Type', 'image/png');
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/brands/:id/strip', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    const config = brand.config || {};
    if (config.logos) delete config.logos.strip;
    await updateBrand(req.params.id, { config });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ AI strip generation ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.post('/brands/:id/ai-strip', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt richiesto' });

    const { generateWithFal } = require('../engine/creative-ai');
    const stylePrompt = (brand.config && brand.config.aiStylePrompt) || null;

    // Strip dimensions: 1125x432 (Apple Wallet @3x)
    const imageUrl = await generateWithFal(
      `${prompt}, promotional banner, wide aspect ratio, no text, no watermark`,
      1125, 432, 'fal-ai/flux/dev', null, stylePrompt
    );

    // Download and convert to base64
    const imgResponse = await fetch(imageUrl);
    const arrayBuf = await imgResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuf).toString('base64');

    const config = brand.config || {};
    config.logos = config.logos || {};
    config.logos.strip = base64;
    await updateBrand(req.params.id, { config });

    res.json({ success: true, strip_base64: base64 });
  } catch (err) {
    console.error('AI strip error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ AI landing page copy ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.post('/brands/:id/ai-copy', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    const description = req.body.description || '';
    const options = await generateLandingCopy(brand.name, description);
    res.json({ options });
  } catch (err) {
    console.error('AI copy error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/brands/:id/push-assistant/plan', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    if (!requireWriteAccess(req, res)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    const prompt = String(req.body.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt richiesto' });

    const [scheduled, history] = await Promise.all([
      listScheduledPush(brand.id),
      listPushes(brand.id)
    ]);
    const plan = await planScheduledPush({ brand, prompt, scheduled, history });
    await logPushAssistantInteraction({
      brand_id: brand.id,
      user_id: req.user?.id || req.user?.sub || null,
      prompt,
      proposal: plan.proposal,
      action: 'planned'
    });
    res.json(plan);
  } catch (err) {
    console.error('Push assistant plan error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/brands/:id/push-assistant/feedback', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    if (!requireWriteAccess(req, res)) return;
    const action = String(req.body.action || '').trim();
    if (!['confirmed', 'dismissed'].includes(action)) {
      return res.status(400).json({ error: 'action non valida' });
    }
    const prompt = String(req.body.prompt || '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt richiesto' });

    await logPushAssistantInteraction({
      brand_id: req.params.id,
      user_id: req.user?.id || req.user?.sub || null,
      prompt,
      proposal: req.body.proposal || null,
      final_payload: req.body.final_payload || null,
      action
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Push assistant feedback error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ AI Creative Generator (copy + image in one shot) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.post('/brands/:id/ai-creative', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    const { prompt, type, generate_image } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt richiesto' });

    console.log(`[AI Creative] Generating ${type || 'banner'} concept for "${brand.name}": ${prompt}`);

    // Step 1: Generate copy + colors + image prompt via Claude
    const concept = await generateCreativeCopy(brand.name, prompt, type || 'banner');

    // Step 2: Optionally generate background image via fal.ai
    let image_url = null;
    if (generate_image !== false && concept.image_prompt) {
      try {
        const { generateWithFal } = require('../engine/creative-ai');
        const stylePrompt = (brand.config && brand.config.aiStylePrompt) || null;
        const fullPrompt = stylePrompt
          ? `${concept.image_prompt}. Style: ${stylePrompt}`
          : concept.image_prompt;
        const falUrl = await generateWithFal(fullPrompt, 1080, 1080, 'fal-ai/flux/dev', null, null);
        // Save as media
        const imgRes = await fetch(falUrl);
        const imgBuf = Buffer.from(await imgRes.arrayBuffer());
        const media = await createMedia({
          brand_id: brand.id,
          type: 'ai_generated',
          title: prompt.substring(0, 60),
          image_base64: imgBuf.toString('base64'),
          width: 1080, height: 1080
        });
        image_url = `/api/v1/media/${media.id}/image`;
        console.log(`[AI Creative] Image generated and saved as media ${media.id}`);
      } catch (imgErr) {
        console.error('[AI Creative] Image generation failed:', imgErr.message);
        // Continue without image ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ copy is still useful
      }
    }

    res.json({ ...concept, image_url });
  } catch (err) {
    console.error('AI creative error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Templates ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

router.get('/templates', async (req, res) => {
  try {
    const { brand_id } = req.query;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const templates = await listTemplates(brand_id);
    res.json(templates);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function normalizeTemplateBodyForBrand(body, brand, req) {
  if (!isHrBrand(brand, req)) return body;
  return { ...body, pass_type: 'employee_pass' };
}

router.post('/templates', async (req, res) => {
  try {
    if (!requireBrandId(req, res, req.body.brand_id)) return;
    const brand = await getBrand(req.body.brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    validateTemplateBackPayload(req.body);
    const template = await createTemplate(await normalizeTemplateBodyForBrand(req.body, brand, req));
    await syncGoogleWalletClassForTemplate(brand, template);
    res.json(template);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/templates/:id', async (req, res) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template non trovato' });
    if (!requireBrandId(req, res, template.brand_id)) return;
    res.json(template);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/templates/:id', async (req, res) => {
  try {
    const existing = await getTemplate(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Template non trovato' });
    if (!requireBrandId(req, res, existing.brand_id)) return;
    validateTemplateBackPayload(req.body);
    const brand = await getBrand(existing.brand_id);
    const template = await updateTemplate(
      req.params.id,
      await normalizeTemplateBodyForBrand(req.body, brand, req)
    );
    await syncGoogleWalletClassForTemplate(brand, template);
    const { touched } = await touchPassesForTemplate(req.params.id);
    let wallet_push_sent = 0;
    const devices = await getDevicesForTemplate(req.params.id);
    if (devices.length) {
      const batch = await sendPushBatch(devices.map((d) => d.push_token));
      wallet_push_sent = batch.filter((r) => r.success).length;
    }
    res.json({ ...template, wallet_refresh: { passes_touched: touched, push_sent: wallet_push_sent } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Template image upload (base64 in style JSONB) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.post('/templates/:id/images', async (req, res) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template non trovato' });
    if (!requireBrandId(req, res, template.brand_id)) return;
    const { image_type, image_base64 } = req.body;
    // image_type: 'logo', 'strip', 'thumbnail', 'background'
    if (!['logo', 'strip', 'thumbnail', 'background'].includes(image_type)) {
      return res.status(400).json({ error: 'image_type deve essere: logo, strip, thumbnail, background' });
    }
    if (!image_base64) return res.status(400).json({ error: 'image_base64 richiesto' });
    const style = template.style || {};
    style.images = style.images || {};
    style.images[image_type] = image_base64;
    await updateTemplate(req.params.id, { style });
    res.json({ success: true, image_type });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/templates/:id/images/:imageType', async (req, res) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template non trovato' });
    if (!requireBrandId(req, res, template.brand_id)) return;
    const style = template.style || {};
    if (style.images) {
      delete style.images[req.params.imageType];
      await updateTemplate(req.params.id, { style });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public PNG for Google/Samsung Wallet (strip, thumbnail, background from template.style.images)
router.get('/templates/:id/wallet-image/:imageType', async (req, res) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) return res.status(404).json({ error: 'Template non trovato' });
    const imageType = req.params.imageType;
    if (!['logo', 'strip', 'thumbnail', 'background'].includes(imageType)) {
      return res.status(400).json({ error: 'imageType deve essere: logo, strip, thumbnail, background' });
    }
    const b64 = template.style?.images?.[imageType];
    if (!b64) return res.status(404).json({ error: 'Immagine non trovata' });
    const buf = Buffer.from(b64, 'base64');
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(buf);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/templates/:id', async (req, res) => {
  try {
    const existing = await getTemplate(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Template non trovato' });
    if (!requireBrandId(req, res, existing.brand_id)) return;
    await deleteTemplate(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Campaigns ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

router.get('/campaigns', async (req, res) => {
  try {
    const { brand_id } = req.query;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const campaigns = await listCampaigns(brand_id);
    res.json(campaigns);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/campaigns', async (req, res) => {
  try {
    if (!requireBrandId(req, res, req.body.brand_id)) return;
    const campaign = await createCampaign(req.body);
    res.json(campaign);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campagna non trovata' });
    if (!requireBrandId(req, res, campaign.brand_id)) return;
    res.json(campaign);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/campaigns/:id', async (req, res) => {
  try {
    const existing = await getCampaign(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Campagna non trovata' });
    if (!requireBrandId(req, res, existing.brand_id)) return;
    const campaign = await updateCampaign(req.params.id, req.body);
    res.json(campaign);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/campaigns/:id', async (req, res) => {
  try {
    const existing = await getCampaign(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Campagna non trovata' });
    if (!requireBrandId(req, res, existing.brand_id)) return;
    await deleteCampaign(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Passes (backoffice) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

router.get('/passes', async (req, res) => {
  try {
    const { brand_id, status, campaign_id, limit, offset } = req.query;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const listOpts = {
      status,
      campaign_id,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined
    };
    const passes = await listPasses(brand_id, listOpts);
    if (req.query.include_total === '1' || req.query.include_total === 'true') {
      const total = await countPasses(brand_id, { status, campaign_id });
      return res.json({
        passes,
        total,
        limit: listOpts.limit ?? null,
        offset: listOpts.offset ?? 0
      });
    }
    res.json(passes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/passes', async (req, res) => {
  try {
    const { brand_id, template_id, campaign_id, field_values } = req.body;
    if (!brand_id || !template_id) return res.status(400).json({ error: 'brand_id e template_id richiesti' });
    if (!requireBrandId(req, res, brand_id)) return;

    const passInstance = await createPassInstance({ template_id, brand_id, campaign_id, field_values });
    await logEvent({ pass_id: passInstance.id, brand_id, event_type: 'pass_created', metadata: { source: 'backoffice' } });
    if (campaign_id) await incrementCampaignDownloads(campaign_id);

    res.json(passInstance);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/passes/:id', async (req, res) => {
  try {
    const pass = await getPassInstance(req.params.id);
    if (!pass) return res.status(404).json({ error: 'Pass non trovato' });
    if (!requireBrandId(req, res, pass.brand_id)) return;
    res.json(pass);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/passes/:id', async (req, res) => {
  try {
    const existing = await getPassInstance(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Pass non trovato' });
    if (!requireBrandId(req, res, existing.brand_id)) return;
    const pass = await updatePassInstance(req.params.id, req.body);
    res.json(pass);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/passes/:id', async (req, res) => {
  try {
    const existing = await getPassInstance(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Pass non trovato' });
    if (!requireBrandId(req, res, existing.brand_id)) return;
    await deletePass(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/passes/:id/regenerate', async (req, res) => {
  try {
    if (!requireWriteAccess(req, res)) return;
    const pass = await getPassInstance(req.params.id);
    if (!pass) return res.status(404).json({ error: 'Pass non trovato' });
    if (!requireBrandId(req, res, pass.brand_id)) return;
    const brand = await getBrand(pass.brand_id);
    const template = await getTemplate(pass.template_id);

    await clearPassPushOverlay(pass.id);
    const freshPass = await getPassInstance(pass.id);

    const baseUrl = resolveBaseUrl(req);
    const wantsJson =
      req.query.json === '1'
      || String(req.get('accept') || '').includes('application/json')
      || (req.body && req.body.json === true);

    const pkpassBuffer = await createPkpass(template, freshPass, brand, {
      baseUrl,
      passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER || 'pass.com.nudj',
      teamIdentifier: process.env.TEAM_IDENTIFIER || 'YOUR_TEAM_ID',
      rotatePortalLink: true
    });

    if (!wantsJson) {
      res.set({
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="${brand.slug || 'pass'}.pkpass"`,
        'Content-Length': pkpassBuffer.length
      });
      return res.send(pkpassBuffer);
    }

    await touchPass(pass.id);

    let apnsSent = 0;
    const devices = await getDevicesForPass(pass.serial_number);
    const tokens = devices.map((d) => d.push_token).filter(Boolean);
    if (tokens.length) {
      const batch = await sendPushBatch(tokens);
      apnsSent = batch.filter((r) => r.success).length;
    }

    let googleSync = { attempted: 0, updated: 0, errors: 0, skipped: true };
    if (freshPass.google_wallet_object_id) {
      googleSync = await syncGoogleWalletObjectsForPasses({
        brand,
        passes: [freshPass],
        message: null
      });
      googleSync.skipped = false;
    }

    let samsungSync = { attempted: 0, notified: 0, skipped: true };
    if (pass.samsung_wallet_ref_id && samsungWallet.isConfigured()) {
      samsungSync = await notifySamsungSavedPasses([pass]);
      samsungSync.skipped = false;
    }

    await logEvent({
      pass_id: pass.id,
      brand_id: pass.brand_id,
      event_type: 'pass_regenerated',
      metadata: { source: 'dashboard', apns_sent: apnsSent }
    });

    res.json({
      success: true,
      pass_id: pass.id,
      apns_sent: apnsSent,
      google: googleSync,
      samsung: samsungSync,
      portal_link_rotated: true
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


router.post('/brands/:id/push/draft-copy', async (req, res) => {
  try {
    const brandId = req.params.id;
    if (!requireOwnedBrandPk(req, res, brandId)) return;
    if (!requireWriteAccess(req, res)) return;
    const brand = await getBrand(brandId);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    const brief = String(req.body.brief || req.body.prompt || '').trim();
    if (!brief) return res.status(400).json({ error: 'brief richiesto — descrivi la promo in una frase' });

    const recentPushes = (await listPushes(brandId)).slice(0, 5);
    const draft = await draftImmediatePushCopy({ brand, brief, recentPushes });
    res.json({ draft });
  } catch (err) {
    console.error('Push draft-copy error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/brands/:id/push/strip-preview', async (req, res) => {
  try {
    const brandId = req.params.id;
    if (!requireBrandId(req, res, brandId)) return;
    const brand = await getBrand(brandId);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    const { strip_base64, strip_media_id, format } = req.body || {};
    let stripOverride = null;
    if (strip_media_id || strip_base64) {
      stripOverride = await resolvePushStripBase64({ brand_id: brandId, strip_media_id, strip_base64 });
    }

    const templates = await listTemplates(brandId);
    const template = templates[0] || { style: { images: {} } };
    const { loadHrStripBuffers } = require('../engine/passkit');
    const stripBuffers = await loadHrStripBuffers({ brand, template, stripOverrideBase64: stripOverride });

    const preview = stripBuffers.strip;

    const acceptJson = format === 'json' || req.query.format === 'json';
    if (acceptJson) {
      return res.json({ strip_preview: `data:image/png;base64,${preview.toString('base64')}` });
    }
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(preview);
  } catch (err) {
    console.error('Strip preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** HR push — full pass preview (strip, lock screen copy, front/back fields). */
router.post('/brands/:id/push/pass-preview', async (req, res) => {
  try {
    const brandId = req.params.id;
    if (!requireBrandId(req, res, brandId)) return;
    const brand = await getBrand(brandId);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    const templates = await listTemplates(brandId);
    const template = templates[0] || { style: { images: {} } };
    const body = { ...(req.body || {}) };
    if (body.strip_media_id || body.strip_base64) {
      body.strip_base64 = await resolvePushStripBase64({
        brand_id: brandId,
        strip_media_id: body.strip_media_id,
        strip_base64: body.strip_base64,
      });
    }

    const { buildPushPassPreview } = require('../engine/push-pass-preview');
    const preview = await buildPushPassPreview({ brand, template, body });
    res.set('Cache-Control', 'no-store');
    res.json(preview);
  } catch (err) {
    console.error('Pass preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/push/send', async (req, res) => {
  try {
    const {
      brand_id, title, message, campaign_id, audience_id, update_pass, field_values,
      instant_win_id, gamification_id, channel = 'all',
      back_link_label, back_link_url,
      include_pass_link, pass_link_url, pass_link_label, pass_link_expires_at,
      strip_media_id, strip_base64,
      back_details,
      screen_alert,
      test_pass_id,
    } = req.body;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const screenErrors = validatePushScreenAlert(screen_alert);
    if (update_pass !== false && screenErrors.length) {
      return res.status(400).json({
        error: screenErrors[0].message,
        field: screenErrors[0].field,
        limits: { screen_alert_max: PUSH_SCREEN_ALERT_MAX },
      });
    }
    const backDetailsErrors = validatePushBackDetails(back_details);
    if (backDetailsErrors.length) {
      return res.status(400).json({
        error: backDetailsErrors[0].message,
        field: backDetailsErrors[0].field,
        limits: { back_details_max: PUSH_BACK_DETAILS_MAX },
      });
    }
    if (!assertPushChannel(channel)) {
      return res.status(400).json({ error: 'channel non valido (apple|google|samsung|all o combinazioni apple,google)' });
    }

    let resolvedStripBase64 = null;
    if (update_pass !== false && (strip_media_id || strip_base64)) {
      try {
        resolvedStripBase64 = await resolvePushStripBase64({ brand_id, strip_media_id, strip_base64 });
      } catch (stripErr) {
        return res.status(400).json({ error: stripErr.message });
      }
    }

    const brand = await getBrand(brand_id);
    const pushCtx = {
      hrDeploy: isHrBrand(brand, req),
      resolvedStripBase64,
    };
    const payload = normalizeHrPushPayload({
      ...req.body,
      field_values,
    });

    if (test_pass_id) {
      const result = await executeWalletPush(payload, pushCtx);
      return res.json(result);
    }

    const job = await createPushJob({ brand_id, payload });
    enqueuePushJob(job.id, pushCtx);
    return res.status(202).json({
      job_id: job.id,
      status: 'queued',
      message: 'Invio push avviato in background',
    });
  } catch (err) {
    console.error('Push send error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/push/jobs/:id', async (req, res) => {
  try {
    const job = await getPushJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job non trovato' });
    if (!requireBrandId(req, res, job.brand_id)) return;
    res.json({
      job_id: job.id,
      brand_id: job.brand_id,
      status: job.status,
      progress: job.progress || {},
      result: job.result || null,
      error: job.error || null,
      created_at: job.created_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/push/history', async (req, res) => {
  try {
    const { brand_id } = req.query;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const pushes = await listPushes(brand_id);
    res.json(pushes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/push/:id', async (req, res) => {
  try {
    const row = await pool.query('SELECT brand_id FROM push_log WHERE id = $1', [req.params.id]);
    if (!row.rows[0]) return res.status(404).json({ error: 'Voce non trovata' });
    if (!requireBrandId(req, res, row.rows[0].brand_id)) return;
    await deletePush(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/push/clear/:brand_id', async (req, res) => {
  try {
    if (!requireBrandId(req, res, req.params.brand_id)) return;
    const result = await clearPushHistory(req.params.brand_id);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Scheduled Push ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

router.get('/push/scheduled', async (req, res) => {
  try {
    const { brand_id } = req.query;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const items = await listScheduledPush(brand_id);
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/push/scheduled', async (req, res) => {
  try {
    if (!requireBrandId(req, res, req.body.brand_id)) return;
    if (req.body.channel && !assertPushChannel(req.body.channel)) {
      return res.status(400).json({ error: 'channel non valido (apple|google|samsung|all o combinazioni apple,google)' });
    }
    if (req.body.update_pass !== false) {
      const screenErrors = validatePushScreenAlert(req.body.screen_alert);
      if (screenErrors.length) {
        return res.status(400).json({
          error: screenErrors[0].message,
          field: screenErrors[0].field,
          limits: { screen_alert_max: PUSH_SCREEN_ALERT_MAX },
        });
      }
    }
    const backDetailsErrors = validatePushBackDetails(req.body.back_details);
    if (backDetailsErrors.length) {
      return res.status(400).json({
        error: backDetailsErrors[0].message,
        limits: { back_details_max: PUSH_BACK_DETAILS_MAX },
      });
    }
    const body = normalizeHrPushPayload(req.body);
    if (body.pass_link_url) {
      parsePassLinkFromPushBody(body, body.title);
      body.include_pass_link = true;
    }
    if (body.update_pass !== false && (body.strip_media_id || body.strip_base64)) {
      try {
        body.strip_base64 = await resolvePushStripBase64({
          brand_id: body.brand_id,
          strip_media_id: body.strip_media_id,
          strip_base64: body.strip_base64,
        });
      } catch (stripErr) {
        return res.status(400).json({ error: stripErr.message });
      }
    }
    delete body.strip_media_id;
    if (Array.isArray(body.days) && body.days.length && (!body.schedule_days || String(body.schedule_days).trim() === '')) {
      body.schedule_days = body.days.map((x) => String(x)).join(',');
    }
    const nextRun = computeInitialScheduledRun(body);
    if (!nextRun) return res.status(400).json({ error: 'Data/orario non validi per la pianificazione' });
    if (body.schedule_type === 'once' && nextRun.getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Data e ora sono già passate (fuso del server)' });
    }
    body.next_run_at = nextRun;
    const item = await createScheduledPush(body);
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/push/scheduled/:id', async (req, res) => {
  try {
    const prev = await getScheduledPush(req.params.id);
    if (!prev) return res.status(404).json({ error: 'Push pianificato non trovato' });
    if (!requireBrandId(req, res, prev.brand_id)) return;
    if (req.body.channel && !assertPushChannel(req.body.channel)) {
      return res.status(400).json({ error: 'channel non valido (apple|google|samsung|all o combinazioni apple,google)' });
    }
    if (req.body.back_details !== undefined) {
      const backDetailsErrors = validatePushBackDetails(req.body.back_details);
      if (backDetailsErrors.length) {
        return res.status(400).json({
          error: backDetailsErrors[0].message,
          limits: { back_details_max: PUSH_BACK_DETAILS_MAX },
        });
      }
    }
    const patch = { ...req.body };
    if (patch.back_details !== undefined) {
      patch.back_details = normalizePushBackDetails(patch.back_details);
    }
    if (patch.screen_alert !== undefined) {
      const screenErrors = validatePushScreenAlert(patch.screen_alert);
      if (screenErrors.length) {
        return res.status(400).json({
          error: screenErrors[0].message,
          field: screenErrors[0].field,
          limits: { screen_alert_max: PUSH_SCREEN_ALERT_MAX },
        });
      }
      patch.screen_alert = String(patch.screen_alert || '').trim().slice(0, PUSH_SCREEN_ALERT_MAX) || null;
    }
    const item = await updateScheduledPush(req.params.id, patch);
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/push/scheduled/:id', async (req, res) => {
  try {
    const prev = await getScheduledPush(req.params.id);
    if (!prev) return res.status(404).json({ error: 'Push pianificato non trovato' });
    if (!requireBrandId(req, res, prev.brand_id)) return;
    await deleteScheduledPush(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// OpenStreetMap Nominatim (pubblico) — proxy server-side: User-Agent obbligatorio, evita CORS dal browser
const NOMINATIM_UA = process.env.NOMINATIM_USER_AGENT || `${getProductBrandName()}/1.0 (${process.env.CUSTOM_DOMAIN || 'localhost'})`;

function nominatimFormatLine(feature) {
  const a = feature.address || {};
  const street = [a.road || a.pedestrian, a.house_number].filter(Boolean).join(' ').trim();
  const locality = a.city || a.town || a.village || a.hamlet || a.municipality || a.city_district || a.suburb || a.neighbourhood;
  const parts = [street || a.road, a.postcode, locality, a.state, a.country].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return feature.display_name || '';
}

// GET /geocode/search?q=   → [{ lat, lon, display_name, address }]
router.get('/geocode/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json([]);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=8&addressdetails=1`;
    const r = await fetch(url, { headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': 'it,en' } });
    if (r.status === 429) {
      return res.status(429).json({
        error: 'rate_limit',
        message: 'Troppe richieste al servizio indirizzi. OpenStreetMap (Nominatim) chiede di non superare circa 1 richiesta/sec.'
      });
    }
    if (!r.ok) return res.status(502).json({ error: 'Servizio indirizzi non disponibile' });
    const rows = await r.json();
    const out = (Array.isArray(rows) ? rows : []).map((x) => ({
      lat: parseFloat(x.lat),
      lon: parseFloat(x.lon),
      display_name: x.display_name,
      address: nominatimFormatLine(x)
    })).filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon));
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /geocode/reverse?lat=&lon=
router.get('/geocode/reverse', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return res.status(400).json({ error: 'lat e lon sono richiesti' });
    }
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
    const r = await fetch(url, { headers: { 'User-Agent': NOMINATIM_UA, 'Accept-Language': 'it,en' } });
    if (r.status === 429) {
      return res.status(429).json({
        error: 'rate_limit',
        message: 'Troppe richieste al servizio indirizzi. Attendi qualche secondo (policy Nominatim).'
      });
    }
    if (!r.ok) return res.status(502).json({ error: 'Reverse geocoding non disponibile' });
    const data = await r.json();
    res.json({
      display_name: data.display_name || '',
      address: nominatimFormatLine(data),
      lat,
      lon
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Geofencing Locations ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

router.get('/brands/:id/geofencing', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    const locations = brand.config?.locations || [];
    const [passRows, appleDevices, hubSettings, hubMerchantLocations] = await Promise.all([
      pool.query('SELECT id, google_wallet_object_id FROM pass_instances WHERE brand_id = $1', [req.params.id]),
      getDevicesForBrand(req.params.id),
      getHubSettings(req.params.id),
      listMerchantGeofenceLocationsForBrand(req.params.id),
    ]);
    const googleObjects = passRows.rows.filter((p) => !!p.google_wallet_object_id).length;
    const diagnostics = buildGeofenceDiagnostics({
      brandConfig: brand.config || {},
      hubSettings,
      hubMerchantLocations,
      appleDevices: appleDevices.length,
      googleObjects,
      passCount: passRows.rowCount || 0,
    });
    res.json({
      locations,
      maxDistance: brand.config?.maxDistance || 500,
      channel: brand.config?.geofencing_channel || 'all',
      diagnostics: {
        passes: passRows.rowCount || 0,
        apple_devices: appleDevices.length,
        google_objects: googleObjects,
        ...diagnostics,
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/brands/:id/geofencing', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const { locations, maxDistance, channel = 'all' } = req.body;
    if (!assertPushChannel(channel)) {
      return res.status(400).json({ error: 'channel non valido (apple|google|samsung|all o combinazioni apple,google)' });
    }
    const { sendApple, sendGoogle, sendSamsung } = parseWalletPushFlags(channel);
    const brand = await getBrand(req.params.id);
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    const config = brand.config || {};
    const nextLocations = (locations || []).slice(0, 10).map((loc, idx) => {
      const invalidPoi = (message) => Object.assign(new Error(message), { statusCode: 400 });
      const latitude = parseFloat(loc.latitude);
      const longitude = parseFloat(loc.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
        throw invalidPoi(`POI #${idx + 1}: latitudine non valida`);
      }
      if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        throw invalidPoi(`POI #${idx + 1}: longitudine non valida`);
      }
      return {
        latitude,
        longitude,
        relevantText: loc.relevantText || '',
        name: loc.name || '',
        radius: parseInt(loc.radius) || 500,
        address: typeof loc.address === 'string' ? loc.address.slice(0, 500) : ''
      };
    });
    config.locations = nextLocations;
    if (locations && locations.length > 10) {
      config.locations_truncated = true;
    } else {
      delete config.locations_truncated;
    }
    if (maxDistance) {
      const parsedMaxDistance = parseInt(maxDistance, 10);
      if (!Number.isFinite(parsedMaxDistance) || parsedMaxDistance < 1) {
        throw Object.assign(new Error('Distanza massima non valida'), { statusCode: 400 });
      }
      config.maxDistance = parsedMaxDistance;
    }
    config.geofencing_channel = channel;
    delete config.geofencingFaceMessage;
    delete config.geofencingFaceLabel;

    await updateBrand(req.params.id, { config });

    // Regenerate all active passes to include new locations
    const passes = await pool.query(
      'SELECT id FROM pass_instances WHERE brand_id = $1', [req.params.id]
    );
    const passTouch = await touchPassesByIds(passes.rows.map((p) => p.id));

    let pushCount = 0;
    let pushErrors = 0;
    let appleDeviceCount = 0;
    if (sendApple) {
      const devices = await getDevicesForBrand(req.params.id);
      appleDeviceCount = devices.length;
      if (devices.length) {
        const batch = await sendPushBatch(devices.map((d) => d.push_token));
        pushCount = batch.filter((r) => r.success).length;
        pushErrors = batch.length - pushCount;
      }
    }

    let googleSync = { attempted: 0, updated: 0, errors: 0, skipped: !sendGoogle };
    let samsungSync = { attempted: 0, notified: 0, skipped: !sendSamsung || !samsungWallet.isConfigured() };
    const passRows = await pool.query('SELECT * FROM pass_instances WHERE brand_id = $1', [req.params.id]);
    if (sendGoogle) {
      const geoMessage = (config.locations && config.locations[0] && config.locations[0].relevantText)
        || 'Aggiornamento geolocalizzazione';
      googleSync = await syncGoogleWalletObjectsForPasses({
        brand: await getBrand(req.params.id),
        passes: passRows.rows,
        title: 'VICINO A TE',
        message: geoMessage
      });
    }
    if (sendSamsung && samsungWallet.isConfigured()) {
      samsungSync = await notifySamsungSavedPasses(passRows.rows);
    }

    const hubSettings = await getHubSettings(req.params.id);
    const hubMerchantLocations = await listMerchantGeofenceLocationsForBrand(req.params.id);
    const diagnostics = buildGeofenceDiagnostics({
      brandConfig: config,
      hubSettings,
      hubMerchantLocations,
      appleDevices: appleDeviceCount,
      googleObjects: passRows.rows.filter((p) => !!p.google_wallet_object_id).length,
      passCount: passes.rowCount || 0,
    });

    res.json({
      success: true,
      channel,
      locations: config.locations,
      maxDistance: config.maxDistance,
      pass_count: passes.rowCount || 0,
      passes_touched: passTouch.touched || 0,
      pushes_sent: pushCount,
      apple: {
        devices: appleDeviceCount,
        updates_sent: pushCount,
        update_errors: pushErrors,
        passes_touched: passTouch.touched || 0
      },
      google: googleSync,
      samsung: samsungSync,
      diagnostics,
    });
  } catch (err) { res.status(err.statusCode || 500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Analytics ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

// ─── Audiences (pass holders segmentation) ─────────────────────────────────────

router.get('/brands/:brand_id/audiences/insights', async (req, res) => {
  try {
    const brand_id = req.params.brand_id;
    if (!requireBrandId(req, res, brand_id)) return;
    const days = parseInt(req.query.days, 10) || 30;
    const [insights, behavior] = await Promise.all([
      getPassHoldersInsights(brand_id),
      getHolderBehaviorInsights(brand_id, days)
    ]);
    res.json({ ...insights, behavior });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brands/:brand_id/holder-events', async (req, res) => {
  try {
    const brand_id = req.params.brand_id;
    if (!requireBrandId(req, res, brand_id)) return;
    const events = await listRecentHolderEvents(brand_id, {
      limit: req.query.limit,
      action: req.query.action || null
    });
    res.json(events);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brands/:brand_id/holder-events/export', async (req, res) => {
  try {
    const brand_id = req.params.brand_id;
    if (!requireBrandId(req, res, brand_id)) return;
    const days = parseInt(req.query.days, 10) || 30;
    const rows = await exportHolderEvents(brand_id, {
      days,
      limit: req.query.limit,
      action: req.query.action || null
    });
    const header = 'id,serial_number,event_category,event_action,target_key,target_label,target_url,pass_id,device_id,created_at';
    const lines = rows.map((r) => [
      r.id,
      r.serial_number || '',
      r.event_category || '',
      r.event_action || '',
      r.target_key || '',
      (r.target_label || '').replace(/"/g, '""'),
      (r.target_url || '').replace(/"/g, '""'),
      r.pass_id || '',
      r.device_id || '',
      r.created_at ? new Date(r.created_at).toISOString() : ''
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="holder_events_${brand_id}_${days}d.csv"`);
    res.send('\uFEFF' + [header, ...lines].join('\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brands/:brand_id/audiences/event-actions', async (req, res) => {
  try {
    if (!requireBrandId(req, res, req.params.brand_id)) return;
    res.json({ actions: [...ALLOWED_EVENT_ACTIONS] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/brands/:brand_id/audiences/query', async (req, res) => {
  try {
    const brand_id = req.params.brand_id;
    if (!requireBrandId(req, res, brand_id)) return;
    const result = await executeAudienceQuery(brand_id, req.body.spec || req.body);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/brands/:brand_id/audiences', async (req, res) => {
  try {
    const brand_id = req.params.brand_id;
    if (!requireBrandId(req, res, brand_id)) return;
    const rows = await listAudiences(brand_id);
    const enriched = await Promise.all(rows.map(async (a) => {
      const count = await countAudienceMembers(brand_id, a.rules || {});
      return { ...a, member_count: count };
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/brands/:brand_id/audiences', async (req, res) => {
  try {
    const brand_id = req.params.brand_id;
    if (!requireBrandId(req, res, brand_id)) return;
    const { name, description, rules, query_spec, source_prompt } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome audience obbligatorio' });
    const normalized = query_spec
      ? mergeSpecToAudienceRules(query_spec)
      : normalizeRules(rules || {});
    if (!hasActiveRules(normalized)) {
      return res.status(400).json({ error: 'Seleziona almeno un filtro per l\'audience' });
    }
    const count = await countAudienceMembers(brand_id, normalized);
    const row = await createAudience({
      brand_id, name, description, rules: normalized,
      query_spec: query_spec || { rules: normalized },
      source_prompt: source_prompt || ''
    });
    await updateAudience(row.id, { cached_count: count });
    res.json({ ...row, rules: normalized, member_count: count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/brands/:brand_id/audiences/preview', async (req, res) => {
  try {
    const brand_id = req.params.brand_id;
    if (!requireBrandId(req, res, brand_id)) return;
    if (req.body.spec) {
      const result = await executeAudienceQuery(brand_id, req.body.spec, { limit: 10, offset: 0 });
      return res.json({ count: result.count, sample: result.members, rules: result.rules, spec: req.body.spec });
    }
    const rules = normalizeRules(req.body.rules || {});
    const count = await countAudienceMembers(brand_id, rules);
    const sample = await listAudienceMembers(brand_id, rules, { limit: 10, offset: 0 });
    res.json({ count, sample, rules });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/audiences/:id', async (req, res) => {
  try {
    const row = await getAudience(req.params.id);
    if (!row) return res.status(404).json({ error: 'Audience non trovata' });
    if (!requireBrandId(req, res, row.brand_id)) return;
    const count = await countAudienceMembers(row.brand_id, row.rules || {});
    res.json({ ...row, member_count: count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/audiences/:id', async (req, res) => {
  try {
    const prev = await getAudience(req.params.id);
    if (!prev) return res.status(404).json({ error: 'Audience non trovata' });
    if (!requireBrandId(req, res, prev.brand_id)) return;
    const patch = { ...req.body };
    if (patch.rules !== undefined) patch.rules = normalizeRules(patch.rules);
    const row = await updateAudience(req.params.id, patch);
    const rules = row.rules || {};
    const count = await countAudienceMembers(row.brand_id, rules);
    await updateAudience(row.id, { cached_count: count });
    res.json({ ...row, member_count: count });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/audiences/:id', async (req, res) => {
  try {
    const prev = await getAudience(req.params.id);
    if (!prev) return res.status(404).json({ error: 'Audience non trovata' });
    if (!requireBrandId(req, res, prev.brand_id)) return;
    await deleteAudience(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/audiences/:id/members', async (req, res) => {
  try {
    const row = await getAudience(req.params.id);
    if (!row) return res.status(404).json({ error: 'Audience non trovata' });
    if (!requireBrandId(req, res, row.brand_id)) return;
    const lim = parseInt(req.query.limit, 10) || 100;
    const off = parseInt(req.query.offset, 10) || 0;
    const count = await countAudienceMembers(row.brand_id, row.rules || {});
    const members = await listAudienceMembers(row.brand_id, row.rules || {}, { limit: lim, offset: off });
    res.json({ count, members });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/audiences/:id/export', async (req, res) => {
  try {
    const row = await getAudience(req.params.id);
    if (!row) return res.status(404).json({ error: 'Audience non trovata' });
    if (!requireBrandId(req, res, row.brand_id)) return;
    const members = await listAudienceMembers(row.brand_id, row.rules || {}, { limit: 5000, offset: 0 });
    const header = 'Nome,Cognome,Email,Telefono,Serial,Campagna,Stato,Apple push,Google,Samsung,Creato';
    const lines = members.map((m) => [
      m.contact_first_name || '',
      m.contact_last_name || '',
      m.contact_email || '',
      m.contact_phone || '',
      m.serial_number || '',
      m.campaign_name || '',
      m.status || '',
      m.has_apple_push ? 'si' : 'no',
      m.google_wallet_saved ? 'si' : 'no',
      m.samsung_wallet_saved ? 'si' : 'no',
      m.created_at ? new Date(m.created_at).toISOString() : ''
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audience_${row.id}.csv"`);
    res.send('\uFEFF' + [header, ...lines].join('\n'));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/analytics/:brand_id', async (req, res) => {
  try {
    if (!requireBrandId(req, res, req.params.brand_id)) return;
    const analytics = await getAnalytics(req.params.brand_id);
    res.json(analytics);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/analytics/:brand_id/campaigns', async (req, res) => {
  try {
    if (!requireBrandId(req, res, req.params.brand_id)) return;
    const data = await getCampaignAnalytics(req.params.brand_id);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/events/:brand_id', async (req, res) => {
  try {
    if (!requireBrandId(req, res, req.params.brand_id)) return;
    const limRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limRaw) ? Math.min(Math.max(limRaw, 1), 500) : 150;
    const events = await listEvents(req.params.brand_id, limit);
    res.json(events);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Strip Promos ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

router.get('/brands/:id/strip-promos', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const promos = await listStripPromos(req.params.id);
    res.json(promos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/brands/:id/strip-promos', async (req, res) => {
  try {
    if (!requireOwnedBrandPk(req, res, req.params.id)) return;
    const promo = await createStripPromo({ brand_id: req.params.id, ...req.body });
    res.json(promo);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/strip-promos/:id', async (req, res) => {
  try {
    const existing = await getStripPromo(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Strip promo non trovata' });
    if (!requireBrandId(req, res, existing.brand_id)) return;
    await updateStripPromo(req.params.id, req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/strip-promos/:id', async (req, res) => {
  try {
    const existing = await getStripPromo(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Strip promo non trovata' });
    if (!requireBrandId(req, res, existing.brand_id)) return;
    await deleteStripPromo(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get strip promo image base64 (for template reuse)
router.get('/strip-promos/:id/image', async (req, res) => {
  try {
    const promo = await getStripPromo(req.params.id);
    if (!promo) return res.status(404).json({ error: 'Strip promo non trovata' });
    if (!requireBrandId(req, res, promo.brand_id)) return;
    // If ?raw=1, serve as actual image for <img> tags
    if (req.query.raw === '1') {
      const buf = Buffer.from(promo.strip_base64, 'base64');
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'public, max-age=600');
      return res.send(buf);
    }
    res.json({ strip_base64: promo.strip_base64 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Creative Assets ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

// Get available formats (optionally filter by segment)
router.get('/creative-formats', (req, res) => {
  const { segment } = req.query;
  res.json(getFormats(segment || null));
});

// List assets for a brand
router.get('/creative-assets', async (req, res) => {
  const { brand_id, segment, campaign_id, limit } = req.query;
  if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
  if (!requireBrandId(req, res, brand_id)) return;
  const assets = await listCreativeAssets(brand_id, {
    segment, campaign_id, limit: limit ? parseInt(limit) : undefined
  });
  // Don't send image_base64 in list (too heavy) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ send thumbnail info
  const light = assets.map(a => ({ ...a, image_base64: a.image_base64 ? '[has_image]' : null }));
  res.json(light);
});

// Get single asset (with image)
router.get('/creative-assets/:id', async (req, res) => {
  const asset = await getCreativeAsset(req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset non trovato' });
  if (!requireBrandId(req, res, asset.brand_id)) return;
  res.json(asset);
});

// Upload a creative asset (manual upload)
router.post('/creative-assets/upload', express.raw({ type: 'image/*', limit: '10mb' }), async (req, res) => {
  try {
    const { brand_id, campaign_id, segment, format_key, title } = req.query;
    if (!brand_id || !segment || !format_key) {
      return res.status(400).json({ error: 'brand_id, segment, format_key richiesti' });
    }
    if (!requireBrandId(req, res, brand_id)) return;
    const fmt = getFormat(format_key);
    if (!fmt) return res.status(400).json({ error: 'Formato non valido: ' + format_key });

    // Resize uploaded image to format dimensions
    const sharp = require('sharp');
    const resized = await sharp(req.body).resize(fmt.w, fmt.h, { fit: 'cover' }).png().toBuffer();

    const asset = await createCreativeAsset({
      brand_id, campaign_id: campaign_id || null, segment, format_key: fmt.key,
      format_label: fmt.label, width: fmt.w, height: fmt.h, title: title || fmt.label,
      source: 'upload', image_base64: resized.toString('base64')
    });
    res.json(asset);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upload via multipart form
router.post('/creative-assets/upload-form', async (req, res) => {
  try {
    const { brand_id, campaign_id, segment, format_key, title } = req.body;
    if (!brand_id || !segment || !format_key) {
      return res.status(400).json({ error: 'brand_id, segment, format_key richiesti' });
    }
    if (!requireBrandId(req, res, brand_id)) return;
    const fmt = getFormat(format_key);
    if (!fmt) return res.status(400).json({ error: 'Formato non valido' });

    // Expect image_base64 in body (from dashboard FileReader)
    if (!req.body.image_base64) return res.status(400).json({ error: 'image_base64 richiesto' });

    const sharp = require('sharp');
    const imgBuf = Buffer.from(req.body.image_base64, 'base64');
    const resized = await sharp(imgBuf).resize(fmt.w, fmt.h, { fit: 'cover' }).png().toBuffer();

    const asset = await createCreativeAsset({
      brand_id, campaign_id: campaign_id || null, segment, format_key: fmt.key,
      format_label: fmt.label, width: fmt.w, height: fmt.h, title: title || fmt.label,
      source: 'upload', image_base64: resized.toString('base64')
    });
    res.json({ id: asset.id, format_label: asset.format_label, width: asset.width, height: asset.height, created_at: asset.created_at });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Generate creative with AI (fal.ai)
router.post('/creative-assets/generate', async (req, res) => {
  try {
    const { brand_id, campaign_id, segment, format_key, prompt, headline, cta_text, model, reference_image } = req.body;
    if (!brand_id || !segment || !format_key || !prompt) {
      return res.status(400).json({ error: 'brand_id, segment, format_key, prompt richiesti' });
    }
    if (!requireBrandId(req, res, brand_id)) return;
    const fmt = getFormat(format_key);
    if (!fmt) return res.status(400).json({ error: 'Formato non valido' });

    const brand = await getBrand(brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    // Choose model: image-to-image if reference provided, otherwise text-to-image
    let aiModel = model || 'fal-ai/flux/dev';
    let refImageUrl = null;
    if (reference_image) {
      aiModel = 'fal-ai/flux/dev/image-to-image';
      refImageUrl = `data:image/png;base64,${reference_image}`;
      console.log(`[Creative AI] Using image-to-image with reference (${Math.round(reference_image.length / 1024)}KB)`);
    }

    // Step 1: Generate background with AI (using brand style prompt if configured)
    const stylePrompt = (brand.config && brand.config.aiStylePrompt) || null;
    console.log(`[Creative AI] Generating ${fmt.key} (${fmt.w}x${fmt.h}) with model: ${aiModel}${stylePrompt ? ' + brand style' : ' + default style'}`);
    const imageUrl = await generateWithFal(prompt, fmt.w, fmt.h, aiModel, refImageUrl, stylePrompt);

    // Step 2: Download generated image
    const imgRes = await fetch(imageUrl);
    const bgBuffer = Buffer.from(await imgRes.arrayBuffer());

    // Step 3: Get brand logo (if available)
    let logoBuffer = null;
    if (brand.config && brand.config.logos && brand.config.logos.logo) {
      logoBuffer = Buffer.from(brand.config.logos.logo, 'base64');
    }

    // Step 4: Generate QR for CTV/DOOH
    let qrBuffer = null;
    const isDooh = segment === 'ctv_dooh';
    if (isDooh && campaign_id) {
      // Generate QR code as PNG using a simple SVG-based QR
      // For now, we'll mark it and the dashboard will handle QR separately
    }

    // Step 5: Compose final creative
    const brandColors = {
      bg: brand.config?.backgroundColor || '#0A0A0A',
      fg: brand.config?.foregroundColor || '#FFFFFF',
      lbl: brand.config?.labelColor || '#00D4AA'
    };

    const finalBuffer = await composeCreative({
      backgroundBuffer: bgBuffer, width: fmt.w, height: fmt.h,
      logoBuffer, headline, ctaText: cta_text, brandColors, qrBuffer, segment
    });

    // Step 6: Save to DB
    const asset = await createCreativeAsset({
      brand_id, campaign_id: campaign_id || null, segment, format_key: fmt.key,
      format_label: fmt.label, width: fmt.w, height: fmt.h,
      title: headline || prompt.substring(0, 60),
      headline, cta_text, ai_prompt: prompt, ai_model: aiModel,
      source: 'ai', image_base64: finalBuffer.toString('base64'),
      qr_embedded: isDooh, metadata: { original_image_url: imageUrl }
    });

    res.json({ id: asset.id, format_label: asset.format_label, width: asset.width, height: asset.height, created_at: asset.created_at });
  } catch (err) {
    console.error('Creative AI error:', err);
    res.status(500).json({ error: 'Errore generazione: ' + err.message });
  }
});

// Delete asset
router.delete('/creative-assets/:id', async (req, res) => {
  try {
    const assetRow = await getCreativeAsset(req.params.id);
    if (!assetRow) return res.status(404).json({ error: 'Asset non trovato' });
    if (!requireBrandId(req, res, assetRow.brand_id)) return;
    await deleteCreativeAsset(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Media Hub ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.get('/media', async (req, res) => {
  try {
    const brand_id = req.query.brand_id;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const type = req.query.type || 'all';
    const campaign_id = req.query.campaign_id || null;
    const items = await listMedia(brand_id, type, campaign_id);
    res.json(items);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/media', async (req, res) => {
  try {
    let { brand_id, campaign_id, type, title, image_base64 } = req.body;
    if (!brand_id || !image_base64) return res.status(400).json({ error: 'brand_id e image_base64 richiesti' });
    if (!requireBrandId(req, res, brand_id)) return;
    // Convert PDF to PNG if needed
    image_base64 = await pdfToPngIfNeeded(image_base64);
    const item = await createMedia({ brand_id, campaign_id: campaign_id || null, type, title, image_base64 });
    if (['logo', 'wallet_icon', 'strip', 'background'].includes(String(type || ''))) {
      try {
        const brand = await getBrand(brand_id);
        const cfg = { ...(brand?.config || {}) };
        if (brand && cfg.brand_theme_mode !== 'manual' && cfg.brand_theme?.locked !== true) {
          const { extractBrandPaletteFromImage } = require('../engine/brand-wallet-logo');
          const palette = await extractBrandPaletteFromImage(Buffer.from(image_base64, 'base64'));
          if (palette) {
            cfg.brand_theme = {
              ...(cfg.brand_theme || {}),
              mode: 'auto',
              source: String(type || 'media'),
              media_id: item.id,
              accent: palette.labelColor,
              accentHover: palette.baseColor,
              baseColor: palette.baseColor,
              updated_at: new Date().toISOString()
            };
            await updateBrand(brand_id, { config: cfg });
          }
        }
      } catch (themeErr) {
        console.warn('[brand-theme] media palette extraction failed:', themeErr.message);
      }
    }
    res.json(item);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/media/:id', async (req, res) => {
  try {
    const m = await getMedia(req.params.id);
    if (!m) return res.status(404).json({ error: 'Media non trovato' });
    if (!requireBrandId(req, res, m.brand_id)) return;
    await deleteMedia(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Bulk delete all media for a brand
router.delete('/media', async (req, res) => {
  try {
    const brand_id = req.query.brand_id;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const items = await listMedia(brand_id);
    for (const it of items) await deleteMedia(it.id);
    res.json({ ok: true, deleted: items.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Ad Serving Stats (protected) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.get('/ad-stats', async (req, res) => {
  try {
    const brand_id = req.query.brand_id;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const campaign_id = req.query.campaign_id || null;
    const days = parseInt(req.query.days) || 30;
    const stats = await getAdStats(brand_id, campaign_id, days);
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/ad-timeline', async (req, res) => {
  try {
    const brand_id = req.query.brand_id;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const campaign_id = req.query.campaign_id || null;
    const days = parseInt(req.query.days) || 30;
    const timeline = await getAdTimeline(brand_id, campaign_id, days);
    res.json(timeline);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ad tag generator ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ returns embeddable code for a campaign
router.get('/ad-tag/:campaign_id', async (req, res) => {
  try {
    const campaign = await getCampaign(req.params.campaign_id);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const baseUrl = resolveBaseUrl(req);
    const w = parseInt(req.query.w) || 300;
    const h = parseInt(req.query.h) || 250;

    const iframeTag = `<iframe src="${baseUrl}/api/v1/serve/${campaign.id}?w=${w}&h=${h}" width="${w}" height="${h}" frameborder="0" scrolling="no" style="border:none;overflow:hidden"></iframe>`;
    const scriptTag = `<script>!function(){var d=document,f=d.createElement('iframe');f.src='${baseUrl}/api/v1/serve/${campaign.id}?w=${w}&h=${h}';f.width=${w};f.height=${h};f.frameBorder=0;f.scrolling='no';f.style.cssText='border:none;overflow:hidden';d.currentScript.parentNode.insertBefore(f,d.currentScript)}()</script>`;
    const jsonUrl = `${baseUrl}/api/v1/serve/${campaign.id}?format=json`;

    res.json({
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      formats: {
        iframe: iframeTag,
        script: scriptTag,
        json_endpoint: jsonUrl,
        direct_image: `${baseUrl}/api/v1/serve/${campaign.id}/image`
      },
      tracking: {
        pixel: `${baseUrl}/api/v1/pixel/${campaign.id}`,
        click: `${baseUrl}/api/v1/click/${campaign.id}`
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Banner Builder endpoints ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

// Get available templates & formats
router.get('/banners/templates', (req, res) => {
  res.json({ templates: BANNER_TEMPLATES, formats: IAB_FORMATS });
});

// Generate HTML5 banner preview (does not save)
router.post('/banners/preview', async (req, res) => {
  try {
    const { brandName, headline, subheadline, ctaText, clickUrl, logoUrl, backgroundUrl, bgColor, fgColor, accentColor, format, template } = req.body;
    const brand_id = req.query.brand_id || req.body.brand_id;
    const baseUrl = resolveBaseUrl(req);

    const html = generateBanner({
      brandName, headline, subheadline, ctaText,
      clickUrl: clickUrl || '#',
      pixelUrl: '',
      logoUrl, backgroundUrl,
      bgColor, fgColor, accentColor,
      format: format || '300x250',
      template: template || 'fade-slide'
    });

    res.json({ html, format: format || '300x250', template: template || 'fade-slide' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Generate and save as creative asset
router.post('/banners/generate', async (req, res) => {
  try {
    const { brandName, headline, subheadline, ctaText, clickUrl, logoUrl, backgroundUrl, bgColor, fgColor, accentColor, format, template, campaign_id, title } = req.body;
    const brand_id = req.query.brand_id || req.body.brand_id;
    if (!brand_id) return res.status(400).json({ error: 'brand_id required' });

    const baseUrl = resolveBaseUrl(req);
    const pixelUrl = campaign_id ? `${baseUrl}/api/v1/pixel/${campaign_id}` : '';
    const clickTarget = campaign_id ? `${baseUrl}/api/v1/click/${campaign_id}` : (clickUrl || '#');

    const html = generateBanner({
      brandName, headline, subheadline, ctaText,
      clickUrl: clickTarget,
      pixelUrl,
      logoUrl, backgroundUrl,
      bgColor, fgColor, accentColor,
      format: format || '300x250',
      template: template || 'fade-slide'
    });

    // Save as media asset (type: banner)
    const fmtInfo = IAB_FORMATS[format] || IAB_FORMATS['300x250'];
    const mediaId = uuidv4();
    const assetTitle = title || `Banner ${fmtInfo.label} - ${template || 'fade-slide'}`;

    await createMedia({
      id: mediaId,
      brand_id,
      type: 'banner',
      title: assetTitle,
      image_base64: Buffer.from(html).toString('base64'),
      width: fmtInfo.w,
      height: fmtInfo.h
    });

    res.json({
      id: mediaId,
      title: assetTitle,
      format,
      template,
      width: fmtInfo.w,
      height: fmtInfo.h,
      html
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Serve a saved banner creative
router.get('/banners/:id/serve', async (req, res) => {
  try {
    const media = await getMedia(req.params.id);
    if (!media) return res.status(404).send('Not found');
    if (media.type !== 'banner') return res.status(400).send('Not a banner');
    const html = Buffer.from(media.image_base64, 'base64').toString('utf-8');
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(html);
  } catch (err) { res.status(500).send('Error'); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Video Builder endpoints ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

// Get available video templates & formats
router.get('/videos/templates', (req, res) => {
  res.json({ templates: VIDEO_TEMPLATES, formats: VIDEO_FORMATS });
});

// Generate video and return as downloadable MP4
router.post('/videos/generate', async (req, res) => {
  try {
    const { headline, subheadline, ctaText, brandName, bgColor, fgColor, accentColor, format, template, duration } = req.body;
    const brand_id = req.query.brand_id || req.body.brand_id;

    // If there's a logo in media, get its path
    let logoPath = null;
    let backgroundPath = null;

    // Generate video
    const result = await generateVideo({
      headline, subheadline, ctaText, brandName,
      bgColor, fgColor, accentColor,
      format: format || '1080x1080',
      template: template || 'brand-reveal',
      duration: duration || undefined,
      logoPath, backgroundPath
    });

    // Send the file
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Content-Length', result.size);

    const stream = require('fs').createReadStream(result.path);
    stream.pipe(res);
    stream.on('end', () => cleanupVideo(result.tmpDir));
    stream.on('error', () => cleanupVideo(result.tmpDir));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate video and save as media asset (base64 stored in DB)
router.post('/videos/save', async (req, res) => {
  try {
    const { headline, subheadline, ctaText, brandName, bgColor, fgColor, accentColor, format, template, duration, title } = req.body;
    const brand_id = req.query.brand_id || req.body.brand_id;
    if (!brand_id) return res.status(400).json({ error: 'brand_id required' });

    const result = await generateVideo({
      headline, subheadline, ctaText, brandName,
      bgColor, fgColor, accentColor,
      format: format || '1080x1080',
      template: template || 'brand-reveal',
      duration: duration || undefined
    });

    // Read file and store as base64
    const videoBuffer = require('fs').readFileSync(result.path);
    const videoBase64 = videoBuffer.toString('base64');

    const mediaId = uuidv4();
    const fmtInfo = VIDEO_FORMATS[format] || VIDEO_FORMATS['1080x1080'];
    const assetTitle = title || `Video ${fmtInfo.label} - ${template || 'brand-reveal'}`;

    await createMedia({
      id: mediaId,
      brand_id,
      type: 'video',
      title: assetTitle,
      image_base64: videoBase64,
      width: fmtInfo.w,
      height: fmtInfo.h
    });

    cleanupVideo(result.tmpDir);

    res.json({
      id: mediaId,
      title: assetTitle,
      format,
      template,
      width: fmtInfo.w,
      height: fmtInfo.h,
      duration: result.duration,
      size: result.size
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve a saved video
router.get('/videos/:id/serve', async (req, res) => {
  try {
    const media = await getMedia(req.params.id);
    if (!media) return res.status(404).send('Not found');
    if (media.type !== 'video') return res.status(400).send('Not a video');
    const videoBuf = Buffer.from(media.image_base64, 'base64');
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', videoBuf.length);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(videoBuf);
  } catch (err) { res.status(500).send('Error'); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Instant Win ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

// List campaigns for a brand
router.get('/instant-win', async (req, res) => {
  try {
    const brand_id = req.query.brand_id;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const campaigns = await listInstantWinCampaigns(brand_id);
    res.json(campaigns);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Stats for a brand
router.get('/instant-win/stats', async (req, res) => {
  try {
    const brand_id = req.query.brand_id;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const stats = await getInstantWinStats(brand_id);
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get single campaign
router.get('/instant-win/:id', async (req, res) => {
  try {
    const campaign = await getInstantWinCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campagna non trovata' });
    if (!requireBrandId(req, res, campaign.brand_id)) return;
    res.json(campaign);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create campaign
router.post('/instant-win', async (req, res) => {
  try {
    if (!requireBrandId(req, res, req.body.brand_id)) return;
    const campaign = await createInstantWinCampaign(req.body);
    res.json(campaign);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update campaign
router.put('/instant-win/:id', async (req, res) => {
  try {
    const prevIw = await getInstantWinCampaign(req.params.id);
    if (!prevIw) return res.status(404).json({ error: 'Campagna non trovata' });
    if (!requireBrandId(req, res, prevIw.brand_id)) return;
    const campaign = await updateInstantWinCampaign(req.params.id, req.body);
    if (!campaign) return res.status(404).json({ error: 'Campagna non trovata' });
    res.json(campaign);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete campaign
router.delete('/instant-win/:id', async (req, res) => {
  try {
    const prevIw = await getInstantWinCampaign(req.params.id);
    if (!prevIw) return res.status(404).json({ error: 'Campagna non trovata' });
    if (!requireBrandId(req, res, prevIw.brand_id)) return;
    await deleteInstantWinCampaign(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List plays for a campaign
router.get('/instant-win/:id/plays', async (req, res) => {
  try {
    const prevIw = await getInstantWinCampaign(req.params.id);
    if (!prevIw) return res.status(404).json({ error: 'Campagna non trovata' });
    if (!requireBrandId(req, res, prevIw.brand_id)) return;
    const plays = await listInstantWinPlays(req.params.id);
    res.json(plays);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Play endpoint (public, no auth) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
// Called from the game page when user plays
router.post('/play/:serial_number', async (req, res) => {
  try {
    const { serial_number } = req.params;
    const { campaign_id, player_email, player_phone, player_first_name, player_last_name, privacy_accepted } = req.body;

    // Validate player data (required before playing)
    if (!player_email || !player_first_name || !player_last_name) {
      return res.status(400).json({ error: 'Compila tutti i campi obbligatori (nome, cognome, email)' });
    }

    // Find the pass by serial
    const pass = await getPassBySerial(serial_number);
    if (!pass) return res.status(404).json({ error: 'Pass non trovato' });

    // Get campaign
    const campaign = await getInstantWinCampaign(campaign_id);
    if (!campaign) return res.status(404).json({ error: 'Campagna non trovata' });
    if (campaign.status !== 'active') return res.status(400).json({ error: 'Campagna non attiva' });
    if (campaign.brand_id !== pass.brand_id) return res.status(403).json({ error: 'Brand mismatch' });

    // Check date range
    const now = new Date();
    if (campaign.start_date && new Date(campaign.start_date) > now)
      return res.status(400).json({ error: 'Campagna non ancora iniziata' });
    if (campaign.end_date && new Date(campaign.end_date) < now)
      return res.status(400).json({ error: 'Campagna terminata' });

    // Check max plays per user
    const playCount = await countPlaysForUser(campaign_id, serial_number);
    if (campaign.max_plays_per_user && playCount >= campaign.max_plays_per_user)
      return res.status(400).json({ error: 'Hai giÃÂÃÂÃÂÃÂ  giocato il massimo numero di volte', already_played: true });

    // Check budget
    if (campaign.total_budget && campaign.total_wins >= campaign.total_budget)
      return res.status(400).json({ error: 'Premi esauriti', budget_exhausted: true });

    // Determine result
    const rand = Math.random();
    const isWin = rand < parseFloat(campaign.win_probability);
    // If budget would be exceeded, force lose
    const result = (isWin && (!campaign.total_budget || campaign.total_wins < campaign.total_budget))
      ? 'win' : 'lose';

    const play = await createInstantWinPlay({
      campaign_id,
      serial_number,
      brand_id: pass.brand_id,
      result,
      prize_name: result === 'win' ? campaign.prize_name : null,
      player_email: player_email || null,
      player_phone: player_phone || null,
      player_first_name: player_first_name || null,
      player_last_name: player_last_name || null,
      privacy_accepted: privacy_accepted || false
    });

    // Log event
    await logEvent({
      pass_id: pass.id,
      brand_id: pass.brand_id,
      event_type: `instant_win_${result}`,
      metadata: { campaign_id, game_type: campaign.game_type, prize_name: play.prize_name }
    });

    res.json({
      result,
      prize_name: result === 'win' ? campaign.prize_name : null,
      prize_description: result === 'win' ? campaign.prize_description : null,
      play_id: play.id
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Remove Instant Win from pass (resets brand config) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
router.post('/instant-win/:id/deactivate', async (req, res) => {
  try {
    const campaign = await getInstantWinCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campagna non trovata' });
    if (!requireBrandId(req, res, campaign.brand_id)) return;
    // Remove instantWinActive from brand config
    const brand = await getBrand(campaign.brand_id);
    if (brand) {
      const config = brand.config || {};
      delete config.instantWinActive;
      delete config.stripOverride;
      await updateBrand(campaign.brand_id, { config });
    }
    // Set campaign status to ended
    await updateInstantWinCampaign(req.params.id, { status: 'ended' });
    res.json({ ok: true, message: 'Campagna disattivata e link rimosso dal pass' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Game page info (public, no auth) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
// Returns campaign info for the game page to render
router.get('/play/:serial_number/info', async (req, res) => {
  try {
    const { serial_number } = req.params;
    const pass = await getPassBySerial(serial_number);
    if (!pass) return res.status(404).json({ error: 'Pass non trovato' });

    const brand = await getBrand(pass.brand_id);

    // Find active campaign for this brand
    const campaigns = await listInstantWinCampaigns(pass.brand_id);
    const activeCampaign = campaigns.find(c => c.status === 'active');
    if (!activeCampaign) return res.status(404).json({ error: 'Nessuna campagna attiva' });

    // Check if user already played
    const playCount = await countPlaysForUser(activeCampaign.id, serial_number);
    const canPlay = !activeCampaign.max_plays_per_user || playCount < activeCampaign.max_plays_per_user;

    // Check if this serial already has player data from a previous play
    let registeredPlayer = null;
    const { pool } = require('../db');
    const prevPlay = await pool.query(
      `SELECT player_first_name, player_last_name, player_email, player_phone
       FROM instant_win_plays WHERE serial_number = $1 AND player_email IS NOT NULL
       ORDER BY played_at DESC LIMIT 1`,
      [serial_number]
    );
    if (prevPlay.rows.length > 0) {
      registeredPlayer = prevPlay.rows[0];
    }

    res.json({
      campaign_id: activeCampaign.id,
      game_type: activeCampaign.game_type,
      name: activeCampaign.name,
      prize_name: activeCampaign.prize_name,
      prize_description: activeCampaign.prize_description,
      brand_name: brand?.name || 'Brand',
      brand_colors: brand?.config?.colors || {},
      can_play: canPlay,
      plays_remaining: activeCampaign.max_plays_per_user
        ? Math.max(0, activeCampaign.max_plays_per_user - playCount)
        : null,
      config: activeCampaign.config || {},
      registered_player: registeredPlayer
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Leads Database (aggregated player data)


function isHrBrand(brand, req) {
  if (brandProductLine(brand) === 'hr') return true;
  if (deployProductLineLock() === 'hr') return true;
  if (req) {
    const hdr = String(req.headers['x-dashboard-product-line'] || '').toLowerCase();
    if (hdr === 'hr') return true;
  }
  return false;
}

router.get('/brands/:brand_id/employees', async (req, res) => {
  try {
    const { brand_id } = req.params;
    if (!requireBrandId(req, res, brand_id)) return;
    const brand = await getBrand(brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    if (!isHrBrand(brand, req)) {
      return res.status(400).json({ error: 'Endpoint dipendenti disponibile solo per brand HR' });
    }

    const employees = await listEmployeesForBrand(brand_id);
    const withPass = employees.filter((e) => e.pass_id).length;
    const withDevice = employees.filter((e) => e.device_id).length;
    const withEmail = employees.filter((e) => e.email).length;
    const withMatricola = employees.filter((e) => e.employee_id).length;

    res.json({
      employees,
      total_employees: employees.length,
      with_pass: withPass,
      with_device: withDevice,
      with_email: withEmail,
      with_employee_id: withMatricola
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brands/:brand_id/employee-field-options', async (req, res) => {
  try {
    const { brand_id } = req.params;
    if (!requireBrandId(req, res, brand_id)) return;
    const brand = await getBrand(brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    if (!isHrBrand(brand, req)) {
      return res.status(400).json({ error: 'Endpoint disponibile solo per brand HR' });
    }
    const opts = await getEmployeeFieldOptionsForBrand(brand_id);
    res.json(opts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brands/:brand_id/employees/check-matricola', async (req, res) => {
  try {
    const { brand_id } = req.params;
    const value = String(req.query.value || '').trim();
    if (!requireBrandId(req, res, brand_id)) return;
    const brand = await getBrand(brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    if (!isHrBrand(brand, req)) {
      return res.status(400).json({ error: 'Endpoint disponibile solo per brand HR' });
    }
    if (!value) return res.json({ available: true });
    const available = await isEmployeeMatricolaAvailable(brand_id, value);
    res.json({ available });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/brands/:brand_id/employees', async (req, res) => {
  try {
    const { brand_id } = req.params;
    if (!requireBrandId(req, res, brand_id)) return;
    if (!requireWriteAccess(req, res)) return;
    const brand = await getBrand(brand_id);
    if (!brand || !isHrBrand(brand, req)) {
      return res.status(400).json({ error: 'Aggiunta dipendenti disponibile solo per brand HR' });
    }

    const {
      employees: employeesBody,
      create_passes = false,
      template_id,
      send_activation = false,
      update_existing = false
    } = req.body || {};

    let list = [];
    if (Array.isArray(employeesBody) && employeesBody.length) {
      list = employeesBody;
    } else if (req.body && (req.body.employee_id || req.body.matricola)) {
      list = [req.body];
    }
    if (!list.length) {
      return res.status(400).json({ error: 'Fornisci almeno un dipendente' });
    }

    const {
      normalizeManualEmployee,
      validateImportRow,
      rowDisplayName
    } = require('../engine/member-import');

    const seen = new Set();
    const employees = [];
    const errors = [];

    for (let i = 0; i < list.length; i++) {
      const emp = normalizeManualEmployee(list[i]);
      const existing = await findMemberByBrandKey(brand_id, { employee_id: emp.employee_id });
      const v = validateImportRow(emp, {
        seenInFile: seen,
        existingEmployeeId: !update_existing && !!existing
      });
      if (!v.valid) {
        errors.push({ index: i + 1, name: rowDisplayName(emp), reason: v.reason });
        continue;
      }
      employees.push(emp);
    }

    if (!employees.length) {
      return res.status(400).json({ error: 'Nessun dipendente valido', errors });
    }

    if (create_passes) {
      if (!template_id) {
        return res.status(400).json({ error: 'template_id richiesto per creare i pass' });
      }
      const template = await getTemplate(template_id);
      if (!template || String(template.brand_id) !== String(brand_id)) {
        return res.status(400).json({ error: 'Template non valido per questo brand' });
      }
    }

    const summary = await importEmployeesBatch(brand_id, employees, {
      template_id,
      create_passes: !!create_passes,
      update_existing: !!update_existing,
      skip_invalid: true
    });

    let activation_sent = 0;
    if (send_activation && summary.created_member_ids?.length) {
      const { distributeActivationEmails } = require('../engine/hr-activation');
      const act = await distributeActivationEmails(hrActivationDb(), brand_id, summary.created_member_ids);
      activation_sent = act.sent || 0;
    }

    const imported = (summary.created || 0) + (summary.updated || 0);
    res.json({
      success: true,
      imported,
      created: summary.created,
      updated: summary.updated,
      passes_created: summary.passes_created,
      activation_sent,
      errors: [...errors, ...(summary.errors || [])]
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/brands/:brand_id/employees/import/preview', async (req, res) => {
  try {
    const { brand_id } = req.params;
    if (!requireBrandId(req, res, brand_id)) return;
    const brand = await getBrand(brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    const { file_base64, filename, csv_text, mapping } = req.body || {};
    if (!file_base64 && !csv_text) {
      return res.status(400).json({ error: 'Carica un file CSV/Excel o incolla testo CSV' });
    }

    const { previewImport } = require('../engine/member-import');
    const preview = await previewImport({ file_base64, filename, csv_text, mapping });
    res.json(preview);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/brands/:brand_id/employees/import', async (req, res) => {
  try {
    const { brand_id } = req.params;
    if (!requireBrandId(req, res, brand_id)) return;
    const brand = await getBrand(brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    const {
      file_base64,
      filename,
      csv_text,
      mapping,
      employees: employeesBody,
      template_id,
      create_passes = true,
      update_existing = false
    } = req.body || {};

    const {
      parseImportFile,
      evaluateImportRows,
      newImportBatchId
    } = require('../engine/member-import');

    let employees = Array.isArray(employeesBody) ? employeesBody : null;
    let rejected = [];
    const batch_id = newImportBatchId();

    if (!employees) {
      if (!file_base64 && !csv_text) {
        return res.status(400).json({ error: 'Carica un file CSV/Excel o incolla testo CSV' });
      }
      const { headers, rows } = await parseImportFile({ file_base64, filename, csv_text });
      const evaluated = await evaluateImportRows({
        headers,
        rows,
        mapping,
        allowExisting: !!update_existing,
        checkExisting: async (employee_id) => findMemberByBrandKey(brand_id, { employee_id })
      });
      employees = evaluated.employees;
      rejected = evaluated.rejected;
    }

    for (const row of rejected) {
      await createImportError({
        brand_id,
        import_batch_id: batch_id,
        row_number: row.row,
        row_data: { raw: row.raw, mapped: row.mapped, name: row.name },
        error_reason: row.reason
      });
    }

    if (!employees.length && !rejected.length) {
      return res.status(400).json({ error: 'File vuoto o senza righe dati' });
    }

    if (create_passes && employees.length) {
      if (!template_id) {
        return res.status(400).json({ error: 'template_id richiesto per creare i pass' });
      }
      const template = await getTemplate(template_id);
      if (!template || String(template.brand_id) !== String(brand_id)) {
        return res.status(400).json({ error: 'Template non valido per questo brand' });
      }
    }

    const summary = employees.length
      ? await importEmployeesBatch(brand_id, employees, {
        template_id,
        create_passes: !!create_passes,
        update_existing: !!update_existing,
        skip_invalid: true
      })
      : { created: 0, updated: 0, skipped: 0, passes_created: 0, errors: [] };

    const imported = (summary.created || 0) + (summary.updated || 0);
    res.json({
      success: true,
      imported,
      rejected: rejected.length,
      batch_id,
      errors: rejected.map((r) => ({ row: r.row, name: r.name, reason: r.reason })),
      created: summary.created,
      updated: summary.updated,
      passes_created: summary.passes_created,
      skipped: summary.skipped
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brands/:brand_id/employees/import/errors', async (req, res) => {
  try {
    const { brand_id } = req.params;
    const { import_batch_id } = req.query;
    if (!requireBrandId(req, res, brand_id)) return;
    if (!import_batch_id) {
      return res.status(400).json({ error: 'import_batch_id richiesto' });
    }
    const rows = await listImportErrors(brand_id, { import_batch_id });
    res.json({ import_batch_id, errors: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/brands/:brand_id/members/:member_id', async (req, res) => {
  try {
    const { brand_id, member_id } = req.params;
    if (!requireBrandId(req, res, brand_id)) return;
    const brand = await getBrand(brand_id);
    if (!brand || !isHrBrand(brand, req)) {
      return res.status(400).json({ error: 'Aggiornamento dipendente disponibile solo per brand HR' });
    }

    const existing = await pool.query(
      'SELECT * FROM members WHERE id = $1 AND brand_id = $2',
      [member_id, brand_id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Dipendente non trovato' });

    const member = existing.rows[0];
    const { employee_id, department, office_location, first_name, last_name, email } = req.body || {};

    if (employee_id !== undefined) {
      const trimmed = String(employee_id || '').trim();
      if (!trimmed) return res.status(400).json({ error: 'Matricola obbligatoria' });
      const dup = await findMemberByBrandKey(brand_id, { employee_id: trimmed });
      if (dup && String(dup.id) !== String(member_id)) {
        return res.status(409).json({ error: `Matricola #${trimmed} già assegnata` });
      }
    }

    const updated = await updateMemberRecord(member_id, {
      employee_id,
      department,
      office_location,
      first_name,
      last_name,
      email
    });

    let wallet_push_sent = 0;
    if (updated.pass_id) {
      await touchPass(updated.pass_id);
      const devices = await pool.query(
        `SELECT push_token FROM device_registrations WHERE serial_number = (
          SELECT serial_number FROM pass_instances WHERE id = $1
        ) AND push_token IS NOT NULL AND push_token <> ''`,
        [updated.pass_id]
      );
      if (devices.rows.length) {
        try {
          const batch = await sendPushBatch(devices.rows.map((row) => row.push_token));
          wallet_push_sent = batch.filter((r) => r.success).length;
        } catch (_) {}
      }
    }

    res.json({ member: updated, wallet_push_sent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/brands/:brand_id/members/:member_id', async (req, res) => {
  try {
    if (!requireWriteAccess(req, res)) return;
    const { brand_id, member_id } = req.params;
    if (!requireBrandId(req, res, brand_id)) return;
    const brand = await getBrand(brand_id);
    if (!brand || !isHrBrand(brand, req)) {
      return res.status(400).json({ error: 'Eliminazione dipendente disponibile solo per brand HR' });
    }
    const result = await deleteMemberRecord(brand_id, member_id);
    if (!result) return res.status(404).json({ error: 'Dipendente non trovato' });
    res.json({ success: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brands/:brand_id/activation/stats', async (req, res) => {
  try {
    const { brand_id } = req.params;
    if (!requireBrandId(req, res, brand_id)) return;
    const brand = await getBrand(brand_id);
    if (!brand || !isHrBrand(brand, req)) {
      return res.status(400).json({ error: 'Statistiche attivazione solo per brand HR' });
    }
    const r = await pool.query(
      `SELECT activation_status, COUNT(*)::int AS c
       FROM members WHERE brand_id = $1
       GROUP BY activation_status`,
      [brand_id]
    );
    const counts = { candidate: 0, invited: 0, activated: 0 };
    for (const row of r.rows) {
      const k = row.activation_status || 'candidate';
      counts[k] = (counts[k] || 0) + row.c;
    }
    const joinSlug = brand.public_qr_slug || brand.slug;
    res.json({
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      public_qr_enabled: !!brand.public_qr_enabled,
      public_qr_slug: brand.public_qr_slug,
      allowed_email_domains: brand.allowed_email_domains || [],
      join_url: brand.public_qr_enabled ? joinUrl(joinSlug) : null
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/brands/:brand_id/employees/distribute', async (req, res) => {
  try {
    const { brand_id } = req.params;
    if (!requireBrandId(req, res, brand_id)) return;
    if (!requireWriteAccess(req, res)) return;
    const brand = await getBrand(brand_id);
    if (!brand || !isHrBrand(brand, req)) {
      return res.status(400).json({ error: 'Distribuzione solo per brand HR' });
    }
    const { member_ids, all_pending, resend } = req.body || {};
    let ids = Array.isArray(member_ids) ? member_ids.map(String) : [];
    if (all_pending) {
      const r = await pool.query(
        `SELECT id FROM members
         WHERE brand_id = $1
           AND email IS NOT NULL AND TRIM(email) <> ''
           AND (activation_status IS NULL OR activation_status IN ('candidate', 'invited'))
         ORDER BY created_at`,
        [brand_id]
      );
      ids = r.rows.map((row) => row.id);
    }
    if (!ids.length) return res.status(400).json({ error: 'Nessun dipendente da invitare' });
    const summary = await distributeActivationEmails(hrActivationDb(), brand_id, ids, { resend: !!resend });
    res.json(summary);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/brands/:brand_id/members/:member_id/activation/resend', async (req, res) => {
  try {
    const { brand_id, member_id } = req.params;
    if (!requireBrandId(req, res, brand_id)) return;
    if (!requireWriteAccess(req, res)) return;
    const brand = await getBrand(brand_id);
    if (!brand || !isHrBrand(brand, req)) {
      return res.status(400).json({ error: 'Solo brand HR' });
    }
    const r = await pool.query(
      'SELECT * FROM members WHERE id = $1 AND brand_id = $2',
      [member_id, brand_id]
    );
    const member = r.rows[0];
    if (!member) return res.status(404).json({ error: 'Dipendente non trovato' });
    if (!member.email) return res.status(400).json({ error: 'Email mancante' });
    const { url, kind } = await resendMemberActivationEmail(hrActivationDb(), member, brand);
    res.json({ success: true, activation_url: url, kind });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/brands/:brand_id/leads', async (req, res) => {
  try {
    const { brand_id } = req.params;
    if (!requireBrandId(req, res, brand_id)) return;
    const brand = await getBrand(brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    if (isHrBrand(brand, req)) {
      const employees = await listEmployeesForBrand(brand_id);
      const leads = employees.map((m) => ({
        id: m.id,
        player_first_name: m.first_name,
        player_last_name: m.last_name,
        player_email: m.email,
        player_phone: null,
        employee_id: m.employee_id,
        department: m.department,
        office_location: m.office_location,
        pass_id: m.pass_id,
        serial_number: m.serial_number,
        device_id: m.device_id,
        registered_at: m.created_at,
        pass_status: m.pass_status,
        device_source: m.device_source,
        google_wallet_object_id: m.google_wallet_object_id,
        google_wallet_saved: m.google_wallet_saved,
        google_installed_at: m.google_installed_at,
        google_update_count: m.google_update_count,
        google_last_update_at: m.google_last_update_at,
        google_last_update_status: m.google_last_update_status,
        samsung_wallet_ref_id: m.samsung_wallet_ref_id,
        samsung_wallet_saved: m.samsung_wallet_saved,
        samsung_installed_at: m.samsung_installed_at,
        activation_status: m.activation_status || 'candidate',
        invited_at: m.invited_at,
        activated_at: m.activated_at
      }));
      return res.json({
        leads,
        hr: true,
        total_leads: leads.length,
        with_device: leads.filter((l) => l.device_id || l.google_installed_at || l.google_wallet_saved || Number(l.google_update_count || 0) > 0 || l.samsung_installed_at || l.samsung_wallet_saved).length,
        with_phone: 0,
        with_email: leads.filter((l) => l.player_email).length,
        with_employee_id: leads.filter((l) => l.employee_id).length
      });
    }

    const { pool } = require('../db');

    // Get unique leads by serial_number with their latest player data,
    // joined with pass_instances for pass_id and device_registrations for device_id
    const result = await pool.query(`
      SELECT
        p.serial_number,
        p.player_first_name,
        p.player_last_name,
        p.player_email,
        p.player_phone,
        p.registered_at,
        pi.id AS pass_id,
        dr.device_library_id AS device_id
      FROM (
        SELECT
          serial_number,
          MAX(player_first_name) AS player_first_name,
          MAX(player_last_name) AS player_last_name,
          MAX(player_email) AS player_email,
          MAX(player_phone) AS player_phone,
          MIN(played_at) AS registered_at
        FROM instant_win_plays
        WHERE brand_id = $1 AND player_email IS NOT NULL
        GROUP BY serial_number
      ) p
      LEFT JOIN pass_instances pi ON pi.serial_number = p.serial_number
      LEFT JOIN device_registrations dr ON dr.serial_number = p.serial_number
      ORDER BY p.registered_at DESC
    `, [brand_id]);

    const iwLeads = result.rows;
    const memberRows = await pool.query(`
      SELECT
        m.id AS member_id,
        m.first_name,
        m.last_name,
        m.email,
        m.phone,
        m.created_at,
        pi.id AS pass_id,
        pi.serial_number,
        pi.field_values,
        dr.device_library_id AS device_id
      FROM members m
      LEFT JOIN pass_instances pi ON pi.id = COALESCE(
        NULLIF(TRIM(m.pass_id), ''),
        (SELECT pi2.id FROM pass_instances pi2 WHERE pi2.member_id = m.id LIMIT 1)
      )
      LEFT JOIN device_registrations dr ON dr.serial_number = pi.serial_number
      WHERE m.brand_id = $1
        AND (m.employee_id IS NULL OR TRIM(m.employee_id) = '')
      ORDER BY m.created_at DESC
    `, [brand_id]);

    const seenSerials = new Set(iwLeads.map((l) => l.serial_number).filter(Boolean));
    const seenMemberIds = new Set();
    const manualLeads = [];
    for (const row of memberRows.rows) {
      if (seenMemberIds.has(row.member_id)) continue;
      seenMemberIds.add(row.member_id);
      const serial = row.serial_number || `member:${row.member_id}`;
      if (row.serial_number && seenSerials.has(row.serial_number)) continue;
      seenSerials.add(serial);
      const fv = row.field_values && typeof row.field_values === 'object' ? row.field_values : {};
      manualLeads.push({
        id: row.member_id,
        member_id: row.member_id,
        serial_number: serial,
        player_first_name: row.first_name,
        player_last_name: row.last_name,
        player_email: row.email,
        player_phone: row.phone || fv.phone || fv.telefono || fv.Phone || null,
        registered_at: row.created_at,
        pass_id: row.pass_id,
        device_id: row.device_id,
        source: 'manual'
      });
    }

    const leads = [...iwLeads, ...manualLeads].sort((a, b) => {
      const ta = a.registered_at ? new Date(a.registered_at).getTime() : 0;
      const tb = b.registered_at ? new Date(b.registered_at).getTime() : 0;
      return tb - ta;
    });
    const withDevice = leads.filter(l => l.device_id).length;
    const withPhone = leads.filter(l => l.player_phone).length;
    const withEmail = leads.filter(l => l.player_email).length;

    res.json({
      leads,
      total_leads: leads.length,
      with_device: withDevice,
      with_phone: withPhone,
      with_email: withEmail
    });
  } catch (err) {
    console.error('[GET /brands/:brand_id/leads]', req.params.brand_id, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/brands/:brand_id/leads', async (req, res) => {
  try {
    const { brand_id } = req.params;
    if (!requireBrandId(req, res, brand_id)) return;
    const brand = await getBrand(brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });
    if (isHrBrand(brand, req)) {
      return res.status(400).json({ error: 'Per i brand HR usa Importa CSV o Aggiungi dipendente.' });
    }

    const body = req.body || {};
    const firstName = String(body.firstName || body.first_name || '').trim();
    const lastName = String(body.lastName || body.last_name || '').trim();
    const email = body.email != null ? String(body.email).trim() : '';
    const phone = body.phone != null ? String(body.phone).trim() : '';
    const consent = body.consent === true || body.consent === 'true' || body.consent === 1;
    const source = String(body.source || 'manual').trim() || 'manual';
    const createPass = body.create_pass === true || body.createPass === true;
    const templateId = body.template_id || body.templateId || null;

    if (!consent) return res.status(400).json({ error: 'Consenso privacy richiesto' });
    if (!email && !phone) return res.status(400).json({ error: 'Inserisci almeno email o telefono' });

    if (email) {
      const dup = await findMemberByBrandKey(brand_id, { email });
      if (dup && (!dup.employee_id || !String(dup.employee_id).trim())) {
        return res.status(409).json({ error: 'Esiste già un contatto con questa email' });
      }
    }

    const member = await createMemberRecord({
      brand_id,
      first_name: firstName || null,
      last_name: lastName || null,
      email: email || null,
      phone: phone || null,
      lead_source: source
    });

    let passInstance = null;
    if (createPass && templateId) {
      const field_values = {
        email,
        phone,
        telefono: phone,
        firstName,
        lastName,
        first_name: firstName,
        last_name: lastName,
        nome: firstName,
        cognome: lastName
      };
      passInstance = await createPassInstance({
        brand_id,
        template_id: templateId,
        field_values
      });
      await updateMemberRecord(member.id, { pass_id: passInstance.id });
      await updatePassInstance(passInstance.id, { member_id: member.id });
      await logEvent({
        pass_id: passInstance.id,
        brand_id,
        event_type: 'pass_created',
        metadata: { source: 'contacts_manual' }
      });
    }

    await logEvent({
      brand_id,
      event_type: 'contact_created',
      metadata: { member_id: member.id, source }
    });

    const lead = {
      id: member.id,
      member_id: member.id,
      serial_number: passInstance?.serial_number || `member:${member.id}`,
      player_first_name: member.first_name,
      player_last_name: member.last_name,
      player_email: member.email,
      player_phone: member.phone,
      registered_at: member.created_at,
      pass_id: passInstance?.id || member.pass_id,
      device_id: null,
      source
    };

    res.status(201).json({ lead, member, pass: passInstance });
  } catch (err) {
    console.error('[POST /brands/:brand_id/leads]', req.params.brand_id, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Gamification Campaigns CRUD ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

router.get('/gamification/campaigns/:brand_id', async (req, res) => {
  try {
    if (!requireBrandId(req, res, req.params.brand_id)) return;
    const campaigns = await listGamificationCampaigns(req.params.brand_id);
    res.json(campaigns);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/gamification/campaign/:id', async (req, res) => {
  try {
    const campaign = await getGamificationCampaign(req.params.id);
    if (!campaign) return res.status(404).json({ error: 'Campagna non trovata' });
    if (!requireBrandId(req, res, campaign.brand_id)) return;
    res.json(campaign);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/gamification/campaigns', async (req, res) => {
  try {
    if (!requireBrandId(req, res, req.body.brand_id)) return;
    const campaign = await createGamificationCampaign(req.body);
    res.status(201).json(campaign);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/gamification/campaign/:id', async (req, res) => {
  try {
    const prevGm = await getGamificationCampaign(req.params.id);
    if (!prevGm) return res.status(404).json({ error: 'Campagna non trovata' });
    if (!requireBrandId(req, res, prevGm.brand_id)) return;
    const campaign = await updateGamificationCampaign(req.params.id, req.body);
    if (!campaign) return res.status(404).json({ error: 'Campagna non trovata' });
    res.json(campaign);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/gamification/campaign/:id', async (req, res) => {
  try {
    const prevGm = await getGamificationCampaign(req.params.id);
    if (!prevGm) return res.status(404).json({ error: 'Campagna non trovata' });
    if (!requireBrandId(req, res, prevGm.brand_id)) return;
    await deleteGamificationCampaign(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/gamification/stats/:brand_id', async (req, res) => {
  try {
    if (!requireBrandId(req, res, req.params.brand_id)) return;
    const stats = await getGamificationStats(req.params.brand_id);
    res.json(stats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/gamification/plays/:campaign_id', async (req, res) => {
  try {
    const gm = await getGamificationCampaign(req.params.campaign_id);
    if (!gm) return res.status(404).json({ error: 'Campagna non trovata' });
    if (!requireBrandId(req, res, gm.brand_id)) return;
    const plays = await listGamificationPlays(req.params.campaign_id, {
      limit: parseInt(req.query.limit) || 100
    });
    res.json(plays);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Gamification Game Info (public, no auth) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

router.get('/game/:serial_number/info', async (req, res) => {
  try {
    const { serial_number } = req.params;
    const pass = await getPassBySerial(serial_number);
    if (!pass) return res.status(404).json({ error: 'Pass non trovato' });

    const brand = await getBrand(pass.brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    // Find active gamification campaign for this brand
    const allCampaigns = await listGamificationCampaigns(pass.brand_id);
    const activeCampaign = allCampaigns.find(c => c.status === 'active');

    // Check if player already registered (from gamification or instant win plays)
    let registeredPlayer = null;
    const prevPlay = await pool.query(
      `SELECT player_first_name, player_last_name, player_email, player_phone
       FROM gamification_plays WHERE serial_number = $1 AND player_email IS NOT NULL
       ORDER BY played_at DESC LIMIT 1`,
      [serial_number]
    );
    if (prevPlay.rows.length > 0) {
      registeredPlayer = prevPlay.rows[0];
    } else {
      // Fallback: check instant_win_plays too
      const iwPlay = await pool.query(
        `SELECT player_first_name, player_last_name, player_email, player_phone
         FROM instant_win_plays WHERE serial_number = $1 AND player_email IS NOT NULL
         ORDER BY played_at DESC LIMIT 1`,
        [serial_number]
      );
      if (iwPlay.rows.length > 0) registeredPlayer = iwPlay.rows[0];
    }

    res.json({
      brand: { id: brand.id, name: brand.name, slug: brand.slug, config: brand.config },
      campaign: activeCampaign || null,
      serial_number,
      registered_player: registeredPlayer
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Gamification Play endpoint (public, no auth) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

router.post('/game/:serial_number', async (req, res) => {
  try {
    const { serial_number } = req.params;
    const { campaign_id, completion_time_secs, score,
      player_email, player_phone, player_first_name, player_last_name, privacy_accepted } = req.body;

    const pass = await getPassBySerial(serial_number);
    if (!pass) return res.status(404).json({ error: 'Pass non trovato' });

    const campaign = await getGamificationCampaign(campaign_id);
    if (!campaign) return res.status(404).json({ error: 'Campagna non trovata' });
    if (campaign.status !== 'active') return res.status(400).json({ error: 'Campagna non attiva' });
    if (campaign.brand_id !== pass.brand_id) return res.status(403).json({ error: 'Brand mismatch' });

    // Check date range
    const now = new Date();
    if (campaign.start_date && new Date(campaign.start_date) > now)
      return res.status(400).json({ error: 'Campagna non ancora iniziata' });
    if (campaign.end_date && new Date(campaign.end_date) < now)
      return res.status(400).json({ error: 'Campagna terminata' });

    // Check max plays per user
    const playCount = await countGamificationPlaysForUser(campaign_id, serial_number);
    if (campaign.max_plays_per_user && playCount >= campaign.max_plays_per_user)
      return res.status(400).json({ error: 'Hai giÃÂÃÂÃÂÃÂ  giocato il massimo numero di volte', already_played: true });

    // Determine tier based on completion time
    const timeSecs = parseFloat(completion_time_secs);
    let tier = 'none';
    let prizeName = null;
    if (timeSecs <= parseFloat(campaign.gold_threshold_secs)) {
      tier = 'gold';
      prizeName = campaign.gold_prize;
    } else if (timeSecs <= parseFloat(campaign.silver_threshold_secs)) {
      tier = 'silver';
      prizeName = campaign.silver_prize;
    } else if (timeSecs <= parseFloat(campaign.bronze_threshold_secs)) {
      tier = 'bronze';
      prizeName = campaign.bronze_prize;
    }

    const play = await createGamificationPlay({
      campaign_id,
      serial_number,
      brand_id: pass.brand_id,
      completion_time_secs: timeSecs,
      tier,
      prize_name: prizeName,
      score: score || 0,
      player_email: player_email || null,
      player_phone: player_phone || null,
      player_first_name: player_first_name || null,
      player_last_name: player_last_name || null,
      privacy_accepted: privacy_accepted || false
    });

    // Log event
    await logEvent({
      pass_id: pass.id,
      brand_id: pass.brand_id,
      event_type: `gamification_${tier}`,
      metadata: { campaign_id, game_type: campaign.game_type, completion_time_secs: timeSecs, tier, prize_name: prizeName }
    });

    res.json({
      result: tier !== 'none' ? 'win' : 'lose',
      tier,
      prize_name: prizeName,
      completion_time_secs: timeSecs,
      play_id: play.id
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ Google Wallet ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ

function samsungInboundHeadersOk(req, method) {
  const rid = req.get('x-request-id');
  if (!rid || String(rid).trim().length < 8) {
    console.warn('[SamsungWallet]', method, req.path, 'missing or short x-request-id');
    return false;
  }
  return samsungWallet.verifyInboundAuth(req.get('authorization'), method, req.path);
}

const GOOGLE_WALLET_SYSTEM_X509_URL =
  'https://www.googleapis.com/service_accounts/v1/metadata/x509/walletobjects@system.gserviceaccount.com';
let googleWalletCertCache = { fetchedAt: 0, certs: {} };

async function getGoogleWalletSystemCerts(force = false) {
  const now = Date.now();
  if (!force && now - googleWalletCertCache.fetchedAt < 15 * 60 * 1000 && googleWalletCertCache.certs) {
    return googleWalletCertCache.certs;
  }
  const resp = await fetch(GOOGLE_WALLET_SYSTEM_X509_URL);
  if (!resp.ok) throw new Error(`Google cert fetch failed: ${resp.status}`);
  const certs = await resp.json();
  googleWalletCertCache = { fetchedAt: now, certs: certs || {} };
  return googleWalletCertCache.certs;
}

async function verifyGoogleSignedMessage(signedMessage) {
  if (!signedMessage || typeof signedMessage !== 'string') return null;
  const decoded = jwt.decode(signedMessage, { complete: true });
  const kid = decoded && decoded.header ? decoded.header.kid : null;
  if (!kid) throw new Error('Google signedMessage missing kid');
  let certs = await getGoogleWalletSystemCerts(false);
  let pem = certs[kid];
  if (!pem) {
    certs = await getGoogleWalletSystemCerts(true);
    pem = certs[kid];
  }
  if (!pem) throw new Error(`Google cert not found for kid ${kid}`);
  return jwt.verify(signedMessage, pem, { algorithms: ['RS256'] });
}

router.get('/samsung-wallet/status', (req, res) => {
  res.json(samsungWallet.getStatusInfo());
});

router.get('/samsung-wallet/pass/:id', async (req, res) => {
  try {
    if (!samsungWallet.isConfigured()) {
      return res.status(501).json({ error: 'Samsung Wallet not configured' });
    }
    const instance = await getPassInstance(req.params.id);
    if (!instance) return res.status(404).json({ error: 'Pass not found' });

    let refId = instance.samsung_wallet_ref_id;
    if (!refId) {
      refId = samsungWallet.refIdForPass(instance.id);
      await updatePassInstance(instance.id, {
        samsung_wallet_ref_id: refId,
        samsung_wallet_saved: false,
        samsung_installed_at: null
      });
    }

    const save_link = samsungWallet.generateDataFetchLink(refId);

    await logEvent({
      brand_id: instance.brand_id,
      pass_id: instance.id,
      event_type: 'samsung_wallet_link_generated',
      metadata: { refId }
    });

    res.json({ save_link, ref_id: refId });
  } catch (err) {
    console.error('[SamsungWallet] pass link error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/samsung-wallet/cards/:cardId/:refId', async (req, res) => {
  try {
    if (!samsungWallet.isConfigured()) {
      return res.status(503).json({ error: 'Samsung Wallet not configured' });
    }

    const { cardId, refId } = req.params;
    if (cardId !== samsungWallet.CARD_ID) {
      return res.status(204).send();
    }

    if (!samsungInboundHeadersOk(req, 'GET')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pass = await getPassBySamsungRefId(refId);
    if (!pass) {
      return res.status(204).send();
    }

    const template = await getTemplate(pass.template_id);
    const brand = await getBrand(pass.brand_id);
    if (!brand || !template) {
      return res.status(204).send();
    }

    const state = pass.samsung_wallet_saved ? 'ACTIVE' : 'PENDING';
    const body = samsungWallet.buildLoyaltyCardResponse(brand, template, pass, refId, state);

    console.log('[SamsungWallet] GET card data', String(refId).slice(0, 8));
    res.json(body);
  } catch (err) {
    console.error('[SamsungWallet] GET cards error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/samsung-wallet/cards/:cardId/:refId/requestAction', async (req, res) => {
  try {
    if (!samsungWallet.isConfigured()) {
      return res.status(503).json({ error: 'Samsung Wallet not configured' });
    }

    const { cardId, refId } = req.params;
    if (cardId !== samsungWallet.CARD_ID) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!samsungInboundHeadersOk(req, 'POST')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pass = await getPassBySamsungRefId(refId);
    if (!pass) {
      return res.status(204).send();
    }

    await logEvent({
      pass_id: pass.id,
      brand_id: pass.brand_id,
      event_type: 'samsung_wallet_request_action',
      metadata: { refId, body: req.body || null }
    });

    res.status(200).send('OK');
  } catch (err) {
    console.error('[SamsungWallet] POST requestAction error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/samsung-wallet/cards/:cardId/:refId', async (req, res) => {
  try {
    if (!samsungWallet.isConfigured()) {
      return res.status(503).json({ error: 'Samsung Wallet not configured' });
    }

    const { cardId, refId } = req.params;
    if (cardId !== samsungWallet.CARD_ID) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!samsungInboundHeadersOk(req, 'POST')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const cc2 = String(req.query.cc2 || '').trim();
    const eventRaw = String(req.query.event || '').trim().toUpperCase();
    if (!cc2 || cc2.length !== 2 || !eventRaw) {
      return res.status(400).json({ error: 'cc2 e event sono richiesti (query)' });
    }

    const passBefore = await getPassBySamsungRefId(refId);
    if (!passBefore) {
      return res.status(204).send();
    }

    const deleted = eventRaw === 'DELETED';
    const installed =
      eventRaw === 'ADDED' || eventRaw === 'PROVISIONED' || eventRaw === 'UPDATED';

    let passRow = passBefore;
    if (deleted) {
      passRow = await updateSamsungWalletStatus(refId, false);
    } else if (installed) {
      passRow = await updateSamsungWalletStatus(refId, true, cc2);
    }

    if (passRow) {
      const ev = deleted ? 'samsung_wallet_removed' : 'samsung_wallet_installed';
      await logEvent({
        pass_id: passRow.id,
        brand_id: passRow.brand_id,
        event_type: ev,
        metadata: { refId, cc2, event: eventRaw, callback: req.body?.callback || null }
      });
      if (!deleted && (eventRaw === 'ADDED' || eventRaw === 'PROVISIONED')) {
        await updatePassDeviceId(passRow.serial_number, refId, 'samsung');
      }
    }

    console.log('[SamsungWallet] POST card state', String(refId).slice(0, 8), cc2, eventRaw);
    res.status(200).send('OK');
  } catch (err) {
    console.error('[SamsungWallet] POST cards error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/v1/google-wallet/pass/:id - Get "Add to Google Wallet" link
 */
router.get('/google-wallet/pass/:id', async (req, res) => {
  try {
    if (!googleWallet.isConfigured()) {
      return res.status(501).json({ error: 'Google Wallet not configured', code: 'not_configured' });
    }

    const instance = await getPassInstance(req.params.id);
    if (!instance) return res.status(404).json({ error: 'Pass not found' });

    const template = await getTemplate(instance.template_id);
    const brand = await getBrand(instance.brand_id);
    if (!template || !brand) {
      return res.status(404).json({ error: 'Template o brand non trovato' });
    }

    const passObject = await googleWallet.buildPassObject(brand, template, instance, instance.customer_data);
    const serverObject = await googleWallet.ensurePassReadyOnServer(brand, template, passObject);
    const clearMessages = await googleWallet.clearPassMessages(passObject.id, brand);
    const hasUsers = serverObject?.hasUsers === true || serverObject?.hasUsers === 'true';
    await updatePassInstance(instance.id, {
      google_wallet_object_id: passObject.id,
      ...(instance.google_wallet_object_id && instance.google_wallet_object_id !== passObject.id
        ? { google_wallet_saved: false, google_installed_at: null }
        : {})
    });
    if (hasUsers) {
      const savedPass = await updateGoogleWalletStatus(passObject.id, true);
      await updatePassDeviceId(savedPass?.serial_number || instance.serial_number, passObject.id, 'google');
      await logEvent({
        brand_id: instance.brand_id,
        pass_id: instance.id,
        event_type: 'google_wallet_installed_verified',
        metadata: { object_id: passObject.id, source: 'link_generation_hasUsers' }
      });
    }

    const saveLink = googleWallet.generateSaveLink(brand, template, passObject);

    await logEvent({
      brand_id: instance.brand_id,
      pass_id: instance.id,
      event_type: 'google_wallet_link_generated',
      metadata: { messages_cleared: clearMessages?.ok === true, clear_messages_error: clearMessages?.error || null }
    });

    res.json({ save_link: saveLink, messages_cleared: clearMessages?.ok === true });
  } catch (err) {
    console.error('[GoogleWallet] Error:', err);
    const mapped = googleWallet.formatGoogleWalletError(err);
    res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
  }
});

/**
 * POST /api/v1/google-wallet/pass/:id/refresh-status
 * Verifica lato Google se l'object risulta associato ad almeno un utente (hasUsers).
 */
router.post('/google-wallet/pass/:id/refresh-status', async (req, res) => {
  try {
    if (!googleWallet.isConfigured()) {
      return res.status(501).json({ error: 'Google Wallet not configured', code: 'not_configured' });
    }

    const instance = await getPassInstance(req.params.id);
    if (!instance) return res.status(404).json({ error: 'Pass not found' });
    if (!requireBrandId(req, res, instance.brand_id)) return;
    if (!instance.google_wallet_object_id) {
      return res.status(409).json({
        error: 'Oggetto Google Wallet non ancora creato. Genera prima il link Google Wallet.',
        code: 'missing_object'
      });
    }

    const brand = await getBrand(instance.brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    const object = await googleWallet.getPassObjectById(instance.google_wallet_object_id, brand);
    const hasUsers = object?.hasUsers === true || object?.hasUsers === 'true';
    let pass = instance;
    if (hasUsers) {
      pass = await updateGoogleWalletStatus(instance.google_wallet_object_id, true) || instance;
      await updatePassDeviceId(pass.serial_number || instance.serial_number, instance.google_wallet_object_id, 'google');
      await logEvent({
        brand_id: instance.brand_id,
        pass_id: instance.id,
        event_type: 'google_wallet_installed_verified',
        metadata: { object_id: instance.google_wallet_object_id, source: 'hasUsers' }
      });
    }

    res.json({
      success: true,
      saved: hasUsers || pass.google_wallet_saved === true,
      has_users: hasUsers,
      object_id: instance.google_wallet_object_id,
      installed_at: hasUsers ? (pass.google_installed_at || new Date().toISOString()) : (pass.google_installed_at || null),
      message: hasUsers
        ? 'Google Wallet conferma che il pass è stato salvato.'
        : 'Oggetto Google trovato, ma Google non segnala ancora utenti associati.'
    });
  } catch (err) {
    console.error('[GoogleWallet] refresh status error:', err);
    const mapped = googleWallet.formatGoogleWalletError(err);
    res.status(mapped.status).json({ error: mapped.error, code: mapped.code });
  }
});

/**
 * GET /api/v1/google-wallet/status - Config + optional class registration check
 * Query: ?brand_id=&template_id= to verify genericClass exists on Google
 */
router.get('/google-wallet/status', async (req, res) => {
  try {
    const info = googleWallet.getStatusInfo();
    const { brand_id, template_id } = req.query || {};
    if (googleWallet.isConfigured() && brand_id && template_id) {
      const brand = await getBrand(String(brand_id));
      const template = await getTemplate(String(template_id));
      if (brand && template && String(template.brand_id) === String(brand.id)) {
        info.class_registration = await googleWallet.getClassRegistration(brand, template);
      }
    }
    res.json(info);
  } catch (err) {
    console.error('[GoogleWallet] status error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Diagnostica Apple Wallet (PassKit web service + firma) — nessun segreto nei valori. */
function getAppleWalletStatusInfo() {
  const domain = process.env.CUSTOM_DOMAIN || '';
  const base = domain ? `https://${domain}` : '';
  const certDir = path.join(__dirname, '..', '..', 'certs');
  const fileSigning =
    fs.existsSync(path.join(certDir, 'signerCert.pem')) &&
    fs.existsSync(path.join(certDir, 'signerKey.pem')) &&
    fs.existsSync(path.join(certDir, 'wwdr.pem'));
  const b64Signing = !!(
    process.env.SIGNER_CERT_BASE64 &&
    process.env.SIGNER_KEY_BASE64 &&
    process.env.WWDR_CERT_BASE64
  );
  const ptid = process.env.PASS_TYPE_IDENTIFIER || '';
  const team = process.env.TEAM_IDENTIFIER || '';
  const apnsEnv = process.env.APNS_ENV || 'production';
  const signingOk = fileSigning || b64Signing;
  const idsOk = !!(ptid && team);
  let warning = null;
  if (!domain) {
    warning = 'CUSTOM_DOMAIN non impostato: webServiceURL nel pass e URL pubblici possono essere errati.';
  } else if (!signingOk) {
    warning = 'Certificati firma pass assenti: usa certs/*.pem oppure SIGNER_*_BASE64 e WWDR_CERT_BASE64.';
  } else if (!idsOk) {
    warning = 'PASS_TYPE_IDENTIFIER o TEAM_IDENTIFIER mancanti.';
  }
  return {
    configured: !!(idsOk && signingOk),
    custom_domain: domain || null,
    pass_type_identifier: ptid || null,
    team_identifier: team || null,
    apns_env: apnsEnv,
    web_service_url: base ? `${base}/api` : null,
    device_registrations_url_pattern: base
      ? `${base}/api/v1/devices/{deviceLibraryId}/registrations/{passTypeIdentifier}/{serialNumber}`
      : null,
    pass_get_url_pattern: base ? `${base}/api/v1/passes/{passTypeIdentifier}/{serialNumber}` : null,
    signing_source: fileSigning ? 'certs/*.pem' : b64Signing ? 'env BASE64 (SIGNER_* + WWDR)' : 'nessuna',
    note: 'iOS registra il dispositivo e richiede gli aggiornamenti pass agli URL sopra; APNs usa push token da device_registrations.',
    warning
  };
}

router.get('/apple-wallet/status', (req, res) => {
  res.json(getAppleWalletStatusInfo());
});

/**
 * GET /api/v1/google-wallet/callback — solo spiegazione (il browser fa GET; Google usa POST)
 */
router.get('/google-wallet/callback', (req, res) => {
  res.type('html').send(`<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Wallet · callback Google</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:32px auto;padding:20px;line-height:1.45;color:#1a1a1a;">
<h1 style="font-size:1.15rem;margin:0 0 .75rem;">Callback Google Wallet</h1>
<p style="margin:0 0 .6rem;font-size:.95rem;">Questo URL riceve solo richieste <strong>POST</strong> da Google quando un utente salva o rimuove il pass. Aprendolo nel browser ottieni questa pagina informativa: è previsto così.</p>
<p style="margin:0;font-size:.82rem;color:#555;">NON usare questa pagina come test funzionale: verifica configurazione issuer e firewall per le chiamate <code>POST</code>.</p>
</body></html>`);
});

/**
 * POST /api/v1/google-wallet/callback - Google Wallet event callback
 *
 * Google sends a POST when a user saves or deletes a pass.
 * We use this to update the pass installation status in our DB.
 */
router.post('/google-wallet/callback', async (req, res) => {
  let cbEvent = null;
  try {
    console.log('[GoogleWallet Callback] Received:', JSON.stringify(req.body).substring(0, 500));

    const { objectId, eventType, signedMessage } = req.body;
    if (!signedMessage) {
      console.warn('[GoogleWallet Callback] Missing signedMessage');
      return res.status(401).send('Unauthorized');
    }
    const verifiedPayload = await verifyGoogleSignedMessage(signedMessage);
    const eventData =
      verifiedPayload && verifiedPayload.payload && typeof verifiedPayload.payload === 'object'
        ? verifiedPayload.payload
        : (verifiedPayload || req.body);
    const signedPayload = verifiedPayload || null;

    const eventHash = createHash('sha256').update(String(signedMessage)).digest('hex');

    const evtObjectId =
      eventData.objectId ||
      eventData.resourceId ||
      (eventData.object && eventData.object.id) ||
      (eventData.payload && eventData.payload.objectId) ||
      (signedPayload && signedPayload.objectId) ||
      objectId;

    const evtTypeRaw =
      eventData.eventType ||
      eventData.event ||
      eventData.type ||
      (eventData.payload && eventData.payload.eventType) ||
      (signedPayload && signedPayload.eventType) ||
      eventType ||
      '';
    const evtType = String(evtTypeRaw).trim().toLowerCase();
    cbEvent = await registerWalletCallbackEvent({
      provider: 'google',
      event_hash: eventHash,
      object_id: evtObjectId || null,
      event_type: evtType || null,
      payload: req.body
    });
    if (!cbEvent.inserted) {
      if (cbEvent.row && !cbEvent.row.processed) {
        await finalizeWalletCallbackEvent(cbEvent.row.id, { processed: true, process_status: 'duplicate_ignored' });
      }
      console.log('[GoogleWallet Callback] Duplicate ignored hash:', eventHash.slice(0, 10));
      return res.status(200).send('OK');
    }

    if (!evtObjectId) {
      console.log('[GoogleWallet Callback] No objectId in payload, ignoring');
      await finalizeWalletCallbackEvent(cbEvent.row.id, { processed: true, process_status: 'ignored_no_object' });
      return res.status(200).send('OK');
    }

    if (evtType.includes('save') || evtType.includes('add') || evtType.includes('insert')) {
      const pass = await updateGoogleWalletStatus(evtObjectId, true);
      if (pass) {
        await finalizeWalletCallbackEvent(cbEvent.row.id, {
          processed: true,
          process_status: 'applied_save',
          pass_id: pass.id,
          brand_id: pass.brand_id
        });
        await logEvent({
          pass_id: pass.id,
          brand_id: pass.brand_id,
          event_type: 'google_wallet_installed',
          metadata: { object_id: evtObjectId }
        });
        await updatePassDeviceId(pass.serial_number, evtObjectId, 'google');
        console.log('[GoogleWallet Callback] Pass ' + pass.id + ' marked as installed (device_id set)');
      } else {
        await finalizeWalletCallbackEvent(cbEvent.row.id, { processed: true, process_status: 'ignored_no_pass' });
        console.log('[GoogleWallet Callback] No pass found for objectId: ' + evtObjectId);
      }
    } else if (evtType.includes('del') || evtType.includes('remove')) {
      const pass = await updateGoogleWalletStatus(evtObjectId, false);
      if (pass) {
        await finalizeWalletCallbackEvent(cbEvent.row.id, {
          processed: true,
          process_status: 'applied_delete',
          pass_id: pass.id,
          brand_id: pass.brand_id
        });
        await logEvent({
          pass_id: pass.id,
          brand_id: pass.brand_id,
          event_type: 'google_wallet_removed',
          metadata: { object_id: evtObjectId }
        });
        console.log('[GoogleWallet Callback] Pass ' + pass.id + ' marked as removed');
      } else {
        await finalizeWalletCallbackEvent(cbEvent.row.id, { processed: true, process_status: 'ignored_no_pass' });
      }
    } else {
      await finalizeWalletCallbackEvent(cbEvent.row.id, { processed: true, process_status: 'ignored_unknown_type' });
      console.log('[GoogleWallet Callback] Unknown event type:', evtTypeRaw, 'objectId:', evtObjectId);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('[GoogleWallet Callback] Error:', error);
    if (cbEvent && cbEvent.row && cbEvent.row.id) {
      try {
        await finalizeWalletCallbackEvent(cbEvent.row.id, {
          processed: false,
          process_status: 'error',
          error_message: error.message
        });
      } catch (_) { }
    }
    res.status(200).send('OK');
  }
});

const waiRateBuckets = new Map();
const waiStripGenerateBuckets = new Map();

function enforceWaiRateLimit(brandId) {
  const now = Date.now();
  const windowMs = 60_000;
  const max = 20;
  const bucket = waiRateBuckets.get(brandId) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    const err = new Error('Limite W.AI raggiunto (20 richieste al minuto)');
    err.status = 429;
    throw err;
  }
  recent.push(now);
  waiRateBuckets.set(brandId, recent);
}

function enforceWaiStripGenerateRateLimit(brandId) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const max = 5;
  const bucket = waiStripGenerateBuckets.get(brandId) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    const err = new Error('Limite generazioni strip W.AI raggiunto (5 all’ora)');
    err.status = 429;
    throw err;
  }
  recent.push(now);
  waiStripGenerateBuckets.set(brandId, recent);
}

const WAI_STRIP_GENERATE_MODEL = 'fal-ai/flux-pro/v1.1';
const WAI_STRIP_GENERATE_WIDTH = 1125;
const WAI_STRIP_GENERATE_HEIGHT = 432;

function waiStripPromptRequestsText(...parts) {
  const text = parts.map((p) => String(p || '')).join(' ');
  if (!text.trim()) return false;
  if (/\b(no text|senza testo|senza scritte|no words|without text)\b/i.test(text)) return false;
  return /\b(testo|frase|scritta|scrivi|inserisci|parole|headline|copy|caption|text|phrase|wording|typography|written)\b/i.test(text);
}

function buildWaiStripGenerationPrompt({ prompt_en, source_prompt }) {
  const base = String(prompt_en || '').trim();
  const wantsText = waiStripPromptRequestsText(base, source_prompt);
  const textRule = wantsText
    ? 'include only the explicitly requested short phrase as clean legible typographic text inside the image, balanced composition, no watermarks, no logos, no UI elements, no badges, no stickers, no circles, no frames, no icons'
    : 'no text, no watermarks, no logos, no UI elements, no badges, no stickers, no circles, no frames, no icons';
  return `${base}, promotional banner, wide aspect ratio, clean panoramic background, ${textRule}`;
}

async function generateWaiStripBase64({ brand_id, prompt_en, source_prompt = '' }) {
  const brand = await getBrand(brand_id);
  if (!brand) throw new Error('Brand non trovato');
  const stylePrompt = brand.config?.aiStylePrompt || null;
  const imageUrl = await generateWithFal(
    buildWaiStripGenerationPrompt({ prompt_en, source_prompt }),
    WAI_STRIP_GENERATE_WIDTH,
    WAI_STRIP_GENERATE_HEIGHT,
    WAI_STRIP_GENERATE_MODEL,
    null,
    stylePrompt
  );
  const imgResponse = await fetch(imageUrl);
  if (!imgResponse.ok) throw new Error('Download immagine generata fallito');
  const arrayBuf = await imgResponse.arrayBuffer();
  return Buffer.from(arrayBuf).toString('base64');
}

async function applyGeneratedStripToBrand(brand_id, stripBase64) {
  const brand = await getBrand(brand_id);
  if (!brand) throw new Error('Brand non trovato');
  const config = { ...(brand.config || {}) };
  const logos = { ...(config.logos || {}) };
  if (!logos.strip_default && logos.strip) logos.strip_default = logos.strip;
  logos.strip = stripBase64;
  config.logos = logos;
  delete config.stripOverride;
  await updateBrand(brand_id, { config });
}

async function maybeGenerateAndApplyWaiStrip(payload, opts = {}) {
  const stripPrompt = String(payload?.strip_prompt_en || '').trim();
  if (!stripPrompt) return null;
  const stripBase64 = await generateWaiStripBase64({
    brand_id: payload.brand_id,
    prompt_en: stripPrompt,
    source_prompt: opts.sourcePrompt || payload.source_prompt || ''
  });
  await applyGeneratedStripToBrand(payload.brand_id, stripBase64);
  return stripBase64;
}

async function performImmediatePushForWai(payload, opts = {}) {
  const brand = await getBrand(payload.brand_id);
  let stripBase64 = null;
  if (payload.strip_base64) {
    stripBase64 = payload.strip_base64;
    await applyGeneratedStripToBrand(payload.brand_id, stripBase64);
  } else if (payload.strip_prompt_en) {
    stripBase64 = await maybeGenerateAndApplyWaiStrip(payload, opts);
  }
  return executeWalletPush(payload, {
    hrDeploy: isHrBrand(brand, { headers: {} }),
    resolvedStripBase64: stripBase64,
  });
}

const WAI_EXECUTORS = {
  'push.schedule': async (payload, opts = {}) => {
    const body = normalizeHrPushPayload({ ...payload });
    if (body.strip_base64) {
      body.strip_base64 = String(body.strip_base64);
    } else if (body.strip_prompt_en) {
      body.strip_base64 = await generateWaiStripBase64({
        brand_id: body.brand_id,
        prompt_en: body.strip_prompt_en,
        source_prompt: opts.sourcePrompt || body.source_prompt || ''
      });
      delete body.strip_prompt_en;
    }
    if (Array.isArray(body.days) && body.days.length && (!body.schedule_days || String(body.schedule_days).trim() === '')) {
      body.schedule_days = body.days.map((x) => String(x)).join(',');
    }
    const nextRun = computeInitialScheduledRun(body);
    if (!nextRun) throw new Error('Data/orario non validi per la pianificazione');
    body.next_run_at = nextRun;
    const item = await createScheduledPush(body);
    const hadStrip = !!(payload.strip_base64 || payload.strip_prompt_en);
    const stripNote = hadStrip ? ' Strip del pass già aggiornata.' : '';
    return { message: `Push programmata: ${payload.title}.${stripNote}`, data: item, strip_updated: hadStrip };
  },
  'push.send': async (payload, opts = {}) => {
    const hadStrip = !!(payload.strip_base64 || payload.strip_prompt_en);
    const data = await performImmediatePushForWai(payload, opts);
    const stripNote = hadStrip ? ' Strip del pass aggiornata.' : '';
    return { message: `Push inviata: ${payload.title}.${stripNote}`, data, strip_updated: hadStrip };
  },
  'campaign.create': async (payload) => {
    const item = await createInstantWinCampaign(payload);
    return { message: `Campagna '${payload.name}' creata`, data: item };
  },
  'strip.create': async (payload) => {
    if (!payload.strip_base64) {
      throw new Error('strip_base64 mancante: carica l’immagine strip dal back office');
    }
    const item = await createStripPromo(payload);
    return { message: `Strip promo '${payload.title}' creata`, data: item };
  },
  'strip.generate': async (payload) => {
    const stripBase64 = await generateWaiStripBase64(payload);
    return {
      message: 'Immagine strip generata',
      image_base64: stripBase64,
      prompt_used: payload.prompt_en,
      dimensions: `${payload.width}x${payload.height}`,
      needs_name: true
    };
  },
  'audience.create': async (payload) => {
    const { brand_id, name, description = '', query_spec, rules, source_prompt = '' } = payload;
    if (!name) throw new Error('Nome audience obbligatorio');
    const normalized = query_spec
      ? mergeSpecToAudienceRules(query_spec)
      : normalizeRules(rules || payload);
    if (!hasActiveRules(normalized)) throw new Error('Filtri audience non validi');
    const count = await countAudienceMembers(brand_id, normalized);
    const row = await createAudience({
      brand_id,
      name,
      description,
      rules: normalized,
      query_spec: query_spec || { rules: normalized, behavior: normalized.behavior },
      source_prompt
    });
    await updateAudience(row.id, { cached_count: count });
    return { message: `Audience "${name}" creata (${count} possessori)`, data: { ...row, member_count: count } };
  }
};

router.post('/wai/ask', async (req, res) => {
  try {
    if (!requireWriteAccess(req, res)) return;
    const { prompt, brand_id, followup, previous_proposal } = req.body;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    enforceWaiRateLimit(brand_id);
    const proposal = await askWai({
      brandId: brand_id,
      prompt,
      followup,
      previousProposal: previous_proposal
    });
    let audienceQuerySpec = proposal.payload?.query_spec || proposal.preview?.details?.query_spec;
    if (proposal.intent === 'audience.query' && audienceQuerySpec) {
      try {
        const userPrompt = String(followup || prompt || '').trim();
        const window = resolveAudienceQueryWindow(audienceQuerySpec, userPrompt);
        audienceQuerySpec = window.spec;
        if (!proposal.payload?.query_spec) proposal.payload = { ...(proposal.payload || {}), query_spec: audienceQuerySpec };
        else proposal.payload.query_spec = audienceQuerySpec;
        const result = await executeAudienceQuery(brand_id, audienceQuerySpec, { limit: 0, offset: 0 });
        const sinceDays = window.sinceDays || audienceQuerySpec.behavior?.since_days;
        let fromDate = window.fromDate;
        let toDate = window.toDate;
        if (sinceDays && (!fromDate || !toDate)) {
          toDate = todayInTimezone(TZ);
          fromDate = dateDaysAgoInTimezone(Number(sinceDays), TZ);
        }
        const answerLine =
          sinceDays && fromDate && toDate
            ? formatAudienceQueryAnswer({
              count: result.count,
              sinceDays,
              fromDate,
              toDate,
              behavior: audienceQuerySpec.behavior
            })
            : `${result.count} possessori nel segmento.`;
        proposal.preview.details = {
          ...(proposal.preview.details || {}),
          member_count: result.count,
          sample_members: [],
          metric_label:
            audienceQuerySpec.behavior?.did_action === 'opened'
              ? 'pass aperti (possessori distinti)'
              : 'nel segmento',
          query_spec: audienceQuerySpec,
          since_days: sinceDays,
          period_from: fromDate,
          period_to: toDate
        };
        proposal.preview.summary = answerLine.slice(0, 280);
        proposal.answer = answerLine;
        proposal.preview.warnings = buildAudienceQueryServerWarnings({
          behavior: audienceQuerySpec.behavior
        });
      } catch (qErr) {
        proposal.preview.warnings = [...(proposal.preview.warnings || []), qErr.message];
      }
    }
    const loggedPrompt = String(followup || '').trim()
      ? `${String(prompt || '').trim()}\n\nIntegrazione:\n${String(followup || '').trim()}`
      : String(prompt || '').trim();
    await logWaiInteraction({
      brand_id,
      user_id: req.user?.id || null,
      prompt: loggedPrompt,
      intent: proposal.intent,
      proposal,
      action: 'planned'
    });
    res.json(proposal);
  } catch (err) {
    const status = err.status || 500;
    console.error('W.AI ask error:', err);
    res.status(status).json({ error: err.message });
  }
});

router.post('/wai/execute', async (req, res) => {
  try {
    if (!requireWriteAccess(req, res)) return;
    const { intent, payload } = req.body;
    if (!intent || !payload) return res.status(400).json({ error: 'intent e payload richiesti' });
    if (!requireBrandId(req, res, payload.brand_id)) return;
    if (!canExecuteWaiIntent(req.user?.role, intent)) {
      return res.status(403).json({ error: 'Permessi insufficienti per questa operazione W.AI' });
    }
    if (!EXECUTABLE_INTENTS.has(intent)) {
      return res.status(400).json({ error: `Intent '${intent}' non eseguibile` });
    }
    if (intent === 'strip.generate') enforceWaiStripGenerateRateLimit(payload.brand_id);
    if ((intent === 'push.send' || intent === 'push.schedule') && payload.strip_prompt_en) {
      enforceWaiStripGenerateRateLimit(payload.brand_id);
    }

    const sourcePrompt = String(req.body.prompt || '').trim();
    const normalized = validateWaiResponse(
      { intent, type: 'create', payload, preview: { summary: '', details: {}, warnings: [] } },
      payload.brand_id,
      sourcePrompt
    );
    if (sourcePrompt && normalized.payload && !normalized.payload.source_prompt) {
      normalized.payload.source_prompt = sourcePrompt;
    }
    const executor = WAI_EXECUTORS[intent];
    if (!executor) return res.status(400).json({ error: `Intent '${intent}' non eseguibile` });

    const result = await executor(normalized.payload, { sourcePrompt });
    await logWaiInteraction({
      brand_id: payload.brand_id,
      user_id: req.user?.id || null,
      prompt: req.body.prompt || '',
      intent,
      payload: normalized.payload,
      action: 'executed'
    });
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('W.AI execute error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/wai/history', async (req, res) => {
  try {
    const { brand_id, limit } = req.query;
    if (!brand_id) return res.status(400).json({ error: 'brand_id richiesto' });
    if (!requireBrandId(req, res, brand_id)) return;
    const items = await listWaiLog(brand_id, limit);
    res.json(items);
  } catch (err) {
    console.error('W.AI history error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/wai/strip-save', async (req, res) => {
  try {
    if (!requireWriteAccess(req, res)) return;
    const { brand_id, image_base64, name, campaign_id = null } = req.body;
    if (!brand_id || !image_base64 || !name) {
      return res.status(400).json({ error: 'brand_id, image_base64 e name richiesti' });
    }
    if (!requireBrandId(req, res, brand_id)) return;

    const brand = await getBrand(brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    const mediaName = String(name).trim();
    if (!mediaName) return res.status(400).json({ error: 'name richiesto' });

    const normalizedBase64 = String(image_base64).replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').trim();
    if (!normalizedBase64) return res.status(400).json({ error: 'image_base64 non valido' });

    const mediaItem = await createMedia({
      brand_id,
      campaign_id: campaign_id || null,
      type: 'strip',
      title: mediaName,
      image_base64: normalizedBase64,
      width: 1125,
      height: 432
    });

    await logWaiInteraction({
      brand_id,
      user_id: req.user?.id || null,
      prompt: mediaName,
      intent: 'strip.generate',
      action: 'completed',
      payload: { media_id: mediaItem.id, name: mediaName, campaign_id: campaign_id || null }
    });

    res.json({
      success: true,
      media_id: mediaItem.id,
      message: `Strip "${mediaName}" salvata nella Media Library.`
    });
  } catch (err) {
    console.error('W.AI strip save error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

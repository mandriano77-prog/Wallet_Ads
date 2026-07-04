/**
 * Employee portal API — passwordless magic-link JWT (pass_instances.id)
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  getPassForPortal,
  listPassConsents,
  upsertPassConsent,
  listConsentLogForPass,
  createGdprRequest,
  listGdprRequestsForPass,
  mergePassFieldValues,
  getPortalPushHistory,
  revokePortalTokensForPass,
  PORTAL_CONSENT_TYPES,
  isValidConsentType
} = require('../db/portal');
const { getPassInstance, getTemplate, touchPass, logEvent } = require('../db');
const { listMemberIntegrations } = require('../db/integrations');
const { enabledIntegrations } = require('../engine/integrations');
const { verifyPortalToken, buildPortalUrl } = require('../engine/portal-auth');
const { readPassPortalToken, savePassPortalToken } = require('../engine/portal-pass-link');
const { createPkpass } = require('../engine/passkit');
const { resolveBaseUrl, resolveBaseUrlFromEnv } = require('../engine/base-url');
const { resolveBrandPrivacyUrl } = require('../engine/brand-privacy-url');
const { publicBrandTheme } = require('../engine/public-brand-theme');
const { publicBrandMarkUrl } = require('../engine/brand-wallet-logo');
const { syncGoogleWalletObjectsForPasses } = require('../engine/google-wallet-sync');

const router = express.Router();

function absolutePublicAsset(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = resolveBaseUrlFromEnv().replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

const GDPR_TYPES = Object.freeze([
  'access',
  'portability',
  'rectification',
  'erasure',
  'restriction',
  'objection'
]);

/** Keys the holder may update from the portal (merged into field_values). */
const PORTAL_EDITABLE_FIELDS = new Set([
  'nome',
  'name',
  'cognome',
  'surname',
  'email',
  'phone',
  'telefono',
  'birthday',
  'data_nascita',
  'reparto',
  'department',
  'sede',
  'location',
  'badge_id',
  'ruolo',
  'role'
]);

router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Troppe richieste. Riprova tra un minuto.' }
  })
);

function extractPortalToken(req) {
  const q = req.query.t || req.query.token;
  if (q) return String(q);
  const header = req.headers['x-portal-token'];
  if (header) return String(header);
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function parseFieldValues(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function clientMeta(req) {
  return {
    ip_address:
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.ip ||
      null,
    user_agent: req.headers['user-agent'] || null,
    privacy_policy_version: req.body?.privacy_policy_version || null
  };
}

function formatProfileRow(row) {
  const fv = parseFieldValues(row.field_values);
  const cfg =
    typeof row.brand_config === 'string'
      ? JSON.parse(row.brand_config)
      : row.brand_config || {};

  const displayName =
    [fv.nome || fv.name, fv.cognome || fv.surname].filter(Boolean).join(' ') ||
    fv.display_name ||
    fv.full_name ||
    null;

  const brandForAssets = { slug: row.brand_slug, config: cfg };

  return {
    pass_id: row.id,
    brand: {
      id: row.brand_id,
      name: row.brand_name,
      slug: row.brand_slug,
      brand_theme: publicBrandTheme({ config: cfg }),
      logo_url: absolutePublicAsset(publicBrandMarkUrl(brandForAssets))
    },
    template: {
      id: row.template_id,
      name: row.template_name,
      pass_type: row.pass_type
    },
    serial_number: row.serial_number,
    status: row.status,
    install_date: row.install_date,
    device_source: row.device_source,
    field_values: fv,
    display_name: displayName,
    privacy_url: resolveBrandPrivacyUrl(
      { config: cfg, slug: row.brand_slug },
      { localhostPort: process.env.PORT }
    ),
    dpo_email: row.brand_dpo_email || cfg.dpo_email || cfg.dpoEmail || null,
    hr_email: row.brand_hr_email || cfg.hr_email || cfg.support_email || null
  };
}

async function requirePortalToken(req, res, next) {
  const token = extractPortalToken(req);
  const session = await verifyPortalToken(token);
  if (!session) {
    return res.status(401).json({
      error: 'Link non valido o scaduto. Apri di nuovo il portale dal tuo pass Wallet.'
    });
  }
  req.portal = session;
  req.portalTokenRaw = token;
  next();
}

router.use(requirePortalToken);

router.get('/me', async (req, res) => {
  try {
    const row = await getPassForPortal(req.portal.pass_id);
    if (!row) return res.status(404).json({ error: 'Pass non trovato' });
    const consents = await listPassConsents(req.portal.pass_id);
    res.json({ profile: formatProfileRow(row), consents });
  } catch (err) {
    console.error('[portal] GET /me', err);
    res.status(500).json({ error: err.message });
  }
});

// EXTRA — fringe benefit / welfare del dipendente. Merge tra i provider abilitati
// dal brand e lo stato di collegamento del singolo dipendente, raggruppati per
// categoria. Fase 1: ogni provider è "not_connected" finché la sua API non c'è.
router.get('/me/integrations', async (req, res) => {
  try {
    const row = await getPassForPortal(req.portal.pass_id);
    if (!row) return res.status(404).json({ error: 'Pass non trovato' });
    const cfg = typeof row.brand_config === 'string'
      ? JSON.parse(row.brand_config) : (row.brand_config || {});
    const enabled = enabledIntegrations(cfg);
    const memberId = row.member_id || null;
    const states = memberId ? await listMemberIntegrations(memberId) : [];
    const stateByType = new Map(states.map((st) => [st.type, st]));

    const items = enabled.map((it) => {
      const st = stateByType.get(it.type);
      return {
        type: it.type,
        label: it.label,
        category: it.category,
        category_label: it.category_label,
        logo_url: it.logo_url,
        domain: it.domain || null,
        mode: it.mode,
        native: it.native,
        deeplink_url: it.deeplink_url,
        status: st?.status || 'not_connected',
        data: st?.data || {},
        last_synced_at: st?.last_synced_at || null,
      };
    });

    // Raggruppa per categoria mantenendo l'ordine di CATEGORIES.
    const order = ['buoni_pasto', 'fringe', 'ferie', 'altro'];
    const groups = [];
    for (const cat of order) {
      const inCat = items.filter((i) => i.category === cat);
      if (inCat.length) groups.push({ category: cat, category_label: inCat[0].category_label, items: inCat });
    }
    res.json({ groups, total: items.length });
  } catch (err) {
    console.error('[portal] GET /me/integrations', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/me', async (req, res) => {
  try {
    const patch = {};
    const body = req.body || {};
    for (const [key, value] of Object.entries(body)) {
      if (PORTAL_EDITABLE_FIELDS.has(key)) patch[key] = value;
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'Nessun campo modificabile inviato' });
    }
    const field_values = await mergePassFieldValues(req.portal.pass_id, patch);
    await touchPass(req.portal.pass_id);
    const row = await getPassForPortal(req.portal.pass_id);
    res.json({ profile: formatProfileRow(row), field_values });
  } catch (err) {
    console.error('[portal] PUT /me', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/me/consents', async (req, res) => {
  try {
    const consents = await listPassConsents(req.portal.pass_id);
    res.json({ consents, types: PORTAL_CONSENT_TYPES });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/me/consents', async (req, res) => {
  try {
    const meta = clientMeta(req);
    const body = req.body || {};
    let updates = [];

    if (Array.isArray(body.consents)) {
      updates = body.consents
        .filter((c) => c && isValidConsentType(c.consent_type || c.type))
        .map((c) => ({
          consent_type: c.consent_type || c.type,
          granted: !!c.granted
        }));
    } else if (body.consents && typeof body.consents === 'object') {
      updates = Object.entries(body.consents)
        .filter(([type]) => isValidConsentType(type))
        .map(([consent_type, granted]) => ({ consent_type, granted: !!granted }));
    } else if (isValidConsentType(body.consent_type)) {
      updates = [{ consent_type: body.consent_type, granted: !!body.granted }];
    }

    if (!updates.length) {
      return res.status(400).json({ error: 'Consensi non validi' });
    }

    const results = [];
    for (const u of updates) {
      results.push(
        await upsertPassConsent(req.portal.pass_id, u.consent_type, u.granted, meta)
      );
    }

    await logEvent({
      pass_id: req.portal.pass_id,
      brand_id: req.portal.brand_id,
      event_type: 'portal_consent_updated',
      metadata: { types: updates.map((u) => u.consent_type) }
    });

    res.json({ consents: await listPassConsents(req.portal.pass_id), updated: results.length });
  } catch (err) {
    console.error('[portal] PUT /me/consents', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/me/consent-log', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const log = await listConsentLogForPass(req.portal.pass_id, limit);
    res.json({ log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me/pass', async (req, res) => {
  try {
    const row = await getPassForPortal(req.portal.pass_id);
    if (!row) return res.status(404).json({ error: 'Pass non trovato' });

    const baseUrl = resolveBaseUrl(req);

    res.json({
      pass_id: row.id,
      serial_number: row.serial_number,
      status: row.status,
      install_date: row.install_date,
      last_updated: row.last_updated,
      download_url: `${baseUrl}/api/v1/portal/me/pass/download`,
      regenerate_url: `${baseUrl}/api/v1/portal/me/pass/regenerate`,
      apple_wallet: row.device_source === 'apple' || !!row.install_date
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function buildPkpassForPortal(req, pkpassOptions = {}) {
  const pass = await getPassInstance(req.portal.pass_id);
  if (!pass) throw new Error('Pass non trovato');
  const row = await getPassForPortal(req.portal.pass_id);
  const template = await getTemplate(row.template_id);
  if (!template) throw new Error('Template non trovato');
  const brand = {
    id: row.brand_id,
    name: row.brand_name,
    slug: row.brand_slug,
    config:
      typeof row.brand_config === 'string'
        ? JSON.parse(row.brand_config)
        : row.brand_config
  };

  const baseUrl = resolveBaseUrl(req);

  return createPkpass(template, pass, brand, {
    baseUrl,
    passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER || 'pass.com.nudj',
    teamIdentifier: process.env.TEAM_IDENTIFIER || 'YOUR_TEAM_ID',
    ...pkpassOptions
  });
}

router.get('/me/pass/download', async (req, res) => {
  try {
    const pkpassBuffer = await buildPkpassForPortal(req);
    const row = await getPassForPortal(req.portal.pass_id);
    await logEvent({
      pass_id: req.portal.pass_id,
      brand_id: req.portal.brand_id,
      event_type: 'portal_pass_download'
    });
    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="${row.brand_slug || 'pass'}.pkpass"`,
      'Content-Length': pkpassBuffer.length,
      'Cache-Control': 'no-store'
    });
    res.send(pkpassBuffer);
  } catch (err) {
    console.error('[portal] pass download', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/me/pass/regenerate', async (req, res) => {
  try {
    const pkpassBuffer = await buildPkpassForPortal(req, { rotatePortalLink: true });
    const freshPass = await getPassInstance(req.portal.pass_id);
    await touchPass(req.portal.pass_id);

    const newToken = await readPassPortalToken(req.portal.pass_id);

    let googleSync = { attempted: 0, updated: 0, errors: 0, skipped: true };
    if (freshPass?.google_wallet_object_id) {
      const row = await getPassForPortal(req.portal.pass_id);
      const brand = {
        id: row.brand_id,
        name: row.brand_name,
        slug: row.brand_slug,
        config:
          typeof row.brand_config === 'string'
            ? JSON.parse(row.brand_config)
            : row.brand_config
      };
      googleSync = await syncGoogleWalletObjectsForPasses({
        brand,
        passes: [freshPass],
        message: null
      });
      googleSync.skipped = false;
    }

    await logEvent({
      pass_id: req.portal.pass_id,
      brand_id: req.portal.brand_id,
      event_type: 'portal_pass_regenerated',
      metadata: { revoked_previous_tokens: true, google: googleSync }
    });

    const wantsJson =
      req.query.json === '1'
      || String(req.get('accept') || '').includes('application/json');

    const row = await getPassForPortal(req.portal.pass_id);
    if (wantsJson) {
      return res.json({
        success: true,
        pass_id: req.portal.pass_id,
        portal_token: newToken || '',
        portal_url: newToken ? buildPortalUrl(newToken) || '' : '',
        google: googleSync
      });
    }

    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Content-Disposition': `attachment; filename="${row.brand_slug || 'pass'}.pkpass"`,
      'Content-Length': pkpassBuffer.length,
      'X-Portal-Token': newToken || '',
      'X-Portal-Url': newToken ? buildPortalUrl(newToken) || '' : '',
      'Cache-Control': 'no-store'
    });
    res.send(pkpassBuffer);
  } catch (err) {
    console.error('[portal] pass regenerate', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/me/push-history', async (req, res) => {
  try {
    const data = await getPortalPushHistory(req.portal.pass_id, req.portal.brand_id);
    res.json({
      ...data,
      note:
        'Le comunicazioni di massa mostrano i push inviati al brand; lo stato APNs sul tuo dispositivo è in pass_summary.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me/gdpr-requests', async (req, res) => {
  try {
    const requests = await listGdprRequestsForPass(req.portal.pass_id);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/me/gdpr/:requestType', async (req, res) => {
  try {
    const requestType = String(req.params.requestType || '').toLowerCase();
    if (!GDPR_TYPES.includes(requestType)) {
      return res.status(400).json({ error: 'Tipo richiesta GDPR non valido', allowed: GDPR_TYPES });
    }

    const details =
      typeof req.body?.details === 'string'
        ? req.body.details
        : req.body?.message || null;

    const request = await createGdprRequest({
      pass_id: req.portal.pass_id,
      brand_id: req.portal.brand_id,
      request_type: requestType,
      details
    });

    await logEvent({
      pass_id: req.portal.pass_id,
      brand_id: req.portal.brand_id,
      event_type: 'portal_gdpr_request',
      metadata: { request_type: requestType, request_id: request.id }
    });

    res.status(201).json({
      request,
      message:
        'Richiesta registrata. Il DPO aziendale riceverà la segnalazione secondo le policy del datore.'
    });
  } catch (err) {
    console.error('[portal] gdpr', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/me/pass/uninstall', async (req, res) => {
  try {
    await revokePortalTokensForPass(req.portal.pass_id);
    await savePassPortalToken(req.portal.pass_id, null);
    await logEvent({
      pass_id: req.portal.pass_id,
      brand_id: req.portal.brand_id,
      event_type: 'portal_uninstall_acknowledged',
      metadata: { note: 'User acknowledged wallet removal instructions' }
    });
    res.json({
      success: true,
      message:
        'Per smettere di ricevere push, rimuovi il pass da Apple Wallet / Google Wallet sul telefono. I dati HR restano gestiti dal datore; per cancellazione definitiva usa «Richiedi cancellazione» in I miei dati.',
      portal_session_revoked: true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// FiloDiretto HR platform
// Cron, push pianificate e `new Date(y,m,d,H,M)` nel processo Node — sempre ora italiana.
process.env.TZ = 'Europe/Rome';

const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const { getDb } = require('./db');
const apiRoutes = require('./api/routes');
const portalRoutes = require('./api/portal-routes');
const debugSignRoutes = require('./api/debug-sign');
const { startScheduler } = require('./engine/scheduler');
const { runStripPromoCheck } = require('./engine/strip-promo');
const { isAnthropicConfigured, isFalConfigured } = require('./engine/env-ai');
const { resolveBaseUrlFromEnv, getProductBrandName, buildPublicLandingUrl } = require('./engine/base-url');
const { isSamsungWalletUiEnabled } = require('./engine/wallet-channels');
const { assertProductionConfig, corsOptions, isProduction, requireDebugAccess } = require('./engine/security-config');

assertProductionConfig();

// Load certificates: prefer FILE-BASED certs (from repo), fallback to env vars
function loadCerts() {
  const certDir = path.join(__dirname, '..', 'certs');
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });

  const certFile = path.join(certDir, 'signerCert.pem');
  const keyFile = path.join(certDir, 'signerKey.pem');
  const wwdrFile = path.join(certDir, 'wwdr.pem');

  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    console.log('✓ Certificates loaded from filesystem');
  } else if (process.env.SIGNER_CERT_BASE64) {
    fs.writeFileSync(certFile, Buffer.from(process.env.SIGNER_CERT_BASE64, 'base64'));
    fs.writeFileSync(keyFile, Buffer.from(process.env.SIGNER_KEY_BASE64, 'base64'));
    if (process.env.WWDR_CERT_BASE64) {
      fs.writeFileSync(wwdrFile, Buffer.from(process.env.WWDR_CERT_BASE64, 'base64'));
    }
    console.log('✓ Certificates loaded from environment variables');
  } else if (isProduction()) {
    throw new Error('Apple Wallet certificates missing. Set SIGNER_CERT_BASE64, SIGNER_KEY_BASE64 and WWDR_CERT_BASE64 or mount PEM files in ./certs.');
  } else {
    console.warn('⚠️ No certificates found — mock signing mode');
  }
}

loadCerts();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Trust reverse proxy (Railway, Nginx, etc.) for correct req.protocol
app.set('trust proxy', true);

// Force HTTPS in production
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] === 'http' && process.env.NODE_ENV !== 'development') {
    return res.redirect(301, 'https://' + req.headers.host + req.url);
  }
  next();
});

// Middleware
// Helmet: security headers (HSTS, X-Content-Type-Options, X-Frame-Options, ecc.).
// CSP disattivata: le SPA (dashboard, hub, landing, giochi) usano script/style inline
// e QRCode.js da CDN — una CSP di default le romperebbe; va introdotta a parte con
// una policy dedicata. CORP cross-origin: gli asset pubblici (loghi pass, immagini
// wallet) vengono caricati anche dai sottodomini hub.*/partner.*.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CSP in modalità Report-Only: non blocca nulla, censisce le violazioni su
// /csp-report per calibrare la policy prima di promuoverla a enforcing.
// 'unsafe-inline'/'unsafe-eval' riflettono lo stato attuale delle SPA (JS inline);
// host esterni censiti: Google Fonts, cdnjs (QRCode), unpkg.
app.use(
  helmet.contentSecurityPolicy({
    reportOnly: true,
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdnjs.cloudflare.com', 'https://unpkg.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'connect-src': ["'self'", 'https:'],
      'frame-ancestors': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'report-uri': ['/csp-report'],
    },
  })
);

// Raccoglie le violazioni della CSP Report-Only (log Railway, max 1/sec per non
// inondare i log se una pagina genera violazioni in loop).
let lastCspReportAt = 0;
app.post('/csp-report',
  express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '16kb' }),
  (req, res) => {
    const now = Date.now();
    if (now - lastCspReportAt > 1000) {
      lastCspReportAt = now;
      const body = req.body?.['csp-report'] || req.body;
      console.warn('[CSP-report]', JSON.stringify(body).slice(0, 500));
    }
    res.status(204).send();
  });
app.use(cors(corsOptions()));
app.use(morgan('combined'));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/shared', express.static(path.join(__dirname, 'shared')));

// Apple Wallet debug (public, no auth) — must be before debug router
app.get('/debug/wallet-check', requireDebugAccess, async (req, res) => {
  try {
    const { pool } = require('./db');
    const deviceCount = await pool.query('SELECT COUNT(*) as count FROM device_registrations');
    const passCount = await pool.query('SELECT COUNT(*) as count FROM pass_instances');
    const recentEvents = await pool.query("SELECT event_type, metadata, created_at FROM events WHERE event_type IN ('pass_installed','pass_removed','pass_created') ORDER BY created_at DESC LIMIT 20");
    const devices = await pool.query('SELECT device_library_id, push_token, serial_number FROM device_registrations LIMIT 10');
    // Check what baseUrl would be used for new passes
    const effectiveBaseUrl = resolveBaseUrlFromEnv({ localhostPort: 3000 });

    // Check auth tokens in recent passes
    const recentPasses = await pool.query('SELECT id, serial_number, auth_token, created_at FROM pass_instances ORDER BY created_at DESC LIMIT 5');

    res.json({
      status: 'ok',
      env: {
        CUSTOM_DOMAIN: process.env.CUSTOM_DOMAIN || '(not set)',
        RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN || '(not set)',
        PASS_TYPE_IDENTIFIER: process.env.PASS_TYPE_IDENTIFIER || '(not set, fallback: pass.com.nudj)',
        TEAM_IDENTIFIER: process.env.TEAM_IDENTIFIER ? 'set' : '(not set)'
      },
      effective_baseUrl: effectiveBaseUrl,
      webServiceURL_in_new_passes: `${effectiveBaseUrl}/api`,
      apple_will_call: `${effectiveBaseUrl}/api/v1/devices/{did}/registrations/{ptid}/{sn}`,
      registered_devices: parseInt(deviceCount.rows[0].count),
      total_passes: parseInt(passCount.rows[0].count),
      recent_passes: recentPasses.rows.map(p => ({
        id: p.id,
        serial: p.serial_number?.substring(0, 12) + '...',
        auth_token: p.auth_token ? p.auth_token.substring(0, 8) + '...' : 'NULL',
        created: p.created_at
      })),
      devices: devices.rows.map(d => ({ device: d.device_library_id?.substring(0,12)+'...', token: d.push_token?.substring(0,12)+'...', serial: d.serial_number?.substring(0,12)+'...' })),
      recent_events: recentEvents.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API routes
app.use('/api/v1', apiRoutes);
app.use('/api/v1/portal', portalRoutes);
app.use('/debug', debugSignRoutes);

// Employee portal (magic link SPA) — no cache on HTML
app.get(['/portal', '/portal/'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  const portalIndex = path.join(__dirname, 'portal', 'index.html');
  if (fs.existsSync(portalIndex)) {
    return res.sendFile(portalIndex);
  }
  res.status(503).send('Portale dipendente in preparazione.');
});
app.use(
  '/portal',
  (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  },
  express.static(path.join(__dirname, 'portal'))
);

// HUB Convenzioni PWA
const hubDir = path.join(__dirname, 'hub');
const hubIndex = path.join(hubDir, 'index.html');

function isHubSubdomain(req) {
  const host = String(req.get('host') || '').split(':')[0].toLowerCase();
  return host.startsWith('hub.');
}

function sendHubSpa(req, res) {
  res.set('Cache-Control', 'no-store');
  if (fs.existsSync(hubIndex)) return res.sendFile(hubIndex);
  res.status(503).send('HUB Convenzioni in preparazione.');
}

app.use('/hub', express.static(hubDir));
app.get([
  '/hub',
  '/hub/',
  '/hub/conv',
  '/hub/conv/:id',
  '/hub/merchants',
  '/hub/merchants/:id',
  '/hub/pga',
  '/hub/pga/:id',
  '/hub/me',
  '/hub/qr/:merchantId',
  '/hub/qr/conv/:merchantId',
  '/hub/error'
], sendHubSpa);

app.use((req, res, next) => {
  if (!isHubSubdomain(req)) return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/debug') || req.path.startsWith('/health')) {
    return next();
  }
  express.static(hubDir)(req, res, next);
});

app.get([
  '/',
  '/conv',
  '/conv/:id',
  '/merchants',
  '/merchants/:id',
  '/pga',
  '/pga/:id',
  '/me',
  '/qr/:merchantId',
  '/qr/conv/:merchantId',
  '/error'
], (req, res, next) => {
  if (!isHubSubdomain(req)) return next();
  sendHubSpa(req, res);
});

// Filodiretto Partner — merchant QR scan validation UI
const partnerDir = path.join(__dirname, 'partner');
const partnerIndex = path.join(partnerDir, 'index.html');

function isPartnerSubdomain(req) {
  const host = String(req.get('host') || '').split(':')[0].toLowerCase();
  return host.startsWith('partner.');
}

function sendPartnerSpa(req, res) {
  res.set('Cache-Control', 'no-store');
  if (fs.existsSync(partnerIndex)) return res.sendFile(partnerIndex);
  res.status(503).send('Partner scan in preparazione.');
}

app.use('/partner', express.static(partnerDir));
app.get(['/partner', '/partner/', '/partner/scan', '/partner/scan/'], sendPartnerSpa);

app.use((req, res, next) => {
  if (!isPartnerSubdomain(req)) return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/debug') || req.path.startsWith('/health')) {
    return next();
  }
  express.static(partnerDir)(req, res, next);
});

app.get(['/scan', '/scan/'], (req, res, next) => {
  if (!isPartnerSubdomain(req)) return next();
  sendPartnerSpa(req, res);
});

// Filo_Diretto repo: dashboard is HR-only (Filo Diretto / studio.filodiretto.app).
const DASHBOARD_PRODUCT_LOCK = 'hr';

app.get('/dashboard/boot.js', (req, res) => {
  const lock = DASHBOARD_PRODUCT_LOCK;
  const title = String(process.env.DASHBOARD_PRODUCT_TITLE || 'Filo Diretto').trim();
  const bylineEnv = String(process.env.DASHBOARD_CHROME_BYLINE ?? '').trim();
  const chromeByline = bylineEnv;
  const allowlistRaw = String(process.env.DASHBOARD_LOGIN_ALLOWLIST || '').trim();
  const loginAllowlist = allowlistRaw || 'admin@nudj.studio';
  const publicBaseUrl = resolveBaseUrlFromEnv({ localhostPort: PORT });
  const productBrand = getProductBrandName();
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send(
    `window.__2WALLET_PRODUCT_LOCK__=${JSON.stringify(lock)};` +
    `window.__2WALLET_PRODUCT_TITLE__=${JSON.stringify(title)};` +
    `window.__2WALLET_CHROME_BYLINE__=${JSON.stringify(chromeByline)};` +
    `window.__2WALLET_LOGIN_ALLOWLIST__=${JSON.stringify(loginAllowlist)};` +
    `window.__PUBLIC_BASE_URL__=${JSON.stringify(publicBaseUrl)};` +
    `window.__PRODUCT_BRAND_NAME__=${JSON.stringify(productBrand)};` +
    `window.__FD_SAMSUNG_WALLET_UI__=${JSON.stringify(isSamsungWalletUiEnabled())};`
  );
});

app.get('/public/boot.js', (req, res) => {
  const publicBaseUrl = resolveBaseUrlFromEnv({ localhostPort: PORT });
  const productBrand = getProductBrandName();
  res.type('application/javascript');
  res.set('Cache-Control', 'no-store');
  res.send(
    `window.__PUBLIC_BASE_URL__=${JSON.stringify(publicBaseUrl)};` +
    `window.__PRODUCT_BRAND_NAME__=${JSON.stringify(productBrand)};`
  );
});

// Static pages
app.get(['/dashboard', '/dashboard/'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});
app.get(['/dashboard/home', '/dashboard/home/'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});
app.get(['/dashboard/contatti', '/dashboard/contatti/'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});
app.get(['/dashboard/contatti/audience', '/dashboard/contatti/audience/'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});
app.get(['/dashboard/analytics', '/dashboard/analytics/'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});
app.get(['/dashboard/analytics/log', '/dashboard/analytics/log/'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});
app.get(['/dashboard/convenzioni', '/dashboard/convenzioni/'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});
app.get(['/dashboard/login', '/dashboard/login/'], (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});
app.use('/filodiretto', express.static(path.join(__dirname, 'filodiretto')));
app.use('/landing', express.static(path.join(__dirname, 'landing')));
app.use('/dashboard', express.static(path.join(__dirname, 'dashboard')));

app.get('/join/:slug', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'join', 'index.html'));
});
app.get('/activate/:token', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'activate', 'index.html'));
});
app.get('/privacy-policy', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'privacy-policy', 'index.html'));
});

// Health check + wallet debug
const BUILD_VERSION = '3.0.0-' + Date.now();
app.get('/health', async (req, res) => {
  const base = {
    status: 'ok',
    product: DASHBOARD_PRODUCT_LOCK,
    version: BUILD_VERSION,
    timestamp: new Date().toISOString(),
    ai: {
      anthropic_configured: isAnthropicConfigured(),
      fal_configured: isFalConfigured()
    },
    // Provider geocoding POI: 'google' quando GOOGLE_MAPS_API_KEY è impostata
    // (fallback automatico su OSM), altrimenti 'osm'. Solo il nome, mai la chiave.
    geocode_provider: String(process.env.GOOGLE_MAPS_API_KEY || '').trim() ? 'google' : 'osm'
  };
  if (req.query.wallet) {
    try {
      const { pool } = require('./db');
      const dc = await pool.query('SELECT COUNT(*) as count FROM device_registrations');
      const pc = await pool.query('SELECT COUNT(*) as count FROM pass_instances');
      const ev = await pool.query("SELECT event_type, metadata, created_at FROM events WHERE event_type IN ('pass_installed','pass_removed','pass_created') ORDER BY created_at DESC LIMIT 15");
      const dv = await pool.query('SELECT device_library_id, push_token, serial_number FROM device_registrations LIMIT 10');
      base.wallet = {
        webServiceURL: `https://${process.env.CUSTOM_DOMAIN || 'localhost:3000'}/api`,
        registered_devices: parseInt(dc.rows[0].count),
        total_passes: parseInt(pc.rows[0].count),
        devices: dv.rows.map(d => ({ device: d.device_library_id?.substring(0,12), token: d.push_token?.substring(0,12), serial: d.serial_number?.substring(0,12) })),
        recent_events: ev.rows
      };
    } catch (e) { base.wallet_error = e.message; }
  }
  res.json(base);
});

// Root redirect
app.get('/', (req, res) => {
  if (isHubSubdomain(req)) return sendHubSpa(req, res);
  res.redirect('/dashboard/');
});

// Privacy policy
app.get('/privacy/:slugOrId', (req, res) => {
  res.sendFile(path.join(__dirname, 'privacy', 'index.html'));
});

app.get('/privacy-doc/:slug', async (req, res) => {
  try {
    const brand = await getBrandBySlug(req.params.slug);
    if (!brand) return res.status(404).send('Documento non trovato');
    const { servePrivacyDocumentResponse } = require('./engine/brand-privacy-document');
    return servePrivacyDocumentResponse(res, brand);
  } catch (err) {
    res.status(500).send('Errore caricamento documento');
  }
});

// ─── Instant Win game page ──────────────────────────────────
app.get('/play/:serial_number', (req, res) => {
  res.sendFile(path.join(__dirname, 'play', 'index.html'));
});

// ─── Gamification game pages ──────────────────────────────────
app.get('/game/quiz/:serial_number', (req, res) => {
  res.sendFile(path.join(__dirname, 'game', 'quiz.html'));
});
app.get('/game/memory/:serial_number', (req, res) => {
  res.sendFile(path.join(__dirname, 'game', 'memory.html'));
});
app.get('/game/puzzle/:serial_number', (req, res) => {
  res.sendFile(path.join(__dirname, 'game', 'puzzle.html'));
});

// ─── Direct Save — skip landing, serve .pkpass immediately ──────────────
// URL: /save/{slug}/{campaignId}?utm_source=instagram&utm_medium=story&...
// For social/digital ads: ad CTA → this URL → iOS opens pass preview → done
const {
  getBrand, getBrandBySlug, getCampaign, getTemplate, listTemplates,
  getPassInstance,
  createPassInstance, logEvent, incrementCampaignDownloads
} = require('./db');
const { renderSaveThankYouPage, resolvePortalHref } = require('./engine/thank-you-html');
const { publicBrandTheme } = require('./engine/public-brand-theme');
const googleWallet = require('./engine/google-wallet');

async function renderThankYouForPass(res, passId) {
  const passInstance = await getPassInstance(passId);
  if (!passInstance) return res.status(404).send('Pass non trovato');
  const brand = await getBrand(passInstance.brand_id);
  if (!brand) return res.status(404).send('Brand non trovato');

  const brandName = brand.name || 'Wallet';
  const passDownloadUrl = `/api/v1/passes/${passInstance.id}/download`;
  const logoCacheBust = encodeURIComponent(String(passInstance.last_updated || passInstance.updated_at || Date.now()));
  const logoUrl = brand.slug
    ? `/api/v1/brands/by-slug/${encodeURIComponent(brand.slug)}/logo?pass_id=${encodeURIComponent(passInstance.id)}&v=${logoCacheBust}`
    : `/api/v1/brands/${encodeURIComponent(String(brand.id))}/logo?t=${logoCacheBust}`;
  const portalHref = await resolvePortalHref(passInstance.id, brand.id);

  return res.send(renderSaveThankYouPage({
    brandName,
    logoUrl,
    passDownloadUrl,
    portalHref,
    brandColor: publicBrandTheme(brand)?.accent || null,
    passId: passInstance.id,
    googleWalletEnabled: googleWallet.isConfigured()
  }));
}

app.get('/save/:slug/:campaignId?', async (req, res) => {
  try {
    const { slug, campaignId } = req.params;
    const brand = await getBrandBySlug(slug);
    if (!brand) return res.status(404).send('Brand non trovato');

    // Find template (campaign-specific or first available)
    let template = null;
    if (campaignId) {
      const campaign = await getCampaign(campaignId);
      if (campaign && campaign.template_id) {
        template = await getTemplate(campaign.template_id);
      }
    }
    if (!template) {
      const templates = await listTemplates(brand.id);
      template = templates[0];
    }
    if (!template) return res.status(400).send('Nessun template configurato');

    // Build UTM from query params
    const utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(k => {
      if (req.query[k]) utm[k.replace('utm_', '')] = req.query[k];
    });

    // Create anonymous pass with browser metadata
    const passInstance = await createPassInstance({
      template_id: template.id,
      brand_id: brand.id,
      campaign_id: campaignId || null,
      field_values: {},
      utm,
      user_agent: req.headers['user-agent'] || null,
      referrer_url: req.headers['referer'] || null
    });

    await logEvent({ pass_id: passInstance.id, brand_id: brand.id, event_type: 'pass_created', metadata: { source: 'direct_save', campaign_id: campaignId, utm } });
    if (campaignId) await incrementCampaignDownloads(campaignId);

    // Serve confirmation page that auto-downloads the .pkpass via API
    return await renderThankYouForPass(res, passInstance.id);

  } catch (err) {
    console.error('Direct save error:', err);
    res.status(500).send('Errore generazione pass');
  }
});

app.get('/activate/thank-you/:passId', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    return await renderThankYouForPass(res, req.params.passId);
  } catch (err) {
    console.error('Activation thank-you error:', err);
    return res.status(500).send('Errore pagina di conferma');
  }
});

// Short URL: /:slug serves the landing page for that brand
app.get('/:slug', (req, res, next) => {
  const slug = req.params.slug;
  if (slug.includes('.') || ['api', 'dashboard', 'landing', 'debug', 'health', 'privacy', 'privacy-policy', 'play', 'save', 'game', 'join', 'activate'].includes(slug)) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'landing', 'index.html'));
});

// Initialize database and start server
getDb().then((db) => {
  const dbHandle = db && db.pool ? db : { pool: db };
  app.locals.db = dbHandle;
  app.listen(PORT, () => {
    console.log('\n🚀 Filo Diretto server running on port ' + PORT);
    console.log('  Health: http://localhost:' + PORT + '/health');
    console.log('  API:    http://localhost:' + PORT + '/api/v1');
    console.log('  TZ:     ' + process.env.TZ);
    console.log('  AI:     Anthropic ' + (isAnthropicConfigured() ? 'configurata' : 'NON configurata nel processo Node'));
    console.log('  AI:     fal.ai ' + (isFalConfigured() ? 'configurata' : 'NON configurata nel processo Node'));

    // Start push notification scheduler (absolute URLs in scheduled jobs)
    const baseUrl = resolveBaseUrlFromEnv({ localhostPort: PORT });
    startScheduler(baseUrl);

    // Strip Promo cron — check every hour
    console.log('🎨 Strip Promo scheduler started (every 60 min)');
    setInterval(() => runStripPromoCheck(), 60 * 60 * 1000);
    setTimeout(() => runStripPromoCheck(), 30 * 1000);

    const { runActivationReminders } = require('./engine/hr-activation');
    const dbModule = require('./db');
    function hrReminderDb(dbCtx) {
      if (!dbCtx || !dbCtx.pool) {
        console.warn('[hrReminder] db/pool non pronto, skip tick');
        return null;
      }
      return {
        pool: dbCtx.pool,
        getBrand: dbModule.getBrand,
        getTemplate: dbModule.getTemplate,
        listTemplates: dbModule.listTemplates,
        updateMemberRecord: dbModule.updateMemberRecord,
        updatePassInstance: dbModule.updatePassInstance,
        createPassInstance: dbModule.createPassInstance,
        logEvent: dbModule.logEvent,
        logEnrollmentAttempt: dbModule.logEnrollmentAttempt
      };
    }
    const runHrReminderTick = async () => {
      try {
        const deps = hrReminderDb(dbHandle);
        if (!deps) return;
        await runActivationReminders(deps);
      } catch (e) {
        console.error('[hrReminder] errore:', e);
      }
    };
    console.log('📧 Activation reminder cron started (every 6h)');

    const { scheduleCoinAnniversariesJob } = require('./engine/coin-anniversaries');
    scheduleCoinAnniversariesJob();
    setInterval(runHrReminderTick, 6 * 60 * 60 * 1000);
    setTimeout(runHrReminderTick, 2 * 60 * 1000);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

const dns = require('dns');
const { Pool } = require('pg');
const { randomBytes, createHash, randomUUID } = require('crypto');
const { normalizePublicImageUrl } = require('../engine/hub-logo-url');

// Railway private mesh: prefer IPv4 first (avoids ETIMEDOUT on broken IPv6 paths).
if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) {
  dns.setDefaultResultOrder('ipv4first');
}

function dbUrlNeedsFlexibleSsl(url) {
  if (!url) return false;
  if (/\.railway\.internal\b/i.test(url)) return false;
  return (
    url.includes('railway.app') ||
    url.includes('rlwy.net') ||
    url.includes('ondigitalocean.com') ||
    /\bsslmode=require\b/i.test(url)
  );
}

function poolSslForUrl(url) {
  return dbUrlNeedsFlexibleSsl(url) ? { rejectUnauthorized: false } : false;
}

function isUnresolvedRailwayRef(value) {
  return /^\$\{\{.+\}\}$/.test(String(value || '').trim());
}

/** Build URL when Railway injects PGHOST/PGUSER/... on the app service but DATABASE_URL was not referenced. */
function buildDatabaseUrlFromPgEnv() {
  const host = String(process.env.PGHOST || process.env.POSTGRES_HOST || '').trim();
  if (!host) return '';
  const port = String(process.env.PGPORT || process.env.POSTGRES_PORT || '5432').trim();
  const user = String(process.env.PGUSER || process.env.POSTGRES_USER || 'postgres').trim();
  const password = process.env.PGPASSWORD ?? process.env.POSTGRES_PASSWORD ?? '';
  const database = String(process.env.PGDATABASE || process.env.POSTGRES_DB || 'railway').trim();
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(String(password))}@${host}:${port}/${database}`;
}

/** Runtime DB URL: private Railway first; never fall back to DATABASE_PUBLIC_URL (egress fees). */
function resolveDatabaseUrl() {
  let direct = String(
    process.env.DATABASE_URL ||
    process.env.DATABASE_PRIVATE_URL ||
    ''
  ).trim();
  if (isUnresolvedRailwayRef(direct)) {
    console.warn('⚠ DATABASE_URL è un riferimento Railway non risolto (letterale ${{...}}). Controlla il nome del servizio Postgres.');
    direct = '';
  }
  if (direct) return direct;
  return buildDatabaseUrlFromPgEnv();
}

function describeDatabaseTarget(url) {
  if (!url) {
    return { ok: false, message: 'DATABASE_URL mancante sul servizio app' };
  }
  try {
    const normalized = url.replace(/^postgres:\/\//, 'postgresql://');
    const u = new URL(normalized);
    const host = u.hostname;
    const privateRailway = /\.railway\.internal$/i.test(host);
    const publicRailway = /(?:^|\.)railway\.app$/i.test(host) || /\.rlwy\.net$/i.test(host);
    return {
      ok: true,
      host,
      port: u.port || '5432',
      database: (u.pathname || '/').replace(/^\//, '') || 'railway',
      privateRailway,
      publicRailway
    };
  } catch (err) {
    return { ok: false, message: `DATABASE_URL non valida: ${err.message}` };
  }
}

function logDatabaseConnectionInfo() {
  const url = resolveDatabaseUrl();
  const info = describeDatabaseTarget(url);
  if (!info.ok) {
    console.error(`✗ ${info.message}`);
    if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID) {
      const svc = process.env.RAILWAY_SERVICE_NAME || 'FiloDiretto';
      console.error(`  Railway (${svc}): Variables → DATABASE_URL = \${{Postgres.DATABASE_URL}}`);
      console.error('  "Postgres" deve essere il nome esatto del servizio database nel progetto (case-sensitive).');
      console.error('  Non impostare DATABASE_URL sul servizio Postgres — solo sul servizio Node/app.');
      if (process.env.PGHOST) {
        console.error(`  PGHOST=${process.env.PGHOST} è presente; DATABASE_URL resta vuoto — aggiungi il reference sopra.`);
      }
    }
    return info;
  }
  const mode = info.privateRailway
    ? 'private (no egress)'
    : info.publicRailway
      ? 'PUBLIC — possibili costi egress'
      : 'custom';
  console.log(`DB connect → ${info.host}:${info.port}/${info.database} [${mode}]`);
  if (info.publicRailway) {
    console.warn(
      '⚠ DATABASE_URL punta a un endpoint pubblico Railway. Usa ${{Postgres.DATABASE_URL}} (postgres.railway.internal) per evitare egress.'
    );
  }
  if (process.env.DATABASE_PUBLIC_URL && !info.privateRailway) {
    console.warn('⚠ Per il runtime non usare DATABASE_PUBLIC_URL: solo DATABASE_URL privata.');
  }
  return info;
}

const databaseUrl = resolveDatabaseUrl();
const dbTargetInfo = logDatabaseConnectionInfo();

function uuidv4() {
  return randomUUID();
}

/** Empty connectionString makes node-pg default to localhost:5432 — do not create a pool without a URL. */
const pool = dbTargetInfo.ok
  ? new Pool({
      connectionString: databaseUrl,
      ssl: poolSslForUrl(databaseUrl),
      connectionTimeoutMillis: 15000,
      max: Number(process.env.PGPOOL_MAX) > 0 ? Number(process.env.PGPOOL_MAX) : 10
    })
  : null;

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Schema Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const SCHEMA = `
CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pass_templates (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  name TEXT NOT NULL,
  pass_type TEXT NOT NULL DEFAULT 'coupon',
  style JSONB NOT NULL DEFAULT '{}',
  fields JSONB NOT NULL DEFAULT '[]',
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  name TEXT NOT NULL,
  description TEXT,
  template_id TEXT REFERENCES pass_templates(id),
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  total_downloads INTEGER DEFAULT 0,
  total_installs INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pass_instances (
  id TEXT PRIMARY KEY,
  serial_number TEXT UNIQUE NOT NULL,
  template_id TEXT NOT NULL REFERENCES pass_templates(id),
  brand_id TEXT NOT NULL REFERENCES brands(id),
  campaign_id TEXT REFERENCES campaigns(id),
  field_values JSONB DEFAULT '{}',
  utm JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  device_token TEXT,
  auth_token TEXT NOT NULL,
  user_agent TEXT,
  referrer_url TEXT,
  google_update_count INTEGER DEFAULT 0,
  google_last_update_at TIMESTAMPTZ,
  google_last_update_status TEXT,
  is_test_device BOOLEAN DEFAULT FALSE,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  pass_id TEXT REFERENCES pass_instances(id),
  brand_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  device_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_registrations (
  id SERIAL PRIMARY KEY,
  device_library_id TEXT NOT NULL,
  push_token TEXT NOT NULL,
  serial_number TEXT NOT NULL REFERENCES pass_instances(serial_number),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_library_id, serial_number)
);

CREATE TABLE IF NOT EXISTS scheduled_push (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  campaign_id TEXT REFERENCES campaigns(id),
  channel TEXT DEFAULT 'apple',
  schedule_type TEXT NOT NULL DEFAULT 'once',
  schedule_time TEXT NOT NULL DEFAULT '09:00',
  schedule_days TEXT DEFAULT '',
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  update_pass BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_log (
  id SERIAL PRIMARY KEY,
  brand_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  campaign_id TEXT,
  strip_base64 TEXT,
  sent_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_jobs (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  error TEXT,
  progress JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audiences (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  rules JSONB NOT NULL DEFAULT '{}',
  query_spec JSONB DEFAULT '{}',
  source_prompt TEXT DEFAULT '',
  cached_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS holder_events (
  id BIGSERIAL PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  pass_id TEXT REFERENCES pass_instances(id) ON DELETE SET NULL,
  serial_number TEXT,
  event_category TEXT NOT NULL,
  event_action TEXT NOT NULL,
  target_type TEXT,
  target_key TEXT,
  target_label TEXT,
  target_url TEXT,
  device_id TEXT,
  session_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager',
  brand_id TEXT REFERENCES brands(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strip_promos (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  strip_base64 TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  push_message TEXT,
  push_frequency TEXT DEFAULT 'none',
  last_push_sent TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS creative_assets (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  segment TEXT NOT NULL CHECK (segment IN ('social', 'display', 'ctv_dooh')),
  format_key TEXT NOT NULL,
  format_label TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  title TEXT,
  headline TEXT,
  cta_text TEXT,
  ai_prompt TEXT,
  ai_model TEXT,
  source TEXT NOT NULL DEFAULT 'upload' CHECK (source IN ('upload', 'ai', 'template')),
  image_base64 TEXT,
  image_url TEXT,
  qr_embedded BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ad_events (
  id SERIAL PRIMARY KEY,
  brand_id TEXT NOT NULL,
  campaign_id TEXT,
  creative_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click', 'install')),
  ip TEXT,
  user_agent TEXT,
  referer TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ad_events_campaign ON ad_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_events_brand ON ad_events(brand_id);
CREATE INDEX IF NOT EXISTS idx_ad_events_type ON ad_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ad_events_created ON ad_events(created_at);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  type VARCHAR(20) NOT NULL DEFAULT 'generic',
  title VARCHAR(200),
  image_base64 TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_brand ON media(brand_id);

CREATE TABLE IF NOT EXISTS instant_win_campaigns (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('scratch', 'wheel', 'slots')),
  prize_name TEXT NOT NULL,
  prize_description TEXT,
  win_probability NUMERIC NOT NULL DEFAULT 0.1,
  max_plays_per_user INTEGER DEFAULT 1,
  total_budget INTEGER,
  total_wins INTEGER DEFAULT 0,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  strip_base64 TEXT,
  push_message TEXT,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instant_win_plays (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES instant_win_campaigns(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('win', 'lose')),
  prize_name TEXT,
  played_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gamification_campaigns (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  game_type TEXT NOT NULL CHECK (game_type IN ('quiz', 'memory', 'puzzle')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  gold_threshold_secs NUMERIC NOT NULL DEFAULT 15,
  silver_threshold_secs NUMERIC NOT NULL DEFAULT 30,
  bronze_threshold_secs NUMERIC NOT NULL DEFAULT 60,
  gold_prize TEXT NOT NULL DEFAULT '',
  silver_prize TEXT NOT NULL DEFAULT '',
  bronze_prize TEXT NOT NULL DEFAULT '',
  max_plays_per_user INTEGER DEFAULT 1,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  strip_base64 TEXT,
  push_message TEXT,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gamification_plays (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES gamification_campaigns(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  brand_id TEXT NOT NULL,
  completion_time_secs NUMERIC NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('gold', 'silver', 'bronze', 'none')),
  prize_name TEXT,
  score INTEGER DEFAULT 0,
  player_email TEXT,
  player_phone TEXT,
  player_first_name TEXT,
  player_last_name TEXT,
  privacy_accepted BOOLEAN DEFAULT FALSE,
  privacy_accepted_at TIMESTAMPTZ,
  played_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_callback_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_hash TEXT NOT NULL UNIQUE,
  object_id TEXT,
  event_type TEXT,
  pass_id TEXT,
  brand_id TEXT,
  payload JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT FALSE,
  process_status TEXT DEFAULT 'received',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Employee portal (passwordless magic link) — subject is pass_instances.id
CREATE TABLE IF NOT EXISTS pass_consents (
  id SERIAL PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES pass_instances(id) ON DELETE CASCADE,
  consent_type VARCHAR(64) NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT false,
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  ip_address VARCHAR(64),
  user_agent TEXT,
  privacy_policy_version VARCHAR(32),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pass_id, consent_type)
);

CREATE TABLE IF NOT EXISTS consent_log (
  id SERIAL PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES pass_instances(id) ON DELETE CASCADE,
  consent_type VARCHAR(64) NOT NULL,
  action VARCHAR(16) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(64),
  user_agent TEXT,
  privacy_policy_version VARCHAR(32)
);

CREATE TABLE IF NOT EXISTS gdpr_requests (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES pass_instances(id) ON DELETE CASCADE,
  brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  request_type VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  details TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT REFERENCES users(id),
  resolution_notes TEXT
);

CREATE TABLE IF NOT EXISTS portal_tokens (
  id SERIAL PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES pass_instances(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);
`;

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Init Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
async function getDb() {
  if (!pool) {
    const railway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID;
    const msg = railway
      ? 'DATABASE_URL mancante sul servizio app Railway. Variables → DATABASE_URL = ${{Postgres.DATABASE_URL}} (nome servizio Postgres corretto).'
      : 'DATABASE_URL mancante. Imposta DATABASE_URL in .env o nell\'hosting.';
    throw new Error(msg);
  }
  try {
    await pool.query(SCHEMA);
    console.log('[ok] Database schema initialized (PostgreSQL - Filo Diretto)');

    // Migrations
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS campaign_id TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS field_values JSONB DEFAULT '{}'`).catch(()=>{});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS utm JSONB DEFAULT '{}'`).catch(()=>{});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS device_token TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS user_agent TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS referrer_url TEXT`).catch(()=>{});
    // Campaigns columns added after initial schema
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS description TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS template_id TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS utm_source TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS utm_medium TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS utm_campaign TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS utm_content TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS utm_term TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ`).catch(()=>{});
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ`).catch(()=>{});
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_downloads INTEGER DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS total_installs INTEGER DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true`).catch(()=>{});
    await pool.query(`ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`).catch(()=>{});

    // pass_instances Ã¢ÂÂ columns added after initial schema
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS auth_token TEXT DEFAULT gen_random_uuid()::text`).catch(()=>{});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'`).catch(()=>{});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ DEFAULT NOW()`).catch(()=>{});

    // pass_instances Ã¢ÂÂ push tracking per pass
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ`).catch(()=>{});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS last_push_status TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS push_count INTEGER DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS google_update_count INTEGER DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS google_last_update_at TIMESTAMPTZ`).catch(()=>{});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS google_last_update_status TEXT`).catch(()=>{});

    // push_log Ã¢ÂÂ columns added after initial schema
    await pool.query(`ALTER TABLE push_log ADD COLUMN IF NOT EXISTS campaign_id TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE push_log ADD COLUMN IF NOT EXISTS sent_count INTEGER DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE push_log ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'apple'`).catch(()=>{});
    await pool.query(`ALTER TABLE push_log ADD COLUMN IF NOT EXISTS strip_base64 TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE push_log ADD COLUMN IF NOT EXISTS screen_alert VARCHAR(178)`).catch(()=>{});

    // scheduled_push Ã¢ÂÂ columns added after initial schema
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS campaign_id TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS schedule_type TEXT DEFAULT 'once'`).catch(()=>{});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS schedule_time TEXT DEFAULT '09:00'`).catch(()=>{});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS schedule_days TEXT DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ`).catch(()=>{});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ`).catch(()=>{});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true`).catch(()=>{});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS update_pass BOOLEAN DEFAULT true`).catch(()=>{});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'apple'`).catch(()=>{});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS audience_id TEXT`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audiences_brand ON audiences(brand_id)`).catch(()=>{});
    await pool.query(`ALTER TABLE audiences ADD COLUMN IF NOT EXISTS query_spec JSONB DEFAULT '{}'`).catch(()=>{});
    await pool.query(`ALTER TABLE audiences ADD COLUMN IF NOT EXISTS source_prompt TEXT DEFAULT ''`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_holder_events_brand_created ON holder_events(brand_id, created_at DESC)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_holder_events_serial ON holder_events(serial_number, created_at DESC)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_holder_events_action ON holder_events(brand_id, event_action)`).catch(()=>{});
    await pool.query(`CREATE TABLE IF NOT EXISTS push_assistant_log (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      user_id TEXT,
      prompt TEXT NOT NULL,
      proposal JSONB,
      final_payload JSONB,
      action TEXT NOT NULL DEFAULT 'planned',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_assistant_log_brand ON push_assistant_log(brand_id, created_at DESC)`).catch(()=>{});
    // Brand product line (Ads / HR / Engage / Live) — legacy brands default to ads
    await pool.query(`
      UPDATE brands
      SET config = COALESCE(config, '{}'::jsonb) || '{"product_line":"ads"}'::jsonb
      WHERE config->>'product_line' IS NULL
         OR config->>'product_line' = ''
         OR NOT (config->>'product_line' IN ('ads', 'hr', 'engage', 'live'))
    `).catch(() => {});
    await pool.query(`CREATE TABLE IF NOT EXISTS wai_log (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      user_id TEXT,
      prompt TEXT NOT NULL,
      intent TEXT,
      proposal JSONB,
      action TEXT DEFAULT 'planned',
      payload JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wai_log_brand ON wai_log(brand_id, created_at DESC)`).catch(()=>{});
    await pool.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_tokens(token_hash)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id, created_at DESC)`).catch(()=>{});
    await pool.query(`ALTER TABLE media ADD COLUMN IF NOT EXISTS campaign_id TEXT REFERENCES campaigns(id) ON DELETE SET NULL`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_media_campaign ON media(campaign_id)`).catch(()=>{});

    // events Ã¢ÂÂ columns added after initial schema
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS device_id TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'`).catch(()=>{});

    // instant_win_campaigns Ã¢ÂÂ columns added after initial schema
    // Old schema had "title" NOT NULL Ã¢ÂÂ drop constraint, keep column for compat
    await pool.query(`ALTER TABLE instant_win_campaigns ALTER COLUMN title DROP NOT NULL`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ALTER COLUMN title SET DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS brand_id TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS game_type TEXT NOT NULL DEFAULT 'scratch'`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS prize_name TEXT NOT NULL DEFAULT ''`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS prize_description TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS win_probability NUMERIC NOT NULL DEFAULT 0.1`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS max_plays_per_user INTEGER DEFAULT 1`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS total_budget INTEGER`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS total_wins INTEGER DEFAULT 0`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS strip_base64 TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS push_message TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_campaigns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`).catch(()=>{});

    // instant_win_plays Ã¢ÂÂ columns added after initial schema
    await pool.query(`ALTER TABLE instant_win_plays ADD COLUMN IF NOT EXISTS campaign_id TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_plays ADD COLUMN IF NOT EXISTS serial_number TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_plays ADD COLUMN IF NOT EXISTS brand_id TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_plays ADD COLUMN IF NOT EXISTS result TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_plays ADD COLUMN IF NOT EXISTS prize_name TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_plays ADD COLUMN IF NOT EXISTS played_at TIMESTAMPTZ DEFAULT NOW()`).catch(()=>{});
    // Player data collection (lead gen before game)
    await pool.query(`ALTER TABLE instant_win_plays ADD COLUMN IF NOT EXISTS player_email TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_plays ADD COLUMN IF NOT EXISTS player_phone TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_plays ADD COLUMN IF NOT EXISTS player_first_name TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_plays ADD COLUMN IF NOT EXISTS player_last_name TEXT`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_iw_plays_email ON instant_win_plays(player_email)`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_plays ADD COLUMN IF NOT EXISTS privacy_accepted BOOLEAN DEFAULT FALSE`).catch(()=>{});
    await pool.query(`ALTER TABLE instant_win_plays ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ`).catch(()=>{});

    // Indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_passes_brand ON pass_instances(brand_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_passes_campaign ON pass_instances(campaign_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_passes_brand_serial ON pass_instances(brand_id, serial_number)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_passes_brand_created ON pass_instances(brand_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_device_reg_serial ON device_registrations(serial_number)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_device_reg_push_token ON device_registrations(push_token) WHERE push_token IS NOT NULL AND push_token <> ''`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_jobs_brand_created ON push_jobs(brand_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_jobs_status_created ON push_jobs(status, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_push_log_brand_created ON push_log(brand_id, created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_scheduled_push_due ON scheduled_push(next_run_at) WHERE active = true`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_brand ON events(brand_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_brand ON campaigns(brand_id)`);
    // Instant Win indexes (after ALTER TABLEs ensure columns exist)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_iw_campaigns_brand ON instant_win_campaigns(brand_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_iw_campaigns_status ON instant_win_campaigns(status)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_iw_plays_campaign ON instant_win_plays(campaign_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_iw_plays_serial ON instant_win_plays(serial_number)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_iw_plays_brand ON instant_win_plays(brand_id)`).catch(()=>{});

    // Drop legacy member_id NOT NULL constraint (plays use serial_number, not member_id)
    await pool.query(`ALTER TABLE instant_win_plays ALTER COLUMN member_id DROP NOT NULL`).catch(()=>{});

    // Google Wallet columns
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS google_wallet_object_id TEXT`);
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS google_wallet_saved BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS google_installed_at TIMESTAMPTZ`);

    // Samsung Wallet (Partner loyalty card — refId per Get Card Data)
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS samsung_wallet_ref_id TEXT`);
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS samsung_wallet_saved BOOLEAN DEFAULT FALSE`);
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS samsung_installed_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS samsung_wallet_cc2 TEXT`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pass_samsung_ref ON pass_instances(samsung_wallet_ref_id) WHERE samsung_wallet_ref_id IS NOT NULL AND samsung_wallet_ref_id <> ''`);

    // Unified device tracking
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS device_id TEXT`);
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS device_source TEXT`);
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS is_test_device BOOLEAN DEFAULT FALSE`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_passes_brand_test_device ON pass_instances(brand_id, is_test_device) WHERE is_test_device = TRUE`);

    // Wallet callback telemetry + idempotency
    await pool.query(`CREATE TABLE IF NOT EXISTS wallet_callback_events (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      event_hash TEXT NOT NULL UNIQUE,
      object_id TEXT,
      event_type TEXT,
      pass_id TEXT,
      brand_id TEXT,
      payload JSONB DEFAULT '{}',
      processed BOOLEAN DEFAULT FALSE,
      process_status TEXT DEFAULT 'received',
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      processed_at TIMESTAMPTZ
    )`).catch(()=>{});
    await pool.query(`ALTER TABLE wallet_callback_events ADD COLUMN IF NOT EXISTS provider TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE wallet_callback_events ADD COLUMN IF NOT EXISTS event_hash TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE wallet_callback_events ADD COLUMN IF NOT EXISTS object_id TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE wallet_callback_events ADD COLUMN IF NOT EXISTS event_type TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE wallet_callback_events ADD COLUMN IF NOT EXISTS pass_id TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE wallet_callback_events ADD COLUMN IF NOT EXISTS brand_id TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE wallet_callback_events ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'`).catch(()=>{});
    await pool.query(`ALTER TABLE wallet_callback_events ADD COLUMN IF NOT EXISTS processed BOOLEAN DEFAULT FALSE`).catch(()=>{});
    await pool.query(`ALTER TABLE wallet_callback_events ADD COLUMN IF NOT EXISTS process_status TEXT DEFAULT 'received'`).catch(()=>{});
    await pool.query(`ALTER TABLE wallet_callback_events ADD COLUMN IF NOT EXISTS error_message TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE wallet_callback_events ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ`).catch(()=>{});
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_callback_event_hash ON wallet_callback_events(event_hash)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_callback_provider_created ON wallet_callback_events(provider, created_at DESC)`).catch(()=>{});

    // Gamification indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gam_campaigns_brand ON gamification_campaigns(brand_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gam_campaigns_status ON gamification_campaigns(status)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gam_plays_campaign ON gamification_plays(campaign_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gam_plays_serial ON gamification_plays(serial_number)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gam_plays_brand ON gamification_plays(brand_id)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gam_plays_email ON gamification_plays(player_email)`).catch(()=>{});

    // Employee portal tables (idempotent for existing deployments)
    await pool.query(`CREATE TABLE IF NOT EXISTS pass_consents (
      id SERIAL PRIMARY KEY,
      pass_id TEXT NOT NULL REFERENCES pass_instances(id) ON DELETE CASCADE,
      consent_type VARCHAR(64) NOT NULL,
      granted BOOLEAN NOT NULL DEFAULT false,
      granted_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      ip_address VARCHAR(64),
      user_agent TEXT,
      privacy_policy_version VARCHAR(32),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(pass_id, consent_type)
    )`).catch(() => {});
    await pool.query(`CREATE TABLE IF NOT EXISTS consent_log (
      id SERIAL PRIMARY KEY,
      pass_id TEXT NOT NULL REFERENCES pass_instances(id) ON DELETE CASCADE,
      consent_type VARCHAR(64) NOT NULL,
      action VARCHAR(16) NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ip_address VARCHAR(64),
      user_agent TEXT,
      privacy_policy_version VARCHAR(32)
    )`).catch(() => {});
    await pool.query(`CREATE TABLE IF NOT EXISTS gdpr_requests (
      id TEXT PRIMARY KEY,
      pass_id TEXT NOT NULL REFERENCES pass_instances(id) ON DELETE CASCADE,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      request_type VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      details TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      resolved_by TEXT REFERENCES users(id),
      resolution_notes TEXT
    )`).catch(() => {});
    await pool.query(`CREATE TABLE IF NOT EXISTS portal_tokens (
      id SERIAL PRIMARY KEY,
      pass_id TEXT NOT NULL REFERENCES pass_instances(id) ON DELETE CASCADE,
      token_hash VARCHAR(128) NOT NULL UNIQUE,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    )`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pass_consents_pass ON pass_consents(pass_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_consent_log_pass_ts ON consent_log(pass_id, timestamp DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gdpr_requests_brand_status ON gdpr_requests(brand_id, status)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gdpr_requests_pass ON gdpr_requests(pass_id, requested_at DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_portal_tokens_pass ON portal_tokens(pass_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_portal_tokens_hash ON portal_tokens(token_hash)`).catch(() => {});

    // ── Filo Diretto HR: pass back, members, dynamic links ──
    await pool.query(`CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      pass_id TEXT REFERENCES pass_instances(id) ON DELETE SET NULL,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      employee_id VARCHAR(64),
      department VARCHAR(128),
      office_location VARCHAR(255),
      hire_date DATE,
      manager_name VARCHAR(128),
      manager_email VARCHAR(255),
      activation_status VARCHAR(32) DEFAULT 'candidate',
      activation_token VARCHAR(255),
      activation_token_expires_at TIMESTAMPTZ,
      invited_at TIMESTAMPTZ,
      activated_at TIMESTAMPTZ,
      activation_source VARCHAR(32),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await ensureMembersHrSchema();

    await pool.query(`ALTER TABLE pass_templates ADD COLUMN IF NOT EXISTS back_fixed_link_label VARCHAR(64)`).catch(() => {});
    await pool.query(`ALTER TABLE pass_templates ADD COLUMN IF NOT EXISTS back_fixed_link_url VARCHAR(512)`).catch(() => {});

    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS dynamic_link_label VARCHAR(64)`).catch(() => {});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS dynamic_link_url VARCHAR(512)`).catch(() => {});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS dynamic_link_set_at TIMESTAMPTZ`).catch(() => {});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS dynamic_link_expires_at TIMESTAMPTZ`).catch(() => {});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS push_announcement JSONB`).catch(() => {});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS push_strip_base64 TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS member_id TEXT REFERENCES members(id) ON DELETE SET NULL`).catch(() => {});
    await pool.query(`ALTER TABLE pass_instances ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ`).catch(() => {});

    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS hr_email VARCHAR(255)`).catch(() => {});
    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS hr_phone VARCHAR(64)`).catch(() => {});
    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS dpo_email VARCHAR(255)`).catch(() => {});
    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(64)`).catch(() => {});
    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS back_resources JSONB DEFAULT '[]'::jsonb`).catch(() => {});
    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS back_documents JSONB DEFAULT '[]'::jsonb`).catch(() => {});
    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS allowed_email_domains TEXT[] DEFAULT '{}'`).catch(() => {});
    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS public_qr_enabled BOOLEAN DEFAULT false`).catch(() => {});
    await pool.query(`ALTER TABLE brands ADD COLUMN IF NOT EXISTS public_qr_slug VARCHAR(64)`).catch(() => {});
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_qr_slug ON brands(public_qr_slug) WHERE public_qr_slug IS NOT NULL`
    ).catch(() => {});

    await pool.query(`ALTER TABLE pass_templates ADD COLUMN IF NOT EXISTS hr_email VARCHAR(255)`).catch(() => {});
    await pool.query(`ALTER TABLE pass_templates ADD COLUMN IF NOT EXISTS hr_phone VARCHAR(64)`).catch(() => {});
    await pool.query(`ALTER TABLE pass_templates ADD COLUMN IF NOT EXISTS dpo_email VARCHAR(255)`).catch(() => {});
    await pool.query(`ALTER TABLE pass_templates ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(64)`).catch(() => {});
    await pool.query(`ALTER TABLE pass_templates ADD COLUMN IF NOT EXISTS back_resources JSONB DEFAULT '[]'::jsonb`).catch(() => {});
    await pool.query(`ALTER TABLE pass_templates ADD COLUMN IF NOT EXISTS back_documents JSONB DEFAULT '[]'::jsonb`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS enrollment_attempts (
      id SERIAL PRIMARY KEY,
      brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
      email_attempted VARCHAR(255),
      ip_address VARCHAR(64),
      user_agent TEXT,
      result VARCHAR(32),
      attempted_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_enrollment_attempts_ip ON enrollment_attempts(ip_address, attempted_at DESC)`
    ).catch(() => {});
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_enrollment_attempts_brand ON enrollment_attempts(brand_id, attempted_at DESC)`
    ).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS import_errors (
      id SERIAL PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      import_batch_id VARCHAR(64),
      row_number INTEGER,
      row_data JSONB,
      error_reason VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_import_errors_brand_batch ON import_errors(brand_id, import_batch_id, created_at DESC)`
    ).catch(() => {});

    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS include_pass_link BOOLEAN DEFAULT false`).catch(() => {});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS pass_link_url VARCHAR(512)`).catch(() => {});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS pass_link_label VARCHAR(64)`).catch(() => {});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS pass_link_expires_at TIMESTAMPTZ`).catch(() => {});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS back_details TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS strip_base64 TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE scheduled_push ADD COLUMN IF NOT EXISTS screen_alert VARCHAR(178)`).catch(() => {});

    await pool.query(`UPDATE pass_instances SET activated_at = created_at WHERE activated_at IS NULL`).catch(() => {});

    await pool.query(`
      INSERT INTO members (id, brand_id, pass_id, first_name, last_name, employee_id, department, office_location, manager_name, manager_email)
      SELECT
        gen_random_uuid()::text,
        pi.brand_id,
        pi.id,
        NULLIF(TRIM(pi.field_values->>'nome'), ''),
        NULLIF(TRIM(pi.field_values->>'cognome'), ''),
        NULLIF(COALESCE(pi.field_values->>'matricola', pi.field_values->>'badge_id'), ''),
        NULLIF(COALESCE(pi.field_values->>'department', pi.field_values->>'reparto'), ''),
        NULLIF(COALESCE(pi.field_values->>'office_location', pi.field_values->>'sede'), ''),
        NULLIF(TRIM(pi.field_values->>'manager_name'), ''),
        NULLIF(TRIM(pi.field_values->>'manager_email'), '')
      FROM pass_instances pi
      WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.pass_id = pi.id)
        AND (
          pi.field_values->>'nome' IS NOT NULL
          OR pi.field_values->>'first_name' IS NOT NULL
          OR pi.field_values->>'matricola' IS NOT NULL
          OR pi.field_values->>'badge_id' IS NOT NULL
        )
    `).catch(() => {});

    await pool.query(`
      UPDATE pass_instances pi
      SET member_id = m.id
      FROM members m
      WHERE m.pass_id = pi.id AND pi.member_id IS NULL
    `).catch(() => {});

    // HUB Convenzioni
    await pool.query(`CREATE TABLE IF NOT EXISTS merchants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      logo_url TEXT,
      description TEXT,
      discount_label TEXT NOT NULL,
      conditions TEXT,
      valid_from DATE,
      valid_until DATE,
      active BOOLEAN DEFAULT TRUE,
      online_enabled BOOLEAN DEFAULT FALSE,
      online_url TEXT,
      online_promo_code TEXT,
      physical_enabled BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_merchants_brand ON merchants(brand_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_merchants_active ON merchants(brand_id, active) WHERE active = TRUE`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_merchants_category ON merchants(brand_id, category)`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS merchant_locations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      address TEXT NOT NULL,
      city TEXT,
      province TEXT,
      postal_code TEXT,
      country TEXT DEFAULT 'IT',
      latitude DECIMAL(10, 8),
      longitude DECIMAL(11, 8),
      geofence_radius_m INTEGER DEFAULT 150,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_merchant_locations_merchant ON merchant_locations(merchant_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_merchant_locations_geo ON merchant_locations(latitude, longitude)`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS convention_activations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      pass_serial TEXT NOT NULL,
      user_id TEXT,
      activation_type TEXT NOT NULL,
      location_id UUID REFERENCES merchant_locations(id),
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activations_brand_merchant ON convention_activations(brand_id, merchant_id)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activations_pass ON convention_activations(pass_serial)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_activations_created ON convention_activations(created_at DESC)`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS hub_settings (
      brand_id TEXT PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
      logo_url TEXT,
      accent_color TEXT DEFAULT '#8B5CF6',
      welcome_message TEXT,
      categories_enabled JSONB DEFAULT '["food","fitness","retail","salute","viaggi","tech","servizi"]'::jsonb,
      geofencing_enabled BOOLEAN DEFAULT TRUE,
      geofencing_max_per_day INTEGER DEFAULT 3,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});

    // PGA — People Growth Activator
    await pool.query(`CREATE TABLE IF NOT EXISTS coin_actions_config (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      action_key TEXT NOT NULL,
      coin_amount INTEGER NOT NULL,
      description TEXT,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(brand_id, action_key)
    )`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS coin_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      pass_serial TEXT NOT NULL,
      user_id TEXT,
      action_key TEXT NOT NULL,
      coin_amount INTEGER NOT NULL,
      description TEXT,
      related_entity_type TEXT,
      related_entity_id UUID,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_coin_ledger_pass ON coin_ledger(pass_serial, created_at DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_coin_ledger_brand ON coin_ledger(brand_id, created_at DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_coin_ledger_action ON coin_ledger(brand_id, action_key)`).catch(() => {});

    await pool.query(`
      CREATE OR REPLACE VIEW pass_coin_balance AS
      SELECT
        pass_serial,
        brand_id,
        COALESCE(SUM(coin_amount), 0) AS balance,
        MAX(created_at) AS last_activity,
        COUNT(*) FILTER (WHERE coin_amount > 0) AS total_accruals,
        COUNT(*) FILTER (WHERE coin_amount < 0) AS total_redemptions
      FROM coin_ledger
      GROUP BY pass_serial, brand_id
    `).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS experiences_catalog (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      coin_cost INTEGER NOT NULL,
      max_per_user_per_year INTEGER,
      max_total_per_month INTEGER,
      internal BOOLEAN DEFAULT TRUE,
      external_provider TEXT,
      external_cost_eur DECIMAL(10,2),
      requires_booking BOOLEAN DEFAULT TRUE,
      active BOOLEAN DEFAULT TRUE,
      image_url TEXT,
      display_order INTEGER DEFAULT 100,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(brand_id, key)
    )`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_experiences_brand_active ON experiences_catalog(brand_id, active) WHERE active = TRUE`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_experiences_category ON experiences_catalog(brand_id, category)`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS experience_bookings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      experience_id UUID NOT NULL REFERENCES experiences_catalog(id) ON DELETE CASCADE,
      pass_serial TEXT NOT NULL,
      user_id TEXT,
      coin_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      scheduled_at TIMESTAMPTZ,
      notes TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bookings_brand ON experience_bookings(brand_id, status)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bookings_pass ON experience_bookings(pass_serial, created_at DESC)`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bookings_experience ON experience_bookings(experience_id, status)`).catch(() => {});

    await pool.query(`CREATE TABLE IF NOT EXISTS pga_settings (
      brand_id TEXT PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
      enabled BOOLEAN DEFAULT FALSE,
      welcome_message TEXT,
      annual_budget_external_eur DECIMAL(10,2),
      annual_budget_used_eur DECIMAL(10,2) DEFAULT 0,
      notify_hr_on_booking BOOLEAN DEFAULT TRUE,
      notify_hr_email TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch(() => {});

    // Seed admin
    await seedAdminUser();
    await ensureAllowlistPlatformAdmins();
    await bootstrapSuperAdminFromEnv();
    await bootstrapUserBrandAssignmentsFromEnv();
    return { pool };

  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

function saveDb() {
  // No-op: PostgreSQL persists automatically
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Brands Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function createBrand(data) {
  const id = data.id || uuidv4();
  const { name, slug, config = {} } = data;
  if (!name || !slug) throw new Error('Brand name and slug are required');
  const configObj = typeof config === 'string' ? JSON.parse(config) : config;
  await pool.query(
    `INSERT INTO brands (id, name, slug, config) VALUES ($1, $2, $3, $4)`,
    [id, name, slug, JSON.stringify(configObj)]
  );
  return { id, name, slug, config: configObj };
}

async function getBrand(id) {
  const result = await pool.query('SELECT * FROM brands WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { ...row, config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config };
}

async function getBrandBySlug(slug) {
  const result = await pool.query('SELECT * FROM brands WHERE slug = $1', [slug]);
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return { ...row, config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config };
}

async function listBrands() {
  const result = await pool.query('SELECT * FROM brands ORDER BY created_at DESC');
  return result.rows.map(row => ({
    ...row,
    config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config
  }));
}

async function updateBrand(id, data) {
  const current = await getBrand(id);
  if (!current) return null;
  const newName = data.name || current.name;
  const newSlug = data.slug || current.slug;
  let newConfig = current.config || {};
  if (data.config) newConfig = { ...newConfig, ...data.config };

  const sets = ['name = $1', 'slug = $2', 'config = $3', 'updated_at = NOW()'];
  const vals = [newName, newSlug, JSON.stringify(newConfig)];
  let idx = 4;

  const scalarCols = ['hr_email', 'hr_phone', 'dpo_email', 'emergency_phone'];
  for (const col of scalarCols) {
    if (data[col] !== undefined) {
      sets.push(`${col} = $${idx++}`);
      vals.push(data[col] || null);
    }
  }
  if (data.back_resources !== undefined) {
    const arr = Array.isArray(data.back_resources) ? data.back_resources : [];
    sets.push(`back_resources = $${idx++}`);
    vals.push(JSON.stringify(arr.slice(0, 5)));
  }
  if (data.back_documents !== undefined) {
    const arr = Array.isArray(data.back_documents) ? data.back_documents : [];
    sets.push(`back_documents = $${idx++}`);
    vals.push(JSON.stringify(arr.slice(0, 5)));
  }
  if (data.allowed_email_domains !== undefined) {
    const domains = Array.isArray(data.allowed_email_domains) ? data.allowed_email_domains : [];
    sets.push(`allowed_email_domains = $${idx++}`);
    vals.push(domains.map((d) => String(d).trim().toLowerCase()).filter(Boolean));
  }
  if (data.public_qr_enabled !== undefined) {
    sets.push(`public_qr_enabled = $${idx++}`);
    vals.push(!!data.public_qr_enabled);
  }
  if (data.public_qr_slug !== undefined) {
    sets.push(`public_qr_slug = $${idx++}`);
    vals.push(data.public_qr_slug ? String(data.public_qr_slug).trim() : null);
  }

  vals.push(id);
  await pool.query(`UPDATE brands SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
  return getBrand(id);
}

async function deleteBrand(id) {
  await pool.query('DELETE FROM device_registrations WHERE serial_number IN (SELECT serial_number FROM pass_instances WHERE brand_id = $1)', [id]);
  await pool.query('DELETE FROM events WHERE brand_id = $1', [id]);
  await pool.query('DELETE FROM push_log WHERE brand_id = $1', [id]);
  await pool.query('DELETE FROM scheduled_push WHERE brand_id = $1', [id]);
  await pool.query('DELETE FROM audiences WHERE brand_id = $1', [id]);
  await pool.query('DELETE FROM holder_events WHERE brand_id = $1', [id]);
  await pool.query('DELETE FROM pass_instances WHERE brand_id = $1', [id]);
  await pool.query('DELETE FROM members WHERE brand_id = $1', [id]);
  await pool.query('DELETE FROM import_errors WHERE brand_id = $1', [id]);
  await pool.query('DELETE FROM campaigns WHERE brand_id = $1', [id]);
  await pool.query('DELETE FROM strip_promos WHERE brand_id = $1', [id]);
  await pool.query('DELETE FROM pass_templates WHERE brand_id = $1', [id]);
  await pool.query('DELETE FROM brands WHERE id = $1', [id]);
  return { success: true };
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Templates Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

function parseTemplateRow(row) {
  if (!row) return null;
  const parseJson = (v, fallback) => {
    if (v == null) return fallback;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch { return fallback; }
  };
  const backResources = parseJson(row.back_resources, []);
  const backDocuments = parseJson(row.back_documents, []);
  return {
    ...row,
    style: parseJson(row.style, {}),
    fields: parseJson(row.fields, {}),
    config: parseJson(row.config, {}),
    back_resources: Array.isArray(backResources) ? backResources : [],
    back_documents: Array.isArray(backDocuments) ? backDocuments : []
  };
}

async function createTemplate(data) {
  const id = data.id || uuidv4();
  const {
    brand_id, name, pass_type = 'coupon', style = {}, fields = [], config = {},
    back_fixed_link_label = null, back_fixed_link_url = null,
    hr_email = null, hr_phone = null, dpo_email = null, emergency_phone = null,
    back_resources = [], back_documents = []
  } = data;
  if (!brand_id || !name) throw new Error('Brand ID and template name are required');
  const styleObj = typeof style === 'string' ? JSON.parse(style) : style;
  const fieldsObj = typeof fields === 'string' ? JSON.parse(fields) : fields;
  const configObj = typeof config === 'string' ? JSON.parse(config) : config;
  const resourcesArr = Array.isArray(back_resources) ? back_resources.slice(0, 5) : [];
  const documentsArr = Array.isArray(back_documents) ? back_documents.slice(0, 5) : [];
  await pool.query(
    `INSERT INTO pass_templates (
       id, brand_id, name, pass_type, style, fields, config,
       back_fixed_link_label, back_fixed_link_url,
       hr_email, hr_phone, dpo_email, emergency_phone, back_resources, back_documents
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      id, brand_id, name, pass_type,
      JSON.stringify(styleObj), JSON.stringify(fieldsObj), JSON.stringify(configObj),
      back_fixed_link_label, back_fixed_link_url,
      hr_email, hr_phone, dpo_email, emergency_phone,
      JSON.stringify(resourcesArr), JSON.stringify(documentsArr)
    ]
  );
  return parseTemplateRow({
    id, brand_id, name, pass_type,
    style: styleObj, fields: fieldsObj, config: configObj,
    back_fixed_link_label, back_fixed_link_url,
    hr_email, hr_phone, dpo_email, emergency_phone,
    back_resources: resourcesArr, back_documents: documentsArr
  });
}

async function getTemplate(id) {
  const result = await pool.query('SELECT * FROM pass_templates WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  return parseTemplateRow(result.rows[0]);
}

async function listTemplates(brandId) {
  const result = await pool.query(
    'SELECT * FROM pass_templates WHERE brand_id = $1 ORDER BY created_at DESC', [brandId]
  );
  return result.rows.map(parseTemplateRow);
}

async function updateTemplate(id, data) {
  const sets = [];
  const vals = [];
  let idx = 1;
  if (data.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(data.name); }
  if (data.pass_type !== undefined) { sets.push(`pass_type = $${idx++}`); vals.push(data.pass_type); }
  if (data.style !== undefined) { sets.push(`style = $${idx++}`); vals.push(JSON.stringify(data.style)); }
  if (data.fields !== undefined) { sets.push(`fields = $${idx++}`); vals.push(JSON.stringify(data.fields)); }
  if (data.config !== undefined) { sets.push(`config = $${idx++}`); vals.push(JSON.stringify(data.config)); }
  if (data.back_fixed_link_label !== undefined) { sets.push(`back_fixed_link_label = $${idx++}`); vals.push(data.back_fixed_link_label || null); }
  if (data.back_fixed_link_url !== undefined) { sets.push(`back_fixed_link_url = $${idx++}`); vals.push(data.back_fixed_link_url || null); }
  const tplScalarCols = ['hr_email', 'hr_phone', 'dpo_email', 'emergency_phone'];
  for (const col of tplScalarCols) {
    if (data[col] !== undefined) {
      sets.push(`${col} = $${idx++}`);
      vals.push(data[col] || null);
    }
  }
  if (data.back_resources !== undefined) {
    const arr = Array.isArray(data.back_resources) ? data.back_resources : [];
    sets.push(`back_resources = $${idx++}`);
    vals.push(JSON.stringify(arr.slice(0, 5)));
  }
  if (data.back_documents !== undefined) {
    const arr = Array.isArray(data.back_documents) ? data.back_documents : [];
    sets.push(`back_documents = $${idx++}`);
    vals.push(JSON.stringify(arr.slice(0, 5)));
  }
  sets.push(`updated_at = NOW()`);
  vals.push(id);
  const result = await pool.query(
    `UPDATE pass_templates SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, vals
  );
  return result.rows[0] ? parseTemplateRow(result.rows[0]) : null;
}

async function deleteTemplate(id) {
  await pool.query('UPDATE campaigns SET template_id = NULL, updated_at = NOW() WHERE template_id = $1', [id]);
  await pool.query('DELETE FROM device_registrations WHERE serial_number IN (SELECT serial_number FROM pass_instances WHERE template_id = $1)', [id]);
  await pool.query('DELETE FROM events WHERE pass_id IN (SELECT id FROM pass_instances WHERE template_id = $1)', [id]);
  await pool.query('DELETE FROM pass_instances WHERE template_id = $1', [id]);
  await pool.query('DELETE FROM pass_templates WHERE id = $1', [id]);
  return { success: true };
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Campaigns Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function createCampaign(data) {
  const id = data.id || uuidv4();
  const { brand_id, name, description, template_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, start_date, end_date } = data;
  if (!brand_id || !name) throw new Error('Brand ID and campaign name are required');
  await pool.query(
    `INSERT INTO campaigns (id, brand_id, name, description, template_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, start_date, end_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, brand_id, name, description || null, template_id || null, utm_source || null, utm_medium || null, utm_campaign || null, utm_content || null, utm_term || null, start_date || null, end_date || null]
  );
  return { id, brand_id, name, description, template_id, active: true, total_downloads: 0, total_installs: 0 };
}

async function getCampaign(id) {
  const res = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function listCampaigns(brand_id) {
  const res = await pool.query('SELECT * FROM campaigns WHERE brand_id = $1 ORDER BY created_at DESC', [brand_id]);
  return res.rows;
}

async function updateCampaign(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  for (const key of ['name', 'description', 'template_id', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'start_date', 'end_date', 'active']) {
    if (data[key] !== undefined) { fields.push(`${key} = $${idx}`); values.push(data[key]); idx++; }
  }
  if (fields.length === 0) return getCampaign(id);
  fields.push('updated_at = NOW()');
  values.push(id);
  await pool.query(`UPDATE campaigns SET ${fields.join(', ')} WHERE id = $${idx}`, values);
  return getCampaign(id);
}

async function deleteCampaign(id) {
  // Nullify campaign_id on passes (don't delete passes)
  await pool.query('UPDATE pass_instances SET campaign_id = NULL WHERE campaign_id = $1', [id]);
  await pool.query('DELETE FROM campaigns WHERE id = $1', [id]);
  return { success: true };
}

async function incrementCampaignDownloads(id) {
  await pool.query('UPDATE campaigns SET total_downloads = total_downloads + 1 WHERE id = $1', [id]);
}

async function incrementCampaignInstalls(id) {
  await pool.query('UPDATE campaigns SET total_installs = total_installs + 1 WHERE id = $1', [id]);
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Pass Instances Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function createPassInstance(data) {
  const id = data.id || uuidv4();
  const serial_number = data.serial_number || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { template_id, brand_id, campaign_id = null, field_values = {}, utm = {}, device_token = null, user_agent = null, referrer_url = null } = data;
  const auth_token = data.auth_token || uuidv4();
  if (!template_id || !brand_id) throw new Error('Template ID and Brand ID are required');
  const fieldObj = typeof field_values === 'string' ? JSON.parse(field_values) : { ...field_values };
  const utmObj = typeof utm === 'string' ? JSON.parse(utm) : utm;
  await pool.query(
    `INSERT INTO pass_instances (id, serial_number, template_id, brand_id, campaign_id, field_values, utm, device_token, auth_token, user_agent, referrer_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [id, serial_number, template_id, brand_id, campaign_id, JSON.stringify(fieldObj), JSON.stringify(utmObj), device_token, auth_token, user_agent, referrer_url]
  );
  return { id, serial_number, template_id, brand_id, campaign_id, field_values: fieldObj, utm: utmObj, device_token, auth_token, user_agent, referrer_url, status: 'active' };
}

async function getPassInstance(id) {
  const result = await pool.query('SELECT * FROM pass_instances WHERE id = $1', [id]);
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

async function getPassBySerial(serial) {
  const result = await pool.query('SELECT * FROM pass_instances WHERE serial_number = $1', [serial]);
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

async function updatePassInstance(id, data) {
  const updates = [];
  const values = [];
  let p = 0;
  if (data.status) { p++; updates.push(`status = $${p}`); values.push(data.status); }
  if (data.device_token !== undefined) { p++; updates.push(`device_token = $${p}`); values.push(data.device_token); }
  if (data.field_values) { p++; updates.push(`field_values = $${p}`); values.push(JSON.stringify(data.field_values)); }
  if (data.google_wallet_object_id !== undefined) { p++; updates.push(`google_wallet_object_id = $${p}`); values.push(data.google_wallet_object_id); }
  if (data.google_wallet_saved !== undefined) { p++; updates.push(`google_wallet_saved = $${p}`); values.push(!!data.google_wallet_saved); }
  if (data.google_installed_at !== undefined) { p++; updates.push(`google_installed_at = $${p}`); values.push(data.google_installed_at); }
  if (data.samsung_wallet_ref_id !== undefined) { p++; updates.push(`samsung_wallet_ref_id = $${p}`); values.push(data.samsung_wallet_ref_id); }
  if (data.samsung_wallet_saved !== undefined) { p++; updates.push(`samsung_wallet_saved = $${p}`); values.push(!!data.samsung_wallet_saved); }
  if (data.samsung_installed_at !== undefined) { p++; updates.push(`samsung_installed_at = $${p}`); values.push(data.samsung_installed_at); }
  if (data.samsung_wallet_cc2 !== undefined) { p++; updates.push(`samsung_wallet_cc2 = $${p}`); values.push(data.samsung_wallet_cc2); }
  if (data.device_id !== undefined) { p++; updates.push(`device_id = $${p}`); values.push(data.device_id); }
  if (data.device_source !== undefined) { p++; updates.push(`device_source = $${p}`); values.push(data.device_source); }
  if (data.is_test_device !== undefined) { p++; updates.push(`is_test_device = $${p}`); values.push(!!data.is_test_device); }
  if (data.member_id !== undefined) { p++; updates.push(`member_id = $${p}`); values.push(data.member_id); }
  if (data.activated_at !== undefined) { p++; updates.push(`activated_at = $${p}`); values.push(data.activated_at); }
  if (data.dynamic_link_label !== undefined) { p++; updates.push(`dynamic_link_label = $${p}`); values.push(data.dynamic_link_label); }
  if (data.dynamic_link_url !== undefined) { p++; updates.push(`dynamic_link_url = $${p}`); values.push(data.dynamic_link_url); }
  if (data.dynamic_link_set_at !== undefined) { p++; updates.push(`dynamic_link_set_at = $${p}`); values.push(data.dynamic_link_set_at); }
  if (data.dynamic_link_expires_at !== undefined) { p++; updates.push(`dynamic_link_expires_at = $${p}`); values.push(data.dynamic_link_expires_at); }
  if (updates.length === 0) return getPassInstance(id);
  updates.push('last_updated = NOW()');
  p++; values.push(id);
  await pool.query(`UPDATE pass_instances SET ${updates.join(', ')} WHERE id = $${p}`, values);
  return getPassInstance(id);
}

async function touchPass(id) {
  await pool.query('UPDATE pass_instances SET last_updated = NOW() WHERE id = $1', [id]);
  return { success: true };
}

async function touchPassesByIds(ids) {
  const passIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!passIds.length) return { touched: 0 };
  const result = await pool.query(
    'UPDATE pass_instances SET last_updated = NOW() WHERE id = ANY($1::text[])',
    [passIds]
  );
  return { touched: result.rowCount || 0 };
}

async function touchPassesForBrand(brandId, passIds = null) {
  if (Array.isArray(passIds) && passIds.length) {
    return touchPassesByIds(passIds);
  }
  const result = await pool.query(
    'UPDATE pass_instances SET last_updated = NOW() WHERE brand_id = $1',
    [brandId]
  );
  return { touched: result.rowCount || 0 };
}

async function markPassesPushDelivered(serialNumbers) {
  const serials = Array.isArray(serialNumbers) ? serialNumbers.filter(Boolean) : [];
  if (!serials.length) return { updated: 0 };
  const result = await pool.query(
    `UPDATE pass_instances
     SET last_push_at = NOW(),
         last_push_status = 'delivered',
         push_count = COALESCE(push_count, 0) + 1
     WHERE serial_number = ANY($1::text[])`,
    [serials]
  );
  return { updated: result.rowCount || 0 };
}

async function markPassPushStatus(serialNumber, status) {
  if (!serialNumber) return;
  await pool.query(
    `UPDATE pass_instances
     SET last_push_at = NOW(),
         last_push_status = $1,
         push_count = COALESCE(push_count, 0) + 1
     WHERE serial_number = $2`,
    [status, serialNumber]
  );
}

async function markGoogleWalletUpdateStatus(serialNumber, status) {
  if (!serialNumber) return { updated: 0 };
  const okStatus = status === 'delivered' || status === 'silent' || status === 'updated';
  const result = await pool.query(
    `UPDATE pass_instances
     SET google_last_update_at = NOW(),
         google_last_update_status = $1,
         google_update_count = COALESCE(google_update_count, 0) + CASE WHEN $2 THEN 1 ELSE 0 END
     WHERE serial_number = $3`,
    [status || 'unknown', okStatus, serialNumber]
  );
  return { updated: result.rowCount || 0 };
}

async function createPushJob({ brand_id, payload }) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO push_jobs (id, brand_id, status, payload)
     VALUES ($1, $2, 'queued', $3::jsonb)`,
    [id, brand_id, JSON.stringify(payload || {})]
  );
  return getPushJob(id);
}

async function getPushJob(id) {
  const result = await pool.query('SELECT * FROM push_jobs WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function claimPushJob(id) {
  const result = await pool.query(
    `UPDATE push_jobs
     SET status = 'running',
         started_at = NOW(),
         progress = $2::jsonb
     WHERE id = $1 AND status = 'queued'
     RETURNING *`,
    [id, JSON.stringify({ phase: 'starting' })]
  );
  return result.rows[0] || null;
}

async function updatePushJob(id, fields = {}) {
  const updates = [];
  const values = [];
  let p = 1;

  if (fields.status !== undefined) {
    updates.push(`status = $${p++}`);
    values.push(fields.status);
  }
  if (fields.result !== undefined) {
    updates.push(`result = $${p++}::jsonb`);
    values.push(JSON.stringify(fields.result));
  }
  if (fields.error !== undefined) {
    updates.push(`error = $${p++}`);
    values.push(fields.error);
  }
  if (fields.progress !== undefined) {
    updates.push(`progress = $${p++}::jsonb`);
    values.push(JSON.stringify(fields.progress));
  }
  if (fields.started_at !== undefined) {
    updates.push(`started_at = $${p++}`);
    values.push(fields.started_at);
  }
  if (fields.completed_at !== undefined) {
    updates.push(`completed_at = $${p++}`);
    values.push(fields.completed_at);
  }

  if (!updates.length) return getPushJob(id);
  values.push(id);
  await pool.query(`UPDATE push_jobs SET ${updates.join(', ')} WHERE id = $${p}`, values);
  return getPushJob(id);
}

/** Legacy DBs may have an old `members` table without HR columns (e.g. pass_id). */
async function ensureMembersHrSchema() {
  const exists = await pool.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'members' LIMIT 1`
  );
  if (!exists.rows.length) {
    await pool.query(`CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      pass_id TEXT,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      employee_id VARCHAR(64),
      department VARCHAR(128),
      office_location VARCHAR(255),
      hire_date DATE,
      manager_name VARCHAR(128),
      manager_email VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  }

  const colRes = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'members'`
  );
  const have = new Set(colRes.rows.map((r) => r.column_name));

  const addColumn = async (name, ddl) => {
    if (have.has(name)) return;
    await pool.query(`ALTER TABLE members ADD COLUMN IF NOT EXISTS ${name} ${ddl}`);
    have.add(name);
    console.log(`[schema] members.${name} added`);
  };

  await addColumn('brand_id', 'TEXT');
  await addColumn('pass_id', 'TEXT');
  await addColumn('first_name', 'TEXT');
  await addColumn('last_name', 'TEXT');
  await addColumn('email', 'TEXT');
  await addColumn('employee_id', 'VARCHAR(64)');
  await addColumn('department', 'VARCHAR(128)');
  await addColumn('office_location', 'VARCHAR(255)');
  await addColumn('hire_date', 'DATE');
  await addColumn('manager_name', 'VARCHAR(128)');
  await addColumn('manager_email', 'VARCHAR(255)');
  await addColumn('created_at', 'TIMESTAMPTZ DEFAULT NOW()');
  await addColumn('updated_at', 'TIMESTAMPTZ DEFAULT NOW()');
  await addColumn('activation_status', "VARCHAR(32) DEFAULT 'candidate'");
  await addColumn('activation_token', 'VARCHAR(255)');
  await addColumn('activation_token_expires_at', 'TIMESTAMPTZ');
  await addColumn('invited_at', 'TIMESTAMPTZ');
  await addColumn('activated_at', 'TIMESTAMPTZ');
  await addColumn('activation_source', 'VARCHAR(32)');
  await addColumn('activation_reminder_count', 'INTEGER DEFAULT 0');
  await addColumn('privacy_policy_version_accepted', 'VARCHAR(32)');
  await addColumn('privacy_policy_accepted_at', 'TIMESTAMPTZ');
  await addColumn('privacy_policy_accepted_ip', 'VARCHAR(64)');
  await addColumn('phone', 'TEXT');
  await addColumn('lead_source', 'VARCHAR(32)');
  await addColumn('birth_date', 'DATE');

  if (have.has('name') && have.has('first_name')) {
    await pool.query(`
      UPDATE members
      SET
        first_name = COALESCE(NULLIF(TRIM(first_name), ''), split_part(TRIM(name), ' ', 1)),
        last_name = COALESCE(
          NULLIF(TRIM(last_name), ''),
          NULLIF(TRIM(substring(TRIM(name) FROM position(' ' IN TRIM(name)))), ''),
          ''
        )
      WHERE name IS NOT NULL AND TRIM(name) <> ''
        AND (first_name IS NULL OR TRIM(first_name) = '')
    `).catch((err) => console.warn('[schema] members name split:', err.message));
  }

  if (have.has('pass_id')) {
    await pool.query(`
      UPDATE members m
      SET pass_id = pi.id, updated_at = NOW()
      FROM pass_instances pi
      WHERE pi.member_id = m.id
        AND (m.pass_id IS NULL OR m.pass_id = '')
    `).catch((err) => console.warn('[schema] members pass_id backfill:', err.message));
  }

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_members_brand ON members(brand_id)`).catch(() => {});
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_members_pass ON members(pass_id) WHERE pass_id IS NOT NULL`
  ).catch(() => {});
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_members_brand_employee ON members(brand_id, employee_id) WHERE employee_id IS NOT NULL`
  ).catch(() => {});
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_members_activation_token ON members(activation_token) WHERE activation_token IS NOT NULL`
  ).catch(() => {});
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_members_activation_status ON members(brand_id, activation_status)`
  ).catch(() => {});
}

async function getMemberForPass(passId) {
  if (!passId) return null;
  await ensureMembersHrSchema();
  const byPass = await pool.query('SELECT * FROM members WHERE pass_id = $1 LIMIT 1', [passId]);
  if (byPass.rows.length) return byPass.rows[0];
  const pass = await getPassInstance(passId);
  if (!pass?.member_id) return null;
  const byId = await pool.query('SELECT * FROM members WHERE id = $1 LIMIT 1', [pass.member_id]);
  return byId.rows[0] || null;
}

async function listEmployeesForBrand(brandId) {
  await ensureMembersHrSchema();
  const result = await pool.query(
    `SELECT
      m.id,
      m.brand_id,
      m.pass_id,
      m.first_name,
      m.last_name,
      m.email,
      m.employee_id,
      m.department,
      m.office_location,
      m.hire_date,
      m.manager_name,
      m.manager_email,
      m.created_at,
      m.updated_at,
      m.activation_status,
      m.invited_at,
      m.activated_at,
      m.activation_source,
      m.activation_reminder_count,
      pi.serial_number,
      pi.status AS pass_status,
      pi.device_source,
      pi.google_update_count,
      pi.google_last_update_at,
      pi.google_last_update_status,
      pi.google_wallet_object_id,
      COALESCE(pi.google_wallet_saved, false) AS google_wallet_saved,
      pi.google_installed_at,
      pi.samsung_wallet_ref_id,
      COALESCE(pi.samsung_wallet_saved, false) AS samsung_wallet_saved,
      pi.samsung_installed_at,
      (
        SELECT dr.device_library_id
        FROM device_registrations dr
        WHERE pi.serial_number IS NOT NULL AND dr.serial_number = pi.serial_number
        ORDER BY dr.created_at DESC NULLS LAST
        LIMIT 1
      ) AS device_id
    FROM members m
    LEFT JOIN pass_instances pi ON (pi.id = m.pass_id OR pi.member_id = m.id)
    WHERE m.brand_id = $1
    ORDER BY m.created_at DESC NULLS LAST`,
    [brandId]
  );
  return result.rows;
}

async function getEmployeeFieldOptionsForBrand(brandId) {
  await ensureMembersHrSchema();
  const [depts, sites, managers] = await Promise.all([
    pool.query(
      `SELECT DISTINCT v FROM (
         SELECT TRIM(department) AS v FROM members
         WHERE brand_id = $1 AND department IS NOT NULL AND TRIM(department) <> ''
         UNION
         SELECT TRIM(field_values->>'reparto') FROM pass_instances
         WHERE brand_id = $1 AND NULLIF(TRIM(field_values->>'reparto'), '') IS NOT NULL
         UNION
         SELECT TRIM(field_values->>'department') FROM pass_instances
         WHERE brand_id = $1 AND NULLIF(TRIM(field_values->>'department'), '') IS NOT NULL
       ) d
       WHERE v IS NOT NULL AND TRIM(v) <> ''
       ORDER BY v`,
      [brandId]
    ),
    pool.query(
      `SELECT DISTINCT v FROM (
         SELECT TRIM(office_location) AS v FROM members
         WHERE brand_id = $1 AND office_location IS NOT NULL AND TRIM(office_location) <> ''
         UNION
         SELECT TRIM(field_values->>'sede') FROM pass_instances
         WHERE brand_id = $1 AND NULLIF(TRIM(field_values->>'sede'), '') IS NOT NULL
         UNION
         SELECT TRIM(field_values->>'office_location') FROM pass_instances
         WHERE brand_id = $1 AND NULLIF(TRIM(field_values->>'office_location'), '') IS NOT NULL
       ) s
       WHERE v IS NOT NULL AND TRIM(v) <> ''
       ORDER BY v`,
      [brandId]
    ),
    pool.query(
      `SELECT DISTINCT TRIM(manager_email) AS v
       FROM members
       WHERE brand_id = $1 AND manager_email IS NOT NULL AND TRIM(manager_email) <> ''
       ORDER BY v`,
      [brandId]
    )
  ]);
  return {
    departments: depts.rows.map((r) => r.v),
    sites: sites.rows.map((r) => r.v),
    manager_emails: managers.rows.map((r) => r.v)
  };
}

async function isEmployeeMatricolaAvailable(brandId, value) {
  const v = String(value || '').trim();
  if (!v) return true;
  await ensureMembersHrSchema();
  const r = await pool.query(
    `SELECT 1 FROM members
     WHERE brand_id = $1 AND LOWER(TRIM(employee_id)) = LOWER(TRIM($2))
     LIMIT 1`,
    [brandId, v]
  );
  return r.rows.length === 0;
}

async function findMemberByBrandKey(brandId, { employee_id, email }) {
  if (employee_id) {
    const r = await pool.query(
      'SELECT * FROM members WHERE brand_id = $1 AND employee_id = $2 LIMIT 1',
      [brandId, String(employee_id).trim()]
    );
    if (r.rows.length) return r.rows[0];
  }
  if (email) {
    const r = await pool.query(
      'SELECT * FROM members WHERE brand_id = $1 AND LOWER(TRIM(email)) = LOWER(TRIM($2)) LIMIT 1',
      [brandId, String(email).trim()]
    );
    if (r.rows.length) return r.rows[0];
  }
  return null;
}

async function createMemberRecord(data) {
  await ensureMembersHrSchema();
  const id = data.id || uuidv4();
  const {
    brand_id,
    pass_id = null,
    first_name = null,
    last_name = null,
    email = null,
    phone = null,
    employee_id = null,
    department = null,
    office_location = null,
    hire_date = null,
    manager_name = null,
    manager_email = null,
    lead_source = null
  } = data;
  await pool.query(
    `INSERT INTO members (
      id, brand_id, pass_id, first_name, last_name, email, phone,
      employee_id, department, office_location, hire_date, manager_name, manager_email, lead_source
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      id, brand_id, pass_id, first_name, last_name, email, phone,
      employee_id, department, office_location, hire_date, manager_name, manager_email, lead_source
    ]
  );
  const row = await pool.query('SELECT * FROM members WHERE id = $1', [id]);
  return row.rows[0];
}

async function updateMemberRecord(id, data) {
  await ensureMembersHrSchema();
  const fields = [];
  const values = [];
  let p = 0;
  const allowed = [
    'pass_id', 'first_name', 'last_name', 'email', 'phone', 'employee_id',
    'department', 'office_location', 'hire_date', 'manager_name', 'manager_email', 'lead_source'
  ];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      p++;
      fields.push(`${key} = $${p}`);
      values.push(data[key]);
    }
  }
  if (!fields.length) {
    const row = await pool.query('SELECT * FROM members WHERE id = $1', [id]);
    return row.rows[0] || null;
  }
  p++;
  fields.push(`updated_at = NOW()`);
  values.push(id);
  await pool.query(`UPDATE members SET ${fields.join(', ')} WHERE id = $${p}`, values);
  const row = await pool.query('SELECT * FROM members WHERE id = $1', [id]);
  return row.rows[0] || null;
}

async function deleteMemberRecord(brandId, memberId) {
  await ensureMembersHrSchema();
  const r = await pool.query(
    'SELECT * FROM members WHERE id = $1 AND brand_id = $2',
    [memberId, brandId]
  );
  const member = r.rows[0];
  if (!member) return null;
  const passId = member.pass_id || null;
  if (passId) await deletePass(passId);
  await pool.query('DELETE FROM members WHERE id = $1 AND brand_id = $2', [memberId, brandId]);
  return { deleted: true, member_id: memberId, pass_deleted: !!passId };
}

async function importEmployeesBatch(brandId, employees, options = {}) {
  await ensureMembersHrSchema();
  const {
    template_id,
    create_passes = true,
    update_existing = false,
    skip_invalid = true
  } = options;

  const summary = { created: 0, updated: 0, skipped: 0, passes_created: 0, errors: [], created_member_ids: [] };

  for (let i = 0; i < employees.length; i++) {
    const emp = employees[i];
    try {
      if (!emp || !String(emp.employee_id || '').trim()) {
        if (skip_invalid) {
          summary.skipped++;
          summary.errors.push({ row: i + 1, reason: 'Matricola mancante' });
          continue;
        }
        throw new Error('Matricola mancante');
      }

      const existing = await findMemberByBrandKey(brandId, {
        employee_id: emp.employee_id,
        email: emp.email
      });

      let member;
      if (existing) {
        if (!update_existing) {
          summary.skipped++;
          summary.errors.push({
            row: i + 1,
            reason: `Già presente (${existing.employee_id || existing.email || existing.id})`
          });
          continue;
        }
        member = await updateMemberRecord(existing.id, {
          first_name: emp.first_name ?? existing.first_name,
          last_name: emp.last_name ?? existing.last_name,
          email: emp.email ?? existing.email,
          employee_id: emp.employee_id ?? existing.employee_id,
          department: emp.department ?? existing.department,
          office_location: emp.office_location ?? existing.office_location,
          hire_date: emp.hire_date ?? existing.hire_date,
          manager_name: emp.manager_name ?? existing.manager_name,
          manager_email: emp.manager_email ?? existing.manager_email
        });
        summary.updated++;
      } else {
        member = await createMemberRecord({
          brand_id: brandId,
          first_name: emp.first_name,
          last_name: emp.last_name,
          email: emp.email,
          employee_id: emp.employee_id,
          department: emp.department,
          office_location: emp.office_location,
          hire_date: emp.hire_date,
          manager_name: emp.manager_name,
          manager_email: emp.manager_email
        });
        summary.created++;
        summary.created_member_ids.push(member.id);
      }

      if (create_passes && template_id && !member.pass_id) {
        const { employeesToFieldValues } = require('../engine/member-import');
        const pass = await createPassInstance({
          brand_id: brandId,
          template_id,
          field_values: employeesToFieldValues(emp)
        });
        await updateMemberRecord(member.id, { pass_id: pass.id });
        await updatePassInstance(pass.id, { member_id: member.id, activated_at: new Date() });
        await logEvent({
          pass_id: pass.id,
          brand_id: brandId,
          event_type: 'pass_created',
          metadata: { source: 'employee_import', member_id: member.id }
        });
        summary.passes_created++;
      }
    } catch (err) {
      summary.errors.push({ row: i + 1, reason: err.message });
      if (!skip_invalid) throw err;
    }
  }

  return summary;
}

async function updatePassDynamicLinks(passIds, { label, url, expiresAt }) {
  const ids = (passIds || []).filter(Boolean);
  if (!ids.length || !url) return { updated: 0 };
  const result = await pool.query(
    `UPDATE pass_instances
     SET dynamic_link_label = $1,
         dynamic_link_url = $2,
         dynamic_link_set_at = NOW(),
         dynamic_link_expires_at = $3,
         last_updated = NOW()
     WHERE id = ANY($4::text[])`,
    [label || 'AZIONE RICHIESTA', url, expiresAt || null, ids]
  );
  return { updated: result.rowCount || 0 };
}

/** Remove push CTA link from targeted passes (revert to base back layout). */
async function clearPassDynamicLinks(passIds) {
  const ids = (passIds || []).filter(Boolean);
  if (!ids.length) return { cleared: 0 };
  const result = await pool.query(
    `UPDATE pass_instances
     SET dynamic_link_label = NULL,
         dynamic_link_url = NULL,
         dynamic_link_set_at = NULL,
         dynamic_link_expires_at = NULL,
         last_updated = NOW()
     WHERE id = ANY($1::text[])`,
    [ids]
  );
  return { cleared: result.rowCount || 0 };
}

/** Apply push strip/message overlay to targeted passes only (not brand-wide). */
async function updatePassPushOverlays(passIds, { announcement, stripBase64 } = {}) {
  const ids = (passIds || []).filter(Boolean);
  if (!ids.length) return { updated: 0 };
  const annJson = announcement ? JSON.stringify(announcement) : null;
  const result = await pool.query(
    `UPDATE pass_instances
     SET push_announcement = $1::jsonb,
         push_strip_base64 = $2,
         last_updated = NOW()
     WHERE id = ANY($3::text[])`,
    [annJson, stripBase64 || null, ids]
  );
  return { updated: result.rowCount || 0 };
}

/** Reset pass to standard template (download/regenerate fresh install). */
async function clearPassPushOverlay(passId) {
  if (!passId) return { cleared: false };
  await pool.query(
    `UPDATE pass_instances
     SET push_announcement = NULL,
         push_strip_base64 = NULL,
         dynamic_link_label = NULL,
         dynamic_link_url = NULL,
         dynamic_link_set_at = NULL,
         dynamic_link_expires_at = NULL,
         last_updated = NOW()
     WHERE id = $1`,
    [passId]
  );
  return { cleared: true };
}

async function touchPassesForTemplate(templateId) {
  const result = await pool.query(
    'UPDATE pass_instances SET last_updated = NOW() WHERE template_id = $1',
    [templateId]
  );
  return { touched: result.rowCount || 0 };
}

async function getDevicesForTemplate(templateId) {
  const result = await pool.query(
    `SELECT DISTINCT dr.push_token, dr.serial_number
     FROM device_registrations dr
     JOIN pass_instances pi ON dr.serial_number = pi.serial_number
     WHERE pi.template_id = $1 AND dr.push_token IS NOT NULL AND dr.push_token <> ''`,
    [templateId]
  );
  return result.rows;
}

async function listPasses(brandId, options = {}) {
  // install_date: Google callback sets google_installed_at; Apple Wallet sets device_registrations on POST register.
  // Dashboard column "Installato il" reads install_date (was undefined before — always showed "-").
  let query = `SELECT p.*,
    c.name as campaign_name,
    (SELECT dr.push_token FROM device_registrations dr WHERE dr.serial_number = p.serial_number ORDER BY dr.created_at DESC NULLS LAST LIMIT 1) AS push_token,
    COALESCE(
      p.google_installed_at,
      p.samsung_installed_at,
      (SELECT MIN(dr2.created_at) FROM device_registrations dr2 WHERE dr2.serial_number = p.serial_number)
    ) AS install_date
    FROM pass_instances p
    LEFT JOIN campaigns c ON p.campaign_id = c.id
    WHERE p.brand_id = $1`;
  const params = [brandId];
  let idx = 2;
  if (options.status) { query += ` AND p.status = $${idx++}`; params.push(options.status); }
  if (options.campaign_id) { query += ` AND p.campaign_id = $${idx++}`; params.push(options.campaign_id); }
  query += ' ORDER BY p.created_at DESC';
  if (options.limit) { query += ` LIMIT $${idx++}`; params.push(options.limit); }
  if (options.offset) { query += ` OFFSET $${idx++}`; params.push(options.offset); }
  const result = await pool.query(query, params);
  return result.rows;
}

async function countPasses(brandId, options = {}) {
  let query = 'SELECT COUNT(*)::int AS count FROM pass_instances p WHERE p.brand_id = $1';
  const params = [brandId];
  let idx = 2;
  if (options.status) { query += ` AND p.status = $${idx++}`; params.push(options.status); }
  if (options.campaign_id) { query += ` AND p.campaign_id = $${idx++}`; params.push(options.campaign_id); }
  const result = await pool.query(query, params);
  return result.rows[0]?.count ?? 0;
}

async function deletePass(id) {
  const pass = await getPassInstance(id);
  if (!pass) return null;
  await pool.query('DELETE FROM device_registrations WHERE serial_number = $1', [pass.serial_number]);
  await pool.query('DELETE FROM events WHERE pass_id = $1', [id]);
  await pool.query('DELETE FROM pass_instances WHERE id = $1', [id]);
  return { success: true };
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Events Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function logEvent(data) {
  const { pass_id, brand_id, event_type, device_id = null, metadata = {} } = data;
  if (!brand_id || !event_type) throw new Error('Brand ID and event type are required');
  const metaObj = typeof metadata === 'string' ? JSON.parse(metadata) : (metadata || {});
  const result = await pool.query(
    `INSERT INTO events (pass_id, brand_id, event_type, device_id, metadata) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [pass_id || null, brand_id, event_type, device_id, JSON.stringify(metaObj)]
  );
  try {
    const { mirrorLegacyEvent } = require('../engine/holder-events');
    await mirrorLegacyEvent(result.rows[0]);
  } catch (err) {
    console.error('[logEvent] holder_events mirror:', err.message);
  }
  return { success: true, id: result.rows[0]?.id };
}

async function listEvents(brandId, limit = 50) {
  const result = await pool.query(
    'SELECT * FROM events WHERE brand_id = $1 ORDER BY created_at DESC LIMIT $2',
    [brandId, limit]
  );
  return result.rows;
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Device Registrations (Apple Wallet Protocol) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function registerDevice(data) {
  const { device_library_id, push_token, serial_number } = data;
  if (!device_library_id || !push_token || !serial_number) throw new Error('All device registration fields required');
  await pool.query(
    `INSERT INTO device_registrations (device_library_id, push_token, serial_number)
     VALUES ($1, $2, $3)
     ON CONFLICT (device_library_id, serial_number) DO UPDATE SET push_token = $2`,
    [device_library_id, push_token, serial_number]
  );
  return { success: true };
}

async function getDevicesForPass(serial) {
  const result = await pool.query(
    'SELECT device_library_id, push_token FROM device_registrations WHERE serial_number = $1', [serial]
  );
  return result.rows;
}

async function getDevicesForBrand(brandId) {
  const result = await pool.query(
    `SELECT DISTINCT dr.push_token, dr.device_library_id, dr.serial_number
     FROM device_registrations dr
     JOIN pass_instances pi ON dr.serial_number = pi.serial_number
     WHERE pi.brand_id = $1`,
    [brandId]
  );
  return result.rows;
}

async function unregisterDevice(deviceLibraryId, serialNumber) {
  await pool.query('DELETE FROM device_registrations WHERE device_library_id = $1 AND serial_number = $2', [deviceLibraryId, serialNumber]);
  return { success: true };
}

async function getSerialsForDevice(deviceLibraryId, passesUpdatedSince) {
  let query, params;
  if (passesUpdatedSince) {
    // Apple sends this tag Ã¢ÂÂ only return passes updated after that timestamp
    query = `SELECT dr.serial_number FROM device_registrations dr
             JOIN pass_instances pi ON dr.serial_number = pi.serial_number
             WHERE dr.device_library_id = $1 AND pi.last_updated > $2`;
    params = [deviceLibraryId, new Date(passesUpdatedSince)];
  } else {
    query = 'SELECT serial_number FROM device_registrations WHERE device_library_id = $1';
    params = [deviceLibraryId];
  }
  const result = await pool.query(query, params);
  return result.rows.map(r => r.serial_number);
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Analytics Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function getAnalytics(brandId) {
  const [
    passResult,
    statusResult,
    eventResult,
    appleDevicesResult,
    googleSavedResult,
    googleObjectResult,
    samsungSavedResult,
    googleCallbackResult,
    googleCallbackProcessedResult
  ] = await Promise.all([
    pool.query('SELECT COUNT(*) as count FROM pass_instances WHERE brand_id = $1', [brandId]),
    pool.query('SELECT status, COUNT(*) as count FROM pass_instances WHERE brand_id = $1 GROUP BY status', [brandId]),
    pool.query('SELECT event_type, COUNT(*) as count FROM events WHERE brand_id = $1 GROUP BY event_type', [brandId]),
    pool.query(
      'SELECT COUNT(DISTINCT dr.device_library_id) as count FROM device_registrations dr JOIN pass_instances p ON dr.serial_number = p.serial_number WHERE p.brand_id = $1',
      [brandId]
    ),
    pool.query('SELECT COUNT(*) as count FROM pass_instances WHERE brand_id = $1 AND google_wallet_saved = TRUE', [brandId]),
    pool.query(
      'SELECT COUNT(*) as count FROM pass_instances WHERE brand_id = $1 AND google_wallet_object_id IS NOT NULL AND google_wallet_object_id <> \'\'',
      [brandId]
    ),
    pool.query('SELECT COUNT(*) as count FROM pass_instances WHERE brand_id = $1 AND samsung_wallet_saved = TRUE', [brandId]),
    pool.query("SELECT COUNT(*) as count FROM wallet_callback_events WHERE provider = 'google' AND brand_id = $1", [brandId]),
    pool.query("SELECT COUNT(*) as count FROM wallet_callback_events WHERE provider = 'google' AND brand_id = $1 AND processed = TRUE", [brandId])
  ]);
  const byStatus = {};
  for (const row of statusResult.rows) byStatus[row.status] = parseInt(row.count);
  const events = {};
  for (const row of eventResult.rows) events[row.event_type] = parseInt(row.count);
  const appleDeviceCount = parseInt(appleDevicesResult.rows[0].count);
  const googleWalletSavedCount = parseInt(googleSavedResult.rows[0].count);
  const googleWalletObjectCount = parseInt(googleObjectResult.rows[0].count);
  const samsungWalletSavedCount = parseInt(samsungSavedResult.rows[0].count);
  const googleCallbackCount = parseInt(googleCallbackResult.rows[0].count);
  const googleCallbackProcessedCount = parseInt(googleCallbackProcessedResult.rows[0].count);
  return {
    totalPasses: parseInt(passResult.rows[0].count),
    byStatus,
    events,
    // Legacy: era solo Apple PassKit — manteniamo il nome per compatibilità client
    deviceCount: appleDeviceCount,
    appleDeviceCount,
    googleWalletSavedCount,
    googleWalletObjectCount,
    samsungWalletSavedCount,
    googleCallbackCount,
    googleCallbackProcessedCount
  };
}

async function getCampaignAnalytics(brandId) {
  const result = await pool.query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM pass_instances p WHERE p.campaign_id = c.id) as pass_count,
       (SELECT COUNT(*) FROM device_registrations dr JOIN pass_instances p ON dr.serial_number = p.serial_number WHERE p.campaign_id = c.id) as install_count
     FROM campaigns c WHERE c.brand_id = $1 ORDER BY c.created_at DESC`,
    [brandId]
  );
  return result.rows;
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Push Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function logPush(data) {
  const { brand_id, title, message, campaign_id = null, sent_count = 0, channel = 'apple', strip_base64 = null, screen_alert = null } = data;
  if (!brand_id || !title || !message) throw new Error('Brand ID, title, and message are required');
  const screenAlert = String(screen_alert || '').trim().slice(0, 178) || null;
  const result = await pool.query(
    `INSERT INTO push_log (brand_id, title, message, campaign_id, sent_count, channel, strip_base64, screen_alert) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, brand_id, title, message, campaign_id, sent_count, channel, strip_base64, screen_alert, created_at`,
    [brand_id, title, message, campaign_id, sent_count, channel, strip_base64 || null, screenAlert]
  );
  return result.rows[0];
}

async function listPushes(brandId) {
  const result = await pool.query('SELECT * FROM push_log WHERE brand_id = $1 ORDER BY created_at DESC', [brandId]);
  return result.rows;
}

async function deletePush(id) {
  await pool.query('DELETE FROM push_log WHERE id = $1', [id]);
  return { success: true };
}

async function clearPushHistory(brandId) {
  const result = await pool.query('DELETE FROM push_log WHERE brand_id = $1', [brandId]);
  return { success: true, deleted: result.rowCount };
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Scheduled Push Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function createScheduledPush(data) {
  const id = data.id || uuidv4();
  const {
    brand_id, title, message, campaign_id = null, audience_id = null, channel = 'apple',
    schedule_type = 'once', schedule_time = '09:00', schedule_days = '', update_pass = true, next_run_at,
    include_pass_link = false, pass_link_url = null, pass_link_label = null, pass_link_expires_at = null,
    back_details = null, strip_base64 = null, screen_alert = null
  } = data;
  if (!brand_id || !title || !message) throw new Error('brand_id, title, and message are required');
  const screenAlert = String(screen_alert || '').trim().slice(0, 178) || null;
  await pool.query(
    `INSERT INTO scheduled_push (
       id, brand_id, title, message, campaign_id, audience_id, channel, schedule_type, schedule_time,
       schedule_days, update_pass, next_run_at, include_pass_link, pass_link_url, pass_link_label, pass_link_expires_at,
       back_details, strip_base64, screen_alert
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
    [id, brand_id, title, message, campaign_id, audience_id, channel, schedule_type, schedule_time, schedule_days, update_pass, next_run_at, !!include_pass_link, pass_link_url, pass_link_label, pass_link_expires_at, back_details || null, strip_base64 || null, screenAlert]
  );
  return {
    id, brand_id, title, message, campaign_id, audience_id, channel, schedule_type, schedule_time,
    schedule_days, update_pass, next_run_at, include_pass_link: !!include_pass_link,
    pass_link_url, pass_link_label, pass_link_expires_at, back_details: back_details || null, strip_base64: strip_base64 || null, screen_alert: screenAlert, active: true
  };
}

async function listScheduledPush(brand_id) {
  const result = await pool.query('SELECT * FROM scheduled_push WHERE brand_id = $1 ORDER BY created_at DESC', [brand_id]);
  return result.rows;
}

async function getScheduledPush(id) {
  const result = await pool.query('SELECT * FROM scheduled_push WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function updateScheduledPush(id, data) {
  const fields = [];
  const values = [id];
  let idx = 2;
  for (const key of ['title', 'message', 'campaign_id', 'audience_id', 'channel', 'schedule_type', 'schedule_time', 'schedule_days', 'active', 'update_pass', 'next_run_at', 'last_run_at', 'include_pass_link', 'pass_link_url', 'pass_link_label', 'pass_link_expires_at', 'back_details', 'strip_base64', 'screen_alert']) {
    if (data[key] !== undefined) { fields.push(`${key} = $${idx}`); values.push(data[key]); idx++; }
  }
  if (fields.length === 0) return getScheduledPush(id);
  await pool.query(`UPDATE scheduled_push SET ${fields.join(', ')} WHERE id = $1`, values);
  return getScheduledPush(id);
}

async function deleteScheduledPush(id) {
  await pool.query('DELETE FROM scheduled_push WHERE id = $1', [id]);
  return { success: true };
}

async function getDueScheduledPush() {
  const result = await pool.query(
    `SELECT * FROM scheduled_push WHERE active = true AND next_run_at <= NOW()`
  );
  return result.rows;
}

// ─── Audiences ───────────────────────────────────────────────────────────────

async function createAudience(data) {
  const id = data.id || uuidv4();
  const { brand_id, name, description = '', rules = {}, query_spec = {}, source_prompt = '' } = data;
  if (!brand_id || !name) throw new Error('brand_id e name sono obbligatori');
  const rulesObj = typeof rules === 'string' ? JSON.parse(rules) : rules;
  const specObj = typeof query_spec === 'string' ? JSON.parse(query_spec) : query_spec;
  const result = await pool.query(
    `INSERT INTO audiences (id, brand_id, name, description, rules, query_spec, source_prompt)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [id, brand_id, name, description, JSON.stringify(rulesObj || {}), JSON.stringify(specObj || {}), source_prompt || '']
  );
  return result.rows[0];
}

async function getAudience(id) {
  const result = await pool.query('SELECT * FROM audiences WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function listAudiences(brandId) {
  const result = await pool.query(
    'SELECT * FROM audiences WHERE brand_id = $1 ORDER BY updated_at DESC, created_at DESC',
    [brandId]
  );
  return result.rows;
}

async function updateAudience(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
  if (data.description !== undefined) { fields.push(`description = $${idx++}`); values.push(data.description); }
  if (data.rules !== undefined) {
    fields.push(`rules = $${idx++}`);
    values.push(JSON.stringify(typeof data.rules === 'string' ? JSON.parse(data.rules) : data.rules));
  }
  if (data.query_spec !== undefined) {
    fields.push(`query_spec = $${idx++}`);
    values.push(JSON.stringify(typeof data.query_spec === 'string' ? JSON.parse(data.query_spec) : data.query_spec));
  }
  if (data.source_prompt !== undefined) { fields.push(`source_prompt = $${idx++}`); values.push(data.source_prompt); }
  if (data.cached_count !== undefined) { fields.push(`cached_count = $${idx++}`); values.push(data.cached_count); }
  if (!fields.length) return getAudience(id);
  fields.push('updated_at = NOW()');
  values.push(id);
  const result = await pool.query(
    `UPDATE audiences SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

async function deleteAudience(id) {
  await pool.query('DELETE FROM audiences WHERE id = $1', [id]);
  return { success: true };
}

async function logPushAssistantInteraction({ brand_id, user_id = null, prompt, proposal = null, final_payload = null, action = 'planned' }) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO push_assistant_log (id, brand_id, user_id, prompt, proposal, final_payload, action)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      brand_id,
      user_id,
      prompt,
      proposal ? JSON.stringify(proposal) : null,
      final_payload ? JSON.stringify(final_payload) : null,
      action
    ]
  );
  return { id };
}

async function logWaiInteraction({ brand_id, user_id = null, prompt, intent = null, proposal = null, action = 'planned', payload = null }) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO wai_log (id, brand_id, user_id, prompt, intent, proposal, action, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      brand_id,
      user_id,
      prompt,
      intent,
      proposal ? JSON.stringify(proposal) : null,
      action,
      payload ? JSON.stringify(payload) : null
    ]
  );
  return { id };
}

async function listWaiLog(brand_id, limit = 20) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const result = await pool.query(
    'SELECT * FROM wai_log WHERE brand_id = $1 ORDER BY created_at DESC LIMIT $2',
    [brand_id, safeLimit]
  );
  return result.rows;
}

async function logEnrollmentAttempt({ brand_id = null, email_attempted = null, ip_address = null, user_agent = null, result }) {
  if (!result) throw new Error('enrollment attempt result is required');
  const r = await pool.query(
    `INSERT INTO enrollment_attempts (brand_id, email_attempted, ip_address, user_agent, result)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [brand_id || null, email_attempted || null, ip_address || null, user_agent || null, result]
  );
  return r.rows[0];
}

async function listEnrollmentAttempts(brand_id, { limit = 50, since = null } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const params = [brand_id];
  let sql = 'SELECT * FROM enrollment_attempts WHERE brand_id = $1';
  if (since) {
    params.push(since);
    sql += ` AND attempted_at >= $${params.length}`;
  }
  params.push(safeLimit);
  sql += ` ORDER BY attempted_at DESC LIMIT $${params.length}`;
  const result = await pool.query(sql, params);
  return result.rows;
}

async function createImportError({ brand_id, import_batch_id, row_number, row_data, error_reason }) {
  if (!brand_id || !error_reason) throw new Error('brand_id and error_reason are required');
  const r = await pool.query(
    `INSERT INTO import_errors (brand_id, import_batch_id, row_number, row_data, error_reason)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      brand_id,
      import_batch_id || null,
      row_number != null ? parseInt(row_number, 10) : null,
      row_data != null ? JSON.stringify(row_data) : null,
      String(error_reason).slice(0, 255)
    ]
  );
  return r.rows[0];
}

async function listImportErrors(brand_id, { import_batch_id = null, limit = 500 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 500, 1), 5000);
  const params = [brand_id];
  let sql = 'SELECT * FROM import_errors WHERE brand_id = $1';
  if (import_batch_id) {
    params.push(import_batch_id);
    sql += ` AND import_batch_id = $${params.length}`;
  }
  params.push(safeLimit);
  sql += ` ORDER BY created_at DESC, id DESC LIMIT $${params.length}`;
  const result = await pool.query(sql, params);
  return result.rows.map((row) => ({
    ...row,
    row_data: typeof row.row_data === 'string' ? JSON.parse(row.row_data) : row.row_data
  }));
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Strip Promos Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function createStripPromo({ brand_id, title, strip_base64, start_date, end_date, push_message, push_frequency }) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO strip_promos (id, brand_id, title, strip_base64, start_date, end_date, push_message, push_frequency)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, brand_id, title, strip_base64, start_date, end_date, push_message || null, push_frequency || 'none']
  );
  return { id };
}

async function listStripPromos(brand_id) {
  const res = await pool.query(
    'SELECT id, brand_id, title, start_date, end_date, push_message, push_frequency, active, created_at FROM strip_promos WHERE brand_id = $1 ORDER BY start_date DESC',
    [brand_id]
  );
  return res.rows;
}

async function getStripPromo(id) {
  const res = await pool.query('SELECT * FROM strip_promos WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function updateStripPromo(id, fields) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    if (['title', 'strip_base64', 'start_date', 'end_date', 'push_message', 'push_frequency', 'active', 'last_push_sent'].includes(k)) {
      sets.push(`${k} = $${i++}`);
      vals.push(v);
    }
  }
  if (sets.length === 0) return;
  vals.push(id);
  await pool.query(`UPDATE strip_promos SET ${sets.join(', ')} WHERE id = $${i}`, vals);
}

async function deleteStripPromo(id) {
  await pool.query('DELETE FROM strip_promos WHERE id = $1', [id]);
}

async function getActiveStripPromos() {
  const res = await pool.query(
    `SELECT sp.*, b.name as brand_name, b.config as brand_config
     FROM strip_promos sp JOIN brands b ON b.id = sp.brand_id
     WHERE sp.active = true AND sp.start_date <= NOW() AND sp.end_date >= NOW()`
  );
  return res.rows;
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Users Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
const bcrypt = require('bcryptjs');

async function createUser({ email, password, name, role, brand_id }) {
  const id = uuidv4();
  const password_hash = await bcrypt.hash(password, 10);
  const res = await pool.query(
    `INSERT INTO users (id, email, password_hash, name, role, brand_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, name, role, brand_id, active, created_at`,
    [id, email.toLowerCase().trim(), password_hash, name, role || 'manager', brand_id || null]
  );
  return res.rows[0];
}

async function getUserByEmail(email) {
  const res = await pool.query('SELECT * FROM users WHERE email = $1 AND active = true', [email.toLowerCase().trim()]);
  return res.rows[0] || null;
}

async function getUser(id) {
  const res = await pool.query('SELECT id, email, name, role, brand_id, active, created_at FROM users WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function listUsers(brand_id = null) {
  let query = `SELECT u.id, u.email, u.name, u.role, u.brand_id, b.name as brand_name, u.active, u.created_at FROM users u LEFT JOIN brands b ON u.brand_id = b.id`;
  const params = [];
  if (brand_id) {
    query += ` WHERE (u.brand_id = $1 OR u.brand_id IS NULL)`;
    params.push(brand_id);
  }
  query += ` ORDER BY u.created_at`;
  const res = await pool.query(query, params);
  return res.rows;
}

async function updateUser(id, data) {
  const fields = [];
  const values = [];
  let idx = 1;
  for (const key of ['email', 'name', 'role', 'brand_id', 'active']) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(key === 'email' ? data[key].toLowerCase().trim() : data[key]);
      idx++;
    }
  }
  if (data.password) {
    fields.push(`password_hash = $${idx}`);
    values.push(await bcrypt.hash(data.password, 10));
    idx++;
  }
  if (fields.length === 0) return getUser(id);
  fields.push(`updated_at = NOW()`);
  values.push(id);
  await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values);
  return getUser(id);
}

async function deleteUser(id) {
  await pool.query('DELETE FROM users WHERE id = $1', [id]);
  return { success: true };
}

async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}

function hashPasswordResetToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

async function createPasswordResetToken(userId, ttlMs = 60 * 60 * 1000) {
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashPasswordResetToken(token);
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + ttlMs);
  await pool.query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [id, userId, tokenHash, expiresAt]
  );
  return token;
}

async function getPasswordResetUserByToken(token) {
  const tokenHash = hashPasswordResetToken(token);
  const res = await pool.query(
    `SELECT t.id AS reset_id, t.user_id, u.email, u.name
     FROM password_reset_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > NOW() AND u.active = true`,
    [tokenHash]
  );
  return res.rows[0] || null;
}

async function markPasswordResetTokenUsed(token) {
  const tokenHash = hashPasswordResetToken(token);
  await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = $1 AND used_at IS NULL`,
    [tokenHash]
  );
}

async function seedAdminUser() {
  try {
    if (deployLoginAllowlistEmails().length) return;
    const existing = await pool.query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
    if (existing.rows.length === 0) {
      await createUser({
        email: 'admin@filodiretto.app',
        password: 'FiloDiretto2026!',
        name: 'Admin',
        role: 'admin',
        brand_id: null
      });
      console.log('[ok] Seeded default admin user: admin@filodiretto.app / FiloDiretto2026!');
    }
  } catch(e) { console.log('Admin seed note:', e.message); }
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Media Hub Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ


/** One-shot ops bootstrap (set BOOTSTRAP_SUPER_ADMIN_EMAIL on Railway, redeploy, then unset). */

function deployLoginAllowlistEmails() {
  const raw = String(process.env.DASHBOARD_LOGIN_ALLOWLIST || '').trim();
  if (raw) {
    return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  }
  return ['admin@nudj.studio'];
}

async function ensureAllowlistPlatformAdmins() {
  const emails = deployLoginAllowlistEmails();
  if (!emails.length) return;
  for (const email of emails) {
    try {
      const user = await getUserByEmail(email);
      if (!user) continue;
      if (user.role === 'admin' && user.brand_id == null) continue;
      await updateUser(user.id, { role: 'admin', brand_id: null });
      console.log('✓ Allowlist operator promoted to platform admin:', email);
    } catch (e) {
      console.error('Allowlist admin promotion failed for', email, e.message);
    }
  }
}

async function bootstrapSuperAdminFromEnv() {
  const email = String(process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!email) return;

  const name = String(process.env.BOOTSTRAP_SUPER_ADMIN_NAME || 'Super Admin').trim();
  const resendInvite = String(process.env.BOOTSTRAP_SUPER_ADMIN_RESEND_INVITE || '1') === '1';
  const promoteEmail = String(process.env.BOOTSTRAP_PROMOTE_TO_ADMIN || '').trim().toLowerCase();

  try {
    if (promoteEmail) {
      const promoteUser = await getUserByEmail(promoteEmail);
      if (promoteUser && promoteUser.role !== 'admin') {
        await updateUser(promoteUser.id, { role: 'admin', brand_id: null });
        console.log('✓ Promoted to admin:', promoteEmail);
      }
    }

    let user = await getUserByEmail(email);

    if (user) {
      const needsRoleFix = user.role !== 'admin' || user.brand_id != null;
      if (needsRoleFix) {
        await updateUser(user.id, { role: 'admin', brand_id: null });
        console.log('✓ Updated super admin role:', email);
      }
    } else {
      const tempPassword = randomBytes(12).toString('base64url');
      user = await createUser({ email, password: tempPassword, name, role: 'admin', brand_id: null });
      console.log('✓ Created super admin:', email);
    }

    if (resendInvite) {
      const inviteToken = await createPasswordResetToken(user.id, 72 * 60 * 60 * 1000);
      const domain = String(process.env.CUSTOM_DOMAIN || 'studio.filodiretto.app').replace(/^https?:\/\//, '');
      const activateUrl = `https://${domain}/dashboard?reset=${encodeURIComponent(inviteToken)}`;
      const productTitle = String(process.env.DASHBOARD_PRODUCT_TITLE || '').trim() || 'FiloDiretto';
      const { sendUserInviteEmail } = require('../engine/mailer');
      await sendUserInviteEmail({
        to: email,
        name: user.name || name,
        role: 'admin',
        brandName: null,
        activateUrl,
        productTitle
      });
      console.log('✓ Super admin invite email sent to', email);
    }
  } catch (e) {
    console.error('Bootstrap super admin failed:', e.message);
  }
}

/** One-shot brand assignment (set BOOTSTRAP_USER_BRAND_EMAILS + BOOTSTRAP_USER_BRAND_NAME on Railway, redeploy, then unset). */
async function resolveBootstrapBrand() {
  const id = String(process.env.BOOTSTRAP_USER_BRAND_ID || '').trim();
  if (id) {
    const brand = await getBrand(id);
    if (brand) return brand;
    console.warn('BOOTSTRAP_USER_BRAND_ID not found:', id);
    return null;
  }
  const slug = String(process.env.BOOTSTRAP_USER_BRAND_SLUG || '').trim();
  if (slug) {
    const brand = await getBrandBySlug(slug);
    if (brand) return brand;
    console.warn('BOOTSTRAP_USER_BRAND_SLUG not found:', slug);
    return null;
  }
  const name = String(process.env.BOOTSTRAP_USER_BRAND_NAME || '').trim();
  if (name) {
    const res = await pool.query(
      'SELECT * FROM brands WHERE name ILIKE $1 ORDER BY created_at DESC LIMIT 1',
      [name]
    );
    if (res.rows[0]) {
      const row = res.rows[0];
      return {
        ...row,
        config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      };
    }
    console.warn('BOOTSTRAP_USER_BRAND_NAME not found:', name);
    return null;
  }
  return null;
}

async function bootstrapUserBrandAssignmentsFromEnv() {
  const emailsRaw = String(process.env.BOOTSTRAP_USER_BRAND_EMAILS || '').trim();
  if (!emailsRaw) return;
  const emails = emailsRaw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return;

  const brand = await resolveBootstrapBrand();
  if (!brand) {
    console.error('✗ BOOTSTRAP_USER_BRAND_*: brand not resolved; user assignments skipped');
    return;
  }

  const force = String(process.env.BOOTSTRAP_USER_BRAND_FORCE || '0') === '1';

  for (const email of emails) {
    try {
      const user = await getUserByEmail(email);
      if (!user) {
        console.warn('Bootstrap brand assign skipped — user not found:', email);
        continue;
      }
      const role = String(user.role || '').toLowerCase();
      if (role === 'admin') {
        console.log('Bootstrap brand assign skipped — admin:', email);
        continue;
      }
      if (!force && user.brand_id && String(user.brand_id) === String(brand.id)) {
        console.log('Already assigned:', email, '→', brand.name);
        continue;
      }
      await updateUser(user.id, { brand_id: brand.id });
      console.log('✓ Assigned brand', brand.name, 'to', email);
    } catch (e) {
      console.error('Bootstrap brand assign failed for', email, e.message);
    }
  }
}

async function createMedia({ brand_id, campaign_id = null, type, title, image_base64, width, height }) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO media (id, brand_id, campaign_id, type, title, image_base64, width, height) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, brand_id, campaign_id, type || 'generic', title || null, image_base64, width || null, height || null]
  );
  return { id, brand_id, campaign_id, type, title, created_at: new Date().toISOString() };
}

async function listMedia(brand_id, type, campaign_id) {
  let q = `SELECT m.id, m.brand_id, m.campaign_id, c.name AS campaign_name, m.type, m.title, m.width, m.height, m.created_at
           FROM media m
           LEFT JOIN campaigns c ON c.id = m.campaign_id
           WHERE m.brand_id = $1`;
  const params = [brand_id];
  let idx = 2;
  if (type && type !== 'all') { q += ` AND m.type = $${idx++}`; params.push(type); }
  if (campaign_id) { q += ` AND m.campaign_id = $${idx++}`; params.push(campaign_id); }
  q += ' ORDER BY m.created_at DESC';
  const { rows } = await pool.query(q, params);
  return rows;
}

async function getMedia(id) {
  const { rows } = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
  return rows[0] || null;
}

async function deleteMedia(id) {
  await pool.query('DELETE FROM media WHERE id = $1', [id]);
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Ad Events (Ad Serving Tracking) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function logAdEvent({ brand_id, campaign_id, creative_id, event_type, ip, user_agent, referer, metadata }) {
  await pool.query(
    `INSERT INTO ad_events (brand_id, campaign_id, creative_id, event_type, ip, user_agent, referer, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [brand_id, campaign_id || null, creative_id || null, event_type, ip || null, user_agent || null, referer || null, JSON.stringify(metadata || {})]
  );
}

async function getAdStats(brand_id, campaign_id, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let where = 'brand_id = $1 AND created_at >= $2';
  const params = [brand_id, since];
  if (campaign_id) { where += ' AND campaign_id = $3'; params.push(campaign_id); }
  const { rows } = await pool.query(
    `SELECT event_type, COUNT(*)::int as count,
            COUNT(DISTINCT ip) as unique_count
     FROM ad_events WHERE ${where}
     GROUP BY event_type`, params
  );
  const stats = { impressions: 0, clicks: 0, installs: 0, unique_impressions: 0, unique_clicks: 0 };
  rows.forEach(r => {
    if (r.event_type === 'impression') { stats.impressions = r.count; stats.unique_impressions = r.unique_count; }
    if (r.event_type === 'click') { stats.clicks = r.count; stats.unique_clicks = r.unique_count; }
    if (r.event_type === 'install') { stats.installs = r.count; }
  });
  stats.ctr = stats.impressions > 0 ? (stats.clicks / stats.impressions * 100).toFixed(2) : '0.00';
  stats.install_rate = stats.clicks > 0 ? (stats.installs / stats.clicks * 100).toFixed(2) : '0.00';
  return stats;
}

async function getAdTimeline(brand_id, campaign_id, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let where = 'brand_id = $1 AND created_at >= $2';
  const params = [brand_id, since];
  if (campaign_id) { where += ' AND campaign_id = $3'; params.push(campaign_id); }
  const { rows } = await pool.query(
    `SELECT DATE(created_at) as date, event_type, COUNT(*)::int as count
     FROM ad_events WHERE ${where}
     GROUP BY DATE(created_at), event_type
     ORDER BY date`, params
  );
  return rows;
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Creative Assets Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function createCreativeAsset(data) {
  const id = uuidv4();
  await pool.query(
    `INSERT INTO creative_assets (id, brand_id, campaign_id, segment, format_key, format_label, width, height, title, headline, cta_text, ai_prompt, ai_model, source, image_base64, image_url, qr_embedded, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [id, data.brand_id, data.campaign_id || null, data.segment, data.format_key, data.format_label,
     data.width, data.height, data.title || null, data.headline || null, data.cta_text || null,
     data.ai_prompt || null, data.ai_model || null, data.source || 'upload',
     data.image_base64 || null, data.image_url || null, data.qr_embedded || false,
     JSON.stringify(data.metadata || {})]
  );
  return getCreativeAsset(id);
}

async function getCreativeAsset(id) {
  const r = await pool.query('SELECT * FROM creative_assets WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function listCreativeAssets(brandId, options = {}) {
  let query = 'SELECT * FROM creative_assets WHERE brand_id = $1';
  const params = [brandId];
  let idx = 2;
  if (options.segment) { query += ` AND segment = $${idx}`; params.push(options.segment); idx++; }
  if (options.campaign_id) { query += ` AND campaign_id = $${idx}`; params.push(options.campaign_id); idx++; }
  query += ' ORDER BY created_at DESC';
  if (options.limit) { query += ` LIMIT $${idx}`; params.push(options.limit); }
  const r = await pool.query(query, params);
  return r.rows;
}

async function deleteCreativeAsset(id) {
  await pool.query('DELETE FROM creative_assets WHERE id = $1', [id]);
  return { success: true };
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Instant Win Campaigns Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function createInstantWinCampaign(data) {
  const id = data.id || uuidv4();
  const { brand_id, name, game_type, prize_name, prize_description, win_probability = 0.1,
    max_plays_per_user = 1, total_budget, start_date, end_date, status = 'draft',
    strip_base64, push_message, config = {} } = data;
  await pool.query(
    `INSERT INTO instant_win_campaigns (id, brand_id, name, game_type, prize_name, prize_description,
      win_probability, max_plays_per_user, total_budget, start_date, end_date, status,
      strip_base64, push_message, config)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [id, brand_id, name, game_type, prize_name, prize_description,
      win_probability, max_plays_per_user, total_budget, start_date || null, end_date || null,
      status, strip_base64 || null, push_message || null, JSON.stringify(config)]
  );
  return getInstantWinCampaign(id);
}

async function getInstantWinCampaign(id) {
  const r = await pool.query('SELECT * FROM instant_win_campaigns WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function listInstantWinCampaigns(brandId) {
  const r = await pool.query(`
    SELECT c.*, COALESCE(p.play_count, 0)::int AS total_plays
    FROM instant_win_campaigns c
    LEFT JOIN (
      SELECT campaign_id, COUNT(*) AS play_count
      FROM instant_win_plays GROUP BY campaign_id
    ) p ON p.campaign_id = c.id
    WHERE c.brand_id = $1
    ORDER BY c.created_at DESC
  `, [brandId]);
  return r.rows;
}

async function updateInstantWinCampaign(id, data) {
  const current = await getInstantWinCampaign(id);
  if (!current) return null;
  const fields = ['name', 'game_type', 'prize_name', 'prize_description', 'win_probability',
    'max_plays_per_user', 'total_budget', 'start_date', 'end_date', 'status',
    'strip_base64', 'push_message', 'config'];
  const updated = { ...current };
  for (const f of fields) {
    if (data[f] !== undefined) updated[f] = data[f];
  }
  if (typeof updated.config === 'object') updated.config = JSON.stringify(updated.config);
  await pool.query(
    `UPDATE instant_win_campaigns SET name=$1, game_type=$2, prize_name=$3, prize_description=$4,
      win_probability=$5, max_plays_per_user=$6, total_budget=$7, start_date=$8, end_date=$9,
      status=$10, strip_base64=$11, push_message=$12, config=$13, updated_at=NOW()
     WHERE id=$14`,
    [updated.name, updated.game_type, updated.prize_name, updated.prize_description,
      updated.win_probability, updated.max_plays_per_user, updated.total_budget,
      updated.start_date, updated.end_date, updated.status, updated.strip_base64,
      updated.push_message, updated.config, id]
  );
  return getInstantWinCampaign(id);
}

async function deleteInstantWinCampaign(id) {
  await pool.query('DELETE FROM instant_win_plays WHERE campaign_id = $1', [id]);
  await pool.query('DELETE FROM instant_win_campaigns WHERE id = $1', [id]);
  return { success: true };
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Instant Win Plays Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function createInstantWinPlay(data) {
  const id = data.id || uuidv4();
  const { campaign_id, serial_number, brand_id, result, prize_name,
          player_email, player_phone, player_first_name, player_last_name, privacy_accepted } = data;
  await pool.query(
    `INSERT INTO instant_win_plays (id, campaign_id, serial_number, brand_id, result, prize_name,
     player_email, player_phone, player_first_name, player_last_name, privacy_accepted, privacy_accepted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, campaign_id, serial_number, brand_id, result, prize_name || null,
     player_email || null, player_phone || null, player_first_name || null, player_last_name || null,
     privacy_accepted || false, privacy_accepted ? new Date().toISOString() : null]
  );
  // Increment total_wins if result is 'win'
  if (result === 'win') {
    await pool.query(
      'UPDATE instant_win_campaigns SET total_wins = total_wins + 1 WHERE id = $1', [campaign_id]);
  }
  return { id, campaign_id, serial_number, brand_id, result, prize_name,
           player_email, player_phone, player_first_name, player_last_name };
}

async function listInstantWinPlays(campaignId, options = {}) {
  let query = 'SELECT * FROM instant_win_plays WHERE campaign_id = $1';
  const params = [campaignId];
  if (options.serial_number) {
    query += ' AND serial_number = $2';
    params.push(options.serial_number);
  }
  query += ' ORDER BY played_at DESC';
  if (options.limit) { query += ` LIMIT $${params.length + 1}`; params.push(options.limit); }
  const r = await pool.query(query, params);
  return r.rows;
}

async function countPlaysForUser(campaignId, serialNumber) {
  const r = await pool.query(
    'SELECT COUNT(*) as count FROM instant_win_plays WHERE campaign_id = $1 AND serial_number = $2',
    [campaignId, serialNumber]
  );
  return parseInt(r.rows[0].count, 10);
}

async function getInstantWinStats(brandId) {
  const campaigns = await pool.query(
    'SELECT COUNT(*) as total FROM instant_win_campaigns WHERE brand_id = $1', [brandId]);
  const activeCampaigns = await pool.query(
    "SELECT COUNT(*) as total FROM instant_win_campaigns WHERE brand_id = $1 AND status = 'active'", [brandId]);
  const plays = await pool.query(
    'SELECT COUNT(*) as total FROM instant_win_plays WHERE brand_id = $1', [brandId]);
  const wins = await pool.query(
    "SELECT COUNT(*) as total FROM instant_win_plays WHERE brand_id = $1 AND result = 'win'", [brandId]);
  return {
    campaigns: parseInt(campaigns.rows[0].total, 10),
    active_campaigns: parseInt(activeCampaigns.rows[0].total, 10),
    total_plays: parseInt(plays.rows[0].total, 10),
    total_wins: parseInt(wins.rows[0].total, 10),
    win_rate: parseInt(plays.rows[0].total, 10) > 0
      ? (parseInt(wins.rows[0].total, 10) / parseInt(plays.rows[0].total, 10) * 100).toFixed(1)
      : '0.0'
  };
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Gamification Campaigns Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function createGamificationCampaign(data) {
  const id = data.id || uuidv4();
  const { brand_id, name, game_type, status = 'draft',
    gold_threshold_secs = 15, silver_threshold_secs = 30, bronze_threshold_secs = 60,
    gold_prize = '', silver_prize = '', bronze_prize = '',
    max_plays_per_user = 1, start_date, end_date,
    strip_base64, push_message, config = {} } = data;
  await pool.query(
    `INSERT INTO gamification_campaigns (id, brand_id, name, game_type, status,
      gold_threshold_secs, silver_threshold_secs, bronze_threshold_secs,
      gold_prize, silver_prize, bronze_prize,
      max_plays_per_user, start_date, end_date, strip_base64, push_message, config)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [id, brand_id, name, game_type, status,
      gold_threshold_secs, silver_threshold_secs, bronze_threshold_secs,
      gold_prize, silver_prize, bronze_prize,
      max_plays_per_user, start_date || null, end_date || null,
      strip_base64 || null, push_message || null, JSON.stringify(config)]
  );
  return getGamificationCampaign(id);
}

async function getGamificationCampaign(id) {
  const r = await pool.query('SELECT * FROM gamification_campaigns WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function listGamificationCampaigns(brandId) {
  const r = await pool.query(`
    SELECT c.*, COALESCE(p.play_count, 0)::int AS total_plays
    FROM gamification_campaigns c
    LEFT JOIN (
      SELECT campaign_id, COUNT(*) AS play_count
      FROM gamification_plays GROUP BY campaign_id
    ) p ON p.campaign_id = c.id
    WHERE c.brand_id = $1
    ORDER BY c.created_at DESC
  `, [brandId]);
  return r.rows;
}

async function updateGamificationCampaign(id, data) {
  const current = await getGamificationCampaign(id);
  if (!current) return null;
  const fields = ['name', 'game_type', 'status',
    'gold_threshold_secs', 'silver_threshold_secs', 'bronze_threshold_secs',
    'gold_prize', 'silver_prize', 'bronze_prize',
    'max_plays_per_user', 'start_date', 'end_date',
    'strip_base64', 'push_message', 'config'];
  const updated = { ...current };
  for (const f of fields) {
    if (data[f] !== undefined) updated[f] = data[f];
  }
  if (typeof updated.config === 'object') updated.config = JSON.stringify(updated.config);
  await pool.query(
    `UPDATE gamification_campaigns SET name=$1, game_type=$2, status=$3,
      gold_threshold_secs=$4, silver_threshold_secs=$5, bronze_threshold_secs=$6,
      gold_prize=$7, silver_prize=$8, bronze_prize=$9,
      max_plays_per_user=$10, start_date=$11, end_date=$12,
      strip_base64=$13, push_message=$14, config=$15, updated_at=NOW()
     WHERE id=$16`,
    [updated.name, updated.game_type, updated.status,
      updated.gold_threshold_secs, updated.silver_threshold_secs, updated.bronze_threshold_secs,
      updated.gold_prize, updated.silver_prize, updated.bronze_prize,
      updated.max_plays_per_user, updated.start_date, updated.end_date,
      updated.strip_base64, updated.push_message, updated.config, id]
  );
  return getGamificationCampaign(id);
}

async function deleteGamificationCampaign(id) {
  await pool.query('DELETE FROM gamification_plays WHERE campaign_id = $1', [id]);
  await pool.query('DELETE FROM gamification_campaigns WHERE id = $1', [id]);
  return { success: true };
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Gamification Plays Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

async function createGamificationPlay(data) {
  const id = data.id || uuidv4();
  const { campaign_id, serial_number, brand_id, completion_time_secs, tier, prize_name,
          score, player_email, player_phone, player_first_name, player_last_name, privacy_accepted } = data;
  await pool.query(
    `INSERT INTO gamification_plays (id, campaign_id, serial_number, brand_id, completion_time_secs,
     tier, prize_name, score, player_email, player_phone, player_first_name, player_last_name,
     privacy_accepted, privacy_accepted_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, campaign_id, serial_number, brand_id, completion_time_secs,
     tier, prize_name || null, score || 0,
     player_email || null, player_phone || null, player_first_name || null, player_last_name || null,
     privacy_accepted || false, privacy_accepted ? new Date().toISOString() : null]
  );
  return { id, campaign_id, serial_number, brand_id, completion_time_secs, tier, prize_name, score };
}

async function listGamificationPlays(campaignId, options = {}) {
  let query = 'SELECT * FROM gamification_plays WHERE campaign_id = $1';
  const params = [campaignId];
  if (options.serial_number) {
    query += ' AND serial_number = $2';
    params.push(options.serial_number);
  }
  query += ' ORDER BY played_at DESC';
  if (options.limit) { query += ` LIMIT $${params.length + 1}`; params.push(options.limit); }
  const r = await pool.query(query, params);
  return r.rows;
}

async function countGamificationPlaysForUser(campaignId, serialNumber) {
  const r = await pool.query(
    'SELECT COUNT(*) as count FROM gamification_plays WHERE campaign_id = $1 AND serial_number = $2',
    [campaignId, serialNumber]
  );
  return parseInt(r.rows[0].count, 10);
}

async function getGamificationStats(brandId) {
  const campaigns = await pool.query(
    'SELECT COUNT(*) as total FROM gamification_campaigns WHERE brand_id = $1', [brandId]);
  const activeCampaigns = await pool.query(
    "SELECT COUNT(*) as total FROM gamification_campaigns WHERE brand_id = $1 AND status = 'active'", [brandId]);
  const plays = await pool.query(
    'SELECT COUNT(*) as total FROM gamification_plays WHERE brand_id = $1', [brandId]);
  const goldWins = await pool.query(
    "SELECT COUNT(*) as total FROM gamification_plays WHERE brand_id = $1 AND tier = 'gold'", [brandId]);
  return {
    campaigns: parseInt(campaigns.rows[0].total, 10),
    active_campaigns: parseInt(activeCampaigns.rows[0].total, 10),
    total_plays: parseInt(plays.rows[0].total, 10),
    total_gold: parseInt(goldWins.rows[0].total, 10)
  };
}

// Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ Exports Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ

// ---- Google Wallet status tracking ----
async function updateGoogleWalletStatus(objectId, installed) {
  try {
    if (installed) {
      await pool.query(
        `UPDATE pass_instances SET google_wallet_saved = TRUE, google_installed_at = NOW(), device_source = 'google', last_updated = NOW() WHERE google_wallet_object_id = $1`,
        [objectId]
      );
    } else {
      await pool.query(
        `UPDATE pass_instances SET google_wallet_saved = FALSE, google_installed_at = NULL,
          device_id = CASE WHEN device_source = 'google' THEN NULL ELSE device_id END,
          device_source = CASE WHEN device_source = 'google' THEN NULL ELSE device_source END,
          last_updated = NOW() WHERE google_wallet_object_id = $1`,
        [objectId]
      );
    }
    const result = await pool.query(`SELECT * FROM pass_instances WHERE google_wallet_object_id = $1`, [objectId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('[DB] updateGoogleWalletStatus error:', error.message);
    return null;
  }
}

async function updatePassDeviceId(serialNumber, deviceId, source) {
  await pool.query(
    `UPDATE pass_instances SET device_id = $1, device_source = $2, last_updated = NOW() WHERE serial_number = $3`,
    [deviceId, source, serialNumber]
  );
}

async function getPassBySamsungRefId(refId) {
  if (!refId) return null;
  const result = await pool.query('SELECT * FROM pass_instances WHERE samsung_wallet_ref_id = $1 LIMIT 1', [refId]);
  return result.rows[0] || null;
}

async function updateSamsungWalletStatus(refId, installed, cc2 = null) {
  try {
    if (installed) {
      await pool.query(
        `UPDATE pass_instances SET samsung_wallet_saved = TRUE, samsung_installed_at = COALESCE(samsung_installed_at, NOW()),
         samsung_wallet_cc2 = COALESCE($3, samsung_wallet_cc2),
         device_source = 'samsung', device_id = $2, last_updated = NOW()
         WHERE samsung_wallet_ref_id = $1`,
        [refId, refId.slice(0, 64), cc2 && String(cc2).length === 2 ? cc2.toUpperCase() : null]
      );
    } else {
      await pool.query(
        `UPDATE pass_instances SET samsung_wallet_saved = FALSE, samsung_installed_at = NULL, samsung_wallet_cc2 = NULL,
          device_id = CASE WHEN device_source = 'samsung' THEN NULL ELSE device_id END,
          device_source = CASE WHEN device_source = 'samsung' THEN NULL ELSE device_source END,
          last_updated = NOW() WHERE samsung_wallet_ref_id = $1`,
        [refId]
      );
    }
    const result = await pool.query('SELECT * FROM pass_instances WHERE samsung_wallet_ref_id = $1', [refId]);
    return result.rows[0] || null;
  } catch (error) {
    console.error('[DB] updateSamsungWalletStatus error:', error.message);
    return null;
  }
}

async function registerWalletCallbackEvent({ provider, event_hash, object_id = null, event_type = null, payload = {} }) {
  const id = uuidv4();
  const insert = await pool.query(
    `INSERT INTO wallet_callback_events (id, provider, event_hash, object_id, event_type, payload)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (event_hash) DO NOTHING
     RETURNING *`,
    [id, provider, event_hash, object_id, event_type, JSON.stringify(payload || {})]
  );
  if (insert.rows[0]) return { inserted: true, row: insert.rows[0] };
  const existing = await pool.query('SELECT * FROM wallet_callback_events WHERE event_hash = $1', [event_hash]);
  return { inserted: false, row: existing.rows[0] || null };
}

async function finalizeWalletCallbackEvent(id, data = {}) {
  const fields = [];
  const values = [];
  let idx = 1;
  for (const key of ['processed', 'process_status', 'error_message', 'pass_id', 'brand_id']) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }
  fields.push(`processed_at = NOW()`);
  values.push(id);
  await pool.query(`UPDATE wallet_callback_events SET ${fields.join(', ')} WHERE id = $${idx}`, values);
}

// ── HUB Convenzioni — merchants ─────────────────────────────────────────────

async function createMerchant(data) {
  const {
    brand_id, name, category, logo_url, description, discount_label, conditions,
    valid_from, valid_until, active = true,
    online_enabled = false, online_url, online_promo_code, physical_enabled = false
  } = data;
  if (!brand_id || !name || !category || !discount_label) {
    throw new Error('brand_id, name, category e discount_label sono obbligatori');
  }
  const res = await pool.query(
    `INSERT INTO merchants (
      brand_id, name, category, logo_url, description, discount_label, conditions,
      valid_from, valid_until, active, online_enabled, online_url, online_promo_code, physical_enabled
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING *`,
    [
      brand_id, name, category, normalizePublicImageUrl(logo_url), description || null, discount_label,
      conditions || null, valid_from || null, valid_until || null, active !== false,
      !!online_enabled, online_url || null, online_promo_code || null, !!physical_enabled
    ]
  );
  return res.rows[0];
}

async function getMerchant(id, brandId = null) {
  const params = [id];
  let sql = 'SELECT * FROM merchants WHERE id = $1';
  if (brandId != null) {
    sql += ' AND brand_id = $2';
    params.push(brandId);
  }
  const res = await pool.query(sql, params);
  return res.rows[0] || null;
}

async function findMerchantByNameAndBrand(brandId, name) {
  const res = await pool.query(
    `SELECT * FROM merchants WHERE brand_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) LIMIT 1`,
    [brandId, name]
  );
  return res.rows[0] || null;
}

async function listMerchants(brandId, { category, active, search } = {}) {
  const clauses = ['brand_id = $1'];
  const params = [brandId];
  let idx = 2;
  if (category) {
    clauses.push(`category = $${idx++}`);
    params.push(category);
  }
  if (active === true || active === 'true') {
    clauses.push('active = TRUE');
  } else if (active === false || active === 'false') {
    clauses.push('active = FALSE');
  }
  if (search && String(search).trim()) {
    clauses.push(`(name ILIKE $${idx} OR description ILIKE $${idx})`);
    params.push(`%${String(search).trim()}%`);
    idx++;
  }
  const res = await pool.query(
    `SELECT * FROM merchants WHERE ${clauses.join(' AND ')} ORDER BY name ASC`,
    params
  );
  return res.rows;
}

const MERCHANT_MUTABLE_FIELDS = [
  'name', 'category', 'logo_url', 'description', 'discount_label', 'conditions',
  'valid_from', 'valid_until', 'active', 'online_enabled', 'online_url',
  'online_promo_code', 'physical_enabled'
];

async function updateMerchant(id, brandId, fields) {
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields || {})) {
    if (!MERCHANT_MUTABLE_FIELDS.includes(k)) continue;
    sets.push(`${k} = $${i++}`);
    vals.push(k === 'logo_url' ? normalizePublicImageUrl(v) : v);
  }
  if (!sets.length) return getMerchant(id, brandId);
  sets.push('updated_at = NOW()');
  vals.push(id, brandId);
  const res = await pool.query(
    `UPDATE merchants SET ${sets.join(', ')} WHERE id = $${i} AND brand_id = $${i + 1} RETURNING *`,
    vals
  );
  return res.rows[0] || null;
}

async function softDeleteMerchant(id, brandId) {
  return updateMerchant(id, brandId, { active: false });
}

async function createMerchantLocation(merchantId, data) {
  const {
    address, city, province, postal_code, country = 'IT',
    latitude, longitude, geofence_radius_m = 150
  } = data;
  if (!address) throw new Error('address obbligatorio');
  const merchant = await pool.query('SELECT brand_id FROM merchants WHERE id = $1', [merchantId]);
  if (!merchant.rows[0]) throw new Error('Merchant non trovato');
  const res = await pool.query(
    `INSERT INTO merchant_locations (
      merchant_id, address, city, province, postal_code, country, latitude, longitude, geofence_radius_m
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      merchantId, address, city || null, province || null, postal_code || null,
      country || 'IT', latitude ?? null, longitude ?? null, geofence_radius_m || 150
    ]
  );
  return res.rows[0];
}

async function listMerchantLocations(merchantId, brandId = null) {
  if (brandId != null) {
    const res = await pool.query(
      `SELECT ml.* FROM merchant_locations ml
       JOIN merchants m ON m.id = ml.merchant_id
       WHERE ml.merchant_id = $1 AND m.brand_id = $2
       ORDER BY ml.created_at ASC`,
      [merchantId, brandId]
    );
    return res.rows;
  }
  const res = await pool.query(
    'SELECT * FROM merchant_locations WHERE merchant_id = $1 ORDER BY created_at ASC',
    [merchantId]
  );
  return res.rows;
}

async function deleteMerchantLocation(locationId, brandId = null) {
  if (brandId != null) {
    const res = await pool.query(
      `DELETE FROM merchant_locations ml
       USING merchants m
       WHERE ml.id = $1 AND ml.merchant_id = m.id AND m.brand_id = $2
       RETURNING ml.id`,
      [locationId, brandId]
    );
    return res.rowCount > 0;
  }
  const res = await pool.query('DELETE FROM merchant_locations WHERE id = $1 RETURNING id', [locationId]);
  return res.rowCount > 0;
}

async function listMerchantGeofenceLocationsForBrand(brandId) {
  const defaultRadius = parseInt(process.env.GEOFENCING_DEFAULT_RADIUS_M, 10) || 150;
  const res = await pool.query(
    `SELECT ml.latitude, ml.longitude, ml.geofence_radius_m, ml.address, ml.city, m.name AS merchant_name
     FROM merchant_locations ml
     JOIN merchants m ON m.id = ml.merchant_id
     WHERE m.brand_id = $1 AND m.active = TRUE
       AND ml.latitude IS NOT NULL AND ml.longitude IS NOT NULL
     ORDER BY m.name ASC, ml.created_at ASC
     LIMIT 10`,
    [brandId]
  );
  return res.rows.map((row) => ({
    latitude: parseFloat(row.latitude),
    longitude: parseFloat(row.longitude),
    radius: row.geofence_radius_m || defaultRadius,
    relevantText: `${row.merchant_name}${row.city ? ` · ${row.city}` : ''}`.slice(0, 200),
    name: row.merchant_name
  }));
}

async function getMerchantAnalytics(merchantId, brandId, days = 30) {
  const res = await pool.query(
    `SELECT activation_type, COUNT(*)::int AS count
     FROM convention_activations
     WHERE merchant_id = $1 AND brand_id = $2
       AND created_at >= NOW() - ($3 || ' days')::interval
     GROUP BY activation_type
     ORDER BY activation_type`,
    [merchantId, brandId, String(days)]
  );
  const totals = res.rows.reduce((acc, row) => {
    acc[row.activation_type] = row.count;
    acc.total = (acc.total || 0) + row.count;
    return acc;
  }, { total: 0 });
  return { days, by_type: res.rows, totals };
}

/** HR dashboard aggregate analytics — no pass_serial (GDPR art. 88). */
async function getHubBrandAnalytics(brandId, days = 30) {
  const daysStr = String(Math.min(Math.max(parseInt(days, 10) || 30, 1), 365));

  const [byTypeRes, byMerchantRes, byCategoryRes, dailyRes] = await Promise.all([
    pool.query(
      `SELECT activation_type, COUNT(*)::int AS count
       FROM convention_activations
       WHERE brand_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY activation_type`,
      [brandId, daysStr]
    ),
    pool.query(
      `SELECT m.id AS merchant_id, m.name,
        COUNT(*) FILTER (WHERE ca.activation_type = 'view')::int AS views,
        COUNT(*) FILTER (WHERE ca.activation_type = 'click_site')::int AS click_site,
        COUNT(*) FILTER (WHERE ca.activation_type = 'copy_code')::int AS copy_code,
        COUNT(*) FILTER (WHERE ca.activation_type = 'show_qr')::int AS show_qr,
        COUNT(*) FILTER (WHERE ca.activation_type = 'scan_qr')::int AS scan_qr,
        COUNT(*)::int AS total
       FROM merchants m
       LEFT JOIN convention_activations ca ON ca.merchant_id = m.id
         AND ca.brand_id = $1 AND ca.created_at >= NOW() - ($2 || ' days')::interval
       WHERE m.brand_id = $1
       GROUP BY m.id, m.name
       ORDER BY m.name ASC`,
      [brandId, daysStr]
    ),
    pool.query(
      `SELECT m.category, COUNT(*)::int AS count
       FROM convention_activations ca
       INNER JOIN merchants m ON m.id = ca.merchant_id AND m.brand_id = $1
       WHERE ca.brand_id = $1 AND ca.created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY m.category
       ORDER BY count DESC`,
      [brandId, daysStr]
    ),
    pool.query(
      `SELECT DATE(created_at) AS day, activation_type, COUNT(*)::int AS count
       FROM convention_activations
       WHERE brand_id = $1 AND created_at >= NOW() - ($2 || ' days')::interval
       GROUP BY day, activation_type
       ORDER BY day ASC`,
      [brandId, daysStr]
    )
  ]);

  const total_events = {};
  let grandTotal = 0;
  for (const row of byTypeRes.rows) {
    total_events[row.activation_type] = row.count;
    grandTotal += row.count;
  }
  total_events.total = grandTotal;

  const by_category = {};
  for (const row of byCategoryRes.rows) {
    by_category[row.category] = row.count;
  }

  const top_10 = [...byMerchantRes.rows]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .filter((m) => m.total > 0);

  const dailyMap = new Map();
  for (const row of dailyRes.rows) {
    const dayKey = row.day instanceof Date
      ? row.day.toISOString().slice(0, 10)
      : String(row.day).slice(0, 10);
    if (!dailyMap.has(dayKey)) {
      dailyMap.set(dayKey, {
        date: dayKey,
        view: 0,
        search_found: 0,
        click_site: 0,
        copy_code: 0,
        show_qr: 0,
        scan_qr: 0,
        geofence_push: 0,
        total: 0
      });
    }
    const entry = dailyMap.get(dayKey);
    if (Object.prototype.hasOwnProperty.call(entry, row.activation_type)) {
      entry[row.activation_type] = row.count;
    }
    entry.total += row.count;
  }

  return {
    days: parseInt(daysStr, 10),
    total_events,
    by_merchant: byMerchantRes.rows,
    by_category,
    top_10,
    daily: Array.from(dailyMap.values())
  };
}

async function getHubSettings(brandId) {
  const res = await pool.query('SELECT * FROM hub_settings WHERE brand_id = $1', [brandId]);
  if (res.rows[0]) return res.rows[0];
  return {
    brand_id: brandId,
    logo_url: null,
    accent_color: '#8B5CF6',
    welcome_message: null,
    categories_enabled: ['food', 'fitness', 'retail', 'salute', 'viaggi', 'tech', 'servizi'],
    geofencing_enabled: true,
    geofencing_max_per_day: parseInt(process.env.GEOFENCING_MAX_PER_DAY, 10) || 3
  };
}

async function upsertHubSettings(brandId, fields = {}) {
  const existing = await getHubSettings(brandId);
  const payload = {
    logo_url: fields.logo_url !== undefined ? fields.logo_url : existing.logo_url,
    accent_color: fields.accent_color !== undefined ? fields.accent_color : existing.accent_color,
    welcome_message: fields.welcome_message !== undefined ? fields.welcome_message : existing.welcome_message,
    categories_enabled: fields.categories_enabled !== undefined
      ? JSON.stringify(fields.categories_enabled)
      : JSON.stringify(existing.categories_enabled || []),
    geofencing_enabled: fields.geofencing_enabled !== undefined
      ? !!fields.geofencing_enabled
      : existing.geofencing_enabled !== false,
    geofencing_max_per_day: fields.geofencing_max_per_day !== undefined
      ? fields.geofencing_max_per_day
      : existing.geofencing_max_per_day
  };
  const res = await pool.query(
    `INSERT INTO hub_settings (
      brand_id, logo_url, accent_color, welcome_message, categories_enabled,
      geofencing_enabled, geofencing_max_per_day, updated_at
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,NOW())
    ON CONFLICT (brand_id) DO UPDATE SET
      logo_url = EXCLUDED.logo_url,
      accent_color = EXCLUDED.accent_color,
      welcome_message = EXCLUDED.welcome_message,
      categories_enabled = EXCLUDED.categories_enabled,
      geofencing_enabled = EXCLUDED.geofencing_enabled,
      geofencing_max_per_day = EXCLUDED.geofencing_max_per_day,
      updated_at = NOW()
    RETURNING *`,
    [
      brandId, payload.logo_url, payload.accent_color, payload.welcome_message,
      payload.categories_enabled, payload.geofencing_enabled, payload.geofencing_max_per_day
    ]
  );
  return res.rows[0];
}

const HUB_ACTIVATION_TYPES = new Set([
  'view', 'search_found', 'click_site', 'copy_code', 'show_qr', 'scan_qr', 'geofence_push'
]);

/** Haversine distance in km between two WGS84 points. */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Group SQL rows with distance_km into merchants within maxRadius km. */
function groupNearbyMerchantRows(rows, maxRadius) {
  const byMerchant = new Map();
  for (const row of rows) {
    const distance = Math.round(parseFloat(row.distance_km) * 100) / 100;
    if (distance > maxRadius) continue;

    const loc = {
      id: row.location_id,
      address: row.address,
      city: row.city,
      province: row.province,
      postal_code: row.postal_code,
      country: row.country,
      latitude: row.latitude,
      longitude: row.longitude,
      geofence_radius_m: row.geofence_radius_m,
      distance_km: distance
    };

    if (!byMerchant.has(row.id)) {
      byMerchant.set(row.id, {
        id: row.id,
        brand_id: row.brand_id,
        name: row.name,
        category: row.category,
        logo_url: row.logo_url,
        description: row.description,
        discount_label: row.discount_label,
        conditions: row.conditions,
        valid_from: row.valid_from,
        valid_until: row.valid_until,
        online_enabled: row.online_enabled,
        online_url: row.online_url,
        online_promo_code: row.online_promo_code,
        physical_enabled: row.physical_enabled,
        distance_km: distance,
        locations: [loc]
      });
    } else {
      const entry = byMerchant.get(row.id);
      entry.locations.push(loc);
      if (distance < entry.distance_km) entry.distance_km = distance;
    }
  }

  return Array.from(byMerchant.values()).sort((a, b) => a.distance_km - b.distance_km);
}

async function findMerchantsNearby(brandId, lat, lon, radiusKm = 5) {
  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const radius = parseFloat(radiusKm);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    throw new Error('lat e lon devono essere numerici');
  }
  const maxRadius = Number.isFinite(radius) && radius > 0 ? radius : 5;

  const res = await pool.query(
    `SELECT m.*,
            ml.id AS location_id, ml.address, ml.city, ml.province, ml.postal_code,
            ml.country, ml.latitude, ml.longitude, ml.geofence_radius_m,
            (
              6371 * acos(LEAST(1.0, GREATEST(-1.0,
                cos(radians($2::double precision)) * cos(radians(ml.latitude::double precision))
                * cos(radians(ml.longitude::double precision) - radians($3::double precision))
                + sin(radians($2::double precision)) * sin(radians(ml.latitude::double precision))
              )))
            ) AS distance_km
     FROM merchants m
     INNER JOIN merchant_locations ml ON ml.merchant_id = m.id
     WHERE m.brand_id = $1
       AND m.active = TRUE
       AND (m.valid_from IS NULL OR m.valid_from <= CURRENT_DATE)
       AND (m.valid_until IS NULL OR m.valid_until >= CURRENT_DATE)
       AND ml.latitude IS NOT NULL AND ml.longitude IS NOT NULL
     ORDER BY distance_km ASC`,
    [brandId, latNum, lonNum]
  );

  return groupNearbyMerchantRows(res.rows, maxRadius);
}

async function listActiveMerchantsForHub(brandId, { category, search } = {}) {
  const clauses = [
    'brand_id = $1',
    'active = TRUE',
    '(valid_from IS NULL OR valid_from <= CURRENT_DATE)',
    '(valid_until IS NULL OR valid_until >= CURRENT_DATE)'
  ];
  const params = [brandId];
  let idx = 2;
  if (category) {
    clauses.push(`category = $${idx++}`);
    params.push(category);
  }
  if (search && String(search).trim()) {
    clauses.push(`(name ILIKE $${idx} OR description ILIKE $${idx} OR category ILIKE $${idx})`);
    params.push(`%${String(search).trim()}%`);
    idx++;
  }
  const res = await pool.query(
    `SELECT * FROM merchants WHERE ${clauses.join(' AND ')} ORDER BY name ASC`,
    params
  );
  return res.rows;
}

async function logConventionActivation({
  brand_id,
  merchant_id,
  pass_serial,
  user_id = null,
  activation_type,
  location_id = null,
  metadata = null
}) {
  if (!brand_id || !merchant_id || !pass_serial || !activation_type) {
    throw new Error('brand_id, merchant_id, pass_serial e activation_type sono obbligatori');
  }
  if (!HUB_ACTIVATION_TYPES.has(activation_type)) {
    throw new Error(`activation_type non valido: ${activation_type}`);
  }
  const res = await pool.query(
    `INSERT INTO convention_activations (
      brand_id, merchant_id, pass_serial, user_id, activation_type, location_id, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
    RETURNING *`,
    [
      brand_id,
      merchant_id,
      pass_serial,
      user_id != null ? String(user_id) : null,
      activation_type,
      location_id || null,
      metadata != null ? JSON.stringify(metadata) : null
    ]
  );
  return res.rows[0];
}

// ── PGA — coin ledger & settings ─────────────────────────────────────────────

async function getCoinActionConfig(brandId, actionKey) {
  const res = await pool.query(
    `SELECT * FROM coin_actions_config
     WHERE brand_id = $1 AND action_key = $2 AND active = TRUE
     LIMIT 1`,
    [brandId, actionKey]
  );
  return res.rows[0] || null;
}

async function insertCoinLedgerEntry({
  brand_id,
  pass_serial,
  user_id = null,
  action_key,
  coin_amount,
  description = null,
  related_entity_type = null,
  related_entity_id = null,
  metadata = null
}) {
  if (!brand_id || !pass_serial || !action_key || coin_amount == null) {
    throw new Error('brand_id, pass_serial, action_key e coin_amount sono obbligatori');
  }
  const res = await pool.query(
    `INSERT INTO coin_ledger (
      brand_id, pass_serial, user_id, action_key, coin_amount, description,
      related_entity_type, related_entity_id, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    RETURNING *`,
    [
      brand_id,
      pass_serial,
      user_id != null ? String(user_id) : null,
      action_key,
      coin_amount,
      description || null,
      related_entity_type || null,
      related_entity_id || null,
      metadata != null ? JSON.stringify(metadata) : null
    ]
  );
  return res.rows[0];
}

async function getPassCoinBalance(brandId, passSerial) {
  const res = await pool.query(
    `SELECT balance, last_activity, total_accruals, total_redemptions
     FROM pass_coin_balance
     WHERE brand_id = $1 AND pass_serial = $2`,
    [brandId, passSerial]
  );
  if (res.rows[0]) return res.rows[0];
  return {
    pass_serial: passSerial,
    brand_id: brandId,
    balance: 0,
    last_activity: null,
    total_accruals: 0,
    total_redemptions: 0
  };
}

async function getPgaSettings(brandId) {
  const res = await pool.query('SELECT * FROM pga_settings WHERE brand_id = $1', [brandId]);
  if (res.rows[0]) return res.rows[0];
  return {
    brand_id: brandId,
    enabled: false,
    welcome_message: null,
    annual_budget_external_eur: null,
    annual_budget_used_eur: 0,
    notify_hr_on_booking: true,
    notify_hr_email: null
  };
}

async function upsertPgaSettings(brandId, fields = {}) {
  const existing = await getPgaSettings(brandId);
  const wasEnabled = !!existing.enabled;
  const payload = {
    enabled: fields.enabled !== undefined ? !!fields.enabled : !!existing.enabled,
    welcome_message: fields.welcome_message !== undefined ? fields.welcome_message : existing.welcome_message,
    annual_budget_external_eur: fields.annual_budget_external_eur !== undefined
      ? fields.annual_budget_external_eur
      : existing.annual_budget_external_eur,
    annual_budget_used_eur: fields.annual_budget_used_eur !== undefined
      ? fields.annual_budget_used_eur
      : (existing.annual_budget_used_eur || 0),
    notify_hr_on_booking: fields.notify_hr_on_booking !== undefined
      ? !!fields.notify_hr_on_booking
      : existing.notify_hr_on_booking !== false,
    notify_hr_email: fields.notify_hr_email !== undefined ? fields.notify_hr_email : existing.notify_hr_email
  };
  const res = await pool.query(
    `INSERT INTO pga_settings (
      brand_id, enabled, welcome_message, annual_budget_external_eur,
      annual_budget_used_eur, notify_hr_on_booking, notify_hr_email, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
    ON CONFLICT (brand_id) DO UPDATE SET
      enabled = EXCLUDED.enabled,
      welcome_message = EXCLUDED.welcome_message,
      annual_budget_external_eur = EXCLUDED.annual_budget_external_eur,
      annual_budget_used_eur = EXCLUDED.annual_budget_used_eur,
      notify_hr_on_booking = EXCLUDED.notify_hr_on_booking,
      notify_hr_email = EXCLUDED.notify_hr_email,
      updated_at = NOW()
    RETURNING *`,
    [
      brandId, payload.enabled, payload.welcome_message, payload.annual_budget_external_eur,
      payload.annual_budget_used_eur, payload.notify_hr_on_booking, payload.notify_hr_email
    ]
  );
  const row = res.rows[0];
  if (!wasEnabled && row.enabled) {
    const { seedPgaDefaultsForBrand } = require('../engine/pga-seed');
    await seedPgaDefaultsForBrand(brandId, {
      seedExperiencesCatalog,
      seedCoinActionsConfig
    });
  }
  return row;
}

async function seedExperiencesCatalog(brandId, items) {
  let count = 0;
  for (const item of items) {
    const exists = await pool.query(
      'SELECT id FROM experiences_catalog WHERE brand_id = $1 AND key = $2 LIMIT 1',
      [brandId, item.key]
    );
    if (exists.rows[0]) continue;
    await pool.query(
      `INSERT INTO experiences_catalog (
        brand_id, key, name, description, category, coin_cost, max_per_user_per_year,
        max_total_per_month, internal, external_provider, external_cost_eur,
        requires_booking, active, display_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE,$13)`,
      [
        brandId, item.key, item.name, item.description || null, item.category, item.coin_cost,
        item.max_per_user_per_year ?? null, item.max_total_per_month ?? null,
        item.internal !== false, item.external_provider || null, item.external_cost_eur ?? null,
        item.requires_booking !== false, item.display_order ?? 100
      ]
    );
    count += 1;
  }
  return count;
}

async function seedCoinActionsConfig(brandId, items) {
  let count = 0;
  for (const item of items) {
    const exists = await pool.query(
      'SELECT id FROM coin_actions_config WHERE brand_id = $1 AND action_key = $2 LIMIT 1',
      [brandId, item.action_key]
    );
    if (exists.rows[0]) continue;
    await pool.query(
      `INSERT INTO coin_actions_config (brand_id, action_key, coin_amount, description, active)
       VALUES ($1,$2,$3,$4,TRUE)`,
      [brandId, item.action_key, item.coin_amount, item.description || null]
    );
    count += 1;
  }
  return count;
}

async function listCoinActions(brandId) {
  const res = await pool.query(
    'SELECT * FROM coin_actions_config WHERE brand_id = $1 ORDER BY action_key ASC',
    [brandId]
  );
  return res.rows;
}

async function updateCoinAction(id, brandId, fields) {
  const sets = [];
  const params = [];
  let idx = 1;
  if (fields.coin_amount !== undefined) {
    sets.push(`coin_amount = $${idx++}`);
    params.push(fields.coin_amount);
  }
  if (fields.description !== undefined) {
    sets.push(`description = $${idx++}`);
    params.push(fields.description);
  }
  if (fields.active !== undefined) {
    sets.push(`active = $${idx++}`);
    params.push(!!fields.active);
  }
  if (!sets.length) {
    const cur = await pool.query(
      'SELECT * FROM coin_actions_config WHERE id = $1 AND brand_id = $2',
      [id, brandId]
    );
    return cur.rows[0] || null;
  }
  params.push(id, brandId);
  const res = await pool.query(
    `UPDATE coin_actions_config SET ${sets.join(', ')}
     WHERE id = $${idx++} AND brand_id = $${idx} RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

async function listExperiences(brandId, { active, category } = {}) {
  const clauses = ['brand_id = $1'];
  const params = [brandId];
  let idx = 2;
  if (active === true || active === 'true') {
    clauses.push('active = TRUE');
  } else if (active === false || active === 'false') {
    clauses.push('active = FALSE');
  }
  if (category) {
    clauses.push(`category = $${idx++}`);
    params.push(category);
  }
  const res = await pool.query(
    `SELECT * FROM experiences_catalog WHERE ${clauses.join(' AND ')}
     ORDER BY display_order ASC, name ASC`,
    params
  );
  return res.rows;
}

async function getExperience(id, brandId = null) {
  const params = [id];
  let sql = 'SELECT * FROM experiences_catalog WHERE id = $1';
  if (brandId != null) {
    sql += ' AND brand_id = $2';
    params.push(brandId);
  }
  const res = await pool.query(sql, params);
  return res.rows[0] || null;
}

async function createExperience(data) {
  const {
    brand_id, key, name, description, category, coin_cost,
    max_per_user_per_year, max_total_per_month, internal = true,
    external_provider, external_cost_eur, requires_booking = true,
    active = true, image_url, display_order = 100
  } = data;
  if (!brand_id || !key || !name || !category || coin_cost == null) {
    throw new Error('brand_id, key, name, category e coin_cost sono obbligatori');
  }
  const res = await pool.query(
    `INSERT INTO experiences_catalog (
      brand_id, key, name, description, category, coin_cost, max_per_user_per_year,
      max_total_per_month, internal, external_provider, external_cost_eur,
      requires_booking, active, image_url, display_order
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
    RETURNING *`,
    [
      brand_id, key, name, description || null, category, coin_cost,
      max_per_user_per_year ?? null, max_total_per_month ?? null, !!internal,
      external_provider || null, external_cost_eur ?? null, !!requires_booking,
      active !== false, image_url || null, display_order
    ]
  );
  return res.rows[0];
}

const EXPERIENCE_MUTABLE = [
  'name', 'description', 'category', 'coin_cost', 'max_per_user_per_year',
  'max_total_per_month', 'internal', 'external_provider', 'external_cost_eur',
  'requires_booking', 'active', 'image_url', 'display_order'
];

async function updateExperience(id, brandId, fields) {
  const sets = [];
  const params = [];
  let idx = 1;
  for (const key of EXPERIENCE_MUTABLE) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${idx++}`);
      params.push(fields[key]);
    }
  }
  if (!sets.length) return getExperience(id, brandId);
  params.push(id, brandId);
  const res = await pool.query(
    `UPDATE experiences_catalog SET ${sets.join(', ')}
     WHERE id = $${idx++} AND brand_id = $${idx} RETURNING *`,
    params
  );
  return res.rows[0] || null;
}

async function softDeleteExperience(id, brandId) {
  return updateExperience(id, brandId, { active: false });
}

async function listExperienceBookings(experienceId, brandId, { status } = {}) {
  const clauses = ['experience_id = $1', 'brand_id = $2'];
  const params = [experienceId, brandId];
  if (status) {
    clauses.push('status = $3');
    params.push(status);
  }
  const res = await pool.query(
    `SELECT * FROM experience_bookings WHERE ${clauses.join(' AND ')}
     ORDER BY created_at DESC`,
    params
  );
  return res.rows;
}

async function listBrandBookings(brandId, { status, limit } = {}) {
  const clauses = ['b.brand_id = $1'];
  const params = [brandId];
  let idx = 2;
  if (status) {
    clauses.push(`b.status = $${idx++}`);
    params.push(status);
  }
  const limitVal = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  params.push(limitVal);
  const res = await pool.query(
    `SELECT b.*, e.name AS experience_name
     FROM experience_bookings b
     JOIN experiences_catalog e ON e.id = b.experience_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY b.created_at DESC
     LIMIT $${idx}`,
    params
  );
  return res.rows;
}

async function updateExperienceBookingStatus(id, brandId, status) {
  const allowed = new Set(['pending', 'confirmed', 'delivered', 'cancelled']);
  if (!allowed.has(status)) throw new Error('status non valido');
  const res = await pool.query(
    `UPDATE experience_bookings SET status = $1, updated_at = NOW()
     WHERE id = $2 AND brand_id = $3 RETURNING *`,
    [status, id, brandId]
  );
  return res.rows[0] || null;
}

async function getEngagementAnalytics(brandId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - Math.max(1, parseInt(days, 10) || 30));
  const coinRes = await pool.query(
    `SELECT
       COALESCE(SUM(coin_amount) FILTER (WHERE coin_amount > 0), 0) AS coins_granted,
       COALESCE(SUM(coin_amount) FILTER (WHERE coin_amount < 0), 0) AS coins_redeemed,
       COUNT(*) FILTER (WHERE coin_amount > 0) AS grant_events,
       COUNT(*) FILTER (WHERE coin_amount < 0) AS redemption_events
     FROM coin_ledger
     WHERE brand_id = $1 AND created_at >= $2`,
    [brandId, since.toISOString()]
  );
  const topExp = await pool.query(
    `SELECT e.name, COUNT(*)::int AS bookings
     FROM experience_bookings b
     JOIN experiences_catalog e ON e.id = b.experience_id
     WHERE b.brand_id = $1 AND b.created_at >= $2
     GROUP BY e.name
     ORDER BY bookings DESC
     LIMIT 10`,
    [brandId, since.toISOString()]
  );
  const topActions = await pool.query(
    `SELECT action_key, COUNT(*)::int AS events,
            COALESCE(SUM(coin_amount), 0)::int AS total_coins
     FROM coin_ledger
     WHERE brand_id = $1 AND created_at >= $2 AND coin_amount > 0
     GROUP BY action_key
     ORDER BY events DESC
     LIMIT 5`,
    [brandId, since.toISOString()]
  );
  const byWeekday = await pool.query(
    `SELECT EXTRACT(DOW FROM created_at)::int AS dow, COUNT(*)::int AS events,
            COALESCE(SUM(coin_amount), 0)::int AS total_coins
     FROM coin_ledger
     WHERE brand_id = $1 AND created_at >= $2
     GROUP BY dow
     ORDER BY dow`,
    [brandId, since.toISOString()]
  );
  const row = coinRes.rows[0] || {};
  return {
    days: Math.max(1, parseInt(days, 10) || 30),
    coins_granted: Number(row.coins_granted || 0),
    coins_redeemed: Math.abs(Number(row.coins_redeemed || 0)),
    grant_events: Number(row.grant_events || 0),
    redemption_events: Number(row.redemption_events || 0),
    top_experiences: topExp.rows,
    top_actions: topActions.rows,
    by_weekday: byWeekday.rows
  };
}

async function hasCoinGrantToday(brandId, passSerial, actionKey) {
  const res = await pool.query(
    `SELECT 1 FROM coin_ledger
     WHERE brand_id = $1 AND pass_serial = $2 AND action_key = $3
       AND created_at >= CURRENT_DATE
     LIMIT 1`,
    [brandId, passSerial, actionKey]
  );
  return !!res.rows[0];
}

async function listMembersWithHireAnniversaryToday(years) {
  const res = await pool.query(
    `SELECT m.*, pi.serial_number AS pass_serial
     FROM members m
     INNER JOIN pass_instances pi ON pi.id = m.pass_id AND pi.status = 'active'
     WHERE m.hire_date IS NOT NULL
       AND EXTRACT(MONTH FROM m.hire_date) = EXTRACT(MONTH FROM CURRENT_DATE)
       AND EXTRACT(DAY FROM m.hire_date) = EXTRACT(DAY FROM CURRENT_DATE)
       AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, m.hire_date)) = $1`,
    [years]
  );
  return res.rows;
}

async function listMembersWithBirthdayToday() {
  const res = await pool.query(
    `SELECT m.*, pi.serial_number AS pass_serial
     FROM members m
     INNER JOIN pass_instances pi ON pi.id = m.pass_id AND pi.status = 'active'
     WHERE m.birth_date IS NOT NULL
       AND EXTRACT(MONTH FROM m.birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
       AND EXTRACT(DAY FROM m.birth_date) = EXTRACT(DAY FROM CURRENT_DATE)`
  );
  return res.rows;
}

async function listCoinLedgerForPass(brandId, passSerial, limit = 50) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);
  const res = await pool.query(
    `SELECT id, action_key, coin_amount, description, created_at
     FROM coin_ledger
     WHERE brand_id = $1 AND pass_serial = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [brandId, passSerial, lim]
  );
  return res.rows;
}

async function listBookingsForPass(brandId, passSerial, limit = 20) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const res = await pool.query(
    `SELECT b.*, e.name AS experience_name, e.key AS experience_key
     FROM experience_bookings b
     JOIN experiences_catalog e ON e.id = b.experience_id
     WHERE b.brand_id = $1 AND b.pass_serial = $2
     ORDER BY b.created_at DESC
     LIMIT $3`,
    [brandId, passSerial, lim]
  );
  return res.rows;
}

async function createExperienceBooking({
  brand_id,
  experience_id,
  pass_serial,
  user_id = null,
  coin_amount,
  status = 'pending',
  scheduled_at = null,
  notes = null,
  metadata = null
}) {
  if (!brand_id || !experience_id || !pass_serial || coin_amount == null) {
    throw new Error('brand_id, experience_id, pass_serial e coin_amount sono obbligatori');
  }
  const res = await pool.query(
    `INSERT INTO experience_bookings (
      brand_id, experience_id, pass_serial, user_id, coin_amount, status,
      scheduled_at, notes, metadata
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
    RETURNING *`,
    [
      brand_id,
      experience_id,
      pass_serial,
      user_id != null ? String(user_id) : null,
      coin_amount,
      status,
      scheduled_at || null,
      notes || null,
      metadata != null ? JSON.stringify(metadata) : null
    ]
  );
  return res.rows[0];
}

async function getExperienceBooking(id, brandId) {
  const res = await pool.query(
    'SELECT * FROM experience_bookings WHERE id = $1 AND brand_id = $2',
    [id, brandId]
  );
  return res.rows[0] || null;
}

async function getExperienceBookingForPass(id, brandId, passSerial) {
  const res = await pool.query(
    `SELECT * FROM experience_bookings
     WHERE id = $1 AND brand_id = $2 AND pass_serial = $3`,
    [id, brandId, passSerial]
  );
  return res.rows[0] || null;
}

async function countPassExperienceBookingsYear(brandId, passSerial, experienceId, year) {
  const y = parseInt(year, 10) || new Date().getFullYear();
  const res = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM experience_bookings
     WHERE brand_id = $1 AND pass_serial = $2 AND experience_id = $3
       AND status <> 'cancelled'
       AND EXTRACT(YEAR FROM created_at) = $4`,
    [brandId, passSerial, experienceId, y]
  );
  return Number(res.rows[0]?.count || 0);
}

async function countExperienceBookingsMonth(brandId, experienceId, year, month) {
  const y = parseInt(year, 10) || new Date().getFullYear();
  const m = parseInt(month, 10) || (new Date().getMonth() + 1);
  const res = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM experience_bookings
     WHERE brand_id = $1 AND experience_id = $2
       AND status IN ('pending', 'confirmed', 'delivered')
       AND EXTRACT(YEAR FROM created_at) = $3
       AND EXTRACT(MONTH FROM created_at) = $4`,
    [brandId, experienceId, y, m]
  );
  return Number(res.rows[0]?.count || 0);
}

async function getExperienceAvailability(brandId, experienceId, passSerial) {
  const experience = await getExperience(experienceId, brandId);
  if (!experience) {
    return {
      user_bookings_this_year: 0,
      max_per_user_per_year: null,
      bookings_this_month: 0,
      max_total_per_month: null,
      slots_remaining_this_month: null,
      can_redeem: false,
      reason: 'NOT_FOUND'
    };
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const userBookings = await countPassExperienceBookingsYear(
    brandId, passSerial, experienceId, year
  );
  const monthBookings = await countExperienceBookingsMonth(
    brandId, experienceId, year, month
  );
  const maxYear = experience.max_per_user_per_year != null
    ? Number(experience.max_per_user_per_year)
    : null;
  const maxMonth = experience.max_total_per_month != null
    ? Number(experience.max_total_per_month)
    : null;
  const slotsRemaining = maxMonth != null ? Math.max(0, maxMonth - monthBookings) : null;

  let canRedeem = true;
  let reason = null;
  if (maxYear != null && userBookings >= maxYear) {
    canRedeem = false;
    reason = 'YEARLY_LIMIT';
  } else if (maxMonth != null && monthBookings >= maxMonth) {
    canRedeem = false;
    reason = 'MONTHLY_EXHAUSTED';
  }

  return {
    user_bookings_this_year: userBookings,
    max_per_user_per_year: maxYear,
    bookings_this_month: monthBookings,
    max_total_per_month: maxMonth,
    slots_remaining_this_month: slotsRemaining,
    can_redeem: canRedeem,
    reason
  };
}

module.exports = {
  getDb,
  saveDb,
  pool,
  // Brands
  createBrand,
  getBrand,
  getBrandBySlug,
  listBrands,
  updateBrand,
  deleteBrand,
  // Templates
  createTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
  deleteTemplate,
  // Campaigns
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaign,
  deleteCampaign,
  incrementCampaignDownloads,
  incrementCampaignInstalls,
  // Pass Instances
  createPassInstance,
  getPassInstance,
  getPassBySerial,
  updatePassInstance,
  touchPass,
  touchPassesByIds,
  touchPassesForBrand,
  markPassesPushDelivered,
  markPassPushStatus,
  markGoogleWalletUpdateStatus,
  createPushJob,
  getPushJob,
  claimPushJob,
  updatePushJob,
  getMemberForPass,
  listEmployeesForBrand,
  getEmployeeFieldOptionsForBrand,
  isEmployeeMatricolaAvailable,
  findMemberByBrandKey,
  createMemberRecord,
  updateMemberRecord,
  deleteMemberRecord,
  importEmployeesBatch,
  updatePassDynamicLinks,
  clearPassDynamicLinks,
  updatePassPushOverlays,
  clearPassPushOverlay,
  touchPassesForTemplate,
  listPasses,
  countPasses,
  deletePass,
  // Events
  logEvent,
  listEvents,
  // Device Registrations
  registerDevice,
  getDevicesForPass,
  getDevicesForBrand,
  getDevicesForTemplate,
  unregisterDevice,
  getSerialsForDevice,
  // Analytics
  getAnalytics,
  getCampaignAnalytics,
  // Push
  logPush,
  listPushes,
  deletePush,
  clearPushHistory,
  // Scheduled Push
  createScheduledPush,
  listScheduledPush,
  getScheduledPush,
  updateScheduledPush,
  deleteScheduledPush,
  getDueScheduledPush,
  createAudience,
  getAudience,
  listAudiences,
  updateAudience,
  deleteAudience,
  logPushAssistantInteraction,
  logWaiInteraction,
  listWaiLog,
  logEnrollmentAttempt,
  listEnrollmentAttempts,
  createImportError,
  listImportErrors,
  // Strip Promos
  createStripPromo,
  listStripPromos,
  getStripPromo,
  updateStripPromo,
  deleteStripPromo,
  getActiveStripPromos,
  // Users
  createUser,
  getUserByEmail,
  getUser,
  listUsers,
  updateUser,
  deleteUser,
  verifyPassword,
  createPasswordResetToken,
  getPasswordResetUserByToken,
  markPasswordResetTokenUsed,
  seedAdminUser,
  // Media Hub
  createMedia,
  listMedia,
  getMedia,
  deleteMedia,
  // Ad Events
  logAdEvent,
  getAdStats,
  getAdTimeline,
  // Creative Assets
  createCreativeAsset,
  getCreativeAsset,
  listCreativeAssets,
  deleteCreativeAsset,
  // Instant Win
  createInstantWinCampaign,
  getInstantWinCampaign,
  listInstantWinCampaigns,
  updateInstantWinCampaign,
  deleteInstantWinCampaign,
  createInstantWinPlay,
  listInstantWinPlays,
  countPlaysForUser,
  getInstantWinStats,
  // Gamification
  createGamificationCampaign,
  getGamificationCampaign,
  listGamificationCampaigns,
  updateGamificationCampaign,
  deleteGamificationCampaign,
  createGamificationPlay,
  listGamificationPlays,
  countGamificationPlaysForUser,
  getGamificationStats,
  updateGoogleWalletStatus,
  getPassBySamsungRefId,
  updateSamsungWalletStatus,
  updatePassDeviceId,
  registerWalletCallbackEvent,
  finalizeWalletCallbackEvent,
  // HUB Convenzioni
  createMerchant,
  getMerchant,
  findMerchantByNameAndBrand,
  listMerchants,
  updateMerchant,
  softDeleteMerchant,
  createMerchantLocation,
  listMerchantLocations,
  deleteMerchantLocation,
  listMerchantGeofenceLocationsForBrand,
  getMerchantAnalytics,
  getHubBrandAnalytics,
  getHubSettings,
  upsertHubSettings,
  listActiveMerchantsForHub,
  findMerchantsNearby,
  groupNearbyMerchantRows,
  haversineKm,
  logConventionActivation,
  getCoinActionConfig,
  insertCoinLedgerEntry,
  getPassCoinBalance,
  getPgaSettings,
  upsertPgaSettings,
  seedExperiencesCatalog,
  seedCoinActionsConfig,
  listCoinActions,
  updateCoinAction,
  listExperiences,
  getExperience,
  createExperience,
  updateExperience,
  softDeleteExperience,
  listExperienceBookings,
  listBrandBookings,
  updateExperienceBookingStatus,
  getEngagementAnalytics,
  hasCoinGrantToday,
  listMembersWithHireAnniversaryToday,
  listMembersWithBirthdayToday,
  listCoinLedgerForPass,
  listBookingsForPass,
  createExperienceBooking,
  getExperienceBooking,
  getExperienceBookingForPass,
  countPassExperienceBookingsYear,
  countExperienceBookingsMonth,
  getExperienceAvailability,
  // Employee portal (see src/db/portal.js)
  ...require('./portal')
};

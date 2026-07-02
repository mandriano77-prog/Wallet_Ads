/**
 * Google Wallet Pass Engine
 *
 * Creates and manages Google Wallet passes (Loyalty type).
 * Uses JWT-based "Add to Google Wallet" links — no file download needed.
 *
 * Flow (no pre-registration):
 * 1. buildPassClass()   — build class object (NOT sent to API, embedded in JWT)
 * 2. buildPassObject()  — build instance for a user
 * 3. generateSaveLink() — embed both class+object in JWT → "Add to Google Wallet" URL
 * 4. updatePassObject() — update pass content in real-time (still uses API for updates)
 *
 * NOTE: By embedding loyaltyClasses inside the JWT payload (same as the Laravel approach),
 * we skip Google's class pre-registration/approval flow and avoid the
 * "This pass is only used for testing" restriction.
 */

const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────
const ISSUER_ID = process.env.GOOGLE_WALLET_ISSUER_ID || '';
const DEFAULT_SERVICE_ACCOUNT_FILE = path.join(__dirname, '..', '..', 'google-pass-credentials.json');

function parseServiceAccount(raw, sourceLabel) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`[GoogleWallet] Failed to parse ${sourceLabel}:`, e.message);
    return null;
  }
}

// Support both raw JSON and base64-encoded JSON
function loadServiceAccount() {
  if (process.env.GOOGLE_WALLET_SA_BASE64) {
    try {
      const decoded = Buffer.from(process.env.GOOGLE_WALLET_SA_BASE64, 'base64').toString('utf8');
      const parsed = parseServiceAccount(decoded, 'GOOGLE_WALLET_SA_BASE64 decoded payload');
      if (parsed) return parsed;
    } catch (e) {
      console.error('[GoogleWallet] Failed to decode GOOGLE_WALLET_SA_BASE64:', e.message);
    }
  }
  if (process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON) {
    const parsed = parseServiceAccount(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON, 'GOOGLE_WALLET_SERVICE_ACCOUNT_JSON');
    if (parsed) return parsed;
  }
  const configuredFile = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_FILE;
  if (configuredFile) {
    try {
      const fileText = fs.readFileSync(configuredFile, 'utf8');
      const parsed = parseServiceAccount(fileText, `GOOGLE_WALLET_SERVICE_ACCOUNT_FILE (${configuredFile})`);
      if (parsed) return parsed;
    } catch (e) {
      console.error('[GoogleWallet] Failed to read GOOGLE_WALLET_SERVICE_ACCOUNT_FILE:', e.message);
    }
  }
  if (fs.existsSync(DEFAULT_SERVICE_ACCOUNT_FILE)) {
    try {
      const fileText = fs.readFileSync(DEFAULT_SERVICE_ACCOUNT_FILE, 'utf8');
      const parsed = parseServiceAccount(fileText, DEFAULT_SERVICE_ACCOUNT_FILE);
      if (parsed) return parsed;
    } catch (e) {
      console.error('[GoogleWallet] Failed to read default service account file:', e.message);
    }
  }
  return null;
}
const SERVICE_ACCOUNT_JSON = loadServiceAccount();

const WALLET_API_BASE = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SAVE_LINK_BASE = 'https://pay.google.com/gp/v/save';

function getPassKind() {
  const raw = String(process.env.GOOGLE_WALLET_PASS_KIND || 'generic').trim().toLowerCase();
  return raw === 'loyalty' ? 'loyalty' : 'generic';
}

/** HR employee passes always use Generic (store-card layout), not Loyalty text modules. */
function resolvePassKind(brand) {
  if (brand && isHrEmployeePass(brand)) return 'generic';
  return getPassKind();
}

function isLoyaltyMode(brand) {
  return resolvePassKind(brand) === 'loyalty';
}

function getReviewStatus() {
  const raw = String(process.env.GOOGLE_WALLET_REVIEW_STATUS || 'UNDER_REVIEW').trim().toUpperCase();
  const allowed = new Set(['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED']);
  return allowed.has(raw) ? raw : 'UNDER_REVIEW';
}

function isDebugEnabled() {
  const raw = String(process.env.GOOGLE_WALLET_DEBUG || '').trim().toLowerCase();
  if (!raw) return true;
  return !['0', 'false', 'off', 'no'].includes(raw);
}

function logWalletDebug(event, payload) {
  if (!isDebugEnabled()) return;
  try {
    console.log(`[GoogleWallet][Debug] ${event} ${JSON.stringify(payload)}`);
  } catch (e) {
    console.log(`[GoogleWallet][Debug] ${event}`);
  }
}

function resolveApiBase() {
  const rawHost =
    (process.env.CUSTOM_DOMAIN && process.env.CUSTOM_DOMAIN.trim()) ||
    (process.env.RAILWAY_PUBLIC_DOMAIN && process.env.RAILWAY_PUBLIC_DOMAIN.trim()) ||
    (process.env.APP_PUBLIC_DOMAIN && process.env.APP_PUBLIC_DOMAIN.trim()) ||
    '';
  const host = rawHost.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
  return host ? `https://${host}/api/v1` : '';
}
const API_BASE = resolveApiBase();

const {
  buildEmployeePass,
  toGooglePass,
  isHrEmployeePass
} = require('./employee-pass');

function walletPublicBrandAssetUri(brand, asset) {
  if (!API_BASE || !brand?.slug) return null;
  return `${API_BASE}/brands/by-slug/${encodeURIComponent(brand.slug)}/${asset}`;
}

/**
 * Normalize a brand slug for use inside a Google Wallet class ID.
 * Google Wallet class IDs are case-sensitive: `Motor_K` and `motor-k`
 * would produce two different classes for the same brand. Lowercasing
 * and replacing non [a-z0-9_-] avoids accidental duplicates.
 *
 * Allowed characters per Google docs: [A-Za-z0-9._-]. We restrict to
 * lowercase to enforce a single canonical form.
 */
function sanitizeSlugForClassId(slug) {
  if (!slug) return '';
  return String(slug)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildGenericClassId(brand, template) {
  // Keep legacy Generic IDs to reuse existing active classes.
  const slug = sanitizeSlugForClassId(brand.slug);
  return `${ISSUER_ID}.${slug}_${template.id}`;
}

function buildGenericObjectId(serialNumber) {
  // Keep legacy Generic object IDs for update/callback compatibility.
  return `${ISSUER_ID}.${serialNumber}`;
}

function buildLoyaltyClassId(brand, template) {
  // Use a loyalty-specific namespace to avoid collisions with legacy Generic classes.
  const slug = sanitizeSlugForClassId(brand.slug);
  return `${ISSUER_ID}.loyalty_${slug}_${template.id}`;
}

function buildLoyaltyObjectId(serialNumber) {
  // Keep object IDs in the same loyalty namespace for type-safe uniqueness.
  return `${ISSUER_ID}.loyalty_${serialNumber}`;
}

function buildLegacyObjectId(serialNumber) {
  return `${ISSUER_ID}.${serialNumber}`;
}

function buildClassId(brand, template) {
  return isLoyaltyMode(brand)
    ? buildLoyaltyClassId(brand, template)
    : buildGenericClassId(brand, template);
}

function buildObjectId(serialNumber, brand) {
  return isLoyaltyMode(brand)
    ? buildLoyaltyObjectId(serialNumber)
    : buildGenericObjectId(serialNumber);
}

// ── JWT helpers ───────────────────────────────────────────────────────

function createServiceAccountJWT() {
  if (!SERVICE_ACCOUNT_JSON) throw new Error('Google Wallet service account not configured');

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: SERVICE_ACCOUNT_JSON.client_email,
    scope: 'https://www.googleapis.com/auth/wallet_object.issuer',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = sign.sign(SERVICE_ACCOUNT_JSON.private_key);

  return `${signInput}.${base64url(signature)}`;
}

let cachedToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;

  const jwt = createServiceAccountJWT();
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;

  const res = await httpRequest('POST', 'https://oauth2.googleapis.com/token', body, {
    'Content-Type': 'application/x-www-form-urlencoded'
  });

  cachedToken = res.access_token;
  tokenExpiry = Date.now() + (res.expires_in - 60) * 1000;
  return cachedToken;
}

/**
 * Create a signed JWT for "Add to Google Wallet" save link.
 *
 * KEY CHANGE: Now accepts both classObject and passObject and embeds
 * loyaltyClasses + loyaltyObjects in the payload — exactly like the Laravel code.
 * This avoids the "testing only" restriction from pre-registered classes.
 */
function createSaveJWT(classObject, passObject, brand) {
  if (!SERVICE_ACCOUNT_JSON) throw new Error('Google Wallet service account not configured');

  const rawHost =
    (process.env.CUSTOM_DOMAIN && process.env.CUSTOM_DOMAIN.trim()) ||
    (process.env.RAILWAY_PUBLIC_DOMAIN && process.env.RAILWAY_PUBLIC_DOMAIN.trim()) ||
    (process.env.APP_PUBLIC_DOMAIN && process.env.APP_PUBLIC_DOMAIN.trim()) ||
    '';
  const host = rawHost.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
  const origin = host ? `https://${host}` : 'https://localhost';

  const passKind = resolvePassKind(brand);
  const payloadData = passKind === 'loyalty'
    ? {
      loyaltyClasses: [classObject],
      loyaltyObjects: [passObject]
    }
    : {
      // Generic mode uses pre-created classes and sends object only.
      genericObjects: [passObject]
    };

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: SERVICE_ACCOUNT_JSON.client_email,
    aud: 'google',
    origins: [origin],
    typ: 'savetowallet',
    iat: now,
    payload: payloadData
  };

  logWalletDebug('createSaveJWT.payload', {
    iss: SERVICE_ACCOUNT_JSON.client_email,
    aud: payload.aud,
    origin,
    iat: now,
    classId: classObject?.id || null,
    objectId: passObject?.id || null,
    classReviewStatus: classObject?.reviewStatus || null,
    objectClassId: passObject?.classId || null,
    passKind,
    registrationMode: passKind === 'loyalty' ? 'jwt-embedded' : 'pre-registered-class'
  });

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = sign.sign(SERVICE_ACCOUNT_JSON.private_key);

  return `${signInput}.${base64url(signature)}`;
}

// ── Pass Class (template) ─────────────────────────────────────────────

function normalizeMerchantLocations(brandConfig) {
  const raw = brandConfig?.locations;
  if (!Array.isArray(raw) || raw.length === 0) return [];

  const locations = [];
  const seen = new Set();
  for (const loc of raw) {
    if (locations.length >= 10) break;
    const latitude = parseFloat(loc?.latitude);
    const longitude = parseFloat(loc?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;

    const key = `${latitude.toFixed(5)}:${longitude.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    locations.push({ latitude, longitude });
  }
  return locations;
}

/**
 * Build a pass class object.
 *
 * KEY CHANGE: This no longer calls the Google API.
 * It just returns the class object to be embedded in the JWT.
 */
function buildPassClass(brand, template) {
  const passKind = resolvePassKind(brand);
  const classId = buildClassId(brand, template);

  let classObj;
  if (passKind === 'loyalty') {
    classObj = {
      id: classId,
      reviewStatus: getReviewStatus(),
      issuerName: brand.name,
      programName: (template.name || brand.name || 'Loyalty Program').slice(0, 64)
    };

    const logoUri = walletPublicBrandAssetUri(brand, 'logo');
    if (logoUri && (brand.config?.logo_base64 || brand.config?.logos?.logo)) {
      classObj.programLogo = {
        sourceUri: { uri: logoUri },
        contentDescription: { defaultValue: { language: 'it', value: brand.name } }
      };
    }
  } else {
    classObj = {
      id: classId,
      issuerName: brand.name,
      reviewStatus: getReviewStatus()
    };

    const logoUri = walletPublicBrandAssetUri(brand, 'logo');
    if (logoUri && (brand.config?.logo_base64 || brand.config?.logos?.logo)) {
      classObj.logo = {
        sourceUri: { uri: logoUri },
        contentDescription: { defaultValue: { language: 'it', value: brand.name } }
      };
    }

    const stripUri = walletPublicBrandAssetUri(brand, 'strip');
    if (stripUri && (brand.config?.strip_base64 || brand.config?.logos?.strip || template.style?.stripImage)) {
      classObj.heroImage = {
        sourceUri: { uri: stripUri },
        contentDescription: { defaultValue: { language: 'it', value: 'Banner' } }
      };
    }

    if (API_BASE) {
      classObj.callbackOptions = { url: `${API_BASE}/google-wallet/callback` };
    }
  }

  classObj.hexBackgroundColor = rgbToHex(template.style?.backgroundColor || '#0D0B1A');

  if (isHrEmployeePass(brand)) {
    const employeePass = buildEmployeePass({
      brand,
      template,
      instance: { field_values: {} },
      member: null,
      brandConfig: brand.config,
      apiBase: API_BASE
    });
    const { classPatch } = toGooglePass(employeePass, { passKind });
    Object.assign(classObj, classPatch);
    if (passKind !== 'loyalty' && API_BASE) {
      classObj.callbackOptions = { url: `${API_BASE}/google-wallet/callback` };
    }
  }

  const merchantLocations = normalizeMerchantLocations(brand.config || {});
  if (merchantLocations.length) {
    classObj.merchantLocations = merchantLocations;
  }

  logWalletDebug('buildPassClass', {
    classId,
    passKind,
    reviewStatus: classObj.reviewStatus,
    issuerName: classObj.issuerName,
    programName: classObj.programName || null,
    hasProgramLogo: !!classObj.programLogo,
    hasLogo: !!classObj.logo,
    merchantLocationsCount: merchantLocations.length
  });

  return classObj;
}

/**
 * @deprecated Use buildPassClass() instead.
 * Kept for backward compatibility — now just builds without API call.
 */
async function createOrUpdatePassClass(brand, template) {
  if (isLoyaltyMode(brand)) {
    console.warn('[GoogleWallet] Loyalty mode uses JWT-embedded class. Skipping pre-registration.');
    return buildPassClass(brand, template);
  }

  const classObj = buildPassClass(brand, template);
  console.log(`[GoogleWallet] ensure class issuerId=${ISSUER_ID} classId=${classObj.id}`);
  try {
    const existing = await walletApiGet(`/genericClass/${encodeURIComponent(classObj.id)}`);
    if (existing && existing.id) {
      const updated = await walletApiPatch(`/genericClass/${encodeURIComponent(classObj.id)}`, classObj);
      console.log(`[GoogleWallet] Updated generic class ${classObj.id}`);
      return updated;
    }
  } catch (e) {
    if (e.statusCode !== 404) throw e;
  }

  const created = await walletApiPost('/genericClass', classObj);
  console.log(`[GoogleWallet] Created generic class ${classObj.id}`);
  return created;
}

async function getClassRegistration(brand, template) {
  const classId = buildClassId(brand, template);
  const passKind = resolvePassKind(brand);
  if (passKind === 'loyalty') {
    return {
      class_id: classId,
      issuer_id: ISSUER_ID || null,
      registered: null,
      note: 'Loyalty mode embeds class in JWT (no pre-registration check)'
    };
  }
  try {
    const existing = await walletApiGet(`/genericClass/${encodeURIComponent(classId)}`);
    return {
      class_id: classId,
      issuer_id: ISSUER_ID || null,
      registered: !!(existing && existing.id),
      review_status: existing?.reviewStatus || null
    };
  } catch (e) {
    if (e.statusCode === 404) {
      return { class_id: classId, issuer_id: ISSUER_ID || null, registered: false };
    }
    return {
      class_id: classId,
      issuer_id: ISSUER_ID || null,
      registered: null,
      error: e.message
    };
  }
}

/**
 * Generic mode: upsert class, then create/update object on Google servers.
 */
async function ensurePassReadyOnServer(brand, template, passObject) {
  await createOrUpdatePassClass(brand, template);
  return createPassObjectOnServer(passObject, brand);
}

function formatGoogleWalletError(err) {
  const msg = String(err?.message || err || 'Google Wallet error');
  const reason = err?.body?.error?.errors?.[0]?.reason
    || err?.body?.error?.status
    || '';
  const combined = `${msg} ${reason}`.toLowerCase();

  if (combined.includes('classnotfound') || reason === 'classNotFound') {
    return {
      status: 422,
      code: 'class_not_found',
      error: 'Template non ancora registrato su Google Wallet. Riprova tra qualche secondo.'
    };
  }
  if (err?.statusCode === 403 || combined.includes('permission') || combined.includes('issuer')) {
    return {
      status: 403,
      code: 'issuer_mismatch',
      error: 'Credenziali Google Wallet non valide o issuerId non corrispondente al service account.'
    };
  }
  if (err?.statusCode === 404) {
    return { status: 404, code: 'not_found', error: 'Risorsa Google Wallet non trovata.' };
  }
  const status = Number.isFinite(err?.statusCode) && err.statusCode >= 400 && err.statusCode < 600
    ? err.statusCode
    : 500;
  return { status, code: 'google_wallet_error', error: msg };
}

// ── Pass Object (instance) ────────────────────────────────────────────

async function resolveHrPassOptions(brand, instance, memberHint) {
  let member = memberHint && (memberHint.first_name || memberHint.last_name || memberHint.id)
    ? memberHint
    : null;
  if (!member && instance?.id) {
    try {
      const { getMemberForPass } = require('../db');
      member = await getMemberForPass(instance.id);
    } catch (err) {
      console.warn('[GoogleWallet] member lookup skipped:', err.message);
    }
  }

  let portalUrl = null;
  let hubUrl = null;
  let pgaUrl = null;
  let meUrl = null;
  let coinBalance = 0;

  if (isHrEmployeePass(brand) && instance?.serial_number) {
    try {
      const { getCurrentBalance } = require('./coins');
      coinBalance = await getCurrentBalance(brand.id, instance.serial_number);
    } catch (err) {
      console.warn('[GoogleWallet] coin balance load failed:', err.message);
      coinBalance = 0;
    }
  }

  if (isHrEmployeePass(brand) && instance?.serial_number && (process.env.JWT_HUB_SECRET || process.env.JWT_SECRET)) {
    try {
      const { signHubToken, buildHubUrl, buildHubAppUrl } = require('./hub-jwt');
      const { getPgaSettings } = require('../db');
      const userId = member?.id || instance.member_id || null;
      const token = signHubToken({
        user_id: userId,
        pass_serial: instance.serial_number,
        brand_id: brand.id
      });
      hubUrl = buildHubUrl(token, brand.slug);
      meUrl = buildHubAppUrl(token, brand.slug, 'me');
      const pgaSettings = await getPgaSettings(brand.id);
      if (pgaSettings?.enabled) {
        pgaUrl = buildHubAppUrl(token, brand.slug, 'pga');
      }
    } catch (err) {
      console.warn('[GoogleWallet] hub links skipped:', err.message);
    }
  }

  if (!portalUrl && instance?.id) {
    try {
      const { resolvePortalLinkForPass } = require('./portal-pass-link');
      const link = await resolvePortalLinkForPass(instance.id, { rotate: false });
      portalUrl = link?.portal_url || null;
    } catch (_) {}
  }

  return { member, portalUrl, hubUrl, pgaUrl, meUrl, coinBalance };
}

async function buildPassObject(brand, template, instance, memberHint) {
  const passKind = resolvePassKind(brand);
  const classId = buildClassId(brand, template);
  const objectId = buildObjectId(instance.serial_number, brand);

  if (isHrEmployeePass(brand)) {
    const { brandConfigForHrPass } = require('./pass-push-state');
    const hrOpts = await resolveHrPassOptions(brand, instance, memberHint);
    const employeePass = buildEmployeePass({
      brand,
      template,
      instance,
      member: hrOpts.member,
      brandConfig: brandConfigForHrPass(brand, instance),
      apiBase: API_BASE,
      portalUrl: hrOpts.portalUrl,
      hubUrl: hrOpts.hubUrl,
      pgaUrl: hrOpts.pgaUrl,
      meUrl: hrOpts.meUrl,
      coinBalance: hrOpts.coinBalance
    });
    const { objectPatch } = toGooglePass(employeePass, { passKind });
    const obj = passKind === 'loyalty'
      ? {
        id: objectId,
        classId,
        state: 'ACTIVE',
        accountId: instance.serial_number,
        textModulesData: [],
        linksModuleData: { uris: [] }
      }
      : {
        id: objectId,
        classId,
        state: 'ACTIVE',
        textModulesData: [],
        linksModuleData: { uris: [] }
      };
    Object.assign(obj, objectPatch);
    logWalletDebug('buildPassObject', {
      passKind,
      objectId,
      classId,
      hr: true,
      state: obj.state,
      textModulesCount: obj.textModulesData?.length || 0,
      linksCount: obj.linksModuleData?.uris?.length || 0
    });
    return obj;
  }

  const firstName = memberHint?.first_name || instance.customer_data?.name || 'Guest';
  const lastName = memberHint?.last_name || '';

  const { buildIdentifyingQrBarcode } = require('./passkit');
  const { message: barcodeValue, altText: barcodeAlt } = buildIdentifyingQrBarcode(instance);

  const obj = passKind === 'loyalty'
    ? {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      accountId: instance.serial_number,
      accountName: (`${firstName} ${lastName}`.trim() || 'Guest').slice(0, 64),
      barcode: {
        type: 'QR_CODE',
        value: barcodeValue || instance.serial_number,
        alternateText: barcodeAlt || instance.serial_number
      },
      textModulesData: [],
      linksModuleData: { uris: [] }
    }
    : {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      cardTitle: { defaultValue: { language: 'it', value: brand.name } },
      subheader: { defaultValue: { language: 'it', value: 'Membro' } },
      header: { defaultValue: { language: 'it', value: (`${firstName} ${lastName}`.trim() || 'Guest') } },
      barcode: {
        type: 'QR_CODE',
        value: barcodeValue || instance.serial_number,
        alternateText: barcodeAlt || instance.serial_number
      },
      hexBackgroundColor: rgbToHex(template.style?.backgroundColor || '#0D0B1A'),
      textModulesData: [],
      linksModuleData: { uris: [] }
    };

  const pointsValue = instance.field_values?.points || '0';
  const parsedPoints = Number.parseInt(String(pointsValue).replace(/[^0-9-]/g, ''), 10);
  if (passKind === 'loyalty') {
    obj.loyaltyPoints = {
      label: 'Points',
      balance: Number.isFinite(parsedPoints)
        ? { int: parsedPoints }
        : { string: String(pointsValue).slice(0, 32) }
    };
  } else {
    obj.textModulesData.push({
      id: 'points',
      header: 'Points',
      body: Number.isFinite(parsedPoints) ? String(parsedPoints) : String(pointsValue).slice(0, 32)
    });
  }

  // Map template fields to text modules
  if (template.fields && Array.isArray(template.fields)) {
    template.fields.forEach(field => {
      if (field.type === 'back') {
        const value = instance.field_values?.[field.key] || field.value || '';
        if (value.startsWith('http')) {
          obj.linksModuleData.uris.push({
            uri: value,
            description: field.label || field.key,
            id: field.key
          });
        } else if (value) {
          obj.textModulesData.push({
            id: field.key,
            header: field.label || field.key,
            body: value
          });
        }
      } else if (['secondary', 'auxiliary'].includes(field.type)) {
        const value = instance.field_values?.[field.key] || field.value || '';
        if (value) {
          obj.textModulesData.push({
            id: field.key,
            header: field.label || field.key,
            body: String(value)
          });
        }
      }
    });
  }

  logWalletDebug('buildPassObject', {
    passKind,
    objectId,
    classId,
    state: obj.state,
    accountId: obj.accountId,
    textModulesCount: obj.textModulesData.length,
    linksCount: obj.linksModuleData?.uris?.length || 0
  });

  return obj;
}

/**
 * Generate the "Add to Google Wallet" URL.
 *
 * KEY CHANGE: Now takes brand+template to build the class inline,
 * then embeds both class and object in the JWT — no pre-registration needed.
 */
function generateSaveLink(brand, template, passObject) {
  const classObject = buildPassClass(brand, template);
  const jwt = createSaveJWT(classObject, passObject, brand);
  logWalletDebug('generateSaveLink', {
    classId: classObject?.id || null,
    objectId: passObject?.id || null,
    reviewStatus: classObject?.reviewStatus || null,
    jwtLength: jwt.length
  });
  return `${SAVE_LINK_BASE}/${jwt}`;
}

/**
 * @deprecated Old signature: generateSaveLink(passObject)
 * If you were calling generateSaveLink with just a passObject,
 * switch to: generateSaveLink(brand, template, passObject)
 */
function generateSaveLinkLegacy(passObject) {
  console.warn('[GoogleWallet] generateSaveLinkLegacy() embeds only the object (old behaviour). Switch to generateSaveLink(brand, template, passObject).');
  if (!SERVICE_ACCOUNT_JSON) throw new Error('Google Wallet service account not configured');

  const rawHost =
    (process.env.CUSTOM_DOMAIN && process.env.CUSTOM_DOMAIN.trim()) ||
    (process.env.RAILWAY_PUBLIC_DOMAIN && process.env.RAILWAY_PUBLIC_DOMAIN.trim()) ||
    (process.env.APP_PUBLIC_DOMAIN && process.env.APP_PUBLIC_DOMAIN.trim()) ||
    '';
  const host = rawHost.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
  const origin = host ? `https://${host}` : 'https://localhost';

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: SERVICE_ACCOUNT_JSON.client_email,
    aud: 'google',
    origins: [origin],
    typ: 'savetowallet',
    iat: now,
    payload: { loyaltyObjects: [passObject] }
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signInput);
  const signature = sign.sign(SERVICE_ACCOUNT_JSON.private_key);

  return `${SAVE_LINK_BASE}/${signInput}.${base64url(signature)}`;
}

/**
 * Create or update the pass object on Google's servers.
 * Still useful if you want server-side push updates later.
 */
async function createPassObjectOnServer(passObject, brand) {
  const passKind = resolvePassKind(brand);
  const objectPath = passKind === 'loyalty' ? 'loyaltyObject' : 'genericObject';
  const objectUrl = `/${objectPath}/${encodeURIComponent(passObject.id)}`;
  try {
    const existing = await walletApiGet(objectUrl);
    if (existing && existing.id) {
      const updated = await walletApiPatch(objectUrl, passObject);
      console.log(`[GoogleWallet] Updated object ${passObject.id}`);
      return updated;
    }
  } catch (e) {
    const status = e?.statusCode || null;
    if (status && status !== 404) {
      console.warn(`[GoogleWallet] lookup ${objectPath} failed for ${passObject.id}: ${e.message}`);
      throw e;
    }
  }

  const created = await walletApiPost(`/${objectPath}`, passObject);
  console.log(`[GoogleWallet] Created object ${passObject.id}`);
  return created;
}

async function updatePassObject(serialNumber, updates, brand) {
  const passKind = resolvePassKind(brand);
  const objectPath = passKind === 'loyalty' ? 'loyaltyObject' : 'genericObject';
  const objectId = buildObjectId(serialNumber, brand);

  try {
    const updated = await walletApiPatch(`/${objectPath}/${objectId}`, updates);
    console.log(`[GoogleWallet] Updated object ${objectId}`);
    return updated;
  } catch (e) {
    // Backward compatibility for old objects created before loyalty namespace migration.
    const legacyObjectId = buildLegacyObjectId(serialNumber);
    if (legacyObjectId !== objectId) {
      try {
        const updatedLegacy = await walletApiPatch(`/${objectPath}/${legacyObjectId}`, updates);
        console.log(`[GoogleWallet] Updated legacy object ${legacyObjectId}`);
        return updatedLegacy;
      } catch (legacyErr) {
        console.error(`[GoogleWallet] Failed to update ${objectId} and legacy ${legacyObjectId}:`, legacyErr.message);
        throw legacyErr;
      }
    }
    console.error(`[GoogleWallet] Failed to update ${objectId}:`, e.message);
    throw e;
  }
}

async function clearPassMessages(objectId, brand) {
  if (!objectId) return null;
  const passKind = resolvePassKind(brand);
  const objectPath = passKind === 'loyalty' ? 'loyaltyObject' : 'genericObject';
  const objectUrl = `/${objectPath}/${encodeURIComponent(objectId)}`;
  try {
    const updated = await walletApiPatch(objectUrl, { messages: [] });
    console.log(`[GoogleWallet] Cleared messages for ${objectId}`);
    return { ok: true, objectId, updated };
  } catch (err) {
    console.warn(`[GoogleWallet] clear messages failed for ${objectId}: ${err.message}`);
    return { ok: false, objectId, error: err.message };
  }
}

async function getPassObjectById(objectId, brand) {
  if (!objectId) throw new Error('Google Wallet objectId required');
  const passKind = resolvePassKind(brand);
  const objectPath = passKind === 'loyalty' ? 'loyaltyObject' : 'genericObject';
  return walletApiGet(`/${objectPath}/${encodeURIComponent(objectId)}`);
}

const { PUSH_TITLE_MAX, PUSH_MESSAGE_MAX } = require('./push-text-limits');

function isGoogleNotifyQuotaError(err) {
  const combined = [
    err?.message,
    err?.body?.error?.message,
    err?.body?.error?.status,
    ...(err?.body?.error?.errors || []).map((e) => `${e.reason || ''} ${e.message || ''}`),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return combined.includes('quotaexceeded') || combined.includes('quota exceeded');
}

/** Build AddMessage payload — triggers Android push when messageType is TEXT_AND_NOTIFY. */
function buildGoogleNotifyMessagePayload({ title, message, messageId }) {
  const header = String(title || 'NOVITÀ').trim().toUpperCase().slice(0, PUSH_TITLE_MAX) || 'NOVITÀ';
  const body = String(message || '').trim().slice(0, PUSH_MESSAGE_MAX);
  if (!body) throw new Error('Google notify message body required');
  const id = String(messageId || `push_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`)
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 64);
  return {
    message: {
      header,
      body,
      id,
      messageType: 'TEXT_AND_NOTIFY',
    },
  };
}

async function addPassNotifyMessage(serialNumber, { title, message }, brand, options = {}) {
  const passKind = resolvePassKind(brand);
  const objectPath = passKind === 'loyalty' ? 'loyaltyObject' : 'genericObject';
  const objectId = String(options.objectId || '').trim() || buildObjectId(serialNumber, brand);
  const legacyObjectId = buildLegacyObjectId(serialNumber);
  const messageId = options.messageId
    || `push_${serialNumber}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const payload = buildGoogleNotifyMessagePayload({ title, message, messageId });

  async function postAddMessage(targetId, body) {
    const path = `/${objectPath}/${encodeURIComponent(targetId)}/addMessage`;
    await clearPassMessages(targetId, brand);
    const result = await walletApiPost(path, body);
    console.log(`[GoogleWallet] addMessage ${targetId} type=${body.message.messageType}`);
    return { result, messageType: body.message.messageType, objectId: targetId };
  }

  async function tryNotify(targetId) {
    try {
      const out = await postAddMessage(targetId, payload);
      return { ...out, quotaExceeded: false };
    } catch (err) {
      if (options.silentOnQuota !== false && isGoogleNotifyQuotaError(err)) {
        console.warn(`[GoogleWallet] notify quota exceeded for ${targetId}, falling back to TEXT (max 3 notify/24h per pass)`);
        const silentPayload = {
          message: { ...payload.message, messageType: 'TEXT' },
        };
        const out = await postAddMessage(targetId, silentPayload);
        return { ...out, quotaExceeded: true };
      }
      throw err;
    }
  }

  try {
    return await tryNotify(objectId);
  } catch (e) {
    if (legacyObjectId !== objectId) {
      try {
        return await tryNotify(legacyObjectId);
      } catch (legacyErr) {
        console.error(`[GoogleWallet] addMessage failed for ${objectId} and legacy ${legacyObjectId}:`, legacyErr.message);
        throw legacyErr;
      }
    }
    console.error(`[GoogleWallet] addMessage failed for ${objectId}:`, e.message);
    throw e;
  }
}

/**
 * Send a Google Wallet push notification (AddMessage TEXT_AND_NOTIFY).
 * Does not mutate front-of-pass fields — promo stays on strip image only.
 */
async function updatePassMessage(serialNumber, message, brand, options = {}) {
  const title = options.title ?? options.header ?? null;
  return addPassNotifyMessage(serialNumber, { title, message }, brand, options);
}

// ── Google Wallet API helpers ─────────────────────────────────────────

async function walletApiGet(path) {
  const token = await getAccessToken();
  return httpRequest('GET', `${WALLET_API_BASE}${path}`, null, {
    'Authorization': `Bearer ${token}`
  });
}

async function walletApiPost(path, body) {
  const token = await getAccessToken();
  return httpRequest('POST', `${WALLET_API_BASE}${path}`, JSON.stringify(body), {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  });
}

async function walletApiPatch(path, body) {
  const token = await getAccessToken();
  return httpRequest('PATCH', `${WALLET_API_BASE}${path}`, JSON.stringify(body), {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  });
}

// ── HTTP client ───────────────────────────────────────────────────────

function httpRequest(method, url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method,
      headers: { ...headers }
    };
    if (body) options.headers['Content-Length'] = Buffer.byteLength(body);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(`Google Wallet API ${res.statusCode}: ${JSON.stringify(json.error || json)}`);
            err.statusCode = res.statusCode;
            err.body = json;
            reject(err);
          } else {
            resolve(json);
          }
        } catch (e) {
          if (res.statusCode >= 400) {
            reject(new Error(`Google Wallet API ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Utilities ─────────────────────────────────────────────────────────

function base64url(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function rgbToHex(color) {
  if (!color) return '#0D0B1A';
  if (color.startsWith('#')) return color;
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return '#0D0B1A';
  const r = parseInt(match[1]).toString(16).padStart(2, '0');
  const g = parseInt(match[2]).toString(16).padStart(2, '0');
  const b = parseInt(match[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// ── Status ────────────────────────────────────────────────────────────

function isConfigured() {
  return !!(ISSUER_ID && SERVICE_ACCOUNT_JSON);
}

function getStatusInfo() {
  const rawDomain =
    (process.env.CUSTOM_DOMAIN && process.env.CUSTOM_DOMAIN.trim()) ||
    (process.env.RAILWAY_PUBLIC_DOMAIN && process.env.RAILWAY_PUBLIC_DOMAIN.trim()) ||
    (process.env.APP_PUBLIC_DOMAIN && process.env.APP_PUBLIC_DOMAIN.trim()) ||
    '';
  const domain = rawDomain.replace(/^https?:\/\//i, '').replace(/\/+$/g, '');
  const base = domain ? `https://${domain}/api/v1` : '';
  return {
    configured: isConfigured(),
    pass_kind: getPassKind(),
    review_status: getReviewStatus(),
    issuer_id: ISSUER_ID || null,
    service_account_email: SERVICE_ACCOUNT_JSON?.client_email || null,
    custom_domain: domain || null,
    callback_url: base ? `${base}/google-wallet/callback` : null,
    callback_path: '/api/v1/google-wallet/callback',
    registration_mode: isLoyaltyMode() ? 'jwt-embedded (no pre-registration)' : 'generic-class pre-registration',
    warning:
      !domain
        ? 'No public domain configured (CUSTOM_DOMAIN/RAILWAY_PUBLIC_DOMAIN/APP_PUBLIC_DOMAIN).'
        : null
  };
}

module.exports = {
  isConfigured,
  getStatusInfo,
  getReviewStatus,
  sanitizeSlugForClassId,
  buildGenericClassId,
  buildLoyaltyClassId,
  normalizeMerchantLocations,
  buildPassClass,
  createOrUpdatePassClass, // deprecated, kept for compatibility
  getClassRegistration,
  ensurePassReadyOnServer,
  formatGoogleWalletError,
  buildPassObject,
  generateSaveLink,
  generateSaveLinkLegacy,
  createPassObjectOnServer,
  updatePassObject,
  clearPassMessages,
  getPassObjectById,
  buildGoogleNotifyMessagePayload,
  addPassNotifyMessage,
  updatePassMessage,
  isGoogleNotifyQuotaError,
};

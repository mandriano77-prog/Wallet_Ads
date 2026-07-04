const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
  insertPortalToken,
  revokePortalTokensForPass,
  isPortalTokenActive,
  getPassInstance
} = require('../db');
const { isProduction, requiredSecret } = require('./security-config');

const PORTAL_TOKEN_TTL_SEC = 24 * 60 * 60;

function getPortalSecret() {
  const secret = process.env.PORTAL_JWT_SECRET
    ? requiredSecret('PORTAL_JWT_SECRET')
    : requiredSecret('JWT_SECRET', { allowFallbackInDev: !isProduction() });
  if (!process.env.PORTAL_JWT_SECRET) {
    if (isProduction()) {
      throw new Error('PORTAL_JWT_SECRET must be set in production');
    }
    console.warn('[portal-auth] PORTAL_JWT_SECRET not set — falling back to JWT_SECRET in development');
  }
  return secret;
}

function getPortalBaseUrl() {
  const explicit = String(process.env.PORTAL_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const customDomain = String(process.env.CUSTOM_DOMAIN || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  if (customDomain) return `https://${customDomain}/portal`;

  const appUrl = String(process.env.APP_URL || '').trim();
  if (appUrl) return `${appUrl.replace(/\/+$/, '')}/portal`;

  const railwayDomain = String(process.env.RAILWAY_PUBLIC_DOMAIN || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  if (railwayDomain) return `https://${railwayDomain}/portal`;

  return null;
}

function hashPortalToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function buildPortalUrl(token) {
  const base = getPortalBaseUrl();
  if (!base || !token) return null;
  return `${base}/?t=${encodeURIComponent(token)}`;
}

/**
 * Issue a new portal JWT, persist hash, revoke previous tokens for this pass.
 */
async function issuePortalToken(passId, brandId) {
  const pass = await getPassInstance(passId);
  if (!pass) throw new Error('Pass not found');
  if (brandId && pass.brand_id !== brandId) throw new Error('Brand mismatch');

  const secret = getPortalSecret();
  const expiresAt = new Date(Date.now() + PORTAL_TOKEN_TTL_SEC * 1000);
  const token = jwt.sign(
    {
      typ: 'portal',
      pass_id: passId,
      brand_id: pass.brand_id
    },
    secret,
    { expiresIn: PORTAL_TOKEN_TTL_SEC }
  );

  const tokenHash = hashPortalToken(token);
  await revokePortalTokensForPass(passId);
  await insertPortalToken(passId, tokenHash, expiresAt);

  return {
    token,
    token_hash: tokenHash,
    expires_at: expiresAt.toISOString(),
    portal_url: buildPortalUrl(token)
  };
}

/**
 * Verify JWT + DB row (not revoked, not expired).
 */
async function verifyPortalToken(token) {
  if (!token || typeof token !== 'string') return null;

  let decoded;
  try {
    decoded = jwt.verify(token, getPortalSecret());
  } catch {
    return null;
  }

  if (decoded.typ !== 'portal' || !decoded.pass_id) return null;

  const tokenHash = hashPortalToken(token);
  const active = await isPortalTokenActive(tokenHash);
  if (!active) return null;

  const pass = await getPassInstance(decoded.pass_id);
  if (!pass || pass.status === 'deleted' || pass.status === 'revoked') return null;
  if (decoded.brand_id && pass.brand_id !== decoded.brand_id) return null;

  return {
    pass_id: decoded.pass_id,
    brand_id: pass.brand_id,
    token_hash: tokenHash
  };
}

module.exports = {
  PORTAL_TOKEN_TTL_SEC,
  getPortalSecret,
  getPortalBaseUrl,
  hashPortalToken,
  buildPortalUrl,
  issuePortalToken,
  verifyPortalToken
};

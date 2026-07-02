// Contesto account dashboard condiviso tra auth-routes, authMiddleware e le
// route utenti: allowlist operatori del deploy HR, segreti JWT, URL pubblici
// della dashboard e email di invito/reset.
'use strict';

const { requiredSecret } = require('../engine/security-config');
const { normalizeRole } = require('../engine/rbac');
const { deployProductLineLock } = require('./deploy-lock');
const { getBrand, updateUser, createPasswordResetToken } = require('../db');

const JWT_SECRET = requiredSecret('JWT_SECRET', { fallback: 'nudj-secret-change-me-in-prod' });
const JWT_EXPIRES = '7d';

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

module.exports = {
  JWT_SECRET, JWT_EXPIRES,
  dashboardLoginAllowlist, isDashboardOperatorEmail, canDashboardUserLogin,
  rejectIfDeployOperatorNotAllowed,
  ensurePlatformAdminIfAllowlisted, applyAllowlistOperatorContext,
  buildDashboardPublicUrl, dashboardProductTitle,
  buildPublicBrandLogoUrl, publicBrandLogoPath,
  resolveUserInviteBrandContext, sendDashboardUserInviteEmail,
};

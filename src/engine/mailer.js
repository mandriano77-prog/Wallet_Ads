/**
 * Mailer module — Resend integration for transactional emails
 * Uses lazy initialization to ensure env vars are loaded
 */
const { Resend } = require('resend');
const { isHrProductLine, getProductBrandName } = require('./base-url');

let resendClient = null;

function getResend() {
  if (resendClient) return resendClient;
  if (process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
  }
  return null;
}

const getFromEmail = () => process.env.FROM_EMAIL || 'noreply@filodiretto.app';
const getFromName = () => process.env.FROM_NAME || getProductBrandName();
// HR display name stays FiloDiretto; sender uses verified filodiretto.app domain on Resend.
const getHrFromEmail = () => process.env.HR_FROM_EMAIL || process.env.FROM_EMAIL || 'noreply@filodiretto.app';
const getHrFromName = () => process.env.HR_FROM_NAME || 'FiloDiretto.App';

/** FiloDiretto dashboard invite email palette (fixed — not brand colors). */
const FD_INVITE_EMAIL = {
  pageBg: '#F1F5F9',
  card: '#FFFFFF',
  border: '#E2E8F0',
  primary: '#8B5CF6',
  primaryDark: '#7C3AED',
  textPrimary: '#0F172A',
  textBody: '#334155',
  textMuted: '#64748B',
  textFooter: '#64748B',
  fontStack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function brandInitialsFromName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return 'BR';
}

function dashboardInviteRoleLabel(role) {
  const map = {
    admin: 'amministratore',
    manager: 'manager',
    sender: 'sender',
    reporter: 'reporter',
    viewer: 'reporter',
  };
  return map[String(role || '').toLowerCase()] || 'manager';
}

function isHrDashboardMailer() {
  return true;
}

function inviteEmailFromIdentity() {
  if (isHrDashboardMailer()) {
    return { fromEmail: getHrFromEmail(), fromName: getHrFromName() };
  }
  return { fromEmail: getFromEmail(), fromName: getFromName() };
}

function buildInviteInlineLogoAttachment(brandLogoAttachment) {
  if (!brandLogoAttachment?.cid) return null;
  const att = {
    filename: brandLogoAttachment.filename || 'brand-logo.png',
    content_id: brandLogoAttachment.cid,
    content_type: brandLogoAttachment.content_type || 'image/png',
  };
  if (brandLogoAttachment.path) att.path = brandLogoAttachment.path;
  else if (brandLogoAttachment.content) att.content = brandLogoAttachment.content;
  else return null;
  return att;
}

function resolveEmployeeEmailLogo(brandLogo, inlineLogoAttachment) {
  if (brandLogo?.url) return brandLogo;
  if (inlineLogoAttachment?.content_id) return { cid: inlineLogoAttachment.content_id };
  return brandLogo || null;
}

function normalizeEmailThemeHex(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toUpperCase()}`;
}

function employeeEmailTheme(brandTheme) {
  const accent = normalizeEmailThemeHex(brandTheme?.accent || brandTheme?.baseColor) || FD_INVITE_EMAIL.primary;
  const accentHover = normalizeEmailThemeHex(brandTheme?.accentHover || brandTheme?.baseColor) || accent;
  const textOnAccent = normalizeEmailThemeHex(brandTheme?.textOnAccent) || '#FFFFFF';
  return { accent, accentHover, textOnAccent };
}

function buildEmployeeBrandMarkHtml(brandName, brandLogo, brandTheme) {
  const safeName = escapeHtml(brandName || 'la tua azienda');
  const initials = escapeHtml(brandInitialsFromName(brandName));
  const theme = employeeEmailTheme(brandTheme);
  const imgStyle = 'display:block;width:72px;height:72px;border-radius:14px;object-fit:cover;background:#FFFFFF;border:1px solid #E2E8F0;';
  const mark = brandLogo?.cid
    ? `<img src="cid:${escapeHtml(brandLogo.cid)}" alt="${safeName}" width="72" height="72" style="${imgStyle}" />`
    : brandLogo?.url
    ? `<img src="${escapeHtml(brandLogo.url)}" alt="${safeName}" width="72" height="72" style="${imgStyle}" />`
    : `<span style="display:inline-block;width:56px;height:56px;border-radius:14px;background:${theme.accent};color:${theme.textOnAccent};font-size:18px;font-weight:700;line-height:56px;text-align:center;">${initials}</span>`;
  return `
    <div style="display:flex;align-items:center;gap:14px;margin:0 0 22px;">
      ${mark}
      <div>
        <p style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0 0 4px;">FiloDiretto.App</p>
        <p style="color:#0f172a;font-size:17px;line-height:1.25;font-weight:700;margin:0;">${safeName}</p>
      </div>
    </div>`;
}

function buildEmployeeWalletEmailHtml({
  firstName,
  brandName,
  ctaUrl,
  ctaLabel,
  title,
  body,
  footnote,
  dpoEmail,
  brandTheme,
  brandLogo
}) {
  const name = escapeHtml(firstName || 'Collega');
  const brand = escapeHtml(brandName || 'la tua azienda');
  const support = escapeHtml(dpoEmail || getHrFromEmail());
  const theme = employeeEmailTheme(brandTheme);
  const safeUrl = escapeHtml(ctaUrl);
  const safeFootnote = String(footnote || '').trim();
  const supportLine = `${safeFootnote ? `${escapeHtml(safeFootnote)} ` : ''}Se hai bisogno di supporto, contatta ${support}.`;
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:32px 20px;">
  <div style="background:#fff;border-radius:14px;padding:30px 24px;border:1px solid #e2e8f0;">
    ${buildEmployeeBrandMarkHtml(brandName, brandLogo, brandTheme)}
    <h1 style="color:#0f172a;font-size:22px;line-height:1.25;margin:0 0 16px;">${escapeHtml(title).replace(/\{brand\}/g, brand)}</h1>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px;">Ciao <strong>${name}</strong>,</p>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 24px;">${escapeHtml(body).replace(/\{brand\}/g, brand)}</p>
    <p style="text-align:center;margin:0 0 24px;">
      <a href="${safeUrl}" style="display:inline-block;background:${theme.accent};color:${theme.textOnAccent};font-weight:600;font-size:15px;padding:14px 28px;border-radius:8px;text-decoration:none;border:1px solid ${theme.accentHover};">${escapeHtml(ctaLabel)}</a>
    </p>
    <p style="color:#64748b;font-size:13px;line-height:1.5;margin:0;">${supportLine}</p>
  </div>
  <p style="color:#94a3b8;font-size:12px;text-align:center;margin:16px 0 0;">Powered by FiloDiretto.App</p>
</div></body></html>`;
}

function buildInviteBrandBadgeHtml(brandName, logo) {
  if (!brandName) return '';
  const safeName = escapeHtml(brandName);
  const initials = escapeHtml(brandInitialsFromName(brandName));
  const logoCell = logo?.url
    ? `<img src="${escapeHtml(logo.url)}" alt="${safeName}" width="128" height="64" style="display:block;width:128px;height:64px;border:0;outline:none;text-decoration:none;border-radius:10px;object-fit:contain;background-color:${FD_INVITE_EMAIL.card};" />`
    : logo?.cid
    ? `<img src="cid:${escapeHtml(logo.cid)}" alt="${safeName}" width="56" height="56" style="display:block;width:56px;height:56px;border:0;outline:none;text-decoration:none;border-radius:12px;object-fit:contain;background-color:${FD_INVITE_EMAIL.card};" />`
    : `<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" width="56" height="56" style="width:56px;height:56px;border-radius:28px;background-color:${FD_INVITE_EMAIL.primary};color:#FFFFFF;font-family:${FD_INVITE_EMAIL.fontStack};font-size:18px;font-weight:700;line-height:56px;text-align:center;">${initials}</td></tr></table>`;

  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
  <tr>
    <td align="center" style="padding:20px 16px;background-color:#F8FAFC;border:1px solid ${FD_INVITE_EMAIL.border};border-radius:12px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
        <tr>
          <td align="center" style="padding-bottom:12px;">${logoCell}</td>
        </tr>
        <tr>
          <td align="center" style="font-family:${FD_INVITE_EMAIL.fontStack};font-size:18px;font-weight:700;line-height:1.3;color:${FD_INVITE_EMAIL.textPrimary};">${safeName}</td>
        </tr>
        <tr>
          <td align="center" style="padding-top:8px;font-family:${FD_INVITE_EMAIL.fontStack};font-size:14px;line-height:1.5;color:${FD_INVITE_EMAIL.textMuted};">Sei stato invitato a gestire ${safeName}.</td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function buildInviteEmailBulletproofCta(url, label) {
  const safeUrl = escapeHtml(url);
  const safeLabel = escapeHtml(label);
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:28px auto;">
  <tr>
    <td align="center" bgcolor="${FD_INVITE_EMAIL.primary}" style="border-radius:8px;background-color:${FD_INVITE_EMAIL.primary};border:1px solid ${FD_INVITE_EMAIL.primaryDark};">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="12%" strokecolor="${FD_INVITE_EMAIL.primaryDark}" fillcolor="${FD_INVITE_EMAIL.primary}">
        <w:anchorlock/>
        <center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${safeLabel}</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FD_INVITE_EMAIL.fontStack};font-size:15px;font-weight:600;line-height:1.2;color:#FFFFFF;text-decoration:none;border-radius:8px;background-color:${FD_INVITE_EMAIL.primary};">${safeLabel}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>`;
}

function buildUserInviteEmailHtml({
  productTitle,
  userName,
  role,
  brandName,
  brandLogo,
  activateUrl,
}) {
  const product = dashboardEmailProductTitle(productTitle);
  const displayName = String(userName || '').trim() || 'utente';
  const firstName = escapeHtml(displayName.split(/\s+/)[0]);
  const roleLabel = escapeHtml(dashboardInviteRoleLabel(role));
  const safeProduct = escapeHtml(product);
  const safeBrand = brandName ? escapeHtml(brandName) : '';
  const preheader = brandName
    ? `Attiva il tuo accesso a ${brandName}`
    : `Attiva il tuo accesso a ${product}`;

  let accessParagraph;
  if (brandName) {
    accessParagraph = `Ti è stato creato un accesso alla dashboard ${safeProduct} come <strong style="color:${FD_INVITE_EMAIL.textPrimary};font-weight:600;">${roleLabel}</strong> per <strong style="color:${FD_INVITE_EMAIL.textPrimary};font-weight:600;">${safeBrand}</strong>. Attiva l'account e scegli una password personale per iniziare.`;
  } else if (String(role || '').toLowerCase() === 'admin') {
    accessParagraph = `Ti è stato creato un accesso alla dashboard ${safeProduct} come <strong style="color:${FD_INVITE_EMAIL.textPrimary};font-weight:600;">${roleLabel}</strong>, con visibilità su tutti i brand. Attiva l'account e scegli una password personale per iniziare.`;
  } else {
    accessParagraph = `Ti è stato creato un accesso alla dashboard ${safeProduct} come <strong style="color:${FD_INVITE_EMAIL.textPrimary};font-weight:600;">${roleLabel}</strong>. Attiva l'account e scegli una password personale per iniziare.`;
  }

  const brandBadge = buildInviteBrandBadgeHtml(brandName, brandLogo);
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Attiva il tuo accesso</title>
</head>
<body style="margin:0;padding:0;background-color:${FD_INVITE_EMAIL.pageBg};font-family:${FD_INVITE_EMAIL.fontStack};color:${FD_INVITE_EMAIL.textBody};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${FD_INVITE_EMAIL.pageBg};">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${FD_INVITE_EMAIL.pageBg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
          <tr>
            <td style="padding:24px 24px 16px;background-color:${FD_INVITE_EMAIL.card};border:1px solid ${FD_INVITE_EMAIL.border};border-bottom:none;border-radius:12px 12px 0 0;" align="center">
              <span style="font-family:${FD_INVITE_EMAIL.fontStack};font-size:24px;font-weight:700;color:${FD_INVITE_EMAIL.textPrimary};letter-spacing:-0.03em;">filodiretto</span><span style="font-family:${FD_INVITE_EMAIL.fontStack};font-size:24px;font-weight:700;color:${FD_INVITE_EMAIL.primary};letter-spacing:-0.03em;">.app</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 32px;background-color:${FD_INVITE_EMAIL.card};border:1px solid ${FD_INVITE_EMAIL.border};border-top:none;border-radius:0 0 12px 12px;">
              ${brandBadge}
              <h1 style="margin:0 0 16px;font-family:${FD_INVITE_EMAIL.fontStack};font-size:22px;font-weight:700;line-height:1.3;color:${FD_INVITE_EMAIL.textPrimary};">Attiva il tuo accesso alla dashboard</h1>
              <p style="margin:0 0 16px;font-family:${FD_INVITE_EMAIL.fontStack};font-size:15px;line-height:1.6;color:${FD_INVITE_EMAIL.textBody};">Ciao <strong style="color:${FD_INVITE_EMAIL.textPrimary};font-weight:600;">${firstName}</strong>,</p>
              <p style="margin:0 0 16px;font-family:${FD_INVITE_EMAIL.fontStack};font-size:15px;line-height:1.6;color:${FD_INVITE_EMAIL.textBody};">${accessParagraph}</p>
              <p style="margin:0 0 8px;font-family:${FD_INVITE_EMAIL.fontStack};font-size:15px;line-height:1.6;color:${FD_INVITE_EMAIL.textBody};">Da qui potrai gestire pass, comunicazioni e audience del brand.</p>
              ${buildInviteEmailBulletproofCta(activateUrl, 'Attiva il tuo accesso →')}
              <p style="margin:0;font-family:${FD_INVITE_EMAIL.fontStack};font-size:13px;line-height:1.5;color:${FD_INVITE_EMAIL.textMuted};text-align:center;">Il link è valido per 72 ore. Se non hai richiesto questo accesso, ignora questa email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;" align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr><td style="border-top:1px solid ${FD_INVITE_EMAIL.border};font-size:0;line-height:0;">&nbsp;</td></tr>
              </table>
              <p style="margin:16px 0 4px;font-family:${FD_INVITE_EMAIL.fontStack};font-size:12px;line-height:1.5;color:${FD_INVITE_EMAIL.textFooter};">Powered by ${safeProduct}</p>
              <p style="margin:0;font-family:${FD_INVITE_EMAIL.fontStack};font-size:11px;line-height:1.5;color:${FD_INVITE_EMAIL.textMuted};">© ${year} FiloDiretto</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildUserInviteEmailText({
  productTitle,
  userName,
  role,
  brandName,
  activateUrl,
}) {
  const product = dashboardEmailProductTitle(productTitle);
  const displayName = String(userName || '').trim() || 'utente';
  const firstName = displayName.split(/\s+/)[0];
  const roleLabel = dashboardInviteRoleLabel(role);
  const lines = [`Ciao ${firstName},`, ''];
  if (brandName) {
    lines.push(`Sei stato invitato a gestire ${brandName}.`, '');
    lines.push(`Ti è stato creato un accesso alla dashboard ${product} come ${roleLabel} per ${brandName}.`);
  } else if (String(role || '').toLowerCase() === 'admin') {
    lines.push(`Ti è stato creato un accesso alla dashboard ${product} come ${roleLabel}, con visibilità su tutti i brand.`);
  } else {
    lines.push(`Ti è stato creato un accesso alla dashboard ${product} come ${roleLabel}.`);
  }
  lines.push(
    '',
    'Attiva l\'account e scegli una password personale per iniziare.',
    'Da qui potrai gestire pass, comunicazioni e audience del brand.',
    '',
    `Attiva il tuo accesso: ${activateUrl}`,
    '',
    'Il link è valido per 72 ore. Se non hai richiesto questo accesso, ignora questa email.',
    '',
    `Powered by ${product}`
  );
  return lines.join('\n');
}

/** FiloDiretto dashboard email tokens (aligned with src/filodiretto/tokens.css). */
const FD_DASHBOARD_EMAIL = {
  bg: '#fafafa',
  card: '#ffffff',
  border: '#e5e7eb',
  shadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
  primary: '#8B5CF6',
  textPrimary: '#0f172a',
  textBody: '#334155',
  textMuted: '#64748b',
  textFooter: '#94a3b8',
  radius: '12px',
  btnRadius: '8px',
  btnShadow: '0 2px 8px rgba(139, 92, 246, 0.35)',
};

function dashboardEmailProductTitle(override) {
  if (override) return override;
  return String(process.env.DASHBOARD_PRODUCT_TITLE || '').trim() || 'FiloDiretto';
}

function filoDashboardEmailWordmark(productTitle) {
  const title = dashboardEmailProductTitle(productTitle);
  const normalized = title.toLowerCase().replace(/\s+/g, '');
  if (normalized.includes('filodiretto')) {
    return `<p style="margin:0 0 4px;text-align:center;line-height:1.2;">
      <span style="font-size:24px;font-weight:700;color:${FD_DASHBOARD_EMAIL.textPrimary};letter-spacing:-0.03em;">filodiretto</span><span style="font-size:24px;font-weight:700;color:${FD_DASHBOARD_EMAIL.primary};letter-spacing:-0.03em;">.app</span>
    </p>`;
  }
  return `<p style="color:${FD_DASHBOARD_EMAIL.primary};font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0 0 4px;text-align:center;">${title}</p>`;
}

function filoDashboardEmailLayout({ productTitle, headline, subtitle, bodyHtml, ctaUrl, ctaLabel, footnote }) {
  const product = dashboardEmailProductTitle(productTitle);
  const ctaBlock = ctaUrl && ctaLabel ? `
      <p style="text-align:center;margin:28px 0 24px;">
        <a href="${ctaUrl}" style="display:inline-block;background:${FD_DASHBOARD_EMAIL.primary};color:#fff;font-weight:600;font-size:15px;padding:14px 28px;border-radius:${FD_DASHBOARD_EMAIL.btnRadius};text-decoration:none;box-shadow:${FD_DASHBOARD_EMAIL.btnShadow};">${ctaLabel}</a>
      </p>` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:${FD_DASHBOARD_EMAIL.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:${FD_DASHBOARD_EMAIL.card};border-radius:${FD_DASHBOARD_EMAIL.radius};padding:32px 24px;border:1px solid ${FD_DASHBOARD_EMAIL.border};box-shadow:${FD_DASHBOARD_EMAIL.shadow};">
      ${filoDashboardEmailWordmark(product)}
      <h1 style="color:${FD_DASHBOARD_EMAIL.textPrimary};font-size:22px;margin:24px 0 8px;font-weight:700;line-height:1.3;">${headline}</h1>
      ${subtitle ? `<p style="color:${FD_DASHBOARD_EMAIL.textMuted};font-size:14px;margin:0 0 24px;line-height:1.5;">${subtitle}</p>` : ''}
      ${bodyHtml}
      ${ctaBlock}
      ${footnote ? `<p style="color:${FD_DASHBOARD_EMAIL.textMuted};font-size:13px;line-height:1.5;margin:0;">${footnote}</p>` : ''}
    </div>
    <p style="color:${FD_DASHBOARD_EMAIL.textFooter};font-size:12px;text-align:center;margin:16px 0 0;">Powered by ${product}</p>
  </div>
</body>
</html>`;
}

async function sendViaResend(payload, { logLabel = 'email' } = {}) {
  const resend = getResend();
  if (!resend) {
    const reason = 'RESEND_API_KEY not set';
    console.warn(`[Mailer] ${logLabel} skipped — ${reason}`);
    throw new Error(reason);
  }

  const result = await resend.emails.send(payload);
  if (result?.error) {
    const message = result.error.message || JSON.stringify(result.error);
    console.error(`[Mailer] ${logLabel} failed — from: ${payload.from} to: ${payload.to?.join?.(', ') || payload.to} — ${message}`);
    throw new Error(message);
  }

  console.log(`[Mailer] ${logLabel} sent — to: ${payload.to?.join?.(', ') || payload.to} id: ${result?.data?.id || 'n/a'}`);
  return result;
}

/**
 * Send welcome email after signup
 */
async function sendWelcomeEmail({ to, name, brandName, brandColor, points, downloadUrl }) {
  console.log('📧 sendWelcomeEmail called — to:', to, 'RESEND_API_KEY set:', !!process.env.RESEND_API_KEY);

  const resend = getResend();
  if (!resend) {
    console.log('⚠️ RESEND_API_KEY not set — skipping welcome email to', to);
    return { skipped: true, reason: 'RESEND_API_KEY not set' };
  }

  const firstName = name.split(/\s+/)[0];
  const bg = brandColor || '#000000';
  const accent = '#CCFF00';
  const fromEmail = getFromEmail();
  const fromName = getFromName();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#111; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width:500px; margin:0 auto; padding:32px 20px;">

    <!-- Header -->
    <div style="text-align:center; padding:40px 24px; background:${bg}; border-radius:16px 16px 0 0;">
      <h1 style="color:#fff; font-size:24px; margin:0 0 8px; font-weight:700;">${brandName}</h1>
      <p style="color:${accent}; font-size:16px; margin:0; font-weight:600;">Benvenuto nel Club!</p>
    </div>

    <!-- Body -->
    <div style="background:#1a1a1a; padding:32px 24px; border-radius:0 0 16px 16px;">

      <p style="color:#e0e0e0; font-size:16px; line-height:1.6; margin:0 0 20px;">
        Ciao <strong style="color:#fff;">${firstName}</strong>,
      </p>

      <p style="color:#bbb; font-size:14px; line-height:1.6; margin:0 0 24px;">
        Grazie per esserti iscritto al programma fedeltà di <strong style="color:#fff;">${brandName}</strong>.
        La tua card digitale è pronta nel tuo Apple Wallet!
      </p>

      <!-- Points box -->
      <div style="background:#222; border:1px solid ${accent}33; border-radius:12px; padding:24px; text-align:center; margin:0 0 24px;">
        <p style="color:${accent}; font-size:12px; text-transform:uppercase; letter-spacing:1px; margin:0 0 8px; font-weight:600;">I tuoi primi punti</p>
        <p style="color:#fff; font-size:48px; font-weight:700; margin:0 0 4px; line-height:1;">${points}</p>
        <p style="color:#888; font-size:13px; margin:0;">punti di benvenuto</p>
      </div>

      <p style="color:#bbb; font-size:14px; line-height:1.6; margin:0 0 24px;">
        Ogni partita vale! Accumula punti ad ogni visita, sblocca premi esclusivi
        e scala i livelli del programma.
      </p>

      <!-- Levels preview -->
      <div style="background:#222; border-radius:12px; padding:20px; margin:0 0 24px;">
        <p style="color:#fff; font-size:13px; font-weight:600; margin:0 0 12px;">I livelli del club:</p>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
          <span style="background:#88888822; color:#888; padding:4px 10px; border-radius:20px; font-size:12px;">Pared</span>
          <span style="background:#4CAF5022; color:#4CAF50; padding:4px 10px; border-radius:20px; font-size:12px;">Bandeja</span>
          <span style="background:#2196F322; color:#2196F3; padding:4px 10px; border-radius:20px; font-size:12px;">Vibora</span>
          <span style="background:#9C27B022; color:#9C27B0; padding:4px 10px; border-radius:20px; font-size:12px;">Bajada</span>
          <span style="background:#FFD70022; color:#FFD700; padding:4px 10px; border-radius:20px; font-size:12px;">Por Tres</span>
        </div>
      </div>

      <!-- CTA -->
      <div style="text-align:center; margin:0 0 16px;">
        <a href="${downloadUrl}" style="display:inline-block; background:${accent}; color:#000; font-weight:700; font-size:15px; padding:14px 32px; border-radius:10px; text-decoration:none;">
          Scarica la tua Card
        </a>
      </div>

      <p style="color:#666; font-size:12px; text-align:center; margin:0;">
        Ci vediamo in campo!
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align:center; padding:24px 0 0;">
      <p style="color:#444; font-size:11px; margin:0;">
        Powered by Precise Consulting
      </p>
    </div>

  </div>
</body>
</html>`;

  console.log('📧 Sending via Resend — from:', `${fromName} <${fromEmail}>`, 'to:', to);

  const result = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject: `Benvenuto nel club ${brandName}! 🎾`,
    html
  });

  console.log('✓ Welcome email sent to', to, JSON.stringify(result));
  return result;
}

/**
 * Send invite email when admin creates a new dashboard user (activation link, no password).
 */
async function sendUserInviteEmail({ to, name, role, brandName, brandLogo, brandLogoAttachment, activateUrl, productTitle }) {
  console.log('📧 sendUserInviteEmail called — to:', to);

  const resend = getResend();
  if (!resend) {
    console.log('⚠️ RESEND_API_KEY not set — skipping invite email to', to);
    return { skipped: true, reason: 'RESEND_API_KEY not set' };
  }

  const product = dashboardEmailProductTitle(productTitle);
  const { fromEmail, fromName } = inviteEmailFromIdentity();
  const inlineLogoAttachment = buildInviteInlineLogoAttachment(brandLogoAttachment);
  const logoForBadge = brandLogo?.url ? brandLogo : (inlineLogoAttachment ? { cid: inlineLogoAttachment.content_id } : brandLogo);
  const html = buildUserInviteEmailHtml({
    productTitle: product,
    userName: name,
    role,
    brandName: brandName || null,
    brandLogo: logoForBadge,
    activateUrl,
  });
  const text = buildUserInviteEmailText({
    productTitle: product,
    userName: name,
    role,
    brandName: brandName || null,
    activateUrl,
  });

  const subject = brandName
    ? `Attiva il tuo accesso a ${brandName} — ${product}`
    : `Il tuo accesso a ${product}`;

  const payload = {
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject,
    html,
    text,
  };
  if (inlineLogoAttachment && !brandLogo?.url) {
    payload.attachments = [inlineLogoAttachment];
  }

  const result = await resend.emails.send(payload);

  console.log('✓ Invite email sent to', to, JSON.stringify(result));
  return result;
}

/**
 * Send points recap email (weekly or monthly)
 */
async function sendRecapEmail({ to, brandName, brandColor, memberName, periodLabel, periodPoints, pointsDetails, totalPoints, tierName }) {
  const resend = getResend();
  if (!resend) {
    console.log('[Mailer] RESEND_API_KEY not set — skipping recap email to', to);
    return { skipped: true, reason: 'RESEND_API_KEY not set' };
  }

  const fromEmail = getFromEmail();
  const fromName = getFromName();
  const bg = brandColor || '#000000';
  const accent = '#CCFF00';
  const firstName = memberName.split(/\s+/)[0];

  // Build points detail rows
  const hasDetails = pointsDetails && pointsDetails.length > 0;
  const rows = (pointsDetails || []).map(d => {
    const icon = d.reason === 'challenge' ? '&#127942;' : d.reason === 'manual' ? '&#9997;' : d.reason === 'signup' ? '&#127881;' : '&#128204;';
    const date = new Date(d.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    return `<tr>
      <td style="padding:10px 12px;border-bottom:1px solid #222;font-size:13px;color:#ccc;">${icon} ${d.details || d.reason}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #222;font-size:13px;color:${accent};font-weight:700;text-align:right;">+${d.points}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #222;font-size:11px;color:#666;text-align:right;">${date}</td>
    </tr>`;
  }).join('');

  const detailsSection = hasDetails ? `
    <table style="width:100%;border-collapse:collapse;margin:0 0 24px;">
      <thead><tr style="background:#1a1a1a;">
        <th style="padding:10px 12px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Attivita</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;color:#666;text-transform:uppercase;">Punti</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;color:#666;text-transform:uppercase;">Data</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>` : '';

  // Message varies based on whether they earned points
  const bodyMessage = periodPoints > 0
    ? `Questa ${periodLabel.toLowerCase().startsWith('settimana') ? 'settimana' : 'volta'} hai guadagnato <strong style="color:${accent};">${periodPoints} punti</strong>. Ecco il dettaglio.`
    : `Questa ${periodLabel.toLowerCase().startsWith('settimana') ? 'settimana' : 'volta'} non hai guadagnato punti, ma la tua posizione nel club resta attiva!`;

  const ctaMessage = periodPoints > 0
    ? 'Ottimo lavoro! Continua cosi per sbloccare nuovi premi.'
    : 'Torna a giocare e completa missioni per accumulare punti e salire di livello!';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:500px;margin:0 auto;padding:32px 20px;">

  <!-- Header -->
  <div style="text-align:center;padding:40px 24px;background:${bg};border-radius:16px 16px 0 0;">
    <h1 style="color:#fff;font-size:24px;margin:0 0 8px;font-weight:700;">${brandName}</h1>
    <p style="color:${accent};font-size:14px;margin:0;font-weight:600;">Il tuo recap ${periodLabel.toLowerCase()}</p>
  </div>

  <!-- Body -->
  <div style="background:#1a1a1a;padding:32px 24px;border-radius:0 0 16px 16px;">
    <p style="color:#e0e0e0;font-size:16px;line-height:1.6;margin:0 0 20px;">
      Ciao <strong style="color:#fff;">${firstName}</strong>,
    </p>
    <p style="color:#bbb;font-size:14px;line-height:1.6;margin:0 0 24px;">
      ${bodyMessage}
    </p>

    <!-- Summary card: period points -->
    <div style="background:linear-gradient(135deg,${bg},#1a1a2e);border:1px solid ${accent}33;border-radius:12px;padding:28px;margin:0 0 16px;text-align:center;">
      <p style="margin:0;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Punti del periodo</p>
      <p style="margin:8px 0;font-size:48px;font-weight:800;color:${periodPoints > 0 ? accent : '#555'};line-height:1;">${periodPoints > 0 ? '+' : ''}${periodPoints}</p>
    </div>

    <!-- Position card: total + tier -->
    <div style="background:#222;border:1px solid #333;border-radius:12px;padding:20px;margin:0 0 24px;text-align:center;">
      <p style="margin:0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:1px;">La tua posizione</p>
      <p style="margin:8px 0 4px;font-size:32px;font-weight:700;color:#fff;line-height:1;">${totalPoints}</p>
      <p style="margin:0;color:#888;font-size:13px;">punti totali${tierName ? ` &mdash; Livello <strong style="color:${accent};">${tierName}</strong>` : ''}</p>
    </div>

    ${detailsSection}

    <p style="margin:20px 0 0;font-size:13px;color:#666;text-align:center;">${ctaMessage}</p>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:24px 0 0;">
    <p style="color:#444;font-size:11px;margin:0;">Powered by Precise Consulting</p>
    <p style="color:#333;font-size:10px;margin:6px 0 0;">Ricevi questa email perche fai parte del programma fedelta di ${brandName}.</p>
  </div>

</div>
</body>
</html>`;

  const subject = periodPoints > 0
    ? `${brandName} — +${periodPoints} punti ${periodLabel.toLowerCase()}!`
    : `${brandName} — Il tuo recap ${periodLabel.toLowerCase()}`;

  try {
    const result = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html
    });
    console.log(`[Mailer] ✓ Recap email sent to ${to}: ${subject}`);
    return result;
  } catch(e) {
    console.error(`[Mailer] ✗ Failed to send recap to ${to}:`, e.message);
    return { error: e.message };
  }
}

/**
 * Send scratch card invitation email
 */
async function sendScratchEmail({ to, name, brandName, brandColor, scratchUrl, campaignTitle }) {
  const resend = getResend();
  if (!resend) {
    console.log('[Mailer] RESEND_API_KEY not set — skipping scratch email to', to);
    return { skipped: true };
  }

  const fromEmail = getFromEmail();
  const fromName = getFromName();
  const firstName = (name || '').split(/\s+/)[0] || 'Ciao';
  const color = brandColor || '#D4E600';

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;">

    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:48px;margin-bottom:8px;">🎰</div>
      <h1 style="color:#fff;font-size:24px;font-weight:700;margin:0;">${campaignTitle || 'Gratta e Vinci!'}</h1>
      <p style="color:#888;font-size:14px;margin:8px 0 0;">da ${brandName}</p>
    </div>

    <div style="background:#111;border-radius:16px;padding:28px 24px;text-align:center;border:1px solid #222;">
      <p style="color:#ccc;font-size:16px;line-height:1.6;margin:0 0 8px;">
        ${firstName}, hai una scratch card tutta per te!
      </p>
      <p style="color:#888;font-size:14px;line-height:1.5;margin:0 0 24px;">
        Gratta per scoprire se hai vinto punti bonus.
      </p>
      <a href="${scratchUrl}" style="display:inline-block;background:${color};color:#000;font-size:16px;font-weight:700;padding:14px 40px;border-radius:50px;text-decoration:none;letter-spacing:0.5px;">
        GRATTA ORA
      </a>
    </div>

    <div style="text-align:center;padding:24px 0 0;">
      <p style="color:#444;font-size:11px;margin:0;">
        Powered by ${getProductBrandName()}
      </p>
    </div>

  </div>
</body></html>`;

  try {
    const result = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject: `🎰 ${firstName}, hai una scratch card da ${brandName}!`,
      html
    });
    console.log(`[Mailer] ✓ Scratch email sent to ${to}`);
    return result;
  } catch(e) {
    console.error(`[Mailer] ✗ Failed to send scratch to ${to}:`, e.message);
    return { error: e.message };
  }
}

/**
 * Password reset link for dashboard users
 */
function buildPushReportEmail({ brandName, title, screenAlert, origin, outcome, productTitle }) {
  const product = dashboardEmailProductTitle(productTitle);
  const o = outcome || {};
  const T = FD_DASHBOARD_EMAIL;

  // Diagnosi PER CANALE (mai messaggi Apple per errori Google e viceversa).
  const appleFailed = (o.apnsTotal || 0) > 0 && (o.apnsSent || 0) === 0;
  const googleErrors = Number(o.gw?.errors || 0);
  const ok = !o.hasErrors;

  const heroBg = ok ? '#ecfdf5' : '#fffbeb';
  const heroBorder = ok ? 'rgba(16,185,129,.35)' : 'rgba(245,158,11,.55)';
  const heroColor = ok ? '#047857' : '#a16207';
  const heroLabel = ok ? 'Consegnata' : 'Da verificare';
  const dotOk = '#10b981', dotOff = '#cbd5e1', dotErr = '#dc2626';

  const channelRow = (name, value, dot) => `
      <tr>
        <td style="padding:11px 0;border-bottom:1px solid ${T.border};font-size:14px;color:${T.textBody};">
          <span style="display:inline-block;width:9px;height:9px;border-radius:99px;background:${dot};margin-right:9px;"></span>${name}
        </td>
        <td style="padding:11px 0;border-bottom:1px solid ${T.border};font-size:14px;font-weight:600;color:${T.textPrimary};text-align:right;">${value}</td>
      </tr>`;

  let rows = channelRow(
    'iPhone · Apple Wallet',
    `${o.apnsSent || 0}/${o.apnsTotal || 0} consegnate`,
    (o.apnsTotal || 0) === 0 ? dotOff : (appleFailed ? dotErr : dotOk)
  );
  rows += o.gw?.skipped
    ? channelRow('Google Wallet', 'non configurato', dotOff)
    : channelRow('Google Wallet', `${o.gw?.updated || 0} aggiornati${googleErrors ? ` · ${googleErrors} errori` : ''}`, googleErrors ? dotErr : ((o.gw?.updated || 0) > 0 ? dotOk : dotOff));
  if (o.sam && !o.sam.skipped) {
    rows += channelRow('Samsung Wallet', `${o.sam.notified || 0}/${o.sam.attempted || 0} notificati`, (o.sam.notified || 0) > 0 ? dotOk : dotOff);
  }

  // Sezione problemi: solo i canali che hanno davvero fallito.
  const problems = [];
  if (appleFailed) problems.push('<strong>Apple:</strong> invio partito ma nessuna consegna — controlla certificati APNs e device registrati.');
  if (googleErrors) problems.push(`<strong>Google:</strong> ${googleErrors} aggiornament${googleErrors === 1 ? 'o' : 'i'} fallit${googleErrors === 1 ? 'o' : 'i'} — verifica che il pass Google esista ancora (oggetto eliminato o scaduto?).`);
  if ((o.failures || []).length) {
    const items = o.failures.slice(0, 8)
      .map((f) => `<span style="font-family:'SF Mono',Menlo,monospace;font-size:12px;">${String(f.token || '').slice(0, 14)}…</span> ${f.reason || f.error || 'unknown'}`)
      .join('<br>');
    problems.push(`<strong>Dettaglio APNs (${o.failures.length}):</strong><br>${items}`);
  }
  const problemsHtml = problems.length
    ? `<div style="margin:18px 0 0;padding:14px 16px;border-radius:10px;background:#fef2f2;border:1px solid rgba(220,38,38,.25);color:#b91c1c;font-size:13px;line-height:1.7;">${problems.join('<br><br>')}</div>`
    : '';

  const domain = String(process.env.CUSTOM_DOMAIN || '').trim();
  const dashUrl = domain ? `https://${domain.replace(/^https?:\/\//, '')}/dashboard` : null;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${T.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px;">
    <div style="background:${T.card};border-radius:${T.radius};padding:28px 24px;border:1px solid ${T.border};box-shadow:${T.shadow};">
      ${filoDashboardEmailWordmark(product)}

      <div style="margin:22px 0 0;padding:18px 20px;border-radius:12px;background:${heroBg};border:1px solid ${heroBorder};">
        <table style="width:100%;border-collapse:collapse;"><tr>
          <td>
            <div style="font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${heroColor};">Push ${heroLabel}</div>
            <div style="font-size:15px;font-weight:600;color:${T.textPrimary};margin-top:4px;">${brandName}</div>
            <div style="font-size:12px;color:${T.textMuted};margin-top:2px;">Invio ${origin === 'programmata' ? 'programmato' : 'manuale'} · report automatico</div>
          </td>
          <td style="text-align:right;vertical-align:middle;">
            <div style="font-size:34px;font-weight:800;color:${heroColor};line-height:1;">${o.delivered || 0}</div>
            <div style="font-size:11px;color:${T.textMuted};">${(o.delivered || 0) === 1 ? 'consegna' : 'consegne'}</div>
          </td>
        </tr></table>
      </div>

      <div style="margin:18px 0 0;padding:12px 16px;border-left:3px solid ${T.primary};background:${T.bg};border-radius:0 8px 8px 0;">
        <div style="font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:${T.textMuted};margin-bottom:3px;">Notifica inviata</div>
        <div style="font-size:14px;color:${T.textPrimary};line-height:1.5;">${String(screenAlert || title || '').slice(0, 160)}</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-top:14px;">${rows}</table>
      ${problemsHtml}

      ${dashUrl ? `<p style="text-align:center;margin:24px 0 4px;">
        <a href="${dashUrl}" style="display:inline-block;background:${T.primary};color:#fff;font-weight:600;font-size:14px;padding:12px 26px;border-radius:${T.btnRadius};text-decoration:none;box-shadow:${T.btnShadow};">Apri la dashboard →</a>
      </p>` : ''}
    </div>
    <p style="color:${T.textFooter};font-size:12px;text-align:center;margin:16px 0 0;line-height:1.6;">
      Report inviato a chi gestisce ${brandName} e agli admin, dopo ogni invio push.<br>Powered by ${product}
    </p>
  </div>
</body>
</html>`;

  const statusEmoji = ok ? '\u2705' : '\u26a0\ufe0f';
  const problemHint = !ok
    ? (appleFailed && googleErrors ? ' — errori Apple e Google' : appleFailed ? ' — verifica Apple' : googleErrors ? ' — verifica Google' : ' — verifica errori')
    : '';
  const subject = `${statusEmoji} ${brandName} — push ${ok ? 'consegnata' : 'da verificare'} (${o.delivered || 0} ${(o.delivered || 0) === 1 ? 'consegna' : 'consegne'})${problemHint}`;
  return { html, subject };
}

async function sendPushReportEmail({ to, brandName, title, screenAlert, origin, outcome, productTitle }) {
  const { html, subject } = buildPushReportEmail({ brandName, title, screenAlert, origin, outcome, productTitle });
  return sendViaResend({
    from: `${getFromName()} <${getFromEmail()}>`,
    to: Array.isArray(to) ? to : [to],
    subject,
    html
  }, { logLabel: 'push report' });
}

async function sendLoginOtpEmail({ to, name, code, productTitle }) {
  const resend = getResend();
  if (!resend) {
    console.log('⚠️ RESEND_API_KEY not set — skipping login OTP email to', to);
    return { skipped: true, reason: 'RESEND_API_KEY not set' };
  }

  const product = dashboardEmailProductTitle(productTitle);
  const displayName = String(name || '').trim() || String(to).split('@')[0];
  const firstName = displayName.split(/\s+/)[0];
  const safeCode = String(code || '').replace(/[^0-9]/g, '').slice(0, 6);
  const prettyCode = `${safeCode.slice(0, 3)} ${safeCode.slice(3)}`;

  const bodyHtml = `
      <p style="color:${FD_DASHBOARD_EMAIL.textBody};font-size:15px;line-height:1.6;margin:0 0 16px;">
        Ciao <strong style="color:${FD_DASHBOARD_EMAIL.textPrimary};">${firstName}</strong>,
      </p>
      <p style="color:${FD_DASHBOARD_EMAIL.textBody};font-size:15px;line-height:1.6;margin:0 0 8px;">
        il tuo codice di accesso alla dashboard è:
      </p>
      <p style="text-align:center;margin:20px 0 24px;">
        <span style="display:inline-block;background:${FD_DASHBOARD_EMAIL.bg};border:1px solid ${FD_DASHBOARD_EMAIL.border};border-radius:12px;padding:14px 26px;font-size:30px;font-weight:700;letter-spacing:6px;color:${FD_DASHBOARD_EMAIL.textPrimary};font-family:'SF Mono',Menlo,Consolas,monospace;">${prettyCode}</span>
      </p>
      <p style="color:${FD_DASHBOARD_EMAIL.textMuted};font-size:13px;line-height:1.6;margin:0;">
        Il codice vale <strong>10 minuti</strong> e funziona una sola volta.
      </p>`;

  const html = filoDashboardEmailLayout({
    productTitle: product,
    headline: 'Il tuo codice di accesso',
    subtitle: 'Verifica in due passaggi per la dashboard.',
    bodyHtml,
    footnote: 'Se non hai tentato di accedere tu, cambia subito la password: qualcuno conosce le tue credenziali.'
  });

  return sendViaResend({
    from: `${getFromName()} <${getFromEmail()}>`,
    to: [to],
    subject: `${safeCode} è il tuo codice di accesso — ${product}`,
    html
  }, { logLabel: 'login OTP' });
}

async function sendPasswordResetEmail({ to, name, resetUrl, productTitle }) {
  const resend = getResend();
  if (!resend) {
    console.log('⚠️ RESEND_API_KEY not set — skipping password reset email to', to);
    return { skipped: true, reason: 'RESEND_API_KEY not set' };
  }

  const product = dashboardEmailProductTitle(productTitle);
  const displayName = String(name || '').trim() || String(to).split('@')[0];
  const firstName = displayName.split(/\s+/)[0];
  const fromEmail = getFromEmail();
  const fromName = getFromName();

  const bodyHtml = `
      <p style="color:${FD_DASHBOARD_EMAIL.textBody};font-size:15px;line-height:1.6;margin:0 0 16px;">
        Ciao <strong style="color:${FD_DASHBOARD_EMAIL.textPrimary};">${firstName}</strong>,
      </p>
      <p style="color:${FD_DASHBOARD_EMAIL.textBody};font-size:15px;line-height:1.6;margin:0 0 16px;">
        Hai richiesto di reimpostare la password della dashboard. Il link è valido per <strong style="color:${FD_DASHBOARD_EMAIL.textPrimary};">1 ora</strong>.
      </p>
      <p style="color:${FD_DASHBOARD_EMAIL.textMuted};font-size:13px;line-height:1.6;margin:0;word-break:break-all;">
        Se il pulsante non funziona, copia questo link nel browser:<br>
        <a href="${resetUrl}" style="color:${FD_DASHBOARD_EMAIL.primary};text-decoration:underline;">${resetUrl}</a>
      </p>`;

  const html = filoDashboardEmailLayout({
    productTitle: product,
    headline: 'Recupero password',
    subtitle: 'Scegli una nuova password per il tuo account.',
    bodyHtml,
    ctaUrl: resetUrl,
    ctaLabel: 'Reimposta password →',
    footnote: 'Se non hai richiesto il recupero, ignora questa email.'
  });

  const result = await resend.emails.send({
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject: `Reimposta la password — ${product}`,
    html
  });

  console.log('✓ Password reset email sent to', to);
  return result;
}

/**
 * HR employee pass activation invite (Filodiretto).
 */
async function sendActivationEmail({ to, firstName, brandName, activateUrl, dpoEmail, brandTheme, brandLogo, brandLogoAttachment }) {
  const brand = brandName || 'la tua azienda';
  const fromEmail = getHrFromEmail();
  const fromName = getHrFromName();
  const inlineLogoAttachment = buildInviteInlineLogoAttachment(brandLogoAttachment);
  const logoForEmail = resolveEmployeeEmailLogo(brandLogo, inlineLogoAttachment);
  const html = buildEmployeeWalletEmailHtml({
    firstName,
    brandName: brand,
    ctaUrl: activateUrl,
    ctaLabel: 'Attiva ora →',
    title: 'Attiva il tuo accesso in {brand}',
    body: 'il tuo pass dipendente è pronto: attivalo per ricevere aggiornamenti aziendali in modo rapido e sicuro, direttamente sul telefono.',
    footnote: 'Il link è valido per 30 giorni.',
    dpoEmail: dpoEmail || fromEmail,
    brandTheme,
    brandLogo: logoForEmail
  });

  const payload = {
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject: `FiloDiretto.App | Attiva il tuo accesso ${brand}`,
    html
  };
  if (inlineLogoAttachment && !brandLogo?.url) payload.attachments = [inlineLogoAttachment];
  return sendViaResend(payload, { logLabel: 'activation email' });
}

async function sendActivationReminderEmail({ to, firstName, brandName, activateUrl, dpoEmail, brandTheme, brandLogo, brandLogoAttachment }) {
  const brand = brandName || 'la tua azienda';
  const fromEmail = getHrFromEmail();
  const fromName = getHrFromName();
  const inlineLogoAttachment = buildInviteInlineLogoAttachment(brandLogoAttachment);
  const logoForEmail = resolveEmployeeEmailLogo(brandLogo, inlineLogoAttachment);
  const html = buildEmployeeWalletEmailHtml({
    firstName,
    brandName: brand,
    ctaUrl: activateUrl,
    ctaLabel: 'Attiva il pass →',
    title: 'Promemoria attivazione accesso {brand}',
    body: 'il tuo pass dipendente è ancora in attesa di attivazione. Completa il passaggio con il pulsante qui sotto.',
    footnote: 'Il link è valido per 30 giorni.',
    dpoEmail: dpoEmail || fromEmail,
    brandTheme,
    brandLogo: logoForEmail
  });
  const payload = {
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject: `FiloDiretto.App | Promemoria attivazione accesso ${brand}`,
    html
  };
  if (inlineLogoAttachment && !brandLogo?.url) payload.attachments = [inlineLogoAttachment];
  return sendViaResend(payload, { logLabel: 'activation reminder' });
}

async function sendPassAccessEmail({ to, firstName, brandName, accessUrl, dpoEmail, brandTheme, brandLogo, brandLogoAttachment }) {
  const brand = brandName || 'la tua azienda';
  const fromEmail = getHrFromEmail();
  const fromName = getHrFromName();
  const inlineLogoAttachment = buildInviteInlineLogoAttachment(brandLogoAttachment);
  const logoForEmail = resolveEmployeeEmailLogo(brandLogo, inlineLogoAttachment);
  const html = buildEmployeeWalletEmailHtml({
    firstName,
    brandName: brand,
    ctaUrl: accessUrl,
    ctaLabel: 'Apri il pass →',
    title: 'Accedi al tuo pass {brand}',
    body: 'usa il link qui sotto per scaricare di nuovo il pass o installarlo su un altro dispositivo.',
    footnote: '',
    dpoEmail: dpoEmail || fromEmail,
    brandTheme,
    brandLogo: logoForEmail
  });

  const payload = {
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject: `FiloDiretto.App | Accedi al tuo pass ${brand}`,
    html
  };
  if (inlineLogoAttachment && !brandLogo?.url) payload.attachments = [inlineLogoAttachment];
  return sendViaResend(payload, { logLabel: 'pass access email' });
}

function formatPgaScheduledAt(value) {
  if (!value) return 'Da definire con HR';
  try {
    return new Date(value).toLocaleString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return String(value);
  }
}

async function sendPgaBookingHrNotification({
  to,
  brandName,
  employeeName,
  experienceName,
  coinAmount,
  scheduledAt,
  bookingId
}) {
  const resend = getResend();
  if (!resend) {
    console.log('[Mailer] PGA HR notification skipped — RESEND_API_KEY not set');
    return { skipped: true, reason: 'RESEND_API_KEY not set' };
  }
  if (!to) return { skipped: true, reason: 'no recipient' };

  const fromEmail = getHrFromEmail();
  const fromName = getHrFromName();
  const brand = brandName || 'Azienda';
  const employee = employeeName || 'Dipendente';
  const experience = experienceName || 'Esperienza PGA';
  const when = formatPgaScheduledAt(scheduledAt);
  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 20px;">
  <div style="background:#fff;border-radius:12px;padding:28px 24px;border:1px solid #e2e8f0;">
    <p style="color:#8B5CF6;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px;">PGA · FiloDiretto.App</p>
    <h1 style="color:#0f172a;font-size:20px;margin:0 0 12px;">Nuova prenotazione esperienza</h1>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px;">
      <strong>${escapeHtml(employee)}</strong> ha richiesto il riscatto di <strong>${escapeHtml(experience)}</strong> per <strong>${escapeHtml(String(coinAmount))} coin</strong>.
    </p>
    <p style="color:#64748b;font-size:14px;line-height:1.5;margin:0 0 8px;"><strong>Data/ora richiesta:</strong> ${escapeHtml(when)}</p>
    ${bookingId ? `<p style="color:#64748b;font-size:13px;margin:0;">ID prenotazione: ${escapeHtml(String(bookingId))}</p>` : ''}
    <p style="color:#64748b;font-size:13px;line-height:1.5;margin:16px 0 0;">Accedi alla dashboard HR per confermare o pianificare l&apos;esperienza.</p>
  </div>
  <p style="color:#94a3b8;font-size:12px;text-align:center;margin:16px 0 0;">Powered by FiloDiretto.App</p>
</div></body></html>`;

  return sendViaResend({
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject: `${brand} · Nuova prenotazione PGA: ${experience}`,
    html
  }, { logLabel: 'pga booking hr notification' });
}

async function sendPgaBookingEmployeeConfirmation({
  to,
  employeeName,
  experienceName,
  coinAmount,
  scheduledAt
}) {
  const resend = getResend();
  if (!resend) {
    console.log('[Mailer] PGA employee confirmation skipped — RESEND_API_KEY not set');
    return { skipped: true, reason: 'RESEND_API_KEY not set' };
  }
  if (!to) return { skipped: true, reason: 'no recipient' };

  const fromEmail = getHrFromEmail();
  const fromName = getHrFromName();
  const name = employeeName || 'Collega';
  const experience = experienceName || 'Esperienza PGA';
  const when = formatPgaScheduledAt(scheduledAt);
  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 20px;">
  <div style="background:#fff;border-radius:12px;padding:28px 24px;border:1px solid #e2e8f0;">
    <p style="color:#8B5CF6;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px;">PGA · FiloDiretto.App</p>
    <h1 style="color:#0f172a;font-size:20px;margin:0 0 12px;">Prenotazione inviata</h1>
    <p style="color:#334155;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Ciao ${escapeHtml(name)}, la tua richiesta per <strong>${escapeHtml(experience)}</strong> è stata registrata.
    </p>
    <p style="color:#64748b;font-size:14px;line-height:1.5;margin:0 0 8px;"><strong>Coin scalati:</strong> ${escapeHtml(String(coinAmount))}</p>
    <p style="color:#64748b;font-size:14px;line-height:1.5;margin:0;"><strong>Data/ora richiesta:</strong> ${escapeHtml(when)}</p>
    <p style="color:#64748b;font-size:13px;line-height:1.5;margin:16px 0 0;">HR ti contatterà per confermare i dettagli. Puoi annullare la prenotazione dal profilo finché è in attesa.</p>
  </div>
  <p style="color:#94a3b8;font-size:12px;text-align:center;margin:16px 0 0;">Powered by FiloDiretto.App</p>
</div></body></html>`;

  return sendViaResend({
    from: `${fromName} <${fromEmail}>`,
    to: [to],
    subject: `Prenotazione PGA confermata: ${experience}`,
    html
  }, { logLabel: 'pga booking employee confirmation' });
}

module.exports = {
  sendWelcomeEmail,
  sendUserInviteEmail,
  sendRecapEmail,
  sendScratchEmail,
  sendPasswordResetEmail,
  sendLoginOtpEmail,
  sendPushReportEmail,
  buildPushReportEmail,
  sendActivationEmail,
  sendActivationReminderEmail,
  sendPassAccessEmail,
  sendPgaBookingHrNotification,
  sendPgaBookingEmployeeConfirmation
};

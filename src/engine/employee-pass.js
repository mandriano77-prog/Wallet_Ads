/**
 * Unified employee_pass data model + cross-wallet serializers (Apple / Google / Samsung).
 * Single source for Filo Diretto HR pass content parity.
 */

/** Canonical pass type in DB / API / UI for HR employee passes. */
const EMPLOYEE_PASS_TYPE = 'employee_pass';
const APPLE_WALLET_UPDATE_HINT = "Apri l'aggiornamento";
const { PUSH_TITLE_MAX, PUSH_MESSAGE_MAX, PUSH_SCREEN_ALERT_MAX } = require('./push-text-limits');
/** Apple Wallet pass.json top-level key (implementation detail only). */
const APPLE_EMPLOYEE_PASS_STRUCTURE = 'storeCard';
/** Apple Wallet back link titles (title = embedded CTA, no duplicate subtitle). */
const HR_HUB_BACK_TITLE = 'HUB PERSONALE';
const HR_PORTAL_BACK_TITLE = 'AREA PRIVATA';
/** @deprecated Back no longer shows DEAL/PGA/COIN subtitle; kept for importers. */
const HUB_EMPLOYEE_LINK_TEXT = 'DEAL · PGA · COIN';

const HR_BG_DEFAULT = '#8B5CF6';
const HR_LABEL_DEFAULT = '#A78BFA';
const HR_FG_DEFAULT = '#FFFFFF';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseFieldValues(instance) {
  const raw = instance?.field_values;
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveMemberProfile(memberRow, instance) {
  if (memberRow) {
    const first = memberRow.first_name || '';
    const last = memberRow.last_name || '';
    const fullName = [first, last].filter(Boolean).join(' ').trim() || memberRow.full_name || null;
    return {
      id: memberRow.id,
      full_name: fullName,
      employee_id: memberRow.employee_id || null,
      department: memberRow.department || null,
      office_location: memberRow.office_location || null,
      hire_date: memberRow.hire_date || null,
      manager_name: memberRow.manager_name || null,
      manager_email: memberRow.manager_email || null
    };
  }
  const fv = parseFieldValues(instance);
  const fullName = [fv.nome || fv.name, fv.cognome || fv.surname].filter(Boolean).join(' ').trim()
    || fv.display_name || fv.full_name
    || [fv.first_name, fv.last_name].filter(Boolean).join(' ').trim() || null;
  return {
    id: instance?.id || null,
    full_name: fullName || null,
    employee_id: fv.matricola || fv.badge_id || fv.employee_id || null,
    department: fv.department || fv.reparto || null,
    office_location: fv.office_location || fv.sede || null,
    hire_date: fv.hire_date || null,
    manager_name: fv.manager_name || null,
    manager_email: fv.manager_email || null
  };
}

function resolveVariableLink(instance, template, brandConfig = {}, opts = {}) {
  // Contenuto collegato alla push (gioco instant win / challenge): quando
  // attivo occupa il Link 1 e SOSTITUISCE ogni link manuale (regola "o uno
  // o l'altro" — vedi «Collega contenuto» nel pannello push).
  const serial = String(opts.serialNumber || instance?.serial_number || '').trim();
  const publicBase = String(opts.publicBaseUrl || '').replace(/\/+$/, '');
  // Scadenza del Link 1 (vale anche per i contenuti collegati): oltre la data,
  // il gioco sparisce dal retro alla prossima rigenerazione del pass.
  const gameExpired = (cfg) => {
    if (!cfg || !cfg.expires_at) return false;
    const exp = new Date(cfg.expires_at);
    return Number.isFinite(exp.getTime()) && exp <= new Date();
  };
  if (publicBase && serial) {
    if (brandConfig.instantWinActive && !gameExpired(brandConfig.instantWinActive)) {
      return {
        label: brandConfig.instantWinActive.label || 'Gioca e Vinci!',
        url: `${publicBase}/play/${serial}`
      };
    }
    if (brandConfig.gamificationActive && !gameExpired(brandConfig.gamificationActive)) {
      const gameTypeRoutes = { quiz: 'quiz', memory: 'memory', puzzle: 'puzzle', jigsaw: 'jigsaw' };
      const gameRoute = gameTypeRoutes[brandConfig.gamificationActive.game_type] || 'quiz';
      return {
        label: brandConfig.gamificationActive.label || 'Gioca ora!',
        url: `${publicBase}/game/${gameRoute}/${serial}`
      };
    }
  }
  const now = new Date();
  if (instance?.dynamic_link_url) {
    const exp = instance.dynamic_link_expires_at ? new Date(instance.dynamic_link_expires_at) : null;
    if (!exp || exp > now) {
      return { label: instance.dynamic_link_label || 'AZIONE RICHIESTA', url: instance.dynamic_link_url };
    }
  }
  if (template?.back_fixed_link_url) {
    return { label: template.back_fixed_link_label || 'LINK UTILE', url: template.back_fixed_link_url };
  }
  const pushOut = brandConfig.pushLinkOut;
  if (pushOut?.url) return { label: pushOut.label || 'Scopri di più', url: pushOut.url };
  return null;
}

function pushBackDetailsLabel(pushAnn) {
  if (isDefaultPushCopy(pushAnn)) return ' ';
  const title = String(pushAnn?.title || '').trim().toUpperCase();
  if (title === 'INFO PASS') return ' ';
  return title ? title.slice(0, 40) : ' ';
}

function parseJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseColor(color) {
  const rgbMatch = String(color || '').match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    return { r: parseInt(rgbMatch[1], 10), g: parseInt(rgbMatch[2], 10), b: parseInt(rgbMatch[3], 10) };
  }
  let hex = String(color || '').replace('#', '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  return {
    r: parseInt(hex.substring(0, 2), 16) || 0,
    g: parseInt(hex.substring(2, 4), 16) || 0,
    b: parseInt(hex.substring(4, 6), 16) || 0
  };
}

function colorToRgbString(color) {
  if (!color) return null;
  if (String(color).trim().toLowerCase().startsWith('rgb')) return String(color).trim();
  const c = parseColor(color);
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

function isCoinPassField(label, key) {
  const l = String(label || '').trim().toUpperCase();
  const k = String(key || '').trim().toLowerCase();
  return k === 'coin_balance' || k === 'coin' || l === 'COIN' || /^COIN\b/.test(l);
}

function buildCoinFieldValue(coinBalance) {
  const coinValue =
    coinBalance != null && Number.isFinite(Number(coinBalance))
      ? Math.max(0, Math.floor(Number(coinBalance)))
      : 0;
  return {
    key: 'coin_balance',
    label: 'COIN',
    value: String(coinValue),
    changeMessage: 'Hai %@ coin',
  };
}

function invisibleChangeToken(value) {
  const raw = String(value == null ? Date.now() : value);
  const alphabet = ['\u200b', '\u200c', '\u200d', '\u2060'];
  return raw
    .split('')
    .map((ch, idx) => alphabet[(ch.charCodeAt(0) + idx) % alphabet.length])
    .join('');
}

function stripInvisibleChangeTokens(value) {
  return String(value || '').replace(/[\u200b\u200c\u200d\u2060]/g, '');
}

function isDefaultPushCopy(pushAnn) {
  const title = String(pushAnn?.title || '').trim().toUpperCase();
  const message = String(pushAnn?.message || '').trim().toLowerCase();
  return title === 'INFO PASS' && message === 'apri il pass per i dettagli';
}


function buildPushAlertText(pushAnn) {
  const screen = String(pushAnn?.screen_alert || pushAnn?.screenAlert || '').trim();
  if (screen) return screen.slice(0, PUSH_SCREEN_ALERT_MAX);
  if (!pushAnn?.message && !pushAnn?.back_details) return '';
  const details = String(pushAnn.back_details || '').trim();
  if (details && isDefaultPushCopy(pushAnn)) return details.slice(0, PUSH_SCREEN_ALERT_MAX);

  const promoTitle = String(pushAnn.title || '').trim().toUpperCase().slice(0, PUSH_TITLE_MAX);
  const body = String(pushAnn.message || details || '').trim().slice(0, PUSH_MESSAGE_MAX);
  if (promoTitle && body) return `${promoTitle}: ${body}`.slice(0, PUSH_SCREEN_ALERT_MAX);
  return (body || details).slice(0, PUSH_SCREEN_ALERT_MAX);
}

function buildPushChangeMessage(pushAnn) {
  const alertText = buildPushAlertText(pushAnn);
  if (!alertText) return null;
  return alertText.slice(0, PUSH_SCREEN_ALERT_MAX);
}

/** @deprecated back-field alerts are ignored by Wallet for lock-screen copy. */
function buildPushLockScreenBackSection() {
  return null;
}

/** @deprecated use buildPushAnnouncementAuxField. */
function buildPushScreenAlertAuxField(pushAnn) {
  return buildPushAnnouncementAuxField(pushAnn);
}

/**
 * Apple Wallet update banners are driven by changeMessage on a changed pass
 * front field. Back fields update silently.
 *
 * The field lives in headerFields (outside the NOME/AREA/COIN row, so no empty
 * 4th column). The value is an invisible token that changes each push; the
 * alert copy lives in the changeMessage template. iOS requires %@ in
 * changeMessage — it substitutes the (invisible) value, so only the copy shows.
 */
function buildPushAnnouncementField(pushAnn) {
  const alertText = buildPushChangeMessage(pushAnn);
  if (!alertText) return null;
  const pushTs = Number(pushAnn?.ts || Date.now());
  return {
    key: 'announcement',
    label: '',
    value: invisibleChangeToken(pushTs).slice(0, 12),
    changeMessage: `${alertText}%@`
  };
}

/** @deprecated old name — the alert now rides on a header field. */
function buildPushAnnouncementAuxField(pushAnn) {
  return buildPushAnnouncementField(pushAnn);
}

function buildPushHeaderAlertField(headerHint) {
  return headerHint || null;
}

/**
 * When a decorative header hint exists, merge the invisible push token into its
 * value so iOS shows one header slot (caption visible, no orphan dot). Without
 * a hint, fall back to a standalone announcement header field.
 */
function mergePushAlertIntoHeaderHint(headerHint, pushAnn) {
  const alertText = buildPushChangeMessage(pushAnn);
  if (!alertText) {
    return { headerHint: headerHint || null, pushAlert: null };
  }
  const pushTs = Number(pushAnn?.ts || Date.now());
  const token = invisibleChangeToken(pushTs).slice(0, 12);

  if (headerHint) {
    return {
      headerHint: {
        ...headerHint,
        value: String(headerHint.value || '') + token,
        // iOS sostituisce %@ col valore del campo (didascalia visibile + token):
        // senza separatore testo manuale e didascalia si attaccano sul lock screen.
        changeMessage: `${alertText} · %@`,
      },
      pushAlert: null,
    };
  }

  return {
    headerHint: null,
    pushAlert: buildPushAnnouncementField(pushAnn),
  };
}

/**
 * Deprecated name kept for old tests/importers. The Wallet alert rides on a
 * changed front announcement field.
 */
function buildPushHeaderField(pushAnn) {
  return buildPushAnnouncementAuxField(pushAnn);
}

/** @deprecated use buildPushHeaderField */
function buildPushWalletAlertField(pushAnn) {
  return buildPushHeaderField(pushAnn);
}

/** Push copy for strip overlay (not auxiliary pillar). Instance overlay wins over brand config. */
function resolvePushAnnouncement(brandConfig, instance) {
  const { parsePushAnnouncementRecord } = require('./pass-push-state');
  const fromInstance = parsePushAnnouncementRecord(instance?.push_announcement);
  if (fromInstance) return fromInstance;
  const ann = brandConfig?.pushAnnouncement;
  if (!ann || !ann.message) return null;
  const message = String(ann.message || '').trim();
  if (!message) return null;
  const out = {
    title: String(ann.title || '').trim(),
    message,
    ts: Number(ann.ts || Date.now()),
  };
  const screen = String(ann.screen_alert ?? ann.screenAlert ?? '').trim();
  if (screen) out.screen_alert = screen.slice(0, PUSH_SCREEN_ALERT_MAX);
  const backRaw = String(ann.back_details ?? ann.backDetails ?? '').trim();
  if (backRaw) out.back_details = backRaw;
  return out;
}

function rgbToHex(color) {
  if (!color) return HR_BG_DEFAULT;
  if (String(color).startsWith('#')) return String(color);
  const c = parseColor(color);
  return `#${[c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function isLegacyGreenPassAccent(color) {
  if (!color) return false;
  const normalized = String(color).trim().toLowerCase().replace(/\s/g, '');
  const legacy = [
    '#00d4aa', '#00d4a9', '#3cdfff', '#d4e600',
    'rgb(0,212,170)', 'rgb(0,212,169)', 'rgb(60,223,255)', 'rgb(212,230,0)'
  ];
  if (legacy.includes(normalized)) return true;
  const c = parseColor(color);
  if (c.g > 150 && c.r < 100 && c.b >= 100 && c.b <= 220) return true;
  if (c.r > 180 && c.g > 200 && c.b < 100) return true;
  return false;
}

function resolveEmployeePassColors(template, brandConfig) {
  const line = String(brandConfig?.product_line || '').toLowerCase();
  const fgHex = brandConfig?.foregroundColor || null;
  const defaultForeground = template?.style?.foregroundColor || HR_FG_DEFAULT;
  let foregroundColor = fgHex && !isLegacyGreenPassAccent(fgHex)
    ? colorToRgbString(fgHex)
    : (isLegacyGreenPassAccent(defaultForeground) ? HR_FG_DEFAULT : colorToRgbString(defaultForeground) || HR_FG_DEFAULT);
  if (line === 'hr') foregroundColor = colorToRgbString(HR_FG_DEFAULT);

  const bgHex = brandConfig?.backgroundColor || template?.style?.backgroundColor || null;
  const backgroundColor = bgHex
    ? colorToRgbString(bgHex)
    : (line === 'hr' ? colorToRgbString(HR_BG_DEFAULT) : 'rgb(13, 11, 26)');

  const lblHex = brandConfig?.labelColor || template?.style?.labelColor || null;
  let labelColor = foregroundColor;
  if (line === 'hr') {
    labelColor = colorToRgbString(
      lblHex && !isLegacyGreenPassAccent(lblHex) ? lblHex : HR_LABEL_DEFAULT
    );
  } else if (lblHex && !isLegacyGreenPassAccent(lblHex)) {
    labelColor = colorToRgbString(lblHex);
  }

  return {
    foregroundColor,
    backgroundColor,
    labelColor,
    hexBackgroundColor: rgbToHex(backgroundColor)
  };
}

function makeHrLinkField(key, label, url, linkText) {
  const title = String(linkText || label || '').trim();
  if (!title || !url) return null;
  const safeUrl = escapeHtml(url);
  const safeTitle = escapeHtml(title);
  // Title lives only in attributedValue — avoid duplicating link text in value row.
  return {
    key,
    label: '',
    value: '\u200b',
    attributedValue: `<a href="${safeUrl}">${safeTitle}</a>`
  };
}

/** Template-level HR retro fields with brand fallback (per-template config). */
function resolveHrBackSource(template, brand) {
  const tplRes = parseJsonArray(template?.back_resources);
  const tplDocs = parseJsonArray(template?.back_documents);
  const brandRes = parseJsonArray(brand?.back_resources);
  const brandDocs = parseJsonArray(brand?.back_documents);
  return {
    hr_email: template?.hr_email ?? brand?.hr_email ?? null,
    hr_phone: template?.hr_phone ?? brand?.hr_phone ?? null,
    dpo_email: template?.dpo_email ?? brand?.dpo_email ?? null,
    emergency_phone: template?.emergency_phone ?? brand?.emergency_phone ?? null,
    back_resources: tplRes.length ? tplRes : brandRes,
    back_documents: tplDocs.length ? tplDocs : brandDocs
  };
}

function buildAnnouncementBackSection(brandConfig) {
  const ann = brandConfig?.pushAnnouncement;
  if (!ann || !ann.message) return null;
  const label = String(ann.title || 'NOVITA').trim().toUpperCase().slice(0, 64) || 'NOVITA';
  const body = String(ann.message || '').trim();
  if (!body) return null;
  return {
    kind: 'text',
    key: 'announcement_full',
    label,
    body
  };
}

/** Single SUPPORT mailto link — title-only CTA (privacy/DPO lives in Area Privata consents). */
function buildSupportBackLink(hrBack) {
  const email = String(hrBack.hr_email || '').trim();
  if (!email) return null;
  return {
    kind: 'link',
    key: 'support',
    label: 'SUPPORT',
    url: `mailto:${email}`
  };
}

function backTextDuplicatesPushCopy(text, pushAnn, dynamicLink) {
  const normalized = String(text || '').trim();
  if (!normalized) return true;
  const screen = String(pushAnn?.screen_alert || pushAnn?.screenAlert || '').trim();
  if (screen && normalized === screen) return true;
  const linkLabel = String(dynamicLink?.label || '').trim();
  if (linkLabel && normalized.toLowerCase() === linkLabel.toLowerCase()) return true;
  const msg = String(pushAnn?.message || '').trim();
  if (msg && normalized === msg) return true;
  return false;
}

function buildBackSections({ brand, template, instance, member, brandConfig = {}, portalUrl = null, hubUrl = null, apiBase = null }) {
  const sections = [];
  const hrBack = resolveHrBackSource(template, brand);
  const pushAnn = resolvePushAnnouncement(brandConfig, instance);
  // Base pubblica per i link dei giochi (/play, /game): derivata dall'apiBase.
  const publicBaseUrl = apiBase ? String(apiBase).replace(/\/api\/v1\/?$/, '') : null;

  // Messaggio geofencing: PRIMA cosa visibile girando il pass (prima dei link
  // HUB/Supporto/Area privata). Testo fisso, senza changeMessage → aggiornamento
  // silenzioso. Apple non consente un retro diverso per singolo POI.
  const geoBack = String(brandConfig.geoBackMessage || '').trim();
  if (geoBack) {
    sections.push({
      kind: 'alert',
      key: 'geo_back_message',
      label: ' ',
      body: geoBack.slice(0, 500),
    });
  }

  // Link CTA first. Notification copy is handled by the front technical field,
  // not mirrored on the back.
  const dynamicLink = resolveVariableLink(instance, template, brandConfig, { publicBaseUrl });
  if (dynamicLink?.url) {
    sections.push({
      kind: 'link',
      key: 'dynamic_push_link',
      label: dynamicLink.label,
      url: dynamicLink.url
    });
  }

  if (pushAnn?.back_details) {
    const details = String(pushAnn.back_details).trim();
    if (!backTextDuplicatesPushCopy(details, pushAnn, dynamicLink)) {
      sections.push({
        kind: 'alert',
        key: 'push_back_details',
        label: ' ',
        body: details,
      });
    }
  }


  if (hubUrl) {
    sections.push({
      kind: 'link',
      key: 'hub_employee',
      label: HR_HUB_BACK_TITLE,
      url: hubUrl
    });
  }

  // EXTRA — fringe benefit/welfare: link al portale (sezione EXTRA) solo se il
  // brand ha almeno un'integrazione attiva. Vive accanto ai perk (HUB).
  if (portalUrl) {
    try {
      const { enabledIntegrations } = require('./integrations');
      if (enabledIntegrations(brandConfig).length > 0) {
        const sep = portalUrl.includes('#') ? '' : '#extra';
        sections.push({
          kind: 'link',
          key: 'extra_benefits',
          label: 'EXTRA',
          url: portalUrl + sep,
        });
      }
    } catch (_) { /* engine assente: salta il link EXTRA */ }
  }

  const support = buildSupportBackLink(hrBack);
  if (support) sections.push(support);

  if (portalUrl) {
    sections.push({
      kind: 'link',
      key: 'portal_profile',
      label: HR_PORTAL_BACK_TITLE,
      url: portalUrl
    });
  }

  return sections;
}

function brandHasLogoAsset(brand, template) {
  const cfg = brand?.config || {};
  const tplImages = template?.style?.images || {};
  return !!(
    cfg.brand_identity_assets?.logo
    || cfg.logos?.logo
    || cfg.logos?.['logo@2x']
    || tplImages.logo
  );
}

function brandHasStripAsset(brand, template) {
  const cfg = brand?.config || {};
  const tplImages = template?.style?.images || {};
  return !!(
    tplImages.strip
    || cfg.logos?.strip
    || cfg.strip_base64
  );
}

function resolveWalletImageVersion(instance) {
  if (!instance) return null;
  const toSafeVersion = (value) => {
    if (value == null || value === '') return null;
    if (value instanceof Date) return String(value.getTime());
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return String(Math.trunc(numeric));
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed)) return String(parsed);
    const safe = String(value).trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
    return safe || null;
  };
  const lastUpdated = toSafeVersion(instance.last_updated);
  if (lastUpdated) return lastUpdated;
  const lastPushAt = toSafeVersion(instance.last_push_at);
  if (lastPushAt) return lastPushAt;
  const raw = instance.push_announcement;
  if (!raw) return null;
  let ann = raw;
  if (typeof raw === 'string') {
    try {
      ann = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const ts = Number(ann?.ts ?? ann?.timestamp);
  return Number.isFinite(ts) ? String(Math.trunc(ts)) : null;
}

function walletImageUrls({ apiBase, brand, template, instance }) {
  if (!apiBase) return {};
  const tplId = template?.id;
  const slug = brand?.slug;
  const urls = {};
  const templateQuery = tplId ? `?template_id=${encodeURIComponent(tplId)}` : '';
  if (slug && brandHasLogoAsset(brand, template)) {
    urls.logo = `${apiBase}/brands/by-slug/${encodeURIComponent(slug)}/logo${templateQuery}`;
  }
  if (slug && brandHasStripAsset(brand, template)) {
    urls.stripBrand = `${apiBase}/brands/by-slug/${encodeURIComponent(slug)}/strip`;
  }
  if (tplId) {
    if (template?.style?.images?.strip) {
      urls.stripTemplate = `${apiBase}/templates/${tplId}/wallet-image/strip`;
    }
    if (template?.style?.images?.thumbnail) {
      urls.thumbnail = `${apiBase}/templates/${tplId}/wallet-image/thumbnail`;
    }
    if (template?.style?.images?.background) {
      urls.background = `${apiBase}/templates/${tplId}/wallet-image/background`;
    }
  }
  const tplImages = template?.style?.images || {};
  if (instance?.id) {
    const stripVersion = resolveWalletImageVersion(instance);
    const versionSuffix = stripVersion
      ? `?v=${stripVersion}`
      : '';
    urls.strip = `${apiBase}/passes/${encodeURIComponent(instance.id)}/wallet-strip${versionSuffix}`;
    urls.logoIcon = `${apiBase}/passes/${encodeURIComponent(instance.id)}/wallet-icon.png${versionSuffix}`;
  } else {
    urls.strip = tplImages.strip && tplId ? urls.stripTemplate : urls.stripBrand;
  }
  return urls;
}

/**
 * Build unified employee_pass from DB rows.
 */
function buildEmployeePass({ brand, template, instance, member, brandConfig, apiBase, portalUrl = null, hubUrl = null, pgaUrl = null, meUrl = null, coinBalance = null }) {
  const cfg = brandConfig || brand?.config || {};
  const profile = resolveMemberProfile(member, instance);
  const colors = resolveEmployeePassColors(template, cfg);
  const images = walletImageUrls({ apiBase, brand, template, instance });
  const tplImages = template?.style?.images || {};

  // Front layout: strip promo + secondary NOME/AREA/COIN + Apple alert auxiliary field.
  const pushAnn = resolvePushAnnouncement(cfg, instance);
  const { headerHint, pushAlert } = mergePushAlertIntoHeaderHint(
    buildPushHeaderAlertField(resolvePassHeaderHint(template, cfg)),
    pushAnn
  );
  const secondary = [];
  if (profile.full_name) {
    secondary.push({ key: 'name', label: 'NOME', value: profile.full_name });
  }
  if (profile.department) {
    secondary.push({ key: 'area', label: 'AREA', value: String(profile.department).trim() });
  }
  secondary.push(buildCoinFieldValue(coinBalance));

  const auxiliary = [];

  const backSections = buildBackSections({
    brand,
    template,
    instance,
    member,
    brandConfig: cfg,
    portalUrl,
    hubUrl,
    apiBase
  });

  const primary = [];

  const barcodeValue = instance?.serial_number || '';

  return {
    member_id: member?.id || instance?.member_id || null,
    brand_id: brand?.id || null,
    pass_instance_id: instance?.id || null,
    serial_number: instance?.serial_number || null,
    brandName: brand?.name || '',
    headerHint,
    pushAlert,
    logoText: '',
    programName: (template?.name || brand?.name || '').slice(0, 64),
    templateName: template?.name || '',
    passType: EMPLOYEE_PASS_TYPE,
    profile,
    colors,
    images,
    hasTemplateImages: {
      strip: !!tplImages.strip,
      thumbnail: !!tplImages.thumbnail,
      background: !!tplImages.background,
      logo: !!tplImages.logo
    },
    front: { primary, secondary, auxiliary },
    backSections,
    barcode: { value: barcodeValue }
  };
}

function sectionsToAppleBackFields(sections) {
  const fields = [];
  for (const s of sections) {
    if (s.kind === 'alert') {
      const field = {
        key: s.key,
        label: String(s.label ?? ' ').slice(0, 64),
        value: String(s.body || '').slice(0, 500)
      };
      // Empty changeMessage (no %@) makes iOS fall back to the generic
      // "Carta punto vendita modificata" banner when the field changes.
      const cm = String(s.changeMessage || '').slice(0, 180);
      if (cm) field.changeMessage = cm;
      fields.push(field);
      continue;
    }
    if (s.kind === 'link') {
      if (s.doc) {
        const safeUrl = escapeHtml(s.url);
        fields.push({
          key: s.key,
          label: String(s.label).toUpperCase().slice(0, 64),
          value: s.url,
          attributedValue: `<a href="${safeUrl}">Apri documento</a>`
        });
      } else {
        fields.push(makeHrLinkField(s.key, s.label, s.url, s.linkText));
      }
      continue;
    }
    fields.push({
      key: s.key,
      label: String(s.label || '').toUpperCase().slice(0, 64),
      value: String(s.body || '').slice(0, 500)
    });
  }
  return fields;
}

function resolvePassHeaderHint(template, brandConfig) {
  const tplH = template?.fields?.headerFields?.[0];
  const brandH = brandConfig?.pass_header_hint;
  const label = String(tplH?.label ?? brandH?.label ?? '').trim();
  const value = String(tplH?.value ?? brandH?.value ?? '').trim();
  const key = String(tplH?.key ?? brandH?.key ?? '').trim();
  if (isCoinPassField(label, key)) return null;
  const normalizedLabel = label.toUpperCase();
  // Legacy push-notice label only — the decorative caption (es. "CLICCA SUI…")
  // is fine now that the notification rides on its own header field.
  if (normalizedLabel === 'INFO PUSH') return null;
  if (!label && !value) return null;
  return {
    key: 'info_hint',
    label: normalizedLabel.slice(0, 64),
    value: value.slice(0, 64),
    textAlignment: 'PKTextAlignmentRight'
  };
}

/** Apple Wallet — pass.json storeCard slice (employee pass layout). */
function toApplePass(employeePass) {
  const headerFields = [];
  if (employeePass.headerHint) headerFields.push(employeePass.headerHint);
  // Invisible alert carrier: header slot renders nothing but its value change
  // + changeMessage template drive the custom lock-screen banner.
  if (employeePass.pushAlert) headerFields.push(employeePass.pushAlert);
  const passStructure = {
    headerFields,
    primaryFields: employeePass.front.primary || [],
    secondaryFields: employeePass.front.secondary || [],
    auxiliaryFields: employeePass.front.auxiliary || []
  };
  if (employeePass.backSections?.length) {
    passStructure.backFields = sectionsToAppleBackFields(employeePass.backSections);
  }

  return {
    logoText: '',
    organizationName: employeePass.brandName,
    description: employeePass.templateName,
    foregroundColor: employeePass.colors.foregroundColor,
    backgroundColor: employeePass.colors.backgroundColor,
    labelColor: employeePass.colors.labelColor,
    passStructure,
    barcode: {
      format: 'PKBarcodeFormatQR',
      message: employeePass.barcode.value,
      messageEncoding: 'iso-8859-1'
    }
  };
}

function googleImageRef(uri, description) {
  if (!uri) return null;
  return {
    sourceUri: { uri },
    contentDescription: { defaultValue: { language: 'it', value: description || '' } }
  };
}

function buildGoogleFrontTextModules(employeePass, { passKind = 'generic' } = {}) {
  if (passKind === 'generic') {
    // Front content lives in cardTitle / header / subheader; promo text is on the strip image.
    return [];
  }
  const modules = [];
  if (employeePass.headerHint && (employeePass.headerHint.label || employeePass.headerHint.value)) {
    modules.push({
      id: 'header_hint',
      header: employeePass.headerHint.label || 'INFO',
      body: String(employeePass.headerHint.value || '').slice(0, 500)
    });
  }
  (employeePass.front.secondary || []).forEach((f, i) => {
    if (passKind === 'generic' && (f.key === 'name' || f.key === 'area')) return;
    modules.push({
      id: `front_sec_${i}`,
      header: f.label,
      body: String(f.value).slice(0, 500)
    });
  });
  (employeePass.front.auxiliary || []).forEach((f, i) => {
    if (f.key === 'push_notice' || f.key === 'announcement' || f.key === 'wallet_push_alert') return;
    modules.push({
      id: `front_aux_${i}`,
      header: f.label,
      body: String(f.value).slice(0, 500)
    });
  });
  return modules;
}

/** Google Wallet — generic/loyalty class + object fragments */
function toGooglePass(employeePass, { passKind = 'generic' } = {}) {
  const textModulesData = [];
  const linksModuleData = { uris: [] };

  employeePass.backSections.forEach((s, idx) => {
    if (s.kind === 'link') {
      linksModuleData.uris.push({
        id: s.key || `link_${idx}`,
        uri: s.url,
        description: String(s.linkText || s.label || '').slice(0, 100)
      });
    } else if (s.kind === 'support' && Array.isArray(s.contacts)) {
      s.contacts.forEach((contact, contactIdx) => {
        linksModuleData.uris.push({
          id: `${s.key || 'support'}_${contactIdx}`,
          uri: `mailto:${contact.email}`,
          description: String(contact.label || 'Support').slice(0, 100)
        });
      });
      textModulesData.push({
        id: s.key || `text_${idx}`,
        header: s.label,
        body: String(s.body).slice(0, 500)
      });
    } else if (s.body) {
      textModulesData.push({
        id: s.key || `text_${idx}`,
        header: s.label,
        body: String(s.body).slice(0, 500)
      });
    }
  });

  const classPatch = {};
  const classLogoUri = employeePass.images.logo;
  const objectLogoUri = employeePass.images.logoIcon || employeePass.images.logo;
  const stripUri = employeePass.images.strip;
  const thumbUri = employeePass.images.thumbnail;

  if (passKind === 'loyalty') {
    if (classLogoUri) classPatch.programLogo = googleImageRef(classLogoUri, employeePass.brandName);
    if (stripUri) classPatch.heroImage = googleImageRef(stripUri, 'Banner');
    classPatch.programName = (employeePass.brandName || employeePass.programName || 'Pass dipendente').slice(0, 64);
  } else {
    if (classLogoUri) classPatch.logo = googleImageRef(classLogoUri, employeePass.brandName);
    if (stripUri) classPatch.heroImage = googleImageRef(stripUri, 'Strip');
  }

  classPatch.hexBackgroundColor = employeePass.colors.hexBackgroundColor;
  if (passKind === 'loyalty' && !classLogoUri) {
    classPatch.programName = (employeePass.brandName || employeePass.programName || 'Pass dipendente').slice(0, 64);
  }

  const objectPatch = {
    hexBackgroundColor: employeePass.colors.hexBackgroundColor,
    barcode: {
      type: 'QR_CODE',
      value: employeePass.barcode.value
    },
    textModulesData: [...buildGoogleFrontTextModules(employeePass, { passKind }), ...textModulesData],
    linksModuleData
  };

  if (passKind === 'loyalty') {
    objectPatch.accountName = (employeePass.profile.full_name || 'Membro').slice(0, 64);
  } else {
    if (objectLogoUri) objectPatch.logo = googleImageRef(objectLogoUri, employeePass.brandName);
    if (stripUri) objectPatch.heroImage = googleImageRef(stripUri, 'Strip');

    const coinField = (employeePass.front.secondary || []).find((f) => {
      const label = String(f.label || '').toUpperCase();
      return f.key === 'coin' || label === 'COIN';
    });
    const areaValue = String(employeePass.profile.department || employeePass.programName || 'Pass dipendente').trim();
    const coinValue = coinField && coinField.value != null
      ? String(coinField.value).trim().slice(0, 32)
      : '';

    objectPatch.cardTitle = {
      defaultValue: {
        language: 'it',
        value: (employeePass.brandName || employeePass.programName || 'Pass dipendente').slice(0, 64)
      }
    };
    objectPatch.header = {
      defaultValue: { language: 'it', value: employeePass.profile.full_name || 'Membro' }
    };
    objectPatch.subheader = {
      defaultValue: {
        language: 'it',
        value: [areaValue, coinValue ? `${coinValue} COIN` : ''].filter(Boolean).join('\n').slice(0, 64)
      }
    };
    if (thumbUri && employeePass.hasTemplateImages.thumbnail) {
      objectPatch.mainImage = googleImageRef(thumbUri, 'Thumbnail');
    }
  }

  return { classPatch, objectPatch };
}

/** Samsung Wallet — loyalty card attributes (no dedicated thumbnail slot) */
function toSamsungPass(employeePass) {
  const contents = [];
  employeePass.backSections.forEach((s) => {
    if (s.kind === 'link') {
      contents.push({ title: s.label, content: s.url });
    } else if (s.kind === 'support') {
      contents.push({ title: s.label, content: s.body });
    } else if (s.body) {
      contents.push({ title: s.label, content: s.body });
    }
  });

  const links = employeePass.backSections.flatMap((s) => {
    if (s.kind === 'link') return [{ name: s.label, url: s.url }];
    if (s.kind === 'support' && Array.isArray(s.contacts)) {
      return s.contacts.map((c) => ({ name: c.label, url: `mailto:${c.email}` }));
    }
    return [];
  });

  const frontContents = [];
  (employeePass.front.secondary || []).forEach((f) => {
    frontContents.push({ title: f.label, content: f.value });
  });
  (employeePass.front.auxiliary || []).forEach((f) => {
    if (f.key === 'wallet_push_alert' || f.key === 'announcement') return;
    frontContents.push({ title: f.label, content: f.value });
  });

  return {
    title: (employeePass.profile.full_name || employeePass.brandName).slice(0, 64),
    cardSubTitle: 'Pass dipendente',
    providerName: employeePass.brandName.slice(0, 32),
    logoImage: employeePass.images.logo,
    bannerImage: employeePass.images.strip,
    bgColor: employeePass.colors.hexBackgroundColor,
    noticeDesc: [...frontContents, ...contents].length
      ? `<p>${[...frontContents, ...contents].map((c) => `${escapeHtml(c.title)}: ${escapeHtml(c.content)}`).join('<br>')}</p>`
      : `<p>${escapeHtml(employeePass.templateName)}</p>`,
    links,
    barcode: {
      type: 'qr',
      value: employeePass.barcode.value
    }
  };
}

function isHrEmployeePass(brand) {
  const line = String(brand?.config?.product_line || 'hr').toLowerCase();
  return line === 'hr';
}

module.exports = {
  EMPLOYEE_PASS_TYPE,
  APPLE_EMPLOYEE_PASS_STRUCTURE,
  HUB_EMPLOYEE_LINK_TEXT,
  HR_HUB_BACK_TITLE,
  HR_PORTAL_BACK_TITLE,
  buildEmployeePass,
  toApplePass,
  toGooglePass,
  toSamsungPass,
  isHrEmployeePass,
  resolveEmployeePassColors,
  walletImageUrls,
  buildBackSections,
  resolveHrBackSource,
  sectionsToAppleBackFields,
  resolveMemberProfile,
  resolveVariableLink,
  resolvePushAnnouncement,
  applyPushWalletAlertField: buildPushLockScreenBackSection,
  buildPushLockScreenBackSection,
  buildPushAnnouncementField,
  buildPushScreenAlertAuxField,
  buildPushAnnouncementAuxField,
  buildPushHeaderAlertField,
  buildPushHeaderField,
  buildPushWalletAlertField,
  escapeHtml
};

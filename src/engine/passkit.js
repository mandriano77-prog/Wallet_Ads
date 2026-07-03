const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const archiver = require('archiver');
const { Transform } = require('stream');
const {
  isHrPassBrand,
  resolveMemberProfile,
  resolveEmployeeIdForBarcode
} = require('./pass-hr-back');
const {
  buildEmployeePass,
  toApplePass,
  APPLE_EMPLOYEE_PASS_STRUCTURE,
  resolvePushAnnouncement
} = require('./employee-pass');
const {
  resolveWalletLogoRawBuffer,
  resolvePassIconBuffers,
  buildNotificationIconFromRaw,
  buildPassLogoBuffersFromRaw
} = require('./brand-wallet-logo');

const APPLE_WALLET_UPDATE_HINT = "Apri l'aggiornamento";

/**
 * Generate SVG path for a letter using geometric shapes (no font dependency).
 * Returns SVG elements string for the given letter, sized to fit within (w, h).
 */
function letterToSvgPaths(letter, x, y, w, h, fillColor) {
  const l = letter.toUpperCase();
  const t = Math.max(1, Math.round(w * 0.18)); // stroke thickness

  // Each letter is drawn with rect elements only
  switch (l) {
    case 'A': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.45)}" width="${w}" height="${t}" fill="${fillColor}"/>`;
    case 'B': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.45)}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${Math.round(h*0.5)}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y + Math.round(h*0.45)}" width="${t}" height="${Math.round(h*0.55)}" fill="${fillColor}"/>`;
    case 'C': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>`;
    case 'D': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${Math.round(w*0.7)}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${Math.round(w*0.7)}" height="${t}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y+t}" width="${t}" height="${h-t*2}" fill="${fillColor}"/>`;
    case 'E': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.45)}" width="${Math.round(w*0.7)}" height="${t}" fill="${fillColor}"/>`;
    case 'F': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.45)}" width="${Math.round(w*0.7)}" height="${t}" fill="${fillColor}"/>`;
    case 'G': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y + Math.round(h*0.45)}" width="${t}" height="${Math.round(h*0.55)}" fill="${fillColor}"/>
      <rect x="${x + Math.round(w*0.5)}" y="${y + Math.round(h*0.45)}" width="${Math.round(w*0.5)}" height="${t}" fill="${fillColor}"/>`;
    case 'H': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.45)}" width="${w}" height="${t}" fill="${fillColor}"/>`;
    case 'I': return `
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x + Math.round(w*0.5) - Math.round(t*0.5)}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>`;
    case 'J': return `
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.6)}" width="${t}" height="${Math.round(h*0.4)}" fill="${fillColor}"/>`;
    case 'K': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${Math.round(h*0.5)}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y + Math.round(h*0.45)}" width="${t}" height="${Math.round(h*0.55)}" fill="${fillColor}"/>
      <rect x="${x+t}" y="${y + Math.round(h*0.4)}" width="${w-t*2}" height="${t}" fill="${fillColor}"/>`;
    case 'L': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>`;
    case 'M': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x + Math.round(w*0.5) - Math.round(t*0.5)}" y="${y}" width="${t}" height="${Math.round(h*0.5)}" fill="${fillColor}"/>`;
    case 'N': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>`;
    case 'O': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>`;
    case 'P': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.45)}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${Math.round(h*0.5)}" fill="${fillColor}"/>`;
    case 'Q': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x + Math.round(w*0.6)}" y="${y + Math.round(h*0.6)}" width="${t}" height="${Math.round(h*0.4)}" fill="${fillColor}"/>`;
    case 'R': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.45)}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${Math.round(h*0.5)}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y + Math.round(h*0.45)}" width="${t}" height="${Math.round(h*0.55)}" fill="${fillColor}"/>`;
    case 'S': return `
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y}" width="${t}" height="${Math.round(h*0.5)}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.45)}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y + Math.round(h*0.45)}" width="${t}" height="${Math.round(h*0.55)}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>`;
    case 'T': return `
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x + Math.round(w*0.5) - Math.round(t*0.5)}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>`;
    case 'U': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>`;
    case 'V': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x + Math.round(w*0.5) - Math.round(t*0.5)}" y="${y+h-t}" width="${t}" height="${t}" fill="${fillColor}"/>`;
    case 'W': return `
      <rect x="${x}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${h}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x + Math.round(w*0.5) - Math.round(t*0.5)}" y="${y + Math.round(h*0.5)}" width="${t}" height="${Math.round(h*0.5)}" fill="${fillColor}"/>`;
    case 'X': return `
      <rect x="${x}" y="${y}" width="${t}" height="${Math.round(h*0.45)}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${Math.round(h*0.45)}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.4)}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.5)}" width="${t}" height="${Math.round(h*0.5)}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y + Math.round(h*0.5)}" width="${t}" height="${Math.round(h*0.5)}" fill="${fillColor}"/>`;
    case 'Y': return `
      <rect x="${x}" y="${y}" width="${t}" height="${Math.round(h*0.5)}" fill="${fillColor}"/>
      <rect x="${x+w-t}" y="${y}" width="${t}" height="${Math.round(h*0.5)}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.45)}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x + Math.round(w*0.5) - Math.round(t*0.5)}" y="${y + Math.round(h*0.45)}" width="${t}" height="${Math.round(h*0.55)}" fill="${fillColor}"/>`;
    case 'Z': return `
      <rect x="${x}" y="${y}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y+h-t}" width="${w}" height="${t}" fill="${fillColor}"/>
      <rect x="${x}" y="${y + Math.round(h*0.4)}" width="${w}" height="${t}" fill="${fillColor}"/>`;
    default: // fallback: simple block
      return `<rect x="${x+Math.round(w*0.2)}" y="${y+Math.round(h*0.2)}" width="${Math.round(w*0.6)}" height="${Math.round(h*0.6)}" rx="${Math.round(w*0.1)}" fill="${fillColor}" opacity="0.6"/>`;
  }
}

/**
 * Parse hex color string to {r, g, b} object
 * Supports #RGB, #RRGGBB, and rgb(r,g,b) formats
 */
function parseColor(color) {
  // Handle rgb(r,g,b) format
  const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    return { r: parseInt(rgbMatch[1]), g: parseInt(rgbMatch[2]), b: parseInt(rgbMatch[3]) };
  }
  // Handle hex format
  let hex = color.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  return {
    r: parseInt(hex.substring(0, 2), 16),
    g: parseInt(hex.substring(2, 4), 16),
    b: parseInt(hex.substring(4, 6), 16)
  };
}

/** Legacy Ads2Wallet accent greens/teals — not part of Filo/HR palette. */
function isLegacyGreenPassAccent(color) {
  if (!color) return false;
  const normalized = String(color).trim().toLowerCase().replace(/\s/g, '');
  const legacy = [
    '#00d4aa', '#00d4a9', '#3cdfff', '#d4e600',
    'rgb(0,212,170)', 'rgb(0,212,169)', 'rgb(60,223,255)', 'rgb(212,230,0)'
  ];
  if (legacy.includes(normalized)) return true;
  const c = parseColor(color);
  // Teal/cyan (#00D4AA has b≈170 — old check missed it)
  if (c.g > 150 && c.r < 100 && c.b >= 100 && c.b <= 220) return true;
  // Lime
  if (c.r > 180 && c.g > 200 && c.b < 100) return true;
  return false;
}

/** Pass text colors — brand/template with HR (Filo) defaults. */
function resolvePassColors(template, brandConfig) {
  const line = String(brandConfig.product_line || '').toLowerCase();
  const hrLabelDefault = '#A78BFA';
  const hrFgDefault = '#FFFFFF';

  const fgHex = brandConfig.foregroundColor || null;
  const defaultForeground = template.style?.foregroundColor || hrFgDefault;
  let foregroundColor = fgHex && !isLegacyGreenPassAccent(fgHex)
    ? colorToRgbString(fgHex)
    : (isLegacyGreenPassAccent(defaultForeground) ? hrFgDefault : colorToRgbString(defaultForeground) || hrFgDefault);
  if (line === 'hr') foregroundColor = colorToRgbString(hrFgDefault);

  const bgHex = brandConfig.backgroundColor || null;
  const backgroundColor = bgHex
    ? colorToRgbString(bgHex)
    : (template.style?.backgroundColor ? colorToRgbString(template.style.backgroundColor) : 'rgb(13, 11, 26)');

  const lblHex = brandConfig.labelColor || null;
  const tplLbl = template.style?.labelColor || null;
  const labelCandidate = lblHex || tplLbl;
  let labelColor = foregroundColor;
  if (line === 'hr') {
    labelColor = colorToRgbString(
      labelCandidate && !isLegacyGreenPassAccent(labelCandidate) ? labelCandidate : hrLabelDefault
    );
  } else if (labelCandidate && !isLegacyGreenPassAccent(labelCandidate)) {
    labelColor = colorToRgbString(labelCandidate);
  }
  return { foregroundColor, backgroundColor, labelColor };
}

function colorToRgbString(color) {
  if (!color) return null;
  if (String(color).trim().toLowerCase().startsWith('rgb')) return String(color).trim();
  const c = parseColor(color);
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

/** Map template back-field keys to link slot index 0..2 (Link 1–3). */
function backFieldLinkSlotIndex(key) {
  const k = String(key || '').toLowerCase();
  if (k === 'link1' || k === 'link_0' || k === 'link0') return 0;
  if (k === 'link2' || k === 'link_1') return 1;
  if (k === 'link3' || k === 'link_2') return 2;
  return -1;
}

const TEMPLATE_LINK_FIELD_KEYS = new Set(['link1', 'link2', 'link3', 'link_0', 'link_1', 'link_2', 'link0']);

function parsePassFieldValues(instance) {
  const raw = instance?.field_values;
  if (!raw) return {};
  if (typeof raw === 'object') return { ...raw };
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolvePassHolderName(instance, fv) {
  const fromIt = [fv.nome || fv.name, fv.cognome || fv.surname].filter(Boolean).join(' ').trim();
  if (fromIt) return fromIt;
  if (fv.display_name) return String(fv.display_name).trim();
  if (fv.full_name) return String(fv.full_name).trim();
  const fromEn = [fv.first_name, fv.last_name].filter(Boolean).join(' ').trim();
  if (fromEn) return fromEn;
  const cd = instance?.customer_data;
  if (cd && typeof cd === 'object' && cd.name) return String(cd.name).trim();
  if (typeof cd === 'string') {
    try {
      const parsed = JSON.parse(cd);
      if (parsed?.name) return String(parsed.name).trim();
    } catch { /* ignore */ }
  }
  return 'Membro';
}

function resolvePassMatricola(instance, fv) {
  const m = fv.matricola || fv.badge_id;
  if (m != null && String(m).trim()) return String(m).trim();
  return instance?.id || '';
}

/** QR identificativo — codifica serialNumber, altText nome · #matricola (placeholder badge). */
function buildIdentifyingQrBarcode(instance, memberRow = null) {
  const profile = resolveMemberProfile(memberRow, instance);
  const name = profile.full_name || resolvePassHolderName(instance, parsePassFieldValues(instance));
  const employeeId = resolveEmployeeIdForBarcode(memberRow, instance);
  return {
    format: 'PKBarcodeFormatQR',
    message: instance.serial_number || '',
    messageEncoding: 'iso-8859-1',
    altText: `${name} · #${employeeId}`.slice(0, 64)
  };
}

/**
 * Always three slots — empty middle links must not shift Link 3 into Link 2 position.
 */
function resolveTemplateLinkSlots(tplFields) {
  const slots = [
    { label: '', url: '' },
    { label: '', url: '' },
    { label: '', url: '' }
  ];
  if (!tplFields) return slots;

  const put = (idx, label, url) => {
    if (idx < 0 || idx > 2) return;
    const l = label != null ? String(label).trim() : '';
    const u = url != null ? String(url).trim() : '';
    if (!l && !u) return;
    slots[idx] = { label: l, url: u };
  };

  if (!Array.isArray(tplFields) && Array.isArray(tplFields.links)) {
    tplFields.links.forEach((link, i) => {
      if (i > 2 || !link) return;
      put(i, link.label, link.url);
    });
    return slots;
  }

  if (!Array.isArray(tplFields) && Array.isArray(tplFields.backFields)) {
    tplFields.backFields.forEach((bf) => {
      const idx = backFieldLinkSlotIndex(bf.key);
      if (idx >= 0) put(idx, bf.label, bf.value || bf.url);
    });
    return slots;
  }

  if (Array.isArray(tplFields)) {
    tplFields.forEach((field) => {
      if (field.type !== 'back') return;
      const idx = backFieldLinkSlotIndex(field.key);
      if (idx >= 0) put(idx, field.label, field.value);
    });
  }
  return slots;
}

function mergePassLocationSources(brandLocations, hubLocations) {
  const { mergeGeofenceLocationSources } = require('./geofencing');
  return mergeGeofenceLocationSources(brandLocations, hubLocations);
}

function normalizePassLocations(brandConfig) {
  const { normalizePassLocations: normalize } = require('./geofencing');
  return normalize(brandConfig);
}

/**
 * Generate the pass.json content for Apple Wallet
 */
function generatePassJson(template, instance, brand, options = {}) {
  const {
    baseUrl = 'http://localhost:3000',
    passTypeIdentifier = process.env.PASS_TYPE_IDENTIFIER || `pass.com.nudj.${brand.slug}`,
    teamIdentifier = process.env.TEAM_IDENTIFIER || 'XXXXXXXXXX',
    portalUrl = null,
    hubUrl = null,
    pgaUrl = null,
    meUrl = null,
    coinBalance = null,
    member = null,
    hubLocations = null
  } = options;

  // Read colors from brand.config first, then template.style, then defaults
  const brandConfig = { ...(brand.config || {}) };
  if (hubLocations && hubLocations.length) {
    // HUB Convenzioni: active merchant_locations merged into pass.json locations[] for native
    // iOS geofencing (lock-screen pass surfacing). Optional APNs cron fallback in scheduler.js
    // is deferred for v1 — Apple Wallet handles entry detection when locations[] is present.
    brandConfig.locations = mergePassLocationSources(brandConfig.locations, hubLocations);
  }
  const { foregroundColor, backgroundColor, labelColor } = resolvePassColors(template, brandConfig);

  // ── Build field arrays ──────────────────────────────────────────
  // Layout (storeCard): Header → Strip → Secondary → Auxiliary → Back
  const headerFields = [];
  const secondaryFields = [];
  const auxiliaryFields = [];
  const backFields = [];

  // No primaryFields — they overlay the strip image on storeCard
  const primaryFields = [];

  // FIELDS from template — supports both legacy array and new object format
  const tplFields = template.fields || {};
  let hasTemplateHeader = false;
  if (Array.isArray(tplFields)) {
    // Legacy array format: [{key, label, value, type}]
    tplFields.forEach((field) => {
      const fieldObj = {
        key: field.key,
        label: (field.label || field.key).toUpperCase(),
        value: instance.field_values?.[field.key] || field.value || ''
      };
      if (field.dateStyle) fieldObj.dateStyle = field.dateStyle;
      if (field.type === 'secondary') secondaryFields.push(fieldObj);
      else if (field.type === 'auxiliary') auxiliaryFields.push(fieldObj);
      else if (field.type === 'back') backFields.push(fieldObj);
    });
  } else {
    // New object format: {headerFields, secondaryFields, auxiliaryFields, links, regolamento, contatti}
    if (tplFields.headerFields) {
      tplFields.headerFields.forEach(f => {
        if (f.label || f.value) { hasTemplateHeader = true; headerFields.push({ key: f.key || 'header_info', label: (f.label || '').toUpperCase(), value: f.value || '' }); }
      });
    }
    if (tplFields.secondaryFields) {
      tplFields.secondaryFields.forEach(f => {
        if (f.label || f.value) secondaryFields.push({ key: f.key || 'sec_info', label: (f.label || '').toUpperCase(), value: instance.field_values?.[f.key] || f.value || '' });
      });
    }
    if (tplFields.auxiliaryFields) {
      tplFields.auxiliaryFields.forEach(f => {
        if (f.label || f.value) auxiliaryFields.push({ key: f.key || 'aux_info', label: (f.label || '').toUpperCase(), value: instance.field_values?.[f.key] || f.value || '' });
      });
    }
  }

  // Geofence proximity text belongs to pass.json locations[].relevantText.
  // Do not mirror it onto the visible front fields: location relevance and pass copy
  // must stay independent, otherwise POI copy changes the HR layout.
  const GEO_AUX_KEY = 'geo_inzone_promo';
  const staleGeoField = auxiliaryFields.findIndex((f) => f.key === GEO_AUX_KEY);
  if (staleGeoField >= 0) auxiliaryFields.splice(staleGeoField, 1);

  // Optional brand-level header hint when template has none configured
  if (!hasTemplateHeader) {
    const brandHint = brandConfig.pass_header_hint || {};
    const hintLabel = String(brandHint.label || '').trim();
    const hintValue = String(brandHint.value || '').trim();
    if (hintLabel || hintValue) {
      hasTemplateHeader = true;
      headerFields.push({
        key: 'info_hint',
        label: hintLabel.toUpperCase().slice(0, 64),
        value: hintValue.slice(0, 64),
        textAlignment: 'PKTextAlignmentRight'
      });
    }
  }

  // AUXILIARY: Promo teaser on pass front — changeMessage triggers lock screen notification
  // IMPORTANT: only FRONT fields (header/primary/secondary/auxiliary) trigger lock screen
  // notifications. Back fields update silently. The value MUST change each push.
  if (brandConfig.pushAnnouncement && brandConfig.pushAnnouncement.message) {
    const pushTs = brandConfig.pushAnnouncement.ts || Date.now();
    // Invisible zero-width spaces make value unique without visible artifacts
    const zwsp = '​'.repeat((pushTs % 10) + 1);
    auxiliaryFields.push({
      key: 'announcement',
      label: 'INFO',
      value: APPLE_WALLET_UPDATE_HINT + zwsp,
      changeMessage: '%@'
    });
  }

  // ── BACK FIELDS (order: Novità → Link 1 → Regolamento → Link 2 → Link 3 → Contatti) ──

  function wrapTrackableBackLinkUrl(key, label, destinationUrl) {
    if (!destinationUrl || !instance.serial_number) return destinationUrl;
    if (/^(mailto:|tel:|javascript:)/i.test(destinationUrl)) return destinationUrl;
    if (String(destinationUrl).includes('/track/pass-link')) return destinationUrl;
    try {
      const tracked = new URL(`${baseUrl}/api/track/pass-link`);
      tracked.searchParams.set('sn', instance.serial_number);
      tracked.searchParams.set('key', key);
      tracked.searchParams.set('to', destinationUrl);
      if (label) tracked.searchParams.set('label', label);
      return tracked.toString();
    } catch (_) {
      return destinationUrl;
    }
  }

  function makeBackLinkField(key, label, url) {
    const trackedUrl = url ? wrapTrackableBackLinkUrl(key, label, url) : null;
    const field = {
      key,
      label: '',
      value: label || url || ''
    };
    if (trackedUrl) {
      field.attributedValue = `<a href="${trackedUrl}">${label || url}</a>`;
    }
    return field;
  }

  function resolveBackLink1(brandCfg, serialNumber) {
    const pushOut = brandCfg.pushLinkOut;
    if (pushOut?.url) {
      return makeBackLinkField('link_0', pushOut.label || 'Scopri di più', pushOut.url);
    }
    if (brandCfg.instantWinActive && serialNumber) {
      const playUrl = `${baseUrl}/play/${serialNumber}`;
      const iwLabel = brandCfg.instantWinActive.label || 'Gioca e Vinci!';
      return makeBackLinkField('link_0', iwLabel, playUrl);
    }
    if (brandCfg.gamificationActive && serialNumber) {
      const gameTypeRoutes = { quiz: 'quiz', memory: 'memory', puzzle: 'puzzle' };
      const gameRoute = gameTypeRoutes[brandCfg.gamificationActive.game_type] || 'quiz';
      const gameUrl = `${baseUrl}/game/${gameRoute}/${serialNumber}`;
      const gamLabel = brandCfg.gamificationActive.label || 'Gioca ora!';
      return makeBackLinkField('link_0', gamLabel, gameUrl);
    }
    return null;
  }

  const orderedBackFields = [];
  const useHrBack = isHrPassBrand(brand);

  if (!useHrBack && brandConfig.pushAnnouncement && brandConfig.pushAnnouncement.message) {
    orderedBackFields.push({
      key: 'announcement_full',
      label: brandConfig.pushAnnouncement.title || 'NOVITÀ E PROMOZIONI',
      value: brandConfig.pushAnnouncement.message
    });
  }

  if (!useHrBack) {
  const linkSlots = resolveTemplateLinkSlots(tplFields);
  const link1 = resolveBackLink1(brandConfig, instance.serial_number)
    || (linkSlots[0].label || linkSlots[0].url
      ? makeBackLinkField('link_0', linkSlots[0].label, linkSlots[0].url)
      : null);
  if (link1) orderedBackFields.push(link1);

  // 3. REGOLAMENTO — from brand backContent OR template fields
  const backContent = brandConfig.backContent || {};
  const tplRegolamento = (!Array.isArray(tplFields) && tplFields.regolamento) || '';
  const regolamento = backContent.regolamento || tplRegolamento;
  if (regolamento) {
    orderedBackFields.push({
      key: 'regolamento',
      label: '',
      value: regolamento
    });
  }

  [1, 2].forEach((idx) => {
    const link = linkSlots[idx];
    if (!link.label && !link.url) return;
    orderedBackFields.push(makeBackLinkField(`link_${idx}`, link.label, link.url));
  });

  // 4. CONTATTI — from brand backContent OR template fields
  const tplContatti = (!Array.isArray(tplFields) && tplFields.contatti) || '';
  const contatti = backContent.contatti || tplContatti;
  if (contatti) {
    orderedBackFields.push({
      key: 'contatti',
      label: '',
      value: contatti
    });
  }

  if (portalUrl) {
    orderedBackFields.push(makeBackLinkField('portal_link', 'Il mio profilo', portalUrl));
  }

  if (hubUrl) {
    orderedBackFields.push(makeBackLinkField('hub_convenzioni', 'HUB CONVENZIONI', hubUrl));
  }

  // 5. Any remaining template back fields (fallback)
  backFields.forEach(f => {
    // Skip if already covered by backContent or link slots
    if (f.key === 'regolamento' && backContent.regolamento) return;
    if (f.key === 'contatti' && backContent.contatti) return;
    if (f.key === 'portal_link' && portalUrl) return;
    if (TEMPLATE_LINK_FIELD_KEYS.has(String(f.key || '').toLowerCase())) return;
    orderedBackFields.push(f);
  });
  }

  // ── Pass structure ────────────────────────────────────────────
  const structureKey = useHrBack
    ? APPLE_EMPLOYEE_PASS_STRUCTURE
    : (template.pass_type || 'storeCard');
  let passStructure = {};
  let barcodePayload = buildIdentifyingQrBarcode(instance, member);
  let passForegroundColor = foregroundColor;
  let passBackgroundColor = backgroundColor;
  let passLabelColor = labelColor;
  let passLogoText = brand.name;
  let omitLogoText = false;

  if (useHrBack) {
    const apiBase = `${String(baseUrl).replace(/\/+$/, '')}/api/v1`;
    const employeePass = buildEmployeePass({
      brand,
      template,
      instance,
      member,
      brandConfig,
      apiBase,
      portalUrl,
      hubUrl,
      pgaUrl,
      meUrl,
      coinBalance
    });
    const apple = toApplePass(employeePass);
    passStructure = apple.passStructure;
    passForegroundColor = apple.foregroundColor;
    passBackgroundColor = apple.backgroundColor;
    passLabelColor = apple.labelColor;
    passLogoText = apple.logoText;
    omitLogoText = !passLogoText;
    barcodePayload = apple.barcode;
  } else {
    if (headerFields.length > 0) passStructure.headerFields = headerFields;
    if (primaryFields.length > 0) passStructure.primaryFields = primaryFields;
    if (secondaryFields.length > 0) passStructure.secondaryFields = secondaryFields;
    if (auxiliaryFields.length > 0) passStructure.auxiliaryFields = auxiliaryFields;
    if (orderedBackFields.length > 0) passStructure.backFields = orderedBackFields;
  }

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier,
    serialNumber: instance.serial_number,
    teamIdentifier,
    organizationName: brand.name,
    description: template.name,
    foregroundColor: passForegroundColor,
    backgroundColor: passBackgroundColor,
    labelColor: passLabelColor,
    authenticationToken: instance.auth_token,
    webServiceURL: `${baseUrl}/api`,
    [structureKey]: passStructure,
    barcodes: [barcodePayload],
    barcode: barcodePayload
  };
  if (!omitLogoText && passLogoText) {
    passJson.logoText = passLogoText;
  }

  // Geofencing — iOS shows the pass on lock screen when inside maxDistance (m) of any location.
  // Sticky / repeated appearance while stationary is normal iOS behavior inside the zone, not APNs.
  const normalizedLocs = normalizePassLocations(brandConfig);
  if (normalizedLocs.length > 0) {
    passJson.locations = normalizedLocs;
  }

  // HR lock-screen copy: changed front announcement field with changeMessage (see employee-pass.js).
  // relevantDate triggers Apple's generic "store card modified" notification in Italian.
  if (brandConfig.relevantDate && !useHrBack) {
    passJson.relevantDate = brandConfig.relevantDate;
  }

  // maxDistance (m): explicit brand maxDistance, else largest POI radius, else 500.
  const { resolveEffectiveMaxDistanceM } = require('./geofencing');
  const maxDistanceM = resolveEffectiveMaxDistanceM(brandConfig);
  if (normalizedLocs.length > 0) {
    passJson.maxDistance = maxDistanceM;
  }

  const iconRev = Number(brandConfig.wallet_icon_rev) || 0;
  if (iconRev > 0) {
    passJson.userInfo = { ...(passJson.userInfo || {}), walletIconRev: iconRev };
  }

  return passJson;
}

/**
 * Generate icon PNG files with brand initial (geometric paths, no font needed)
 */
async function generateIcon(brandName, bgColor = '#0D0B1A', fgColor = '#FFFFFF') {
  const initial = brandName.charAt(0).toUpperCase();
  const bg = parseColor(bgColor);

  // 29x29 icon — letter drawn with geometric rects
  const letter29 = letterToSvgPaths(initial, 7, 6, 15, 17, fgColor);
  const icon29 = await sharp(Buffer.from(
    `<svg width="29" height="29" xmlns="http://www.w3.org/2000/svg">
      <rect width="29" height="29" fill="${bgColor}"/>${letter29}
    </svg>`
  )).png().toBuffer();

  // 58x58 icon (2x)
  const letter58 = letterToSvgPaths(initial, 14, 12, 30, 34, fgColor);
  const icon58 = await sharp(Buffer.from(
    `<svg width="58" height="58" xmlns="http://www.w3.org/2000/svg">
      <rect width="58" height="58" fill="${bgColor}"/>${letter58}
    </svg>`
  )).png().toBuffer();

  return { icon: icon29, icon2x: icon58 };
}

/**
 * Generate logo PNG files — shows brand initial in a rounded badge.
 * The full brand name is displayed via logoText in pass.json.
 * Uses geometric SVG paths — NO font/text dependency.
 */
async function generateLogo(brandName, bgColor = '#0D0B1A', fgColor = '#FFFFFF') {
  const initial = brandName.charAt(0).toUpperCase();

  // 160x50 logo — initial letter in a rounded rect badge, aligned LEFT
  const letter160 = letterToSvgPaths(initial, 16, 10, 20, 30, fgColor);
  const logo160 = await sharp(Buffer.from(
    `<svg width="160" height="50" xmlns="http://www.w3.org/2000/svg">
      <rect width="160" height="50" fill="${bgColor}"/>
      <rect x="6" y="3" width="44" height="44" rx="10" fill="${fgColor}" opacity="0.15"/>${letter160}
    </svg>`
  )).png().toBuffer();

  // 320x100 logo (2x) — aligned LEFT
  const letter320 = letterToSvgPaths(initial, 32, 20, 40, 60, fgColor);
  const logo320 = await sharp(Buffer.from(
    `<svg width="320" height="100" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="100" fill="${bgColor}"/>
      <rect x="12" y="6" width="88" height="88" rx="20" fill="${fgColor}" opacity="0.15"/>${letter320}
    </svg>`
  )).png().toBuffer();

  return { logo: logo160, logo2x: logo320 };
}

/**
 * Generate strip image (for coupon/storeCard) — geometric initial, no font
 */
async function generateStrip(brandName, bgColor = '#0D0B1A', fgColor = '#FFFFFF') {
  const initial = brandName.charAt(0).toUpperCase();

  // 375x123 strip — large initial centered, clean background (no decorative rect)
  const letter375 = letterToSvgPaths(initial, 162, 22, 50, 80, fgColor);
  const strip375 = await sharp(Buffer.from(
    `<svg width="375" height="123" xmlns="http://www.w3.org/2000/svg">
      <rect width="375" height="123" fill="${bgColor}"/>${letter375}
    </svg>`
  )).png().toBuffer();

  // 750x246 strip (2x)
  const letter750 = letterToSvgPaths(initial, 325, 43, 100, 160, fgColor);
  const strip750 = await sharp(Buffer.from(
    `<svg width="750" height="246" xmlns="http://www.w3.org/2000/svg">
      <rect width="750" height="246" fill="${bgColor}"/>${letter750}
    </svg>`
  )).png().toBuffer();

  return { strip: strip375, strip2x: strip750 };
}

function escapeStripSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Sharp/librsvg on Linux cannot render emoji in SVG text — strip them for strip overlay only. */
function sanitizeStripSvgText(value) {
  return String(value || '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u200d\uFE0F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateStripOverlayTitle(text, maxChars) {
  const t = String(text || '').trim().toUpperCase();
  if (!t) return '';
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(1, maxChars - 1))}…`;
}

const {
  PUSH_TITLE_MAX: STRIP_OVERLAY_TITLE_MAX_1X,
  PUSH_MESSAGE_LINE_MAX: STRIP_OVERLAY_MSG_MAX_1X,
  PUSH_MESSAGE_LINES: STRIP_OVERLAY_MSG_LINES,
} = require('./push-text-limits');

function stripOverlayLimitsForWidth(width) {
  const scale = width >= 750 ? 2 : 1;
  return {
    titleMax: STRIP_OVERLAY_TITLE_MAX_1X * scale,
    msgMax: STRIP_OVERLAY_MSG_MAX_1X * scale,
    msgLines: STRIP_OVERLAY_MSG_LINES
  };
}

/** Truncate push copy to safe strip overlay limits (server + preview). */
function normalizePushAnnouncementForStrip(announcement) {
  if (!announcement?.message) return null;
  const title = truncateStripOverlayTitle(announcement.title, STRIP_OVERLAY_TITLE_MAX_1X);
  const message = sanitizeStripSvgText(announcement.message).slice(0, STRIP_OVERLAY_MSG_MAX_1X * STRIP_OVERLAY_MSG_LINES).trim();
  if (!message) return null;
  return {
    title,
    message,
    ts: Number(announcement.ts || Date.now())
  };
}

async function sampleStripTextLuminance(stripBuffer, width, height, sampleArea = null) {
  const fallback = 72;
  const area = sampleArea || {
    left: 0,
    top: Math.max(0, Math.round(height * 0.45)),
    width,
    height: Math.max(1, Math.round(height * 0.55))
  };
  try {
    const left = Math.max(0, Math.min(width - 1, Math.round(area.left)));
    const top = Math.max(0, Math.min(height - 1, Math.round(area.top)));
    const extractWidth = Math.max(1, Math.min(width - left, Math.round(area.width)));
    const extractHeight = Math.max(1, Math.min(height - top, Math.round(area.height)));
    const stats = await sharp(stripBuffer)
      .extract({ left, top, width: extractWidth, height: extractHeight })
      .stats();
    const r = stats.channels[0]?.mean ?? 128;
    const g = stats.channels[1]?.mean ?? 128;
    const b = stats.channels[2]?.mean ?? 128;
    return 0.299 * r + 0.587 * g + 0.114 * b;
  } catch {
    return fallback;
  }
}

function wrapStripOverlayLines(text, maxChars, maxLines, { ellipsis = true } = {}) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let line = '';
  for (const word of words) {
    let w = word;
    if (w.length > maxChars) w = ellipsis ? `${w.slice(0, Math.max(1, maxChars - 1))}…` : w.slice(0, maxChars);
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate.length > maxChars
        ? (ellipsis ? `${candidate.slice(0, Math.max(1, maxChars - 1))}…` : candidate.slice(0, maxChars))
        : candidate;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (ellipsis && lines.length === maxLines) {
    const consumed = lines.join(' ').split(/\s+/).length;
    if (words.length > consumed) {
      const last = lines[lines.length - 1];
      lines[lines.length - 1] = last.length > maxChars - 1 ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
    }
  }
  return lines;
}

/** Load HR strip buffers (1x/2x) — same precedence as createPkpass. */
async function loadHrStripBuffers({ brand, template, stripOverrideBase64 = null }) {
  const brandCfg = brand?.config || {};
  const tplImages = template?.style?.images || {};
  const bgColor = brandCfg.backgroundColor || template?.style?.backgroundColor || '#0D0B1A';
  const fgColor = brandCfg.foregroundColor || template?.style?.foregroundColor || '#FFFFFF';
  const defaultStripPath = path.join(__dirname, '..', '..', 'public', 'assets', 'default-strip.png');

  async function resizeStrip(rawStrip) {
    const strip1x = await sharp(rawStrip).resize(375, 123, { fit: 'cover' }).png().toBuffer();
    const strip2x = await sharp(rawStrip).resize(750, 246, { fit: 'cover' }).png().toBuffer();
    return { strip: strip1x, strip2x };
  }

  if (stripOverrideBase64) {
    return resizeStrip(Buffer.from(stripOverrideBase64, 'base64'));
  }
  if (tplImages.strip) {
    return resizeStrip(Buffer.from(tplImages.strip, 'base64'));
  }
  if (brandCfg.logos?.strip) {
    return resizeStrip(Buffer.from(brandCfg.logos.strip, 'base64'));
  }
  if (fs.existsSync(defaultStripPath)) {
    return resizeStrip(fs.readFileSync(defaultStripPath));
  }
  return generateStrip(brand?.name || 'Brand', bgColor, fgColor);
}

function stripOverlayTextMaxWidth(width, reserveThumbnail = false) {
  const scale = width / 375;
  const pad = Math.round(18 * scale);
  const rightSafety = Math.round(20 * scale);
  const safeWidth = Math.max(Math.round(180 * scale), width - pad * 2 - rightSafety);
  if (!reserveThumbnail) return safeWidth;
  const thumbPad = Math.max(10, Math.round(width * 0.035));
  const rightInset = Math.max(30, Math.round(width * 0.085));
  const thumbW = Math.min(Math.round(width * 0.19), width - thumbPad * 4);
  const thumbLeft = Math.max(thumbPad, width - thumbW - rightInset);
  return Math.min(safeWidth, Math.max(Math.round(96 * scale), thumbLeft - pad - Math.round(8 * scale)));
}

function stripVisualCharsPerLine(maxTextWidth, fontSize) {
  return Math.max(8, Math.floor(maxTextWidth / Math.max(5, fontSize * 0.64)));
}

async function generateCoverThumbnailBuffers(backgroundColor) {
  const bg = parseColor(backgroundColor || '#0D0B1A');
  const background = { r: bg.r, g: bg.g, b: bg.b, alpha: 1 };
  const create = (size) => sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  }).png().toBuffer();
  return {
    thumb: await create(90),
    thumb2x: await create(180),
    thumb3x: await create(270),
  };
}

/** HR push promo — title + message burned into strip (not auxiliary pillar). */
async function composePushTextOnStrip(stripBuffer, announcement, width, height, options = {}) {
  const normalized = normalizePushAnnouncementForStrip(announcement);
  if (!normalized?.message || !stripBuffer) return stripBuffer;

  const scale = width / 375;
  const pad = Math.round(18 * scale);
  const reserveThumbnail = Boolean(options.reserveThumbnail);
  const maxTextWidth = stripOverlayTextMaxWidth(width, reserveThumbnail);
  const { titleMax, msgMax, msgLines: maxLines } = stripOverlayLimitsForWidth(width);
  const titleBase = sanitizeStripSvgText(normalized.title);
  const messageBase = sanitizeStripSvgText(normalized.message);

  let layout = null;
  const sizeSteps = [
    { title: 13, msg: 11, line: 13 },
    { title: 12, msg: 10, line: 12 },
    { title: 11, msg: 9, line: 11 },
    { title: 10, msg: 8, line: 10 },
  ];
  for (const step of sizeSteps) {
    const titleSize = Math.round(step.title * scale);
    const msgSize = Math.round(step.msg * scale);
    const lineH = Math.round(step.line * scale);
    const visualTitleMax = Math.min(titleMax, stripVisualCharsPerLine(maxTextWidth, titleSize));
    const visualMsgMax = Math.min(msgMax, stripVisualCharsPerLine(maxTextWidth, msgSize));
    const title = truncateStripOverlayTitle(titleBase, visualTitleMax);
    const msgLines = wrapStripOverlayLines(messageBase, visualMsgMax, maxLines, { ellipsis: false })
      .map((line) => sanitizeStripSvgText(line))
      .filter(Boolean);
    const rendered = msgLines.join(' ').trim();
    layout = { title, msgLines, titleSize, msgSize, lineH };
    if (rendered.length >= messageBase.length || step === sizeSteps[sizeSteps.length - 1]) break;
  }

  const { title, msgLines, titleSize, msgSize, lineH } = layout || {};
  if (!title && !msgLines.length) return stripBuffer;

  const titleBlockH = title ? Math.round(15 * scale) : 0;
  const msgBlockH = msgLines.length * lineH;
  const barPad = Math.round(8 * scale);
  const barGap = title && msgLines.length ? Math.round(2 * scale) : 0;
  let barH = barPad * 2 + titleBlockH + barGap + msgBlockH;
  let barY = height - barH;
  if (barY < 0) {
    barH = height;
    barY = 0;
  }

  const lum = await sampleStripTextLuminance(stripBuffer, width, height, {
    left: pad,
    top: Math.max(0, barY),
    width: maxTextWidth,
    height: Math.min(height, barH)
  });
  const lightArea = lum >= 150;
  const titleFill = lightArea ? '#111827' : '#FFFFFF';
  const msgFill = lightArea ? '#1F2937' : '#FFFFFF';
  const shadowColor = lightArea ? '#FFFFFF' : '#000000';
  const shadowOpacity = lightArea ? '0.62' : '0.72';
  const titleWeight = '800';

  const shadowId = `stripTxtShadow${width}x${height}`;

  const titleY = barY + barPad + (title ? Math.round(9 * scale) : 0);
  const msgY = title
    ? titleY + Math.round(12 * scale)
    : barY + barPad + Math.round(9 * scale);

  const msgTspans = msgLines.map((line, idx) => {
    const dy = idx === 0 ? 0 : lineH;
    return `<tspan x="${pad}" dy="${dy}">${escapeStripSvgText(line)}</tspan>`;
  }).join('');

  const clipId = `stripClip${width}x${height}`;
  const textSafeId = `stripTextSafe${width}x${height}`;
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="${clipId}">
        <rect width="${width}" height="${height}"/>
      </clipPath>
      <clipPath id="${textSafeId}">
        <rect x="${pad}" y="${Math.max(0, barY - Math.round(4 * scale))}" width="${Math.max(1, maxTextWidth)}" height="${Math.min(height, barH + Math.round(8 * scale))}"/>
      </clipPath>
      <filter id="${shadowId}" x="-8%" y="-20%" width="116%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="0.75" flood-color="${shadowColor}" flood-opacity="${shadowOpacity}"/>
      </filter>
    </defs>
    <g clip-path="url(#${clipId})">
      <g clip-path="url(#${textSafeId})" filter="url(#${shadowId})">
        ${title ? `<text x="${pad}" y="${titleY}" fill="${titleFill}" font-family="Arial,Helvetica,sans-serif" font-size="${titleSize}" font-weight="${titleWeight}" text-anchor="start">${escapeStripSvgText(title)}</text>` : ''}
        ${msgLines.length ? `<text x="${pad}" y="${msgY}" fill="${msgFill}" font-family="Arial,Helvetica,sans-serif" font-size="${msgSize}" font-weight="700" text-anchor="start">${msgTspans}</text>` : ''}
      </g>
    </g>
  </svg>`;

  return sharp(stripBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

/**
 * Generate manifest.json with SHA1 hashes
 */
function generateManifest(files) {
  const manifest = {};

  Object.entries(files).forEach(([filename, buffer]) => {
    const sha1 = crypto.createHash('sha1');
    sha1.update(buffer);
    manifest[filename] = sha1.digest('hex');
  });

  return JSON.stringify(manifest);
}

/**
 * Clean PEM file: remove Bag Attributes and other non-PEM content
 */
function cleanPem(pem) {
  const lines = pem.split('\n');
  const cleaned = [];
  let inBlock = false;
  for (const line of lines) {
    if (line.startsWith('-----BEGIN')) { inBlock = true; cleaned.push(line); continue; }
    if (line.startsWith('-----END')) { cleaned.push(line); inBlock = false; continue; }
    if (inBlock && !line.startsWith('Bag Attributes') && !line.match(/^\s*(friendlyName|localKeyID|subject|issuer|Key Fingerprint)/) && !line.match(/^\s+[0-9A-Fa-f]{2}\s/) && line.trim() !== '') {
      cleaned.push(line);
    }
  }
  return cleaned.join('\n');
}

/**
 * Sign the manifest using openssl cms (reliable Apple-compatible signing)
 */
function signManifest(manifestJson, certPath, keyPath, wwdrPath) {
  const { execSync } = require('child_process');

  const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

  if (!hasCerts) {
    console.warn('⚠️ MOCK MODE: pass not signed (install Apple certificate to enable)');
    return Buffer.from('UNSIGNED_MOCK_SIGNATURE');
  }

  try {
    // Create temp dir for signing
    const tmpDir = `/tmp/pkpass-sign-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    fs.mkdirSync(tmpDir, { recursive: true });

    // Clean PEM files to remove Bag Attributes
    const cleanCert = cleanPem(fs.readFileSync(certPath, 'utf8'));
    const cleanKey = cleanPem(fs.readFileSync(keyPath, 'utf8'));

    const tmpCert = path.join(tmpDir, 'cert.pem');
    const tmpKey = path.join(tmpDir, 'key.pem');
    const tmpManifest = path.join(tmpDir, 'manifest.json');
    const tmpSig = path.join(tmpDir, 'signature');

    fs.writeFileSync(tmpCert, cleanCert);
    fs.writeFileSync(tmpKey, cleanKey, { mode: 0o600 });
    fs.writeFileSync(tmpManifest, manifestJson);

    // Build openssl cms command
    let cmd = `openssl cms -sign -binary -in ${tmpManifest} -signer ${tmpCert} -inkey ${tmpKey} -outform DER -out ${tmpSig}`;
    if (wwdrPath && fs.existsSync(wwdrPath)) {
      const cleanWwdr = cleanPem(fs.readFileSync(wwdrPath, 'utf8'));
      const tmpWwdr = path.join(tmpDir, 'wwdr.pem');
      fs.writeFileSync(tmpWwdr, cleanWwdr);
      cmd += ` -certfile ${tmpWwdr}`;
    }

    execSync(cmd, { stdio: 'pipe' });

    const signature = fs.readFileSync(tmpSig);
    console.log(`✓ Pass signed with openssl cms (${signature.length} bytes)`);

    // Cleanup
    try { execSync(`rm -rf ${tmpDir}`, { stdio: 'pipe' }); } catch(e) {}

    return signature;
  } catch (error) {
    console.error('⚠️ openssl cms signing failed:', error.message);
    // Fallback: try smime
    try {
      const tmpDir2 = `/tmp/pkpass-smime-${Date.now()}`;
      fs.mkdirSync(tmpDir2, { recursive: true });
      const cleanCert = cleanPem(fs.readFileSync(certPath, 'utf8'));
      const cleanKey = cleanPem(fs.readFileSync(keyPath, 'utf8'));
      fs.writeFileSync(path.join(tmpDir2, 'cert.pem'), cleanCert);
      fs.writeFileSync(path.join(tmpDir2, 'key.pem'), cleanKey, { mode: 0o600 });
      fs.writeFileSync(path.join(tmpDir2, 'manifest.json'), manifestJson);

      let cmd = `openssl smime -sign -binary -in ${tmpDir2}/manifest.json -signer ${tmpDir2}/cert.pem -inkey ${tmpDir2}/key.pem -outform DER -out ${tmpDir2}/sig.der`;
      if (wwdrPath && fs.existsSync(wwdrPath)) {
        const cleanWwdr = cleanPem(fs.readFileSync(wwdrPath, 'utf8'));
        fs.writeFileSync(path.join(tmpDir2, 'wwdr.pem'), cleanWwdr);
        cmd += ` -certfile ${tmpDir2}/wwdr.pem`;
      }
      execSync(cmd, { stdio: 'pipe' });
      const sig = fs.readFileSync(path.join(tmpDir2, 'sig.der'));
      console.log(`✓ Pass signed with openssl smime fallback (${sig.length} bytes)`);
      try { execSync(`rm -rf ${tmpDir2}`, { stdio: 'pipe' }); } catch(e) {}
      return sig;
    } catch(e2) {
      console.error('⚠️ MOCK MODE: both cms and smime signing failed:', e2.message);
      return Buffer.from('UNSIGNED_MOCK_SIGNATURE');
    }
  }
}

/**
 * Create the complete .pkpass file
 */
async function createPkpass(template, instance, brand, options = {}) {
  const hrBrand = isHrPassBrand(brand);
  const { brandConfigForHrPass } = require('./pass-push-state');
  const passBrand = hrBrand ? { ...brand, config: brandConfigForHrPass(brand, instance) } : brand;
  const {
    baseUrl = 'http://localhost:3000',
    certPath = path.join(__dirname, '../../certs/signerCert.pem'),
    keyPath = path.join(__dirname, '../../certs/signerKey.pem'),
    wwdrPath = path.join(__dirname, '../../certs/wwdr.pem'),
    issuePortalLink = true,
    rotatePortalLink = false,
    portalUrl: portalUrlOption = undefined,
    member: memberOption = undefined
  } = options;

  let member = memberOption;
  if (member === undefined && instance?.id) {
    try {
      const { getMemberForPass } = require('../db');
      member = await getMemberForPass(instance.id);
    } catch (err) {
      console.warn('[pass] member lookup skipped:', err.message);
      member = null;
    }
  }

  let portalUrl = portalUrlOption;
  if (portalUrl === undefined && issuePortalLink && instance?.id) {
    try {
      const { resolvePortalLinkForPass } = require('./portal-pass-link');
      const link = await resolvePortalLinkForPass(instance.id, { rotate: rotatePortalLink });
      portalUrl = link?.portal_url || null;
    } catch (err) {
      console.warn('[portal] pass back link skipped:', err.message);
      portalUrl = null;
    }
  }

  let hubUrl = null;
  let pgaUrl = null;
  let meUrl = null;
  let coinBalance = 0;
  let hubLocations = [];

  if (hrBrand && instance?.serial_number) {
    try {
      const { getCurrentBalance } = require('./coins');
      coinBalance = await getCurrentBalance(brand.id, instance.serial_number);
    } catch (err) {
      console.warn('[pass] coin balance load failed:', err.message);
      coinBalance = 0;
    }
  }

  if (hrBrand && instance?.serial_number && (process.env.JWT_HUB_SECRET || process.env.JWT_SECRET)) {
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
      // Decisione proprietario (luglio 2026): i merchant dell'HUB convenzioni NON
      // entrano più nel geofencing del pass — occupavano i 10 slot Apple con
      // priorità ed escludevano i POI del brand. I POI vivono solo nel pannello
      // Geofencing; un convenzionato che vuole il geofence si aggiunge lì.
      const pgaSettings = await getPgaSettings(brand.id);
      if (pgaSettings.enabled) {
        pgaUrl = buildHubAppUrl(token, brand.slug, 'pga');
      }
    } catch (err) {
      console.warn('[hub] pass back link skipped:', err.message);
    }
  }

  // Generate pass.json
  const passJson = generatePassJson(template, instance, passBrand, {
    ...options,
    baseUrl,
    portalUrl,
    hubUrl,
    pgaUrl,
    meUrl,
    coinBalance,
    hubLocations,
    member
  });

  // Generate images - use brand.config colors first, then template.style, then defaults
  const brandCfg = passBrand.config || {};
  const bgColor = brandCfg.backgroundColor || template.style?.backgroundColor || '#0D0B1A';
  const fgColor = brandCfg.foregroundColor || template.style?.foregroundColor || '#FFFFFF';

  // Pass logo (wide) + notification icon (prefer dedicated square wallet_icon asset).
  let iconBuffers, logoBuffers;
  const tplImages = template.style?.images || {};

  const resolvedLogo = await resolveWalletLogoRawBuffer(brand, template);
  if (resolvedLogo) {
    logoBuffers = await buildPassLogoBuffersFromRaw(resolvedLogo.buffer);
    console.log(`✓ Wallet logo from ${resolvedLogo.source}`);
  }

  const resolvedPassIcon = await resolvePassIconBuffers(brand, resolvedLogo, template);
  if (resolvedPassIcon.iconBuffers) {
    iconBuffers = resolvedPassIcon.iconBuffers;
    console.log(`✓ Notification icon from ${resolvedPassIcon.source}`);
    if (resolvedPassIcon.source === 'logo_derived' && brandCfg.brand_identity_assets?.wallet_icon) {
      console.warn('[passkit] wallet_icon media configurata ma icona ricavata dal logo — esegui sync icona notifiche');
    }
  }

  // Fall back to default icon files, then generated (HR skips Hirostar default assets)
  if (!iconBuffers?.icon) {
    if (hrBrand) {
      iconBuffers = await generateIcon(brand.name, bgColor, fgColor);
      console.log('✓ HR: icon from brand initial (no wallet logo source)');
    } else {
      const defaultIconPath = path.join(__dirname, '..', '..', 'public', 'assets', 'default-icon.png');
      const defaultIcon2xPath = path.join(__dirname, '..', '..', 'public', 'assets', 'default-icon@2x.png');
      if (fs.existsSync(defaultIconPath)) {
        iconBuffers = {
          icon: fs.readFileSync(defaultIconPath),
          icon2x: fs.existsSync(defaultIcon2xPath) ? fs.readFileSync(defaultIcon2xPath) : fs.readFileSync(defaultIconPath)
        };
        console.log('✓ Using default icon (H mark from assets)');
      } else {
        iconBuffers = await generateIcon(brand.name, bgColor, fgColor);
      }
    }
  }
  if (!logoBuffers?.logo) {
    const logos = await generateLogo(brand.name, bgColor, fgColor);
    logoBuffers = logos;
  }

  // Strip images — push override → template → brand → default file → generated
  let stripBuffers;
  const defaultStripPath = path.join(__dirname, '..', '..', 'public', 'assets', 'default-strip.png');
  const pushStripB64 = brandCfg.stripOverride;
  if (pushStripB64) {
    const rawStrip = Buffer.from(pushStripB64, 'base64');
    const strip1x = await sharp(rawStrip).resize(375, 123, { fit: 'cover' }).png().toBuffer();
    const strip2x = await sharp(rawStrip).resize(750, 246, { fit: 'cover' }).png().toBuffer();
    stripBuffers = { strip: strip1x, strip2x: strip2x };
    console.log('✓ Using push strip override');
  } else if (tplImages.strip) {
    const rawStrip = Buffer.from(tplImages.strip, 'base64');
    const strip1x = await sharp(rawStrip).resize(375, 123, { fit: 'cover' }).png().toBuffer();
    const strip2x = await sharp(rawStrip).resize(750, 246, { fit: 'cover' }).png().toBuffer();
    stripBuffers = { strip: strip1x, strip2x: strip2x };
    console.log('✓ Using template-level strip image');
  } else if (brand.config?.logos?.strip) {
    const rawStrip = Buffer.from(brand.config.logos.strip, 'base64');
    const strip1x = await sharp(rawStrip).resize(375, 123, { fit: 'cover' }).png().toBuffer();
    const strip2x = await sharp(rawStrip).resize(750, 246, { fit: 'cover' }).png().toBuffer();
    stripBuffers = { strip: strip1x, strip2x: strip2x };
    console.log('✓ Using custom strip image (from brand)');
  } else if (fs.existsSync(defaultStripPath)) {
    const rawStrip = fs.readFileSync(defaultStripPath);
    const strip1x = await sharp(rawStrip).resize(375, 123, { fit: 'cover' }).png().toBuffer();
    const strip2x = await sharp(rawStrip).resize(750, 246, { fit: 'cover' }).png().toBuffer();
    stripBuffers = { strip: strip1x, strip2x: strip2x };
    console.log('✓ Using default strip image (from file)');
  } else {
    stripBuffers = await generateStrip(brand.name, bgColor, fgColor);
  }

  // Thumbnail — never include one for HR store cards: Apple renders it as a side badge.
  let thumbnailBuffers = null;
  if (hrBrand) {
    thumbnailBuffers = null;
    console.log('✓ HR: thumbnail disabled');
  } else if (tplImages.thumbnail) {
    const rawThumb = Buffer.from(tplImages.thumbnail, 'base64');
    thumbnailBuffers = {
      thumb: await sharp(rawThumb).resize(90, 90, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer(),
      thumb2x: await sharp(rawThumb).resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    };
    console.log('✓ Using template-level thumbnail');
  }

  // Background — loyalty / event layouts only (not employee pass)
  let backgroundBuffers = null;
  if (!hrBrand && tplImages.background) {
    const rawBg = Buffer.from(tplImages.background, 'base64');
    backgroundBuffers = {
      bg: await sharp(rawBg).resize(180, 220, { fit: 'cover' }).png().toBuffer(),
      bg2x: await sharp(rawBg).resize(360, 440, { fit: 'cover' }).png().toBuffer()
    };
    console.log('✓ Using template-level background');
  }

  if (hrBrand && resolvePushAnnouncement(brandCfg, instance)?.message) {
    console.log('✓ HR: strip text overlay disabled; using strip image as-is');
  }

  // Build file map
  const files = {
    'pass.json': Buffer.from(JSON.stringify(passJson, null, 2)),
    'icon.png': iconBuffers.icon,
    'icon@2x.png': iconBuffers.icon2x || iconBuffers.icon,
    'icon@3x.png': iconBuffers.icon3x || iconBuffers.icon2x || iconBuffers.icon,
    'logo.png': logoBuffers.logo,
    'logo@2x.png': logoBuffers.logo2x || logoBuffers.logo
  };

  if (hrBrand) {
    files['strip.png'] = stripBuffers.strip;
    files['strip@2x.png'] = stripBuffers.strip2x;
  } else {
    const passType = template.pass_type || 'storeCard';
    if (passType === 'coupon' || passType === 'storeCard' || (passType === 'eventTicket' && !backgroundBuffers)) {
      files['strip.png'] = stripBuffers.strip;
      files['strip@2x.png'] = stripBuffers.strip2x;
    }
    if (thumbnailBuffers && (passType === 'generic' || passType === 'eventTicket')) {
      files['thumbnail.png'] = thumbnailBuffers.thumb;
      files['thumbnail@2x.png'] = thumbnailBuffers.thumb2x;
    } else if (thumbnailBuffers && (passType === 'storeCard' || passType === 'coupon')) {
      console.warn('[passkit] thumbnail ignorata su Apple Wallet per pass_type=%s — usa eventTicket', passType);
    }
    if (backgroundBuffers && passType === 'eventTicket') {
      files['background.png'] = backgroundBuffers.bg;
      files['background@2x.png'] = backgroundBuffers.bg2x;
    }
  }

  // Generate manifest
  const manifestJson = generateManifest(files);
  const manifestBuffer = Buffer.from(manifestJson);
  files['manifest.json'] = manifestBuffer;

  // Sign manifest
  const signature = signManifest(manifestJson, certPath, keyPath, wwdrPath);
  files['signature'] = signature;

  // Create ZIP archive
  return new Promise((resolve, reject) => {
    const buffers = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', (chunk) => {
      buffers.push(chunk);
    });

    archive.on('end', () => {
      resolve(Buffer.concat(buffers));
    });

    archive.on('error', (err) => {
      reject(err);
    });

    // Add files to archive
    Object.entries(files).forEach(([filename, buffer]) => {
      archive.append(buffer, { name: filename });
    });

    archive.finalize();
  });
}

/**
 * Generate default images for a brand (unused in createPkpass but available)
 */
async function generateDefaultImages(brandName, primaryColor = '#0D0B1A') {
  const fgColor = '#FFFFFF';
  const icons = await generateIcon(brandName, primaryColor, fgColor);
  const logos = await generateLogo(brandName, primaryColor, fgColor);
  const strips = await generateStrip(brandName, primaryColor, fgColor);

  return {
    icons,
    logos,
    strips
  };
}

module.exports = {
  generatePassJson,
  buildIdentifyingQrBarcode,
  generateIcon,
  generateLogo,
  generateStrip,
  wrapStripOverlayLines,
  truncateStripOverlayTitle,
  normalizePushAnnouncementForStrip,
  isHrPassBrand,
  STRIP_OVERLAY_TITLE_MAX_1X,
  STRIP_OVERLAY_MSG_MAX_1X,
  STRIP_OVERLAY_MSG_LINES,
  loadHrStripBuffers,
  composePushTextOnStrip,
  stripOverlayTextMaxWidth,
  stripVisualCharsPerLine,
  sanitizeStripSvgText,
  generateManifest,
  signManifest,
  createPkpass,
  generateDefaultImages,
  normalizePassLocations,
};

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const FD = path.join(ROOT, 'src', 'filodiretto');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readFd(name) {
  return fs.readFileSync(path.join(FD, name), 'utf8');
}

/** FASE 4 pages + DS modules exercised across viewports. */
const SECTION_MATRIX = [
  {
    label: 'Inizio',
    sectionId: 'welcome',
    js: 'fd-home.js',
    css: 'fd-home.css',
    patterns: ['fd-page-header', 'fd-skeleton', 'fd-empty-state', 'fdRenderErrorState|fdRenderLoadingRegion']
  },
  {
    label: 'Identità Brand',
    sectionId: 'brand-identity',
    js: 'fd-brand-identity.js',
    css: 'fd-brand-identity.css',
    patterns: ['fd-page-header', 'fd-form-section', 'fd-btn']
  },
  {
    label: 'Media Library',
    sectionId: 'media-library',
    js: 'fd-media-library.js',
    css: 'fd-media-library.css',
    patterns: ['fd-skeleton', 'media-tabs|fd-media-tabs', 'media-hidden|media-dropzone']
  },
  {
    label: 'Template Pass',
    sectionId: 'templates',
    js: 'fd-templates.js',
    css: 'fd-templates.css',
    patterns: ['fd-skeleton', 'fd-tpl-list', 'fd-btn--primary|fd-tpl-card-delete']
  },
  {
    label: 'Pass Emessi',
    sectionId: 'passes',
    js: 'fd-passes.js',
    css: 'fd-passes.css',
    patterns: ['fd-skeleton', 'fd-stat-grid', 'fd-passes-legend-hint|fd-table-wrap']
  },
  {
    label: 'Push',
    sectionId: 'push',
    js: 'fd-push.js',
    css: 'fd-push.css',
    patterns: ['fd-skeleton', 'fd-empty-state', 'aria-live']
  },
  {
    label: 'Reward',
    sectionId: 'instant-win',
    js: 'fd-reward-challenge.js',
    css: 'fd-reward-challenge.css',
    patterns: ['fd-reward-table-skeleton', 'fd-loading-region', 'aria-live']
  },
  {
    label: 'Challenge',
    sectionId: 'gamification',
    js: 'fd-reward-challenge.js',
    css: 'fd-reward-challenge.css',
    patterns: ['fd-challenge-table-skeleton', 'fd-loading-region', 'aria-live']
  },
  {
    label: 'Analytics',
    sectionId: 'analytics',
    js: 'fd-analytics.js',
    css: 'fd-analytics.css',
    patterns: ['fd-analytics-stats-skeleton', 'fd-skeleton', 'aria-busy']
  },
  {
    label: 'Log Attività',
    sectionId: 'activity-log',
    js: 'fd-activity-log.js',
    css: 'fd-activity-log.css',
    patterns: ['fd-activity-log-toolbar', 'EVENT_TYPE_LABELS', 'fd-activity-log-details__text']
  },
  {
    label: 'Utenti',
    sectionId: 'users',
    js: 'fd-users.js',
    css: 'fd-users.css',
    patterns: ['fd-page-header', 'fd-users-protected', 'fd-users-status--active', 'fd-users-copy']
  },
  {
    label: 'Contatti',
    sectionId: 'leads',
    js: 'fd-contacts.js',
    css: 'fd-contacts.css',
    patterns: ['fd-page-header', 'fd-contacts-table-wrap', 'fd-table']
  }
];

const VIEWPORT_BREAKPOINTS = [
  { className: 'fd-bp-desktop', minWidth: '1280px' },
  { className: 'fd-bp-tablet-landscape', minWidth: '1024px' },
  { className: 'fd-bp-tablet-portrait', minWidth: '768px' },
  { className: 'fd-bp-mobile', gateMax: '767px' }
];

test('build-fd-bundles lists FASE 5–6 modules', () => {
  const build = read('scripts/build-fd-bundles.js');
  assert.match(build, /fd-page-states\.css/);
  assert.match(build, /fd-page-states\.js/);
  assert.match(build, /fd-mobile-gate\.css/);
  assert.match(build, /fd-mobile-gate\.js/);
  // Minificazione delegata a esbuild (transform, no bundling: i top-level
  // identifier condivisi tra i file NON devono essere rinominati).
  assert.match(build, /require\('esbuild'\)/);
  assert.match(build, /minify: true/);
  assert.match(build, /sourcemap: true/);
});

test('fd.bundle.js is valid JavaScript after build', () => {
  const bundlePath = path.join(ROOT, 'src', 'filodiretto', 'fd.bundle.js');
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ['--check', bundlePath], { stdio: 'pipe' });
  });
  const bundle = read('src/filodiretto/fd.bundle.js');
  assert.ok(
    // L'argomento locale viene rinominato dal minificatore, la regex no.
    bundle.includes('/^https?:\\/\\//i.test('),
    'bundle must preserve URL regex literal (minifier must not strip // inside regex)'
  );
  assert.ok(
    bundle.includes('//# sourceMappingURL=fd.bundle.js.map'),
    'bundle must reference its source map'
  );
});

test('fd.bundle.css preserves calc() operator spacing (W.AI inset)', () => {
  const bundle = read('src/filodiretto/fd.bundle.css');
  assert.match(
    bundle,
    /#waiOverlay\.wai-panel\{[^}]*calc\(var\(--fd-wai-fab-inset\) \+ var\(--fd-wai-fab-size\) \+ var\(--fd-wai-fab-gap\)\)/
  );
  // esbuild conserva lo spazio dopo i due punti nelle custom property (valore token stream).
  assert.match(bundle, /--fd-wai-fab-size:\s*64px/);
  assert.match(bundle, /--fd-wai-fab-inset:\s*44px/);
  const broken = [...bundle.matchAll(/calc\([^)]*\+[^)]*\)/g)].filter((m) => !/ \+ /.test(m[0]));
  assert.equal(broken.length, 0, 'minifier must not strip spaces around + inside calc()');
});

test('index.html bundle cache references wide-layout tag', () => {
  const html = read('src/dashboard/index.html');
  assert.match(html, /fd\.bundle\.css\?v=20260708-geo-silent/);
  assert.match(html, /fd\.bundle\.js\?v=20260708-geo-silent/);
  assert.match(html, /\/dashboard\/lib\/public-url\.js/);
  assert.match(html, /function a2wPublicUrlBase/);
  assert.match(html, /#a2wMediaTabs\{display:none!important\}/);
  assert.match(html, /fd-page-states\.js/);
  assert.match(html, /fd-mobile-gate\.js/);
  assert.match(html, /fd-wide-layout\.css/);
});

test('wide-screen layout centers content and scales typography', () => {
  const wide = readFd('fd-wide-layout.css');
  const tokens = readFd('tokens.css');
  const build = read('scripts/build-fd-bundles.js');
  assert.match(wide, /html\[data-app='filodiretto'\] \.main > \.content/);
  assert.match(wide, /margin-inline:\s*auto/);
  assert.match(wide, /minmax\(220px/);
  assert.match(tokens, /clamp\(14px,\s*0\.875rem \+ 0\.2vw,\s*16px\)/);
  assert.match(tokens, /clamp\(24px,\s*4vw,\s*64px\)/);
  assert.match(build, /fd-wide-layout\.css/);
});

test('FASE 5 page state helpers and tokens exist', () => {
  const js = readFd('fd-page-states.js');
  const css = readFd('fd-page-states.css');
  assert.match(js, /fdRenderLoadingRegion/);
  assert.match(js, /fdRenderErrorState/);
  assert.match(js, /aria-busy="true"/);
  assert.match(js, /aria-live="polite"/);
  assert.match(css, /\.fd-error-state/);
  assert.match(css, /--fd-color-danger/);
  assert.match(css, /\.fd-loading-region/);
});

test('Filo media library hides legacy a2w tabs without fd-layout class', () => {
  const css = readFd('fd-media-library.css');
  assert.match(css, /html\[data-app='filodiretto'\] #media-library #a2wMediaTabs/);
  assert.doesNotMatch(css, /media-library--fd-layout #a2wMediaTabs/);
});

test('FASE 6 smartphone gate blocks under 768px only', () => {
  const js = readFd('fd-mobile-gate.js');
  const css = readFd('fd-mobile-gate.css');
  assert.match(js, /max-width: 767px/);
  assert.match(js, /fd-mobile-gated/);
  assert.match(css, /min-width: 768px/);
  assert.match(css, /\.fd-mobile-gate/);
});

test('layout breakpoints sync fd-bp-* classes', () => {
  const layoutJs = readFd('fd-layout.js');
  const layoutCss = read('src/filodiretto/fd-layout.css');
  VIEWPORT_BREAKPOINTS.forEach(function (bp) {
    assert.match(layoutJs, new RegExp(bp.className));
    assert.match(layoutCss, new RegExp(bp.className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  assert.match(layoutJs, /min-width: 768px/);
});

test('responsive tables keep card mode threshold at 768px', () => {
  const js = readFd('fd-responsive-tables.js');
  const css = readFd('fd-responsive-tables.css');
  assert.match(js, /768/);
  assert.match(css, /768/);
  assert.match(css, /fd-table-wrap/);
});

for (const section of SECTION_MATRIX) {
  test(`DS patterns present for ${section.label}`, () => {
    const js = readFd(section.js);
    const css = readFd(section.css);
    section.patterns.forEach(function (pattern) {
      const re = new RegExp(pattern);
      assert.ok(re.test(js) || re.test(css), `${section.label}: missing /${pattern}/ in ${section.js} or ${section.css}`);
    });
    assert.match(read('src/dashboard/index.html'), new RegExp('id="' + section.sectionId + '"'));
  });
}

test('Filo brand identity uses per-section save and public landing URL', () => {
  const dirty = readFd('fd-form-dirty.js');
  const bi = readFd('fd-brand-identity.js');
  const biCss = readFd('fd-brand-identity.css');
  const dirtyCss = readFd('fd-form-dirty.css');
  const html = read('src/dashboard/index.html');
  assert.match(dirty, /fd-bi-section-save/);
  assert.match(dirty, /saveBrandIdentitySection/);
  assert.match(dirty, /fdBiSectionSaveBtn-/);
  assert.match(dirty, /BI_SECTION_DEFS/);
  assert.match(dirty, /removeBottomSaveBar/);
  assert.doesNotMatch(dirty, /fd-bi-sticky-bar fd-bi-bottom-bar/);
  assert.doesNotMatch(dirty, /ensureBrandIdentityStickyBar/);
  assert.doesNotMatch(dirtyCss, /position:\s*fixed/);
  assert.match(bi, /summarySlugLink/);
  assert.match(bi, /fd-bi-slug-copy/);
  assert.match(bi, /a2w-bi-identity-summary__slug-link/);
  assert.doesNotMatch(bi, /fd-bi-checklist/);
  assert.doesNotMatch(bi, /Checklist setup/);
  assert.doesNotMatch(bi, /fdRefreshBrandChecklist/);
  assert.match(biCss, /\.a2w-bi-identity-summary__slug-link/);
  assert.match(biCss, /\.fd-bi-aside-grid/);
  assert.match(biCss, /grid-template-rows: subgrid/);
  assert.match(dirtyCss, /\.fd-bi-section-save/);
  assert.match(html, /getPublicLandingUrl/);
});

test('Filo brand identity section accordions on HR shell', () => {
  const bi = readFd('fd-brand-identity.js');
  assert.match(bi, /fdBiBaseDetails/);
  assert.match(bi, /fdBiContactsDetails/);
  assert.match(bi, /fdBiSocialDetails/);
  assert.match(bi, /enhanceBiAccordionSections/);
  assert.match(bi, /details\.addEventListener\('toggle'/);
});

test('Filo brand identity aside reads camelCase form snapshot', () => {
  const js = readFd('fd-brand-identity.js');
  assert.match(js, /fieldVal\(data, 'supportEmail'/);
  assert.match(js, /fieldVal\(data, 'supportPhone'/);
  assert.match(js, /fieldVal\(data, 'dpoEmail'/);
});

test('Filo media library has no contextual search field', () => {
  const js = readFd('fd-media-library.js');
  assert.doesNotMatch(js, /function ensureContextSearch/);
  assert.doesNotMatch(js, /applyContextSearchFilter/);
  assert.match(js, /fd-media-dropzone__specs/);
  assert.match(js, /removeLegacyMediaSearches/);
});

test('Filo template delete uses direct button with confirm flow', () => {
  const js = readFd('fd-templates.js');
  assert.match(js, /fd-tpl-card-delete/);
  assert.match(js, /fdDeleteTemplateWithConfirm/);
  assert.doesNotMatch(js, /fd-tpl-card-menu__trigger/);
});

test('Template image edits mark modal dirty before save', () => {
  const dashboard = read('src/dashboard/index.html');
  const dirty = readFd('fd-form-dirty.js');
  assert.match(dirty, /window\.tplImageCache/);
  assert.match(dashboard, /function syncTplImageDirtyGlobals/);
  assert.match(dashboard, /window\.tplImageCache = tplImageCache/);
  assert.match(dashboard, /window\.tplImageRemovals = tplImageRemovals/);
  assert.match(dashboard, /window\.tplWalletIconMediaId = tplWalletIconMediaId/);
  assert.match(dashboard, /clearTplImage\(imageType[\s\S]*notifyTplDirtyState\(\)/);
  assert.match(dashboard, /tplPickFromMedia\(imageType\)[\s\S]*syncTplImageDirtyGlobals\(\)[\s\S]*notifyTplDirtyState\(\)/);
  assert.doesNotMatch(dashboard, /if \(imageType === 'wallet_icon'\) \{\s*await persistHrWalletIcon\(\);/);
});

test('Filo passes localize status badges and copy icon', () => {
  const js = readFd('fd-passes.js');
  const css = readFd('fd-passes.css');
  assert.match(js, /passStatusMeta/);
  assert.match(js, /enhancePassIdCells/);
  assert.match(css, /fd-pass-status--active/);
  assert.match(css, /fd-passes-stat-grid/);
  assert.match(css, /repeat\(auto-fit, minmax\(220px, 1fr\)\)/);
  assert.doesNotMatch(js, /fd-passes-stat-secondary/);
});

test('Pass table keeps all operational columns visible without created-date column', () => {
  const dashboard = read('src/dashboard/index.html');
  const passesJs = readFd('fd-passes.js');
  const passesCss = readFd('fd-passes.css');
  assert.doesNotMatch(dashboard, /<th[^>]*>Pass creato<\/th>/);
  assert.doesNotMatch(dashboard, /'Pass creato \(generazione server\)'/);
  assert.doesNotMatch(dashboard, /const passCreato =/);
  assert.match(passesJs, /section\.classList\.add\('passes--advanced-cols'\)/);
  assert.match(passesJs, /querySelectorAll\('#fdPassesColsToggle'\)[\s\S]*btn\.remove\(\)/);
  assert.doesNotMatch(passesJs, /btn\.textContent = on \? 'Nascondi colonne avanzate'/);
  assert.match(passesCss, /#passes \.fd-passes-cols-toggle[\s\S]*display:\s*none/);
  assert.match(passesCss, /#passes:not\(\.passes--advanced-cols\) \.pass-col-advanced[\s\S]*display:\s*revert/);
});

test('Filo passes row menu includes regenerate action', () => {
  const js = readFd('fd-passes.js');
  const css = readFd('fd-passes.css');
  assert.match(js, /data-action="regenerate"/);
  assert.match(js, /Rigenera pass/);
  assert.match(js, /fd-pass-row-menu__sep/);
  assert.match(js, /regenerateSelectedPasses/);
  assert.match(css, /fd-pass-row-menu__sep/);
});

test('contacts help popover uses floating panel positioning', () => {
  const help = read('src/dashboard/js/components/contacts/help-popover.js');
  assert.match(help, /positionFloatingPanel/);
  assert.match(help, /maxWidth/);
});

test('Filo contacts overflow menu has export and tour only', () => {
  const js = readFd('fd-contacts.js');
  const css = readFd('fd-contacts.css');
  assert.match(js, /stripLeadsHeaderDuplicates/);
  assert.match(js, /fdContactsOverflowExportBtn/);
  assert.match(js, /fdContactsOverflowTourBtn/);
  assert.match(js, /panel\.innerHTML = ''/);
  assert.doesNotMatch(js, /data-fd-toolbar-dynamic/);
  assert.match(css, /#contactsPageMenu/);
  assert.match(css, /fd-contacts-toolbar-overflow--always/);
});

test('Filo media library hides legacy Ads2Wallet tabs markup', () => {
  const js = readFd('fd-media-library.js');
  const css = readFd('fd-media-library.css');
  assert.match(js, /hideLegacyA2wMediaTabs/);
  assert.match(js, /reconcileLegacyMediaTabs/);
  assert.match(js, /fdEnsureMediaLibraryLayout/);
  assert.match(js, /setAttribute\('data-component', 'media-tabs'\)/);
  assert.match(js, /media-hidden/);
  assert.match(js, /fdMediaLogoCard/);
  assert.match(js, /#a2wMediaTabs/);
  assert.match(css, /#a2wMediaTabs/);
});

test('fd-empty-states and fd-form-a11y integrate with page states', () => {
  const empty = readFd('fd-empty-states.js');
  const a11y = readFd('fd-form-a11y.js');
  assert.match(empty, /ensureEmptyStateA11y/);
  assert.match(empty, /role="status"/);
  assert.match(a11y, /fdEnhanceLoadingRegions/);
  assert.match(a11y, /fdGlobalAriaLive/);
});

test('Filo analytics H1 sync resolves page-header title and activity-log tab', () => {
  const js = readFd('fd-analytics.js');
  assert.match(js, /findAnalyticsTitleEl/);
  assert.match(js, /page-header__title/);
  assert.match(js, /resolveAnalyticsChromeTab/);
  assert.match(js, /Log Attività/);
});

test('Filo engagement KPIs use visible skeleton and clear loading class', () => {
  const js = readFd('fd-pga-engagement.js');
  const css = readFd('fd-pga.css');
  assert.match(js, /fd-pga-kpi__value-skeleton/);
  assert.match(js, /classList\.remove\('fd-pga-kpi-grid--loading'\)/);
  assert.doesNotMatch(css, /fd-pga-kpi-grid--loading[\s\S]*color:\s*transparent/);
  assert.match(css, /fd-pga-kpi__value-skeleton/);
});

test('Filo checkbox and radio use native 16px sizing not full-width inputs', () => {
  const html = read('src/dashboard/index.html');
  const components = readFd('fd-components.css');
  assert.match(html, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  assert.match(html, /input\[type="checkbox"\]:not\(\.fd-switch__input\)/);
  assert.match(html, /accent-color:\s*#7c3aed/);
  assert.match(components, /input\[type='checkbox'\]:not\(\.fd-switch__input\)/);
  assert.match(components, /label:has\(> input\[type='checkbox'\]/);
});

test('Push hides wallet channel selection and defaults sends to every wallet channel', () => {
  const dashboard = read('src/dashboard/index.html');
  const js = readFd('fd-push.js');
  assert.match(dashboard, /id="pushChannelGroup" hidden aria-hidden="true"/);
  assert.match(dashboard, /id="schedChannelGroup" hidden aria-hidden="true"/);
  assert.match(dashboard, /id="geoChannelGroup" hidden aria-hidden="true"/);
  assert.match(dashboard, /const channel = 'all';/);
  assert.match(js, /function walletChannelSelectionHidden\(\)/);
  assert.match(js, /if \(walletChannelSelectionHidden\(\)\) return 'all';/);
  assert.match(js, /var channel = 'all';/);
  const routes = read('src/api/routes.js');
  assert.match(routes, /normalizePushChannelList/);
  assert.match(routes, /channel = 'all'/);
  assert.match(routes, /apple,google/);
});

test('Geofencing POIs render as compact list with quota counter and per-POI radius', () => {
  const dashboard = read('src/dashboard/index.html');
  assert.match(dashboard, /const GEO_MAX_POI = 10/);
  assert.match(dashboard, /id="geoPoiCounter"/);
  assert.match(dashboard, /id="geoAddPoiBtn"/);
  assert.match(dashboard, /id="geoSaveBtnTop"/);
  assert.match(dashboard, /Dopo aver aggiunto o modificato un POI premi/);
  assert.match(dashboard, /Google aggiorna le merchant location e invia anche il messaggio Wallet/);
  assert.match(dashboard, /class="geo-poi-item"/);
  assert.match(dashboard, /class="geo-poi-summary"/);
  // Mappa embed rimossa (rumore); verifica esterna su Google Maps.
  assert.doesNotMatch(dashboard, /openstreetmap\.org\/export\/embed\.html/);
  assert.match(dashboard, /google\.com\/maps\/search/);
  // Raggio unico per tutto il pass, standard 100 m, modificabile.
  assert.match(dashboard, /id="geoMaxDistance" value="100"/);
  assert.match(dashboard, /Raggio \$\{radius\} m/);
  assert.match(dashboard, /te ne mancano/);
  // Fisarmonica chiusa dopo il salvataggio.
  assert.match(dashboard, /geoOpenIndex = null; \/\/ richiudi la fisarmonica/);
});

test('Challenge hides table head when gamEmptyHost is visible', () => {
  const js = readFd('fd-reward-challenge.js');
  const css = readFd('fd-reward-challenge.css');
  assert.match(js, /gamEmptyHost/);
  assert.match(js, /enhanceChallengeStatusBadges/);
  assert.match(css, /#gamEmptyHost:not\(\[hidden\]\)/);
});

test('PGA onboarding banner uses delegated click handler', () => {
  const js = readFd('fd-pga.js');
  assert.match(js, /handleOnboardingBannerClick/);
  assert.match(js, /data-pga-nav-enable/);
  assert.match(js, /data-pga-nav-experiences/);
});

test('Google Wallet HR pass resolves hub links like passkit', () => {
  const gw = read('src/engine/google-wallet.js');
  const ep = read('src/engine/employee-pass.js');
  assert.match(gw, /async function buildPassObject/);
  assert.match(gw, /resolveHrPassOptions/);
  assert.match(gw, /hubUrl: hrOpts\.hubUrl/);
  assert.match(gw, /function resolvePassKind/);
  assert.match(gw, /isHrEmployeePass\(brand\)\) return 'generic'/);
  assert.match(ep, /linkText \|\| s\.label/);
  assert.match(ep, /brandHasLogoAsset/);
  assert.match(gw, /brandConfigForHrPass/);
});

test('Geofencing copy distinguishes Apple text from Google POI support', () => {
  const dashboard = read('src/dashboard/index.html');
  const gw = read('src/engine/google-wallet.js');
  assert.match(dashboard, /Messaggio vicino al POI/);
  assert.match(dashboard, /Google lo usa come messaggio Wallet e riceve anche il punto come merchant location/);
  assert.match(dashboard, /Apple: \$\{passesTouched\}\/\$\{passCount\} pass aggiornati/);
  assert.match(dashboard, /nessun device Apple registrato/);
  assert.doesNotMatch(dashboard, /Messaggio lock screen \(solo Apple Wallet/);
  assert.match(gw, /merchantLocations/);
  assert.match(gw, /normalizeMerchantLocations/);
});

test('Geofencing save is silent: updates locations without notifying', () => {
  const routes = read('src/api/routes.js');
  const geofencePut = routes.match(/router\.put\('\/brands\/:id\/geofencing'[\s\S]*?router\.get\('\/analytics/)[0];
  // Aggiorna comunque i pass lato server e le location su Google...
  assert.match(geofencePut, /touchPassesByIds/);
  assert.match(geofencePut, /syncGoogleWalletObjectsForPasses\(\{/);
  // ...ma SENZA notifiche: niente APNs blast (generica) e niente AddMessage Google.
  assert.doesNotMatch(geofencePut, /sendPushBatch\(/);
  assert.doesNotMatch(geofencePut, /title:\s*'VICINO A TE'/);
});

test('Google Wallet HR toGooglePass uses brand name and generic layout fields', () => {
  process.env.GOOGLE_WALLET_PASS_KIND = 'loyalty';
  const { buildEmployeePass, toGooglePass } = require('../src/engine/employee-pass');
  const employeePass = buildEmployeePass({
    brand: {
      id: 'b1',
      name: 'Acme Corp',
      slug: 'acme',
      config: { product_line: 'hr', logos: { logo: Buffer.from('x').toString('base64') }, strip_base64: Buffer.from('y').toString('base64') }
    },
    template: { id: 't1', name: 'Internal Template Name', style: { backgroundColor: '#8B5CF6' } },
    instance: { id: 'pass-gw-1', serial_number: 'SN-GW-1', field_values: {} },
    member: { first_name: 'Mario', last_name: 'Rossi', department: 'HR' },
    brandConfig: { product_line: 'hr' },
    apiBase: 'https://studio.example.com/api/v1',
    coinBalance: 12
  });
  const { classPatch, objectPatch } = toGooglePass(employeePass, { passKind: 'generic' });
  assert.equal(classPatch.hexBackgroundColor.toLowerCase(), '#8b5cf6');
  assert.ok(classPatch.logo);
  assert.ok(classPatch.heroImage);
  assert.ok(objectPatch.logo);
  assert.ok(objectPatch.heroImage);
  assert.equal(objectPatch.cardTitle.defaultValue.value, 'Acme Corp');
  assert.equal(objectPatch.subheader.defaultValue.value, 'HR\n12 COIN');
  assert.equal(objectPatch.header.defaultValue.value, 'Mario Rossi');
  assert.match(objectPatch.logo.sourceUri.uri, /\/passes\/.*\/wallet-icon\.png$/);
  assert.match(employeePass.images.strip, /\/passes\/.*\/wallet-strip$/);
  assert.match(objectPatch.heroImage.sourceUri.uri, /\/passes\/.*\/wallet-strip$/);
  assert.equal(objectPatch.textModulesData.length, 0, 'COIN stays on the visible face, not in details');
  delete process.env.GOOGLE_WALLET_PASS_KIND;
});

test('Google Wallet HR strip URL uses safe cache buster for dated pass updates', () => {
  const { buildEmployeePass, toGooglePass } = require('../src/engine/employee-pass');
  const employeePass = buildEmployeePass({
    brand: {
      id: 'b1',
      name: 'Acme Corp',
      slug: 'acme',
      config: { product_line: 'hr', strip_base64: Buffer.from('y').toString('base64') }
    },
    template: { id: 't1', name: 'Template', style: {} },
    instance: {
      id: '9c42ca17-b4bf-4887-a4b1-228cea78aefb',
      serial_number: 'SN-GW-2',
      field_values: {},
      last_updated: 'Fri Jun 26 2026 15:26:43 GMT+0200'
    },
    member: { first_name: 'Mario', last_name: 'Rossi', department: 'HR' },
    brandConfig: { product_line: 'hr' },
    apiBase: 'https://studio.example.com/api/v1',
    coinBalance: 0
  });
  const { objectPatch } = toGooglePass(employeePass, { passKind: 'generic' });
  const uri = objectPatch.heroImage.sourceUri.uri;
  assert.match(uri, /\/wallet-strip\?v=\d+$/);
  assert.doesNotMatch(uri, /%20|%3A|GMT|Fri|Jun|\s/);
});

test('Google Wallet HR object includes current push back details', () => {
  const { buildEmployeePass, toGooglePass } = require('../src/engine/employee-pass');
  const employeePass = buildEmployeePass({
    brand: { id: 'b1', name: 'Acme Corp', config: { product_line: 'hr' } },
    template: { id: 't1', name: 'HR', style: {} },
    instance: {
      id: 'pass-gw-2',
      serial_number: 'SN-GW-2',
      field_values: {},
      push_announcement: {
        title: 'TEST',
        message: 'Messaggio fronte',
        back_details: 'Offerta valida fino a domenica.',
        ts: 1710000000001,
      },
    },
    member: { first_name: 'Mario', last_name: 'Rossi', department: 'HR' },
    brandConfig: { product_line: 'hr' },
    apiBase: 'https://studio.example.com/api/v1',
  });
  const { objectPatch } = toGooglePass(employeePass, { passKind: 'generic' });
  assert.equal(objectPatch.textModulesData.find((m) => m.id === 'wallet_push_alert'), undefined);
  assert.equal(objectPatch.textModulesData.find((m) => m.id === 'announcement'), undefined);
  const details = objectPatch.textModulesData.find((m) => m.id === 'push_back_details');
  assert.ok(details);
  assert.equal(details.header, ' ');
  assert.match(details.body, /Offerta valida/);
});

test('Google Wallet HR object includes dynamic push link in clickable links', () => {
  const { buildEmployeePass, toGooglePass } = require('../src/engine/employee-pass');
  const { withCurrentPushDetails } = require('../src/engine/google-wallet-sync');
  const pass = withCurrentPushDetails(
    {
      id: 'pass-gw-link',
      serial_number: 'SN-GW-LINK',
      field_values: {},
    },
    {
      title: 'PROMO',
      message: 'Messaggio',
      passLink: {
        label: 'Apri offerta',
        url: 'https://example.com/offerta',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    }
  );
  const employeePass = buildEmployeePass({
    brand: { id: 'b1', name: 'Acme Corp', config: { product_line: 'hr' } },
    template: { id: 't1', name: 'HR', style: {} },
    instance: pass,
    member: { first_name: 'Mario', last_name: 'Rossi', department: 'HR' },
    brandConfig: { product_line: 'hr' },
    apiBase: 'https://studio.example.com/api/v1',
  });
  const { objectPatch } = toGooglePass(employeePass, { passKind: 'generic' });
  const link = objectPatch.linksModuleData.uris.find((u) => u.id === 'dynamic_push_link');
  assert.ok(link);
  assert.equal(link.description, 'Apri offerta');
  assert.equal(link.uri, 'https://example.com/offerta');
});

test('Google Wallet HR wallet-strip route dependencies are exported', () => {
  const passkit = require('../src/engine/passkit');
  assert.equal(typeof passkit.isHrPassBrand, 'function');
  assert.equal(typeof passkit.loadHrStripBuffers, 'function');
  assert.equal(typeof passkit.composePushTextOnStrip, 'function');
});

test('Samsung Wallet UI frozen by default in Filo HR', () => {
  const { isSamsungWalletUiEnabled, activePushChannelKeys } = require('../src/engine/wallet-channels');
  const prev = process.env.SAMSUNG_WALLET_UI_ENABLED;
  delete process.env.SAMSUNG_WALLET_UI_ENABLED;
  assert.equal(isSamsungWalletUiEnabled(), false);
  assert.deepEqual(activePushChannelKeys(), ['apple', 'google']);
  process.env.SAMSUNG_WALLET_UI_ENABLED = 'true';
  assert.equal(isSamsungWalletUiEnabled(), true);
  assert.deepEqual(activePushChannelKeys(), ['apple', 'google', 'samsung']);
  if (prev === undefined) delete process.env.SAMSUNG_WALLET_UI_ENABLED;
  else process.env.SAMSUNG_WALLET_UI_ENABLED = prev;
  assert.match(read('src/filodiretto/fd-wallet-ui.js'), /data-samsung-wallet-ui/);
  assert.match(read('src/filodiretto/fd-push.js'), /fdActiveWalletChannelKeys/);
});

test('direct save thank-you page offers Google Wallet on Android', () => {
  const ty = read('src/engine/thank-you-html.js');
  const server = read('src/server.js');
  assert.match(ty, /stateAndroid/);
  assert.match(ty, /googleWalletBtn/);
  assert.match(ty, /google-wallet\/pass\//);
  assert.doesNotMatch(ty, /Scarica file \.pkpass/);
  assert.match(read('src/api/routes.js'), /\/passes\/:id\/wallet-strip/);
  assert.match(read('src/portal/portal.js'), /google-wallet\/pass\//);
});

test('W.AI FAB uses single JS click handler without inline onclick', () => {
  const html = read('src/dashboard/index.html');
  const wai = readFd('fd-wai.js');
  assert.doesNotMatch(html, /id="waiBtn"[^>]*onclick=/);
  assert.match(wai, /function bindWaiTrigger/);
  assert.match(wai, /removeAttribute\('onclick'\)/);
  assert.match(wai, /bindWaiControls/);
  assert.doesNotMatch(html, /fd-wai-inline-link[^>]*onclick="openWaiForAudience/);
  assert.match(html, /data-fd-wai-open[^>]*data-fd-wai-mode="audience"/);
});

test('W.AI API calls include auth headers', () => {
  const html = read('src/dashboard/index.html');
  assert.match(html, /function waiFetchHeaders/);
  const waiBlocks = html.match(/fetch\(`\$\{API\}\/wai\/[^`]+`[\s\S]*?\}\);/g) || [];
  assert.ok(waiBlocks.length >= 5, 'expected at least 5 W.AI fetch calls');
  waiBlocks.forEach((block) => {
    assert.match(block, /waiFetchHeaders\(\)/, 'W.AI fetch must use waiFetchHeaders()');
  });
});

test('Push history resend preserves the original strip image', () => {
  const db = read('src/db/index.js');
  const dispatch = read('src/engine/push-dispatch.js');
  const dashboard = read('src/dashboard/index.html');
  assert.match(db, /push_log ADD COLUMN IF NOT EXISTS strip_base64 TEXT/);
  assert.match(db, /INSERT INTO push_log[\s\S]*strip_base64/);
  assert.match(dispatch, /logPush\(\{[\s\S]*strip_base64:\s*overlayStrip \|\| null/);
  assert.match(dashboard, /if \(log\.strip_base64\) body\.strip_base64 = log\.strip_base64/);
});

test('Scheduled push uses the same wallet dispatch surface as immediate push', () => {
  const scheduler = read('src/engine/scheduler.js');
  const db = read('src/db/index.js');
  const routes = read('src/api/routes.js');
  const dashboard = read('src/dashboard/index.html');
  assert.match(scheduler, /normalizeHrPushPayload\(schedule\)/);
  assert.match(scheduler, /resolvePushScreenAlert\(normalized\)/);
  assert.match(scheduler, /resolvedStripBase64:\s*schedule\.strip_base64 \|\| null/);
  assert.match(db, /scheduled_push ADD COLUMN IF NOT EXISTS strip_base64 TEXT/);
  assert.match(db, /INSERT INTO scheduled_push[\s\S]*strip_base64/);
  assert.match(routes, /router\.post\('\/push\/scheduled'[\s\S]*resolvePushStripBase64/);
  assert.match(routes, /router\.post\('\/push\/scheduled'[\s\S]*normalizeHrPushPayload\(req\.body\)/);
  assert.match(dashboard, /id="schedStripPreview"/);
  assert.match(dashboard, /id="schedPassLinkUrl"/);
  assert.match(dashboard, /body\.strip_media_id = schedStripMediaId/);
  assert.match(dashboard, /DEFAULT_PUSH_TITLE/);
  assert.match(dashboard, /DEFAULT_PUSH_MESSAGE/);
});

test('Push immediate exposes screen alert, strip image and back copy fields', () => {
  const dashboard = read('src/dashboard/index.html');
  const fdPush = readFd('fd-push.js');
  assert.match(dashboard, /id="pushScreenAlert"/);
  assert.match(dashboard, /Notifica su lock screen/);
  assert.match(dashboard, /Retro pass/);
  assert.match(dashboard, /id="pushTitle" maxlength="22"/);
  assert.match(dashboard, /id="pushMessage"/);
  assert.match(dashboard, /fd-push-copy-block" style="margin-top:16px;display:none;"/);
  assert.match(fdPush, /SCREEN_ALERT_MAX = 110/);
  assert.match(fdPush, /function getPushScreenAlertValue/);
  assert.match(fdPush, /function getPushTitleValue/);
  assert.match(fdPush, /function getPushMessageValue/);
  assert.doesNotMatch(fdPush, /<li><strong>Titolo<\/strong>/);
  assert.doesNotMatch(fdPush, /<li><strong>Messaggio<\/strong>/);
});

test('Push pass link fields stay visible without an include checkbox', () => {
  const dashboard = read('src/dashboard/index.html');
  const fdPush = readFd('fd-push.js');
  const wai = read('src/engine/wai.js');
  assert.doesNotMatch(dashboard, /id="pushIncludePassLink"/);
  assert.doesNotMatch(fdPush, /pushIncludePassLink/);
  assert.match(dashboard, /id="pushPassLinkFields" style="display:block/);
  assert.match(fdPush, /var passLinkUrl = \(document\.getElementById\('pushPassLinkUrl'\)\?\.value \|\| ''\)\.trim\(\);[\s\S]*body\.include_pass_link = true/);
  assert.match(wai, /extractFirstUrlFromText/);
});

test('Push live preview stays clear of form and never leaves visible loading text', () => {
  const css = readFd('fd-push.css');
  const js = readFd('fd-push.js');
  const preview = read('src/engine/push-pass-preview.js');
  assert.doesNotMatch(css, /--fd-push-preview-nudge-x/);
  assert.match(css, /#pushPanel_immediate\.fd-push-panel--enhanced[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /#pushPanel_immediate \.fd-push-aside-col[\s\S]*display:\s*none !important/);
  assert.match(css, /#pushPanel_immediate\.fd-push-panel--enhanced > aside\.fd-push-preview[\s\S]*display:\s*none !important/);
  assert.doesNotMatch(css, /#pushPanel_immediate \.fd-push-aside-col \.fd-push-preview[\s\S]{0,320}position:\s*fixed/);
  assert.doesNotMatch(css, /transform:\s*translateX\(var\(--fd-push-preview-nudge-x\)\)/);
  assert.match(js, /function setStripPreviewLoading/);
  assert.match(js, /loading\.hidden = true/);
  assert.doesNotMatch(js, /loading\.hidden = false/);
  assert.match(preview, /if \(updatePass\) \{/);
  assert.doesNotMatch(preview, /updatePass && announcement\?\.message/);
});

test('Push progress counters show Apple and Google only', () => {
  const dashboard = read('src/dashboard/index.html');
  assert.match(dashboard, /pushProgressCounters" style="display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(dashboard, /id="pushProgressApple"/);
  assert.match(dashboard, /id="pushProgressGoogle"/);
  assert.doesNotMatch(dashboard, /id="pushProgressSamsung"/);
  assert.doesNotMatch(dashboard, /document\.getElementById\('pushProgressSamsung'\)/);
});

test('Push audience filter lives near final targeting controls', () => {
  const dashboard = read('src/dashboard/index.html');
  const linkedIdx = dashboard.indexOf('id="pushLinkedContent"');
  const audienceIdx = dashboard.indexOf('id="pushAudienceTarget"');
  const sendErrorIdx = dashboard.indexOf('id="pushSendError"');
  assert.ok(linkedIdx > -1, 'push linked content control exists');
  assert.ok(audienceIdx > linkedIdx, 'audience should be after linked content');
  assert.ok(sendErrorIdx > audienceIdx, 'audience should remain before send feedback and CTA');
});

test('Push test device helper explains installed wallet source', () => {
  const js = readFd('fd-push.js');
  assert.match(js, /pass\/device da usare per i test/);
  assert.match(js, /pass gia installati o salvati nel Wallet/);
});

test('Passes can be marked as push test devices', () => {
  const db = read('src/db/index.js');
  const dashboard = read('src/dashboard/index.html');
  const passesJs = readFd('fd-passes.js');
  const pushJs = readFd('fd-push.js');
  assert.match(db, /pass_instances ADD COLUMN IF NOT EXISTS is_test_device BOOLEAN DEFAULT FALSE/);
  assert.match(db, /updates\.push\(`is_test_device = \$\$\{p\}`\)/);
  assert.match(dashboard, /data-pass-test-device="\$\{isTestDevice \? '1' : '0'\}"/);
  assert.match(dashboard, /pass-test-badge/);
  assert.match(dashboard, /'Device di prova'/);
  assert.match(passesJs, /data-action="toggle-test"/);
  assert.match(passesJs, /JSON\.stringify\(\{ is_test_device: !!enabled \}\)/);
  assert.match(pushJs, /TEST ·/);
  assert.match(pushJs, /window\.refreshTestPassOptions = loadTestPasses/);
});

test('Push send shows mailing-style progress counters', () => {
  const dashboard = read('src/dashboard/index.html');
  const dispatch = read('src/engine/push-dispatch.js');
  const gwSync = read('src/engine/google-wallet-sync.js');
  assert.match(dashboard, /id="pushProgressPanel"/);
  assert.match(dashboard, /function setPushProgressPanel/);
  assert.match(dashboard, /setPushProgressPanel\(job\)/);
  assert.match(dashboard, /pushProgressApple/);
  assert.match(dashboard, /pushProgressGoogle/);
  assert.doesNotMatch(dashboard, /pushProgressSamsung/);
  assert.match(dispatch, /phase:\s*'targets'/);
  assert.match(dispatch, /phase:\s*'google'/);
  assert.match(dispatch, /phase:\s*'apns'/);
  assert.match(gwSync, /onProgress = null/);
  assert.match(gwSync, /processed\+\+/);
});

test('HR dashboard distinguishes Google object/update status from confirmed install', () => {
  const dashboard = read('src/dashboard/index.html');
  const routes = read('src/api/routes.js');
  const db = read('src/db/index.js');
  assert.match(routes, /google_wallet_object_id:\s*m\.google_wallet_object_id/);
  assert.match(routes, /google_update_count:\s*m\.google_update_count/);
  assert.match(routes, /link_generation_hasUsers/);
  assert.match(db, /pi\.google_update_count/);
  assert.match(dashboard, /function passGoogleUpdateOk/);
  assert.match(dashboard, /Google update OK/);
  assert.match(dashboard, /Google object/);
  assert.match(dashboard, /Device \/ object ID/);
  assert.match(dashboard, /GOOGLE ·/);
  assert.doesNotMatch(dashboard, /Google pending<\/span>/);
});

test('HR pass table uses compact install check/cross icons', () => {
  const dashboard = read('src/dashboard/index.html');
  assert.match(dashboard, /function passInstallStatusBadge/);
  assert.match(dashboard, /fd-install-icon--ok/);
  assert.match(dashboard, /fd-install-icon--ko/);
  assert.match(dashboard, /passGoogleUpdateOk\(p\)/);
  assert.doesNotMatch(dashboard, /return '<span class="badge inactive" title="Solo generato, non salvato nel wallet">Non installato<\/span>'/);
});

test('HR wallet columns use simplified channel wording', () => {
  const dashboard = read('src/dashboard/index.html');
  assert.match(dashboard, /if \(passGoogleSaved\(l\) \|\| passGoogleUpdateOk\(l\) \|\| l\.google_wallet_object_id\) parts\.push\('Google'\)/);
  assert.doesNotMatch(dashboard, /parts\.push\('Google update OK'\)/);
  assert.doesNotMatch(dashboard, /parts\.push\('Google object'\)/);
  assert.doesNotMatch(dashboard, />Apple · Google · Samsung</);
  assert.doesNotMatch(dashboard, /walletReachHtml/);
});

test('Google Wallet sync promotes hasUsers responses to confirmed install', () => {
  const gwSync = read('src/engine/google-wallet-sync.js');
  assert.match(gwSync, /updateGoogleWalletStatus/);
  assert.match(gwSync, /updatePassDeviceId/);
  assert.match(gwSync, /serverObject\?\.hasUsers/);
});

test('dashboard brand theme is derived from uploaded brand assets', () => {
  const dashboard = read('src/dashboard/index.html');
  const routes = read('src/api/routes.js');
  const walletLogo = read('src/engine/brand-wallet-logo.js');
  assert.match(walletLogo, /next\.brand_theme = \{/);
  assert.match(walletLogo, /accent:\s*palette\.labelColor/);
  assert.match(routes, /extractBrandPaletteFromImage/);
  assert.match(routes, /cfg\.brand_theme = \{/);
  assert.match(dashboard, /function applyDashboardBrandTheme/);
  assert.match(dashboard, /--fd-color-primary-500/);
  assert.match(dashboard, /--accent-subtle/);
  assert.match(dashboard, /applyBrandTheme\(\)/);
});

test('Public HR activation surfaces inherit brand theme and logo', () => {
  const routes = read('src/api/routes.js');
  const themeModule = read('src/engine/public-brand-theme.js');
  const join = read('src/join/index.html');
  const activate = read('src/activate/index.html');
  const privacy = read('src/privacy/index.html');
  const mailer = read('src/engine/mailer.js');
  const hrActivation = read('src/engine/hr-activation.js');
  const hubPwa = read('src/api/hub-pwa.js');
  const brandWalletLogo = read('src/engine/brand-wallet-logo.js');
  assert.match(themeModule, /function publicBrandTheme/);
  assert.match(themeModule, /cfg\.brand_theme/);
  assert.match(routes, /publicBrandTheme/);
  assert.match(routes, /logo_url:\s*publicBrandLogoPath\(brand\)/);
  assert.match(routes, /\/brands\/by-slug\/:slug\/mark/);
  assert.match(routes, /resolveBrandMarkRawBuffer/);
  assert.match(routes, /brand_theme:\s*publicBrandTheme\(brand\)/);
  assert.match(join, /function applyBrandChrome/);
  assert.match(join, /setProperty\('--brand', accent\)/);
  assert.match(activate, /function applyBrandChrome/);
  assert.match(activate, /setProperty\('--brand', accent\)/);
  assert.match(privacy, /cfg\.brand_theme/);
  assert.match(mailer, /function buildEmployeeWalletEmailHtml/);
  assert.match(mailer, /brandLogo\?\.cid/);
  assert.match(mailer, /width:72px;height:72px/);
  assert.match(mailer, /object-fit:cover/);
  assert.match(hrActivation, /function publicBrandLogoUrl/);
  assert.match(hrActivation, /absolutePublicBrandMarkUrl/);
  // Helpers logo/URL pubblici estratti in auth-helpers.js (split di routes.js).
  const authHelpers = read('src/api/auth-helpers.js');
  assert.match(authHelpers, /function buildPublicBrandLogoUrl/);
  assert.match(authHelpers, /const logoUrl = buildPublicBrandLogoUrl\(brand\)/);
  assert.match(authHelpers, /brandLogo:\s*logoUrl \? \{ url: logoUrl \} : null/);
  assert.match(hrActivation, /activationEmailBrandContext/);
  assert.match(hubPwa, /public-brand-theme/);
  assert.match(hubPwa, /accent_color:\s*theme\?\.accent \|\| settings\?\.accent_color \|\| '#8B5CF6'/);
  assert.match(hubPwa, /publicBrandMarkUrl/);
  assert.match(hubPwa, /absolutePublicAsset\(publicBrandMarkUrl\(brand\)\)/);
  assert.match(hubPwa, /mark_url: markUrl/);
  assert.match(brandWalletLogo, /function publicPassLogoUrl/);
  assert.match(brandWalletLogo, /function publicBrandMarkUrl/);
  assert.match(brandWalletLogo, /function absolutePublicBrandMarkUrl/);
  assert.match(brandWalletLogo, /Square notification icon only/);
  assert.doesNotMatch(brandWalletLogo, /resolveBrandMarkRawBuffer[\s\S]{0,220}resolveBrandLogoRawBuffer/);
  assert.match(brandWalletLogo, /\/logo\?/);
  assert.match(mailer, /resolveEmployeeEmailLogo/);
  assert.match(mailer, /inlineLogoAttachment && !brandLogo\?\.url/);
  assert.match(hrActivation, /context\.brandLogo = \{ url: logoUrl \}/);
});

test('Hub mobile uses DEAL PGA COIN labels and current brand logo surface', () => {
  const hubApp = read('src/hub/app.js');
  const hubCss = read('src/hub/hub.css');
  const hubSw = read('src/hub/sw.js');
  assert.match(hubApp, />DEAL<\/a>/);
  assert.match(hubApp, />PGA<\/a>/);
  assert.match(hubApp, />COIN<\/a>/);
  assert.match(hubApp, /hub-title'\)\.textContent = 'PGA'/);
  assert.match(hubApp, /hub-title'\)\.textContent = 'COIN'/);
  assert.doesNotMatch(hubApp, /PGA Marketplace/);
  assert.doesNotMatch(hubApp, />PROFILO<\/a>/);
  assert.doesNotMatch(hubApp, /subtitle\.textContent = state\.brand\.name/);
  assert.match(hubApp, /hub_bootstrap_v4/);
  assert.match(hubApp, /resolveAssetUrl/);
  assert.match(hubApp, /applyBrandedIcons/);
  assert.match(hubApp, /state\.brand\?\.mark_url \|\| state\.settings\?\.logo_url \|\| state\.brand\?\.logo_url/);
  assert.match(hubCss, /\.hub-logo\s*\{[\s\S]*width:\s*60px;[\s\S]*height:\s*60px;[\s\S]*object-fit:\s*cover;[\s\S]*background:\s*#fff;/);
  assert.match(hubCss, /\.hub-subtitle\s*\{[\s\S]*display:\s*none !important/);
  assert.match(hubSw, /filodiretto-hub-v6/);
});

test('Employee portal hides legacy level field from personal profile', () => {
  const portalApi = read('src/api/portal-routes.js');
  const portalJs = read('src/portal/portal.js');
  assert.doesNotMatch(portalJs, /label:\s*'Livello'/);
  assert.doesNotMatch(portalJs, /fv\('livello', 'level'/);
  assert.doesNotMatch(portalApi, /'livello'/);
  assert.doesNotMatch(portalApi, /'level'/);
  assert.match(portalApi, /brand_theme:\s*publicBrandTheme/);
  assert.match(portalApi, /logo_url:\s*absolutePublicAsset\(publicBrandMarkUrl/);
  assert.match(portalJs, /function applyBrandTheme/);
  assert.match(portalJs, /function resolveAssetUrl/);
  assert.match(portalJs, /function applyBrandedIcons/);
  assert.match(portalJs, /setProperty\('--accent', accent\)/);
});

test('push dispatch keeps overlayStrip in function scope for final logging', () => {
  const dispatch = read('src/engine/push-dispatch.js');
  assert.match(dispatch, /let overlayStrip = null;[\s\S]*if \(update_pass !== false\)/);
  assert.doesNotMatch(dispatch, /if \(update_pass !== false\) \{[\s\S]{0,260}let overlayStrip/);
});

test('Google Wallet sync reloads passes after push strip overlay update', () => {
  const dispatch = read('src/engine/push-dispatch.js');
  assert.match(dispatch, /await updatePassPushOverlays\(targetPasses\.map\(\(p\) => p\.id\),/);
  assert.match(dispatch, /await touchPassesByIds\(targetPasses\.map\(\(p\) => p\.id\)\);[\s\S]{0,180}targetPasses = await getTargetPassesForPush\(brand_id, pushTargetOpts\);/);
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'src/dashboard/index.html'), 'utf8');
const biCss = fs.readFileSync(path.join(root, 'src/dashboard/styles/a2w-brand-identity.css'), 'utf8');
const chromeCss = fs.readFileSync(path.join(root, 'src/dashboard/styles/a2w-chrome.css'), 'utf8');
const shellJs = fs.readFileSync(path.join(root, 'src/dashboard/js/a2w-shell.js'), 'utf8');

test('brand identity traccia dirty state con baseline serializzato', () => {
  assert.match(indexHtml, /brandIdentityState\s*=\s*\{[\s\S]*dirty:\s*false[\s\S]*baseline:/);
  assert.match(indexHtml, /function a2wBiSerializeState\(/);
  assert.match(indexHtml, /brandIdentityState\.dirty = current !== brandIdentityState\.baseline/);
});

test('salva modifiche disabilitato quando pulito e abilitato solo se dirty', () => {
  assert.match(indexHtml, /function a2wBiRefreshSaveUi\(/);
  assert.match(indexHtml, /if \(brandIdentityState\.dirty\)/);
  assert.match(indexHtml, /btn\.disabled = false/);
  assert.match(indexHtml, /btn\.disabled = true[\s\S]*Nessuna modifica da salvare/);
});

test('badge riflette dirty, salvataggio e stato salvato relativo', () => {
  assert.match(indexHtml, /Modifiche non salvate/);
  assert.match(indexHtml, /Salvataggio…/);
  assert.match(indexHtml, /formatRelativeSavedLabel/);
  assert.match(indexHtml, /a2wBiStartSavedLabelTicker/);
  assert.match(indexHtml, /id="a2wBiSaveStateBadge"[^>]*aria-live="polite"/);
});

test('css distingue bottone salvataggio inattivo vs dirty attivo', () => {
  assert.match(biCss, /\.a2w-bi-save-btn:disabled:not\(\.is-saving\)/);
  assert.match(biCss, /\.a2w-bi-save-btn\.is-dirty:not\(:disabled\)/);
  assert.match(biCss, /--a2w-action-primary/);
});

test('brand identity senza riepilogo collassabile o anteprima pass wallet', () => {
  assert.doesNotMatch(indexHtml, /a2wBiSummaryDisclosure/);
  assert.doesNotMatch(indexHtml, /a2w-bi-summary-disclosure/);
  assert.doesNotMatch(indexHtml, /a2w-bi-preview-column/);
  assert.doesNotMatch(indexHtml, /a2w-bi-preview-tabs/);
  assert.doesNotMatch(indexHtml, /a2w-bi-pass-preview/);
  assert.doesNotMatch(biCss, /\.a2w-bi-summary-disclosure/);
  assert.doesNotMatch(biCss, /\.a2w-bi-pass-preview/);
});

test('brand identity layout: colonna unica con sezioni a griglia interna', () => {
  assert.doesNotMatch(indexHtml, /id="a2wBiPreviewMobileToggle"/);
  assert.match(biCss, /\.a2w-bi-layout[\s\S]*display:\s*block/);
  assert.match(biCss, /\.a2w-bi-layout[\s\S]*width:\s*100%/);
  assert.match(biCss, /\.a2w-bi-main[\s\S]*flex-direction:\s*column/);
  assert.match(biCss, /\.a2w-bi-main[\s\S]*width:\s*100%/);
  assert.match(biCss, /\.a2w-bi-section[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(biCss, /\.a2w-bi-section \.a2w-bi-section__head[\s\S]*grid-column:\s*1\s*\/\s*-1/);
  assert.match(biCss, /\.a2w-bi-contact-grid/);
  assert.match(biCss, /max-width:\s*1400px/);
});

test('media library layout: tab singolo bucket e crop editor intatto', () => {
  assert.match(indexHtml, /id="a2wMediaTabs"/);
  assert.match(indexHtml, /a2w-media-buckets-grid--tabs/);
  assert.match(indexHtml, /data-media-type="wallet_icon"/);
  assert.match(indexHtml, /id="mediaCropModal"/);
  assert.match(indexHtml, /id="mediaCropCanvas"/);
  assert.match(indexHtml, /id="mediaCropZoom"/);
  assert.match(indexHtml, /id="mediaCropSpecLabel"/);
  assert.match(indexHtml, /function openMediaCropEditor\(/);
  assert.match(indexHtml, /function drawMediaCropCanvas\(/);
  assert.match(indexHtml, /function onMediaCropZoomInput\(/);
  assert.match(indexHtml, /function applyMediaCropEditor\(/);
  assert.match(indexHtml, /function resetMediaCropEditor\(/);
  assert.match(indexHtml, /function bindMediaCropCanvasEvents\(/);
  assert.match(indexHtml, /onclick="openMediaCropEditor\(\)"/);
  assert.match(indexHtml, /onclick="applyMediaCropEditor\(\)"/);
  assert.doesNotMatch(indexHtml, /id="mediaCropModal"[\s\S]{0,400}a2w-media-buckets-grid/);
  assert.match(chromeCss, /\.a2w-media-buckets-grid--tabs/);
  assert.match(chromeCss, /\.a2w-media-tabs__tab/);
  assert.match(chromeCss, /\.a2w-media-buckets-grid--tabs > \.a2w-media-bucket\.is-active/);
  assert.match(shellJs, /function a2wEnsureMediaTabs/);
  assert.match(shellJs, /window\.getA2wActiveMediaTabType/);
  ['logo', 'wallet_icon', 'strip', 'background'].forEach((type) => {
    assert.match(indexHtml, new RegExp(`${type}:\\s*\\{[^}]+w:\\s*\\d+`));
  });
});

test('Filo brand identity preview maps camelCase contact fields', () => {
  const biJs = fs.readFileSync(path.join(root, 'src/filodiretto/fd-brand-identity.js'), 'utf8');
  assert.match(biJs, /fieldVal\(data, 'supportEmail'/);
  assert.match(biJs, /scheduleAsideSummary/);
});

test('brand identity non mostra sezione asset inline (solo Media Library)', () => {
  assert.doesNotMatch(indexHtml, /a2w-bi-section--assets/);
  assert.doesNotMatch(indexHtml, /Logo e immagini chiave/);
  assert.doesNotMatch(indexHtml, /id="a2wBiAssetsGrid"/);
  assert.doesNotMatch(indexHtml, /id="a2wBiOpenMediaLibraryBtn"/);
  assert.match(indexHtml, /function isBrandIdentityAssetUiExcluded/);
  assert.match(indexHtml, /function a2wBiRemoveLegacyAssetUi/);
  assert.match(indexHtml, /Le immagini del brand si gestiscono in Immagini e loghi/);
  assert.match(biCss, /#brand-identity \.a2w-bi-section:has\(#a2wBiAssetsGrid\)/);
  assert.match(biCss, /preview-column/);
});

test('media library include bucket wallet_icon', () => {
  assert.match(indexHtml, /id="mediaWalletIconGrid"/);
  assert.match(indexHtml, /512×512 px/);
  assert.match(indexHtml, /data-type="wallet_icon"/);
  assert.match(indexHtml, /<option value="wallet_icon">Icona notifiche Wallet<\/option>/);
});

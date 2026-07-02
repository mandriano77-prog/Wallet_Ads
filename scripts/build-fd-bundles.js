#!/usr/bin/env node
/**
 * Concatena CSS/JS FiloDiretto in bundle singoli e li minifica con esbuild.
 * I file JS condividono lo scope globale (nessun module system): l'ordine di
 * concatenazione è parte del contratto, esbuild fa solo transform (no bundling),
 * quindi i top-level identifier NON vengono rinominati.
 *
 * Output:
 *   fd.bundle.js        — minificato, con sourceMappingURL
 *   fd.bundle.js.map    — source map verso fd.bundle.src.js
 *   fd.bundle.src.js    — concatenazione leggibile (con marker per-file) per il debug
 *   fd.bundle.css       — minificato
 *   fd.bundle.manifest.json
 *
 * Uso: node scripts/build-fd-bundles.js  (npm run build:fd-bundles)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const FD = path.join(ROOT, 'src', 'filodiretto');

const CSS_FILES = [
  'tokens.css', 'fd-theme.css', 'fd-typography.css', 'fd-buttons.css', 'fd-components.css', 'fd-header.css',
  'fd-layout.css', 'fd-wide-layout.css', 'fd-mobile-gate.css', 'fd-wai.css', 'fd-brand-switcher.css', 'fd-nav.css', 'fd-brand-identity.css',
  'fd-brand-scope.css', 'fd-brand-pass-flow.css', 'fd-home.css', 'fd-users.css', 'fd-contacts.css',
  'fd-media-library.css', 'fd-templates.css', 'fd-passes.css',
  'fd-destructive.css', 'fd-form-dirty.css', 'fd-form-help.css', 'fd-empty-states.css', 'fd-page-states.css',
  'fd-danger-zone.css', 'fd-wallet-ui.css', 'fd-push.css', 'fd-reward-challenge.css',   'fd-analytics.css', 'fd-audiences.css', 'fd-conventions.css', 'fd-pga.css', 'fd-activity-log.css', 'fd-responsive-tables.css', 'fd-rbac.css', 'fd-profile.css',
];

const JS_FILES = [
  'fd-buttons.js', 'fd-header.js', 'fd-layout.js', 'fd-mobile-gate.js', 'fd-wai.js', 'fd-brand-switcher.js',
  'fd-icons.js', 'fd-nav.js', 'fd-legacy-campaigns.js', 'fd-hr-copy.js', 'fd-brand-scope.js', 'fd-brand-identity.js',
  'fd-brand-pass-flow.js', 'fd-home.js', 'fd-users.js', 'fd-contacts.js', 'fd-media-library.js',
  'fd-templates.js', 'fd-passes.js', 'fd-destructive.js', 'fd-form-dirty.js',
  'fd-form-help.js', 'fd-form-a11y.js', 'fd-empty-states.js', 'fd-page-states.js', 'fd-danger-zone.js',
  'fd-rbac.js', 'fd-wallet-ui.js', 'fd-push.js', 'fd-reward-challenge.js', 'fd-analytics.js', 'fd-audiences.js', 'fd-conventions.js', 'fd-pga.js', 'fd-pga-engagement.js', 'fd-activity-log.js', 'fd-responsive-tables.js', 'fd-profile.js',
];

function concat(files, dir) {
  return files.map((f) => {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) throw new Error('Missing: ' + p);
    return '/* === ' + f + ' === */\n' + fs.readFileSync(p, 'utf8');
  }).join('\n\n');
}

const cssRaw = concat(CSS_FILES, FD);
const jsRaw = concat(JS_FILES, FD);

// --- JS: minify + source map (transform, non bundle: niente rename dei top-level) ---
const jsResult = esbuild.transformSync(jsRaw, {
  loader: 'js',
  minify: true,
  keepNames: true, // codice legacy può leggere fn.name — non rischiamo per pochi KB
  charset: 'utf8',
  sourcemap: true,
  sourcefile: 'fd.bundle.src.js',
  logLevel: 'warning',
});
const bundleJs = jsResult.code + '\n//# sourceMappingURL=fd.bundle.js.map\n';

// --- CSS: minify (sostituisce il vecchio minificatore regex + protezione calc) ---
const cssResult = esbuild.transformSync(cssRaw, {
  loader: 'css',
  minify: true,
  charset: 'utf8',
  logLevel: 'warning',
});

fs.writeFileSync(path.join(FD, 'fd.bundle.js'), bundleJs);
fs.writeFileSync(path.join(FD, 'fd.bundle.js.map'), jsResult.map);
fs.writeFileSync(path.join(FD, 'fd.bundle.src.js'), jsRaw);
fs.writeFileSync(path.join(FD, 'fd.bundle.css'), cssResult.code);

// Fail the build if minified JS does not parse (e.g. stray commas in source).
try {
  new vm.Script(bundleJs, { filename: 'fd.bundle.js' });
} catch (err) {
  throw new Error('fd.bundle.js syntax error after minify: ' + err.message);
}

const manifest = {
  builtAt: new Date().toISOString(),
  minifier: 'esbuild ' + esbuild.version,
  cssFiles: CSS_FILES.length,
  jsFiles: JS_FILES.length,
  cssBytes: fs.statSync(path.join(FD, 'fd.bundle.css')).size,
  jsBytes: fs.statSync(path.join(FD, 'fd.bundle.js')).size,
  jsMapBytes: fs.statSync(path.join(FD, 'fd.bundle.js.map')).size,
  requestsBefore: CSS_FILES.length + JS_FILES.length,
  requestsAfter: 2,
};

fs.writeFileSync(path.join(FD, 'fd.bundle.manifest.json'), JSON.stringify(manifest, null, 2));

console.log('FiloDiretto bundles written:', manifest);

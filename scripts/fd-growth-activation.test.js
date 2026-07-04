'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('PGA toggle uses fd-switch with bounded control size', () => {
  const js = read('src/filodiretto/fd-pga.js');
  const css = read('src/filodiretto/fd-pga.css');
  assert.match(js, /fd-switch__input/);
  assert.match(js, /aria-label="Attiva PGA/);
  assert.match(css, /\.fd-switch__track/);
  assert.match(css, /width:\s*36px/);
  assert.match(css, /height:\s*20px/);
});

test('PGA catalog exposes combinable experience filters', () => {
  const js = read('src/filodiretto/fd-pga.js');
  assert.match(js, /pgaExpSearch/);
  assert.match(js, /pgaExpCategoryFilter/);
  assert.match(js, /pgaExpTypeFilter/);
  assert.match(js, /pgaExpStatusFilter/);
  assert.match(js, /filteredExperiences/);
});

test('PGA onboarding banner links steps 2 and 3', () => {
  const js = read('src/filodiretto/fd-pga.js');
  assert.match(js, /data-pga-nav-enable/);
  assert.match(js, /data-pga-nav-experiences/);
});

test('Engagement KPIs always render numeric values with loading skeleton', () => {
  const js = read('src/filodiretto/fd-pga-engagement.js');
  assert.match(js, /renderKpiSkeleton/);
  assert.match(js, /formatKpiNumber/);
  assert.match(js, /fd-pga-kpi-grid--loading/);
  assert.doesNotMatch(js, /if \(!a\) \{\s*host\.innerHTML = '';/);
});

test('Convenzioni subtitle and grouped KPI layout', () => {
  const html = read('src/dashboard/index.html');
  const js = read('src/filodiretto/fd-conventions.js');
  const css = read('src/filodiretto/fd-conventions.css');
  assert.match(html, /conventionsPageBlurb/);
  assert.match(js, /fd-conventions-kpi-group/);
  assert.match(css, /fd-conventions-kpi-groups/);
});

test('Reward table empty state hides thead and formats redemption rate', () => {
  const js = read('src/filodiretto/fd-reward-challenge.js');
  assert.match(js, /syncEngagementTableHead/);
  assert.match(js, /formatRedemptionRate/);
  assert.match(js, /if \(plays <= 0\) return '—'/);
  assert.match(js, /fd-th-help-tip/);
  assert.match(js, /positionThHelpTip/);
});

test('Push preview and unified channel segmented control', () => {
  const js = read('src/filodiretto/fd-push.js');
  const css = read('src/filodiretto/fd-push.css');
  assert.match(js, /String\(titleRaw \|\| ''\)\.trim\(\)/);
  assert.match(js, /toggleChannel/);
  assert.match(js, /channelsToApiValue/);
  assert.match(js, /sel\.setAttribute\('hidden'/);
  assert.match(css, /fd-push-channel-native/);
  assert.match(css, /#pushPanel_immediate\.fd-push-panel--enhanced[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /#pushPanel_immediate \.fd-push-aside-col[\s\S]*display:\s*none !important/);
  assert.doesNotMatch(css, /#pushPanel_immediate \.fd-push-aside-col \.fd-push-preview[\s\S]{0,320}position:\s*fixed/);
});

test('index.html bundle cache references current Filo bundle tag', () => {
  const html = read('src/dashboard/index.html');
  assert.match(html, /fd\.bundle\.css\?v=20260704-backcarrier/);
  assert.match(html, /fd\.bundle\.js\?v=20260704-backcarrier/);
});

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const rbac = require('../src/engine/rbac');
const { getWaiModelFallbacks } = require('../src/engine/ai-models');
const { validateWaiResponse } = require('../src/engine/wai');

test('W.AI routes classify under push so sender is not blanket-blocked', () => {
  const ask = rbac.enforceApiPermission({ role: 'sender', brand_id: 'b1' }, 'POST', '/wai/ask');
  assert.equal(ask.ok, true);

  const execute = rbac.enforceApiPermission({ role: 'sender', brand_id: 'b1' }, 'POST', '/wai/execute');
  assert.equal(execute.ok, true);

  const history = rbac.enforceApiPermission({ role: 'sender', brand_id: 'b1' }, 'GET', '/wai/history');
  assert.equal(history.ok, true);

  const stripSave = rbac.enforceApiPermission({ role: 'sender', brand_id: 'b1' }, 'POST', '/wai/strip-save');
  assert.equal(stripSave.ok, true);
});

test('reporter cannot call W.AI write endpoints', () => {
  const ask = rbac.enforceApiPermission({ role: 'reporter', brand_id: 'b1' }, 'POST', '/wai/ask');
  assert.equal(ask.ok, false);
  assert.equal(ask.status, 403);
});

test('sender can execute push W.AI intents but not audience.create', () => {
  assert.equal(rbac.canExecuteWaiIntent('sender', 'push.send'), true);
  assert.equal(rbac.canExecuteWaiIntent('sender', 'strip.generate'), true);
  assert.equal(rbac.canExecuteWaiIntent('sender', 'audience.create'), false);
  assert.equal(rbac.canExecuteWaiIntent('manager', 'audience.create'), true);
});

test('getWaiModelFallbacks chains opus 4.7 to opus 4.6 then sonnet', () => {
  const chain = getWaiModelFallbacks('claude-opus-4-7');
  assert.deepEqual(chain, ['claude-opus-4-6', 'claude-sonnet-4-6']);
});

test('W.AI push uses HR push limits and passes generated strip to wallet update', () => {
  const wai = fs.readFileSync(path.join(__dirname, '../src/engine/wai.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '../src/api/routes.js'), 'utf8');
  assert.match(wai, /PUSH_TITLE_MAX/);
  assert.match(wai, /PUSH_MESSAGE_MAX/);
  assert.match(wai, /WAI_MAX_TOKENS/);
  assert.match(wai, /extractWaiJsonWithRepair/);
  assert.match(wai, /invalid JSON response, attempting repair/);
  assert.match(wai, /W\.AI ha generato una risposta JSON non valida/);
  assert.doesNotMatch(wai, /slice\(0,\s*60\)/);
  assert.doesNotMatch(wai, /slice\(0,\s*180\)/);
  assert.match(routes, /resolvedStripBase64:\s*stripBase64/);
  assert.match(routes, /no badges, no stickers, no circles/);
});

test('W.AI push derives screen_alert from title and message when omitted', () => {
  const out = validateWaiResponse({
    intent: 'push.send',
    type: 'create',
    payload: { title: '2X1 OCCHIALI', message: 'Solo questa settimana' },
    preview: { summary: '', details: {}, warnings: [] }
  }, 'brand-1', 'manda una push a tutti');
  assert.equal(out.payload.screen_alert, '2X1 OCCHIALI: Solo questa settimana');

  const explicit = validateWaiResponse({
    intent: 'push.schedule',
    type: 'create',
    payload: {
      title: 'PROMO',
      message: 'Dettagli sul pass',
      screen_alert: 'PROMO WEEKEND: sconti fino al 50% in tutti i punti vendita',
      schedule_type: 'once',
      date: '2099-01-01'
    },
    preview: { summary: '', details: {}, warnings: [] }
  }, 'brand-1', 'programma una push');
  assert.equal(explicit.payload.screen_alert, 'PROMO WEEKEND: sconti fino al 50% in tutti i punti vendita');
});

test('W.AI push preserves back details and pass link like manual push', () => {
  const out = validateWaiResponse({
    intent: 'push.send',
    type: 'create',
    payload: {
      title: 'INFO PASS',
      message: 'Apri il pass per i dettagli',
      back_details: 'Promo valida fino a domenica. Mostra il pass in cassa.',
      pass_link_url: 'https://example.com/promo',
      pass_link_label: 'Apri promo'
    },
    preview: { summary: '', details: {}, warnings: [] }
  }, 'brand-1', 'manda una push a tutti con dettagli retro e link');

  assert.equal(out.payload.back_details, 'Promo valida fino a domenica. Mostra il pass in cassa.');
  assert.equal(out.payload.include_pass_link, true);
  assert.equal(out.payload.pass_link_url, 'https://example.com/promo');
  assert.equal(out.payload.channel, 'all');
});

test('W.AI and wallet dispatcher default to all available wallet channels', () => {
  const wai = fs.readFileSync(path.join(__dirname, '../src/engine/wai.js'), 'utf8');
  const assistant = fs.readFileSync(path.join(__dirname, '../src/engine/push-assistant.js'), 'utf8');
  const dispatch = fs.readFileSync(path.join(__dirname, '../src/engine/push-dispatch.js'), 'utf8');
  assert.match(wai, /usa sempre "all" salvo richiesta esplicita/);
  assert.match(assistant, /return 'all';/);
  assert.match(dispatch, /channel = 'all'/);
  assert.match(dispatch, /String\(channel \|\| 'all'\)/);
  assert.match(dispatch, /return \[\.\.\.allowed\]/);
});

test('Apple HR pass applies Wallet lock-screen copy on changed header field', () => {
  const employeePass = fs.readFileSync(path.join(__dirname, '../src/engine/employee-pass.js'), 'utf8');
  assert.match(employeePass, /function buildPushLockScreenBackSection/);
  assert.match(employeePass, /function buildPushAnnouncementField/);
  assert.match(employeePass, /function mergePushAlertIntoHeaderHint/);
  assert.match(employeePass, /changeMessage/);
  assert.match(employeePass, /key: 'announcement'/);
  assert.match(employeePass, /changeMessage: `\$\{alertText\}%@`/);
  assert.doesNotMatch(employeePass, /key: 'wallet_push_alert'/);
  assert.doesNotMatch(employeePass, /key: 'screen_alert'/);
  assert.match(employeePass, /key: 'push_back_details'/);
  assert.doesNotMatch(employeePass, /push_back_details[\s\S]{0,120}changeMessage: buildPushChangeMessage/);
});

test('W.AI push extracts pass link from prompt when model omits link fields', () => {
  const out = validateWaiResponse({
    intent: 'push.send',
    type: 'create',
    payload: {
      title: 'INFO PASS',
      message: 'Apri il pass per i dettagli',
      back_details: 'Compila il questionario entro venerdì.'
    },
    preview: { summary: '', details: {}, warnings: [] }
  }, 'brand-1', 'manda push a tutti con link https://example.com/questionario');

  assert.equal(out.payload.include_pass_link, true);
  assert.equal(out.payload.pass_link_url, 'https://example.com/questionario');
  assert.equal(out.payload.pass_link_label, 'INFO PASS');
});

test('W.AI strip generation allows text only when the brief asks for it', () => {
  const routes = fs.readFileSync(path.join(__dirname, '../src/api/routes.js'), 'utf8');
  assert.match(routes, /function waiStripPromptRequestsText/);
  assert.match(routes, /include only the explicitly requested short phrase/);
  assert.match(routes, /no text, no watermarks/);
  assert.match(routes, /source_prompt:\s*opts\.sourcePrompt/);
});

test('W.AI pass preview does not reserve HR thumbnail space', () => {
  const preview = fs.readFileSync(path.join(__dirname, '../src/engine/push-pass-preview.js'), 'utf8');
  assert.doesNotMatch(preview, /reserveThumbnail/);
});

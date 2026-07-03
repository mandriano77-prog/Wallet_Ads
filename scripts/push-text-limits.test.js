'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  PUSH_TITLE_MAX,
  PUSH_MESSAGE_MAX,
  PUSH_MESSAGE_LINE_MAX,
  PUSH_MESSAGE_LINES,
  validatePushText,
  PUSH_TEXT_AGENT_RULES,
} = require('../src/engine/push-text-limits');

test('push text limits constants', () => {
  assert.equal(PUSH_TITLE_MAX, 22);
  assert.equal(PUSH_MESSAGE_MAX, 66);
  assert.equal(PUSH_MESSAGE_LINE_MAX, 22);
  assert.equal(PUSH_MESSAGE_LINES, 3);
});

test('validatePushText rejects over-limit title', () => {
  const errors = validatePushText('A'.repeat(23), 'Ok');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].field, 'pushTitle');
});

test('validatePushText rejects over-limit message', () => {
  const errors = validatePushText('OK', 'M'.repeat(67));
  assert.equal(errors.length, 1);
  assert.equal(errors[0].field, 'pushMessage');
});

test('validatePushText accepts valid copy', () => {
  assert.equal(validatePushText('2x1 OCCHIALI', 'Solo questa settimana: 2x1 sugli occhiali').length, 0);
});

test('validatePushBackDetails rejects over-limit text', () => {
  const { validatePushBackDetails, PUSH_BACK_DETAILS_MAX } = require('../src/engine/push-text-limits');
  const errors = validatePushBackDetails('x'.repeat(PUSH_BACK_DETAILS_MAX + 1));
  assert.equal(errors.length, 1);
  assert.equal(errors[0].field, 'pushBackDetails');
});

test('agent rules mention limits', () => {
  assert.match(PUSH_TEXT_AGENT_RULES, /22/);
  assert.match(PUSH_TEXT_AGENT_RULES, /66/);
  assert.match(PUSH_TEXT_AGENT_RULES, /3 righe/);
});

test('validatePushScreenAlert requires text and enforces max length', () => {
  const { validatePushScreenAlert, PUSH_SCREEN_ALERT_MAX } = require('../src/engine/push-text-limits');
  assert.equal(PUSH_SCREEN_ALERT_MAX, 110);
  const empty = validatePushScreenAlert('');
  assert.equal(empty.length, 1);
  assert.equal(empty[0].field, 'pushScreenAlert');
  const over = validatePushScreenAlert('x'.repeat(PUSH_SCREEN_ALERT_MAX + 1));
  assert.equal(over.length, 1);
  assert.equal(validatePushScreenAlert('SALDI ESTIVI: -50% su tutto').length, 0);
});

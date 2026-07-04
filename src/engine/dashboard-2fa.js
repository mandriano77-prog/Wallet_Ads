/**
 * 2FA dashboard: OTP email al login + dispositivo fidato 30 giorni.
 *
 * - Codice: 6 cifre crypto-random, salvato solo come SHA-256, TTL 10 minuti,
 *   max 5 tentativi per challenge.
 * - Dispositivo fidato: token random 256 bit consegnato al client dopo la
 *   verifica (localStorage), salvato solo come hash; finché è valido il login
 *   con password NON richiede OTP.
 * - Kill switch: DASHBOARD_2FA_DISABLED=1 (emergenza, es. Resend giù).
 *   Senza RESEND_API_KEY (ambienti dev) la 2FA si disattiva da sola con warning.
 */
'use strict';

const crypto = require('crypto');

const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;
const TRUSTED_DEVICE_DAYS = 30;

function isTwoFactorEnabled() {
  if (String(process.env.DASHBOARD_2FA_DISABLED || '').trim() === '1') return false;
  if (!String(process.env.RESEND_API_KEY || '').trim()) {
    return false; // dev/local senza mailer: login classico
  }
  return true;
}

function generateOtpCode() {
  // 6 cifre uniformi (000000-999999), zero-padded.
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtpCode(code) {
  return crypto.createHash('sha256').update(String(code).trim()).digest('hex');
}

function verifyOtpCode(code, expectedHash) {
  const normalized = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized) || !expectedHash) return false;
  const a = Buffer.from(hashOtpCode(normalized));
  const b = Buffer.from(String(expectedHash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function generateDeviceToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashDeviceToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

module.exports = {
  OTP_TTL_MIN,
  OTP_MAX_ATTEMPTS,
  TRUSTED_DEVICE_DAYS,
  isTwoFactorEnabled,
  generateOtpCode,
  hashOtpCode,
  verifyOtpCode,
  generateDeviceToken,
  hashDeviceToken,
};

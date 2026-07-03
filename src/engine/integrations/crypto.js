/**
 * Cifratura at-rest delle credenziali provider (EXTRA / integrazioni).
 * AES-256-GCM. Chiave da INTEGRATIONS_ENC_KEY (32 byte hex/base64) o derivata da
 * JWT_SECRET come fallback. Usata in fase 2 (connect API); in fase 1 nessuna
 * credenziale è memorizzata.
 */
'use strict';

const crypto = require('crypto');

function encKey() {
  const raw = String(process.env.INTEGRATIONS_ENC_KEY || '').trim();
  if (raw) {
    if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;
  }
  // Fallback deterministico dalla JWT_SECRET (mai loggato).
  return crypto.createHash('sha256').update(String(process.env.JWT_SECRET || 'dev-only-key')).digest();
}

function encryptCredentials(plain) {
  if (plain == null) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decryptCredentials(payload) {
  if (!payload || typeof payload !== 'string' || !payload.startsWith('v1:')) return null;
  try {
    const [, ivB64, tagB64, dataB64] = payload.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { encryptCredentials, decryptCredentials };

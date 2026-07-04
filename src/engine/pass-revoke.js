/**
 * Offboarding wallet: dopo revokePass (db), avvisa i wallet che il pass è annullato.
 * - Apple: push APNs ai device del serial → il device rifetcha il pass e riceve voided:true.
 * - Google: PATCH diretto state=EXPIRED sull'oggetto salvato (finisce tra i pass scaduti).
 * Best-effort: gli errori sono loggati, mai propagati (la cancellazione del dipendente
 * non deve fallire perché un wallet non risponde).
 */
const { pool } = require('../db');

async function notifyPassRevoked(revokedPass) {
  if (!revokedPass) return { skipped: true };
  const out = { apple_pushed: 0, google: null };

  try {
    const r = await pool.query(
      'SELECT push_token FROM device_registrations WHERE serial_number = $1',
      [revokedPass.serial_number]
    );
    if (r.rows.length) {
      const { sendPushUpdate } = require('./apns');
      for (const row of r.rows) {
        try {
          await sendPushUpdate(row.push_token);
          out.apple_pushed++;
        } catch (err) {
          console.warn('[pass-revoke] APNs push failed:', err.message);
        }
      }
    }
  } catch (err) {
    console.warn('[pass-revoke] Apple notify skipped:', err.message);
  }

  try {
    if (revokedPass.google_wallet_object_id) {
      const { setPassObjectState } = require('./google-wallet');
      out.google = await setPassObjectState(revokedPass.google_wallet_object_id, 'EXPIRED');
    }
  } catch (err) {
    console.warn('[pass-revoke] Google expire skipped:', err.message);
    out.google = { error: err.message };
  }

  return out;
}

module.exports = { notifyPassRevoked };

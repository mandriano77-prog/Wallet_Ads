// Route pubbliche di autenticazione dashboard: login, forgot/reset password.
// Estratte da routes.js — montate PRIMA di authMiddleware (sono pubbliche).
'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const {
  getUserByEmail, getUser, verifyPassword, updateUser,
  createPasswordResetToken, getPasswordResetUserByToken, markPasswordResetTokenUsed,
  createOtpChallenge, getOtpChallenge, bumpOtpAttempts, consumeOtpChallenge,
  createTrustedDevice, isTrustedDevice,
} = require('../db');
const {
  JWT_SECRET, JWT_EXPIRES,
  canDashboardUserLogin, ensurePlatformAdminIfAllowlisted,
  buildDashboardPublicUrl,
} = require('./auth-helpers');
const twoFa = require('../engine/dashboard-2fa');

const router = express.Router();

function issueDashboardSession(res, operator, extra = {}) {
  const token = jwt.sign({ id: operator.id, email: operator.email, name: operator.name, role: operator.role, brand_id: operator.brand_id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ token, user: { id: operator.id, email: operator.email, name: operator.name, role: operator.role, brand_id: operator.brand_id }, ...extra });
}

// Rate limit login: 10 tentativi / 15 min per email (stesso pattern del forgot-password).
const loginBuckets = new Map();
function enforceLoginRateLimit(key) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 10;
  const bucket = (loginBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (bucket.length >= max) {
    const err = new Error('Troppi tentativi. Riprova tra qualche minuto.');
    err.status = 429;
    throw err;
  }
  bucket.push(now);
  loginBuckets.set(key, bucket);
}

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password, device_token } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e password richiesti' });
    enforceLoginRateLimit(String(email).trim().toLowerCase());
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Credenziali non valide' });
    if (!canDashboardUserLogin(user)) {
      return res.status(403).json({ error: 'Accesso non autorizzato su questa istanza dashboard' });
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenziali non valide' });
    const operator = await ensurePlatformAdminIfAllowlisted(user);

    // 2FA: OTP via email, salvo dispositivo fidato o kill switch.
    if (twoFa.isTwoFactorEnabled()) {
      const trusted = device_token
        ? await isTrustedDevice(operator.id, twoFa.hashDeviceToken(device_token))
        : false;
      if (!trusted) {
        const code = twoFa.generateOtpCode();
        const challengeId = await createOtpChallenge(operator.id, twoFa.hashOtpCode(code), twoFa.OTP_TTL_MIN);
        try {
          const { sendLoginOtpEmail } = require('../engine/mailer');
          await sendLoginOtpEmail({ to: operator.email, name: operator.name, code });
        } catch (mailErr) {
          console.error('[2FA] invio OTP fallito:', mailErr.message);
          return res.status(503).json({ error: 'Invio del codice non riuscito. Riprova tra poco.' });
        }
        return res.json({
          otp_required: true,
          challenge_id: challengeId,
          message: `Ti abbiamo inviato un codice a ${operator.email}`,
        });
      }
    }

    issueDashboardSession(res, operator);
  } catch (err) {
    if (err.status === 429) return res.status(429).json({ error: err.message });
    console.error('Login error:', err);
    res.status(500).json({ error: 'Errore login' });
  }
});

router.post('/auth/verify-otp', async (req, res) => {
  try {
    const challengeId = String(req.body.challenge_id || '').trim();
    const code = String(req.body.code || '').trim();
    const rememberDevice = req.body.remember_device !== false; // default: fidati 30 giorni
    if (!challengeId || !code) return res.status(400).json({ error: 'Codice richiesto' });

    const challenge = await getOtpChallenge(challengeId);
    if (!challenge) return res.status(400).json({ error: 'Codice scaduto. Rifai il login.' });
    if (challenge.attempts >= twoFa.OTP_MAX_ATTEMPTS) {
      await consumeOtpChallenge(challengeId);
      return res.status(429).json({ error: 'Troppi tentativi. Rifai il login.' });
    }

    if (!twoFa.verifyOtpCode(code, challenge.code_hash)) {
      const attempts = await bumpOtpAttempts(challengeId);
      const left = Math.max(0, twoFa.OTP_MAX_ATTEMPTS - (attempts || 0));
      return res.status(401).json({ error: left > 0 ? `Codice errato. Tentativi rimasti: ${left}` : 'Troppi tentativi. Rifai il login.' });
    }

    await consumeOtpChallenge(challengeId);
    const user = await getUser(challenge.user_id);
    if (!user || !canDashboardUserLogin(user)) {
      return res.status(401).json({ error: 'Utente non valido' });
    }
    const operator = await ensurePlatformAdminIfAllowlisted(user);

    let deviceToken = null;
    if (rememberDevice) {
      deviceToken = twoFa.generateDeviceToken();
      await createTrustedDevice(
        operator.id,
        twoFa.hashDeviceToken(deviceToken),
        req.headers['user-agent'],
        twoFa.TRUSTED_DEVICE_DAYS
      );
    }

    issueDashboardSession(res, operator, deviceToken ? { device_token: deviceToken } : {});
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'Errore verifica codice' });
  }
});

const forgotPasswordBuckets = new Map();

function enforceForgotPasswordRateLimit(key) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 5;
  const bucket = forgotPasswordBuckets.get(key) || [];
  const recent = bucket.filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    const err = new Error('Troppe richieste. Riprova tra qualche minuto.');
    err.status = 429;
    throw err;
  }
  recent.push(now);
  forgotPasswordBuckets.set(key, recent);
}

router.post('/auth/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email richiesta' });
    enforceForgotPasswordRateLimit(email);

    const generic = {
      success: true,
      message: 'Se l\'email è registrata, riceverai le istruzioni per reimpostare la password.'
    };

    const user = await getUserByEmail(email);
    if (user) {
      const token = await createPasswordResetToken(user.id);
      const resetUrl = buildDashboardPublicUrl(req, `reset=${encodeURIComponent(token)}`);
      try {
        const { sendPasswordResetEmail } = require('../engine/mailer');
        await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
      } catch (emailErr) {
        console.error('Password reset email failed:', emailErr.message);
      }
    }

    res.json(generic);
  } catch (err) {
    if (err.status === 429) return res.status(429).json({ error: err.message });
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Errore richiesta recupero password' });
  }
});

router.post('/auth/reset-password', async (req, res) => {
  try {
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.new_password || '');
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token e nuova password richiesti' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password minimo 6 caratteri' });
    }

    const row = await getPasswordResetUserByToken(token);
    if (!row) return res.status(400).json({ error: 'Link non valido o scaduto' });

    await updateUser(row.user_id, { password: newPassword });
    await markPasswordResetTokenUsed(token);
    // Nuova password = i vecchi dispositivi fidati decadono (ri-verifica OTP).
    const { revokeTrustedDevicesForUser } = require('../db');
    await revokeTrustedDevicesForUser(row.user_id).catch(() => {});
    res.json({ success: true, message: 'Password aggiornata. Puoi accedere.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: err.message || 'Errore reimpostazione password' });
  }
});

module.exports = router;

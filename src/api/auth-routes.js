// Route pubbliche di autenticazione dashboard: login, forgot/reset password.
// Estratte da routes.js — montate PRIMA di authMiddleware (sono pubbliche).
'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const {
  getUserByEmail, verifyPassword, updateUser,
  createPasswordResetToken, getPasswordResetUserByToken, markPasswordResetTokenUsed,
} = require('../db');
const {
  JWT_SECRET, JWT_EXPIRES,
  canDashboardUserLogin, ensurePlatformAdminIfAllowlisted,
  buildDashboardPublicUrl,
} = require('./auth-helpers');

const router = express.Router();

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e password richiesti' });
    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Credenziali non valide' });
    if (!canDashboardUserLogin(user)) {
      return res.status(403).json({ error: 'Accesso non autorizzato su questa istanza dashboard' });
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenziali non valide' });
    const operator = await ensurePlatformAdminIfAllowlisted(user);
    const token = jwt.sign({ id: operator.id, email: operator.email, name: operator.name, role: operator.role, brand_id: operator.brand_id }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, user: { id: operator.id, email: operator.email, name: operator.name, role: operator.role, brand_id: operator.brand_id } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Errore login' });
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
    res.json({ success: true, message: 'Password aggiornata. Puoi accedere.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: err.message || 'Errore reimpostazione password' });
  }
});

module.exports = router;

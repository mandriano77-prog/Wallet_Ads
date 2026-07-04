/**
 * 2FA dashboard — OTP email + dispositivo fidato.
 * Testa la logica pura (codici, hash, confronti, flag) senza DB.
 */
const assert = require('node:assert');
const test = require('node:test');

const twoFa = require('../src/engine/dashboard-2fa');

test('generateOtpCode: 6 cifre, sempre', () => {
  for (let i = 0; i < 200; i++) {
    const code = twoFa.generateOtpCode();
    assert.match(code, /^\d{6}$/, `codice non valido: ${code}`);
  }
});

test('verifyOtpCode: roundtrip ok, errato no, formato invalido no', () => {
  const code = twoFa.generateOtpCode();
  const hash = twoFa.hashOtpCode(code);
  assert.equal(twoFa.verifyOtpCode(code, hash), true);
  assert.equal(twoFa.verifyOtpCode(code === '000000' ? '000001' : '000000', hash), false);
  assert.equal(twoFa.verifyOtpCode('abc123', hash), false);
  assert.equal(twoFa.verifyOtpCode('', hash), false);
  assert.equal(twoFa.verifyOtpCode(code, ''), false);
});

test('verifyOtpCode: tollera spazi (come mostrato in email "123 456")', () => {
  const hash = twoFa.hashOtpCode('123456');
  assert.equal(twoFa.verifyOtpCode('123 456', hash), true);
  assert.equal(twoFa.verifyOtpCode(' 123456 ', hash), true);
});

test('device token: 256 bit, hash stabile', () => {
  const t = twoFa.generateDeviceToken();
  assert.equal(t.length, 64);
  assert.match(t, /^[0-9a-f]+$/);
  assert.equal(twoFa.hashDeviceToken(t), twoFa.hashDeviceToken(t));
  assert.notEqual(twoFa.hashDeviceToken(t), twoFa.hashDeviceToken(twoFa.generateDeviceToken()));
});

test('isTwoFactorEnabled: kill switch e assenza mailer disattivano', () => {
  const prevDisabled = process.env.DASHBOARD_2FA_DISABLED;
  const prevResend = process.env.RESEND_API_KEY;
  try {
    process.env.RESEND_API_KEY = 're_test_key';
    delete process.env.DASHBOARD_2FA_DISABLED;
    assert.equal(twoFa.isTwoFactorEnabled(), true);

    process.env.DASHBOARD_2FA_DISABLED = '1';
    assert.equal(twoFa.isTwoFactorEnabled(), false, 'kill switch attivo');

    delete process.env.DASHBOARD_2FA_DISABLED;
    delete process.env.RESEND_API_KEY;
    assert.equal(twoFa.isTwoFactorEnabled(), false, 'senza mailer niente 2FA (dev)');
  } finally {
    if (prevDisabled !== undefined) process.env.DASHBOARD_2FA_DISABLED = prevDisabled;
    else delete process.env.DASHBOARD_2FA_DISABLED;
    if (prevResend !== undefined) process.env.RESEND_API_KEY = prevResend;
    else delete process.env.RESEND_API_KEY;
  }
});

test('policy: costanti di sicurezza attese', () => {
  assert.equal(twoFa.OTP_TTL_MIN, 10);
  assert.equal(twoFa.OTP_MAX_ATTEMPTS, 5);
  assert.equal(twoFa.TRUSTED_DEVICE_DAYS, 30);
});

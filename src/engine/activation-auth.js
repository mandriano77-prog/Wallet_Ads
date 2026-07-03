/**
 * JWT activation links for HR employee pass distribution (30-day validity).
 */
const jwt = require('jsonwebtoken');

const ACTIVATION_TYP = 'activation';

function activationSecret() {
  return process.env.ACTIVATION_JWT_SECRET || process.env.JWT_SECRET || '';
}

function signActivationToken(memberId) {
  const secret = activationSecret();
  if (!secret) throw new Error('ACTIVATION_JWT_SECRET or JWT_SECRET required');
  return jwt.sign({ mid: memberId, typ: ACTIVATION_TYP }, secret, { expiresIn: '30d' });
}

function verifyActivationToken(token) {
  const secret = activationSecret();
  if (!secret) throw new Error('ACTIVATION_JWT_SECRET or JWT_SECRET required');
  const payload = jwt.verify(token, secret);
  if (payload.typ !== ACTIVATION_TYP || !payload.mid) {
    throw new Error('Token attivazione non valido');
  }
  return { memberId: payload.mid };
}

/**
 * Verifica la firma IGNORANDO la scadenza: serve solo a risalire al brand di un
 * link scaduto/sostituito per offrire il percorso "richiedi un nuovo link".
 */
function decodeActivationTokenLoose(token) {
  const secret = activationSecret();
  if (!secret) return null;
  try {
    const payload = jwt.verify(token, secret, { ignoreExpiration: true });
    if (payload.typ !== ACTIVATION_TYP || !payload.mid) return null;
    return { memberId: payload.mid };
  } catch {
    return null;
  }
}

module.exports = {
  signActivationToken,
  verifyActivationToken,
  decodeActivationTokenLoose,
  ACTIVATION_TYP
};

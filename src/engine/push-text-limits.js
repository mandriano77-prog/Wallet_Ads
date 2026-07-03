/**
 * HR push copy limits — single source of truth (strip overlay + API + dashboard).
 * Titolo: 1 riga sulla strip. Messaggio: max 3 righe da 22 caratteri.
 */

const PUSH_TITLE_MAX = 22;
const PUSH_MESSAGE_MAX = 66;
const PUSH_MESSAGE_LINE_MAX = 22;
const PUSH_MESSAGE_LINES = 3;
/** Retro pass only — clausole/dettagli promo (non strip, non lock screen). */
const PUSH_BACK_DETAILS_MAX = 500;
/**
 * Lock screen / Wallet notification body (changeMessage) — solo la parte manuale.
 * 110 = hook breve (best practice push) e garantisce che testo + " · " + didascalia
 * header del template (max 64) restino entro il budget di visualizzazione validato
 * su device (178: 110 + 3 + 64 = 177). Ridotto da 178 a luglio 2026 (proprietario).
 */
const PUSH_SCREEN_ALERT_MAX = 110;

function validatePushScreenAlert(screenAlert) {
  const s = String(screenAlert ?? '').trim();
  if (!s) {
    return [{
      field: 'pushScreenAlert',
      message: 'Inserisci il testo della notifica Wallet (lock screen)',
    }];
  }
  if (s.length > PUSH_SCREEN_ALERT_MAX) {
    return [{
      field: 'pushScreenAlert',
      message: `Notifica lock screen max ${PUSH_SCREEN_ALERT_MAX} caratteri`,
    }];
  }
  return [];
}

function validatePushText(title, message) {
  const t = String(title ?? '').trim();
  const m = String(message ?? '').trim();
  const errors = [];

  if (!t) {
    errors.push({ field: 'pushTitle', message: 'Inserisci il titolo per la strip' });
  } else if (t.length > PUSH_TITLE_MAX) {
    errors.push({
      field: 'pushTitle',
      message: `Titolo strip max ${PUSH_TITLE_MAX} caratteri`,
    });
  }

  if (!m) {
    errors.push({ field: 'pushMessage', message: 'Inserisci il messaggio per la strip' });
  } else if (m.length > PUSH_MESSAGE_MAX) {
    errors.push({
      field: 'pushMessage',
      message: `Messaggio strip max ${PUSH_MESSAGE_MAX} caratteri (${PUSH_MESSAGE_LINES} righe)`,
    });
  }

  return errors;
}

function normalizePushBackDetails(raw) {
  const d = String(raw ?? '').trim();
  if (!d) return null;
  return d.slice(0, PUSH_BACK_DETAILS_MAX);
}

/** Lock-screen copy — persisted screen_alert wins, else title:message (legacy rows). */
function resolvePushScreenAlert({ screen_alert, title, message } = {}) {
  const screen = String(screen_alert || '').trim();
  if (screen) return screen.slice(0, PUSH_SCREEN_ALERT_MAX);
  const joined = [String(title || '').trim(), String(message || '').trim()].filter(Boolean).join(': ');
  return joined.slice(0, PUSH_SCREEN_ALERT_MAX);
}

/** Same shape as POST /push/send — strip fields derived from screen_alert when omitted. */
function normalizeHrPushPayload(body = {}) {
  const screenText = resolvePushScreenAlert(body);
  const out = {
    ...body,
    title: String(body.title || screenText || 'Aggiornamento').trim().slice(0, PUSH_TITLE_MAX),
    message: String(body.message || screenText || 'Apri il pass per i dettagli').trim().slice(0, PUSH_MESSAGE_MAX),
    screen_alert: screenText || null,
  };
  if (body.back_details !== undefined) {
    out.back_details = normalizePushBackDetails(body.back_details);
  }
  return out;
}

function validatePushBackDetails(backDetails) {
  const d = String(backDetails ?? '').trim();
  if (!d) return [];
  if (d.length > PUSH_BACK_DETAILS_MAX) {
    return [{
      field: 'pushBackDetails',
      message: `Dettagli retro max ${PUSH_BACK_DETAILS_MAX} caratteri`,
    }];
  }
  return [];
}

/** Title + body for Google Wallet addMessage (TEXT_AND_NOTIFY). Prefers screen_alert. */
function resolveGoogleNotifyPayload({ screen_alert, title, message } = {}) {
  const screen = String(screen_alert || '').trim();
  const stripTitle = String(title || '').trim();
  const stripMessage = String(message || '').trim();

  if (screen) {
    const colonIdx = screen.indexOf(':');
    if (colonIdx > 0) {
      const head = screen.slice(0, colonIdx).trim();
      const tail = screen.slice(colonIdx + 1).trim();
      if (head && tail) {
        return {
          title: head.slice(0, PUSH_TITLE_MAX),
          message: tail.slice(0, PUSH_MESSAGE_MAX),
        };
      }
    }
    return {
      title: (stripTitle || screen).slice(0, PUSH_TITLE_MAX) || 'NOVITÀ',
      message: screen.slice(0, PUSH_MESSAGE_MAX),
    };
  }

  return {
    title: (stripTitle || 'NOVITÀ').slice(0, PUSH_TITLE_MAX),
    message: (stripMessage || 'Apri il pass per i dettagli').slice(0, PUSH_MESSAGE_MAX),
  };
}

function attachBackDetailsToAnnouncement(announcement, backDetailsRaw) {
  if (!announcement) return announcement;
  const back_details = normalizePushBackDetails(backDetailsRaw);
  if (!back_details) {
    const { back_details: _bd, backDetails: _bD, ...rest } = announcement;
    return rest;
  }
  return { ...announcement, back_details };
}

function firstPushTextError(title, message) {
  const errors = validatePushText(title, message);
  return errors[0] || null;
}

/** Markdown block for AGENTS.md / agent prompts */
const PUSH_TEXT_AGENT_RULES = `
## Push HR — limiti testo (obbligatori)

Le push **non partono** se superi questi limiti (validazione API \`POST /push/send\`).

| Campo | Max caratteri | Note |
|-------|---------------|------|
| **Titolo** | **22** | Maiuscolo sulla strip + etichetta notifica Wallet |
| **Messaggio** | **66** | 3 righe × 22 caratteri sulla strip |

Regole per copy / agent:
- Scrivi frasi **corte**; conta emoji e punteggiatura come 1 carattere.
- Titolo: hook breve (es. \`2x1 OCCHIALI 😎\` — verifica ≤22).
- Messaggio: max 3 righe leggibili; se serve URL usa **Includi link nel pass**, non nel messaggio.
- Anteprima strip nel back office (\`fd-push\`) usa gli stessi limiti.
- Costanti codice: \`src/engine/push-text-limits.js\` (\`PUSH_TITLE_MAX\`, \`PUSH_MESSAGE_MAX\`).
`.trim();

module.exports = {
  PUSH_TITLE_MAX,
  PUSH_MESSAGE_MAX,
  PUSH_MESSAGE_LINE_MAX,
  PUSH_MESSAGE_LINES,
  PUSH_BACK_DETAILS_MAX,
  PUSH_SCREEN_ALERT_MAX,
  validatePushText,
  validatePushScreenAlert,
  validatePushBackDetails,
  normalizePushBackDetails,
  resolvePushScreenAlert,
  normalizeHrPushPayload,
  attachBackDetailsToAnnouncement,
  resolveGoogleNotifyPayload,
  firstPushTextError,
  PUSH_TEXT_AGENT_RULES,
};

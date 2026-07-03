const {
  pool,
  getBrand,
  listScheduledPush,
  listPushes,
  listInstantWinCampaigns,
  listStripPromos,
  listMedia
} = require('../db');
const { parseSinceDaysFromPrompt, todayInTimezone, TZ } = require('./audience-prompt');
const { extractJSON } = require('./ai-copy');
const { getAnthropicApiKey } = require('./env-ai');
const { pickWaiModel, formatModelLabel, getWaiModelFallbacks } = require('./ai-models');
const { getProductBrandName, resolveBaseUrlFromEnv } = require('./base-url');
const { resolvePushChannel } = require('./push-assistant');
const {
  PUSH_TITLE_MAX,
  PUSH_MESSAGE_MAX,
  normalizePushBackDetails,
  validatePushBackDetails,
  validatePushText
} = require('./push-text-limits');

const EXECUTABLE_INTENTS = new Set([
  'push.schedule',
  'push.send',
  'campaign.create',
  'strip.create',
  'strip.generate',
  'audience.create'
]);

const STRIP_GENERATE_MODEL = 'fal-ai/flux-pro/v1.1';
const STRIP_GENERATE_WIDTH = 1125;
const STRIP_GENERATE_HEIGHT = 432;
const DISALLOWED_STRIP_PROMPT = /\b(nsfw|nude|naked|porn|xxx|erotic)\b/i;
const WAI_MAX_TOKENS = Math.max(1024, Math.min(4096, Number(process.env.WAI_MAX_TOKENS || 2048)));

function buildWaiSystemPrompt() {
  const brand = getProductBrandName();
  const studioHost = resolveBaseUrlFromEnv().replace(/^https?:\/\//, '');
  return `Sei W.AI, l'agente AI del back office ${brand}.
Aiuti i brand manager a gestire il loro programma wallet pass tramite comandi in linguaggio naturale.

## Identità
Sei un operatore esperto, veloce e preciso. Non sei un chatbot generico — sei uno strumento
di lavoro che conosce ogni funzione del back office. Rispondi in modo diretto, senza convenevoli.
Se il manager dice "crea un reward caffè a 500 punti" non chiedi conferma — prepari il payload
e lo mostri per approvazione.

## Contesto operativo
Operi dentro ${brand}, una piattaforma che gestisce pass per Apple Wallet, Google Wallet e
Samsung Wallet. I pass sono carte digitali (storeCard) che i brand distribuiscono ai clienti
tramite QR code, link o advertising. Ogni pass ha: design, push notification, geofencing,
gamification, reward, strip promo. Il back office è su ${studioHost}.

## Regole di risposta
- Rispondi SOLO con JSON valido, senza markdown, senza testo prima o dopo.
- Lingua: italiano per summary/warnings, valori dei campi nella lingua richiesta dal manager.
- Se la richiesta è ambigua ma interpretabile, interpreta e metti warning.
- Se la richiesta non è classificabile, usa intent "unknown" con un messaggio di aiuto.
- Non inventare dati non menzionati dal manager (prezzi, nomi, date).
- Se mancano informazioni obbligatorie, usa valori di default sensati E aggiungi warning.

## Intent supportati

### Creazione
- push.schedule — Programma una push notification (once/daily/weekly)
- push.send — Invia una push notification immediata
- reward.create — Crea un nuovo reward nel programma fedeltà
- member.add_points — Aggiungi punti a un membro specifico
- campaign.create — Crea una campagna gamification (instant win / ruota)
- strip.create — Crea una strip promo (cambio immagine pass temporaneo)
- strip.generate — Genera una nuova immagine strip con AI (Flux)

### Lettura / Audience platform
- analytics.query — Rispondi a domande su metriche e performance
- audience.query — Segmenta possessori del pass con filtri demografici + comportamentali (aperture, click link retro, giochi). Restituisci count nel answer e query_spec nel payload.
- audience.insights — Sintesi engagement (click, aperture, funnel) usando audience_behavior_30d nel contesto
- pass.count — Conta pass attivi/installati
- push.history — Mostra storico push inviate
- member.search — Cerca un membro per nome/email o conta per segmento

### Audience salvate
- audience.create — Crea audience salvata da query_spec (type create, eseguibile)

### Sistema
- help — L'utente chiede cosa puoi fare. Rispondi con la lista delle capacità.
- unknown — Richiesta non classificabile. Suggerisci cosa puoi fare.

## Schema JSON di risposta
{
  "intent": "<intent_id>",
  "type": "create" | "query" | "system",
  "preview": {
    "summary": "Frase in italiano che spiega cosa verrà fatto",
    "details": { ... },
    "warnings": ["..."]
  },
  "payload": { ... },
  "answer": "..."
}

## Regole per intent specifici

### push.schedule
- schedule_type: "once" | "daily" | "weekly"
- schedule_time: HH:MM formato 24h, fuso Europa/Roma
- days: array numeri 0-6 (0=dom) solo per weekly
- date: YYYY-MM-DD solo per once
- title: max 22 caratteri, incisivo, usato per notifica Wallet/changeMessage
- message: max 66 caratteri, usato per notifica Wallet/changeMessage
- back_details: max 500 caratteri, testo completo da mostrare sul retro del pass. Se il manager scrive condizioni, promo, istruzioni, descrizione estesa, regolamento o informazioni da leggere, mettile qui. NON lasciare vuoto se la richiesta contiene dettagli utili.
- include_pass_link/pass_link_url/pass_link_label: campo fondamentale. Se la richiesta contiene una URL o chiede un link cliccabile nel pass, compila SEMPRE pass_link_url e pass_link_label; include_pass_link diventa true automaticamente.
- channel: "apple" | "google" | "samsung" | "all" — usa sempre "all" salvo richiesta esplicita di una sola tecnologia.
- Se il manager chiede anche una nuova immagine strip del pass, aggiungi strip_prompt_en (inglese Flux) nel payload e mantieni update_pass true.
- Se il manager non specifica l'orario, scegli in base al settore:
  Food: 11:30 o 18:00 | Retail: 10:00 o 17:00 | Generico: 10:00

### push.send
- Come push.schedule ma senza scheduling. Esecuzione immediata.
- title + message obbligatori. Se non specificati, genera e metti warning.
- Per HR: la strip viene aggiornata come immagine. Non usare title/message come testo overlay sulla strip; usa back_details per le informazioni estese sul retro.
- Se il manager chiede anche una nuova immagine strip del pass, NON usare strip.generate: resta su push.send o push.schedule e aggiungi strip_prompt_en (inglese Flux) nel payload.
- update_pass deve restare true quando c'è una nuova strip, salvo diversa indicazione.

### reward.create
- name: nome del reward (es. "Caffè gratis")
- points_required: punti necessari per riscattare
- description: breve descrizione del premio
- active: sempre true alla creazione

### member.add_points
- member_query: nome o email per identificare il membro
- points: numero di punti da aggiungere (sempre positivo)
- reason: motivo dell'accredito (es. "bonus fedeltà")
- ATTENZIONE: se il membro non è trovato nel contesto, metti warning

### campaign.create
- name: nome campagna
- game_type: "spin_wheel" | "scratch_card" | "quiz"
- prize_name, prize_description: premio
- win_probability: 0.0-1.0 (default 0.1 se non specificato)

### strip.generate — Generazione immagine strip con AI
Quando il manager chiede SOLO di creare, generare o salvare l'immagine strip del pass senza inviare o programmare una push, usa l'intent strip.generate con type "create".
Se chiede anche push/notifica, usa push.send o push.schedule con strip_prompt_en.
Traduci la descrizione italiana in prompt_en in inglese per Flux 1.1 Pro.
Regole prompt_en: scena fotografica panoramica, includi "wide panoramic composition, no text, no watermarks, no logos, no UI elements", includi "photorealistic commercial photography" o "editorial photography", 30-60 parole, non inventare prodotti non menzionati.
Eccezione testo nella strip: se il manager chiede esplicitamente di inserire una frase/scritta/testo dentro l'immagine, includi quella frase nel prompt_en come testo tipografico leggibile. In quel caso NON scrivere "no text".
Stili: commercial_photo (default), lifestyle, food, minimal, seasonal, abstract.
Nel payload: prompt_en, style_prompt null, width 1125, height 432, model "fal-ai/flux-pro/v1.1".
In preview.details includi description_it, prompt_en, style, dimensions "1125x432 (@3x Apple Wallet)".

### analytics.query / audience.insights / pass.count / push.history / member.search
- Usa i dati nel contesto brand per rispondere.
- Metti la risposta nel campo "answer" in italiano.
- Non inventare numeri — usa solo i dati forniti nel contesto.

### audience.query
- type: "query"
- payload.query_spec schema (JSON, NO SQL):
  {
    "description": "testo breve del segmento",
    "rules": {
      "campaign_id": null,
      "status": "any|active|inactive",
      "wallet": "any|installed|apple|google|samsung",
      "has_apple_push": true|false|null,
      "has_email": true|false|null,
      "has_phone": true|false|null,
      "created_after": "ISO date|null",
      "created_before": "ISO date|null",
      "utm_source": "string|null",
      "played_instant_win": true|false|null,
      "played_gamification": true|false|null
    },
    "behavior": {
      "did_action": "opened|link_click|installed|instant_win_played|gamification_played|...|null",
      "never_did_action": "link_click|...|null",
      "target_key": "link_0|link_1|link_2|null",
      "since_days": <numero giorni richiesto dall'utente, es. 7 se dice "7gg" o "ultimi 7 giorni">,
      "min_count": 1
    }
  }
- OBBLIGATORIO: since_days deve essere uguale al periodo nella richiesta (7 → 7, 14 → 14). Mai usare 30 se l'utente chiede 7. Usa server_date nel contesto come "oggi".
- audience_behavior_30d nel contesto è solo panoramica: NON usarlo come finestra della query né citarlo nel conteggio.
- Usa solo event_action presenti in allowed_event_actions del contesto.
- Per "ha cliccato link 1 / link out / retro" → did_action: "link_click", target_key: "link_0".
- Per "ha aperto il pass" → did_action: "opened".
- Per "mai cliccato" / "non ha mai cliccato" / "senza click" → never_did_action: "link_click" (opzionale target_key per un link specifico). Non usare did_action insieme a never_did_action.
- Per "aperto ma mai cliccato" → behavior: { did_action: "opened", never_did_action: "link_click", since_days: <giorni dalla richiesta> } — il motore applica entrambi i filtri.
- answer: una sola frase fint placeholder (es. "Segmento impostato.") — il server sostituisce con statistiche reali; NON elencare serial, email, stime da contesto LLM né disclaimer su 30 giorni.
- preview.warnings: sempre [] per audience.query — zero testo qui.
- type: "query" (non "create"). payload DEVE contenere query_spec completo.

### audience.create
- type: "create"
- payload: { name, description, query_spec, source_prompt }
- name obbligatorio; query_spec come audience.query

## Principi di copy per push
1. BREVITÀ: ogni parola deve giustificare la sua presenza
2. VALORE: l'utente deve capire in 2 sec perché aprire
3. ESCLUSIVITÀ: "per te", "riservato", "solo pass"
4. URGENZA SOFT: "oggi", "questa settimana" — mai "ULTIMA OCCASIONE!!!"
5. COERENZA: mantieni il tono delle push recenti del brand
6. NO SPAM: mai tutto maiuscolo, mai clickbait vuoto`;
}

function buildUserMessage(prompt, context, refinement = null) {
  let message = `Stato attuale del brand:\n${JSON.stringify(context, null, 2)}\n\nRichiesta del manager:\n${prompt}`;
  if (refinement?.followup) {
    message += `\n\nProposta precedente non ancora confermata:\n${JSON.stringify(refinement.previousProposal || {}, null, 2)}`;
    message += `\n\nIntegrazione o correzione richiesta dal manager:\n${refinement.followup}`;
    message += '\n\nAggiorna la proposta completa in JSON. Mantieni intent e payload coerenti con la richiesta originale salvo diversa indicazione. Se il manager integra un warning, applica la modifica nel payload.';
    message += '\n\nSe l\'intent è strip.generate, riscrivi prompt_en in inglese integrando la modifica visiva richiesta e mantieni le regole Flux.';
  }
  return message;
}

function isRetryableWaiModelError(message, status) {
  const text = String(message || '').toLowerCase();
  if (status === 404) return true;
  return /not[_\s-]?found|invalid[_\s-]?model|model.*(?:not|unavailable|does not exist)/i.test(text);
}

async function callWaiOnce(systemPrompt, userMessage, model, apiKey, maxTokens = WAI_MAX_TOKENS) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || `Anthropic error ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  const text = data?.content?.[0]?.text;
  if (!text) throw new Error('Claude ha restituito una risposta vuota');
  return text;
}

async function callWai(systemPrompt, userMessage, model, opts = {}) {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY non disponibile nel processo Node. Impostala nelle variabili del servizio (Railway) e ridistribuisci.');
  }

  const candidates = [model, ...getWaiModelFallbacks(model)];
  let lastError;
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    try {
      if (i > 0) console.warn(`[wai] retry with model ${candidate}`);
      return await callWaiOnce(systemPrompt, userMessage, candidate, apiKey, opts.maxTokens || WAI_MAX_TOKENS);
    } catch (err) {
      lastError = err;
      const hasNext = i < candidates.length - 1;
      if (!hasNext || !isRetryableWaiModelError(err.message, err.status)) throw err;
      console.warn(`[wai] model ${candidate} failed: ${err.message}`);
    }
  }
  throw lastError || new Error('Chiamata W.AI fallita');
}

function isLikelyJsonParseError(err) {
  return err instanceof SyntaxError
    || /JSON|valid JSON|property value|Unexpected token|Unexpected end|unterminated/i.test(String(err?.message || ''));
}

function buildWaiJsonRepairSystemPrompt() {
  return `Sei un validatore JSON.
Ricevi una risposta W.AI che doveva essere JSON valido ma contiene errori di sintassi.
Restituisci SOLO JSON valido, senza markdown e senza spiegazioni.
Non cambiare intent, payload, preview o answer se non per correggere la sintassi.
Se mancano virgole, virgolette o parentesi, correggile conservando il contenuto.`;
}

async function extractWaiJsonWithRepair(text, model) {
  try {
    return extractJSON(text);
  } catch (err) {
    if (!isLikelyJsonParseError(err)) throw err;
    console.warn('[wai] invalid JSON response, attempting repair:', err.message);
    const repairText = await callWai(
      buildWaiJsonRepairSystemPrompt(),
      `Correggi questa risposta in JSON valido:\n\n${String(text || '').slice(0, 12000)}`,
      model,
      { maxTokens: WAI_MAX_TOKENS }
    );
    try {
      return extractJSON(repairText);
    } catch (repairErr) {
      console.error('[wai] JSON repair failed:', repairErr.message);
      const friendly = new Error('W.AI ha generato una risposta JSON non valida. Ho provato a correggerla automaticamente ma non è riuscito: riprova con un prompt più breve o più diretto.');
      friendly.cause = repairErr;
      throw friendly;
    }
  }
}

function sanitizeStripPrompt(text) {
  const cleaned = String(text || '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  if (DISALLOWED_STRIP_PROMPT.test(cleaned)) {
    throw new Error('Il prompt non è consentito per la generazione strip');
  }
  return cleaned.slice(0, 600);
}

async function buildWaiContext(brandId) {
  const { getHolderBehaviorInsights } = require('./holder-events');
  const { ALLOWED_EVENT_ACTIONS } = require('./audiences');
  const [brand, passStats, deviceStats, scheduled, pushHistory, campaigns, stripPromos, mediaItems, behavior30d] = await Promise.all([
    getBrand(brandId),
    pool.query('SELECT COUNT(*)::int AS total FROM pass_instances WHERE brand_id = $1', [brandId]),
    pool.query(
      `SELECT COUNT(DISTINCT dr.push_token)::int AS with_push
       FROM device_registrations dr
       JOIN pass_instances pi ON dr.serial_number = pi.serial_number
       WHERE pi.brand_id = $1`,
      [brandId]
    ),
    listScheduledPush(brandId),
    listPushes(brandId),
    listInstantWinCampaigns(brandId),
    listStripPromos(brandId),
    listMedia(brandId, 'strip'),
    getHolderBehaviorInsights(brandId, 30).catch(() => null)
  ]);

  if (!brand) throw new Error('Brand non trovato');

  const mediaLibrary = Array.isArray(mediaItems) ? mediaItems : [];

  return {
    brand_name: brand.name,
    brand_sector: brand.config?.settore || 'non specificato',
    brand_tone: brand.config?.tone || brand.config?.brand_tone || 'non specificato',
    brand_colors: brand.config?.colors || brand.config?.brand_colors || null,
    pass_count: passStats.rows[0]?.total || 0,
    pass_with_push: deviceStats.rows[0]?.with_push || 0,
    member_count: 0,
    active_rewards: [],
    media_library_count: mediaLibrary.length,
    media_library_recent: mediaLibrary.slice(0, 5).map((m) => ({
      name: m.title || m.name,
      type: m.type,
      created_at: m.created_at
    })),
    active_strip_loaded: !!(brand.config?.logos?.strip || brand.config?.strip_base64),
    scheduled_push: scheduled.slice(0, 5).map((s) => ({
      title: s.title,
      message: s.message,
      schedule_type: s.schedule_type,
      schedule_time: s.schedule_time,
      active: s.active
    })),
    recent_push: pushHistory.slice(0, 5).map((p) => ({
      title: p.title,
      message: p.message,
      sent_at: p.created_at
    })),
    active_campaigns: campaigns.filter((c) => c.status === 'active').map((c) => ({
      name: c.name,
      game_type: c.game_type
    })),
    active_strip_promos: stripPromos.filter((s) => s.active).map((s) => ({
      title: s.title,
      start_date: s.start_date,
      end_date: s.end_date
    })),
    allowed_event_actions: [...ALLOWED_EVENT_ACTIONS],
    server_date: todayInTimezone(TZ),
    server_timezone: TZ,
    audience_behavior_30d: behavior30d,
    audience_behavior_30d_note:
      'Solo statistiche di panoramica (30 giorni). Per audience.query usa behavior.since_days dalla richiesta utente; il conteggio esatto è calcolato dal server su holder_events.'
  };
}

function normalizeWarnings(value) {
  if (!Array.isArray(value)) return [];
  return value.map((w) => String(w).trim()).filter(Boolean);
}

function normalizePreview(raw) {
  const preview = raw?.preview && typeof raw.preview === 'object' ? raw.preview : {};
  return {
    summary: String(preview.summary || raw?.answer || '').trim(),
    details: preview.details && typeof preview.details === 'object' ? preview.details : {},
    warnings: normalizeWarnings(preview.warnings)
  };
}

function normalizePayload(intent, payload, brandId) {
  const next = payload && typeof payload === 'object' ? { ...payload } : {};
  if (intent !== 'help' && intent !== 'unknown') {
    next.brand_id = brandId;
  }
  return next;
}

function extractFirstUrlFromText(...parts) {
  const text = parts.map((p) => String(p || '')).join(' ');
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return '';
  return match[0].replace(/[),.;!?]+$/g, '');
}

/** LLM sometimes puts push fields only in preview.details or mis-tags type as system. */
function rehydratePushPayloadFromPreview(intent, payload, preview) {
  if (intent !== 'push.send' && intent !== 'push.schedule') return false;
  const details = preview?.details && typeof preview.details === 'object' ? preview.details : {};
  const summary = String(preview?.summary || '');
  if (!payload.title && details.title) payload.title = String(details.title).trim();
  if (!payload.message && details.message) payload.message = String(details.message).trim();
  if (!payload.message && details.message_it) payload.message = String(details.message_it).trim();
  if (!payload.back_details && details.back_details) payload.back_details = String(details.back_details).trim();
  if (!payload.back_details && details.details) payload.back_details = String(details.details).trim();
  if (payload.include_pass_link === undefined && details.include_pass_link !== undefined) {
    payload.include_pass_link = details.include_pass_link === true || String(details.include_pass_link).toLowerCase() === 'true';
  }
  if (!payload.pass_link_url && details.pass_link_url) payload.pass_link_url = String(details.pass_link_url).trim();
  if (!payload.pass_link_label && details.pass_link_label) payload.pass_link_label = String(details.pass_link_label).trim();
  if (!payload.strip_prompt_en && details.strip_prompt_en) {
    payload.strip_prompt_en = String(details.strip_prompt_en).trim();
  }
  if (intent === 'push.schedule') {
    if (!payload.schedule_time && details.schedule_time) {
      payload.schedule_time = String(details.schedule_time).trim();
    }
    if (!payload.schedule_time) {
      const tm = summary.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
      if (tm) payload.schedule_time = tm[0];
    }
    if (!payload.schedule_type && details.schedule_type) {
      payload.schedule_type = details.schedule_type;
    }
    if (!payload.date && details.date) payload.date = String(details.date).trim();
    if (Array.isArray(details.days) && details.days.length && !Array.isArray(payload.days)) {
      payload.days = details.days;
    }
  }
  return !!(payload.title && payload.message);
}

function hasMeaningfulExecutablePayload(intent, payload, preview) {
  if (!payload || typeof payload !== 'object') return false;
  const keys = Object.keys(payload).filter((k) => k !== 'brand_id');
  if (!keys.length) return false;
  if (intent === 'push.send' || intent === 'push.schedule') {
    return rehydratePushPayloadFromPreview(intent, payload, preview);
  }
  return keys.length > 0;
}

function wantsPushAndStrip(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return false;
  const wantsPush = /\b(push|notifica|notifiche|avviso|avvisa|invia|manda|programma|schedula|pianifica|lock\s*screen)\b/i.test(text);
  const wantsStrip = /\b(immagine|strip|banner|hero|visual|grafica|foto|facciata)\b/i.test(text)
    || /\bgenera(?:\s+\w+){0,4}\s+strip\b/i.test(text)
    || /\bstrip\s+(?:con|per|del|della)\b/i.test(text)
    || /\b(aggiorna|nuova|cambia).{0,30}\bstrip\b/i.test(text);
  return wantsPush && wantsStrip;
}

function inferStripPromptFromUserText(prompt) {
  const text = String(prompt || '').trim();
  if (!text) return '';
  let visual = text
    .replace(/\b(push|notifica|notifiche|avviso|avvisa|invia|manda|programma|schedula|pianifica|subito|ora|adesso|lock\s*screen|titolo|messaggio)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (visual.length < 12) visual = text;
  return sanitizeStripPrompt(
    `${visual}, wide panoramic composition, no text, no watermarks, no logos, no UI elements, photorealistic commercial photography`
  );
}

function extractQuerySpec(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw.payload && typeof raw.payload === 'object' ? raw.payload : {};
  const details = raw.preview?.details && typeof raw.preview.details === 'object' ? raw.preview.details : {};
  const qs = payload.query_spec || details.query_spec || payload;
  if (qs?.rules || qs?.behavior || qs?.behavioral) return qs;
  if (payload.rules || payload.behavior) {
    return { description: payload.description || details.description, rules: payload.rules, behavior: payload.behavior };
  }
  return null;
}

function coerceAudiencePlatformQuery(prompt, raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (!/\[Audience platform\]/i.test(String(prompt || ''))) return raw;

  const query_spec = extractQuerySpec(raw);
  const intent = String(raw.intent || '').trim();

  if (query_spec) {
    return {
      ...raw,
      intent: 'audience.query',
      type: 'query',
      payload: { query_spec }
    };
  }

  if (intent === 'audience.insights' || intent === 'analytics.query') {
    const text = String(prompt || '').toLowerCase();
    const since_days = parseSinceDaysFromPrompt(prompt) || 30;
    let did_action = null;
    if (/\b(notific|push|avvis)\w*/.test(text) || /\bapert\w*/.test(text)) did_action = 'opened';
    if (/\bclic\w*/.test(text) || /\blink\b/.test(text)) did_action = 'link_click';
    if (did_action) {
      const behavior = { did_action, since_days, min_count: 1 };
      const linkMatch = text.match(/link\s*([123])/);
      if (did_action === 'link_click' && linkMatch) {
        behavior.target_key = `link_${parseInt(linkMatch[1], 10) - 1}`;
      }
      return {
        ...raw,
        intent: 'audience.query',
        type: 'query',
        payload: {
          query_spec: {
            description: `Segmento da richiesta audience platform (${since_days} giorni)`,
            rules: {},
            behavior
          }
        },
        preview: {
          ...(raw.preview || {}),
          warnings: Array.isArray(raw.preview?.warnings) ? raw.preview.warnings : []
        }
      };
    }
  }
  return raw;
}

function coerceWaiProposal(prompt, raw) {
  if (!raw || typeof raw !== 'object' || !wantsPushAndStrip(prompt)) return raw;

  const preview = raw.preview && typeof raw.preview === 'object' ? raw.preview : {};
  const details = preview.details && typeof preview.details === 'object' ? preview.details : {};
  const payload = raw.payload && typeof raw.payload === 'object' ? { ...raw.payload } : {};
  let promptEn = '';
  try {
    promptEn = sanitizeStripPrompt(
      payload.strip_prompt_en
      || payload.prompt_en
      || details.strip_prompt_en
      || details.prompt_en
      || ''
    );
  } catch (_) {
    promptEn = '';
  }
  if (!promptEn) {
    try {
      promptEn = inferStripPromptFromUserText(prompt);
    } catch (_) {
      promptEn = '';
    }
  }
  if (!promptEn) return raw;

  const intent = String(raw.intent || '');
  if (!['strip.generate', 'push.send', 'push.schedule', 'unknown', 'help'].includes(intent)) {
    return raw;
  }
  if ((intent === 'push.send' || intent === 'push.schedule') && payload.strip_prompt_en) {
    return raw;
  }

  const text = String(prompt || '');
  const wantsSchedule = /\b(programma|schedula|pianifica|ogni|settiman|luned|marted|mercoled|gioved|venerd|sabato|domenica|tantum)\b/i.test(text);
  const wantsImmediate = /\b(subito|ora|immediat|adesso)\b/i.test(text);
  const nextIntent = intent === 'push.schedule' || intent === 'push.send'
    ? intent
    : ((wantsSchedule && !wantsImmediate) ? 'push.schedule' : 'push.send');

  const title = String(payload.title || details.title || 'Novità dal pass').trim().slice(0, PUSH_TITLE_MAX);
  const message = String(
    payload.message
    || details.message
    || details.message_it
    || preview.summary
    || 'Scopri la novità nel tuo pass.'
  ).trim().slice(0, PUSH_MESSAGE_MAX);
  const warnings = normalizeWarnings(preview.warnings);
  if (intent === 'strip.generate') {
    warnings.push('Proposta convertita in push con nuova strip AI.');
  }

  const nextPayload = {
    ...payload,
    title,
    message,
    back_details: normalizePushBackDetails(payload.back_details || details.back_details || ''),
    channel: ['apple', 'google', 'samsung', 'all'].includes(payload.channel) ? payload.channel : 'all',
    update_pass: payload.update_pass !== false,
    strip_prompt_en: promptEn
  };
  if (!nextPayload.back_details) delete nextPayload.back_details;

  if (nextIntent === 'push.schedule') {
    nextPayload.schedule_type = ['once', 'daily', 'weekly'].includes(payload.schedule_type)
      ? payload.schedule_type
      : (wantsSchedule ? 'weekly' : 'once');
    nextPayload.schedule_time = String(payload.schedule_time || details.schedule_time || '10:00').trim();
    if (nextPayload.schedule_type === 'weekly') {
      const days = Array.isArray(payload.days) ? payload.days : [];
      nextPayload.days = days.length ? days : [1];
    }
    if (nextPayload.schedule_type === 'once' && !payload.date && !details.date) {
      const fallback = new Date();
      fallback.setDate(fallback.getDate() + 1);
      nextPayload.date = fallback.toISOString().slice(0, 10);
      warnings.push('Data push una tantum non specificata: proposta per domani.');
    }
  }

  return {
    ...raw,
    intent: nextIntent,
    type: 'create',
    payload: nextPayload,
    preview: {
      ...preview,
      summary: preview.summary || `Push con nuova strip: ${title}`,
      details: {
        ...details,
        title,
        message,
        strip_prompt_en: promptEn
      },
      warnings
    }
  };
}

function validateWaiResponse(raw, brandId, userPrompt) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Risposta W.AI non valida');
  }

  const intent = String(raw.intent || 'unknown').trim();
  let type = String(raw.type || 'system').trim();
  const preview = normalizePreview(raw);
  const answer = String(raw.answer || preview.summary || '').trim();
  const payload = normalizePayload(intent, raw.payload, brandId);
  const hasExecutablePayload = hasMeaningfulExecutablePayload(intent, payload, preview);

  if (EXECUTABLE_INTENTS.has(intent) && hasExecutablePayload) {
    type = 'create';
  }

  if (!preview.summary && answer) preview.summary = answer;

  if (type === 'create' && !EXECUTABLE_INTENTS.has(intent)) {
    preview.warnings.push('Questa azione non è disponibile in W.AI v1 su questo back office.');
    return {
      intent,
      type: 'system',
      preview,
      payload: {},
      answer: preview.summary || 'Azione non disponibile in W.AI v1.'
    };
  }

  if (intent === 'audience.query') {
    const query_spec = extractQuerySpec({ ...raw, payload: raw.payload || payload, preview });
    if (!query_spec) {
      preview.warnings.push('Query audience incompleta: specifica filtri (es. aperti pass, click link) e riprova.');
    }
    return {
      intent,
      type: 'query',
      preview,
      payload: query_spec ? { query_spec } : {},
      answer: answer || preview.summary
    };
  }

  if (type === 'query' || type === 'system') {
    if (EXECUTABLE_INTENTS.has(intent) && hasExecutablePayload) {
      type = 'create';
      preview.warnings.push('Proposta corretta: azione eseguibile (il modello aveva indicato type system/query).');
    } else {
      if (!answer && intent === 'help') {
        preview.summary = 'Posso programmare push, inviarle subito, creare campagne instant win, strip promo e generare immagini strip con AI, e rispondere su pass e analytics.';
      }
      return { intent, type, preview, payload: {}, answer: answer || preview.summary };
    }
  }

  if (!EXECUTABLE_INTENTS.has(intent)) {
    throw new Error(`Intent '${intent}' non eseguibile in v1`);
  }

  if (intent === 'push.schedule' || intent === 'push.send') {
    rehydratePushPayloadFromPreview(intent, payload, preview);
    payload.title = String(payload.title || preview.details?.title || '').trim().slice(0, PUSH_TITLE_MAX);
    payload.message = String(
      payload.message || preview.details?.message || preview.details?.message_it || preview.summary || ''
    ).trim().slice(0, PUSH_MESSAGE_MAX);
    if (!payload.title || !payload.message) {
      throw new Error('Titolo e messaggio push obbligatori');
    }
    const textErrors = validatePushText(payload.title, payload.message);
    if (textErrors.length) throw new Error(textErrors[0].message);
    // HR dispatch rejects Wallet updates without screen_alert — derive from copy when the model omits it.
    payload.screen_alert = String(
      payload.screen_alert || preview.details?.screen_alert || ''
    ).trim().slice(0, require('./push-text-limits').PUSH_SCREEN_ALERT_MAX) || `${payload.title}: ${payload.message}`.slice(0, require('./push-text-limits').PUSH_SCREEN_ALERT_MAX);
    payload.back_details = normalizePushBackDetails(
      payload.back_details || preview.details?.back_details || preview.details?.details || ''
    );
    if (payload.back_details) {
      const backErrors = validatePushBackDetails(payload.back_details);
      if (backErrors.length) throw new Error(backErrors[0].message);
      preview.details = { ...preview.details, back_details: payload.back_details };
    } else {
      delete payload.back_details;
    }
    const linkUrl = String(
      payload.pass_link_url
      || preview.details?.pass_link_url
      || extractFirstUrlFromText(userPrompt, payload.back_details, preview.summary)
      || ''
    ).trim();
    if (linkUrl) {
      payload.include_pass_link = true;
      payload.pass_link_url = linkUrl;
      payload.pass_link_label = String(
        payload.pass_link_label || preview.details?.pass_link_label || payload.title || 'Apri link'
      ).trim().slice(0, 64);
    } else if (payload.include_pass_link === true) {
      preview.warnings.push('Link richiesto ma URL mancante: il link non verrà inserito nel pass.');
      payload.include_pass_link = false;
    }
    payload.channel = resolvePushChannel(
      payload.channel || preview.details?.channel,
      userPrompt || preview.summary || ''
    );
    payload.update_pass = payload.update_pass !== false;
    const stripPrompt = sanitizeStripPrompt(
      payload.strip_prompt_en || preview.details?.strip_prompt_en || ''
    );
    if (stripPrompt) {
      payload.strip_prompt_en = stripPrompt;
      preview.details = { ...preview.details, strip_prompt_en: stripPrompt };
      payload.update_pass = true;
    } else {
      delete payload.strip_prompt_en;
    }
  }

  if (intent === 'push.schedule') {
    payload.schedule_type = ['once', 'daily', 'weekly'].includes(payload.schedule_type)
      ? payload.schedule_type
      : (preview.details?.schedule_type && ['once', 'daily', 'weekly'].includes(preview.details.schedule_type)
        ? preview.details.schedule_type
        : 'weekly');
    payload.schedule_time = String(
      payload.schedule_time || preview.details?.schedule_time || '10:00'
    ).trim();
    if (payload.schedule_type === 'weekly') {
      const days = Array.isArray(payload.days) ? payload.days : [];
      payload.days = [...new Set(days.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
      if (!payload.days.length) payload.days = [1];
    }
    if (payload.schedule_type === 'once') {
      payload.date = String(payload.date || preview.details?.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + 1);
        payload.date = fallback.toISOString().slice(0, 10);
        preview.warnings.push('Data push una tantum non specificata: proposta per domani.');
      }
    }
  }

  if (intent === 'campaign.create') {
    payload.name = String(payload.name || '').trim();
    payload.game_type = String(payload.game_type || 'spin_wheel').trim();
    payload.prize_name = String(payload.prize_name || payload.name || 'Premio').trim();
    payload.prize_description = String(payload.prize_description || '').trim();
    payload.win_probability = Number.isFinite(Number(payload.win_probability))
      ? Number(payload.win_probability)
      : 0.1;
    payload.status = payload.status || 'draft';
  }

  if (intent === 'strip.generate') {
    payload.prompt_en = sanitizeStripPrompt(payload.prompt_en || preview.details?.prompt_en || '');
    if (!payload.prompt_en) throw new Error('prompt_en obbligatorio per generazione strip');
    payload.style_prompt = payload.style_prompt || null;
    payload.width = STRIP_GENERATE_WIDTH;
    payload.height = STRIP_GENERATE_HEIGHT;
    payload.model = STRIP_GENERATE_MODEL;
  }

  if (intent === 'strip.create') {
    payload.title = String(payload.title || '').trim();
    payload.start_date = String(payload.start_date || '').trim();
    payload.end_date = String(payload.end_date || '').trim();
    if (!payload.title || !payload.start_date || !payload.end_date) {
      throw new Error('Strip promo: titolo, start_date e end_date obbligatori');
    }
    if (!payload.strip_base64) {
      preview.warnings.push('Manca strip_base64: carica l’immagine strip dal back office prima di confermare.');
    }
  }

  if (intent === 'audience.create') {
    payload.name = String(payload.name || '').trim();
    if (!payload.name) throw new Error('Nome audience obbligatorio');
    payload.description = String(payload.description || preview.summary || '').trim();
    payload.source_prompt = String(payload.source_prompt || '').trim();
    if (!payload.query_spec || typeof payload.query_spec !== 'object') {
      payload.query_spec = {
        description: preview.summary,
        rules: payload.rules || {},
        behavior: payload.behavior || null
      };
    }
  }

  return { intent, type: 'create', preview, payload, answer: '' };
}

async function askWai({ brandId, prompt, followup = '', previousProposal = null }) {
  const trimmed = String(prompt || '').trim();
  const followupText = String(followup || '').trim();
  if (!trimmed) throw new Error('prompt richiesto');
  if (followupText && !previousProposal) throw new Error('previous_proposal richiesto per la raffinazione');

  const context = await buildWaiContext(brandId);
  const routingPrompt = followupText ? `${trimmed}\n\nIntegrazione richiesta:\n${followupText}` : trimmed;
  const modelChoice = pickWaiModel(routingPrompt);
  const refinement = followupText
    ? { followup: followupText, previousProposal }
    : null;
  const text = await callWai(
    buildWaiSystemPrompt(),
    buildUserMessage(trimmed, context, refinement),
    modelChoice.model
  );
  const parsedJson = await extractWaiJsonWithRepair(text, modelChoice.model);
  const parsed = coerceWaiProposal(routingPrompt, coerceAudiencePlatformQuery(routingPrompt, parsedJson));
  const proposal = validateWaiResponse(parsed, brandId, routingPrompt);
  return {
    ...proposal,
    model: modelChoice.model,
    model_label: formatModelLabel(modelChoice.model),
    model_tier: modelChoice.tier,
    model_routing: modelChoice.routing
  };
}

module.exports = {
  buildWaiSystemPrompt,
  EXECUTABLE_INTENTS,
  buildWaiContext,
  buildUserMessage,
  callWai,
  askWai,
  coerceWaiProposal,
  extractWaiJsonWithRepair,
  validateWaiResponse
};

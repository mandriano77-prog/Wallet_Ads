/**
 * EXTRA — database layer per member_integrations (stato/dati per dipendente).
 * Segue il pattern di src/db/portal.js (getPool lazy).
 */
'use strict';

const { randomUUID, randomBytes, createHash } = require('crypto');

function getPool() {
  const { pool } = require('./index');
  if (!pool) throw new Error('Database pool not initialized — call getDb() first');
  return pool;
}

/** Tutte le integrazioni collegate di un dipendente. */
async function listMemberIntegrations(memberId) {
  if (!memberId) return [];
  const r = await getPool().query(
    `SELECT type, status, data, last_synced_at
     FROM member_integrations WHERE member_id = $1`,
    [memberId]
  );
  return r.rows.map((row) => ({
    type: row.type,
    status: row.status,
    data: row.data || {},
    last_synced_at: row.last_synced_at,
  }));
}

async function getMemberIntegration(memberId, type) {
  const r = await getPool().query(
    `SELECT * FROM member_integrations WHERE member_id = $1 AND type = $2 LIMIT 1`,
    [memberId, type]
  );
  return r.rows[0] || null;
}

/** Crea/aggiorna lo stato di un'integrazione per un dipendente (upsert). */
async function upsertMemberIntegration({ member_id, brand_id, type, status, credentials, data }) {
  const id = randomUUID();
  const r = await getPool().query(
    `INSERT INTO member_integrations (id, member_id, brand_id, type, status, credentials, data, last_synced_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'{}'::jsonb),NOW(),NOW())
     ON CONFLICT (member_id, type) DO UPDATE SET
       status = EXCLUDED.status,
       credentials = COALESCE(EXCLUDED.credentials, member_integrations.credentials),
       data = EXCLUDED.data,
       last_synced_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [id, member_id, brand_id, type, status || 'not_connected', credentials || null,
     data ? JSON.stringify(data) : null]
  );
  return r.rows[0];
}

/** GDPR / disconnessione: elimina il collegamento. */
async function deleteMemberIntegration(memberId, type) {
  await getPool().query(
    `DELETE FROM member_integrations WHERE member_id = $1 AND type = $2`,
    [memberId, type]
  );
}

/**
 * Import massivo dati integrazione per matricola (employee_id) di un brand.
 * rows: [{ matricola, amount?, currency?, personal_url?, expires_at? }].
 * Match sui members del brand; ritorna { updated, not_found: [matricola...] }.
 */
const MONTHS_IT = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];

/** Normalizza un periodo in { period: 'YYYY-MM', label: 'Mese YYYY' }. Accetta
 *  'YYYY-MM', 'MM/YYYY', 'Luglio 2026'. Vuoto → mese corrente. */
function normalizePeriod(raw) {
  const s = String(raw == null ? '' : raw).trim();
  let y, m;
  let match;
  if (!s) { const d = new Date(); y = d.getFullYear(); m = d.getMonth() + 1; }
  else if ((match = s.match(/^(\d{4})[-/](\d{1,2})$/))) { y = +match[1]; m = +match[2]; }
  else if ((match = s.match(/^(\d{1,2})[-/](\d{4})$/))) { m = +match[1]; y = +match[2]; }
  else if ((match = s.match(/^([a-zàèéìòù]+)\s+(\d{4})$/i))) {
    const idx = MONTHS_IT.indexOf(match[1].toLowerCase());
    if (idx < 0) return null; m = idx + 1; y = +match[2];
  } else return null;
  if (!(m >= 1 && m <= 12) || !(y >= 2000 && y <= 2100)) return null;
  const period = y + '-' + String(m).padStart(2, '0');
  const label = MONTHS_IT[m - 1].charAt(0).toUpperCase() + MONTHS_IT[m - 1].slice(1) + ' ' + y;
  return { period, label };
}

async function bulkUpsertByEmployeeId(brandId, type, rows) {
  const pool = getPool();
  let updated = 0;
  const notFound = [];
  for (const row of rows) {
    const matricola = String(row.matricola || '').trim();
    if (!matricola) continue;
    const m = await pool.query(
      `SELECT id FROM members WHERE brand_id = $1 AND employee_id = $2 LIMIT 1`,
      [brandId, matricola]
    );
    const member = m.rows[0];
    if (!member) { notFound.push(matricola); continue; }

    // Merge nello stato esistente: lo storico mensile (data.months) va accumulato,
    // aggiornando il mese se già presente. currency/personal_url sono a livello top.
    const existing = await getMemberIntegration(member.id, type);
    const data = (existing && existing.data && typeof existing.data === 'object') ? { ...existing.data } : {};

    // Voce nativa ferie: mappa ferie/permessi residui (giorni), non importi.
    if (type === 'ferie') {
      if (row.ferie != null && row.ferie !== '') data.ferie_residue = Number(String(row.ferie).replace(',', '.'));
      if (row.permessi != null && row.permessi !== '') data.permessi_residue = Number(String(row.permessi).replace(',', '.'));
      data.updated_label = row.period ? String(row.period) : new Date().toLocaleDateString('it-IT');
      await upsertMemberIntegration({ member_id: member.id, brand_id: brandId, type, status: 'connected', data });
      updated += 1;
      continue;
    }

    data.currency = row.currency || data.currency || 'EUR';
    if (row.personal_url) data.personal_url = String(row.personal_url).slice(0, 1000);

    if (row.amount != null && row.amount !== '') {
      const amount = Number(row.amount);
      const period = normalizePeriod(row.period);
      if (period) {
        const months = Array.isArray(data.months) ? data.months.filter((mo) => mo.period !== period.period) : [];
        months.push({ period: period.period, label: period.label, amount });
        months.sort((a, b) => (a.period < b.period ? 1 : -1)); // più recente prima
        data.months = months.slice(0, 24); // max 2 anni di storico
        data.loaded_amount = months[0].amount; // il mese più recente in evidenza
        data.current_period = months[0].label;
      } else {
        data.loaded_amount = amount; // nessun periodo → valore singolo
      }
    }

    await upsertMemberIntegration({
      member_id: member.id, brand_id: brandId, type,
      status: 'connected', data,
    });
    updated += 1;
  }
  return { updated, not_found: notFound };
}

function hashApiKey(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}

/** Genera una nuova chiave API per il brand (revoca le precedenti). Ritorna il
 *  valore in chiaro (mostrato UNA volta) + prefisso per riconoscerla. */
async function createBrandApiKey(brandId) {
  const pool = getPool();
  const key = 'fd_' + randomBytes(24).toString('hex');
  const prefix = key.slice(0, 10);
  await pool.query('DELETE FROM integration_api_keys WHERE brand_id = $1', [brandId]);
  await pool.query(
    'INSERT INTO integration_api_keys (key_hash, brand_id, prefix) VALUES ($1,$2,$3)',
    [hashApiKey(key), brandId, prefix]
  );
  return { key, prefix };
}

/** Ritorna il brand_id se la chiave è valida, altrimenti null. */
async function verifyBrandApiKey(key) {
  if (!key || !String(key).startsWith('fd_')) return null;
  const pool = getPool();
  const r = await pool.query(
    'SELECT brand_id FROM integration_api_keys WHERE key_hash = $1 LIMIT 1',
    [hashApiKey(key)]
  );
  if (!r.rows[0]) return null;
  pool.query('UPDATE integration_api_keys SET last_used_at = NOW() WHERE key_hash = $1', [hashApiKey(key)]).catch(() => {});
  return r.rows[0].brand_id;
}

async function getBrandApiKeyInfo(brandId) {
  const r = await getPool().query(
    'SELECT prefix, created_at, last_used_at FROM integration_api_keys WHERE brand_id = $1 LIMIT 1',
    [brandId]
  );
  return r.rows[0] || null;
}

async function revokeBrandApiKeys(brandId) {
  await getPool().query('DELETE FROM integration_api_keys WHERE brand_id = $1', [brandId]);
}

module.exports = {
  bulkUpsertByEmployeeId,
  normalizePeriod,
  createBrandApiKey,
  verifyBrandApiKey,
  getBrandApiKeyInfo,
  revokeBrandApiKeys,
  listMemberIntegrations,
  getMemberIntegration,
  upsertMemberIntegration,
  deleteMemberIntegration,
};

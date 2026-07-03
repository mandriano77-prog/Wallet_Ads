/**
 * EXTRA — database layer per member_integrations (stato/dati per dipendente).
 * Segue il pattern di src/db/portal.js (getPool lazy).
 */
'use strict';

const { randomUUID } = require('crypto');

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
    const data = {};
    if (row.amount != null && row.amount !== '') data.loaded_amount = Number(row.amount);
    data.currency = row.currency || 'EUR';
    if (row.personal_url) data.personal_url = String(row.personal_url).slice(0, 1000);
    if (row.expires_at) data.expires_at = row.expires_at;
    await upsertMemberIntegration({
      member_id: member.id, brand_id: brandId, type,
      status: 'connected', data,
    });
    updated += 1;
  }
  return { updated, not_found: notFound };
}

module.exports = {
  bulkUpsertByEmployeeId,
  listMemberIntegrations,
  getMemberIntegration,
  upsertMemberIntegration,
  deleteMemberIntegration,
};

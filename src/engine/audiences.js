/**
 * Pass holders insights and dynamic audience segmentation.
 */
const { pool } = require('../db');

const ALLOWED_EVENT_ACTIONS = new Set([
  'created', 'downloaded', 'installed', 'removed', 'opened',
  'link_click', 'instant_win_played', 'instant_win_won', 'gamification_played',
  'google_installed', 'google_removed', 'scheduled_sent'
]);

function sanitizeBehavior(behavior) {
  if (!behavior || typeof behavior !== 'object') return null;
  const out = {};
  if (behavior.did_action && ALLOWED_EVENT_ACTIONS.has(behavior.did_action)) {
    out.did_action = behavior.did_action;
  }
  if (behavior.never_did_action && ALLOWED_EVENT_ACTIONS.has(behavior.never_did_action)) {
    out.never_did_action = behavior.never_did_action;
  }
  if (behavior.target_key) out.target_key = String(behavior.target_key).slice(0, 64);
  if (behavior.target_type) out.target_type = String(behavior.target_type).slice(0, 64);
  const days = parseInt(behavior.since_days, 10);
  if (Number.isFinite(days) && days > 0) out.since_days = Math.min(days, 365);
  const minCount = parseInt(behavior.min_count, 10);
  if (Number.isFinite(minCount) && minCount > 0) out.min_count = Math.min(minCount, 1000);
  if (!out.did_action && !out.never_did_action) return null;
  return out;
}

function contactEmailSql(alias = 'p') {
  return `COALESCE(
    NULLIF(TRIM(${alias}.field_values->>'email'), ''),
    NULLIF(TRIM(${alias}.field_values->>'Email'), ''),
    NULLIF(TRIM(${alias}.field_values->>'mail'), ''),
    (SELECT iw.player_email FROM instant_win_plays iw
      WHERE iw.serial_number = ${alias}.serial_number AND iw.player_email IS NOT NULL
      ORDER BY iw.played_at DESC NULLS LAST LIMIT 1),
    (SELECT gp.player_email FROM gamification_plays gp
      WHERE gp.serial_number = ${alias}.serial_number AND gp.player_email IS NOT NULL
      ORDER BY gp.played_at DESC NULLS LAST LIMIT 1)
  )`;
}

function contactPhoneSql(alias = 'p') {
  return `COALESCE(
    NULLIF(TRIM(${alias}.field_values->>'phone'), ''),
    NULLIF(TRIM(${alias}.field_values->>'telefono'), ''),
    NULLIF(TRIM(${alias}.field_values->>'Phone'), ''),
    (SELECT iw.player_phone FROM instant_win_plays iw
      WHERE iw.serial_number = ${alias}.serial_number AND iw.player_phone IS NOT NULL
      ORDER BY iw.played_at DESC NULLS LAST LIMIT 1),
    (SELECT gp.player_phone FROM gamification_plays gp
      WHERE gp.serial_number = ${alias}.serial_number AND gp.player_phone IS NOT NULL
      ORDER BY gp.played_at DESC NULLS LAST LIMIT 1)
  )`;
}

function contactFirstNameSql(alias = 'p') {
  return `COALESCE(
    NULLIF(TRIM(${alias}.field_values->>'firstName'), ''),
    NULLIF(TRIM(${alias}.field_values->>'nome'), ''),
    NULLIF(TRIM(${alias}.field_values->>'first_name'), ''),
    (SELECT iw.player_first_name FROM instant_win_plays iw
      WHERE iw.serial_number = ${alias}.serial_number AND iw.player_first_name IS NOT NULL
      ORDER BY iw.played_at DESC NULLS LAST LIMIT 1),
    (SELECT gp.player_first_name FROM gamification_plays gp
      WHERE gp.serial_number = ${alias}.serial_number AND gp.player_first_name IS NOT NULL
      ORDER BY gp.played_at DESC NULLS LAST LIMIT 1)
  )`;
}

function contactLastNameSql(alias = 'p') {
  return `COALESCE(
    NULLIF(TRIM(${alias}.field_values->>'lastName'), ''),
    NULLIF(TRIM(${alias}.field_values->>'cognome'), ''),
    NULLIF(TRIM(${alias}.field_values->>'last_name'), ''),
    (SELECT iw.player_last_name FROM instant_win_plays iw
      WHERE iw.serial_number = ${alias}.serial_number AND iw.player_last_name IS NOT NULL
      ORDER BY iw.played_at DESC NULLS LAST LIMIT 1),
    (SELECT gp.player_last_name FROM gamification_plays gp
      WHERE gp.serial_number = ${alias}.serial_number AND gp.player_last_name IS NOT NULL
      ORDER BY gp.played_at DESC NULLS LAST LIMIT 1)
  )`;
}

function parseTenureYears(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, 60);
}

/** Department from members row or pass field_values (reparto / department). */
function passDepartmentSql(pAlias = 'p') {
  return `COALESCE(
    (SELECT NULLIF(TRIM(department), '') FROM members WHERE pass_id = ${pAlias}.id LIMIT 1),
    (SELECT NULLIF(TRIM(department), '') FROM members WHERE id = ${pAlias}.member_id LIMIT 1),
    NULLIF(TRIM(${pAlias}.field_values->>'department'), ''),
    NULLIF(TRIM(${pAlias}.field_values->>'reparto'), '')
  )`;
}

/** City / site from members or pass field_values (sede / office_location). */
function passOfficeLocationSql(pAlias = 'p') {
  return `COALESCE(
    (SELECT NULLIF(TRIM(office_location), '') FROM members WHERE pass_id = ${pAlias}.id LIMIT 1),
    (SELECT NULLIF(TRIM(office_location), '') FROM members WHERE id = ${pAlias}.member_id LIMIT 1),
    NULLIF(TRIM(${pAlias}.field_values->>'office_location'), ''),
    NULLIF(TRIM(${pAlias}.field_values->>'sede'), '')
  )`;
}

/** Hire date ISO from members or pass field_values. */
function passHireDateSql(pAlias = 'p') {
  const fv = `${pAlias}.field_values`;
  return `COALESCE(
    (SELECT hire_date FROM members WHERE pass_id = ${pAlias}.id LIMIT 1),
    (SELECT hire_date FROM members WHERE id = ${pAlias}.member_id LIMIT 1),
    CASE
      WHEN NULLIF(TRIM(${fv}->>'hire_date'), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        THEN (NULLIF(TRIM(${fv}->>'hire_date'), ''))::date
      WHEN NULLIF(TRIM(${fv}->>'data_assunzione'), '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        THEN (NULLIF(TRIM(${fv}->>'data_assunzione'), ''))::date
      ELSE NULL
    END
  )`;
}

/** Full years in company from hire_date (null when hire date missing). */
function passTenureYearsSql(pAlias = 'p') {
  const hire = passHireDateSql(pAlias);
  return `CASE
    WHEN (${hire}) IS NOT NULL
      THEN EXTRACT(YEAR FROM age(CURRENT_DATE, (${hire})))::int
    ELSE NULL
  END`;
}

function normalizeRules(rules = {}) {
  if (!rules || typeof rules !== 'object') return {};
  const tri = (v) => (v === true ? true : v === false ? false : null);
  return {
    campaign_id: rules.campaign_id || null,
    status: rules.status || 'any',
    wallet: rules.wallet || 'any',
    has_apple_push: tri(rules.has_apple_push),
    has_email: tri(rules.has_email),
    has_phone: tri(rules.has_phone),
    created_after: rules.created_after || null,
    created_before: rules.created_before || null,
    utm_source: rules.utm_source ? String(rules.utm_source).trim() : null,
    played_instant_win: tri(rules.played_instant_win),
    played_gamification: tri(rules.played_gamification),
    department: rules.department ? String(rules.department).trim() : null,
    office_location: rules.office_location ? String(rules.office_location).trim() : null,
    min_tenure_years: parseTenureYears(rules.min_tenure_years),
    max_tenure_years: parseTenureYears(rules.max_tenure_years),
    behavior: sanitizeBehavior(rules.behavior)
  };
}

function appendBehaviorClauses(behavior, clauses, params, startIdx) {
  if (!behavior) return startIdx;
  let idx = startIdx;
  if (behavior.did_action) {
    const minCount = behavior.min_count || 1;
    const sinceDays = behavior.since_days || 365;
    params.push(behavior.did_action);
    const actionIdx = idx++;
    let sub = `(
      SELECT COUNT(*)::int FROM holder_events he
      WHERE he.brand_id = p.brand_id
        AND he.serial_number = p.serial_number
        AND he.event_action = $${actionIdx}
        AND he.created_at >= NOW() - INTERVAL '${sinceDays} days'`;
    if (behavior.target_key) {
      params.push(behavior.target_key);
      sub += ` AND he.target_key = $${idx++}`;
    }
    if (behavior.target_type) {
      params.push(behavior.target_type);
      sub += ` AND he.target_type = $${idx++}`;
    }
    sub += `) >= ${minCount}`;
    clauses.push(sub);
  }
  if (behavior.never_did_action) {
    const sinceDays = behavior.since_days || 365;
    params.push(behavior.never_did_action);
    const actionIdx = idx++;
    let sub = `NOT EXISTS (
      SELECT 1 FROM holder_events he
      WHERE he.brand_id = p.brand_id
        AND he.serial_number = p.serial_number
        AND he.event_action = $${actionIdx}
        AND he.created_at >= NOW() - INTERVAL '${sinceDays} days'`;
    if (behavior.target_key) {
      params.push(behavior.target_key);
      sub += ` AND he.target_key = $${idx++}`;
    }
    sub += ')';
    clauses.push(sub);
  }
  return idx;
}

function buildAudienceFilter(rules, startIdx = 2) {
  const r = normalizeRules(rules);
  const clauses = [];
  const params = [];
  let idx = startIdx;

  if (r.campaign_id) {
    clauses.push(`p.campaign_id = $${idx++}`);
    params.push(r.campaign_id);
  }
  if (r.status && r.status !== 'any') {
    clauses.push(`p.status = $${idx++}`);
    params.push(r.status);
  }
  if (r.created_after) {
    clauses.push(`p.created_at >= $${idx++}::timestamptz`);
    params.push(r.created_after);
  }
  if (r.created_before) {
    clauses.push(`p.created_at <= $${idx++}::timestamptz`);
    params.push(r.created_before);
  }
  if (r.utm_source) {
    clauses.push(`(p.utm->>'utm_source') ILIKE $${idx++}`);
    params.push(`%${r.utm_source}%`);
  }
  if (r.wallet === 'google') {
    clauses.push('p.google_wallet_saved = TRUE');
  } else if (r.wallet === 'samsung') {
    clauses.push('p.samsung_wallet_saved = TRUE');
  } else if (r.wallet === 'apple') {
    clauses.push(`EXISTS (SELECT 1 FROM device_registrations dr WHERE dr.serial_number = p.serial_number)`);
  } else if (r.wallet === 'installed') {
    clauses.push(`(
      EXISTS (SELECT 1 FROM device_registrations dr WHERE dr.serial_number = p.serial_number)
      OR p.google_wallet_saved = TRUE
      OR p.samsung_wallet_saved = TRUE
    )`);
  }
  if (r.has_apple_push === true) {
    clauses.push(`EXISTS (
      SELECT 1 FROM device_registrations dr
      WHERE dr.serial_number = p.serial_number
        AND dr.push_token IS NOT NULL AND dr.push_token <> ''
    )`);
  } else if (r.has_apple_push === false) {
    clauses.push(`NOT EXISTS (
      SELECT 1 FROM device_registrations dr
      WHERE dr.serial_number = p.serial_number
        AND dr.push_token IS NOT NULL AND dr.push_token <> ''
    )`);
  }
  const emailExpr = contactEmailSql('p');
  const phoneExpr = contactPhoneSql('p');
  if (r.has_email === true) {
    clauses.push(`${emailExpr} IS NOT NULL`);
  } else if (r.has_email === false) {
    clauses.push(`${emailExpr} IS NULL`);
  }
  if (r.has_phone === true) {
    clauses.push(`${phoneExpr} IS NOT NULL`);
  } else if (r.has_phone === false) {
    clauses.push(`${phoneExpr} IS NULL`);
  }
  if (r.played_instant_win === true) {
    clauses.push(`EXISTS (
      SELECT 1 FROM instant_win_plays iw
      WHERE iw.serial_number = p.serial_number AND iw.brand_id = p.brand_id
    )`);
  } else if (r.played_instant_win === false) {
    clauses.push(`NOT EXISTS (
      SELECT 1 FROM instant_win_plays iw
      WHERE iw.serial_number = p.serial_number AND iw.brand_id = p.brand_id
    )`);
  }
  if (r.played_gamification === true) {
    clauses.push(`EXISTS (
      SELECT 1 FROM gamification_plays gp
      WHERE gp.serial_number = p.serial_number AND gp.brand_id = p.brand_id
    )`);
  } else if (r.played_gamification === false) {
    clauses.push(`NOT EXISTS (
      SELECT 1 FROM gamification_plays gp
      WHERE gp.serial_number = p.serial_number AND gp.brand_id = p.brand_id
    )`);
  }

  if (r.department) {
    clauses.push(`LOWER(${passDepartmentSql('p')}) = LOWER($${idx++})`);
    params.push(r.department);
  }
  if (r.office_location) {
    clauses.push(`LOWER(${passOfficeLocationSql('p')}) = LOWER($${idx++})`);
    params.push(r.office_location);
  }
  const tenureExpr = passTenureYearsSql('p');
  if (r.min_tenure_years != null) {
    clauses.push(`(${tenureExpr}) IS NOT NULL AND (${tenureExpr}) >= $${idx++}`);
    params.push(r.min_tenure_years);
  }
  if (r.max_tenure_years != null) {
    clauses.push(`(${tenureExpr}) IS NOT NULL AND (${tenureExpr}) <= $${idx++}`);
    params.push(r.max_tenure_years);
  }

  appendBehaviorClauses(r.behavior, clauses, params, idx);

  const whereExtra = clauses.length ? ` AND ${clauses.join(' AND ')}` : '';
  return { whereExtra, params, rules: r };
}

function hasActiveRules(rules) {
  const r = normalizeRules(rules);
  return !!(
    r.campaign_id ||
    (r.status && r.status !== 'any') ||
    (r.wallet && r.wallet !== 'any') ||
    r.has_apple_push !== null ||
    r.has_email !== null ||
    r.has_phone !== null ||
    r.created_after ||
    r.created_before ||
    r.utm_source ||
    r.played_instant_win !== null ||
    r.played_gamification !== null ||
    r.department ||
    r.office_location ||
    r.min_tenure_years != null ||
    r.max_tenure_years != null ||
    r.behavior
  );
}

async function countAudienceMembers(brandId, rules) {
  const { whereExtra, params } = buildAudienceFilter(rules);
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM pass_instances p WHERE p.brand_id = $1${whereExtra}`,
    [brandId, ...params]
  );
  return result.rows[0].count;
}

async function listAudienceMembers(brandId, rules, { limit = 50, offset = 0 } = {}) {
  const { whereExtra, params } = buildAudienceFilter(rules);
  const emailExpr = contactEmailSql('p');
  const phoneExpr = contactPhoneSql('p');
  const firstExpr = contactFirstNameSql('p');
  const lastExpr = contactLastNameSql('p');
  const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 500);
  const off = Math.max(parseInt(offset, 10) || 0, 0);
  const pIdx = params.length + 2;
  const result = await pool.query(
    `SELECT
      p.id AS pass_id,
      p.serial_number,
      p.campaign_id,
      p.status,
      p.created_at,
      c.name AS campaign_name,
      ${emailExpr} AS contact_email,
      ${phoneExpr} AS contact_phone,
      ${firstExpr} AS contact_first_name,
      ${lastExpr} AS contact_last_name,
      EXISTS (SELECT 1 FROM device_registrations dr WHERE dr.serial_number = p.serial_number) AS has_apple,
      EXISTS (
        SELECT 1 FROM device_registrations dr
        WHERE dr.serial_number = p.serial_number
          AND dr.push_token IS NOT NULL AND dr.push_token <> ''
      ) AS has_apple_push,
      p.google_wallet_saved,
      p.samsung_wallet_saved
    FROM pass_instances p
    LEFT JOIN campaigns c ON c.id = p.campaign_id
    WHERE p.brand_id = $1${whereExtra}
    ORDER BY p.created_at DESC
    LIMIT $${pIdx} OFFSET $${pIdx + 1}`,
    [brandId, ...params, lim, off]
  );
  return result.rows;
}

async function getPassHoldersInsights(brandId) {
  const emailExpr = contactEmailSql('p');
  const phoneExpr = contactPhoneSql('p');
  const [
    totals,
    statusRows,
    reachRows,
    contactRows,
    recentRows,
    campaignRows
  ] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM pass_instances WHERE brand_id = $1', [brandId]),
    pool.query(
      `SELECT status, COUNT(*)::int AS count FROM pass_instances WHERE brand_id = $1 GROUP BY status`,
      [brandId]
    ),
    pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM device_registrations dr
          WHERE dr.serial_number = p.serial_number
            AND dr.push_token IS NOT NULL AND dr.push_token <> ''
        ))::int AS apple_push,
        COUNT(*) FILTER (WHERE p.google_wallet_saved = TRUE)::int AS google_saved,
        COUNT(*) FILTER (WHERE p.samsung_wallet_saved = TRUE)::int AS samsung_saved,
        COUNT(*) FILTER (WHERE
          EXISTS (SELECT 1 FROM device_registrations dr WHERE dr.serial_number = p.serial_number)
          OR p.google_wallet_saved = TRUE
          OR p.samsung_wallet_saved = TRUE
        )::int AS installed_any
      FROM pass_instances p WHERE p.brand_id = $1`,
      [brandId]
    ),
    pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE ${emailExpr} IS NOT NULL)::int AS with_email,
        COUNT(*) FILTER (WHERE ${phoneExpr} IS NOT NULL)::int AS with_phone
      FROM pass_instances p WHERE p.brand_id = $1`,
      [brandId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM pass_instances
       WHERE brand_id = $1 AND created_at >= NOW() - INTERVAL '7 days'`,
      [brandId]
    ),
    pool.query(
      `SELECT c.id, c.name,
        COUNT(p.id)::int AS pass_count,
        COUNT(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM device_registrations dr WHERE dr.serial_number = p.serial_number
        ))::int AS apple_installs
      FROM campaigns c
      LEFT JOIN pass_instances p ON p.campaign_id = c.id
      WHERE c.brand_id = $1
      GROUP BY c.id, c.name
      ORDER BY pass_count DESC
      LIMIT 8`,
      [brandId]
    )
  ]);

  const byStatus = {};
  for (const row of statusRows.rows) byStatus[row.status || 'unknown'] = row.count;

  return {
    total_holders: totals.rows[0].total,
    by_status: byStatus,
    apple_push_reachable: reachRows.rows[0].apple_push,
    google_wallet_saved: reachRows.rows[0].google_saved,
    samsung_wallet_saved: reachRows.rows[0].samsung_saved,
    installed_any_wallet: reachRows.rows[0].installed_any,
    with_email: contactRows.rows[0].with_email,
    with_phone: contactRows.rows[0].with_phone,
    new_last_7_days: recentRows.rows[0].count,
    by_campaign: campaignRows.rows
  };
}

async function resolveAudienceRules(brandId, { audience_id, audience_rules, campaign_id }) {
  if (audience_id) {
    const result = await pool.query('SELECT * FROM audiences WHERE id = $1', [audience_id]);
    const row = result.rows[0];
    if (!row || row.brand_id !== brandId) throw new Error('Audience non trovata');
    return normalizeRules(row.rules || {});
  }
  if (audience_rules && hasActiveRules(audience_rules)) {
    return normalizeRules(audience_rules);
  }
  if (campaign_id) {
    return normalizeRules({ campaign_id });
  }
  return null;
}

async function getTargetPassesForPush(brandId, opts = {}) {
  const rules = await resolveAudienceRules(brandId, opts);
  if (rules && hasActiveRules(rules)) {
    const { whereExtra, params } = buildAudienceFilter(rules);
    const result = await pool.query(
      `SELECT p.* FROM pass_instances p WHERE p.brand_id = $1 AND p.status IS DISTINCT FROM 'revoked'${whereExtra}`,
      [brandId, ...params]
    );
    return result.rows;
  }
  if (opts.campaign_id) {
    const result = await pool.query(
      "SELECT * FROM pass_instances WHERE brand_id = $1 AND campaign_id = $2 AND status IS DISTINCT FROM 'revoked'",
      [brandId, opts.campaign_id]
    );
    return result.rows;
  }
  const result = await pool.query("SELECT * FROM pass_instances WHERE brand_id = $1 AND status IS DISTINCT FROM 'revoked'", [brandId]);
  return result.rows;
}

async function getAppleDevicesForAudience(brandId, opts = {}) {
  const rules = await resolveAudienceRules(brandId, opts);
  if (rules && hasActiveRules(rules)) {
    const { whereExtra, params } = buildAudienceFilter(rules);
    const result = await pool.query(
      `SELECT DISTINCT dr.push_token, dr.serial_number, dr.device_library_id
       FROM device_registrations dr
       JOIN pass_instances p ON dr.serial_number = p.serial_number
       WHERE p.brand_id = $1 AND p.status IS DISTINCT FROM 'revoked'
         AND dr.push_token IS NOT NULL AND dr.push_token <> ''${whereExtra}`,
      [brandId, ...params]
    );
    return result.rows;
  }
  if (opts.campaign_id) {
    const result = await pool.query(
      `SELECT DISTINCT dr.push_token, dr.serial_number, dr.device_library_id
       FROM device_registrations dr
       JOIN pass_instances pi ON dr.serial_number = pi.serial_number
       WHERE pi.brand_id = $1 AND pi.campaign_id = $2 AND pi.status IS DISTINCT FROM 'revoked'`,
      [brandId, opts.campaign_id]
    );
    return result.rows;
  }
  const { getDevicesForBrand } = require('../db');
  return getDevicesForBrand(brandId);
}

module.exports = {
  ALLOWED_EVENT_ACTIONS,
  sanitizeBehavior,
  normalizeRules,
  parseTenureYears,
  passDepartmentSql,
  passOfficeLocationSql,
  passHireDateSql,
  passTenureYearsSql,
  hasActiveRules,
  buildAudienceFilter,
  countAudienceMembers,
  listAudienceMembers,
  getPassHoldersInsights,
  getTargetPassesForPush,
  getAppleDevicesForAudience,
  contactEmailSql,
  contactPhoneSql,
  contactFirstNameSql,
  contactLastNameSql
};

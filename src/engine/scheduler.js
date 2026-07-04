/**
 * Push Notification Scheduler
 * Runs every 60 seconds, checks for due scheduled_push entries,
 * sends them via the same push logic as manual sends, and updates next_run_at.
 */

const {
  getDueScheduledPush,
  updateScheduledPush,
  getBrand,
  logEvent,
} = require('../db');
const { closeApnsSession } = require('./apns');
const { executeWalletPush } = require('./push-dispatch');
const { normalizeHrPushPayload, resolvePushScreenAlert } = require('./push-text-limits');

/**
 * First `next_run_at` when saving a scheduled push from the dashboard.
 * Uses Europe/Rome (TZ set at process start in server.js).
 * PostgreSQL stores TIMESTAMPTZ as absolute instants; NOW() compares correctly.
 */
function computeInitialScheduledRun(input) {
  const schedule_time = input.schedule_time || '09:00';
  const [hours, minutesRaw] = String(schedule_time).split(':').map((x) => parseInt(String(x).trim(), 10));
  const minutes = Number.isFinite(minutesRaw) ? minutesRaw : 0;
  const h = Number.isFinite(hours) ? hours : 9;
  const now = Date.now();

  const schedule_type = input.schedule_type || 'once';

  if (schedule_type === 'once') {
    const dateStr = input.date;
    if (!dateStr || String(dateStr).length < 8) return null;
    const parts = String(dateStr).split('-').map((x) => parseInt(String(x).trim(), 10));
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return null;
    const [y, m, d] = parts;
    return new Date(y, m - 1, d, h, minutes, 0, 0);
  }

  if (schedule_type === 'daily') {
    const cand = new Date();
    cand.setHours(h, minutes, 0, 0);
    if (cand.getTime() <= now) {
      cand.setDate(cand.getDate() + 1);
      cand.setHours(h, minutes, 0, 0);
    }
    return cand;
  }

  if (schedule_type === 'weekly') {
    let daysStr = input.schedule_days;
    if ((!daysStr || String(daysStr).trim() === '') && Array.isArray(input.days)) {
      daysStr = input.days.map((x) => String(x)).filter(Boolean).join(',');
    }
    const dowList = String(daysStr || '1')
      .split(',')
      .map((x) => parseInt(String(x).trim(), 10))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
    if (!dowList.length) return null;

    for (let add = 0; add <= 21; add++) {
      const candidate = new Date();
      candidate.setDate(candidate.getDate() + add);
      candidate.setHours(h, minutes, 0, 0);
      if (!dowList.includes(candidate.getDay())) continue;
      if (candidate.getTime() > now) return candidate;
    }
  }

  return null;
}

function calculateNextRun(schedule) {
  const [hours, minutes] = (schedule.schedule_time || '09:00').split(':').map(Number);
  const now = new Date();

  if (schedule.schedule_type === 'once') {
    return null;
  }

  if (schedule.schedule_type === 'daily') {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(hours, minutes, 0, 0);
    return next;
  }

  if (schedule.schedule_type === 'weekly') {
    const days = (schedule.schedule_days || '1').split(',').map(Number);
    const today = now.getDay();
    let minDaysAhead = 8;
    for (const d of days) {
      let diff = d - today;
      if (diff <= 0) diff += 7;
      if (diff < minDaysAhead) minDaysAhead = diff;
    }
    const next = new Date();
    next.setDate(next.getDate() + minDaysAhead);
    next.setHours(hours, minutes, 0, 0);
    return next;
  }

  return null;
}

async function executeScheduledPush(schedule, baseUrl) {
  const { brand_id, title } = schedule;

  console.log(`⏰ Executing scheduled push: "${title}" for brand ${brand_id}`);

  const brand = await getBrand(brand_id);
  if (!brand) {
    console.error(`Brand ${brand_id} not found, skipping`);
    return;
  }

  const normalized = normalizeHrPushPayload(schedule);
  const screen_alert = resolvePushScreenAlert(normalized);
  const result = await executeWalletPush({ ...normalized, screen_alert }, {
    hrDeploy: true,
    resolvedStripBase64: schedule.strip_base64 || null,
    origin: 'programmata',
  });
  closeApnsSession();

  await logEvent({
    brand_id,
    event_type: 'scheduled_push_sent',
    metadata: {
      title,
      channel: schedule.channel,
      result,
      schedule_id: schedule.id,
    },
  });

  console.log(`✓ Scheduled push sent: ${result.sent || 0} wallet updates`);
}

async function schedulerTick(baseUrl) {
  try {
    const due = await getDueScheduledPush();
    if (due.length === 0) return;

    console.log(`⏰ Scheduler: ${due.length} notification(s) due`);

    for (const schedule of due) {
      try {
        await executeScheduledPush(schedule, baseUrl);

        const nextRun = calculateNextRun(schedule);
        if (nextRun) {
          await updateScheduledPush(schedule.id, { next_run_at: nextRun, last_run_at: new Date() });
        } else {
          await updateScheduledPush(schedule.id, { active: false, last_run_at: new Date() });
        }
      } catch (err) {
        console.error(`Error executing schedule ${schedule.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('Scheduler tick error:', err.message);
  }
}

let schedulerInterval = null;

function startScheduler(baseUrl) {
  if (schedulerInterval) return;
  console.log('⏰ Push scheduler started (checking every 60s)');
  schedulerTick(baseUrl);
  schedulerInterval = setInterval(() => schedulerTick(baseUrl), 60 * 1000);
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('⏰ Push scheduler stopped');
  }
}

module.exports = { startScheduler, stopScheduler, schedulerTick, calculateNextRun, computeInitialScheduledRun };

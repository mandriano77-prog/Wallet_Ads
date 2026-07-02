// Protocollo web service Apple Wallet (spec PassKit Web Service):
// registrazione/deregistrazione device, elenco serial per device, fetch .pkpass, device log.
// Estratto da routes.js — montato al posto originale per preservare l'ordine di matching
// (/passes/:passTypeId/:serialNumber deve restare DOPO le route /passes/:id/*).
'use strict';

const express = require('express');
const { timingSafeEqual } = require('crypto');
const {
  pool,
  registerDevice, unregisterDevice, getSerialsForDevice,
  getPassBySerial, updatePassDeviceId, updatePassInstance,
  getBrand, getTemplate,
  logEvent, incrementCampaignInstalls,
} = require('../db');
const { buildPkpassCached } = require('../engine/pkpass-cache');
const { resolveBaseUrl } = require('../engine/base-url');

const router = express.Router();

// Apple Wallet web service auth: iOS invia "Authorization: ApplePass <authenticationToken>"
// (il token è quello embeddato nel pass.json alla generazione). Kill switch di emergenza:
// APPLE_WALLET_AUTH_DISABLED=1 disattiva l'enforcement senza redeploy del codice.
const APPLE_WALLET_AUTH_DISABLED = String(process.env.APPLE_WALLET_AUTH_DISABLED || '').trim() === '1';

function applePassAuthMatches(req, pass) {
  if (APPLE_WALLET_AUTH_DISABLED) return true;
  const expected = String(pass?.auth_token || '').trim();
  if (!expected) return true; // pass legacy senza token: non bloccare gli aggiornamenti
  const provided = String(req.headers.authorization || '').replace(/^ApplePass\s+/i, '').trim();
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function rejectApplePassAuth(req, res) {
  console.warn(`[Apple Wallet] 401 unauthorized ${req.method} ${req.originalUrl} | Auth header: ${req.headers.authorization ? 'present' : 'missing'}`);
  return res.status(401).send();
}

router.all('/devices/*', (req, res, next) => {
  console.log(`[Apple Wallet] ${req.method} ${req.originalUrl} | Auth: ${req.headers.authorization ? 'yes' : 'no'} | Body: ${JSON.stringify(req.body || {})}`);
  next();
});
router.all('/passes/:passTypeId/:serialNumber', (req, res, next) => {
  if (req.params.passTypeId && req.params.serialNumber && !req.path.includes('/download') && !req.path.includes('/regenerate')) {
    console.log(`[Apple Wallet] ${req.method} ${req.originalUrl} | Auth: ${req.headers.authorization ? 'yes' : 'no'}`);
  }
  next();
});

// Register device for push notifications
router.post('/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber', async (req, res) => {
  try {
    const { deviceLibraryId, serialNumber } = req.params;
    const pushToken = req.body.pushToken;
    console.log(`[Apple Wallet] REGISTER device=${deviceLibraryId.substring(0, 8)}... serial=${serialNumber.substring(0, 8)}... pushToken=${pushToken ? pushToken.substring(0, 8) + '...' : 'MISSING'}`);
    if (!pushToken) return res.status(400).send();

    const pass = await getPassBySerial(serialNumber);
    if (!pass) {
      console.warn(`[Apple Wallet] REGISTER: no pass found for serial ${serialNumber}`);
      return res.status(404).send();
    }
    if (!applePassAuthMatches(req, pass)) return rejectApplePassAuth(req, res);

    await registerDevice({ device_library_id: deviceLibraryId, push_token: pushToken, serial_number: serialNumber });
    await updatePassDeviceId(serialNumber, deviceLibraryId, 'apple');

    // Track install
    await logEvent({ pass_id: pass.id, brand_id: pass.brand_id, event_type: 'pass_installed', device_id: deviceLibraryId });
    if (pass.campaign_id) await incrementCampaignInstalls(pass.campaign_id);
    console.log(`[Apple Wallet] Device registered for pass ${pass.id}`);

    res.status(201).send();
  } catch (err) {
    console.error('[Apple Wallet] Registration error:', err);
    res.status(200).send(); // Apple expects 200 if already registered
  }
});

// Unregister device
router.delete('/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber', async (req, res) => {
  try {
    const { deviceLibraryId, serialNumber } = req.params;
    const pass = await getPassBySerial(serialNumber);
    // Se il pass non esiste più in DB, consenti comunque la pulizia della registrazione.
    if (pass && !applePassAuthMatches(req, pass)) return rejectApplePassAuth(req, res);

    await unregisterDevice(deviceLibraryId, serialNumber);

    if (pass) {
      await logEvent({ pass_id: pass.id, brand_id: pass.brand_id, event_type: 'pass_removed', device_id: deviceLibraryId });
      if (pass.device_source === 'apple') {
        const { rows } = await pool.query(
          'SELECT COUNT(*)::int AS c FROM device_registrations WHERE serial_number = $1',
          [serialNumber]
        );
        if (rows[0].c === 0) {
          await updatePassInstance(pass.id, { device_id: null, device_source: null });
        }
      }
    }

    res.status(200).send();
  } catch (err) {
    console.error('Device unregister error:', err);
    res.status(200).send();
  }
});

// Get serial numbers for device
router.get('/devices/:deviceLibraryId/registrations/:passTypeId', async (req, res) => {
  try {
    const tag = req.query.passesUpdatedSince || null;
    const serials = await getSerialsForDevice(req.params.deviceLibraryId, tag);
    if (serials.length === 0) return res.status(204).send();
    res.json({ serialNumbers: serials, lastUpdated: new Date().toISOString() });
  } catch (err) {
    console.error('Get serials error:', err);
    res.status(500).send();
  }
});

// Get latest pass (Apple Wallet refresh)
router.get('/passes/:passTypeId/:serialNumber', async (req, res) => {
  try {
    const pass = await getPassBySerial(req.params.serialNumber);
    if (!pass) return res.status(404).send();
    if (!applePassAuthMatches(req, pass)) return rejectApplePassAuth(req, res);

    // Conditional GET (spec Apple): se il pass non è cambiato dopo If-Modified-Since,
    // rispondi 304 senza rigenerare/firmare il .pkpass. Confronto a risoluzione di
    // secondi perché le date HTTP non hanno i millisecondi.
    const lastUpdated = new Date(pass.last_updated);
    const ifModifiedSince = req.headers['if-modified-since'];
    if (ifModifiedSince && !Number.isNaN(lastUpdated.getTime())) {
      const since = new Date(ifModifiedSince);
      if (!Number.isNaN(since.getTime()) &&
          Math.floor(lastUpdated.getTime() / 1000) <= Math.floor(since.getTime() / 1000)) {
        res.set('Last-Modified', lastUpdated.toUTCString());
        return res.status(304).send();
      }
    }

    const brand = await getBrand(pass.brand_id);
    const template = await getTemplate(pass.template_id);
    if (!brand || !template) return res.status(404).send();

    const baseUrl = resolveBaseUrl(req);

    const pkpassBuffer = await buildPkpassCached(template, pass, brand, {
      baseUrl,
      passTypeIdentifier: process.env.PASS_TYPE_IDENTIFIER || 'pass.com.nudj',
      teamIdentifier: process.env.TEAM_IDENTIFIER || 'YOUR_TEAM_ID'
    });

    await logEvent({ pass_id: pass.id, brand_id: pass.brand_id, event_type: 'pass_fetched' });

    res.set({
      'Content-Type': 'application/vnd.apple.pkpass',
      'Last-Modified': lastUpdated.toUTCString(),
      // no-cache (non no-store): il client può conservare il pass ma deve rivalidare
      // con If-Modified-Since, così sfrutta il 304 qui sopra.
      'Cache-Control': 'no-cache, must-revalidate'
    });
    res.send(pkpassBuffer);
  } catch (err) {
    console.error('Pass fetch error:', err);
    res.status(500).send();
  }
});

// Apple Wallet device log (spec: POST {webServiceURL}/v1/log).
// I device inviano qui gli errori lato client (pass malformati, fetch falliti):
// diagnostica utile nei log Railway, prima veniva persa con un 404.
router.post('/log', (req, res) => {
  try {
    const logs = Array.isArray(req.body?.logs) ? req.body.logs : [];
    for (const line of logs.slice(0, 20)) {
      console.warn('[Apple Wallet][device-log]', String(line).slice(0, 500));
    }
  } catch (_) { /* mai fallire verso il device per un log */ }
  res.status(200).send();
});

module.exports = router;

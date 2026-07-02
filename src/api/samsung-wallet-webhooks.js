// Samsung Wallet — data-fetch inbound, callback di stato (ADDED/DELETED/...),
// generazione save link e status. Estratto da routes.js.
'use strict';

const express = require('express');
const samsungWallet = require('../engine/samsung-wallet');
const {
  getPassInstance, updatePassInstance,
  getPassBySamsungRefId, updateSamsungWalletStatus, updatePassDeviceId,
  getBrand, getTemplate,
  logEvent,
} = require('../db');

const rateLimit = require('express-rate-limit');

const router = express.Router();

// I callback Samsung arrivano dai loro server (pochi req/min per pass reale):
// 120 req/min per IP e' ampio per il traffico legittimo e blocca flood/scan.
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  })
);

function samsungInboundHeadersOk(req, method) {
  const rid = req.get('x-request-id');
  if (!rid || String(rid).trim().length < 8) {
    console.warn('[SamsungWallet]', method, req.path, 'missing or short x-request-id');
    return false;
  }
  return samsungWallet.verifyInboundAuth(req.get('authorization'), method, req.path);
}

router.get('/samsung-wallet/status', (req, res) => {
  res.json(samsungWallet.getStatusInfo());
});

router.get('/samsung-wallet/pass/:id', async (req, res) => {
  try {
    if (!samsungWallet.isConfigured()) {
      return res.status(501).json({ error: 'Samsung Wallet not configured' });
    }
    const instance = await getPassInstance(req.params.id);
    if (!instance) return res.status(404).json({ error: 'Pass not found' });

    let refId = instance.samsung_wallet_ref_id;
    if (!refId) {
      refId = samsungWallet.refIdForPass(instance.id);
      await updatePassInstance(instance.id, {
        samsung_wallet_ref_id: refId,
        samsung_wallet_saved: false,
        samsung_installed_at: null
      });
    }

    const save_link = samsungWallet.generateDataFetchLink(refId);

    await logEvent({
      brand_id: instance.brand_id,
      pass_id: instance.id,
      event_type: 'samsung_wallet_link_generated',
      metadata: { refId }
    });

    res.json({ save_link, ref_id: refId });
  } catch (err) {
    console.error('[SamsungWallet] pass link error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/samsung-wallet/cards/:cardId/:refId', async (req, res) => {
  try {
    if (!samsungWallet.isConfigured()) {
      return res.status(503).json({ error: 'Samsung Wallet not configured' });
    }

    const { cardId, refId } = req.params;
    if (cardId !== samsungWallet.CARD_ID) {
      return res.status(204).send();
    }

    if (!samsungInboundHeadersOk(req, 'GET')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pass = await getPassBySamsungRefId(refId);
    if (!pass) {
      return res.status(204).send();
    }

    const template = await getTemplate(pass.template_id);
    const brand = await getBrand(pass.brand_id);
    if (!brand || !template) {
      return res.status(204).send();
    }

    const state = pass.samsung_wallet_saved ? 'ACTIVE' : 'PENDING';
    const body = samsungWallet.buildLoyaltyCardResponse(brand, template, pass, refId, state);

    console.log('[SamsungWallet] GET card data', String(refId).slice(0, 8));
    res.json(body);
  } catch (err) {
    console.error('[SamsungWallet] GET cards error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/samsung-wallet/cards/:cardId/:refId/requestAction', async (req, res) => {
  try {
    if (!samsungWallet.isConfigured()) {
      return res.status(503).json({ error: 'Samsung Wallet not configured' });
    }

    const { cardId, refId } = req.params;
    if (cardId !== samsungWallet.CARD_ID) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!samsungInboundHeadersOk(req, 'POST')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const pass = await getPassBySamsungRefId(refId);
    if (!pass) {
      return res.status(204).send();
    }

    await logEvent({
      pass_id: pass.id,
      brand_id: pass.brand_id,
      event_type: 'samsung_wallet_request_action',
      metadata: { refId, body: req.body || null }
    });

    res.status(200).send('OK');
  } catch (err) {
    console.error('[SamsungWallet] POST requestAction error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/samsung-wallet/cards/:cardId/:refId', async (req, res) => {
  try {
    if (!samsungWallet.isConfigured()) {
      return res.status(503).json({ error: 'Samsung Wallet not configured' });
    }

    const { cardId, refId } = req.params;
    if (cardId !== samsungWallet.CARD_ID) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!samsungInboundHeadersOk(req, 'POST')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const cc2 = String(req.query.cc2 || '').trim();
    const eventRaw = String(req.query.event || '').trim().toUpperCase();
    if (!cc2 || cc2.length !== 2 || !eventRaw) {
      return res.status(400).json({ error: 'cc2 e event sono richiesti (query)' });
    }

    const passBefore = await getPassBySamsungRefId(refId);
    if (!passBefore) {
      return res.status(204).send();
    }

    const deleted = eventRaw === 'DELETED';
    const installed =
      eventRaw === 'ADDED' || eventRaw === 'PROVISIONED' || eventRaw === 'UPDATED';

    let passRow = passBefore;
    if (deleted) {
      passRow = await updateSamsungWalletStatus(refId, false);
    } else if (installed) {
      passRow = await updateSamsungWalletStatus(refId, true, cc2);
    }

    if (passRow) {
      const ev = deleted ? 'samsung_wallet_removed' : 'samsung_wallet_installed';
      await logEvent({
        pass_id: passRow.id,
        brand_id: passRow.brand_id,
        event_type: ev,
        metadata: { refId, cc2, event: eventRaw, callback: req.body?.callback || null }
      });
      if (!deleted && (eventRaw === 'ADDED' || eventRaw === 'PROVISIONED')) {
        await updatePassDeviceId(passRow.serial_number, refId, 'samsung');
      }
    }

    console.log('[SamsungWallet] POST card state', String(refId).slice(0, 8), cc2, eventRaw);
    res.status(200).send('OK');
  } catch (err) {
    console.error('[SamsungWallet] POST cards error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

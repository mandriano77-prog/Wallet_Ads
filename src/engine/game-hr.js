/**
 * Giochi su deploy HR: il dipendente è già identificato dal serial del pass —
 * niente form di lead acquisition (quello è il flusso Ads per clienti anonimi).
 * Il giocatore si risolve dal member collegato al pass; alla vincita i coin
 * si accreditano da soli sul ledger e il pass si aggiorna (campo COIN, che ha
 * già il changeMessage "Hai %@ coin" → notifica automatica del nuovo saldo).
 *
 * Valore del premio in coin: campaign.config.prize_coins (numero), oppure
 * parsing dal nome premio ("50 coin" → 50). Zero coin = nessun accredito
 * (premio fisico: resta la gestione manuale).
 */
'use strict';

const { pool, getMemberForPass, insertCoinLedgerEntry, getPassCoinBalance, touchPassesByIds } = require('../db');

function isHrBrand(brand) {
  return String(brand?.config?.product_line || '').toLowerCase() === 'hr';
}

/** Dati giocatore dal member del pass (sostituisce il form di registrazione). */
async function resolveHrGamePlayer(pass) {
  if (!pass) return null;
  const member = await getMemberForPass(pass.id);
  if (!member) return null;
  return {
    player_first_name: member.first_name || null,
    player_last_name: member.last_name || null,
    player_email: member.email || `${pass.serial_number}@pass.local`,
    player_phone: member.phone || null,
    member_id: member.id,
  };
}

function parsePrizeCoins(campaign, prizeName) {
  const cfg = Number(campaign?.config?.prize_coins);
  if (Number.isFinite(cfg) && cfg > 0) return Math.floor(cfg);
  const m = String(prizeName || campaign?.prize_name || '').match(/(\d+)\s*coin/i);
  return m ? parseInt(m[1], 10) : 0;
}

/**
 * Accredita il premio in coin e aggiorna il pass nel wallet.
 * Best-effort sul refresh (l'accredito a ledger è comunque persistito).
 */
async function creditHrGameWin({ brand, pass, campaign, prizeName, playId, source }) {
  const coins = parsePrizeCoins(campaign, prizeName);
  if (!coins) return { coins_awarded: 0 };

  await insertCoinLedgerEntry({
    brand_id: pass.brand_id,
    pass_serial: pass.serial_number,
    action_key: 'game_prize',
    coin_amount: coins,
    description: prizeName || campaign?.prize_name || 'Premio gioco',
    related_entity_type: source || 'instant_win',
    related_entity_id: playId != null ? String(playId) : null,
  });
  const balanceRow = await getPassCoinBalance(pass.brand_id, pass.serial_number);
  const newBalance = Number(balanceRow?.balance || 0);

  // Refresh wallet: touch (nuova versione pass) + APNs → iOS rifetcha e il
  // campo COIN cambia → notifica "Hai N coin". Google: rebuild oggetto.
  try {
    await touchPassesByIds([pass.id]);
    const devices = await pool.query(
      'SELECT push_token FROM device_registrations WHERE serial_number = $1',
      [pass.serial_number]
    );
    if (devices.rows.length) {
      const { sendPushUpdate } = require('./apns');
      for (const row of devices.rows) {
        await sendPushUpdate(row.push_token).catch((e) => console.warn('[game-hr] APNs:', e.message));
      }
    }
    if (pass.google_wallet_object_id && brand) {
      const { syncGoogleWalletObjectsForPasses } = require('./google-wallet-sync');
      await syncGoogleWalletObjectsForPasses({ brand, passes: [pass] })
        .catch((e) => console.warn('[game-hr] Google sync:', e.message));
    }
  } catch (err) {
    console.warn('[game-hr] refresh pass dopo accredito fallito:', err.message);
  }

  return { coins_awarded: coins, new_balance: newBalance };
}

module.exports = { isHrBrand, resolveHrGamePlayer, parsePrizeCoins, creditHrGameWin };

// Endpoint pubblici dei giochi (nessuna auth, bypass JWT in isJwtBypassRoute):
// instant win (POST /play/:sn, GET /play/:sn/info) e gamification
// (GET /game/:sn/info, POST /game/:sn). Le giocate girano sotto advisory lock
// per campagna (max_plays_per_user e budget premi sono check-then-insert).
'use strict';

const express = require('express');
const {
  pool,
  getPassBySerial, getBrand,
  getInstantWinCampaign, listInstantWinCampaigns, countPlaysForUser, createInstantWinPlay,
  getGamificationCampaign, listGamificationCampaigns, countGamificationPlaysForUser, createGamificationPlay,
  logEvent,
} = require('../db');

const { isHrBrand, resolveHrGamePlayer, creditHrGameWin } = require('../engine/game-hr');

const router = express.Router();

function serialPassForInfo(pass) { return pass; }

router.post('/play/:serial_number', async (req, res) => {
  try {
    const { serial_number } = req.params;
    let { campaign_id, player_email, player_phone, player_first_name, player_last_name, privacy_accepted } = req.body;

    // Find the pass by serial
    const pass = await getPassBySerial(serial_number);
    if (!pass) return res.status(404).json({ error: 'Pass non trovato' });

    // HR: il dipendente è già identificato dal pass — niente form lead-gen.
    const playBrand = await getBrand(pass.brand_id);
    const hrDeploy = isHrBrand(playBrand);
    if (hrDeploy) {
      const hrPlayer = await resolveHrGamePlayer(pass);
      if (hrPlayer) {
        player_first_name = hrPlayer.player_first_name || player_first_name;
        player_last_name = hrPlayer.player_last_name || player_last_name;
        player_email = hrPlayer.player_email || player_email;
        player_phone = hrPlayer.player_phone || player_phone;
        privacy_accepted = true; // consenso già raccolto in attivazione pass
      }
    }

    // Validate player data (required before playing — solo flusso Ads/lead)
    if (!hrDeploy && (!player_email || !player_first_name || !player_last_name)) {
      return res.status(400).json({ error: 'Compila tutti i campi obbligatori (nome, cognome, email)' });
    }

    // Get campaign
    const campaign = await getInstantWinCampaign(campaign_id);
    if (!campaign) return res.status(404).json({ error: 'Campagna non trovata' });
    if (campaign.status !== 'active') return res.status(400).json({ error: 'Campagna non attiva' });
    if (campaign.brand_id !== pass.brand_id) return res.status(403).json({ error: 'Brand mismatch' });

    // Check date range
    const now = new Date();
    if (campaign.start_date && new Date(campaign.start_date) > now)
      return res.status(400).json({ error: 'Campagna non ancora iniziata' });
    if (campaign.end_date && new Date(campaign.end_date) < now)
      return res.status(400).json({ error: 'Campagna terminata' });

    // Check-then-insert su max_plays_per_user e budget premi: senza serializzazione
    // due richieste concorrenti possono entrambe passare i check. Advisory lock per
    // campagna, rilasciato a fine transazione.
    const lockClient = await pool.connect();
    let play;
    let result;
    try {
      await lockClient.query('BEGIN');
      await lockClient.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`iw:${campaign_id}`]);

      // Ricontrolla i contatori dentro il lock: i valori letti prima possono essere
      // stantii. Tutte le query della sezione critica girano su lockClient — usare
      // il pool qui può esaurirlo (N richieste in attesa del lock tengono una
      // connessione a testa) e mettere in stallo il detentore del lock.
      const fresh = await getInstantWinCampaign(campaign_id, lockClient);
      if (!fresh || fresh.status !== 'active') {
        await lockClient.query('ROLLBACK');
        return res.status(404).json({ error: 'Campagna non trovata o non attiva' });
      }
      const playCount = await countPlaysForUser(campaign_id, serial_number, lockClient);
      if (fresh.max_plays_per_user && playCount >= fresh.max_plays_per_user) {
        await lockClient.query('ROLLBACK');
        return res.status(400).json({ error: 'Hai già giocato il massimo numero di volte', already_played: true });
      }
      if (fresh.total_budget && fresh.total_wins >= fresh.total_budget) {
        await lockClient.query('ROLLBACK');
        return res.status(400).json({ error: 'Premi esauriti', budget_exhausted: true });
      }

      result = Math.random() < parseFloat(fresh.win_probability) ? 'win' : 'lose';

      play = await createInstantWinPlay({
        campaign_id,
        serial_number,
        brand_id: pass.brand_id,
        result,
        prize_name: result === 'win' ? fresh.prize_name : null,
        player_email: player_email || null,
        player_phone: player_phone || null,
        player_first_name: player_first_name || null,
        player_last_name: player_last_name || null,
        privacy_accepted: privacy_accepted || false
      }, lockClient);
      await lockClient.query('COMMIT');
    } catch (playErr) {
      await lockClient.query('ROLLBACK').catch(() => {});
      throw playErr;
    } finally {
      lockClient.release();
    }

    // Log event
    await logEvent({
      pass_id: pass.id,
      brand_id: pass.brand_id,
      event_type: `instant_win_${result}`,
      metadata: { campaign_id, game_type: campaign.game_type, prize_name: play.prize_name }
    });

    // HR: vincita → coin accreditati in automatico + pass aggiornato.
    let coinAward = null;
    if (hrDeploy && result === 'win') {
      coinAward = await creditHrGameWin({
        brand: playBrand,
        pass,
        campaign,
        prizeName: campaign.prize_name,
        playId: play.id,
        source: 'instant_win',
      }).catch((e) => { console.warn('[play] accredito coin fallito:', e.message); return null; });
    }

    res.json({
      result,
      prize_name: result === 'win' ? campaign.prize_name : null,
      prize_description: result === 'win' ? campaign.prize_description : null,
      play_id: play.id,
      ...(coinAward && coinAward.coins_awarded ? { coins_awarded: coinAward.coins_awarded, coin_balance: coinAward.new_balance } : {})
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Returns campaign info for the game page to render
router.get('/play/:serial_number/info', async (req, res) => {
  try {
    const { serial_number } = req.params;
    const pass = await getPassBySerial(serial_number);
    if (!pass) return res.status(404).json({ error: 'Pass non trovato' });

    const brand = await getBrand(pass.brand_id);

    // Find active campaign for this brand
    const campaigns = await listInstantWinCampaigns(pass.brand_id);
    const activeCampaign = campaigns.find(c => c.status === 'active');
    if (!activeCampaign) return res.status(404).json({ error: 'Nessuna campagna attiva' });

    // Check if user already played
    const playCount = await countPlaysForUser(activeCampaign.id, serial_number);
    const canPlay = !activeCampaign.max_plays_per_user || playCount < activeCampaign.max_plays_per_user;

    // HR: giocatore = dipendente del pass, il form di registrazione non esiste.
    let registeredPlayer = null;
    if (isHrBrand(brand)) {
      const hrPlayer = await resolveHrGamePlayer(serialPassForInfo(pass));
      if (hrPlayer) registeredPlayer = hrPlayer;
    }
    if (!registeredPlayer) {
      const { pool } = require('../db');
      const prevPlay = await pool.query(
        `SELECT player_first_name, player_last_name, player_email, player_phone
         FROM instant_win_plays WHERE serial_number = $1 AND player_email IS NOT NULL
         ORDER BY played_at DESC LIMIT 1`,
        [serial_number]
      );
      if (prevPlay.rows.length > 0) {
        registeredPlayer = prevPlay.rows[0];
      }
    }

    res.json({
      campaign_id: activeCampaign.id,
      game_type: activeCampaign.game_type,
      name: activeCampaign.name,
      prize_name: activeCampaign.prize_name,
      prize_description: activeCampaign.prize_description,
      brand_name: brand?.name || 'Brand',
      brand_colors: brand?.config?.colors || {},
      can_play: canPlay,
      plays_remaining: activeCampaign.max_plays_per_user
        ? Math.max(0, activeCampaign.max_plays_per_user - playCount)
        : null,
      config: activeCampaign.config || {},
      registered_player: registeredPlayer
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/game/:serial_number/info', async (req, res) => {
  try {
    const { serial_number } = req.params;
    const pass = await getPassBySerial(serial_number);
    if (!pass) return res.status(404).json({ error: 'Pass non trovato' });

    const brand = await getBrand(pass.brand_id);
    if (!brand) return res.status(404).json({ error: 'Brand non trovato' });

    // Find active gamification campaign for this brand
    const allCampaigns = await listGamificationCampaigns(pass.brand_id);
    const activeCampaign = allCampaigns.find(c => c.status === 'active');

    // HR: giocatore = dipendente del pass (niente form).
    let registeredPlayer = null;
    if (isHrBrand(brand)) {
      const hrPlayer = await resolveHrGamePlayer(pass);
      if (hrPlayer) registeredPlayer = hrPlayer;
    }
    const prevPlay = registeredPlayer ? { rows: [] } : await pool.query(
      `SELECT player_first_name, player_last_name, player_email, player_phone
       FROM gamification_plays WHERE serial_number = $1 AND player_email IS NOT NULL
       ORDER BY played_at DESC LIMIT 1`,
      [serial_number]
    );
    if (prevPlay.rows.length > 0) {
      registeredPlayer = prevPlay.rows[0];
    } else if (!registeredPlayer) {
      // Fallback: check instant_win_plays too
      const iwPlay = await pool.query(
        `SELECT player_first_name, player_last_name, player_email, player_phone
         FROM instant_win_plays WHERE serial_number = $1 AND player_email IS NOT NULL
         ORDER BY played_at DESC LIMIT 1`,
        [serial_number]
      );
      if (iwPlay.rows.length > 0) registeredPlayer = iwPlay.rows[0];
    }

    res.json({
      brand: { id: brand.id, name: brand.name, slug: brand.slug, config: brand.config },
      campaign: activeCampaign || null,
      serial_number,
      registered_player: registeredPlayer
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Gamification Play endpoint (public, no auth) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ

router.post('/game/:serial_number', async (req, res) => {
  try {
    const { serial_number } = req.params;
    let { campaign_id, completion_time_secs, score,
      player_email, player_phone, player_first_name, player_last_name, privacy_accepted } = req.body;

    const pass = await getPassBySerial(serial_number);
    if (!pass) return res.status(404).json({ error: 'Pass non trovato' });

    const gameBrand = await getBrand(pass.brand_id);
    const hrDeploy = isHrBrand(gameBrand);
    if (hrDeploy) {
      const hrPlayer = await resolveHrGamePlayer(pass);
      if (hrPlayer) {
        player_first_name = hrPlayer.player_first_name || player_first_name;
        player_last_name = hrPlayer.player_last_name || player_last_name;
        player_email = hrPlayer.player_email || player_email;
        player_phone = hrPlayer.player_phone || player_phone;
        privacy_accepted = true;
      }
    }

    const campaign = await getGamificationCampaign(campaign_id);
    if (!campaign) return res.status(404).json({ error: 'Campagna non trovata' });
    if (campaign.status !== 'active') return res.status(400).json({ error: 'Campagna non attiva' });
    if (campaign.brand_id !== pass.brand_id) return res.status(403).json({ error: 'Brand mismatch' });

    // Check date range
    const now = new Date();
    if (campaign.start_date && new Date(campaign.start_date) > now)
      return res.status(400).json({ error: 'Campagna non ancora iniziata' });
    if (campaign.end_date && new Date(campaign.end_date) < now)
      return res.status(400).json({ error: 'Campagna terminata' });

    // Determine tier based on completion time
    const timeSecs = parseFloat(completion_time_secs);
    let tier = 'none';
    let prizeName = null;
    if (timeSecs <= parseFloat(campaign.gold_threshold_secs)) {
      tier = 'gold';
      prizeName = campaign.gold_prize;
    } else if (timeSecs <= parseFloat(campaign.silver_threshold_secs)) {
      tier = 'silver';
      prizeName = campaign.silver_prize;
    } else if (timeSecs <= parseFloat(campaign.bronze_threshold_secs)) {
      tier = 'bronze';
      prizeName = campaign.bronze_prize;
    }

    // Check max plays + insert sotto advisory lock (stessa race dell'instant win).
    const lockClient = await pool.connect();
    let play;
    try {
      await lockClient.query('BEGIN');
      await lockClient.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`gm:${campaign_id}`]);

      const playCount = await countGamificationPlaysForUser(campaign_id, serial_number, lockClient);
      if (campaign.max_plays_per_user && playCount >= campaign.max_plays_per_user) {
        await lockClient.query('ROLLBACK');
        return res.status(400).json({ error: 'Hai già giocato il massimo numero di volte', already_played: true });
      }

      play = await createGamificationPlay({
        campaign_id,
        serial_number,
        brand_id: pass.brand_id,
        completion_time_secs: timeSecs,
        tier,
        prize_name: prizeName,
        score: score || 0,
        player_email: player_email || null,
        player_phone: player_phone || null,
        player_first_name: player_first_name || null,
        player_last_name: player_last_name || null,
        privacy_accepted: privacy_accepted || false
      }, lockClient);
      await lockClient.query('COMMIT');
    } catch (playErr) {
      await lockClient.query('ROLLBACK').catch(() => {});
      throw playErr;
    } finally {
      lockClient.release();
    }

    // Log event
    await logEvent({
      pass_id: pass.id,
      brand_id: pass.brand_id,
      event_type: `gamification_${tier}`,
      metadata: { campaign_id, game_type: campaign.game_type, completion_time_secs: timeSecs, tier, prize_name: prizeName }
    });

    let coinAward = null;
    if (hrDeploy && tier !== 'none') {
      coinAward = await creditHrGameWin({
        brand: gameBrand,
        pass,
        campaign,
        prizeName,
        playId: play.id,
        source: 'gamification',
      }).catch((e) => { console.warn('[game] accredito coin fallito:', e.message); return null; });
    }

    res.json({
      result: tier !== 'none' ? 'win' : 'lose',
      tier,
      prize_name: prizeName,
      completion_time_secs: timeSecs,
      play_id: play.id,
      ...(coinAward && coinAward.coins_awarded ? { coins_awarded: coinAward.coins_awarded, coin_balance: coinAward.new_balance } : {})
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

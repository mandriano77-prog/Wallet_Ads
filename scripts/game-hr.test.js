/**
 * Giochi HR: niente form lead-gen (giocatore = dipendente dal pass),
 * vincita → coin accreditati in automatico.
 */
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const { isHrBrand, parsePrizeCoins } = require('../src/engine/game-hr');

test('isHrBrand: riconosce il deploy HR', () => {
  assert.equal(isHrBrand({ config: { product_line: 'hr' } }), true);
  assert.equal(isHrBrand({ config: { product_line: 'ads' } }), false);
  assert.equal(isHrBrand(null), false);
});

test('parsePrizeCoins: config.prize_coins vince sul nome', () => {
  assert.equal(parsePrizeCoins({ config: { prize_coins: 100 }, prize_name: '50 coin' }), 100);
});

test('parsePrizeCoins: parsing dal nome premio ("50 Coin", "Buono 20 COIN")', () => {
  assert.equal(parsePrizeCoins({ prize_name: '50 Coin' }), 50);
  assert.equal(parsePrizeCoins({}, 'Buono da 20 COIN'), 20);
});

test('parsePrizeCoins: premio fisico senza coin = 0 (nessun accredito)', () => {
  assert.equal(parsePrizeCoins({ prize_name: 'Weekend alle terme' }), 0);
  assert.equal(parsePrizeCoins(null, null), 0);
});

test('game-routes: HR bypassa il form e accredita alla vincita (guardia sorgente)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/api/game-routes.js'), 'utf-8');
  assert.match(src, /resolveHrGamePlayer/, 'risoluzione giocatore dal member');
  assert.match(src, /if \(!hrDeploy && \(!player_email/, 'validazione form solo flusso Ads');
  assert.match(src, /creditHrGameWin/, 'accredito coin alla vincita');
  assert.match(src, /privacy_accepted = true; \/\/ consenso già raccolto in attivazione pass/, 'consenso da attivazione');
});

test('play page: vincita HR mostra i coin accreditati', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'src/play/index.html'), 'utf-8');
  assert.match(page, /coins_awarded/, 'risposta coin gestita');
  assert.match(page, /coin accreditati sul tuo pass/, 'messaggio accredito');
});

test('pagine gioco: API base /api/v1 (il router non è montato su /api)', () => {
  for (const page of ['quiz', 'memory', 'puzzle', 'jigsaw']) {
    const src = fs.readFileSync(path.join(__dirname, '..', `src/game/${page}.html`), 'utf-8');
    assert.match(src, /const API = '\/api\/v1';/, `${page}.html deve usare /api/v1`);
  }
  const play = fs.readFileSync(path.join(__dirname, '..', 'src/play/index.html'), 'utf-8');
  assert.match(play, /const API = '\/api\/v1';/);
});

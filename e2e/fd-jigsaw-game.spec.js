// @ts-check
// Jigsaw: la pagina si carica, "Inizia!" avvia il gioco e i pezzi si piazzano.
const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE_URL || 'https://studio.filodiretto.app';

// PNG 3x3 px reale (base64) come "strip" della campagna
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAYAAABWKLW/AAAAFklEQVQIW2NkYGD4z8DAwMgABXAGNgkAS/QCAy/UI7EAAAAASUVORK5CYII=';

const CAMPAIGN = {
  id: 'g1', brand_id: 'b1', name: 'Ricomponi la foto', game_type: 'jigsaw', status: 'active',
  gold_threshold_secs: 30, silver_threshold_secs: 60, bronze_threshold_secs: 120,
  gold_prize: '150 coin', silver_prize: '100 coin', bronze_prize: '50 coin',
  max_plays_per_user: 5, config: {}, strip_base64: TINY_PNG,
};

test('jigsaw: start → griglia → piazzo un pezzo senza errori', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/v1/game/SN-E2E/info', (route) => route.fulfill({
    json: {
      brand: { id: 'b1', name: 'Brand E2E', slug: 'brand-e2e', config: { product_line: 'hr' } },
      campaign: CAMPAIGN,
      serial_number: 'SN-E2E',
      registered_player: { player_first_name: 'E2E', player_last_name: 'Tester', player_email: 'e2e@test.it', player_phone: null },
    },
  }));
  await page.goto(`${BASE}/game/jigsaw/SN-E2E`);

  // Schermata start (form saltato: registered_player presente)
  const startBtn = page.locator('.play-btn');
  await expect(startBtn).toBeVisible();
  await expect(page.locator('body')).toContainText('Ricomponi la foto');

  // Inizia → griglia e vassoio renderizzati
  await startBtn.click();
  await expect(page.locator('#timerDisplay')).toBeVisible({ timeout: 5000 });
  const slots = page.locator('[onclick^="tapSlot"]');
  const trayPieces = page.locator('[onclick^="tapTray"]');
  await expect(slots).toHaveCount(9);
  await expect(trayPieces).toHaveCount(9);

  // Tocca un pezzo, poi una casella → il pezzo si piazza (vassoio scende a 8)
  await trayPieces.first().click();
  await slots.first().click();
  await expect(page.locator('[onclick^="tapTray"]')).toHaveCount(8);
  await expect(page.locator('#movesDisplay')).toContainText('1 mosse');

  expect(errors, `Errori JS: ${errors.join(' | ')}`).toHaveLength(0);
});

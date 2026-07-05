// @ts-check
// Regressione: i menu "Azioni" dello storico push venivano spostati su <body>
// e mai chiusi (selettore di chiusura limitato a #pushHistory) — si accumulavano
// e intercettavano i click dell'intera pagina. Questo test riproduce il flusso
// reale: apri menu → click fuori → chiuso; reinvia (rirender) → nessun orfano.
const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE_URL || 'https://studio.filodiretto.app';
const AUTH_TOKEN_KEY = 'filodiretto:jwt';

const USER = { id: 'u1', email: 'e2e@test.it', name: 'E2E Manager', role: 'manager', brand_id: 'b1' };
const BRAND = { id: 'b1', name: 'Brand E2E', slug: 'brand-e2e', config: { product_line: 'hr' } };
const HISTORY = [
  { id: 'log1', brand_id: 'b1', title: 'Vinci fino a 150 Coin', message: 'Vinci fino a 150 Coin', screen_alert: 'Vinci fino a 150 Coin', channel: 'all', sent_count: 1, created_at: '2026-07-05T19:53:54Z' },
  { id: 'log2', brand_id: 'b1', title: 'Promo estate', message: 'Promo estate', screen_alert: 'Promo estate', channel: 'all', sent_count: 1, created_at: '2026-07-05T19:29:31Z' },
];

async function mockApi(page) {
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    const wantsArray = /\/(brands|passes|members|templates|audiences|campaigns|users|rewards|challenges)([/?]|$)/.test(url);
    route.fulfill({ json: wantsArray ? [] : {} });
  });
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { user: USER } }));
  await page.route('**/api/v1/brands', (route) => route.fulfill({ json: [BRAND] }));
  await page.route('**/api/v1/brands?*', (route) => route.fulfill({ json: [BRAND] }));
  await page.route('**/api/v1/push/history?*', (route) => route.fulfill({ json: HISTORY }));
  await page.route('**/api/v1/push/send', (route) => route.fulfill({ json: { sent_apns: 1, total_apns: 1, google: { skipped: true } } }));
}

test('menu Azioni: si chiude al click fuori e il reinvio non lascia pannelli fantasma', async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(([key]) => localStorage.setItem(key, 'e2e-token'), [AUTH_TOKEN_KEY]);
  await page.goto(`${BASE}/dashboard`);
  await expect(page.locator('#mainLayout')).toBeVisible();
  await page.evaluate(() => window.nav('push'));
  await expect(page.locator('#push')).toBeVisible();

  // Storico caricato con i menu Azioni
  const triggers = page.locator('#pushHistory .fd-pass-row-menu__trigger');
  await expect(triggers.first()).toBeVisible();

  const openPanels = () => page.evaluate(() =>
    [...document.querySelectorAll('.fd-pass-row-menu__panel')].filter((p) => !p.hidden).length
  );
  const bodyPanels = () => page.evaluate(() =>
    [...document.body.children].filter((el) => el.classList?.contains('fd-push-history-menu__panel') && !el.hidden).length
  );

  // 1. Apri menu → un pannello visibile su body
  await triggers.first().click();
  expect(await openPanels()).toBe(1);

  // 2. Click fuori → tutto chiuso
  await page.mouse.click(400, 300);
  expect(await openPanels()).toBe(0);
  expect(await bodyPanels()).toBe(0);

  // 3. Apri menu su ENTRAMBE le righe in sequenza → mai più di 1 aperto
  await triggers.first().click();
  await triggers.nth(1).click();
  expect(await openPanels()).toBe(1);

  // 4. Reinvia → conferma nel dialog dell'app → storico ricaricato → zero orfani
  await page.locator('.fd-pass-row-menu__panel:not([hidden]) [data-action="resend"]').click();
  await expect(page.locator('#appConfirmDialog')).toBeVisible();
  await page.locator('#appConfirmBtn').click();
  await page.waitForTimeout(800);
  // Il popup esito (se aperto) si chiude col suo bottone
  const resultClose = page.locator('#fdPushResultClose');
  if (await resultClose.isVisible().catch(() => false)) await resultClose.click();
  await expect(page.locator('#appConfirmDialog')).not.toBeVisible();
  expect(await bodyPanels()).toBe(0);
  expect(await openPanels()).toBe(0);

  // 5. La pagina è cliccabile: il bottone di invio riceve il click reale
  const sendBtn = page.locator('#pushSendBtn');
  await sendBtn.scrollIntoViewIfNeeded();
  await expect(sendBtn).toBeVisible();
  await sendBtn.click({ trial: true }); // trial: verifica hit-test, fallisce se qualcosa copre il bottone
});

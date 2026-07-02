// @ts-check
// E2E dei flussi critici della dashboard: login (ok + errore) e invio push
// immediata fino alla conferma. La pagina reale viene caricata da E2E_BASE_URL
// (default: produzione), ma TUTTE le chiamate /api/v1/** sono intercettate e
// mockate: nessuna richiesta tocca il backend vero.
const { test, expect } = require('@playwright/test');

const BASE = process.env.E2E_BASE_URL || 'https://studio.filodiretto.app';
const AUTH_TOKEN_KEY = 'filodiretto:jwt';

const USER = { id: 'u1', email: 'e2e@test.it', name: 'E2E Manager', role: 'manager', brand_id: 'b1' };
const BRAND = { id: 'b1', name: 'Brand E2E', slug: 'brand-e2e', config: { product_line: 'hr' } };
const PASSES = [
  { id: 'p1', serial_number: 'SN-E2E-1', brand_id: 'b1', push_token: 'tok1', google_wallet_object_id: null },
  { id: 'p2', serial_number: 'SN-E2E-2', brand_id: 'b1', push_token: 'tok2', google_wallet_object_id: 'obj2' },
];

async function mockApi(page, { pushCapture } = {}) {
  // Playwright valuta le route in ordine inverso di registrazione:
  // il catch-all va registrato PRIMA, gli handler specifici DOPO.
  await page.route('**/api/v1/**', (route) => {
    const url = route.request().url();
    // Le liste tornano array vuoti, il resto oggetti vuoti: il codice dashboard
    // è difensivo (try/catch ovunque) e con questi default il boot procede.
    const wantsArray = /\/(brands|passes|members|templates|audiences|campaigns|users|rewards|challenges)([/?]|$)/.test(url);
    route.fulfill({ json: wantsArray ? [] : {} });
  });
  await page.route('**/api/v1/auth/login', (route) => {
    const body = route.request().postDataJSON() || {};
    if (body.email === USER.email && body.password === 'e2e-password') {
      route.fulfill({ json: { token: 'e2e-token', user: USER } });
    } else {
      route.fulfill({ status: 401, json: { error: 'Credenziali non valide' } });
    }
  });
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { user: USER } }));
  await page.route('**/api/v1/brands', (route) => route.fulfill({ json: [BRAND] }));
  await page.route('**/api/v1/brands?*', (route) => route.fulfill({ json: [BRAND] }));
  await page.route('**/api/v1/passes?*', (route) => route.fulfill({ json: PASSES }));
  await page.route('**/api/v1/push/send', (route) => {
    if (pushCapture) pushCapture.push(route.request().postDataJSON());
    route.fulfill({ json: { sent_apns: 2, total_apns: 2, google: { updated: 1 } } });
  });
}

test.describe('dashboard: login', () => {
  test('login con credenziali valide apre la shell', async ({ page }) => {
    await mockApi(page);
    await page.goto(`${BASE}/dashboard/login`);
    await page.fill('#loginEmail', USER.email);
    await page.fill('#loginPassword', 'e2e-password');
    await page.click('#loginSubmitBtn');
    await expect(page.locator('#mainLayout')).toBeVisible();
    await expect(page.locator('#loginGate')).toBeHidden();
  });

  test('login con credenziali errate mostra errore e resta sul gate', async ({ page }) => {
    await mockApi(page);
    await page.goto(`${BASE}/dashboard/login`);
    await page.fill('#loginEmail', USER.email);
    await page.fill('#loginPassword', 'password-sbagliata');
    await page.click('#loginSubmitBtn');
    await expect(page.locator('#loginError')).toBeVisible();
    await expect(page.locator('#loginError')).toContainText(/credenziali/i);
    await expect(page.locator('#loginGate')).toBeVisible();
  });
});

test.describe('dashboard: push immediata', () => {
  test('compila, conferma e invia una push (payload con screen_alert)', async ({ page }) => {
    const sent = [];
    await mockApi(page, { pushCapture: sent });
    // Sessione già autenticata: token in localStorage, /auth/me mockato.
    await page.addInitScript(
      ([key]) => localStorage.setItem(key, 'e2e-token'),
      [AUTH_TOKEN_KEY]
    );
    await page.goto(`${BASE}/dashboard`);
    await expect(page.locator('#mainLayout')).toBeVisible();

    // Vai al pannello push (nav() è la routing function globale della shell).
    await page.evaluate(() => window.nav('push'));
    await expect(page.locator('#push')).toBeVisible();

    // Layout HR: il campo obbligatorio visibile è il testo notifica Wallet
    // (screen_alert, max 178); titolo/messaggio strip compaiono solo con strip attiva.
    await page.fill('#pushScreenAlert', 'PROMO E2E: test invio end-to-end dalla suite Playwright');
    await page.fill('#pushBackDetails', 'Dettagli retro pass generati dal test E2E.');
    await page.click('#pushSendBtn');

    // Modale di conferma: attende il conteggio destinatari (mock /passes → 2 reachable).
    const confirmSubmit = page.locator('#fdPushConfirmSubmit');
    await expect(confirmSubmit).toBeVisible();
    await expect(confirmSubmit).toBeEnabled();
    await confirmSubmit.click();

    await expect.poll(() => sent.length, { timeout: 10000 }).toBeGreaterThan(0);
    const body = sent[0];
    expect(body.brand_id).toBe('b1');
    // Invariante push HR: screen_alert obbligatorio nel payload di invio.
    expect(String(body.screen_alert || '')).toContain('PROMO E2E');
    expect(body.update_pass).toBe(true);
  });
});

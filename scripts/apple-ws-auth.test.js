// Contract test: protocollo web service Apple Wallet — auth + conditional GET.
// Blinda le garanzie introdotte a luglio 2026:
// 1. Gli endpoint del protocollo Apple validano "Authorization: ApplePass <token>"
//    contro pass_instances.auth_token (confronto timing-safe).
// 2. GET /passes/:ptid/:sn gestisce If-Modified-Since -> 304 (niente rigenerazione .pkpass).
// 3. server.js monta helmet per gli header di sicurezza.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Il protocollo Apple vive nel modulo estratto; routes.js deve montarlo al posto giusto.
const routesSrc = fs.readFileSync(path.join(__dirname, '../src/api/apple-wallet-protocol.js'), 'utf8');
const mainRoutesSrc = fs.readFileSync(path.join(__dirname, '../src/api/routes.js'), 'utf8');
const serverSrc = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');

test('routes.js monta apple-wallet-protocol prima delle route creative-assets', () => {
  const mountIdx = mainRoutesSrc.indexOf("router.use(require('./apple-wallet-protocol'))");
  const creativeIdx = mainRoutesSrc.indexOf("router.get('/creative-assets/:id/image'");
  const downloadIdx = mainRoutesSrc.indexOf("router.get('/passes/:id/download'");
  assert.ok(mountIdx > -1, 'mount del sub-router Apple presente');
  assert.ok(downloadIdx > -1 && downloadIdx < mountIdx,
    '/passes/:id/download deve restare registrata PRIMA del protocollo Apple (stesso numero di segmenti di /passes/:ptid/:sn)');
  assert.ok(creativeIdx > mountIdx, 'mount nella posizione originale, prima di creative-assets');
});

test('routes.js definisce applePassAuthMatches con confronto timing-safe', () => {
  assert.match(routesSrc, /function applePassAuthMatches\(/);
  assert.match(routesSrc, /timingSafeEqual\(/);
  assert.match(routesSrc, /ApplePass\\s\+/, 'deve estrarre il token dallo schema ApplePass');
});

test('registrazione device valida il token ApplePass e richiede un pass esistente', () => {
  const registerBlock = routesSrc.split("router.post('/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber'")[1].split('router.delete')[0];
  assert.match(registerBlock, /applePassAuthMatches\(req, pass\)/);
  assert.match(registerBlock, /status\(404\)/, 'serial sconosciuto -> 404, non registrazione cieca');
});

test('deregistrazione device valida il token ApplePass quando il pass esiste', () => {
  const unregisterBlock = routesSrc.split("router.delete('/devices/:deviceLibraryId/registrations/:passTypeId/:serialNumber'")[1].split('router.get')[0];
  assert.match(unregisterBlock, /applePassAuthMatches\(req, pass\)/);
});

test('GET pass valida il token ApplePass e gestisce If-Modified-Since -> 304', () => {
  const getPassBlock = routesSrc.split("router.get('/passes/:passTypeId/:serialNumber'")[1].split('router.get')[0];
  assert.match(getPassBlock, /applePassAuthMatches\(req, pass\)/);
  assert.match(getPassBlock, /if-modified-since/);
  assert.match(getPassBlock, /status\(304\)/);
  assert.match(getPassBlock, /'Cache-Control': 'no-cache/, 'no-cache (non no-store) per abilitare la rivalidazione');
});

test('esiste il kill switch APPLE_WALLET_AUTH_DISABLED per rollback senza deploy', () => {
  assert.match(routesSrc, /APPLE_WALLET_AUTH_DISABLED/);
});

test('server.js monta helmet prima delle route', () => {
  assert.match(serverSrc, /require\('helmet'\)/);
  const helmetIdx = serverSrc.indexOf('app.use(helmet(');
  const apiIdx = serverSrc.indexOf("app.use('/api/v1'");
  assert.ok(helmetIdx > -1, 'helmet deve essere montato');
  assert.ok(apiIdx === -1 || helmetIdx < apiIdx, 'helmet va montato prima delle route API');
});

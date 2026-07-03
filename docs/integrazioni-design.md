# Area "Integrazioni" — Documento di design (v1, bozza)

> Stato: **proposta da rivedere**. Nessun codice scritto finché non approvato.
> Contesto: servizi terzi che il dipendente **già usa** (es. buoni pasto Ticket
> Restaurant / Edenred), di cui mostrare i **suoi** dati nel portale. Distinto
> dall'HUB Convenzioni (che è per gli sconti presso partner).

---

## 0. Decisioni prese (proprietario, luglio 2026)

1. **Connessione = API / real connect** (no saldo manuale). Il framework è
   orientato al flusso "Collega account"; ogni provider mostra "Presto
   disponibile / Collega" finché la sua API non è innestata.
2. **Multi-provider** fin dal design (Edenred + Pellegrini + Day + …).
3. **Cornice = fringe benefit & welfare aziendale.** EXTRA è l'hub dei benefit del
   dipendente. Ogni integrazione ha una **categoria** (buoni pasto / welfare /
   mobilità / altro) per raggruppare nel portale.
4. **Back-link EXTRA sul pass = da subito** (non opzionale).

## 1. Obiettivo e scope

**È:** l'hub dei **fringe benefit e welfare** del dipendente — servizi terzi che
già usa, di cui mostra/collega i **suoi** dati (primo caso: buoni pasto).
Generico e multi-provider: aggiungere un provider = un adapter.

**Non è:**
- L'HUB Convenzioni (sconti/partner condivisi) — resta separato e intatto.
- Un sistema transazionale (spendere i buoni da noi) — fuori scope, serve
  partnership + compliance del provider.

**Vincolo noto:** mostrare il saldo *reale* richiede l'API del provider (Edenred
ecc.), oggi non disponibile. Il framework nasce indipendente; l'adapter reale si
innesta quando l'API arriva. Fino ad allora: adapter **segnaposto** (saldo
inserito a mano dall'admin, oppure semplice deep-link all'app del provider).

---

## 2. Dove vive (superfici)

| Superficie | Ruolo | Note |
|---|---|---|
| **Portale dipendente** (`/portal`) | Sezione "Le mie integrazioni": card per servizio con i **dati personali** | Casa principale. Già autenticato via magic link (`X-Portal-Token`). |
| **Dashboard admin** | Nuova tab "Integrazioni": **abilita** quali servizi sono attivi per il brand, logo, configurazione | Solo abilitazione/config, nessun dato personale. Ruolo: manager/admin. |
| **Retro del pass** (da subito) | Link **"EXTRA"** → apre il portale | Stesso pattern dei back-link HUB PERSONALE / AREA PRIVATA già esistenti. |

L'HUB non viene toccato.

> **Nomenclatura decisa:** nome **utente** = **EXTRA** (insegna breve sul retro del
> pass e titolo della sezione portale). Nome **tecnico/interno** (codice, config,
> tabelle) = `integrations`. La sezione portale può intitolarsi "EXTRA" con
> sottotitolo esplicativo ("I servizi e i vantaggi collegati al tuo pass").

---

## 3. Modello dati

### 3.1 Configurazione per brand (JSONB, nessuna nuova tabella)
`brands.config.integrations` — quali integrazioni sono attive e come:
```jsonc
{
  "integrations": [
    {
      "type": "edenred",             // chiave dell'adapter (un provider = un adapter)
      "label": "Ticket Restaurant",  // mostrato al dipendente
      "category": "buoni_pasto",     // buoni_pasto | welfare | mobilita | altro
      "logo_url": "https://.../edenred.png",
      "enabled": true,
      "mode": "api",                 // 'api' (connessione reale) | 'deeplink' (interim)
      "deeplink_url": "https://...", // fallback finché l'API non è innestata
      "settings": {}                 // endpoint/parametri provider (fase 2)
    },
    { "type": "pellegrini", "label": "Pellegrini", "category": "buoni_pasto", "mode": "api", "enabled": false }
  ]
}
```

### 3.2 Stato/collegamento per dipendente (nuova tabella)
`member_integrations` — connessione e dati cache del singolo dipendente:
```sql
CREATE TABLE member_integrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     TEXT NOT NULL,            -- FK members
  brand_id      TEXT NOT NULL,
  type          TEXT NOT NULL,            -- 'ticket_restaurant'
  status        TEXT NOT NULL DEFAULT 'not_connected', -- not_connected|connected|error
  credentials   TEXT,                     -- token/credenziali provider CIFRATE (mai in chiaro)
  data          JSONB DEFAULT '{}',       -- cache: { balance, currency, expires_at, last_movement }
  last_synced_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (member_id, type)
);
```
- `credentials` **cifrato at rest** (non in chiaro): token/refresh del provider.
- `data` = ultimo saldo noto (cache), così il portale è veloce e funziona anche
  se il provider è momentaneamente giù.
- Nella modalità `manual` (fase 1 senza API): `data.balance` lo scrive l'admin o
  si lascia vuoto; nessuna `credentials`.

---

## 4. Pattern adapter (il cuore riusabile)

```
src/engine/integrations/
├── index.js          # registry: type -> adapter; contratto comune
├── ticket-restaurant.js
└── <futuri>.js
```

Ogni adapter implementa lo stesso contratto:
```js
module.exports = {
  type: 'ticket_restaurant',
  // Modalità supportate: 'manual' | 'deeplink' | 'api'
  async fetchData(member, integrationConfig, connection) {
    // mode 'api'  -> chiama il provider, ritorna { balance, currency, expires_at, ... }
    // mode 'manual' -> ritorna connection.data (inserito dall'admin)
    // mode 'deeplink' -> ritorna { deeplink_url } senza dati
  },
  async connect(member, params) { /* fase 2: OAuth/login provider -> credentials */ },
  async disconnect(member) { /* revoca/pulizia */ }
};
```
Aggiungere Edenred reale domani = scrivere `fetchData` in `ticket-restaurant.js`
con `mode: 'api'`. Zero modifiche al portale o all'admin.

---

## 5. Flussi

### 5.1 Admin abilita (dashboard)
1. Tab "Integrazioni" → aggiunge "Ticket Restaurant", carica logo, sceglie `mode`.
2. Salva → `brand.config.integrations`.

### 5.2 Dipendente (portale)
1. Apre il portale (magic link) → sezione "Le mie integrazioni".
2. Vede una card per ogni integrazione abilitata dal brand.
3. A seconda del `mode`:
   - `deeplink` → bottone "Apri Ticket Restaurant" (va all'app del provider).
   - `manual` → mostra il saldo inserito dall'admin (o "Dato non disponibile").
   - `api` (fase 2) → "Collega account" → OAuth/login → saldo reale + refresh.

### 5.3 API interne (portale, autenticate via X-Portal-Token)
- `GET  /api/v1/portal/integrations` → integrazioni attive del brand + stato/dati del dipendente.
- `POST /api/v1/portal/integrations/:type/connect` (fase 2) → avvia collegamento.
- `POST /api/v1/portal/integrations/:type/refresh` (fase 2) → forza sync saldo.
- Admin: `GET/PUT /api/v1/brands/:id/integrations` → config brand; `PUT .../members/:mid/integrations/:type` → set manuale (fase 1).

---

## 6. Sicurezza e GDPR (non opzionale)

- **Credenziali provider cifrate at rest** (`member_integrations.credentials`), mai
  loggate, mai esposte al client. Chiave di cifratura da env.
- **Consenso**: collegare un servizio terzo = trattamento di dati personali →
  consenso esplicito nel portale + voce nell'informativa. Riusa il pattern
  consensi già presente in attivazione.
- **Diritto alla cancellazione**: `disconnect` + cascade delete su
  `member_integrations` quando il dipendente/GDPR lo richiede.
- **Isolamento multi-tenant**: ogni query filtra per `brand_id` (come tutto il resto).
- **Minimizzazione**: salviamo solo il saldo/scadenza necessari a mostrarli, non lo
  storico completo del provider.

---

## 7. Fasi

### Fase 1 — Framework API-first (ora, nessuna dipendenza esterna)
- Tabella `member_integrations` + migrazione inline (con `credentials` cifrato).
- `brand.config.integrations` (array multi-provider, con `category`) + CRUD admin
  nella nuova tab **EXTRA** (abilita provider, logo, categoria, mode).
- Registry adapter + **contratto orientato al connect/API**; primo adapter
  `edenred` predisposto (mode `api`) con stato "Presto disponibile / Collega"
  finché non arriva l'API; `deeplink` come fallback interim.
- Sezione portale **EXTRA** ("I servizi e i vantaggi collegati al tuo pass"),
  card **raggruppate per categoria** (buoni pasto / welfare / mobilità).
- Back-link **EXTRA** sul retro del pass (da subito).
- Test: config brand multi-provider, endpoint portale, rendering per categoria,
  isolamento tenant, back-link presente.

Deliverable: hub EXTRA vivo end-to-end, multi-provider, pronto per l'API. Ogni
provider in stato "Collega/Presto disponibile" finché la sua API non è innestata.

### Fase 2 — Adapter reale (quando arriva l'API Edenred)
- `mode: 'api'`: `connect` (OAuth/login), `fetchData` (saldo reale), `refresh`.
- Cifratura credenziali attiva.
- Job di sync periodico opzionale (aggiorna `data.balance`).

Stima: poche ore, perché tutto il contorno esiste già.

---

## 8. Decisioni (chiuse — vedi §0)

1. ✅ Connessione **API/real connect**, non saldo manuale.
2. ✅ **Multi-provider** dal design.
3. ✅ Cornice **fringe benefit & welfare**, con categorie.
4. ✅ Back-link **EXTRA** sul pass **da subito**.

Nessuna domanda aperta bloccante. Unica dipendenza esterna: le **API dei provider**
(per i dati reali), che si innestano provider-per-provider quando disponibili.

---

## 9. Cosa NON faremo (per essere chiari)

- Non ricreiamo il saldo buoni pasto senza l'API ufficiale del provider.
- Non gestiamo pagamenti/spesa dei buoni (Livello 3, fuori scope).
- Non mettiamo questa roba nell'HUB Convenzioni (superfici e scopi diversi).

---

## Aggiornamento — Import via API (macchina-a-macchina)

Il caricamento dati per dipendente (caricato mensile + link personale) può
avvenire **automaticamente dal gestionale del brand**, non solo via CSV manuale.

- **Chiave API per brand** (`integration_api_keys`, solo hash SHA-256 salvato;
  valore in chiaro mostrato una volta alla generazione). Gestita nella tab EXTRA:
  genera / stato / revoca.
- **Endpoint macchina**: `POST /api/v1/integrations/import` — auth via header
  `X-Api-Key` (NON login dashboard), rate limit 30/min, provider dev'essere
  abilitato. Body: `{ type, rows: [{ matricola, periodo?, importo?, link? }] }`.
- Stesso motore di merge mensile del CSV (`data.months` accumulato per periodo).

Esempio:
```
curl -X POST https://studio.filodiretto.app/api/v1/integrations/import \
  -H "X-Api-Key: fd_..." -H "Content-Type: application/json" \
  -d '{"type":"satispay","rows":[{"matricola":"E00123","periodo":"2026-07","importo":176.00,"link":"https://..."}]}'
```

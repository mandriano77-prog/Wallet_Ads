/**
 * EXTRA — registry integrazioni (fringe benefit / welfare del dipendente).
 * Un provider = un adapter. Il framework è orientato alla connessione API;
 * finché l'API di un provider non è innestata, lo stato è "not_connected"
 * (mostrato come "Collega / Presto disponibile" nel portale).
 */
'use strict';

const { makePlaceholderAdapter } = require('./_placeholder');

// Provider con adapter dedicato (logica specifica / commenti / futura API).
const SPECIFIC = {
  edenred: require('./edenred'),
  pellegrini: require('./pellegrini'),
  satispay: require('./satispay'),
};
const SPECIFIC_DOMAINS = { edenred: 'edenred.it', pellegrini: 'pellegrinigroup.it', satispay: 'satispay.com' };
for (const [t, d] of Object.entries(SPECIFIC_DOMAINS)) { if (SPECIFIC[t]) SPECIFIC[t].domain = d; }

// Catalogo placeholder: i big del mercato IT (buoni pasto + welfare).
// Aggiungere un provider = una riga qui. Modalità manuale/import finché non
// esiste una API reale, poi si promuove a adapter dedicato.
const PLACEHOLDERS = [
  { type: 'coverflex', label: 'Coverflex', categories: ['fringe', 'buoni_pasto'], domain: 'coverflex.com' },
  { type: 'pluxee', label: 'Pluxee', categories: ['buoni_pasto', 'fringe'], domain: 'pluxee.it' },
  { type: 'day', label: 'Day', categories: ['buoni_pasto', 'fringe'], domain: 'day.it' },
  { type: 'repas', label: 'Repas', categories: ['buoni_pasto'], domain: 'repas.it' },
  { type: 'jointly', label: 'Jointly', categories: ['fringe'], domain: 'jointly.pro' },
  { type: 'doubleyou', label: 'Double You', categories: ['fringe'], domain: 'doubleyou.com' },
];

const ADAPTERS = { ...SPECIFIC };
for (const pl of PLACEHOLDERS) {
  if (!ADAPTERS[pl.type]) { ADAPTERS[pl.type] = makePlaceholderAdapter(pl); ADAPTERS[pl.type].domain = pl.domain || null; }
}

// Voci NATIVE: non provider terzi, ma dati aziendali (ferie, ecc.) sullo stesso
// rail. native:true → il portale le rende come widget-dato, non come brand.
ADAPTERS.ferie = makePlaceholderAdapter({ type: 'ferie', label: 'Ferie e permessi', categories: ['ferie'], native: true });

/** Categorie note per raggruppare le card nel portale. */
const CATEGORIES = Object.freeze({
  buoni_pasto: 'Buoni pasto',
  fringe: 'Fringe benefit',
  ferie: 'Ferie e permessi',
  altro: 'Altri servizi',
});

function getAdapter(type) {
  return ADAPTERS[String(type || '').trim()] || null;
}

/** Config integrazioni ABILITATE per un brand (da brand.config.integrations). */
function enabledIntegrations(brandConfig = {}) {
  const list = Array.isArray(brandConfig.integrations) ? brandConfig.integrations : [];
  return list
    .filter((it) => it && it.enabled && getAdapter(it.type))
    .map((it) => {
      const adapter = getAdapter(it.type);
      const categories = adapter.defaultCategories || [adapter.defaultCategory || 'altro'];
      const category = categories[0];
      return {
        type: it.type,
        label: String(it.label || adapter.defaultLabel || it.type).slice(0, 80),
        category,
        categories,
        category_label: CATEGORIES[category],
        logo_url: it.logo_url || null,
        domain: adapter.domain || null,
        mode: ['manual', 'deeplink', 'api'].includes(it.mode) ? it.mode : 'api',
        deeplink_url: it.deeplink_url || null,
        native: !!adapter.native,
      };
    });
}

/** Provider selezionabili nella dashboard admin. */
function availableProviders() {
  return Object.values(ADAPTERS).map((a) => ({
    type: a.type,
    label: a.defaultLabel,
    category: a.defaultCategory,
    categories: a.defaultCategories || [a.defaultCategory],
    domain: a.domain || null,
    native: !!a.native,
  }));
}

module.exports = { getAdapter, enabledIntegrations, availableProviders, CATEGORIES };

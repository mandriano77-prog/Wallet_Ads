/**
 * EXTRA — registry integrazioni (fringe benefit / welfare del dipendente).
 * Un provider = un adapter. Il framework è orientato alla connessione API;
 * finché l'API di un provider non è innestata, lo stato è "not_connected"
 * (mostrato come "Collega / Presto disponibile" nel portale).
 */
'use strict';

const ADAPTERS = {
  edenred: require('./edenred'),
  pellegrini: require('./pellegrini'),
};

/** Categorie note per raggruppare le card nel portale. */
const CATEGORIES = Object.freeze({
  buoni_pasto: 'Buoni pasto',
  welfare: 'Welfare',
  mobilita: 'Mobilità',
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
      const category = CATEGORIES[it.category] ? it.category : (adapter.defaultCategory || 'altro');
      return {
        type: it.type,
        label: String(it.label || adapter.defaultLabel || it.type).slice(0, 80),
        category,
        category_label: CATEGORIES[category],
        logo_url: it.logo_url || null,
        mode: it.mode === 'deeplink' ? 'deeplink' : 'api',
        deeplink_url: it.deeplink_url || null,
      };
    });
}

/** Provider selezionabili nella dashboard admin. */
function availableProviders() {
  return Object.values(ADAPTERS).map((a) => ({
    type: a.type,
    label: a.defaultLabel,
    category: a.defaultCategory,
  }));
}

module.exports = { getAdapter, enabledIntegrations, availableProviders, CATEGORIES };

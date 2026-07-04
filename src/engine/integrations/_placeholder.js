/**
 * Factory per adapter "placeholder": provider inseriti nel catalogo ma senza
 * integrazione API attiva. Modalità manuale (dati caricati dall'azienda via
 * import/API-key) + eventuale deep link. Quando un provider avrà una API reale,
 * si sostituisce con un adapter dedicato (come edenred.js).
 */
'use strict';

function makePlaceholderAdapter({ type, label, category = 'altro', categories = null, native = false }) {
  const cats = Array.isArray(categories) && categories.length ? categories : [category];
  return {
    type,
    defaultLabel: label,
    defaultCategory: cats[0],
    defaultCategories: cats,
    defaultMode: 'manual',
    native,
    async fetchState() { return { status: 'not_connected', data: {} }; },
    async connect() { const e = new Error('Collegamento API non ancora disponibile per ' + label); e.statusCode = 501; throw e; },
    async disconnect() {},
  };
}

module.exports = { makePlaceholderAdapter };

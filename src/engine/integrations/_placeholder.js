/**
 * Factory per adapter "placeholder": provider inseriti nel catalogo ma senza
 * integrazione API attiva. Modalità manuale (dati caricati dall'azienda via
 * import/API-key) + eventuale deep link. Quando un provider avrà una API reale,
 * si sostituisce con un adapter dedicato (come edenred.js).
 */
'use strict';

function makePlaceholderAdapter({ type, label, category = 'altro', native = false }) {
  return {
    type,
    defaultLabel: label,
    defaultCategory: category,
    defaultMode: 'manual',
    native,
    async fetchState() { return { status: 'not_connected', data: {} }; },
    async connect() { const e = new Error('Collegamento API non ancora disponibile per ' + label); e.statusCode = 501; throw e; },
    async disconnect() {},
  };
}

module.exports = { makePlaceholderAdapter };

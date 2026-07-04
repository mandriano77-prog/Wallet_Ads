/**
 * Adapter Pellegrini (buoni pasto). Predisposto — vedi edenred.js.
 */
'use strict';

module.exports = {
  type: 'pellegrini',
  defaultLabel: 'Pellegrini',
  defaultCategory: 'buoni_pasto',
  defaultCategories: ['buoni_pasto'],
  async fetchState() { return { status: 'not_connected', data: {} }; },
  async connect() { const e = new Error('Collegamento Pellegrini non ancora disponibile'); e.statusCode = 501; throw e; },
  async disconnect() {}
};

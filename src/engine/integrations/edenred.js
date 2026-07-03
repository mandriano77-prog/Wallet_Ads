/**
 * Adapter Edenred / Ticket Restaurant (buoni pasto).
 * Fase 1: predisposto, nessuna API reale ancora → stato "not_connected".
 * Fase 2: implementare connect() (OAuth/login) e fetchData() (saldo reale).
 */
'use strict';

module.exports = {
  type: 'edenred',
  defaultLabel: 'Ticket Restaurant',
  defaultCategory: 'buoni_pasto',
  defaultMode: 'manual',

  // Ritorna lo stato mostrato al dipendente. Fase 1: sempre da collegare.
  async fetchState(/* member, integrationConfig, connection */) {
    return { status: 'not_connected', data: {} };
  },

  // Fase 2: avvia il collegamento account (OAuth/credenziali) → credentials cifrate.
  async connect() {
    const err = new Error('Collegamento Edenred non ancora disponibile');
    err.statusCode = 501;
    throw err;
  },

  async disconnect() { /* no-op in fase 1 */ }
};

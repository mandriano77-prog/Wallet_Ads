/**
 * Adapter Satispay (buoni caricati dall'azienda, modalità manuale + deep link).
 * L'API pubblica Satispay è merchant-only: nessuna lettura del wallet personale.
 * Qui mostriamo i buoni caricati dall'azienda mese per mese (import) + link
 * personale all'app/conto.
 */
'use strict';

module.exports = {
  type: 'satispay',
  defaultLabel: 'Satispay',
  defaultCategory: 'buoni_pasto',
  defaultMode: 'manual',
  async fetchState() { return { status: 'not_connected', data: {} }; },
  async connect() { const e = new Error('Collegamento API Satispay non disponibile (solo manuale)'); e.statusCode = 501; throw e; },
  async disconnect() {}
};

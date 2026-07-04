(function () {
  'use strict';

  const PRIVACY_VERSION = '2.0';

  const CONSENT_META = {
    birthday: {
      icon: 'gift',
      title: 'Auguri di compleanno e ricorrenze',
      desc: 'Push automatica il giorno del tuo compleanno e per anniversari aziendali (1 anno, 5 anni, 10 anni).'
    },
    welfare_geo: {
      icon: 'map-pin',
      title: 'Welfare territoriale geolocalizzato',
      desc: 'Convenzioni vicino a te (palestre, eventi, ristoranti). La posizione è elaborata sul dispositivo, non sui nostri server.'
    },
    gamification: {
      icon: 'trophy',
      title: 'Iniziative engagement, quiz e classifiche',
      desc: 'Quiz non obbligatori, sfide a punti, classifiche con nome e punteggio visibili al team. Premi opzionali.'
    },
    climate_survey: {
      icon: 'message-square',
      title: 'Sondaggi clima e indagini interne',
      desc: 'Sondaggi sul clima aziendale, pulse survey, feedback su eventi. Le risposte sono trattate in forma aggregata e anonima.'
    },
    partner_offers: {
      icon: 'store',
      title: 'Comunicazioni di partner convenzionati',
      desc: "Offerte e novità da partner commerciali esterni convenzionati con l'azienda."
    }
  };

  const CONSENT_LABEL = Object.fromEntries(
    Object.entries(CONSENT_META).map(([k, v]) => [k, v.title])
  );

  const GDPR_ACTIONS = [
    {
      type: 'portability',
      icon: 'download',
      title: 'Scarica i miei dati',
      subtitle: 'Export JSON · art. 20 GDPR · ricevi via email entro 24 ore',
      confirm: 'Inviare richiesta di export dei tuoi dati al DPO aziendale?'
    },
    {
      type: 'rectification',
      icon: 'edit-3',
      title: 'Richiedi rettifica',
      subtitle: 'Segnala un dato errato · art. 16 GDPR · risposta entro 30 giorni',
      prompt: 'Descrivi quale dato è errato e la correzione richiesta:',
      confirm: 'Inviare richiesta di rettifica al DPO?'
    },
    {
      type: 'erasure',
      icon: 'archive',
      title: 'Richiedi cancellazione',
      subtitle: "Diritto all'oblio · art. 17 GDPR · soggetto a obblighi di legge del datore",
      confirm: 'Inviare richiesta di cancellazione? Potrebbe essere limitata da obblighi legali del datore.'
    }
  ];

  let portalToken = new URLSearchParams(window.location.search).get('t') || '';
  let profile = null;
  let consents = [];
  let consentLog = [];
  let extraLoaded = false;
  let consentSaving = false;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMoney(v) {
    const n = Number(v);
    if (!isFinite(n)) return String(v);
    return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fv(...keys) {
    const f = profile?.field_values || {};
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k && f[k] != null && String(f[k]).trim() !== '') return f[k];
    }
    return '';
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('it-IT', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return '—';
    }
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) +
        ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '—';
    }
  }

  function formatRelative(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.round(diff / 60000);
    if (min < 1) return 'adesso';
    if (min < 60) return min + ' minuti fa';
    const h = Math.round(min / 60);
    if (h < 24) return h + ' ore fa';
    const d = Math.round(h / 24);
    return d + ' giorni fa';
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  }

  function jwtHoursLeft(token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (!payload.exp) return null;
      return Math.max(0, Math.round((payload.exp * 1000 - Date.now()) / 3600000));
    } catch {
      return null;
    }
  }

  function setToken(token) {
    portalToken = token || '';
    const u = new URL(window.location.href);
    if (portalToken) u.searchParams.set('t', portalToken);
    else u.searchParams.delete('t');
    window.history.replaceState(null, '', u.pathname + u.search);
  }

  function showGate(title, message) {
    $('#gate').classList.remove('hidden');
    $('#app').classList.add('hidden');
    $('#gate-title').textContent = title;
    $('#gate-message').textContent = message;
  }

  function showApp() {
    $('#gate').classList.add('hidden');
    $('#app').classList.remove('hidden');
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function apiUrl(path) {
    return '/api/v1/portal' + path;
  }

  // Il token viaggia nell'header, non in query string: le URL finiscono nei log
  // del server (morgan), nella history e nei referrer — l'header no.
  function authHeaders() {
    return portalToken ? { 'X-Portal-Token': portalToken } : {};
  }

  async function apiJson(path, options) {
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(options?.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Errore di rete');
    return data;
  }

  async function apiBlob(path, options) {
    const res = await fetch(apiUrl(path), {
      ...options,
      headers: { ...authHeaders(), ...(options?.headers || {}) }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Download non riuscito');
    }
    const newToken = res.headers.get('X-Portal-Token');
    if (newToken) setToken(newToken);
    return { blob: await res.blob(), filename: 'pass.pkpass' };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function validHex(value) {
    const raw = String(value || '').trim();
    return /^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw) ? (raw[0] === '#' ? raw : '#' + raw) : '';
  }

  function resolveAssetUrl(url) {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    const path = url.startsWith('/') ? url : `/${url}`;
    return `${window.location.origin}${path}`;
  }

  function applyBrandedIcons(logoUrl) {
    if (!logoUrl) return;
    document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute('href', logoUrl);
    document.querySelector('link[rel="icon"]')?.setAttribute('href', logoUrl);
  }

  function applyBrandTheme() {
    const theme = profile?.brand?.brand_theme;
    if (!theme) return;
    const accent = validHex(theme.accent);
    const hover = validHex(theme.accentHover || theme.accent);
    const onAccent = validHex(theme.textOnAccent) || '#FFFFFF';
    const root = document.documentElement.style;
    if (accent) {
      root.setProperty('--accent', accent);
      root.setProperty('--border-focus', accent);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', accent);
    }
    if (hover) root.setProperty('--accent-hover', hover);
    if (onAccent) root.setProperty('--text-on-accent', onAccent);
    if (accent && typeof CSS !== 'undefined' && CSS.supports('color', 'color-mix(in srgb, red 50%, white)')) {
      root.setProperty('--accent-subtle', `color-mix(in srgb, ${accent} 10%, white)`);
      root.setProperty('--bg-active', `color-mix(in srgb, ${accent} 14%, white)`);
    }
  }

  function renderHeader() {
    const name = profile.display_name || 'Dipendente';
    const dept = fv('reparto', 'department');
    $('#brand-name').textContent = profile.brand?.name || 'Filodiretto';
    const dot = document.querySelector('.topbar .brand .dot');
    const logoUrl = resolveAssetUrl(profile.brand?.logo_url);
    if (dot) {
      if (logoUrl) {
        dot.classList.add('has-logo');
        dot.innerHTML = '<img src="' + esc(logoUrl) + '" alt="">';
      } else {
        dot.classList.remove('has-logo');
        dot.innerHTML = '';
      }
    }
    applyBrandedIcons(logoUrl);
    $('#user-avatar').textContent = initials(name);
    $('#user-display-name').textContent = name;
    $('#user-subtitle').textContent = dept || '—';

    const hours = jwtHoursLeft(portalToken);
    $('#session-info').textContent =
      hours != null ? 'Sessione attiva · scade tra ~' + hours + 'h' : 'Sessione attiva';
  }

  function renderCard() {
    const name = profile.display_name || '—';
    const dept = fv('reparto', 'department');
    const sede = fv('sede', 'location');
    const badge = fv('badge_id', 'matricola') || '—';

    $('#pass-brand').textContent = profile.brand?.name || '—';
    $('#pass-name').textContent = name;
    $('#pass-role').textContent = [dept, sede].filter(Boolean).join(' · ') || '—';
    $('#pass-badge').textContent = badge ? (String(badge).startsWith('#') ? badge : '#' + badge) : '—';

    const tiles = [
      { label: 'Sede', value: sede || '—' },
      { label: 'Reparto', value: dept || '—' },
      { label: 'Pass attivo da', value: formatDate(profile.install_date) }
    ];

    $('#pass-info-grid').innerHTML = tiles
      .map(
        (t) =>
          '<div class="info-tile"><div class="label">' +
          esc(t.label) +
          '</div><div class="value">' +
          esc(t.value) +
          '</div></div>'
      )
      .join('');
  }

  function renderConsents() {
    const list = $('#consent-list');
    list.innerHTML = consents
      .map((c) => {
        const meta = CONSENT_META[c.consent_type] || {
          icon: 'circle',
          title: c.consent_type,
          desc: ''
        };
        return (
          '<div class="consent-row" data-type="' +
          esc(c.consent_type) +
          '">' +
          '<div class="consent-icon"><i data-lucide="' +
          esc(meta.icon) +
          '"></i></div>' +
          '<div class="consent-body">' +
          '<div class="title-line"><span class="title">' +
          esc(meta.title) +
          '</span></div>' +
          '<div class="desc">' +
          esc(meta.desc) +
          '</div>' +
          '<div class="legal">Base giuridica: art. 6.1.a GDPR (consenso)</div>' +
          '</div>' +
          '<label class="switch">' +
          '<input type="checkbox" data-consent="' +
          esc(c.consent_type) +
          '"' +
          (c.granted ? ' checked' : '') +
          (consentSaving ? ' disabled' : '') +
          '>' +
          '<span class="slider"></span></label></div>'
        );
      })
      .join('');

    list.querySelectorAll('input[data-consent]').forEach((input) => {
      input.addEventListener('change', onConsentToggle);
    });

    const latest = consents
      .map((c) => c.updated_at)
      .filter(Boolean)
      .sort()
      .pop();
    $('#consent-status').textContent = latest
      ? 'Modifiche salvate automaticamente · ultima modifica ' + formatRelative(latest)
      : 'Modifiche salvate automaticamente';
    renderPrivacyContact();
  }

  function renderPrivacyContact() {
    const card = $('#privacy-dpo-card');
    if (!card) return;
    const email = profile && profile.dpo_email ? String(profile.dpo_email).trim() : '';
    const policyUrl = profile && profile.privacy_url ? String(profile.privacy_url).trim() : '';
    if (!email && !policyUrl) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    const mailEl = $('#privacy-dpo-mail');
    if (email && mailEl) {
      mailEl.href = 'mailto:' + encodeURIComponent(email);
      mailEl.textContent = email;
      mailEl.hidden = false;
    } else if (mailEl) {
      mailEl.hidden = true;
    }
    const polEl = $('#privacy-policy-link');
    if (policyUrl && polEl) {
      polEl.href = policyUrl;
      polEl.hidden = false;
    } else if (polEl) {
      polEl.hidden = true;
    }
  }

  async function onConsentToggle(ev) {
    const type = ev.target.getAttribute('data-consent');
    const granted = ev.target.checked;
    consentSaving = true;
    renderConsents();
    try {
      await apiJson('/me/consents', {
        method: 'PUT',
        body: JSON.stringify({
          consent_type: type,
          granted,
          privacy_policy_version: PRIVACY_VERSION
        })
      });
      const data = await apiJson('/me');
      consents = data.consents || [];
      toast('Consenso aggiornato');
      renderConsents();
      loadConsentLog();
    } catch (err) {
      ev.target.checked = !granted;
      toast(err.message);
    } finally {
      consentSaving = false;
      renderConsents();
      refreshIcons();
    }
  }

  function renderDataGrid() {
    const fields = [
      { label: 'Nome e cognome', value: profile.display_name },
      { label: 'Email aziendale', value: fv('email') },
      {
        label: 'Matricola',
        value: fv('badge_id', 'matricola') || fv('matricola')
      },
      { label: 'Reparto', value: fv('reparto', 'department') },
      { label: 'Sede', value: fv('sede', 'location') },
      {
        label: 'Data di assunzione',
        value: fv('data_assunzione', 'hire_date') || formatDate(profile.install_date)
      }
    ];

    $('#data-sync-meta').textContent =
      'Pass attivo dal ' + formatDate(profile.install_date);
    $('#gdpr-intro').textContent =
      'Hai diritto di accedere, correggere, cancellare i tuoi dati. Le richieste vengono inoltrate al DPO aziendale (' +
      (profile.brand?.name || 'azienda') +
      ').';

    $('#data-grid').innerHTML = fields
      .map(
        (f) =>
          '<div class="data-field"><div class="label">' +
          esc(f.label) +
          '</div><div class="value">' +
          esc(f.value || '—') +
          '</div></div>'
      )
      .join('');

    const actions = $('#gdpr-actions');
    actions.innerHTML = GDPR_ACTIONS.map(
      (a) =>
        '<button type="button" class="action-link gdpr-btn" data-type="' +
        esc(a.type) +
        '">' +
        '<div class="left">' +
        '<div class="ico"><i data-lucide="' +
        esc(a.icon) +
        '"></i></div>' +
        '<div class="text"><strong>' +
        esc(a.title) +
        '</strong><span>' +
        esc(a.subtitle) +
        '</span></div></div>' +
        '<i data-lucide="chevron-right" class="arrow"></i></button>'
    )
      .join('');

    actions.querySelectorAll('.gdpr-btn').forEach((btn) => {
      btn.addEventListener('click', () => submitGdpr(btn.getAttribute('data-type')));
    });
  }

  function renderConsentLog() {
    const el = $('#consent-log');
    if (!consentLog.length) {
      el.innerHTML = '<div class="empty-state">Nessuna modifica ai consensi registrata.</div>';
      return;
    }
    el.innerHTML = consentLog
      .map((row) => {
        const label = CONSENT_LABEL[row.consent_type] || row.consent_type;
        const verb = row.action === 'granted' ? 'Attivato' : 'Disattivato';
        return (
          '<div class="log-item">' +
          '<span class="time">' +
          esc(formatDateTime(row.timestamp)) +
          '</span>' +
          '<span class="desc">' +
          verb +
          ' consenso <strong>"' +
          esc(label) +
          '"</strong></span></div>'
        );
      })
      .join('');
  }



  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function bindNavigation() {
    $$('.nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        const page = item.getAttribute('data-page');
        $$('.nav-item').forEach((n) => n.classList.remove('active'));
        item.classList.add('active');
        $$('.page').forEach((p) => {
          p.classList.toggle('active', p.getAttribute('data-page') === page);
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (page === 'dati' && !consentLog.length) loadConsentLog();
        if (page === 'extra' && !extraLoaded) loadExtra();
      });
    });
  }

  async function loadExtra() {
    extraLoaded = true;
    const host = document.getElementById('extra-content');
    if (host) host.innerHTML = '<p style="color:var(--text-muted)">Caricamento…</p>';
    try {
      const data = await apiJson('/me/integrations');
      renderExtra(data.groups || []);
    } catch (err) {
      extraLoaded = false;
      if (host) host.innerHTML = '<p style="color:var(--text-muted)">Servizi non disponibili al momento.</p>';
    }
  }

  function extraStatusLabel(status) {
    if (status === 'connected') return { text: 'Collegato', cls: 'ok' };
    if (status === 'error') return { text: 'Errore', cls: 'err' };
    return { text: 'Da collegare', cls: 'muted' };
  }

  function renderExtra(groups) {
    const host = document.getElementById('extra-content');
    if (!host) return;
    if (!groups.length) {
      host.innerHTML = '<div class="card" style="padding:var(--space-5)"><p style="margin:0;color:var(--text-muted)">'
        + 'Nessun servizio EXTRA attivo per la tua azienda al momento.</p></div>';
      return;
    }
    host.innerHTML = groups.map(function (g) {
      const cards = g.items.map(function (it) {
        const st = extraStatusLabel(it.status);
        // Voci native "credito residuo €" (welfare / fringe benefit).
        if (it.native && (it.type === 'welfare_credit' || it.type === 'fringe_benefit')) {
          const r = it.data && it.data.residuo;
          const cur2 = (it.data && it.data.currency) || 'EUR';
          const upd = it.data && it.data.updated_label ? '<span class="extra-period">Aggiornato al ' + esc(it.data.updated_label) + '</span>' : '';
          const body = (r != null)
            ? '<div class="extra-balance">' + esc(formatMoney(r)) + ' ' + esc(cur2) + ' residui</div>' + upd
            : '<span class="extra-status extra-status--muted">In attesa di aggiornamento</span>';
          const logoN = '<div class="extra-logo extra-logo--ph">' + (it.type === 'welfare_credit' ? '\ud83d\udc9a' : '\ud83c\udf81') + '</div>';
          return '<div class="extra-card">' + logoN
            + '<div class="extra-card__body"><div class="extra-card__label">' + esc(it.label) + '</div>' + body + '</div></div>';
        }
        // Voce nativa ferie: due numeri (giorni ferie + permessi), niente importi.
        if (it.native && it.type === 'ferie') {
          const fr = it.data && it.data.ferie_residue;
          const pe = it.data && it.data.permessi_residue;
          const upd = it.data && it.data.updated_label ? '<span class="extra-period">Aggiornato al ' + esc(it.data.updated_label) + '</span>' : '';
          const has = (fr != null) || (pe != null);
          const body = has
            ? '<div class="extra-leave">'
                + (fr != null ? '<div class="extra-leave__item"><strong>' + esc(formatMoney(fr)) + '</strong><span>giorni ferie</span></div>' : '')
                + (pe != null ? '<div class="extra-leave__item"><strong>' + esc(formatMoney(pe)) + '</strong><span>permessi</span></div>' : '')
              + '</div>' + upd
            : '<span class="extra-status extra-status--muted">In attesa di aggiornamento</span>';
          const logoF = '<div class="extra-logo extra-logo--ph">🏖️</div>';
          return '<div class="extra-card">' + logoF
            + '<div class="extra-card__body"><div class="extra-card__label">' + esc(it.label) + '</div>' + body + '</div></div>';
        }
        const cur = it.data.currency || 'EUR';
        const amount = it.data && (it.data.loaded_amount != null ? it.data.loaded_amount : it.data.balance);
        let balance = '';
        if (amount != null) {
          const period = it.data.current_period ? '<span class="extra-period">' + esc(it.data.current_period) + '</span>' : '';
          balance = '<div class="extra-balance">' + esc(formatMoney(amount)) + ' ' + esc(cur) + period + '</div>';
        }
        // Storico mensile (buoni caricati mese per mese).
        let months = '';
        if (Array.isArray(it.data.months) && it.data.months.length > 1) {
          months = '<ul class="extra-months">' + it.data.months.slice(0, 6).map(function (mo) {
            return '<li><span>' + esc(mo.label || mo.period) + '</span><strong>' + esc(formatMoney(mo.amount)) + ' ' + esc(cur) + '</strong></li>';
          }).join('') + '</ul>';
        }
        // Link personale del dipendente (caricato dall'azienda) > deeplink generico.
        const personalUrl = (it.data && it.data.personal_url) || (it.mode === 'deeplink' ? it.deeplink_url : null);
        let action = '';
        if (personalUrl) {
          action = '<a class="btn btn-sm" href="' + esc(personalUrl) + '" target="_blank" rel="noopener">Vai al mio conto</a>';
        } else if (it.status !== 'connected') {
          action = '<button type="button" class="btn btn-sm" disabled title="Presto disponibile">Collega</button>';
        }
        var logoSrc = it.logo_url || (it.domain ? 'https://icons.duckduckgo.com/ip3/' + it.domain + '.ico' : null);
        const logo = logoSrc
          ? '<div class="extra-logo extra-logo--ph">' + esc((it.label || '?').charAt(0).toUpperCase())
              + '<img src="' + esc(logoSrc) + '" alt="" onerror="this.remove()"></div>'
          : '<div class="extra-logo extra-logo--ph">' + esc((it.label || '?').charAt(0).toUpperCase()) + '</div>';
        return '<div class="extra-card">'
          + logo
          + '<div class="extra-card__body"><div class="extra-card__label">' + esc(it.label) + '</div>'
          + '<span class="extra-status extra-status--' + st.cls + '">' + st.text + '</span>' + balance + months + '</div>'
          + '<div class="extra-card__action">' + action + '</div>'
          + '</div>';
      }).join('');
      return '<div class="extra-group"><h2 class="extra-group__title">' + esc(g.category_label) + '</h2>'
        + '<div class="extra-grid">' + cards + '</div></div>';
    }).join('');
  }

  async function loadConsentLog() {
    try {
      const data = await apiJson('/me/consent-log');
      consentLog = data.log || [];
      renderConsentLog();
    } catch {
      /* optional */
    }
  }


  async function submitGdpr(type) {
    const action = GDPR_ACTIONS.find((a) => a.type === type);
    if (!action) return;
    if (action.confirm && !window.confirm(action.confirm)) return;
    let details = null;
    if (action.prompt) {
      details = window.prompt(action.prompt);
      if (details == null) return;
      if (!String(details).trim()) {
        toast('Inserisci una descrizione');
        return;
      }
    }
    try {
      await apiJson('/me/gdpr/' + type, {
        method: 'POST',
        body: JSON.stringify({ details })
      });
      toast('Richiesta inviata al DPO');
    } catch (err) {
      toast(err.message);
    }
  }

  function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent || '');
  }

  async function openGoogleWalletPass(regenerate) {
    const passId = profile && profile.pass_id;
    if (!passId) throw new Error('Pass non disponibile');

    if (regenerate) {
      const regen = await apiJson('/me/pass/regenerate?json=1', { method: 'POST' });
      if (regen.portal_token) setToken(regen.portal_token);
    }

    const res = await fetch('/api/v1/google-wallet/pass/' + encodeURIComponent(passId), {
      cache: 'no-store'
    });
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || 'Errore Google Wallet');
    if (!data.save_link) throw new Error('Link Google Wallet non disponibile');
    window.location.href = data.save_link;
  }

  async function downloadPass(regenerate) {
    if (isAndroidDevice()) {
      const btn = regenerate ? $('#btn-regenerate') : $('#btn-download');
      btn.disabled = true;
      try {
        await openGoogleWalletPass(regenerate);
        toast(
          regenerate
            ? 'Pass aggiornato — conferma in Google Wallet'
            : 'Apertura Google Wallet…'
        );
      } catch (err) {
        toast(err.message);
      } finally {
        btn.disabled = false;
      }
      return;
    }

    const path = regenerate ? '/me/pass/regenerate' : '/me/pass/download';
    const btn = regenerate ? $('#btn-regenerate') : $('#btn-download');
    btn.disabled = true;
    try {
      const { blob } = await apiBlob(path, { method: regenerate ? 'POST' : 'GET' });
      const slug = profile.brand?.slug || 'pass';
      downloadBlob(blob, slug + '.pkpass');
      toast(regenerate ? 'Pass rigenerato — installalo di nuovo' : 'Download avviato');
      if (regenerate) {
        const hours = jwtHoursLeft(portalToken);
        if (hours != null) {
          $('#session-info').textContent = 'Sessione attiva · scade tra ~' + hours + 'h';
        }
      }
    } catch (err) {
      toast(err.message);
    } finally {
      btn.disabled = false;
    }
  }

  function bindActions() {
    $('#btn-download').addEventListener('click', () => downloadPass(false));
    $('#btn-regenerate').addEventListener('click', () => {
      if (
        window.confirm(
          'Rigenerare il pass? I link precedenti al portale non funzioneranno più finché non installi il nuovo pass.'
        )
      ) {
        downloadPass(true);
      }
    });
    $('#btn-wallet').addEventListener('click', () => downloadPass(false));
    $('#btn-exit').addEventListener('click', () => {
      setToken('');
      showGate('Sessione chiusa', 'Puoi riaprire il portale dal link sul retro del pass Wallet.');
    });
    $('#btn-uninstall').addEventListener('click', async () => {
      if (
        !window.confirm(
          'Confermi di voler chiudere la sessione portale? Dovrai rimuovere il pass manualmente dal Wallet sul telefono.'
        )
      ) {
        return;
      }
      try {
        const data = await apiJson('/me/pass/uninstall', { method: 'POST', body: '{}' });
        setToken('');
        showGate('Pass e portale', data.message || 'Sessione revocata.');
      } catch (err) {
        toast(err.message);
      }
    });
  }

  function renderAll() {
    applyBrandTheme();
    renderHeader();
    renderCard();
    renderConsents();
    renderDataGrid();
    renderConsentLog();
    refreshIcons();
  }

  async function boot() {
    if (!portalToken) {
      showGate(
        'Link richiesto',
        'Apri questo portale dal link «Il mio profilo» sul retro del tuo pass Wallet.'
      );
      return;
    }

    showGate('Caricamento…', 'Recupero del profilo in corso.');
    try {
      const data = await apiJson('/me');
      profile = data.profile;
      consents = data.consents || [];
      showApp();
      renderAll();
      bindNavigation();
    if ((window.location.hash || '').replace('#','') === 'extra') {
      const t = document.querySelector('.nav-item[data-page="extra"]');
      if (t) t.click();
    }
      bindActions();
    } catch (err) {
      showGate(
        'Sessione scaduta',
        err.message || 'Link non valido. Apri di nuovo il portale dal pass Wallet.'
      );
    }
  }

  boot();
})();

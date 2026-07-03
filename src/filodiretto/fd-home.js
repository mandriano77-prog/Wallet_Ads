/**
 * FD-02 — FiloDiretto home dashboard (KPI, onboarding, ultime attività).
 * No-op on ads2wallet / non-HR shells.
 */
(function () {
  'use strict';

  function injectFiloWelcomeCriticalCss() {
    var isFilo = document.documentElement.getAttribute('data-app') === 'filodiretto';
    if (!isFilo) {
      try { isFilo = window.__2WALLET_PRODUCT_LOCK__ === 'hr'; } catch (_) {}
    }
    if (!isFilo || document.getElementById('fdHomeWelcomeCritical')) return;
    var el = document.createElement('style');
    el.id = 'fdHomeWelcomeCritical';
    el.textContent =
      "html[data-app='filodiretto'] #welcome > .page-title," +
      "html[data-app='filodiretto'] #welcome .page-lead," +
      "html[data-app='filodiretto'] #welcome .fd-welcome-legacy{display:none!important}";
    (document.head || document.documentElement).appendChild(el);
  }
  injectFiloWelcomeCriticalCss();

  var EVENT_LABELS = {
    signup: 'Iscrizione',
    pass_created: 'Pass creato',
    pass_download: 'Download pass',
    pass_install: 'Installazione Wallet',
    points_added: 'Punti aggiunti',
    points_redeemed: 'Punti riscattati',
    push_sent: 'Push inviata',
    reward_claimed: 'Premio riscattato',
    challenge_completed: 'Challenge completata',
    tier_upgrade: 'Upgrade tier',
    email_sent: 'Email inviata',
    google_wallet_save: 'Salvataggio Google Wallet',
    samsung_wallet_save: 'Salvataggio Samsung Wallet'
  };

  function isFiloHomeApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function esc(s) {
    if (typeof window.esc === 'function') return window.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getApiBase() {
    if (typeof window.API === 'string' && window.API) return window.API;
    return '/api/v1';
  }

  function authHeaders() {
    if (typeof window.getAuthHeaders === 'function') return window.getAuthHeaders();
    var t = '';
    try { t = localStorage.getItem('a2w_token') || ''; } catch (_) {}
    return t ? { Authorization: 'Bearer ' + t } : {};
  }

  function isValidBrandId(value) {
    if (value == null) return false;
    var id = String(value).trim();
    return !!(id && id !== 'undefined' && id !== 'null');
  }

  function getBrandId() {
    var candidates = [];
    try {
      if (window.brandId) candidates.push(window.brandId);
    } catch (_) {}
    var sel = document.getElementById('brandSelector');
    if (sel && sel.value) candidates.push(sel.value);
    try {
      var qp = new URLSearchParams(window.location.search || '').get('brand_id');
      if (qp) candidates.push(qp);
    } catch (_) {}
    for (var i = 0; i < candidates.length; i++) {
      var id = String(candidates[i]).trim();
      if (isValidBrandId(id)) return id;
    }
    return null;
  }

  function getBrandName() {
    try {
      if (window.currentBrandName) return window.currentBrandName;
    } catch (_) {}
    var sel = document.getElementById('brandSelector');
    if (!sel || !sel.value) return '';
    return sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '';
  }

  async function fetchJson(url) {
    if (typeof window.fetchCachedJson === 'function') {
      return window.fetchCachedJson(url, { headers: authHeaders() });
    }
    var res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) {
      var err = {};
      try { err = await res.json(); } catch (_) {}
      throw new Error(err.error || res.statusText || String(res.status));
    }
    return res.json();
  }

  function ensureMount() {
    var welcome = document.getElementById('welcome');
    if (!welcome) return null;
    welcome.classList.add('welcome--fd-home');
    var root = document.getElementById('fdHomeRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'fdHomeRoot';
      root.className = 'fd-home-root';
      root.setAttribute('role', 'region');
      root.setAttribute('aria-label', 'Home operativa');
      var lead = welcome.querySelector('.page-lead');
      if (lead && lead.parentNode) lead.parentNode.insertBefore(root, lead.nextSibling);
      else welcome.appendChild(root);
    }
    root.hidden = false;
    return root;
  }

  function setHomeState(welcome, state) {
    if (!welcome) return;
    var next = state || 'no-brand';
    welcome.setAttribute('data-fd-home-state', next);
    var root = document.getElementById('fdHomeRoot');
    if (root) {
      root.classList.remove(
        'fd-home-root--setup',
        'fd-home-root--operational',
        'fd-home-root--no-brand',
        'fd-home-root--loading',
        'fd-home-root--error'
      );
      if (next === 'setup') root.classList.add('fd-home-root--setup');
      else if (next === 'operational') root.classList.add('fd-home-root--operational');
      else if (next === 'loading') root.classList.add('fd-home-root--loading');
      else if (next === 'error') root.classList.add('fd-home-root--error');
      else root.classList.add('fd-home-root--no-brand');
    }
  }

  function renderLoading(root) {
    var welcome = document.getElementById('welcome');
    setHomeState(welcome, 'loading');
    var inner =
      '<div class="fd-skeleton fd-skeleton--title" style="max-width:280px;margin-bottom:20px"></div>' +
      '<div class="fd-skeleton fd-skeleton--text" style="max-width:420px;margin-bottom:24px"></div>' +
      '<div class="fd-stat-grid fd-home-kpi-grid">' +
      '<div class="fd-stat-card"><span class="fd-skeleton fd-skeleton--text"></span>' +
      '<span class="fd-skeleton fd-skeleton--title" style="margin-top:10px;width:45%"></span></div>' +
      '<div class="fd-stat-card"><span class="fd-skeleton fd-skeleton--text"></span>' +
      '<span class="fd-skeleton fd-skeleton--title" style="margin-top:10px;width:45%"></span></div>' +
      '<div class="fd-stat-card"><span class="fd-skeleton fd-skeleton--text"></span>' +
      '<span class="fd-skeleton fd-skeleton--title" style="margin-top:10px;width:45%"></span></div>' +
      '<div class="fd-stat-card"><span class="fd-skeleton fd-skeleton--text"></span>' +
      '<span class="fd-skeleton fd-skeleton--title" style="margin-top:10px;width:45%"></span></div>' +
      '</div>';
    root.innerHTML =
      typeof window.fdRenderLoadingRegion === 'function'
        ? window.fdRenderLoadingRegion(inner, { className: 'fd-home-skeleton', label: 'Caricamento home' })
        : '<div class="fd-home-skeleton fd-loading-region" aria-live="polite" aria-busy="true">' + inner + '</div>';
  }

  function buildHomeContext(data) {
    var a = data.analytics || {};
    var apple = a.appleDeviceCount != null ? a.appleDeviceCount : (a.deviceCount || 0);
    var google = a.googleWalletSavedCount || 0;
    var samsung = a.samsungWalletSavedCount || 0;
    var walletInstalls = apple + google + samsung;
    return {
      hasBrandIdentity: data.hasBrandIdentity,
      templateCount: data.templateCount,
      employeeCount: data.employeeCount,
      employeesWithPass: data.employeesWithPass,
      pushCount: data.pushCount,
      walletInstalls: walletInstalls,
      totalPasses: a.totalPasses || 0,
      apple: apple,
      google: google,
      samsung: samsung
    };
  }

  function getOnboardingProgress(ctx) {
    var steps = onboardingSteps();
    var doneCount = 0;
    var nextStep = null;
    steps.forEach(function (step) {
      var done = step.done(ctx);
      if (done) doneCount += 1;
      else if (!nextStep) nextStep = step;
    });
    return {
      steps: steps,
      doneCount: doneCount,
      total: steps.length,
      nextStep: nextStep,
      isOperational: doneCount === steps.length
    };
  }

  function renderNoBrand(root) {
    setHomeState(document.getElementById('welcome'), 'no-brand');
    var isAdmin = document.body.classList.contains('role-admin');
    root.innerHTML =
      '<header class="fd-page-header fd-home-page-header">' +
      '<div class="fd-page-header__copy">' +
      '<h1 class="fd-page-header__title">Inizio</h1>' +
      '<p class="fd-page-header__lead">Seleziona un brand dall’header' + (isAdmin ? ' o crea un nuovo cliente' : '') + ' per vedere KPI, setup e attività recenti.</p>' +
      '</div></header>' +
      '<div class="fd-empty-state fd-card">' +
      '<p class="fd-empty-state__title">Nessun brand selezionato</p>' +
      '<p class="fd-empty-state__desc">' + (isAdmin ? 'Crea un tenant separato con manager dedicato, oppure scegli un brand esistente.' : 'Scegli un brand esistente per continuare il setup.') + '</p>' +
      '<div class="fd-empty-state__actions">' +
      '<button type="button" class="btn" onclick="document.getElementById(\'brandSelector\').focus()">Seleziona brand</button>' +
      (isAdmin ? '<button type="button" class="btn sec" data-fd-action="tenant-wizard">Nuovo cliente</button>' : '') +
      '</div></div>';
    bindNavButtons(root);
  }

  function bindNavButtons(container) {
    container.querySelectorAll('[data-fd-nav]').forEach(function (btn) {
      if (btn.dataset.fdBound === '1') return;
      btn.dataset.fdBound = '1';
      btn.addEventListener('click', function (e) {
        var id = btn.getAttribute('data-fd-nav');
        if (document.body.classList.contains('fd-wai-open') && typeof window.fdNavigateFromWai === 'function') {
          window.fdNavigateFromWai(btn, e);
          return;
        }
        if (typeof window.nav === 'function') window.nav(id);
      });
    });
    container.querySelectorAll('[data-fd-action="import-employees"]').forEach(function (btn) {
      if (btn.dataset.fdBound === '1') return;
      btn.dataset.fdBound = '1';
      btn.addEventListener('click', function () {
        if (typeof window.openEmployeeImportModal === 'function') {
          window.openEmployeeImportModal();
          return;
        }
        if (typeof window.nav === 'function') window.nav('leads');
      });
    });
    container.querySelectorAll('[data-fd-action="new-template"]').forEach(function (btn) {
      if (btn.dataset.fdBound === '1') return;
      btn.dataset.fdBound = '1';
      btn.addEventListener('click', function () {
        if (typeof window.nav === 'function') window.nav('templates');
        if (typeof window.openTemplateModal === 'function') {
          setTimeout(function () { window.openTemplateModal(); }, 120);
        }
      });
    });
    container.querySelectorAll('[data-fd-action="setup-brand"]').forEach(function (btn) {
      if (btn.dataset.fdBound === '1') return;
      btn.dataset.fdBound = '1';
      btn.addEventListener('click', function () {
        openBrandSetupWizard();
      });
    });
    container.querySelectorAll('[data-fd-action="tenant-wizard"]').forEach(function (btn) {
      if (btn.dataset.fdBound === '1') return;
      btn.dataset.fdBound = '1';
      btn.addEventListener('click', function () {
        if (typeof window.fdOpenTenantWizard === 'function') {
          window.fdOpenTenantWizard();
          return;
        }
        if (typeof window.nav === 'function') window.nav('users');
      });
    });
  }

  function openBrandSetupWizard() {
    if (typeof window.nav === 'function') window.nav('welcome');
    setTimeout(function () {
      var root = document.getElementById('fdHomeRoot');
      var target = root ? root.querySelector('.fd-home-onboarding') : null;
      if (!target) {
        if (typeof fdLoadHome === 'function') fdLoadHome();
        return;
      }
      target.classList.add('fd-home-onboarding--focus');
      target.scrollIntoView({ block: 'start', behavior: 'smooth' });
      setTimeout(function () {
        target.classList.remove('fd-home-onboarding--focus');
      }, 1100);
    }, 80);
  }

  function onboardingSteps() {
    return [
      {
        id: 'identity',
        label: 'Dati azienda',
        desc: 'Nome, slug, contatti HR e DPO',
        section: 'brand-identity',
        done: function (ctx) { return !!ctx.hasBrandIdentity; }
      },
      {
        id: 'template',
        label: 'Template pass dipendente',
        desc: 'Logo, strip e testi del pass Wallet',
        section: 'templates',
        done: function (ctx) { return ctx.templateCount > 0; }
      },
      {
        id: 'employees',
        label: 'Dipendenti',
        desc: 'Importa o aggiungi anagrafica',
        section: 'leads',
        done: function (ctx) { return ctx.employeeCount > 0; }
      },
      {
        id: 'push',
        label: 'Prima notifica push',
        desc: 'Comunica con chi ha il pass in Wallet',
        section: 'push',
        done: function (ctx) { return ctx.pushCount > 0; }
      },
      {
        id: 'install',
        label: 'Pass installati in Wallet',
        desc: 'Almeno un dipendente con pass attivo su dispositivo',
        section: 'passes',
        done: function (ctx) { return ctx.walletInstalls > 0; }
      }
    ];
  }

  function renderOnboarding(ctx, options) {
    var opts = options || {};
    var progress = getOnboardingProgress(ctx);
    var steps = progress.steps;
    var doneCount = progress.doneCount;
    var items = steps.map(function (step) {
      var done = step.done(ctx);
      return (
        '<li class="fd-onboarding-item' + (done ? ' fd-onboarding-item--done' : '') + '">' +
        '<span class="fd-onboarding-item__check" aria-hidden="true">' + (done ? '✓' : '') + '</span>' +
        '<div class="fd-onboarding-item__body">' +
        '<div class="fd-onboarding-item__label">' + esc(step.label) + '</div>' +
        '<div class="fd-onboarding-item__desc">' + esc(step.desc) + '</div>' +
        '</div>' +
        (done ? '' : '<button type="button" class="fd-onboarding-item__action" data-fd-nav="' + esc(step.section) + '">Vai →</button>') +
        '</li>'
      );
    }).join('');
    var compactClass = opts.compact ? ' fd-home-card--compact' : ' fd-home-card--primary';
    var title = opts.compact ? 'Setup brand' : 'Setup brand';
    var intro = opts.compact
      ? 'Checklist completata. Puoi riaprire ogni area quando devi aggiornare il cliente.'
      : 'Completa questi passaggi per rendere il brand pienamente operativo.';
    return (
      '<div class="fd-card fd-home-card fd-home-onboarding' + compactClass + '">' +
      '<h2 class="fd-home-card__title">' + esc(title) + '</h2>' +
      '<p class="fd-home-progress" aria-live="polite">' + doneCount + ' di ' + steps.length + ' completati</p>' +
      '<p class="fd-home-card__intro">' + esc(intro) + '</p>' +
      '<ul class="fd-onboarding-list' + (opts.compact ? ' fd-onboarding-list--compact' : '') + '">' + items + '</ul>' +
      '</div>'
    );
  }

  function renderKpiGrid(ctx, compact) {
    var gridClass = 'fd-stat-grid fd-home-kpi-grid' + (compact ? ' fd-home-kpi-grid--compact' : ' fd-home-kpi-grid--primary');
    // KPI HR-first: la metrica che conta per un manager è quanti dipendenti
    // hanno DAVVERO il pass nel wallet, non i numeri assoluti della piattaforma.
    var employees = Number(ctx.employeeCount) || 0;
    var installed = Math.min(Number(ctx.walletInstalls) || 0, employees || (Number(ctx.walletInstalls) || 0));
    var adoptionPct = employees > 0 ? Math.round((installed / employees) * 100) : null;
    var withoutPass = Math.max(0, employees - (Number(ctx.employeesWithPass) || 0));
    var adoptionHint = employees > 0
      ? esc(installed) + ' su ' + esc(employees) + ' dipendenti · Apple ' + esc(ctx.apple) + ' · Google ' + esc(ctx.google) +
        (ctx.samsung ? ' · Samsung ' + esc(ctx.samsung) : '')
      : 'Importa i dipendenti per misurare l\u2019adozione';
    return (
      '<div class="' + gridClass + '">' +
      '<div class="fd-stat-card">' +
      '<span class="fd-stat-card__label">Adozione Wallet</span>' +
      '<span class="fd-stat-card__value">' + (adoptionPct == null ? '\u2014' : esc(adoptionPct) + '%') + '</span>' +
      '<span class="fd-stat-card__hint">' + adoptionHint + '</span>' +
      '</div>' +
      '<div class="fd-stat-card">' +
      '<span class="fd-stat-card__label">Dipendenti</span>' +
      '<span class="fd-stat-card__value">' + esc(ctx.employeeCount) + '</span>' +
      '<span class="fd-stat-card__hint">Con pass: ' + esc(ctx.employeesWithPass) +
      (withoutPass > 0 ? ' · <strong>Da attivare: ' + esc(withoutPass) + '</strong>' : ' · Tutti attivi \u2713') + '</span>' +
      '</div>' +
      '<div class="fd-stat-card">' +
      '<span class="fd-stat-card__label">Pass totali</span>' +
      '<span class="fd-stat-card__value">' + esc(ctx.totalPasses) + '</span>' +
      '</div>' +
      '<div class="fd-stat-card">' +
      '<span class="fd-stat-card__label">Push inviate</span>' +
      '<span class="fd-stat-card__value">' + esc(ctx.pushCount) + '</span>' +
      '<span class="fd-stat-card__hint">Template: ' + esc(ctx.templateCount) + '</span>' +
      '</div>' +
      '</div>'
    );
  }

  function renderShortcuts() {
    return (
      '<div class="fd-card fd-home-shortcuts">' +
      '<h2 class="fd-home-card__title">Azioni frequenti</h2>' +
      '<div class="fd-home-shortcuts__actions">' +
      '<button type="button" class="btn sec" data-fd-action="setup-brand">Setup brand</button>' +
      '<button type="button" class="btn sec" data-fd-action="new-template">+ Nuovo template</button>' +
      '<button type="button" class="btn" data-fd-nav="push">Invia push</button>' +
      '<button type="button" class="btn sec" data-fd-action="import-employees">Importa dipendenti</button>' +
      '</div></div>'
    );
  }

  function renderPrimaryAction(progress, brandName) {
    var step = progress.nextStep;
    if (!step) {
      return (
        '<div class="fd-home-primary fd-home-primary--done">' +
        '<p class="fd-home-primary__label">Stato brand</p>' +
        '<h3 class="fd-home-primary__title">Configurazione completata</h3>' +
        '<p class="fd-home-primary__desc">' + esc(brandName) + ' è operativo. Monitora KPI e invia comunicazioni ai dipendenti.</p>' +
        '<button type="button" class="btn" data-fd-nav="push">Invia una push</button>' +
        '</div>'
      );
    }
    return (
      '<div class="fd-home-primary">' +
      '<p class="fd-home-primary__label">Prossimo passo</p>' +
      '<h3 class="fd-home-primary__title">' + esc(step.label) + '</h3>' +
      '<p class="fd-home-primary__desc">' + esc(step.desc) + '</p>' +
      '<button type="button" class="btn" data-fd-nav="' + esc(step.section) + '">Continua setup →</button>' +
      '</div>'
    );
  }

  function formatEventType(type) {
    if (!type) return 'Evento';
    return EVENT_LABELS[type] || type.replace(/_/g, ' ');
  }

  function renderActivity(events) {
    if (!events.length) {
      return (
        '<div class="fd-card fd-home-card">' +
        '<h2 class="fd-home-card__title">Ultime attività</h2>' +
        '<div class="fd-empty-state">' +
        '<p class="fd-empty-state__title">Nessuna attività recente</p>' +
        '<p class="fd-empty-state__desc">Gli eventi su pass, installazioni Wallet e notifiche compariranno qui.</p>' +
        '<div class="fd-empty-state__actions">' +
        '<button type="button" class="btn fd-btn-ghost" data-fd-nav="activity-log">Apri log completo</button>' +
        '</div></div></div>'
      );
    }
    var list = events.slice(0, 5).map(function (ev) {
      var when = ev.created_at ? new Date(ev.created_at).toLocaleString('it-IT') : '—';
      var meta = '';
      if (ev.metadata && typeof ev.metadata === 'object') {
        try { meta = JSON.stringify(ev.metadata); } catch (_) { meta = ''; }
      } else if (ev.metadata) meta = String(ev.metadata);
      if (meta.length > 120) meta = meta.slice(0, 117) + '…';
      return (
        '<li class="fd-home-activity-item">' +
        '<time datetime="' + esc(ev.created_at || '') + '">' + esc(when) + '</time>' +
        '<span class="fd-act-type">' + esc(formatEventType(ev.event_type)) + '</span>' +
        '<span class="fd-act-meta">' + esc(meta || '—') + '</span>' +
        '</li>'
      );
    }).join('');
    return (
      '<div class="fd-card fd-home-card">' +
      '<h2 class="fd-home-card__title">Ultime attività</h2>' +
      '<ul class="fd-home-activity-list">' + list + '</ul>' +
      '<button type="button" class="btn fd-btn-ghost" style="margin-top:12px" data-fd-nav="activity-log">Vedi tutto</button>' +
      '</div>'
    );
  }

  function renderPageHeader(title, lead, badgeHtml) {
    return (
      '<header class="fd-page-header fd-home-page-header">' +
      '<div class="fd-page-header__copy">' +
      '<h1 class="fd-page-header__title">' + esc(title) + '</h1>' +
      (lead ? '<p class="fd-page-header__lead">' + esc(lead) + '</p>' : '') +
      '</div>' +
      (badgeHtml || '') +
      '</header>'
    );
  }

  function renderBrandHome(root, data) {
    var brandName = getBrandName() || 'Brand';
    var ctx = buildHomeContext(data);
    var progress = getOnboardingProgress(ctx);
    var welcome = document.getElementById('welcome');
    var isOperational = progress.isOperational;

    setHomeState(welcome, isOperational ? 'operational' : 'setup');

    if (isOperational) {
      root.innerHTML =
        renderPageHeader(
          brandName,
          'Panoramica operativa: KPI, attività recenti e collegamenti rapidi.',
          '<span class="fd-badge fd-badge--success fd-home-status">Operativo</span>'
        ) +
        renderPrimaryAction(progress, brandName) +
        renderKpiGrid(ctx, false) +
        renderShortcuts() +
        '<div class="fd-home-grid-2 fd-home-grid-2--operational">' +
        renderOnboarding(ctx, { compact: true }) +
        renderActivity(data.events || []) +
        '</div>';
    } else {
      root.innerHTML =
        renderPageHeader(
          brandName,
          'Completa il setup guidato per attivare pass Wallet e comunicazioni HR.',
          '<span class="fd-badge fd-badge--warning fd-home-status">' + esc(progress.doneCount) + '/' + esc(progress.total) + ' setup</span>'
        ) +
        renderPrimaryAction(progress, brandName) +
        renderKpiGrid(ctx, true) +
        '<div class="fd-home-layout-setup">' +
        renderOnboarding(ctx, { compact: false }) +
        '<aside class="fd-home-aside">' +
        renderActivity(data.events || []) +
        '</aside>' +
        '</div>' +
        renderShortcuts();
    }

    bindNavButtons(root);
  }

  function brandHasIdentity(brand) {
    if (!brand) return false;
    var c = brand.config || {};
    var logos = c.logos || {};
    if (logos.logo || logos.wallet_icon || brand.logo_url) return true;
    if (brand.name && brand.slug) return true;
    return false;
  }

  async function loadHomeData(bid) {
    var api = getApiBase();
    var h = authHeaders();
    var results = await Promise.all([
      fetchJson(api + '/analytics/' + bid).catch(function () { return {}; }),
      (typeof window.fetchBrandById === 'function'
        ? window.fetchBrandById(bid)
        : fetchJson(api + '/brands/' + bid)).catch(function () { return null; }),
      fetchJson(api + '/templates?brand_id=' + encodeURIComponent(bid)).catch(function () { return []; }),
      fetchJson(api + '/brands/' + bid + '/employees').catch(function () { return { employees: [], total_employees: 0, with_pass: 0 }; }),
      fetchJson(api + '/push/history?brand_id=' + encodeURIComponent(bid)).catch(function () { return []; }),
      fetchJson(api + '/events/' + bid + '?limit=8').catch(function () { return []; })
    ]);
    var analytics = results[0] || {};
    var brand = results[1];
    var templates = Array.isArray(results[2]) ? results[2] : [];
    var empPayload = results[3] || {};
    var employees = empPayload.employees || [];
    var pushes = Array.isArray(results[4]) ? results[4] : [];
    var events = Array.isArray(results[5]) ? results[5] : [];

    return {
      analytics: analytics,
      hasBrandIdentity: brandHasIdentity(brand),
      templateCount: templates.length,
      employeeCount: empPayload.total_employees != null ? empPayload.total_employees : employees.length,
      employeesWithPass: empPayload.with_pass != null ? empPayload.with_pass : employees.filter(function (e) { return e.pass_id; }).length,
      pushCount: pushes.length,
      events: events,
      walletInstalls: (analytics.appleDeviceCount || analytics.deviceCount || 0) +
        (analytics.googleWalletSavedCount || 0) +
        (analytics.samsungWalletSavedCount || 0)
    };
  }

  var homeLoadInflight = null;

  async function fdLoadHome() {
    if (!isFiloHomeApp()) return;
    if (homeLoadInflight) return homeLoadInflight;

    homeLoadInflight = (async function () {
      var welcome = document.getElementById('welcome');
      var root = ensureMount();
      if (!root) return;

      var bid = getBrandId();
      if (!bid) {
        renderNoBrand(root);
        return;
      }

      renderLoading(root);
      try {
        var data = await loadHomeData(bid);
        renderBrandHome(root, data);
      } catch (e) {
        setHomeState(welcome, 'error');
        root.innerHTML =
          typeof window.fdRenderErrorState === 'function'
            ? window.fdRenderErrorState(e.message || 'Caricamento fallito', {
                title: 'Errore caricamento home',
                retryId: 'fdHomeRetryBtn'
              })
            : '<div class="fd-error-state" role="alert"><p class="fd-error-state__desc">Errore caricamento home: ' +
              esc(e.message) +
              '</p><button type="button" class="btn sec" id="fdHomeRetryBtn">Riprova</button></div>';
        var retry = document.getElementById('fdHomeRetryBtn');
        if (retry && retry.dataset.fdBound !== '1') {
          retry.dataset.fdBound = '1';
          retry.addEventListener('click', function () { fdLoadHome(); });
        }
      }
    })().finally(function () {
      homeLoadInflight = null;
    });

    return homeLoadInflight;
  }

  window.fdLoadHome = fdLoadHome;
  window.fdOpenBrandSetupWizard = openBrandSetupWizard;
  window.isFiloOperationalHome = isFiloHomeApp;
  window.fdIsFiloOperationalHome = isFiloHomeApp;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (isFiloHomeApp() && document.getElementById('welcome') && document.getElementById('welcome').classList.contains('active')) {
        fdLoadHome();
      }
    });
  }
})();

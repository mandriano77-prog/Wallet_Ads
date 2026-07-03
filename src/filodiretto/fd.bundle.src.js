/* === fd-buttons.js === */
/**
 * FD-11 — FdButton helper: variant (primary|secondary|ghost), tone (neutral|danger|success), size, loading.
 */
(function () {
  'use strict';

  function isFiloApp() {
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  /**
   * @param {{ variant?: string, tone?: string, size?: string, loading?: boolean }} opts
   * @returns {string}
   */
  function className(opts) {
    opts = opts || {};
    var classes = ['btn'];
    var variant = String(opts.variant || 'primary').toLowerCase();

    if (variant === 'secondary') {
      classes.push('sec');
    } else if (variant === 'ghost') {
      classes.push('fd-btn-ghost');
    }

    var tone = String(opts.tone || 'neutral').toLowerCase();
    if (tone === 'danger') classes.push('danger');
    if (tone === 'success') classes.push('fd-btn--success');

    var size = String(opts.size || 'md').toLowerCase();
    if (size === 'sm' || size === 'small') classes.push('small');

    if (opts.loading) classes.push('is-loading');

    return classes.join(' ');
  }

  /**
   * @param {{
   *   variant?: string,
   *   tone?: string,
   *   size?: string,
   *   label?: string,
   *   html?: string,
   *   type?: string,
   *   id?: string,
   *   className?: string,
   *   disabled?: boolean,
   *   loading?: boolean,
   *   onclick?: function,
   *   attributes?: Record<string, string>
   * }} opts
   * @returns {HTMLButtonElement}
   */
  function render(opts) {
    opts = opts || {};
    var btn = document.createElement('button');
    btn.type = opts.type || 'button';
    var extra = opts.className ? String(opts.className).trim() : '';
    btn.className = (className(opts) + (extra ? ' ' + extra : '')).trim();

    if (opts.id) btn.id = opts.id;
    if (opts.label) btn.textContent = opts.label;
    if (opts.html) btn.innerHTML = opts.html;

    var disabled = !!(opts.disabled || opts.loading);
    btn.disabled = disabled;
    if (opts.loading) {
      btn.setAttribute('aria-busy', 'true');
    }

    if (opts.attributes && typeof opts.attributes === 'object') {
      Object.keys(opts.attributes).forEach(function (key) {
        if (opts.attributes[key] != null) btn.setAttribute(key, String(opts.attributes[key]));
      });
    }

    if (typeof opts.onclick === 'function') {
      btn.addEventListener('click', opts.onclick);
    }

    return btn;
  }

  /**
   * @param {HTMLButtonElement} btn
   * @param {boolean} loading
   */
  function setLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.classList.add('is-loading');
      btn.setAttribute('aria-busy', 'true');
      btn.disabled = true;
    } else {
      btn.classList.remove('is-loading');
      btn.removeAttribute('aria-busy');
      btn.disabled = false;
    }
  }

  window.FdButton = {
    className: className,
    render: render,
    setLoading: setLoading,
    isFiloApp: isFiloApp
  };
})();


/* === fd-header.js === */
/**
 * FD-01 — FiloDiretto header chrome (logo home, account tooltip). No-op on ads2wallet.
 */
(function () {
  'use strict';

  function isFiloApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-shell') === 'light';
  }

  function fdGoHome() {
    if (typeof nav === 'function') {
      try {
        nav('welcome');
      } catch (_) {}
    }
    try {
      const target = '/dashboard/home';
      const path = window.location.pathname.replace(/\/$/, '');
      if (path !== target) {
        history.pushState({ fdHome: true }, '', target);
      }
    } catch (_) {}
  }

  function fdSyncHomeFromPath() {
    const path = window.location.pathname.replace(/\/$/, '');
    if (!path.endsWith('/dashboard/home')) return;
    if (typeof nav !== 'function') return;
    const welcome = document.getElementById('welcome');
    if (welcome && welcome.classList.contains('active')) return;
    try {
      nav('welcome');
    } catch (_) {}
  }

  function fdEnhanceLogo() {
    const logo = document.querySelector('.sidebar .logo');
    if (!logo || logo.querySelector('.fd-logo-link')) return;
    const link = document.createElement('a');
    link.href = '/dashboard/home';
    link.className = 'fd-logo-link';
    link.setAttribute('aria-label', 'FiloDiretto — Home');
    while (logo.firstChild) {
      link.appendChild(logo.firstChild);
    }
    logo.appendChild(link);
    link.addEventListener('click', (e) => {
      e.preventDefault();
      fdGoHome();
    });
  }

  function fdEnhanceBreadcrumbProduct() {
    const brandEl = document.getElementById('breadcrumbBrand');
    if (!brandEl || brandEl.dataset.fdHomeBound === '1') return;
    const productTitle = (brandEl.textContent || '').trim();
    const appTitle = (function () {
      try {
        return (window.__2WALLET_PRODUCT_TITLE__ || '').trim();
      } catch (_) {
        return '';
      }
    })();
    const isProductCrumb = !window.brandId && (
      productTitle === 'Filo Diretto'
      || productTitle === 'FiloDiretto'
      || (appTitle && productTitle === appTitle)
    );
    if (!isProductCrumb) return;
    brandEl.dataset.fdHomeBound = '1';
    brandEl.classList.add('fd-breadcrumb-home');
    brandEl.setAttribute('role', 'link');
    brandEl.setAttribute('tabindex', '0');
    brandEl.setAttribute('title', 'Vai alla home');
    const go = (e) => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      if (e.type === 'keydown') e.preventDefault();
      fdGoHome();
    };
    brandEl.addEventListener('click', go);
    brandEl.addEventListener('keydown', go);
  }

  function fdEnhanceUserMenu() {
    const trigger = document.getElementById('userMenuTrigger');
    if (!trigger || trigger.dataset.fdEnhanced === '1') return;
    trigger.dataset.fdEnhanced = '1';
    trigger.setAttribute('data-fd-tooltip', 'Account');
    trigger.setAttribute('title', 'Account');
    trigger.setAttribute('aria-label', 'Menu account');
    if (!trigger.querySelector('.user-menu-chevron')) {
      const chevron = document.createElement('span');
      chevron.className = 'user-menu-chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '▾';
      trigger.appendChild(chevron);
    }
  }

  function initFdHeader() {
    if (!isFiloApp()) return;
    document.documentElement.setAttribute('data-app', 'filodiretto');
    fdEnhanceLogo();
    fdEnhanceUserMenu();
    fdEnhanceBreadcrumbProduct();
    fdSyncHomeFromPath();
    window.addEventListener('popstate', fdSyncHomeFromPath);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdHeader);
  } else {
    initFdHeader();
  }

  const origSyncBreadcrumb = window.syncBreadcrumb;
  if (typeof origSyncBreadcrumb === 'function' && !window.__fdBreadcrumbPatched) {
    window.__fdBreadcrumbPatched = true;
    window.syncBreadcrumb = function (sectionId, tab) {
      origSyncBreadcrumb(sectionId, tab);
      fdEnhanceBreadcrumbProduct();
    };
  }
})();


/* === fd-layout.js === */
/**
 * Filo HR — sidebar open/close (desktop collapse + mobile sheet) + floating dropdown positioning.
 */
(function () {
  'use strict';

  var STORAGE_COLLAPSED = 'fd:sidebar:collapsed';
  var BP_CLASSES = [
    'fd-bp-desktop',
    'fd-bp-tablet-landscape',
    'fd-bp-tablet-portrait',
    'fd-bp-mobile'
  ];
  var mobileFocusRestore = null;
  var mobileFocusTrapBound = false;
  var tooltipNode = null;
  var tooltipTarget = null;
  var tooltipBound = false;

  function isFilo() {
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function isDesktop() {
    return window.matchMedia('(min-width: 768px)').matches;
  }

  /** Syncs fd-bp-* classes on <html> for layout CSS (FASE 2). */
  function syncBreakpointClasses() {
    if (!isFilo()) return;
    var root = document.documentElement;
    BP_CLASSES.forEach(function (name) {
      root.classList.remove(name);
    });
    if (window.matchMedia('(min-width: 1280px)').matches) {
      root.classList.add('fd-bp-desktop');
    } else if (window.matchMedia('(min-width: 1024px)').matches) {
      root.classList.add('fd-bp-tablet-landscape');
    } else if (window.matchMedia('(min-width: 768px)').matches) {
      root.classList.add('fd-bp-tablet-portrait');
    } else {
      root.classList.add('fd-bp-mobile');
    }
  }

  function isSidebarCollapsed() {
    return document.body.classList.contains('fd-sidebar-collapsed');
  }

  function ensureNavTooltip() {
    if (tooltipNode) return tooltipNode;
    tooltipNode = document.createElement('div');
    tooltipNode.id = 'fdSidebarTooltip';
    tooltipNode.className = 'fd-sidebar-tooltip';
    tooltipNode.setAttribute('role', 'tooltip');
    tooltipNode.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltipNode);
    return tooltipNode;
  }

  function hideNavTooltip() {
    if (!tooltipNode) return;
    tooltipNode.classList.remove('is-visible');
    tooltipNode.setAttribute('aria-hidden', 'true');
    tooltipNode.textContent = '';
    tooltipTarget = null;
  }

  function showNavTooltip(target) {
    if (!isFilo() || !isDesktop() || !isSidebarCollapsed()) {
      hideNavTooltip();
      return;
    }
    var label =
      target.getAttribute('data-fd-tooltip') ||
      target.getAttribute('data-a2w-tooltip-label') ||
      String(target.getAttribute('aria-label') || '').trim();
    if (!label) return;
    var node = ensureNavTooltip();
    tooltipTarget = target;
    node.textContent = label;
    node.setAttribute('aria-hidden', 'false');
    var rect = target.getBoundingClientRect();
    node.style.top = Math.round(rect.top + rect.height / 2 - node.offsetHeight / 2) + 'px';
    node.style.left = Math.round(rect.right + 10) + 'px';
    node.classList.add('is-visible');
  }

  function bindCollapsedNavTooltips() {
    if (tooltipBound) return;
    tooltipBound = true;
    document.addEventListener(
      'mouseover',
      function (e) {
        var target = e.target.closest('.sidebar .nav-item');
        if (!target) return;
        showNavTooltip(target);
      },
      true
    );
    document.addEventListener(
      'mouseout',
      function (e) {
        var target = e.target.closest('.sidebar .nav-item');
        if (!target) return;
        var related = e.relatedTarget;
        if (related && target.contains(related)) return;
        hideNavTooltip();
      },
      true
    );
    document.addEventListener('focusin', function (e) {
      var target = e.target.closest('.sidebar .nav-item');
      if (target) showNavTooltip(target);
    });
    document.addEventListener('focusout', function (e) {
      var target = e.target.closest('.sidebar .nav-item');
      if (!target) return;
      requestAnimationFrame(function () {
        var active = document.activeElement;
        if (active && active.closest && active.closest('.sidebar .nav-item') === target) return;
        hideNavTooltip();
      });
    });
    document.addEventListener('scroll', hideNavTooltip, true);
    window.addEventListener('resize', hideNavTooltip);
  }

  function positionFloatingMenu(trigger, panel) {
    if (!trigger || !panel) return;
    var collisionPadding = 16;
    var gap = 6;
    panel.classList.add('fd-floating-menu-panel');
    panel.hidden = false;
    panel.style.transform = 'none';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';

    var rect = trigger.getBoundingClientRect();
    var width = panel.offsetWidth || 168;
    var height = panel.offsetHeight || 120;

    var contentMain = document.querySelector('.main-content, .content-area, main');
    var contentLeft = contentMain ? contentMain.getBoundingClientRect().left : 0;
    if (contentLeft < 64) contentLeft = 240;

    var top = rect.bottom + gap;
    var left = rect.left;
    var maxLeft = window.innerWidth - width - collisionPadding;

    if (left + width > window.innerWidth - collisionPadding) {
      left = rect.right - width;
    }
    left = Math.max(contentLeft + collisionPadding, left);
    left = Math.min(left, Math.max(collisionPadding, maxLeft));

    var maxTop = window.innerHeight - height - collisionPadding;
    if (top > maxTop) {
      top = Math.max(collisionPadding, rect.top - height - gap);
    }

    panel.style.position = 'fixed';
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
    panel.style.zIndex = '9200';
  }

  function initSidebarToggle() {
    if (!isFilo()) return;
    var toggle = document.getElementById('sidebarToggle');
    var backdrop = document.getElementById('sidebarBackdrop');
    if (!toggle || toggle.dataset.fdLayoutBound === '1') return;
    toggle.dataset.fdLayoutBound = '1';
    var sidebarBtn = null;

    function ensureSidebarCollapseButton() {
      var footer = document.querySelector('.sidebar .sidebar-footer');
      if (!footer) return null;
      var btn = document.getElementById('fdSidebarCollapseBtn');
      if (btn) return btn;
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'fdSidebarCollapseBtn';
      btn.className = 'fd-sidebar-collapse-btn';
      btn.textContent = 'Comprimi menu';
      btn.setAttribute('aria-expanded', 'true');
      footer.appendChild(btn);
      return btn;
    }

    function applyDesktop(collapsed) {
      document.body.classList.toggle('fd-sidebar-collapsed', collapsed);
      document.body.classList.remove('sidebar-open');
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      toggle.setAttribute('aria-label', collapsed ? 'Espandi menu laterale' : 'Comprimi menu laterale');
      if (sidebarBtn) {
        sidebarBtn.textContent = collapsed ? 'Espandi menu' : 'Comprimi menu';
        sidebarBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        sidebarBtn.setAttribute('aria-label', sidebarBtn.textContent);
      }
      if (!collapsed) hideNavTooltip();
    }

    function sidebarFocusables() {
      var sidebar = document.querySelector('.sidebar');
      if (!sidebar) return [];
      return Array.prototype.slice
        .call(
          sidebar.querySelectorAll(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), .nav-item'
          )
        )
        .filter(function (el) {
          return !el.hidden && el.getAttribute('aria-hidden') !== 'true';
        });
    }

    function trapMobileFocus(e) {
      if (!document.body.classList.contains('sidebar-open') || isDesktop()) return;
      if (e.key !== 'Tab') return;
      var nodes = sidebarFocusables();
      if (nodes.length < 2) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    function bindMobileFocusTrap() {
      if (mobileFocusTrapBound) return;
      mobileFocusTrapBound = true;
      document.addEventListener('keydown', trapMobileFocus);
    }

    function unbindMobileFocusTrap() {
      if (!mobileFocusTrapBound) return;
      mobileFocusTrapBound = false;
      document.removeEventListener('keydown', trapMobileFocus);
    }

    function applyMobile(open) {
      document.body.classList.toggle('sidebar-open', open);
      document.body.classList.remove('fd-sidebar-collapsed');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Chiudi menu laterale' : 'Apri menu laterale');
      if (open) {
        mobileFocusRestore = document.activeElement;
        bindMobileFocusTrap();
        requestAnimationFrame(function () {
          var nodes = sidebarFocusables();
          if (nodes.length) nodes[0].focus();
          else toggle.focus();
        });
      } else {
        unbindMobileFocusTrap();
        var restore = mobileFocusRestore;
        mobileFocusRestore = null;
        requestAnimationFrame(function () {
          if (restore && typeof restore.focus === 'function') restore.focus();
          else toggle.focus();
        });
      }
      hideNavTooltip();
    }

    try {
      if (isDesktop() && localStorage.getItem(STORAGE_COLLAPSED) === '1') {
        applyDesktop(true);
      }
    } catch (_) {}

    toggle.addEventListener('click', function () {
      if (isDesktop()) {
        var next = !document.body.classList.contains('fd-sidebar-collapsed');
        applyDesktop(next);
        try {
          localStorage.setItem(STORAGE_COLLAPSED, next ? '1' : '0');
        } catch (_) {}
        return;
      }
      applyMobile(!document.body.classList.contains('sidebar-open'));
    });

    sidebarBtn = ensureSidebarCollapseButton();
    if (sidebarBtn) {
      sidebarBtn.addEventListener('click', function () {
        if (!isDesktop()) return;
        var next = !document.body.classList.contains('fd-sidebar-collapsed');
        applyDesktop(next);
        try {
          localStorage.setItem(STORAGE_COLLAPSED, next ? '1' : '0');
        } catch (_) {}
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', function () {
        if (!isDesktop()) applyMobile(false);
      });
    }

    document.querySelectorAll('.sidebar .nav-item').forEach(function (el) {
      el.addEventListener('click', function () {
        if (!isDesktop()) applyMobile(false);
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.modal.active, .a2w-modal--open, dialog[open]')) return;
      if (document.body.classList.contains('modal-open')) return;
      if (!isDesktop()) applyMobile(false);
    });

    window.addEventListener('resize', function () {
      syncBreakpointClasses();
      if (isDesktop()) {
        document.body.classList.remove('sidebar-open');
        try {
          applyDesktop(localStorage.getItem(STORAGE_COLLAPSED) === '1');
        } catch (_) {
          applyDesktop(false);
        }
      } else {
        document.body.classList.remove('fd-sidebar-collapsed');
        hideNavTooltip();
      }
    });
  }

  function boot() {
    if (!isFilo()) return;
    syncBreakpointClasses();
    bindCollapsedNavTooltips();
    initSidebarToggle();
  }

  window.fdSyncBreakpointClasses = syncBreakpointClasses;

  window.fdPositionFloatingMenu = positionFloatingMenu;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();


/* === fd-mobile-gate.js === */
/**
 * FD-DS FASE 6 — Block dashboard use on smartphone viewports (<768px).
 */
(function () {
  'use strict';

  var MQ = '(max-width: 767px)';
  var overlay = null;

  function isFiloApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'fdMobileGate';
    overlay.className = 'fd-mobile-gate';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'fdMobileGateTitle');
    overlay.innerHTML =
      '<div class="fd-mobile-gate__panel">' +
      '<div class="fd-mobile-gate__icon" aria-hidden="true">📱</div>' +
      '<h2 class="fd-mobile-gate__title" id="fdMobileGateTitle">Schermo troppo piccolo</h2>' +
      '<p class="fd-mobile-gate__desc">Il backoffice FiloDiretto è ottimizzato per tablet e desktop. ' +
      'Ruota il dispositivo o apri la dashboard da un browser con larghezza almeno 768px.</p>' +
      '<p class="fd-mobile-gate__hint">Da 768px in su restano disponibili layout tablet e tabelle responsive.</p>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function syncMobileGate() {
    if (!isFiloApp()) return;
    var gated = window.matchMedia(MQ).matches;
    document.documentElement.classList.toggle('fd-mobile-gated', gated);
    var node = ensureOverlay();
    node.hidden = !gated;
  }

  function initFdMobileGate() {
    if (!isFiloApp()) return;
    syncMobileGate();
    window.addEventListener('resize', syncMobileGate);
    if (typeof window.matchMedia === 'function') {
      var mq = window.matchMedia(MQ);
      if (typeof mq.addEventListener === 'function') mq.addEventListener('change', syncMobileGate);
      else if (typeof mq.addListener === 'function') mq.addListener(syncMobileGate);
    }
  }

  window.fdSyncMobileGate = syncMobileGate;
  window.fdInitMobileGate = initFdMobileGate;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdMobileGate);
  } else {
    initFdMobileGate();
  }
})();


/* === fd-wai.js === */
/**
 * FD — W.AI: single entry pattern for FiloDiretto (FAB + contextual link only).
 * No-op on Ads2Wallet / non-Filo shells.
 *
 * Sprint 4 HUB Convenzioni — future intents (not wired yet):
 * - hub_import_merchants: guide CSV import from conventions section
 * - hub_merchant_stats: summarize top merchants from hub-analytics
 */
(function () {
  'use strict';

  /** Bottom-sheet layout retired — panel is always the floating card on the right. */
  var CRITICAL_SECTIONS = [];
  var lastActiveSection = '';
  var patchRetryTimer = null;
  var patchRetryCount = 0;
  var PATCH_RETRY_MAX = 120;

  function isFiloWai() {
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    if (document.documentElement.getAttribute('data-app') === 'filodiretto') return true;
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    return false;
  }

  function getActiveSectionId() {
    var el = document.querySelector('.section.active');
    return el ? el.id : '';
  }

  function isCriticalSection(id) {
    return CRITICAL_SECTIONS.indexOf(id || getActiveSectionId()) !== -1;
  }

  function isPanelOpen() {
    var el = document.getElementById('waiOverlay');
    if (!el) return false;
    return el.style.display === 'flex' || getComputedStyle(el).display === 'flex';
  }

  function syncWaiLayoutState() {
    if (!isFiloWai()) return;
    var critical = isCriticalSection();
    document.body.classList.toggle('fd-wai-critical-page', critical);
    document.body.classList.toggle('fd-wai-open', isPanelOpen());
    document.documentElement.classList.toggle('fd-wai-active', isPanelOpen());
  }

  function closeWaiPanel() {
    if (!isPanelOpen()) {
      syncWaiLayoutState();
      return;
    }
    if (typeof window.toggleWaiOverlay === 'function') {
      window.toggleWaiOverlay(false);
    } else {
      var el = document.getElementById('waiOverlay');
      if (el) el.style.display = 'none';
    }
    syncWaiLayoutState();
  }

  /** Home/quick-link CTAs use data-fd-nav (fd-home.js), not sidebar .nav-item onclick. */
  function resolveFdNavSectionId(el) {
    if (!el) return '';
    var fdNav = el.closest('[data-fd-nav]');
    if (fdNav) return fdNav.getAttribute('data-fd-nav') || '';
    var navItem = el.closest('.nav-item[data-section-id]');
    if (navItem) return navItem.getAttribute('data-section-id') || '';
    return '';
  }

  function navigateFdSection(sectionId) {
    if (!sectionId || typeof window.nav !== 'function') return;
    window.nav(sectionId);
  }

  /**
   * When W.AI is open on Home, closing the sheet removes content padding and shifts
   * layout before the click completes — sidebar nav still works. Navigate first, then close.
   */
  function handleFdNavWhileWaiOpen(trigger, e) {
    var sectionId = resolveFdNavSectionId(trigger);
    if (!sectionId) return false;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    navigateFdSection(sectionId);
    setTimeout(closeWaiPanel, 0);
    return true;
  }

  function onSectionChanged() {
    var id = getActiveSectionId();
    if (id && lastActiveSection && id !== lastActiveSection) {
      closeWaiPanel();
    }
    if (id) lastActiveSection = id;
    rationalizeAudienceCopy();
    syncWaiLayoutState();
  }

  function bindWaiTrigger(btn, handler) {
    if (!btn || btn.dataset.fdWaiBound === '1') return;
    btn.dataset.fdWaiBound = '1';
    btn.removeAttribute('onclick');
    btn.onclick = null;
    btn.addEventListener('click', handler);
  }

  function bindInlineWaiLinks(root) {
    if (!root) return;
    root.querySelectorAll('[data-fd-wai-open], .fd-wai-inline-link').forEach(function (btn) {
      bindWaiTrigger(btn, function (e) {
        e.preventDefault();
        var mode = btn.getAttribute('data-fd-wai-mode') || '';
        if (mode === 'audience' && typeof window.openWaiForAudience === 'function') {
          window.openWaiForAudience();
          syncWaiLayoutState();
          return;
        }
        if (typeof window.toggleWaiOverlay === 'function') window.toggleWaiOverlay(true);
        syncWaiLayoutState();
      });
    });
  }

  function rationalizeAudienceCopy() {
    var section = document.getElementById('audiences');
    if (!section) return;
    var intro = section.querySelector('.audiences-panel__intro, p');
    if (intro && !intro.querySelector('[data-fd-wai-open], [onclick*="openWaiForAudience"]')) {
      intro.innerHTML =
        'Segmentazione possessori pass, statistiche di apertura e clic sul retro, audience salvate. ' +
        'Per segmenti in linguaggio naturale usa l\'assistente ' +
        '<button type="button" class="fd-wai-inline-link" data-fd-wai-open data-fd-wai-mode="audience">W.AI</button>.';
    }
    bindInlineWaiLinks(section);
  }

  function patchToggleWaiOverlay() {
    if (window.__fdWaiTogglePatched || typeof window.toggleWaiOverlay !== 'function') return false;
    window.__fdWaiTogglePatched = true;
    var orig = window.toggleWaiOverlay;
    window.toggleWaiOverlay = function (forceOpen) {
      var res = orig.apply(this, arguments);
      syncWaiLayoutState();
      return res;
    };
    return true;
  }

  function patchNav() {
    if (window.__fdWaiNavPatched || typeof window.nav !== 'function') return false;
    window.__fdWaiNavPatched = true;
    var orig = window.nav;
    window.nav = function (id) {
      if (isPanelOpen()) closeWaiPanel();
      var out = orig.apply(this, arguments);
      var done = function () {
        onSectionChanged();
      };
      if (out && typeof out.then === 'function') return out.then(done);
      setTimeout(done, 0);
      return out;
    };
    return true;
  }

  function patchSyncWaiUi() {
    if (window.__fdWaiSyncPatched || typeof window.syncWaiUi !== 'function') return false;
    window.__fdWaiSyncPatched = true;
    var orig = window.syncWaiUi;
    window.syncWaiUi = function () {
      orig.apply(this, arguments);
      syncWaiLayoutState();
    };
    return true;
  }

  function ensureRuntimePatches() {
    var toggleOk = patchToggleWaiOverlay();
    var navOk = patchNav();
    patchSyncWaiUi();
    return toggleOk && navOk;
  }

  function schedulePatchRetry() {
    if (window.__fdWaiPatchesReady) return;
    if (ensureRuntimePatches()) {
      window.__fdWaiPatchesReady = true;
      if (patchRetryTimer) clearTimeout(patchRetryTimer);
      return;
    }
    patchRetryCount += 1;
    if (patchRetryCount >= PATCH_RETRY_MAX) return;
    patchRetryTimer = setTimeout(schedulePatchRetry, 50);
  }

  function observeActiveSection() {
    if (window.__fdWaiSectionObs) return;
    var root = document.querySelector('.content') || document.getElementById('mainLayout') || document.body;
    if (!root) return;
    window.__fdWaiSectionObs = true;
    var obs = new MutationObserver(function () {
      onSectionChanged();
    });
    obs.observe(root, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden']
    });
  }

  function bindNavClickClose() {
    if (window.__fdWaiNavClickBound) return;
    window.__fdWaiNavClickBound = true;
    document.addEventListener('click', function (e) {
      if (!isFiloWai() || !isPanelOpen()) return;
      var fdNav = e.target.closest('[data-fd-nav]');
      if (fdNav) {
        handleFdNavWhileWaiOpen(fdNav, e);
        return;
      }
      var navItem = e.target.closest('.nav-item[data-section-id]');
      if (navItem) {
        handleFdNavWhileWaiOpen(navItem, e);
        return;
      }
      var sectionJump = e.target.closest('[data-section-id]');
      if (sectionJump) {
        handleFdNavWhileWaiOpen(sectionJump, e);
      }
    }, true);
  }

  function bindWaiControls() {
    var fab = document.getElementById('waiBtn');
    if (!fab) return;
    bindWaiTrigger(fab, function (e) {
      if (typeof window.toggleWaiOverlay !== 'function') return;
      e.preventDefault();
      window.toggleWaiOverlay();
    });
  }

  function initFdWai() {
    if (!isFiloWai()) return;
    document.documentElement.classList.add('fd-wai-shell');
    lastActiveSection = getActiveSectionId();
    schedulePatchRetry();
    observeActiveSection();
    bindNavClickClose();
    bindWaiControls();
    rationalizeAudienceCopy();
    bindInlineWaiLinks(document);
    syncWaiLayoutState();
  }

  window.fdSyncWaiLayoutState = syncWaiLayoutState;
  window.fdCloseWaiPanel = closeWaiPanel;
  window.fdNavigateFromWai = handleFdNavWhileWaiOpen;
  window.fdBindWaiLinks = bindInlineWaiLinks;
  window.fdRationalizeAudienceCopy = rationalizeAudienceCopy;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdWai);
  } else {
    initFdWai();
  }

  window.addEventListener('load', function () {
    if (!isFiloWai()) return;
    schedulePatchRetry();
    bindWaiControls();
    bindInlineWaiLinks(document);
    syncWaiLayoutState();
  });
})();


/* === fd-brand-switcher.js === */
/**
 * FD-13 — FiloDiretto: breadcrumb without brand prefix; searchable brand switcher + recenti.
 */
(function () {
  'use strict';

  var RECENT_KEY = 'fd:recentBrandIds';
  var RECENT_MAX = 5;
  var SHOW_RECENT_MIN = 6;

  function isFiloSwitcherApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function readRecentIds() {
    try {
      var raw = localStorage.getItem(RECENT_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function writeRecentIds(ids) {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, RECENT_MAX)));
    } catch (_) {}
  }

  function trackRecentBrand(id) {
    if (!id) return;
    var sid = String(id);
    var list = readRecentIds().filter(function (x) {
      return x !== sid;
    });
    list.unshift(sid);
    writeRecentIds(list);
  }

  function getFilteredBrandOptions() {
    var sel = document.getElementById('brandSelector');
    if (!sel) return [];
    var out = [];
    for (var i = 0; i < sel.options.length; i++) {
      var opt = sel.options[i];
      if (!opt.value) continue;
      out.push({ id: opt.value, name: opt.textContent || opt.value });
    }
    return out;
  }

  function applyBreadcrumbNoBrand() {
    var brandEl = document.getElementById('breadcrumbBrand');
    if (!brandEl) return;
    var li = brandEl.closest('li');
    if (!li) return;
    var hide = !!window.brandId;
    li.hidden = hide;
    if (hide) li.setAttribute('aria-hidden', 'true');
    else li.removeAttribute('aria-hidden');
  }

  function patchSyncBreadcrumb() {
    if (window.__fdBrandCrumbPatched) return;
    if (typeof window.syncBreadcrumb !== 'function') return;
    window.__fdBrandCrumbPatched = true;
    var orig = window.syncBreadcrumb;
    window.syncBreadcrumb = function (sectionId) {
      orig(sectionId);
      applyBreadcrumbNoBrand();
    };
  }

  function patchPopulateBrandSelector() {
    if (window.__fdPopulateBrandPatched) return;
    if (typeof window.populateBrandSelector !== 'function') return;
    window.__fdPopulateBrandPatched = true;
    var orig = window.populateBrandSelector;
    window.populateBrandSelector = function (brands) {
      orig(brands);
      refreshBrandSwitcher();
    };
  }

  function patchChangeBrand() {
    if (window.__fdChangeBrandPatched) return;
    if (typeof window.changeBrand !== 'function') return;
    window.__fdChangeBrandPatched = true;
    var orig = window.changeBrand;
    window.changeBrand = function () {
      var sel = document.getElementById('brandSelector');
      var id = sel && sel.value ? sel.value : null;
      var result = orig.apply(this, arguments);
      if (id) trackRecentBrand(id);
      refreshBrandSwitcher();
      applyBreadcrumbNoBrand();
      return result;
    };
  }

  var state = {
    open: false,
    query: ''
  };

  function closePanel() {
    state.open = false;
    var panel = document.getElementById('fdBrandSwitcherPanel');
    var trigger = document.getElementById('fdBrandSwitcherTrigger');
    if (panel) panel.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function openPanel() {
    state.open = true;
    var panel = document.getElementById('fdBrandSwitcherPanel');
    var trigger = document.getElementById('fdBrandSwitcherTrigger');
    if (panel) panel.hidden = false;
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    var search = document.getElementById('fdBrandSwitcherSearch');
    if (search) {
      search.value = '';
      state.query = '';
      renderLists();
      search.focus();
    }
  }

  function togglePanel() {
    if (state.open) closePanel();
    else openPanel();
  }

  function selectBrand(id) {
    var sel = document.getElementById('brandSelector');
    if (!sel) return;
    sel.value = id || '';
    if (typeof window.changeBrand === 'function') window.changeBrand();
    else {
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    closePanel();
  }

  function matchesQuery(name) {
    var q = state.query.trim().toLowerCase();
    if (!q) return true;
    return String(name || '').toLowerCase().indexOf(q) >= 0;
  }

  function renderOptionList(ul, brands, activeId) {
    if (!ul) return;
    ul.innerHTML = '';
    var any = false;
    brands.forEach(function (b) {
      if (!matchesQuery(b.name)) return;
      any = true;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fd-brand-switcher__option' + (String(b.id) === String(activeId) ? ' is-active' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(b.id) === String(activeId) ? 'true' : 'false');
      btn.textContent = b.name;
      btn.addEventListener('click', function () {
        selectBrand(b.id);
      });
      var li = document.createElement('li');
      li.appendChild(btn);
      ul.appendChild(li);
    });
    if (!any) {
      var empty = document.createElement('p');
      empty.className = 'fd-brand-switcher__empty';
      empty.textContent = 'Nessun brand trovato';
      ul.appendChild(document.createElement('li')).appendChild(empty);
    }
  }

  function renderLists() {
    var all = getFilteredBrandOptions();
    var activeId = window.brandId || (document.getElementById('brandSelector') || {}).value || '';
    var allUl = document.getElementById('fdBrandSwitcherAll');
    var recentUl = document.getElementById('fdBrandSwitcherRecent');
    var recentWrap = document.getElementById('fdBrandSwitcherRecentWrap');

    var recentIds = readRecentIds();
    var recentBrands = [];
    recentIds.forEach(function (id) {
      var hit = all.find(function (b) {
        return String(b.id) === String(id);
      });
      if (hit) recentBrands.push(hit);
    });

    var showRecent = all.length >= SHOW_RECENT_MIN && recentBrands.length > 0;
    if (recentWrap) recentWrap.hidden = !showRecent;
    if (showRecent && recentUl) renderOptionList(recentUl, recentBrands, activeId);
    if (allUl) renderOptionList(allUl, all, activeId);
  }

  function syncTriggerLabel() {
    var trigger = document.getElementById('fdBrandSwitcherTrigger');
    var label = trigger && trigger.querySelector('.fd-brand-switcher__label');
    if (!label) return;
    var sel = document.getElementById('brandSelector');
    if (!sel || !sel.value) {
      label.textContent = 'Seleziona brand';
      return;
    }
    label.textContent = sel.options[sel.selectedIndex]?.textContent || 'Brand';
  }

  function ensureSwitcherDom() {
    var picker = document.querySelector('.a2w-brand-picker');
    var sel = document.getElementById('brandSelector');
    if (!picker || !sel || document.getElementById('fdBrandSwitcher')) return;

    picker.classList.add('fd-brand-picker--switcher');
    sel.classList.add('fd-brand-switcher-native');

    var root = document.createElement('div');
    root.id = 'fdBrandSwitcher';
    root.className = 'fd-brand-switcher';
    root.innerHTML =
      '<button type="button" id="fdBrandSwitcherTrigger" class="fd-brand-switcher__trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="fdBrandSwitcherPanel">' +
      '<span class="fd-brand-switcher__label">Seleziona brand</span>' +
      '<span class="fd-brand-switcher__chevron" aria-hidden="true">▾</span>' +
      '</button>' +
      '<div id="fdBrandSwitcherPanel" class="fd-brand-switcher__panel" hidden role="dialog" aria-label="Seleziona brand">' +
      '<input type="search" id="fdBrandSwitcherSearch" class="fd-brand-switcher__search" placeholder="Cerca brand…" autocomplete="off" />' +
      '<div id="fdBrandSwitcherRecentWrap" class="fd-brand-switcher__section" hidden>' +
      '<p class="fd-brand-switcher__heading">Recenti</p>' +
      '<ul id="fdBrandSwitcherRecent" class="fd-brand-switcher__list" role="listbox"></ul>' +
      '</div>' +
      '<div class="fd-brand-switcher__section">' +
      '<p class="fd-brand-switcher__heading">Tutti i brand</p>' +
      '<ul id="fdBrandSwitcherAll" class="fd-brand-switcher__list" role="listbox"></ul>' +
      '</div>' +
      '</div>';

    picker.insertBefore(root, sel);

    document.getElementById('fdBrandSwitcherTrigger').addEventListener('click', function (e) {
      e.stopPropagation();
      togglePanel();
    });

    var search = document.getElementById('fdBrandSwitcherSearch');
    search.addEventListener('input', function () {
      state.query = search.value;
      renderLists();
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePanel();
        document.getElementById('fdBrandSwitcherTrigger').focus();
      }
    });

    if (!document.body.dataset.fdBrandSwitcherBound) {
      document.body.dataset.fdBrandSwitcherBound = '1';
      document.addEventListener('click', function (e) {
        if (!state.open) return;
        if (e.target.closest('#fdBrandSwitcher')) return;
        closePanel();
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closePanel();
      });
    }
  }

  function refreshBrandSwitcher() {
    syncTriggerLabel();
    if (state.open) renderLists();
    applyBreadcrumbNoBrand();
  }

  function initFdBrandSwitcher() {
    if (!isFiloSwitcherApp()) return;
    document.documentElement.setAttribute('data-app', 'filodiretto');
    ensureSwitcherDom();
    patchSyncBreadcrumb();
    patchPopulateBrandSelector();
    patchChangeBrand();
    refreshBrandSwitcher();
    if (window.brandId) trackRecentBrand(window.brandId);
  }

  window.fdRefreshBrandSwitcher = refreshBrandSwitcher;
  window.fdInitBrandSwitcher = initFdBrandSwitcher;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdBrandSwitcher);
  } else {
    initFdBrandSwitcher();
  }

  /* Re-init when brands load after login */
  var tries = 0;
  var poll = setInterval(function () {
    if (!isFiloSwitcherApp()) {
      clearInterval(poll);
      return;
    }
    if (document.getElementById('fdBrandSwitcher') || tries > 40) {
      clearInterval(poll);
      if (!document.getElementById('fdBrandSwitcher')) ensureSwitcherDom();
      refreshBrandSwitcher();
      return;
    }
    tries += 1;
    ensureSwitcherDom();
  }, 500);
})();


/* === fd-icons.js === */
/**
 * FD — shared stroke icons (24px viewBox).
 */
(function () {
  'use strict';

  var STROKE =
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

  var PATHS = {
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    trash:
      '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    kebab: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>'
  };

  function svg(name, size) {
    var paths = PATHS[name];
    if (!paths) return '';
    var s = size || 16;
    return (
      '<svg class="fd-icon fd-icon--' +
      name +
      '" viewBox="0 0 24 24" width="' +
      s +
      '" height="' +
      s +
      '" ' +
      STROKE +
      ' aria-hidden="true">' +
      paths +
      '</svg>'
    );
  }

  window.FD_ICONS = { svg: svg, paths: PATHS };
})();


/* === fd-nav.js === */
/**
 * FD — Filo HR nav: icons, accordion groups, mask ads-only sections.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'filo_nav_group';
  var syncingNavGroups = false;

  var SECTION_ICONS = {
    welcome:
      '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    'brand-identity':
      '<path d="M12 2l3 7h7l-5.5 4 2 7-6.5-4.5L6.5 20l2-7L3 9h7z"/>',
    'media-library':
      '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
    templates: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/>',
    passes:
      '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2M13 17v2M13 11v2"/>',
    push:
      '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    'instant-win':
      '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
    gamification:
      '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    leads:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    conventions:
      '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    'pga-catalog':
      '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    'pga-engagement':
      '<circle cx="12" cy="12" r="8"/><path d="M12 7v10"/><path d="M9.5 9.5h3a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h3"/>',
    audiences:
      '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
    analytics:
      '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
    'activity-log':
      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    users:
      '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><circle cx="12" cy="11" r="3"/>'
  };

  function isFiloNavApp() {
    if (document.documentElement.getAttribute('data-app') === 'filodiretto') return true;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return false;
  }

  function navIconSvg(paths) {
    return (
      '<svg class="nav-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths +
      '</svg>'
    );
  }

  function applyFiloNavMask() {
    if (!isFiloNavApp()) return;
    if (typeof window.applyLegacyCampaignsUiMask === 'function') {
      window.applyLegacyCampaignsUiMask();
    }
    patchHrGrowthSidebar();
  }

  function patchHrGrowthSidebar() {
    if (!isFiloNavApp()) return;
    if (!document || typeof document.querySelector !== 'function') return;
    var group = document.querySelector('.nav-group[data-nav-group="comunicazione"]');
    if (!group) return;
    var summary = group.querySelector('summary.nav-group-label');
    if (summary) summary.textContent = 'Growth Activation';
    group.querySelectorAll('.fd-nav-item--hr').forEach(function (item) {
      item.style.display = '';
      item.removeAttribute('hidden');
    });
  }

  function sectionIdFromNavItem(el) {
    if (!el) return '';
    var sid = el.getAttribute('data-section-id');
    if (sid) return sid;
    var match = (el.getAttribute('onclick') || '').match(/nav\('([^']+)'\)/);
    return match ? match[1] : '';
  }

  function resolveNavItemLabel(item) {
    var labelEl = item.querySelector('.nav-label, .a2w-nav-label');
    if (labelEl) return String(labelEl.textContent || '').trim();
    var text = '';
    item.childNodes.forEach(function (n) {
      if (n.nodeType === Node.TEXT_NODE) text += n.textContent;
    });
    text = text.trim();
    if (text) return text;
    return String(item.getAttribute('data-menu-default') || item.textContent || '').trim();
  }

  function removeNavItemTextNodes(item) {
    Array.prototype.slice.call(item.childNodes).forEach(function (n) {
      if (n.nodeType === Node.TEXT_NODE) item.removeChild(n);
    });
  }

  function injectNavIcons() {
    if (!isFiloNavApp()) return;
    document.querySelectorAll('.sidebar .nav-item').forEach(function (item) {
      var sid = sectionIdFromNavItem(item) || (item.id === 'navItemWelcome' ? 'welcome' : '');
      var paths = SECTION_ICONS[sid];
      if (!paths) return;

      var badge = item.querySelector('.nav-badge');
      var preserved = [];
      item.querySelectorAll(':scope > *').forEach(function (el) {
        if (
          el.classList.contains('nav-icon') ||
          el.classList.contains('nav-label') ||
          el.classList.contains('a2w-nav-icon') ||
          el.classList.contains('a2w-nav-label') ||
          el.classList.contains('nav-badge')
        ) {
          return;
        }
        preserved.push(el);
      });

      var labelText = resolveNavItemLabel(item);

      item.querySelectorAll('.nav-icon, .a2w-nav-icon, .nav-label, .a2w-nav-label').forEach(function (el) {
        el.remove();
      });
      removeNavItemTextNodes(item);

      item.insertAdjacentHTML('afterbegin', navIconSvg(paths));

      var iconOnly = sid === 'welcome';
      if (iconOnly) {
        item.classList.add('nav-item--icon-only');
      } else {
        item.classList.remove('nav-item--icon-only');
        var labelSpan = document.createElement('span');
        labelSpan.className = 'nav-label';
        labelSpan.textContent = labelText;
        var iconRef = item.querySelector('.nav-icon');
        if (iconRef) iconRef.insertAdjacentElement('afterend', labelSpan);
        else item.appendChild(labelSpan);
      }

      preserved.forEach(function (el) {
        item.appendChild(el);
      });
      if (badge && !item.contains(badge)) item.appendChild(badge);

      removeNavItemTextNodes(item);

      var a11yLabel = labelText || (iconOnly ? 'Inizio' : '');
      if (a11yLabel) {
        item.setAttribute('data-fd-tooltip', a11yLabel);
        item.setAttribute('aria-label', a11yLabel);
      }
    });
  }

  function sectionToGroup(sectionId) {
    if (!sectionId || sectionId === 'welcome') return null;
    if (sectionId === 'audiences') sectionId = 'leads';
    if (sectionId === 'activity-log') sectionId = 'analytics';

    var domItem = document.querySelector('.nav-group[data-nav-group] .nav-item[data-section-id="' + sectionId + '"]');
    var domGroup = domItem && domItem.closest ? domItem.closest('.nav-group[data-nav-group]') : null;
    if (domGroup && domGroup.dataset && domGroup.dataset.navGroup) return domGroup.dataset.navGroup;

    var nav = window.FD_NAV && window.FD_NAV.NAV;
    if (!nav) return null;
    for (var i = 0; i < nav.length; i++) {
      var sec = nav[i];
      for (var j = 0; j < sec.items.length; j++) {
        if (sec.items[j].id === sectionId) return sec.id;
      }
    }
    return null;
  }

  function getActiveSectionForGroups() {
    if (typeof window.getActiveSectionId === 'function') {
      var sid = window.getActiveSectionId();
      if (sid) return sid;
    }
    var active = document.querySelector('.nav-item.active');
    if (active) return sectionIdFromNavItem(active);
    return 'welcome';
  }

  function syncNavGroupA11y(details) {
    var summary = details.querySelector('summary.nav-group-label');
    if (!summary) return;
    var label = String(summary.textContent || '').trim() || 'sezione';
    summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
    summary.setAttribute('aria-label', (details.open ? 'Comprimi' : 'Espandi') + ' sezione ' + label);
  }

  function applySingleOpenGroup(openGroupId, activeGroup) {
    if (syncingNavGroups) return;
    syncingNavGroups = true;
    try {
      document.querySelectorAll('.nav-group[data-nav-group]').forEach(function (details) {
        var gid = details.dataset.navGroup;
        var shouldOpen = !!openGroupId && gid === openGroupId;
        if (shouldOpen) details.setAttribute('open', '');
        else details.removeAttribute('open');
        details.classList.toggle('nav-group--active', !!activeGroup && gid === activeGroup);
        syncNavGroupA11y(details);
        try {
          localStorage.setItem(STORAGE_KEY + ':' + gid, shouldOpen ? '1' : '0');
        } catch (_) {}
      });
    } finally {
      syncingNavGroups = false;
    }
  }

  /**
   * @param {string} [sectionId]
   * @param {{ mode?: 'navigate'|'manual', openedGroupId?: string }} [options]
   */
  function syncNavGroups(sectionId, options) {
    if (!isFiloNavApp()) return;
    options = options || {};
    var activeSection = sectionId || getActiveSectionForGroups();
    var activeGroup = sectionToGroup(activeSection);

    if (options.mode === 'manual' && options.openedGroupId) {
      applySingleOpenGroup(options.openedGroupId, activeGroup);
      return;
    }

    applySingleOpenGroup(activeGroup, activeGroup);
  }

  function bindNavGroups() {
    document.querySelectorAll('.nav-group[data-nav-group]').forEach(function (details) {
      if (details.dataset.fdNavGroupBound === '1') return;
      details.dataset.fdNavGroupBound = '1';
      details.addEventListener('toggle', function () {
        if (!isFiloNavApp() || syncingNavGroups) return;
        var id = details.dataset.navGroup;
        var activeGroup = sectionToGroup(getActiveSectionForGroups());

        if (details.open) {
          applySingleOpenGroup(id, activeGroup);
          return;
        }

        syncNavGroupA11y(details);
        details.classList.toggle('nav-group--active', id === activeGroup);
        try {
          localStorage.setItem(STORAGE_KEY + ':' + id, '0');
        } catch (_) {}
      });
    });
  }

  function fdInitNavGroups() {
    if (!isFiloNavApp()) return false;
    patchHrGrowthSidebar();
    injectNavIcons();
    bindNavGroups();
    syncNavGroups(getActiveSectionForGroups());
    return true;
  }

  function patchUpdateNavState() {
    if (window.__fdNavPatched || typeof window.updateNavState !== 'function') return;
    window.__fdNavPatched = true;
    var orig = window.updateNavState;
    window.updateNavState = function () {
      orig.apply(this, arguments);
      applyFiloNavMask();
      patchHrGrowthSidebar();
      injectNavIcons();
      syncNavGroups(getActiveSectionForGroups());
    };
  }

  function patchApplyNavNaming() {
    if (window.__fdNavNamingPatched || !window.FD_NAV || typeof window.FD_NAV.applyNavNaming !== 'function') return;
    window.__fdNavNamingPatched = true;
    var orig = window.FD_NAV.applyNavNaming;
    window.FD_NAV.applyNavNaming = function () {
      orig.apply(this, arguments);
      patchHrGrowthSidebar();
      injectNavIcons();
    };
  }

  function initFdNav() {
    if (!isFiloNavApp()) return;
    patchApplyNavNaming();
    patchUpdateNavState();
    applyFiloNavMask();
    patchHrGrowthSidebar();
    injectNavIcons();
  }

  window.fdApplyFiloNavMask = applyFiloNavMask;
  window.fdInjectNavIcons = injectNavIcons;
  window.fdSyncNavGroups = syncNavGroups;
  window.fdInitNavGroups = fdInitNavGroups;
  window.fdSectionToNavGroup = sectionToGroup;
  window.fdInitNav = initFdNav;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdNav);
  } else {
    initFdNav();
  }
})();


/* === fd-legacy-campaigns.js === */
/**
 * Filo HR — remove legacy UTM "Campagne" section (orphan UI + redundant fetches).
 */
(function () {
  'use strict';

  function isFiloApp() {
    if (document.documentElement.getAttribute('data-app') === 'filodiretto') return true;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return false;
  }

  function purgeLegacyCampaignsUi() {
    document.querySelectorAll('.nav-item[data-section-id="campaigns"]').forEach(function (el) {
      el.remove();
    });
    var section = document.getElementById('campaigns');
    if (section) section.remove();
  }

  function patchNavCampaignsRedirect() {
    if (window.__fdLegacyCampaignsNavPatch || typeof window.nav !== 'function') return;
    window.__fdLegacyCampaignsNavPatch = true;
    var orig = window.nav;
    window.nav = function (id) {
      if (id === 'campaigns') {
        id = typeof window.getDefaultBrandSection === 'function'
          ? window.getDefaultBrandSection()
          : 'welcome';
      }
      return orig.apply(this, arguments);
    };
  }

  function init() {
    if (!isFiloApp()) return;
    purgeLegacyCampaignsUi();
    patchNavCampaignsRedirect();
  }

  window.fdPurgeLegacyCampaignsUi = purgeLegacyCampaignsUi;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


/* === fd-hr-copy.js === */
/**
 * Filo HR — glossario unificato (Dipendenti, CTA, microcopy header pagina).
 */
(function () {
  'use strict';

  function isFiloHr() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    if (document.documentElement.getAttribute('data-app') === 'filodiretto') return true;
    return typeof window.isHrDashboard === 'function' && window.isHrDashboard();
  }

  function applyTemplatesSubtitle() {
    var section = document.getElementById('templates');
    if (!section || section.querySelector('[data-fd-templates-lead]')) return;
    if (typeof window.enhancePageHeaders === 'function') window.enhancePageHeaders();
    var lead = document.createElement('p');
    lead.className = 'page-header__desc';
    lead.setAttribute('data-fd-templates-lead', '1');
    lead.textContent = 'Crea e gestisci i layout dei pass Wallet per i tuoi dipendenti.';
    var main = section.querySelector('header.page-header .page-header__main');
    if (main) {
      main.appendChild(lead);
      return;
    }
    var h1 = section.querySelector('h1');
    if (h1) h1.insertAdjacentElement('afterend', lead);
  }

  function applyLeadsChrome() {
    if (!isFiloHr()) return;

    stripLeadsHeaderDuplicates();

    var pageMenu = document.getElementById('contactsPageMenu');
    if (pageMenu) {
      pageMenu.hidden = true;
      pageMenu.style.display = 'none';
    }
  }

  function stripLeadsHeaderDuplicates() {
    var headerActions = document.getElementById('a2wContactsHeaderActions');
    if (headerActions) {
      headerActions.hidden = true;
      headerActions.setAttribute('aria-hidden', 'true');
      headerActions.style.display = 'none';
    }
  }

  function patchMenuCopy() {
    if (!isFiloHr() || window.__fdHrCopyPatched) return;
    window.__fdHrCopyPatched = true;

    var orig = window.applyProductMenuCopy;
    if (typeof orig !== 'function') return;

    window.applyProductMenuCopy = function (line) {
      orig.call(this, line);
      if (line === 'hr' || isFiloHr()) applyLeadsChrome();
    };
  }

  function patchNav() {
    if (!isFiloHr()) return;
    var origNav = window.nav;
    if (typeof origNav !== 'function' || window.__fdHrCopyNav) return;
    window.__fdHrCopyNav = true;
    window.nav = function (id) {
      var r = origNav.apply(this, arguments);
      var done = function () {
        if (id === 'leads') applyLeadsChrome();
        if (id === 'templates') applyTemplatesSubtitle();
      };
      if (r && typeof r.then === 'function') return r.then(done);
      setTimeout(done, 0);
      return r;
    };
  }

  function applyFiloProductBranding() {
    if (!isFiloHr()) return;
    var title = (function () {
      try {
        return (window.__2WALLET_PRODUCT_TITLE__ || 'Filo Diretto').trim();
      } catch (_) {
        return 'Filo Diretto';
      }
    })();
    document.querySelectorAll('.chrome-product-title').forEach(function (el) {
      var t = (el.textContent || '').trim();
      if (t === 'Ads2Wallet' || t === 'HR2Wallet') el.textContent = title;
    });
    var headerBrand = document.getElementById('headerBrandName');
    if (headerBrand && !window.brandId) {
      var ht = (headerBrand.textContent || '').trim();
      if (ht === 'Ads2Wallet' || ht === 'HR2Wallet') headerBrand.textContent = title;
    }
    var breadcrumbBrand = document.getElementById('breadcrumbBrand');
    if (breadcrumbBrand && !window.brandId) {
      var bt = (breadcrumbBrand.textContent || '').trim();
      if (bt === 'Ads2Wallet' || bt === 'HR2Wallet') breadcrumbBrand.textContent = title;
    }
  }

  function boot() {
    if (!isFiloHr()) return;
    patchMenuCopy();
    patchNav();
    applyLeadsChrome();
    applyTemplatesSubtitle();
    applyFiloProductBranding();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();


/* === fd-brand-scope.js === */
/**
 * Filo HR — brand identity vs pass template: no duplicate pass fields on Identità brand.
 */
(function () {
  'use strict';

  function isFilo() {
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function isHr() {
    return typeof isHrDashboard === 'function' && isHrDashboard();
  }

  function applyBrandIdentityScope() {
    if (!isFilo() || !isHr()) return;
    var page = document.querySelector('#brand-identity .a2w-bi-page');
    if (!page) return;

    var layout = page.querySelector('.a2w-bi-layout');
    if (layout) layout.classList.add('a2w-bi-layout--brand-only');

    var taglineGroup = document.getElementById('biTagline');
    if (taglineGroup && taglineGroup.closest('.form-group')) {
      taglineGroup.closest('.form-group').classList.add('a2w-bi-field--pass-only');
    }

    page.querySelectorAll('.a2w-bi-section').forEach(function (section) {
      var h2 = section.querySelector('.a2w-bi-section__head h2');
      if (h2 && /logo e immagini/i.test(h2.textContent || '')) {
        section.classList.add('a2w-bi-section--pass-assets');
      }
    });

    var subtitle = page.querySelector('.a2w-bi-subtitle');
    if (subtitle) {
      subtitle.textContent =
        'Nome, slug, lingua e contatti aziendali. Logo, strip e testi del pass si configurano in Template Pass.';
    }

    if (!page.querySelector('.fd-brand-scope-hint')) {
      var hint = document.createElement('p');
      hint.className = 'fd-brand-scope-hint';
      hint.innerHTML =
        'Le immagini e i testi del pass dipendente non si impostano qui. Vai su ' +
        '<a href="#" data-fd-nav="templates">Template Pass</a> per layout, strip, logo pass e header.';
      hint.querySelector('a')?.addEventListener('click', function (e) {
        e.preventDefault();
        if (typeof nav === 'function') nav('templates');
      });
      var header = page.querySelector('.a2w-bi-header');
      if (header && header.nextElementSibling) {
        header.parentNode.insertBefore(hint, header.nextElementSibling);
      } else if (header) {
        header.after(hint);
      }
    }

    var contactsHead = page.querySelector('.a2w-bi-section .a2w-bi-section__head p');
    page.querySelectorAll('.a2w-bi-section').forEach(function (section) {
      var h2 = section.querySelector('h2');
      if (h2 && /contatti pubblici/i.test(h2.textContent || '')) {
        var p = section.querySelector('.a2w-bi-section__head p');
        if (p) {
          p.textContent =
            'Contatti HR e aziendali usati su landing, comunicazioni e retro del pass (se il template non li sovrascrive).';
        }
      }
    });
  }

  function applyTemplateScope() {
    if (!isFilo() || !isHr()) return;
    var editor = document.getElementById('hrPassBackEditor');
    if (!editor) return;
    var modal = document.getElementById('templateModal');
    if (modal && !modal.querySelector('.fd-template-brand-contacts-note')) {
      var note = document.createElement('p');
      note.className = 'fd-template-brand-contacts-note';
      note.textContent =
        'People Operations, DPO ed emergenze si gestiscono in Identità Brand. Qui configuri solo link fisso e contenuti specifici del pass.';
      if (editor.parentNode) editor.parentNode.insertBefore(note, editor);
    }
  }

  function boot() {
    applyBrandIdentityScope();
    applyTemplateScope();
  }

  function wrapTemplateHooks() {
    var origNav = window.nav;
    if (typeof origNav === 'function' && !window.__fdBrandScopeNav) {
      window.__fdBrandScopeNav = true;
      window.nav = function fdBrandScopeNav(id) {
        var p = origNav.apply(this, arguments);
        if (p && typeof p.then === 'function') {
          return p.then(function () {
            if (id === 'brand-identity' || id === 'templates') boot();
          });
        }
        if (id === 'brand-identity' || id === 'templates') setTimeout(boot, 0);
        return p;
      };
    }

    var origOpen = window.openTemplateModal;
    if (typeof origOpen === 'function' && !window.__fdBrandScopeTpl) {
      window.__fdBrandScopeTpl = true;
      window.openTemplateModal = function () {
        var r = origOpen.apply(this, arguments);
        if (r && typeof r.then === 'function') return r.then(function () { applyTemplateScope(); });
        setTimeout(applyTemplateScope, 0);
        return r;
      };
    }

    var origEdit = window.editTemplate;
    if (typeof origEdit === 'function' && !window.__fdBrandScopeEditTpl) {
      window.__fdBrandScopeEditTpl = true;
      window.editTemplate = function () {
        var r = origEdit.apply(this, arguments);
        if (r && typeof r.then === 'function') return r.then(function () { applyTemplateScope(); });
        setTimeout(applyTemplateScope, 0);
        return r;
      };
    }
  }

  function bootAll() {
    boot();
    wrapTemplateHooks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootAll);
  } else {
    bootAll();
  }
  window.addEventListener('load', bootAll);
})();


/* === fd-brand-identity.js === */
/**
 * FD — Identità Brand (FASE 4): layout DS, pannello laterale, save bar, social, delete.
 */
(function () {
  'use strict';

  var SOCIAL_IDS = ['biSocialInstagram', 'biSocialFacebook', 'biSocialLinkedin', 'biSocialTiktok', 'biSocialX'];
  var biAccordionCollapsed = { base: false, contacts: false, privacy: false, social: false };

  var BI_ACCORDION_CONFIGS = [
    {
      collapsedKey: 'base',
      sectionSelector: '#brand-identity .a2w-bi-section--base',
      detailsId: 'fdBiBaseDetails',
      summaryId: 'fdBiBaseSummary',
      title: 'Informazioni base',
      metaId: 'fdBiBaseMeta',
      fieldIds: ['biName', 'biSlug', 'biTagline', 'biSettore', 'biLang'],
      defaultOpen: true,
      metaFn: function () {
        var nameEl = document.getElementById('biName');
        var name = nameEl && String(nameEl.value || '').trim();
        return name || 'Da completare';
      }
    },
    {
      collapsedKey: 'contacts',
      sectionSelector: '#brand-identity .a2w-bi-section--contacts',
      detailsId: 'fdBiContactsDetails',
      summaryId: 'fdBiContactsSummary',
      title: 'Contatti pubblici',
      metaId: 'fdBiContactsMeta',
      fieldIds: ['biHomepage', 'biSupportEmail', 'biSupportPhone', 'biEmergencyPhone'],
      defaultOpen: true,
      metaFn: function () {
        var ids = ['biHomepage', 'biSupportEmail', 'biSupportPhone', 'biEmergencyPhone'];
        var n = 0;
        ids.forEach(function (id) {
          var el = document.getElementById(id);
          if (el && String(el.value || '').trim()) n += 1;
        });
        if (!n) return 'Nessun contatto';
        return n + (n === 1 ? ' campo' : ' campi');
      }
    },
    {
      collapsedKey: 'privacy',
      sectionSelector: '#brand-identity .a2w-bi-section--privacy',
      detailsId: 'fdBiPrivacyDetails',
      summaryId: 'fdBiPrivacySummary',
      title: 'Privacy',
      metaId: 'fdBiPrivacyMeta',
      fieldIds: ['biDpoEmail', 'biPrivacyUrl'],
      defaultOpen: true,
      metaFn: function () {
        var dpoEl = document.getElementById('biDpoEmail');
        var dpo = dpoEl && String(dpoEl.value || '').trim();
        var urlEl = document.getElementById('biPrivacyUrl');
        var url = urlEl && String(urlEl.value || '').trim();
        if (url && /privacy-doc/i.test(url)) return 'Informativa personalizzata';
        if (url) return 'URL personalizzato';
        if (dpo) return 'DPO configurato · default FiloDiretto';
        return 'Da completare';
      }
    },
    {
      collapsedKey: 'social',
      sectionSelector: '#brand-identity .a2w-bi-section--social',
      detailsId: 'fdBiSocialDetails',
      summaryId: 'a2wBiSocialToggle',
      title: 'Social',
      metaId: 'fdBiSocialCount',
      legacyToggleId: 'a2wBiSocialToggle',
      bodyId: 'a2wBiSocialBody',
      leadHtml: 'Collegamenti ai profili social del brand (opzionale). Appaiono nel pass e nelle comunicazioni.',
      fieldIds: SOCIAL_IDS,
      defaultOpen: false,
      metaFn: function () {
        var count = countSocialProfiles();
        if (!count) return 'Nessun profilo';
        return count + (count === 1 ? ' profilo' : ' profili');
      }
    }
  ];
  var SUMMARY_FIELD_IDS = [
    'biName',
    'biTagline',
    'biSlug',
    'biHomepage',
    'biSupportEmail',
    'biSupportPhone',
    'biDpoEmail',
    'biEmergencyPhone',
    'biSettore',
    'biLang'
  ];
  var summaryTimer = null;

  function isFiloBiApp() {
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

  function isConfirmTypingMatch(input, expected) {
    if (window.A2W && window.A2W.UI && typeof window.A2W.UI.isConfirmTypingMatch === 'function') {
      return window.A2W.UI.isConfirmTypingMatch(input, expected);
    }
    return String(input || '').trim() === String(expected || '').trim();
  }

  function collectFormSnapshot() {
    if (typeof window.a2wBiCollectFormData === 'function') {
      try {
        return window.a2wBiCollectFormData();
      } catch (_) {}
    }
    return {
      name: document.getElementById('biName')?.value || '',
      tagline: document.getElementById('biTagline')?.value || '',
      slug: document.getElementById('biSlug')?.value || '',
      homepage: document.getElementById('biHomepage')?.value || '',
      support_email: document.getElementById('biSupportEmail')?.value || '',
      support_phone: document.getElementById('biSupportPhone')?.value || '',
      dpo_email: document.getElementById('biDpoEmail')?.value || '',
      privacy_url: document.getElementById('biPrivacyUrl')?.value || '',
      emergency_phone: document.getElementById('biEmergencyPhone')?.value || '',
      settore: document.getElementById('biSettore')?.value || '',
      lang: document.getElementById('biLang')?.value || ''
    };
  }

  var LANDING_TOOLTIP =
    'Link pubblico della landing del brand. La parte finale dell\'URL corrisponde allo slug (campo Slug nel form).';

  function slugPreviewUrl(slug) {
    if (typeof window.getPublicLandingUrl === 'function') {
      var direct = window.getPublicLandingUrl(slug);
      if (direct) return direct;
    }
    if (typeof window.a2wBiGetSlugPreviewUrl === 'function') {
      var fromHelper = window.a2wBiGetSlugPreviewUrl(slug);
      if (fromHelper) return fromHelper;
    }
    var s = String(slug || '').trim();
    if (!s) return '';
    try {
      if (typeof window.getPublicBaseUrl === 'function') {
        var base = window.getPublicBaseUrl();
        if (base) return base + '/' + s;
      }
      return window.location.origin + '/' + s;
    } catch (_) {
      return '/' + s;
    }
  }

  function copyLandingUrl(url) {
    if (!url) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        if (typeof window.toast === 'function') window.toast('URL landing copiata');
      }).catch(function () {
        if (typeof window.toast === 'function') window.toast('Copia non riuscita');
      });
      return;
    }
    if (typeof window.toast === 'function') window.toast('Copia non disponibile');
  }

  function openLandingUrl(url) {
    if (!url) {
      if (typeof window.toast === 'function') window.toast('Inserisci uno slug per aprire la landing');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function summarySlugLink(slug) {
    var slugPart = String(slug || '').trim();
    if (!slugPart) {
      return summaryRow('Slug landing', '—');
    }
    var fullUrl = slugPreviewUrl(slugPart);
    return (
      '<div class="a2w-bi-identity-summary__row a2w-bi-identity-summary__row--slug">' +
      '<dt>Slug landing</dt>' +
      '<dd class="a2w-bi-identity-summary__slug-cell">' +
      '<a class="a2w-bi-identity-summary__slug-link" href="' + esc(fullUrl) + '" target="_blank" rel="noopener noreferrer" title="' + esc(LANDING_TOOLTIP) + '">' + esc(slugPart) + '</a>' +
      '<button type="button" class="fd-btn fd-btn--ghost fd-btn--sm fd-bi-slug-copy" data-fd-copy-url="' + esc(fullUrl) + '" aria-label="Copia URL landing" title="Copia URL">' +
      '<span aria-hidden="true">⧉</span></button>' +
      '</dd></div>'
    );
  }

  function brandInitial(name) {
    var n = String(name || '').trim();
    return n ? n.charAt(0).toUpperCase() : '?';
  }

  function fieldVal(data, camelKey, snakeKey) {
    if (!data) return '';
    if (data[camelKey] != null && String(data[camelKey]).trim()) return data[camelKey];
    if (snakeKey && data[snakeKey] != null && String(data[snakeKey]).trim()) return data[snakeKey];
    return '';
  }

  function summaryRow(label, value) {
    var v = String(value || '').trim();
    return (
      '<div class="a2w-bi-identity-summary__row">' +
      '<dt>' + esc(label) + '</dt>' +
      '<dd>' + esc(v || '—') + '</dd>' +
      '</div>'
    );
  }

  function syncAsideSummary() {
    var root = document.getElementById('fdBiIdentitySummary');
    if (!root) return;
    var data = collectFormSnapshot();
    var name = String(data.name || '').trim() || 'Nome brand';
    var tagline = String(data.tagline || '').trim();
    var slugUrl = slugPreviewUrl(data.slug);
    var supportEmail = fieldVal(data, 'supportEmail', 'support_email');
    var supportPhone = fieldVal(data, 'supportPhone', 'support_phone');
    var dpoEmail = fieldVal(data, 'dpoEmail', 'dpo_email');
    var privacyUrl = fieldVal(data, 'privacyUrl', 'privacy_url');

    root.innerHTML =
      '<div class="a2w-bi-identity-summary__brand">' +
      '<span class="a2w-bi-identity-summary__initial" aria-hidden="true">' + esc(brandInitial(name)) + '</span>' +
      '<div>' +
      '<p class="a2w-bi-identity-summary__name">' + esc(name) + '</p>' +
      '<p class="a2w-bi-identity-summary__tagline">' + esc(tagline || '—') + '</p>' +
      '</div></div>' +
      '<dl class="a2w-bi-identity-summary__details">' +
      summarySlugLink(data.slug) +
      summaryRow('Email supporto', supportEmail) +
      summaryRow('Telefono', supportPhone) +
      summaryRow('DPO / Privacy', dpoEmail) +
      summaryRow('Privacy custom', privacyUrl || '— (FiloDiretto default)') +
      summaryRow('Settore', data.settore) +
      '</dl>';

    var legacyPreview = document.getElementById('a2wBiPreviewUrl');
    if (legacyPreview) legacyPreview.textContent = slugUrl || '—';
    var legacySlug = document.getElementById('a2wBiPreviewSlug');
    if (legacySlug && !document.getElementById('fdBiIdentitySummary')) {
      legacySlug.textContent = data.slug || '—';
    }
  }

  function scheduleAsideSummary() {
    if (summaryTimer) clearTimeout(summaryTimer);
    summaryTimer = setTimeout(function () {
      summaryTimer = null;
      syncAsideSummary();
    }, 80);
  }

  function bindSummaryFields() {
    SUMMARY_FIELD_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.fdSummaryBound === '1') return;
      el.dataset.fdSummaryBound = '1';
      el.addEventListener('input', scheduleAsideSummary);
      el.addEventListener('change', scheduleAsideSummary);
    });
  }

  function bindAsideActions(container) {
    var root = container || document.getElementById('fdBiAside');
    if (!root || root.dataset.fdAsideBound === '1') return;
    root.dataset.fdAsideBound = '1';
    root.addEventListener('click', function (e) {
      var copyBtn = e.target.closest('[data-fd-copy-url]');
      if (!copyBtn) return;
      e.preventDefault();
      copyLandingUrl(copyBtn.getAttribute('data-fd-copy-url'));
    });
  }

  function ensureAsidePanel() {
    var layout = document.querySelector('#brand-identity .a2w-bi-layout');
    if (!layout || document.getElementById('fdBiAside')) return;

    var aside = document.createElement('aside');
    aside.id = 'fdBiAside';
    aside.className = 'fd-bi-aside';
    aside.setAttribute('aria-label', 'Anteprima identità brand');
    aside.innerHTML =
      '<div class="fd-bi-aside-grid">' +
      '<div class="fd-card fd-bi-aside-card a2w-bi-preview-card">' +
      '<h2 class="fd-bi-aside__title">Anteprima identità</h2>' +
      '<p class="fd-bi-aside__lead">Anteprima live di nome, contatti e URL landing mentre modifichi i campi.</p>' +
      '<div class="a2w-bi-identity-summary" id="fdBiIdentitySummary"></div>' +
      '<p class="fd-bi-aside__hint">Logo, icona Wallet e strip si configurano in Media Library e Template Pass.</p>' +
      '<div class="fd-bi-aside__actions">' +
      '<button type="button" class="fd-btn fd-btn--ghost" data-fd-nav="media-library">Media Library</button>' +
      '<button type="button" class="fd-btn fd-btn--ghost" data-fd-nav="templates">Template Pass</button>' +
      '</div></div></div>';

    layout.appendChild(aside);
    bindNavButtons(aside);
    bindAsideActions(aside);
    bindSummaryFields();
    syncAsideSummary();
  }

  function bindNavButtons(container) {
    (container || document).querySelectorAll('[data-fd-nav]').forEach(function (btn) {
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
  }

  function repositionDangerZone() {
    var page = document.querySelector('#brand-identity .a2w-bi-page');
    var zone = document.querySelector('#brand-identity .a2w-bi-danger-zone');
    var layout = document.querySelector('#brand-identity .a2w-bi-layout');
    if (!page || !zone || !layout || zone.dataset.fdRepositioned === '1') return;
    zone.dataset.fdRepositioned = '1';
    layout.insertAdjacentElement('afterend', zone);
  }

  function enhanceHeader() {
    var header = document.querySelector('#brand-identity .a2w-bi-header');
    if (!header || header.dataset.fdBiHeader === '1') return;
    header.dataset.fdBiHeader = '1';
    header.classList.add('fd-page-header', 'fd-bi-header');

    var copy = header.querySelector('.a2w-bi-header__copy');
    if (copy) copy.classList.add('fd-page-header__copy');
    var title = header.querySelector('.a2w-bi-title');
    if (title) title.classList.add('fd-page-header__title');
    var lead = header.querySelector('.a2w-bi-subtitle');
    if (lead) lead.classList.add('fd-page-header__lead');

    var actions = header.querySelector('.a2w-bi-header__actions');
    if (actions) {
      actions.classList.add('fd-page-header__actions', 'fd-bi-save-bar');

      var badge = document.getElementById('a2wBiSaveStateBadge');
      var saveBtn = document.getElementById('a2wBiSaveBtn');

      if (badge && !document.getElementById('fdBiSaveStateWrap')) {
        var wrap = document.createElement('div');
        wrap.id = 'fdBiSaveStateWrap';
        wrap.className = 'fd-bi-save-meta fd-bi-save-meta--sr';
        wrap.innerHTML =
          '<span class="fd-bi-save-meta__label" id="fdBiSaveStateLabel">Stato salvataggio</span>';
        badge.classList.add('fd-badge', 'fd-bi-state-badge');
        wrap.appendChild(badge);
        actions.appendChild(wrap);
      }

      if (saveBtn && saveBtn.dataset.fdRelocated !== '1') {
        saveBtn.classList.remove('a2w-btn-primary', 'sec');
      }
    }
  }

  function applyBadgeVariant(badge, modeClass) {
    if (!badge) return;
    badge.classList.remove(
      'fd-badge--success',
      'fd-badge--warning',
      'fd-badge--danger',
      'fd-badge--info',
      'fd-badge--neutral'
    );
    if (modeClass === 'is-dirty') badge.classList.add('fd-badge--warning');
    else if (modeClass === 'is-saving') badge.classList.add('fd-badge--info');
    else if (modeClass === 'is-pending') badge.classList.add('fd-badge--neutral');
    else badge.classList.add('fd-badge--success');
  }

  function enhanceFormSections() {
    document.querySelectorAll('#brand-identity .a2w-bi-section.card').forEach(function (section) {
      section.classList.add('fd-card', 'fd-form-section');
    });
  }

  function enhanceDeleteDialog() {
    var dialog = document.getElementById('a2wDeleteBrandDialog');
    if (dialog) dialog.classList.add('fd-delete-brand-dialog');
    var cancel = document.getElementById('a2wDeleteBrandCancelBtn');
    var confirm = document.getElementById('a2wDeleteBrandConfirmBtn');
    if (cancel) {
      cancel.classList.remove('fd-btn', 'fd-btn--secondary');
      cancel.classList.add('btn', 'sec');
    }
    if (confirm) {
      confirm.classList.remove('fd-btn', 'fd-btn--danger');
      confirm.classList.add('btn', 'danger');
    }
  }

  function countSocialProfiles() {
    var n = 0;
    SOCIAL_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (el && String(el.value || '').trim()) n += 1;
    });
    return n;
  }

  function syncBiAccordionMeta(cfg) {
    var metaEl = document.getElementById(cfg.metaId);
    var details = document.getElementById(cfg.detailsId);
    var summary = document.getElementById(cfg.summaryId);
    if (!metaEl || typeof cfg.metaFn !== 'function') return;
    var label = cfg.metaFn();
    metaEl.textContent = label;
    metaEl.classList.toggle(
      'has-profiles',
      label !== 'Da completare' && label !== 'Nessun contatto' && label !== 'Nessun profilo'
    );
    if (cfg.collapsedKey === 'social' && details) {
      if (countSocialProfiles() > 0 && !biAccordionCollapsed.social && !details.open) {
        details.open = true;
      }
    }
    if (details && summary) {
      summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
    }
  }

  function enhanceBiAccordionSection(cfg) {
    var section = document.querySelector(cfg.sectionSelector);
    if (!section || section.dataset.fdDetailsEnhanced === '1') return;
    section.dataset.fdDetailsEnhanced = '1';

    var head = section.querySelector('.a2w-bi-section__head');
    var leadText = cfg.leadHtml || (head && head.querySelector('p') ? head.querySelector('p').textContent.trim() : '');
    if (head) head.remove();

    if (cfg.legacyToggleId) {
      var legacyToggle = document.getElementById(cfg.legacyToggleId);
      if (legacyToggle && legacyToggle.tagName === 'BUTTON') legacyToggle.remove();
    }

    if (leadText && !section.querySelector('.fd-bi-section-lead')) {
      var lead = document.createElement('p');
      lead.className = 'fd-bi-section-lead fd-bi-social-lead';
      lead.textContent = leadText;
      section.insertBefore(lead, section.firstChild);
    }

    var details = document.createElement('details');
    details.className = 'fd-bi-section-details fd-bi-social-details';
    details.id = cfg.detailsId;
    details.open = cfg.defaultOpen !== false && !biAccordionCollapsed[cfg.collapsedKey];

    var summary = document.createElement('summary');
    summary.className = 'fd-bi-section-trigger fd-bi-social-trigger a2w-bi-accordion-trigger';
    summary.id = cfg.summaryId;
    if (cfg.bodyId) summary.setAttribute('aria-controls', cfg.bodyId);

    var labelWrap = document.createElement('span');
    labelWrap.className = 'fd-bi-social-trigger__label';
    labelWrap.innerHTML =
      '<span class="fd-bi-social-trigger__title">' + cfg.title + '</span>' +
      '<span class="fd-bi-social-trigger__meta" id="' + cfg.metaId + '"></span>';
    var chevron = document.createElement('span');
    chevron.className = 'fd-bi-social-trigger__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '›';
    summary.appendChild(labelWrap);
    summary.appendChild(chevron);

    var body = null;
    if (cfg.bodyId) {
      body = document.getElementById(cfg.bodyId);
      if (body) {
        body.hidden = false;
        body.removeAttribute('hidden');
      }
    }
    if (!body) {
      body = document.createElement('div');
      body.className = 'fd-bi-section-body fd-bi-social-body';
    } else {
      body.classList.add('fd-bi-section-body', 'fd-bi-social-body');
    }

    var movable = [];
    Array.prototype.forEach.call(section.children, function (child) {
      if (child.classList.contains('fd-bi-section-lead')) return;
      movable.push(child);
    });

    section.appendChild(details);
    details.appendChild(summary);
    movable.forEach(function (child) {
      if (child === body) return;
      body.appendChild(child);
    });
    details.appendChild(body);

    details.addEventListener('toggle', function () {
      summary.setAttribute('aria-expanded', details.open ? 'true' : 'false');
      biAccordionCollapsed[cfg.collapsedKey] = !details.open;
      syncBiAccordionMeta(cfg);
    });

    (cfg.fieldIds || []).forEach(function (id) {
      var input = document.getElementById(id);
      if (!input || input.dataset.fdAccordionMetaBound === '1') return;
      input.dataset.fdAccordionMetaBound = '1';
      input.addEventListener('input', function () {
        syncBiAccordionMeta(cfg);
        if (cfg.collapsedKey === 'base' && typeof syncAsideSummary === 'function') syncAsideSummary();
      });
    });

    syncBiAccordionMeta(cfg);
  }

  function enhanceBiAccordionSections() {
    if (!isFiloBiApp()) return;
    BI_ACCORDION_CONFIGS.forEach(enhanceBiAccordionSection);
  }

  function syncAllBiAccordionMeta() {
    BI_ACCORDION_CONFIGS.forEach(syncBiAccordionMeta);
  }

  function formatBadgeLabel(stateLabel) {
    if (!stateLabel) return stateLabel;
    if (
      stateLabel === 'Modifiche non salvate' ||
      stateLabel === 'Salvataggio…' ||
      stateLabel === 'Non ancora salvato' ||
      /^Salvato\s*✓/i.test(stateLabel) ||
      /^Salvato(\s|$)/i.test(stateLabel) ||
      /^circa/i.test(stateLabel)
    ) {
      return stateLabel;
    }
    return stateLabel;
  }

  function patchSaveStateBadge() {
    if (window.__fdBiBadgePatched || typeof window.a2wBiUpdateSaveStateBadge !== 'function') return;
    window.__fdBiBadgePatched = true;
    var orig = window.a2wBiUpdateSaveStateBadge;
    window.a2wBiUpdateSaveStateBadge = function (stateLabel, modeClass, title) {
      orig(formatBadgeLabel(stateLabel), modeClass, title);
      applyBadgeVariant(document.getElementById('a2wBiSaveStateBadge'), modeClass);
    };
  }

  function patchPreviewSync() {
    if (window.__fdBiPreviewPatched || typeof window.a2wBiUpdatePreviewCard !== 'function') return;
    window.__fdBiPreviewPatched = true;
    var orig = window.a2wBiUpdatePreviewCard;
    window.a2wBiUpdatePreviewCard = function () {
      orig.apply(this, arguments);
      syncAsideSummary();
    };
  }

  function patchDeleteTypingHandler() {
    var confirmInput = document.getElementById('a2wDeleteBrandConfirmInput');
    var confirmBtn = document.getElementById('a2wDeleteBrandConfirmBtn');
    if (!confirmInput || !confirmBtn || confirmInput.dataset.fdTypingPatched === '1') return;
    confirmInput.dataset.fdTypingPatched = '1';

    var fresh = confirmInput.cloneNode(true);
    confirmInput.parentNode.replaceChild(fresh, confirmInput);
    if (document.getElementById('a2wDeleteBrandDialogHint')) {
      fresh.setAttribute('aria-describedby', 'a2wDeleteBrandDialogHint');
    }

    fresh.addEventListener('input', function () {
      var expected = '';
      if (typeof window.a2wBiCollectFormData === 'function') {
        try {
          expected = window.a2wBiCollectFormData().name || '';
        } catch (_) {}
      }
      confirmBtn.disabled = !isConfirmTypingMatch(fresh.value, expected);
    });
  }

  function patchLoadBrandIdentity() {
    if (window.__fdBiLoadPatched || typeof window.loadBrandIdentity !== 'function') return;
    window.__fdBiLoadPatched = true;
    var orig = window.loadBrandIdentity;
    window.loadBrandIdentity = async function () {
      await orig.apply(this, arguments);
      enhanceBrandIdentityChrome();
      if (typeof window.fdSyncBrandIdentitySectionSaves === 'function') window.fdSyncBrandIdentitySectionSaves();
    };
  }

  function hideLegacyLandingPreview() {
    document.querySelectorAll('#brand-identity .fd-bi-landing-preview, #brand-identity .a2w-bi-preview-column').forEach(function (el) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    });
  }

  function enhanceBrandIdentityChrome() {
    enhanceHeader();
    ensureAsidePanel();
    hideLegacyLandingPreview();
    repositionDangerZone();
    enhanceFormSections();
    enhanceBiAccordionSections();
    syncAllBiAccordionMeta();
    syncAsideSummary();
    patchDeleteTypingHandler();
    enhanceDeleteDialog();
    if (typeof window.fdInitDangerZone === 'function') window.fdInitDangerZone();
    if (typeof window.fdInjectBrandPassFlowBar === 'function') {
      window.fdInjectBrandPassFlowBar('brand-identity');
    }
  }

  function initFdBrandIdentity() {
    if (!isFiloBiApp()) return;
    patchSaveStateBadge();
    patchPreviewSync();
    patchLoadBrandIdentity();
    patchDeleteTypingHandler();
    enhanceBrandIdentityChrome();
    if (typeof window.fdInitFormDirty === 'function') window.fdInitFormDirty();
  }

  window.fdEnhanceBrandIdentity = enhanceBrandIdentityChrome;
  window.fdSyncBrandIdentityAside = syncAsideSummary;
  window.fdSyncBiAccordionMeta = syncAllBiAccordionMeta;
  window.fdInitBrandIdentity = initFdBrandIdentity;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdBrandIdentity);
  } else {
    initFdBrandIdentity();
  }
})();


/* === fd-brand-pass-flow.js === */
/**
 * FD — Section flow pills (Brand & Pass, Growth Activation, Insights).
 */
(function () {
  'use strict';

  var FLOW_GROUPS = [
    {
      id: 'brand-pass',
      ariaLabel: 'Percorso Brand & Pass',
      steps: [
        { id: 'brand-identity', label: 'Identità' },
        { id: 'media-library', label: 'Media' },
        { id: 'templates', label: 'Template Pass' },
        { id: 'passes', label: 'Pass emessi' },
        { id: 'leads', label: 'Dipendenti' }
      ]
    },
    {
      id: 'growth-activation',
      ariaLabel: 'Percorso Growth Activation',
      steps: [
        { id: 'push', label: 'Push' },
        { id: 'instant-win', label: 'Reward' },
        { id: 'gamification', label: 'Challenge' },
        { id: 'conventions', label: 'Convenzioni' },
        { id: 'pga-catalog', label: 'PGA Catalog' },
        { id: 'pga-engagement', label: 'Engagement Coin' }
      ]
    },
    {
      id: 'insights',
      ariaLabel: 'Percorso Insights',
      steps: [
        { id: 'analytics', label: 'Analytics' },
        { id: 'activity-log', label: 'Log Attività' }
      ]
    }
  ];

  function isFiloFlowApp() {
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
      .replace(/>/g, '&gt;');
  }

  function findGroupForSection(sectionId) {
    for (var i = 0; i < FLOW_GROUPS.length; i++) {
      var group = FLOW_GROUPS[i];
      for (var j = 0; j < group.steps.length; j++) {
        if (group.steps[j].id === sectionId) return group;
      }
    }
    return null;
  }

  function resolveHostSectionId(sectionId) {
    if (sectionId === 'activity-log') return 'analytics';
    return sectionId;
  }

  function allStepIds() {
    var ids = [];
    FLOW_GROUPS.forEach(function (group) {
      group.steps.forEach(function (step) {
        ids.push(step.id);
      });
    });
    return ids;
  }

  function renderFlowBar(group, activeId) {
    return (
      '<nav class="fd-brand-pass-flow" data-flow-group="' +
      esc(group.id) +
      '" aria-label="' +
      esc(group.ariaLabel) +
      '">' +
      group.steps
        .map(function (step, idx) {
          var active = step.id === activeId ? ' is-active' : '';
          var sep =
            idx < group.steps.length - 1
              ? '<span class="fd-brand-pass-flow__sep" aria-hidden="true">›</span>'
              : '';
          return (
            '<button type="button" class="fd-brand-pass-flow__step' +
            active +
            '" data-fd-nav="' +
            esc(step.id) +
            '" onclick="nav(\'' +
            esc(step.id) +
            '\')">' +
            esc(step.label) +
            '</button>' +
            sep
          );
        })
        .join('') +
      '</nav>'
    );
  }

  function findFlowInsertPoint(page) {
    return (
      page.querySelector('.fd-page-header') ||
      page.querySelector('.a2w-media-page-head') ||
      page.querySelector('.fd-media-header') ||
      page.querySelector('h1.page-title, h1.sec-title, h1.fd-page-header__title')
    );
  }

  function injectFlowBar(sectionId) {
    if (!isFiloFlowApp()) return;
    var group = findGroupForSection(sectionId);
    if (!group) return;

    var hostId = resolveHostSectionId(sectionId);
    var section = document.getElementById(hostId);
    if (!section) return;

    var page = section.querySelector('.a2w-media-page') || section;
    var host = section.querySelector('.fd-brand-pass-flow-host');
    if (host) {
      host.innerHTML = renderFlowBar(group, sectionId);
      relocateFlowBarOutOfHeader(section);
      return;
    }

    var anchor = findFlowInsertPoint(page);
    host = document.createElement('div');
    host.className = 'fd-brand-pass-flow-host';
    host.innerHTML = renderFlowBar(group, sectionId);

    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(host, anchor);
    } else {
      page.insertBefore(host, page.firstChild);
    }
    relocateFlowBarOutOfHeader(section);
  }

  function relocateFlowBarOutOfHeader(section) {
    if (!section) return;
    var page = section.querySelector('.a2w-media-page') || section;
    var header = page.querySelector('.fd-page-header, .a2w-media-page-head, .fd-media-header');
    var flowHost = section.querySelector('.fd-brand-pass-flow-host');
    if (!flowHost || !header) return;
    if (flowHost.parentNode === header || header.contains(flowHost)) {
      header.parentNode.insertBefore(flowHost, header);
    }
  }

  function patchBrandSnapshot() {
    if (window.__fdBrandSnapPatched || typeof window.loadBrandIdentity !== 'function') return;
    window.__fdBrandSnapPatched = true;
    var orig = window.loadBrandIdentity;
    window.loadBrandIdentity = async function () {
      await orig.apply(this, arguments);
      try {
        var data =
          typeof window.a2wBiCollectFormData === 'function' ? window.a2wBiCollectFormData() : {};
        window.__fdBrandPassSnapshot = {
          id: window.brandId,
          hr_email: data.supportEmail || data.hrEmail,
          support_email: data.supportEmail
        };
      } catch (_) {}
    };
  }

  function patchAnalyticsTabSwitch() {
    if (window.__fdFlowAnalyticsTabPatched || typeof window.switchAnalyticsSectionTab !== 'function') {
      return;
    }
    window.__fdFlowAnalyticsTabPatched = true;
    var orig = window.switchAnalyticsSectionTab;
    window.switchAnalyticsSectionTab = function (tab, options) {
      var out = orig.apply(this, arguments);
      var activeTab =
        tab || (typeof window.getAnalyticsSectionTab === 'function' ? window.getAnalyticsSectionTab() : 'metrics');
      injectFlowBar(activeTab === 'activity-log' ? 'activity-log' : 'analytics');
      return out;
    };
  }

  function initFdSectionFlow() {
    if (!isFiloFlowApp()) return;
    patchBrandSnapshot();
    patchAnalyticsTabSwitch();

    allStepIds().forEach(function (id) {
      injectFlowBar(id);
    });

    var origNav = window.nav;
    if (typeof origNav === 'function' && !window.__fdFlowNavPatched) {
      window.__fdFlowNavPatched = true;
      window.nav = function (id) {
        var r = origNav.apply(this, arguments);
        var done = function () {
          if (allStepIds().indexOf(id) >= 0) injectFlowBar(id);
        };
        if (r && typeof r.then === 'function') return r.then(done);
        setTimeout(done, 0);
        return r;
      };
    }
  }

  window.fdInitBrandPassFlow = initFdSectionFlow;
  window.fdInitSectionFlow = initFdSectionFlow;
  window.fdInjectBrandPassFlowBar = injectFlowBar;
  window.fdInjectSectionFlowBar = injectFlowBar;
  window.fdRelocateBrandPassFlowBar = relocateFlowBarOutOfHeader;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdSectionFlow);
  } else {
    initFdSectionFlow();
  }
})();


/* === fd-home.js === */
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
    return (
      '<div class="' + gridClass + '">' +
      '<div class="fd-stat-card">' +
      '<span class="fd-stat-card__label">Pass totali</span>' +
      '<span class="fd-stat-card__value">' + esc(ctx.totalPasses) + '</span>' +
      '</div>' +
      '<div class="fd-stat-card">' +
      '<span class="fd-stat-card__label">Installazioni Wallet</span>' +
      '<span class="fd-stat-card__value">' + esc(ctx.walletInstalls) + '</span>' +
      '<span class="fd-stat-card__hint">Apple ' + esc(ctx.apple) + ' · Google ' + esc(ctx.google) +
      (ctx.samsung ? ' · Samsung ' + esc(ctx.samsung) : '') + '</span>' +
      '</div>' +
      '<div class="fd-stat-card">' +
      '<span class="fd-stat-card__label">Push inviate</span>' +
      '<span class="fd-stat-card__value">' + esc(ctx.pushCount) + '</span>' +
      '</div>' +
      '<div class="fd-stat-card">' +
      '<span class="fd-stat-card__label">Template pass</span>' +
      '<span class="fd-stat-card__value">' + esc(ctx.templateCount) + '</span>' +
      '<span class="fd-stat-card__hint">Dipendenti: ' + esc(ctx.employeeCount) + ' (con pass: ' + esc(ctx.employeesWithPass) + ')</span>' +
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


/* === fd-users.js === */
/**
 * FD — FiloDiretto users (FASE 4): DS layout, page header, table UX, kebab actions.
 */
(function () {
  'use strict';

  var openMenuId = null;

  function isFiloUsersApp() {
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
    return {};
  }

  function toast(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
  }

  function canManageUsers() {
    if (typeof window.canManageDashboardUsers === 'function') return window.canManageDashboardUsers();
    return document.body.classList.contains('role-admin') || document.body.classList.contains('role-manager');
  }

  function isAdminUser() {
    if (typeof window.isDashboardAdmin === 'function') return window.isDashboardAdmin();
    return document.body.classList.contains('role-admin');
  }

  function closeAllMenus() {
    document.querySelectorAll('.fd-users-kebab-menu').forEach(function (m) {
      m.hidden = true;
      m.classList.remove('fd-floating-menu-panel');
    });
    document.querySelectorAll('.fd-users-kebab').forEach(function (b) {
      b.setAttribute('aria-expanded', 'false');
    });
    openMenuId = null;
  }

  function ensureDismissBound() {
    if (document.body.dataset.fdUsersMenuBound === '1') return;
    document.body.dataset.fdUsersMenuBound = '1';
    document.addEventListener('click', closeAllMenus);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllMenus();
    });
  }

  function copyText(text, label) {
    var value = String(text || '');
    if (!value) return;
    var msg = label ? label + ' copiato' : 'ID copiato';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(function () {
        toast(msg);
      }).catch(function () {
        toast('Copia non riuscita');
      });
      return;
    }
    toast('Copia non supportata dal browser');
  }

  function ensureCreateUserButton() {
    var btn = document.getElementById('createUserBtn');
    if (!btn) return;
    btn.style.display = canManageUsers() ? '' : 'none';
    btn.classList.add('fd-btn', 'fd-btn--primary');
    btn.classList.remove('fd-btn-primary');
  }

  function slugifyTenantName(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  function jsonHeaders() {
    return Object.assign({}, authHeaders(), { 'Content-Type': 'application/json' });
  }

  async function postJson(path, body) {
    var res = await fetch(getApiBase() + path, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(body || {})
    });
    var payload = {};
    try { payload = await res.json(); } catch (_) {}
    if (!res.ok) throw new Error(payload.error || payload.message || res.statusText || String(res.status));
    return payload;
  }

  function buildHrStarterTemplate(brandId) {
    return {
      brand_id: brandId,
      name: 'Pass dipendente',
      pass_type: 'employee_pass',
      style: {
        backgroundColor: '#0B0817',
        foregroundColor: '#FFFFFF',
        labelColor: '#A78BFA'
      },
      fields: {
        headerFields: [],
        primaryFields: [{ key: 'name', label: 'NOME', value: '' }],
        secondaryFields: [{ key: 'area', label: 'AREA', value: '' }],
        auxiliaryFields: [{ key: 'coin', label: 'COIN', value: '0' }]
      },
      config: {
        source: 'tenant_wizard',
        product_line: 'hr'
      }
    };
  }

  function closeTenantWizard() {
    var modal = document.getElementById('fdTenantWizardModal');
    if (modal) modal.classList.remove('active');
  }

  function setTenantWizardStatus(message, tone) {
    var el = document.getElementById('fdTenantWizardStatus');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
    el.className = 'fd-tenant-wizard__status' + (tone ? ' fd-tenant-wizard__status--' + tone : '');
  }

  function humanizeTenantWizardError(error, context) {
    var msg = String((error && error.message) || error || '').trim();
    var lower = msg.toLowerCase();
    var brandName = context && context.brandName ? context.brandName : 'questo cliente';
    var managerEmail = context && context.managerEmail ? context.managerEmail : 'questa email';

    if (lower.includes('users_email_key') || lower.includes('duplicate') && lower.includes('email')) {
      return 'Ho creato il brand, ma la mail ' + managerEmail + ' è già in uso. Usa una mail diversa oppure assegna l’utente esistente al brand ' + brandName + '.';
    }

    if (lower.includes('brands_slug_key') || lower.includes('duplicate') && lower.includes('slug')) {
      return 'Esiste già un brand con questo slug. Se il brand è stato creato nel tentativo precedente, selezionalo dal menu in alto e crea solo il manager da Utenti.';
    }

    if (lower.includes('templates') || lower.includes('template')) {
      return 'Cliente e manager creati, ma il template HR base non è stato creato. Puoi crearlo dopo dalla pagina Template Pass.';
    }

    if (lower.includes('network') || lower.includes('failed to fetch')) {
      return 'Connessione interrotta durante la creazione. Controlla se il brand è comparso nel selettore prima di riprovare.';
    }

    return msg || 'Errore durante la creazione cliente. Controlla brand e utenti prima di riprovare.';
  }

  function selectCreatedBrand(brand) {
    if (!brand || !brand.id) return;
    try { window.brandId = brand.id; } catch (_) {}

    if (Array.isArray(window.brandsListCache)) {
      var exists = window.brandsListCache.some(function (b) { return String(b.id) === String(brand.id); });
      if (!exists) window.brandsListCache.push(brand);
    }

    var selector = document.getElementById('brandSelector');
    if (selector) {
      var option = Array.from(selector.options || []).find(function (o) {
        return String(o.value) === String(brand.id);
      });
      if (!option) {
        option = document.createElement('option');
        option.value = brand.id;
        option.textContent = brand.name || brand.slug || 'Nuovo brand';
        selector.appendChild(option);
      }
      selector.value = brand.id;
    }

    if (typeof window.onBrandChange === 'function') {
      window.onBrandChange();
      return;
    }
    if (typeof window.nav === 'function') window.nav('welcome');
    if (typeof window.fdLoadHome === 'function') window.fdLoadHome();
  }

  async function refreshBrandsAfterTenantCreate(brand) {
    if (typeof window.loadBrands === 'function') {
      try {
        await window.loadBrands();
      } catch (_) {}
    }
    selectCreatedBrand(brand);
  }

  async function submitTenantWizard() {
    var form = document.getElementById('fdTenantWizardForm');
    if (!form || form.dataset.busy === '1') return;
    var btn = document.getElementById('fdTenantWizardSubmit');
    var name = document.getElementById('fdTenantBrandName').value.trim();
    var slug = document.getElementById('fdTenantBrandSlug').value.trim();
    var managerName = document.getElementById('fdTenantManagerName').value.trim();
    var managerEmail = document.getElementById('fdTenantManagerEmail').value.trim().toLowerCase();
    var createTemplate = document.getElementById('fdTenantCreateTemplate').checked;

    if (!name || !slug || !managerName || !managerEmail) {
      setTenantWizardStatus('Compila azienda, slug, nome manager ed email.', 'error');
      return;
    }

    form.dataset.busy = '1';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creo cliente...';
    }
    setTenantWizardStatus('Creazione brand in corso...', 'info');

    var brand = null;
    try {
      brand = await postJson('/brands', {
        name: name,
        slug: slug,
        config: {
          product_line: 'hr',
          onboarding_created_at: new Date().toISOString()
        }
      });

      setTenantWizardStatus('Brand creato. Creo il manager e invio la mail di invito...', 'info');
      await postJson('/users', {
        name: managerName,
        email: managerEmail,
        role: 'manager',
        brand_id: brand.id
      });

      var templateWarning = '';
      if (createTemplate) {
        setTenantWizardStatus('Manager creato. Preparo il template HR base...', 'info');
        try {
          await postJson('/templates', buildHrStarterTemplate(brand.id));
        } catch (templateErr) {
          templateWarning = ' Template non creato: ' + (templateErr.message || 'errore sconosciuto') + '.';
        }
      }

      await refreshBrandsAfterTenantCreate(brand);
      setTenantWizardStatus('Cliente creato. Il manager riceverà la mail di attivazione.' + templateWarning, templateWarning ? 'warning' : 'success');
      toast('Cliente creato: ' + (brand.name || name));
      if (!templateWarning) setTimeout(closeTenantWizard, 700);
      if (typeof fdLoadUsers === 'function') fdLoadUsers();
    } catch (e) {
      setTenantWizardStatus(humanizeTenantWizardError(e, {
        brandName: name,
        managerEmail: managerEmail,
        brandCreated: !!(brand && brand.id)
      }), 'error');
    } finally {
      form.dataset.busy = '0';
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Crea cliente';
      }
    }
  }

  function ensureTenantWizardModal() {
    var existing = document.getElementById('fdTenantWizardModal');
    if (existing) return existing;

    var modal = document.createElement('div');
    modal.id = 'fdTenantWizardModal';
    modal.className = 'modal fd-tenant-wizard';
    modal.innerHTML =
      '<div class="modal-content fd-card fd-tenant-wizard__panel">' +
      '<button type="button" class="modal-close fd-tenant-wizard__close" aria-label="Chiudi">×</button>' +
      '<h2>Nuovo cliente</h2>' +
      '<p class="fd-tenant-wizard__lead">Crea un brand separato, il primo manager e il template HR base.</p>' +
      '<form id="fdTenantWizardForm" class="fd-tenant-wizard__form">' +
      '<div class="fd-tenant-wizard__grid">' +
      '<div class="form-group"><label for="fdTenantBrandName">Azienda / brand</label><input id="fdTenantBrandName" type="text" autocomplete="organization" required placeholder="es. Rossi Group"></div>' +
      '<div class="form-group"><label for="fdTenantBrandSlug">Slug pubblico</label><input id="fdTenantBrandSlug" type="text" required placeholder="rossi-group"></div>' +
      '<div class="form-group"><label for="fdTenantManagerName">Nome manager</label><input id="fdTenantManagerName" type="text" autocomplete="name" required placeholder="Nome Cognome"></div>' +
      '<div class="form-group"><label for="fdTenantManagerEmail">Email manager</label><input id="fdTenantManagerEmail" type="email" autocomplete="email" required placeholder="manager@azienda.it"></div>' +
      '</div>' +
      '<label class="fd-tenant-wizard__check"><input id="fdTenantCreateTemplate" type="checkbox" checked> Crea template HR base</label>' +
      '<p id="fdTenantWizardStatus" class="fd-tenant-wizard__status" hidden></p>' +
      '<div class="fd-tenant-wizard__actions">' +
      '<button type="button" class="btn sec fd-btn fd-btn--ghost" id="fdTenantWizardCancel">Annulla</button>' +
      '<button type="submit" class="btn fd-btn fd-btn--primary" id="fdTenantWizardSubmit">Crea cliente</button>' +
      '</div>' +
      '</form>' +
      '</div>';
    document.body.appendChild(modal);

    var nameEl = modal.querySelector('#fdTenantBrandName');
    var slugEl = modal.querySelector('#fdTenantBrandSlug');
    if (nameEl && slugEl) {
      nameEl.addEventListener('input', function () {
        if (slugEl.dataset.touched === '1') return;
        slugEl.value = slugifyTenantName(nameEl.value);
      });
      slugEl.addEventListener('input', function () {
        slugEl.dataset.touched = '1';
        slugEl.value = slugifyTenantName(slugEl.value);
      });
    }
    modal.querySelector('#fdTenantWizardForm').addEventListener('submit', function (e) {
      e.preventDefault();
      submitTenantWizard();
    });
    modal.querySelector('#fdTenantWizardCancel').addEventListener('click', closeTenantWizard);
    modal.querySelector('.fd-tenant-wizard__close').addEventListener('click', closeTenantWizard);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeTenantWizard();
    });
    return modal;
  }

  function openTenantWizard() {
    if (!isAdminUser()) return;
    var modal = ensureTenantWizardModal();
    modal.querySelector('#fdTenantWizardForm').reset();
    var slugEl = modal.querySelector('#fdTenantBrandSlug');
    if (slugEl) slugEl.dataset.touched = '0';
    setTenantWizardStatus('', '');
    modal.classList.add('active');
    setTimeout(function () {
      var first = modal.querySelector('#fdTenantBrandName');
      if (first) first.focus();
    }, 30);
  }

  function ensureTenantWizardButton() {
    var createUserBtn = document.getElementById('createUserBtn');
    if (!createUserBtn) return;
    var isAdmin = isAdminUser();
    var toolbar = createUserBtn.closest('.fd-users-toolbar') || createUserBtn.parentNode;
    if (!toolbar) return;
    var btn = document.getElementById('fdTenantWizardBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'fdTenantWizardBtn';
      btn.className = 'btn sec fd-btn fd-btn--ghost';
      btn.textContent = 'Nuovo cliente';
      btn.addEventListener('click', openTenantWizard);
      toolbar.insertBefore(btn, createUserBtn);
    }
    btn.style.display = isAdmin ? '' : 'none';
  }

  function getUserBrandGroup() {
    var brandSel = document.getElementById('userBrand');
    if (!brandSel) return null;
    var group = brandSel.closest('.form-group');
    if (group && !group.id) group.id = 'userBrandGroup';
    return group;
  }

  function normalizeUserRole(role) {
    var r = String(role || 'manager').toLowerCase();
    if (r === 'viewer') return 'reporter';
    return r;
  }

  function roleNeedsAssignedBrand(role) {
    var r = normalizeUserRole(role);
    return r === 'manager' || r === 'sender' || r === 'reporter';
  }

  function syncUserBrandFieldVisibility() {
    var roleEl = document.getElementById('userRole');
    var group = getUserBrandGroup();
    if (!roleEl || !group) return;
    var needsBrand = roleNeedsAssignedBrand(roleEl.value);
    group.hidden = !needsBrand;
    if (!needsBrand) {
      var brandSel = document.getElementById('userBrand');
      if (brandSel) brandSel.value = '';
    }
  }

  window.fdSyncUserBrandFieldVisibility = syncUserBrandFieldVisibility;

  function syncUserRoleOptions() {
    var roleEl = document.getElementById('userRole');
    if (!roleEl) return;
    var adminOption = roleEl.querySelector('option[value="admin"]');
    if (adminOption) adminOption.hidden = !isAdminUser();
    if (!isAdminUser() && roleEl.value === 'admin') roleEl.value = 'manager';
  }

  function wireCreateUserForm() {
    if (document.body.dataset.fdUserFormBound === '1') return;
    document.body.dataset.fdUserFormBound = '1';

    var nameEl = document.getElementById('userName');
    var emailEl = document.getElementById('userEmail');
    if (nameEl) {
      nameEl.setAttribute('autocomplete', 'name');
      nameEl.setAttribute('name', 'name');
    }
    if (emailEl) {
      emailEl.setAttribute('autocomplete', 'email');
      emailEl.setAttribute('name', 'email');
    }

    var roleEl = document.getElementById('userRole');
    if (roleEl) roleEl.addEventListener('change', function () {
      syncUserRoleOptions();
      syncUserBrandFieldVisibility();
    });

    syncUserRoleOptions();
    syncUserBrandFieldVisibility();
    patchUserModalHooks();
  }

  function patchUserModalHooks() {
    if (window.__fdUserModalHooksPatched) return;
    window.__fdUserModalHooksPatched = true;

    var origOpen = window.openCreateUserModal;
    if (typeof origOpen === 'function') {
      window.openCreateUserModal = function () {
        origOpen.apply(this, arguments);
        syncUserRoleOptions();
        syncUserBrandFieldVisibility();
      };
    }

    var origCreate = window.createUser;
    if (typeof origCreate === 'function') {
      window.createUser = async function () {
        var roleEl = document.getElementById('userRole');
        var brandSel = document.getElementById('userBrand');
        if (roleEl && roleEl.value === 'admin' && brandSel) brandSel.value = '';
        return origCreate.apply(this, arguments);
      };
    }
  }

  function ensureConfirmDialogCentering() {
    var dlg = document.getElementById('appConfirmDialog');
    if (!dlg || dlg.dataset.fdConfirmCentered === '1') return;
    dlg.dataset.fdConfirmCentered = '1';
    if (dlg.parentNode && dlg.parentNode !== document.body) {
      document.body.appendChild(dlg);
    }
  }

  function enhanceUserModal() {
    var modal = document.getElementById('userModal');
    if (!modal || modal.dataset.fdDsModal === '1') return;
    modal.dataset.fdDsModal = '1';
    var panel = modal.querySelector('.modal-content');
    if (panel) panel.classList.add('fd-card', 'fd-users-modal');
    modal.querySelectorAll('.btn.fd-btn-primary, .btn:not(.sec):not(.danger)').forEach(function (btn) {
      if (btn.closest('#userModal')) {
        btn.classList.add('fd-btn', 'fd-btn--primary');
      }
    });
    modal.querySelectorAll('.btn.sec').forEach(function (btn) {
      btn.classList.add('fd-btn', 'fd-btn--ghost', 'fd-btn--sm');
    });
  }

  function ensureUsersChrome() {
    var section = document.getElementById('users');
    if (!section) return;
    if (!section.classList.contains('users--fd')) {
      section.classList.add('users--fd');
    }
    section.classList.add('users--fd-ds');
    ensureCreateUserButton();
    ensureTenantWizardButton();
    wireCreateUserForm();
    ensureConfirmDialogCentering();
    enhanceUserModal();

    if (section.classList.contains('fd-users-chrome-ready')) return;
    section.classList.add('fd-users-chrome-ready');

    var title = section.querySelector('h1.page-title, h1.sec-title');
    var legacyToolbar = section.querySelector(':scope > div[style*="justify-content"]');
    var lead = legacyToolbar && legacyToolbar.querySelector('p');

    if (title && !title.closest('.fd-page-header')) {
      var header = document.createElement('header');
      header.className = 'fd-page-header fd-users-header';
      var copy = document.createElement('div');
      copy.className = 'fd-page-header__copy';
      copy.appendChild(title);
      title.classList.add('fd-page-header__title');
      if (lead) {
        lead.classList.add('fd-page-header__lead', 'fd-users-lead');
        lead.style.color = '';
        lead.style.fontSize = '';
        copy.appendChild(lead);
      }
      header.appendChild(copy);
      section.insertBefore(header, section.firstChild);
    }

    if (legacyToolbar && !legacyToolbar.classList.contains('fd-toolbar')) {
      legacyToolbar.classList.add('fd-toolbar', 'fd-users-toolbar');
      legacyToolbar.style.display = '';
      legacyToolbar.style.justifyContent = '';
      legacyToolbar.style.alignItems = '';
      legacyToolbar.style.marginBottom = '';
      if (!lead) {
        var fallbackLead = legacyToolbar.querySelector('p');
        if (fallbackLead) fallbackLead.classList.add('fd-users-lead');
      } else if (lead.parentNode === legacyToolbar && lead.closest('.fd-page-header')) {
        legacyToolbar.removeChild(lead);
      }
    }

    var table = document.getElementById('usersTable');
    if (table && !table.closest('.fd-table-wrap, .fd-users-table-wrap')) {
      var wrap = document.createElement('div');
      wrap.className = 'fd-table-wrap fd-users-table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    }
    if (table) table.classList.add('fd-table');

    var actionsTh = table && table.querySelector('thead th:last-child');
    if (actionsTh) actionsTh.textContent = '';
    if (actionsTh) actionsTh.setAttribute('aria-label', 'Azioni');
  }

  async function loadBrandMap() {
    var map = {};
    var cache = [];
    try {
      cache = window.brandsListCache || [];
    } catch (_) {}
    cache.forEach(function (b) {
      if (b && b.id) map[String(b.id)] = b.name || b.slug || String(b.id);
    });
    var sel = document.getElementById('brandSelector');
    if (sel) {
      Array.from(sel.options || []).forEach(function (o) {
        if (!o.value) return;
        var label = String(o.textContent || '').trim();
        if (label) map[String(o.value)] = label;
      });
    }
    if (Object.keys(map).length) return map;
    try {
      var res = await fetch(getApiBase() + '/brands', { headers: authHeaders() });
      if (!res.ok) return map;
      var brands = await res.json();
      (brands || []).forEach(function (b) {
        if (b && b.id) map[String(b.id)] = b.name || b.slug || String(b.id);
      });
    } catch (_) {}
    return map;
  }

  function normalizeUserRole(role) {
    var r = String(role || 'manager').toLowerCase();
    if (r === 'viewer') return 'reporter';
    return r;
  }

  function roleLabel(role) {
    var r = normalizeUserRole(role);
    return {
      admin: 'Admin',
      manager: 'Manager',
      sender: 'Sender',
      reporter: 'Reporter',
      viewer: 'Reporter'
    }[r] || role;
  }

  function roleBadgeClass(role) {
    var r = normalizeUserRole(role);
    if (r === 'admin') return 'active';
    if (r === 'manager' || r === 'sender') return 'inactive';
    return 'inactive';
  }

  function renderBrandCell(u, brandMap) {
    if (!u.brand_id) {
      return '<td class="fd-users-brand"><span class="fd-users-brand__name">Tutti i brand</span></td>';
    }
    var id = String(u.brand_id);
    var name = brandMap[id];
    if (!name) {
      return (
        '<td class="fd-users-brand">' +
        '<span class="fd-users-brand__name fd-users-brand__name--unknown" title="ID: ' + esc(id) + '">Brand non disponibile</span>' +
        '</td>'
      );
    }
    return (
      '<td class="fd-users-brand">' +
      '<span class="fd-users-brand__name">' + esc(name) + '</span>' +
      '<span class="fd-users-brand__id-row">' +
      '<code class="fd-users-brand__id" title="Brand ID: ' + esc(id) + '">' + esc(id.slice(0, 8)) + '…</code>' +
      '<button type="button" class="fd-users-copy" data-copy-id="' + esc(id) + '" data-copy-label="Brand ID" aria-label="Copia Brand ID completo" title="Copia Brand ID: ' + esc(id) + '">⧉</button>' +
      '</span></td>'
    );
  }

  function renderActionsCell(u, protectedAdmin) {
    var menuId = 'fd-users-menu-' + u.id;
    var items = '<button type="button" class="fd-users-kebab-item" data-action="edit" data-user-id="' + esc(u.id) + '">Modifica</button>';
    items += '<button type="button" class="fd-users-kebab-item" data-action="resend" data-user-id="' + esc(u.id) + '">Reinvia mail</button>';
    if (!protectedAdmin) {
      items += '<button type="button" class="fd-users-kebab-item fd-users-kebab-item--danger" data-action="delete" data-user-id="' + esc(u.id) + '">Elimina</button>';
    }
    return (
      '<td><div class="fd-users-kebab-wrap">' +
      '<button type="button" class="fd-users-kebab" aria-label="Azioni utente" aria-haspopup="menu" aria-expanded="false" data-menu-trigger="' + esc(menuId) + '">⋮</button>' +
      '<div class="fd-users-kebab-menu" id="' + esc(menuId) + '" role="menu" hidden>' + items + '</div>' +
      '</div></td>'
    );
  }

  function bindTableInteractions(tbody) {
    tbody.querySelectorAll('.fd-users-copy').forEach(function (btn) {
      if (btn.dataset.fdBound === '1') return;
      btn.dataset.fdBound = '1';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        copyText(btn.getAttribute('data-copy-id'), btn.getAttribute('data-copy-label') || 'Brand ID');
      });
    });

    tbody.querySelectorAll('.fd-users-brand__id').forEach(function (code) {
      if (code.dataset.fdBound === '1') return;
      code.dataset.fdBound = '1';
      code.addEventListener('click', function () {
        var row = code.closest('.fd-users-brand__id-row');
        var btn = row ? row.querySelector('.fd-users-copy') : null;
        if (btn) copyText(btn.getAttribute('data-copy-id'), 'Brand ID');
      });
    });

    tbody.querySelectorAll('.fd-users-kebab').forEach(function (btn) {
      if (btn.dataset.fdBound === '1') return;
      btn.dataset.fdBound = '1';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var menuId = btn.getAttribute('data-menu-trigger');
        var menu = document.getElementById(menuId);
        if (!menu) return;
        var willOpen = menu.hidden;
        closeAllMenus();
        if (willOpen) {
          btn.setAttribute('aria-expanded', 'true');
          openMenuId = menuId;
          if (typeof window.fdPositionFloatingMenu === 'function') {
            window.fdPositionFloatingMenu(btn, menu);
          } else {
            menu.hidden = false;
          }
        }
      });
    });

    tbody.querySelectorAll('.fd-users-kebab-item').forEach(function (item) {
      if (item.dataset.fdBound === '1') return;
      item.dataset.fdBound = '1';
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        closeAllMenus();
        var uid = item.getAttribute('data-user-id');
        var action = item.getAttribute('data-action');
        if (action === 'edit' && typeof window.openEditUserModal === 'function') {
          var user = (window.__fdUsersCache || []).find(function (row) { return String(row.id) === String(uid); });
          if (user) window.openEditUserModal(user);
        } else if (action === 'resend' && typeof window.resendInvite === 'function') {
          window.resendInvite(uid);
        } else if (action === 'delete' && typeof window.deleteUser === 'function') {
          window.deleteUser(uid);
        }
      });
    });
  }

  async function fdLoadUsers() {
    if (!isFiloUsersApp()) return;
    if (!canManageUsers()) return;
    ensureDismissBound();
    ensureUsersChrome();
    ensureCreateUserButton();
    ensureTenantWizardButton();

    var section = document.getElementById('users');
    if (section) section.classList.add('fd-users--loading');

    var tbody = document.querySelector('#usersTable tbody');
    if (!tbody) return;

    if (typeof window.renderTableSkeletonRows === 'function') {
      tbody.innerHTML = window.renderTableSkeletonRows(6, 6);
    } else {
      tbody.innerHTML = '<tr><td colspan="6" style="color:var(--text2);padding:16px;">Caricamento…</td></tr>';
    }

    try {
      var res = await fetch(getApiBase() + '/users', { headers: authHeaders() });
      if (!res.ok) {
        var err = await res.json().catch(function () { return {}; });
        throw new Error(err.error || String(res.status));
      }
      var users = await res.json();
      window.__fdUsersCache = users;
      var allowlist = typeof window.getDashboardLoginAllowlist === 'function'
        ? window.getDashboardLoginAllowlist()
        : null;
      var brandMap = await loadBrandMap();

      if (!users.length) {
        var emptyHtml = typeof window.renderEmptyState === 'function'
          ? window.renderEmptyState({
            title: 'Nessun utente',
            description: 'Crea il primo accesso alla dashboard.',
            ctaLabel: 'Nuovo utente',
            ctaOnclick: 'openCreateUserModal()',
            icon: 'users'
          })
          : '<span style="color:var(--text2)">Nessun utente</span>';
        tbody.innerHTML = '<tr><td colspan="6">' + emptyHtml + '</td></tr>';
        return;
      }

      tbody.innerHTML = users.map(function (u) {
        var protectedAdmin = allowlist && allowlist.includes(String(u.email || '').toLowerCase());
        var statusCell = protectedAdmin
          ? '<span class="fd-users-protected" title="Utente di sistema protetto, non eliminabile">' +
            '<span class="fd-users-protected__icon" aria-hidden="true">🔒</span> Protetto</span>'
          : '<span class="fd-users-status fd-users-status--active" title="Account attivo">' +
            '<span class="fd-users-status__icon" aria-hidden="true">✓</span> Attivo</span>';
        return (
          '<tr>' +
          '<td>' + esc(u.name) + '</td>' +
          '<td>' + esc(u.email) + '</td>' +
          '<td><span class="badge fd-users-role ' + roleBadgeClass(u.role) + '">' + esc(roleLabel(u.role)) + '</span></td>' +
          renderBrandCell(u, brandMap) +
          '<td>' + statusCell + '</td>' +
          renderActionsCell(u, protectedAdmin) +
          '</tr>'
        );
      }).join('');

      bindTableInteractions(tbody);
    } catch (e) {
      toast('Errore utenti: ' + (e.message || 'caricamento fallito'));
      if (typeof window.renderTableErrorRow === 'function') {
        tbody.innerHTML = window.renderTableErrorRow(6, e.message || 'Errore caricamento utenti', 'fdLoadUsers()');
      } else {
        tbody.innerHTML = '<tr><td colspan="6" style="color:var(--red)">Errore: ' + esc(e.message) + '</td></tr>';
      }
    } finally {
      if (section) section.classList.remove('fd-users--loading');
      if (typeof window.fdEnhanceResponsiveTables === 'function') {
        window.fdEnhanceResponsiveTables();
      }
    }
  }

  function patchUsersNav() {
    if (window.__fdUsersNavPatched || typeof window.nav !== 'function') return;
    window.__fdUsersNavPatched = true;
    var orig = window.nav;
    window.nav = function (sectionId) {
      var out = orig.apply(this, arguments);
      if (sectionId === 'users') {
        setTimeout(function () {
          if (isFiloUsersApp()) ensureUsersChrome();
        }, 80);
      }
      return out;
    };
  }

  window.fdLoadUsers = fdLoadUsers;
  window.fdOpenTenantWizard = openTenantWizard;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (!isFiloUsersApp()) return;
      ensureConfirmDialogCentering();
      wireCreateUserForm();
      patchUsersNav();
      ensureUsersChrome();
    });
  } else if (isFiloUsersApp()) {
    ensureConfirmDialogCentering();
    wireCreateUserForm();
    patchUsersNav();
    ensureUsersChrome();
  }
})();


/* === fd-contacts.js === */
/**
 * FD-04 — FiloDiretto Contatti: responsive KPI strip, export in card ⋮ menu.
 */
(function () {
  'use strict';

  var KPI_ICONS = {
    total: '👥',
    with_employee_id: '🪪',
    with_email: '✉️',
    candidate: '📋',
    invited: '📨',
    activated: '✅',
    pass_installed: '📱'
  };

  function isFiloContactsApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function isHrLeadsActive() {
    try {
      return !!window.leadsHrMode;
    } catch (_) {
      return false;
    }
  }

  function ensureLeadsSection() {
    var section = document.getElementById('leads');
    if (!section) return null;
    section.classList.add('leads--fd');
    return section;
  }

  function closePageMenu() {
    var panel = document.getElementById('contactsPageMenuPanel');
    var trigger = document.getElementById('contactsPageMenuBtn');
    if (panel) panel.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function stripLeadsHeaderDuplicates() {
    if (!isFiloContactsApp() || !isHrLeadsActive()) return;

    var headerActions = document.getElementById('a2wContactsHeaderActions');
    if (headerActions) {
      headerActions.hidden = true;
      headerActions.setAttribute('aria-hidden', 'true');
      headerActions.style.display = 'none';
    }

    var pageMenu = document.getElementById('contactsPageMenu');
    if (pageMenu) {
      pageMenu.hidden = true;
      pageMenu.setAttribute('aria-hidden', 'true');
      pageMenu.style.display = 'none';
    }

    var legacyExport = document.getElementById('fdContactsPageExportBtn');
    if (legacyExport) legacyExport.remove();
  }

  function closeToolbarOverflowMenu() {
    var panel = document.getElementById('fdContactsToolbarOverflowPanel');
    var trigger = document.getElementById('fdContactsToolbarOverflowBtn');
    if (panel) panel.hidden = true;
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function ensureToolbarOverflowMenu() {
    if (!isFiloContactsApp() || !isHrLeadsActive()) return;
    var host = document.getElementById('contactsToolbarHost');
    if (!host) return;
    var actions = host.querySelector('.contacts-toolbar__actions, .a2w-contacts-toolbar-actions');
    if (!actions) return;

    var overflowBtn = document.getElementById('fdContactsToolbarOverflowBtn');
    var panel = document.getElementById('fdContactsToolbarOverflowPanel');

    if (!overflowBtn) {
      overflowBtn = document.createElement('button');
      overflowBtn.type = 'button';
      overflowBtn.id = 'fdContactsToolbarOverflowBtn';
      overflowBtn.className = 'fd-btn fd-btn--ghost fd-btn--sm fd-contacts-toolbar-overflow fd-contacts-toolbar-overflow--always';
      overflowBtn.textContent = '•••';
      overflowBtn.setAttribute('aria-haspopup', 'menu');
      overflowBtn.setAttribute('aria-expanded', 'false');
      overflowBtn.setAttribute('aria-label', 'Altre azioni anagrafica');
      actions.appendChild(overflowBtn);
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'fdContactsToolbarOverflowPanel';
      panel.className = 'fd-contacts-toolbar-overflow-panel';
      panel.hidden = true;
      panel.setAttribute('role', 'menu');
      actions.appendChild(panel);
    }

    if (host.dataset.fdOverflowBound !== '1') {
      host.dataset.fdOverflowBound = '1';
      overflowBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = panel.hidden;
        closeToolbarOverflowMenu();
        if (open) {
          panel.hidden = false;
          overflowBtn.setAttribute('aria-expanded', 'true');
        }
      });

      document.addEventListener('click', function (e) {
        if (!panel.hidden && !panel.contains(e.target) && e.target !== overflowBtn) {
          closeToolbarOverflowMenu();
        }
      });
    }

    panel.innerHTML = '';
    ensureToolbarOverflowStaticItems(panel);
  }

  function ensureToolbarOverflowStaticItems(panel) {
    if (!panel) return;

    var exportItem = document.createElement('button');
    exportItem.type = 'button';
    exportItem.role = 'menuitem';
    exportItem.className = 'fd-contacts-toolbar-overflow-panel__item';
    exportItem.id = 'fdContactsOverflowExportBtn';
    exportItem.textContent = 'Esporta CSV dipendenti';
    exportItem.addEventListener('click', function (e) {
      e.stopPropagation();
      closeToolbarOverflowMenu();
      if (exportItem.disabled) return;
      if (typeof window.exportLeadsCSV === 'function') window.exportLeadsCSV();
    });
    panel.appendChild(exportItem);

    var tourItem = document.createElement('button');
    tourItem.type = 'button';
    tourItem.role = 'menuitem';
    tourItem.className = 'fd-contacts-toolbar-overflow-panel__item';
    tourItem.id = 'fdContactsOverflowTourBtn';
    tourItem.textContent = 'Mostra tour';
    tourItem.addEventListener('click', function (e) {
      e.stopPropagation();
      closeToolbarOverflowMenu();
      if (window.ContactsPage && typeof window.ContactsPage.showTour === 'function') {
        window.ContactsPage.showTour();
      }
    });
    panel.appendChild(tourItem);
  }

  function wireContactsHelpPopover() {
    var host = document.getElementById('contactsCardAHelp');
    if (!host || host.dataset.fdHelpWired === '1') return;
    if (!window.HelpPopover || typeof window.HelpPopover.render !== 'function') return;
    host.dataset.fdHelpWired = '1';
    host.classList.add('fd-contacts-help-host');
    window.HelpPopover.render({
      host: host,
      title: 'Anagrafica dipendenti',
      what: 'Elenco centrale di tutti i dipendenti del brand con stato anagrafico e distribuzione pass.',
      whenToUse: [
        'Cercare o filtrare dipendenti',
        'Aggiungere o importare anagrafica',
        'Inviare attivazioni e monitorare lo stato pass'
      ],
      effects: 'Le azioni qui aggiornano la tabella sottostante e i KPI di riepilogo.',
      example: 'Filtra «Da invitare», seleziona i contatti e invia l\'email di attivazione del pass.'
    });
  }

  function simplifyCardHelp() {
    /* Help popover stays interactive — positioned via HelpPopover (flip + shift). */
    wireContactsHelpPopover();
  }

  function ensureCardMenu() {
    /* Card-level kebab removed — export/tour live in toolbar overflow menu. */
  }

  function syncFiloExportMenuState() {
    if (!isFiloContactsApp() || !isHrLeadsActive()) return;
    var exportItem = document.getElementById('fdContactsOverflowExportBtn');
    if (!exportItem) return;

    var total = 0;
    var filteredLen = 0;
    try {
      total = Array.isArray(window.allLeads) ? window.allLeads.length : 0;
      if (typeof window.getFilteredLeadsByUiState === 'function') {
        filteredLen = window.getFilteredLeadsByUiState().length;
      }
    } catch (_) {}

    var disabled = total === 0 || !filteredLen;
    exportItem.disabled = disabled;
    exportItem.title = total === 0
      ? 'Nessun dipendente da esportare'
      : (filteredLen ? 'Esporta dipendenti filtrati in CSV' : 'Nessun risultato con i filtri attivi');
  }

  function enhanceFiloKpiStrip() {
    if (!isFiloContactsApp()) return;
    var host = document.getElementById('leadsStats');
    if (!host) return;
    host.classList.add('fd-contacts-kpi');
    if (!isHrLeadsActive()) return;

    host.querySelectorAll('.contacts-kpi-strip__item').forEach(function (btn) {
      var key = btn.dataset.kpiKey;
      if (!key || btn.classList.contains('fd-contacts-kpi-item')) return;
      btn.classList.add('fd-contacts-kpi-item');
      var icon = document.createElement('span');
      icon.className = 'fd-contacts-kpi-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = KPI_ICONS[key] || '•';
      btn.insertBefore(icon, btn.firstChild);
    });
  }

  function enhanceFiloContactsToolbar() {
    if (!isFiloContactsApp() || !isHrLeadsActive()) return;
    stripLeadsHeaderDuplicates();
    wireContactsHelpPopover();
    ensureToolbarOverflowMenu();
    syncFiloExportMenuState();
  }

  function enhanceContactsSectionDesign() {
    var section = ensureLeadsSection();
    if (!section || section.dataset.fdDsSection === '1') return;
    section.dataset.fdDsSection = '1';
    section.classList.add('leads--fd-ds');

    var header = section.querySelector('.contacts-page-header');
    if (header && !header.classList.contains('fd-page-header')) {
      header.classList.add('fd-page-header', 'fd-contacts-header');
      var copyDiv = header.querySelector(':scope > div:first-child');
      if (copyDiv) copyDiv.classList.add('fd-page-header__copy');
      var h1 = header.querySelector('h1');
      if (h1) h1.classList.add('fd-page-header__title');
      var blurb = header.querySelector('.contacts-page-blurb');
      if (blurb) blurb.classList.add('fd-page-header__lead');
      var actions = header.querySelector('.a2w-contacts-header-actions');
      if (actions) actions.classList.add('fd-page-header__actions', 'fd-contacts-header__actions');
    }

    var cardA = document.getElementById('contactsCardA');
    if (cardA) cardA.classList.add('fd-card', 'fd-contacts-card');

    var tabs = section.querySelector('#leadsSectionTabs');
    if (tabs) tabs.classList.add('fd-contacts-tabs');

    if (typeof window.fdInjectBrandPassFlowBar === 'function') {
      window.fdInjectBrandPassFlowBar('leads');
    }
    if (typeof window.fdRelocateBrandPassFlowBar === 'function') {
      window.fdRelocateBrandPassFlowBar(section);
    }
  }

  function wrapLeadsTable() {
    var table = document.getElementById('leadsTable');
    if (!table || table.closest('.fd-table-wrap, .fd-contacts-table-wrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'fd-table-wrap fd-contacts-table-wrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
    table.classList.add('fd-table');
  }

  function applyContactsDsButtons() {
    if (!isFiloContactsApp() || !isHrLeadsActive()) return;
    var addBtn = document.getElementById('leadsAddBtn');
    if (addBtn) {
      addBtn.classList.remove('sec', 'a2w-btn-primary');
      addBtn.classList.add('small');
    }
    var importBtn = document.getElementById('leadsImportBtn');
    if (importBtn) {
      importBtn.classList.add('sec', 'small');
    }

    var toolbar = document.getElementById('contactsToolbarHost');
    if (toolbar) {
      toolbar.querySelectorAll('button.btn').forEach(function (btn) {
        if (btn.id === 'leadsAddBtn') return;
        if (btn.classList.contains('danger')) {
          btn.classList.add('small');
        } else if (btn.id === 'a2wLeadsSendActivationBtn' || btn.id === 'leadsDistributeBtn') {
          btn.classList.add('sec', 'small');
        } else {
          btn.classList.add('sec', 'small');
        }
      });
    }

    var menuBtn = document.getElementById('fdContactsToolbarOverflowBtn');
    if (menuBtn) menuBtn.classList.add('fd-btn-ghost', 'small');
  }

  function enhanceContactsKpiAsStatGrid() {
    var host = document.getElementById('leadsStats');
    if (!host || !host.querySelector('.contacts-kpi-strip__item')) return;
    host.classList.add('fd-contacts-stat-grid');
  }

  function enhanceContactsDom() {
    if (!isFiloContactsApp() || !isHrLeadsActive()) return;
    enhanceContactsSectionDesign();
    if (typeof window.fdInjectBrandPassFlowBar === 'function') {
      window.fdInjectBrandPassFlowBar('leads');
    }
    wrapLeadsTable();
    enhanceContactsKpiAsStatGrid();
    enhanceFiloKpiStrip();
    enhanceFiloContactsToolbar();
    applyContactsDsButtons();
    if (typeof window.fdEnhanceResponsiveTables === 'function') {
      window.fdEnhanceResponsiveTables();
    }
  }

  function patchLoadLeadsForDs() {
    if (window.__fdContactsLoadDsPatched || typeof window.loadLeads !== 'function') return;
    window.__fdContactsLoadDsPatched = true;
    var orig = window.loadLeads;
    window.loadLeads = async function () {
      if (isFiloContactsApp() && isHrLeadsActive()) enhanceContactsSectionDesign();
      await orig.apply(this, arguments);
      if (isFiloContactsApp() && isHrLeadsActive()) enhanceContactsDom();
    };
  }

  function patchNavForContacts() {
    if (window.__fdContactsNavPatched || typeof window.nav !== 'function') return;
    window.__fdContactsNavPatched = true;
    var origNav = window.nav;
    window.nav = function (id) {
      var r = origNav.apply(this, arguments);
      var done = function () {
        if (id === 'leads' && isFiloContactsApp()) enhanceContactsDom();
      };
      if (r && typeof r.then === 'function') return r.then(done);
      setTimeout(done, 120);
      return r;
    };
  }

  function patchLeadsRenderers() {
    if (window.__fdContactsPatched) return;
    window.__fdContactsPatched = true;

    var origKpi = window.renderLeadsKpiStrip;
    if (typeof origKpi === 'function') {
      window.renderLeadsKpiStrip = function () {
        origKpi.apply(this, arguments);
        if (isFiloContactsApp()) enhanceFiloKpiStrip();
      };
    }

    var origToolbar = window.renderLeadsToolbar;
    if (typeof origToolbar === 'function') {
      window.renderLeadsToolbar = function () {
        origToolbar.apply(this, arguments);
        if (isFiloContactsApp()) {
          enhanceFiloContactsToolbar();
          applyContactsDsButtons();
        }
      };
    }

    var origSyncExport = window.syncA2wLeadsExportButtonState;
    if (typeof origSyncExport === 'function') {
      window.syncA2wLeadsExportButtonState = function () {
        origSyncExport.apply(this, arguments);
        if (isFiloContactsApp()) syncFiloExportMenuState();
      };
    }
  }

  function initFdContacts() {
    if (!isFiloContactsApp()) return;
    patchLeadsRenderers();
    patchLoadLeadsForDs();
    patchNavForContacts();
    ensureLeadsSection();
    if (isHrLeadsActive()) {
      stripLeadsHeaderDuplicates();
      enhanceContactsDom();
    }
  }

  window.fdInitContacts = initFdContacts;
  window.fdSyncContactsExport = syncFiloExportMenuState;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdContacts);
  } else {
    initFdContacts();
  }
})();


/* === fd-media-library.js === */
/**
 * Filo HR — Media Library: layout semplificato (tutti i tipi asset, nessun campo nascosto).
 */
(function () {
  'use strict';
  var selectedIds = new Set();
  var pendingDeleteAsset = null;

  function authHeaders() {
    if (typeof window.getDashboardFetchHeaders === 'function') return window.getDashboardFetchHeaders();
    if (typeof window.getAuthHeaders === 'function') return window.getAuthHeaders();
    return {};
  }

  function mediaRowsFromPayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.items)) return payload.items;
    if (payload && Array.isArray(payload.media)) return payload.media;
    return [];
  }

  function isValidBrandId(value) {
    if (value == null) return false;
    var id = String(value).trim();
    if (!id || id === 'undefined' || id === 'null') return false;
    return true;
  }

  function getCurrentBrandId() {
    var candidates = [];
    try {
      if (window.brandId) candidates.push(window.brandId);
    } catch (_) {}
    try {
      var sel = document.getElementById('brandSelector');
      if (sel && sel.value) candidates.push(sel.value);
    } catch (_) {}
    try {
      var qpBrandId = new URLSearchParams(window.location.search || '').get('brand_id');
      if (qpBrandId) candidates.push(qpBrandId);
    } catch (_) {}
    for (var i = 0; i < candidates.length; i++) {
      var id = String(candidates[i]).trim();
      if (isValidBrandId(id)) return id;
    }
    return '';
  }

  function syncDashboardBrandId(brandId) {
    if (!isValidBrandId(brandId)) return;
    try { window.brandId = brandId; } catch (_) {}
    if (typeof window.ensureBrandIdFromContext === 'function') {
      try { window.ensureBrandIdFromContext(); } catch (_) {}
    }
  }

  var SECTION_META = {
    logo: {
      tabLabel: 'Logo brand',
      title: 'Logo brand',
      hint: 'PNG trasparente, max 320×100 px — normalmente unico. Cambialo solo in caso di rebranding.',
      uploadLabel: 'Carica logo'
    },
    wallet_icon: {
      tabLabel: 'Icona notifiche',
      title: 'Icona notifiche Wallet',
      hint: '512×512 px — icona mostrata nelle push notification Wallet su iPhone.',
      uploadLabel: 'Carica icona'
    },
    strip: {
      tabLabel: 'Strip',
      title: 'Strip',
      hint: '750×246 px — banner in alto sul pass; puoi avere più varianti (default, promo, evento).',
      uploadLabel: 'Carica strip'
    },
    thumbnail: {
      tabLabel: 'Thumbnail',
      title: 'Thumbnail',
      hint: '90×90 px — usato su Event Ticket (fronte pass).',
      uploadLabel: 'Carica thumbnail'
    },
    background: {
      tabLabel: 'Background',
      title: 'Background',
      hint: '360×440 px — sfondo intero su layout Event Ticket.',
      uploadLabel: 'Carica background'
    }
  };

  var CATEGORY_ORDER = ['logo', 'wallet_icon', 'strip', 'thumbnail', 'background'];
  var STORAGE_KEY = 'fdMediaCategory';
  var GALLERY_OPEN_PREFIX = 'fdMediaGalleryOpen:';
  var BUCKET_ID_BY_TYPE = {
    logo: 'fdMediaLogoCard',
    wallet_icon: 'fdMediaWalletIconCard',
    strip: 'fdMediaStripCard',
    thumbnail: 'fdMediaThumbCard',
    background: 'fdMediaBackgroundCard'
  };
  var HOST_ID_BY_TYPE = {
    logo: 'mediaLogoBox',
    wallet_icon: 'mediaWalletIconGrid',
    strip: 'mediaStripGrid',
    thumbnail: 'mediaThumbnailGrid',
    background: 'mediaBackgroundGrid'
  };
  var activeCategory = 'logo';

  function panelIdForType(type) {
    return BUCKET_ID_BY_TYPE[type] || ('fdMediaPanel_' + type);
  }

  function tabLabelForType(type) {
    var meta = SECTION_META[type];
    return (meta && meta.tabLabel) || (meta && meta.title) || type;
  }

  function setBucketVisibility(panel, visible) {
    if (!panel) return;
    panel.classList.toggle('is-active', visible);
    panel.classList.toggle('media-hidden', !visible);
    panel.classList.toggle('fd-media-section--hidden', !visible);
    panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  /** URL hash slug → internal mediaType (underscore). */
  function mediaTypeFromHash(slug) {
    var key = String(slug || '').toLowerCase();
    if (!key) return null;
    if (key === 'wallet-icon' || key === 'wallet_icon') return 'wallet_icon';
    if (CATEGORY_ORDER.indexOf(key) !== -1) return key;
    return null;
  }

  /** internal mediaType → URL hash slug (hyphen for wallet_icon). */
  function hashFromMediaType(type) {
    if (type === 'wallet_icon') return 'wallet-icon';
    return type;
  }

  function isFiloMedia() {
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    if (document.documentElement.getAttribute('data-app') === 'filodiretto') return true;
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    return false;
  }

  function esc(s) {
    if (typeof window.esc === 'function') return window.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureUploadTypeOption() {
    var sel = document.getElementById('mediaUploadType');
    if (!sel || sel.querySelector('option[value="wallet_icon"]')) return;
    var opt = document.createElement('option');
    opt.value = 'wallet_icon';
    opt.textContent = 'Icona notifiche Wallet';
    var stripOpt = sel.querySelector('option[value="strip"]');
    if (stripOpt && stripOpt.nextSibling) sel.insertBefore(opt, stripOpt.nextSibling);
    else sel.appendChild(opt);
  }

  function openUploadForType(type) {
    if (typeof window.openMediaUpload === 'function') {
      window.openMediaUpload();
    }
    var sel = document.getElementById('mediaUploadType');
    if (sel && type) {
      sel.value = type;
      if (typeof window.onMediaUploadTypeChange === 'function') window.onMediaUploadTypeChange();
    }
  }

  window.openMediaUploadForType = openUploadForType;

  function readSavedCategory() {
    var fromHash = mediaTypeFromHash(String(window.location.hash || '').replace(/^#/, ''));
    if (fromHash) return fromHash;
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored && CATEGORY_ORDER.indexOf(stored) !== -1) return stored;
    } catch (_) {}
    return 'logo';
  }

  function persistCategory(type) {
    try {
      localStorage.setItem(STORAGE_KEY, type);
    } catch (_) {}
    if (typeof window.getActiveSectionId === 'function' && window.getActiveSectionId() === 'media-library') {
      var slug = hashFromMediaType(type);
      var base = window.location.pathname + window.location.search;
      try {
        window.history.replaceState({ section: 'media-library', mediaCategory: type }, '', base + '#' + slug);
      } catch (_) {}
    }
  }

  function switchMediaCategory(type, options) {
    options = options || {};
    if (CATEGORY_ORDER.indexOf(type) === -1) type = 'logo';
    activeCategory = type;

    var activePanelId = panelIdForType(type);
    var activePanel = document.getElementById(activePanelId);
    if (!activePanel) {
      console.warn('[fd-media-library] Panel not found for category:', type, '(expected #' + activePanelId + ')');
    }

    document.querySelectorAll('#media-library .fd-media-grid .fd-media-section, #media-library .fd-media-grid .media-bucket').forEach(function (panel) {
      setBucketVisibility(panel, panel.id === activePanelId);
    });

    document.querySelectorAll('#media-library .a2w-media-bucket:not(.fd-media-section):not(.media-bucket)').forEach(function (orphan) {
      setBucketVisibility(orphan, false);
      console.warn('[fd-media-library] Hiding orphan bucket outside tab panels:', orphan);
    });

    document.querySelectorAll('#fdMediaTabs .fd-media-tabs__tab, #fdMediaTabs .media-tabs__tab').forEach(function (tab) {
      var tabType = tab.getAttribute('data-media-type');
      var on = tabType === type;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      var controls = tab.getAttribute('aria-controls');
      if (controls && !document.getElementById(controls)) {
        console.warn('[fd-media-library] Tab aria-controls missing panel:', controls);
      }
    });

    var sel = document.getElementById('fdMediaCategorySelect');
    if (sel && sel.value !== type) sel.value = type;

    if (!options.skipPersist) persistCategory(type);

    var live = document.getElementById('fdMediaAriaLive');
    if (live && !options.skipAnimation) {
      live.textContent = 'Categoria ' + ((SECTION_META[type] || {}).title || type);
    }
  }

  window.switchMediaCategory = switchMediaCategory;

  function onMediaTabsClick(e) {
    var tab = e.target.closest('.fd-media-tabs__tab, .media-tabs__tab');
    if (!tab) return;
    var type = tab.getAttribute('data-media-type');
    if (type) switchMediaCategory(type);
  }

  function onMediaTabsSelectChange(e) {
    if (!e.target || e.target.id !== 'fdMediaCategorySelect') return;
    switchMediaCategory(e.target.value);
  }

  function onMediaTabsKeydown(e) {
    var tab = e.target.closest('.fd-media-tabs__tab, .media-tabs__tab');
    if (!tab || !tab.closest('#fdMediaTabs')) return;
    var tabs = Array.from(document.querySelectorAll('#fdMediaTabs .fd-media-tabs__tab, #fdMediaTabs .media-tabs__tab'));
    var idx = tabs.indexOf(tab);
    if (idx === -1) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      var next = tabs[(idx + 1) % tabs.length];
      switchMediaCategory(next.getAttribute('data-media-type'));
      next.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      var prev = tabs[(idx - 1 + tabs.length) % tabs.length];
      switchMediaCategory(prev.getAttribute('data-media-type'));
      prev.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      switchMediaCategory(CATEGORY_ORDER[0]);
      tabs[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      switchMediaCategory(CATEGORY_ORDER[CATEGORY_ORDER.length - 1]);
      tabs[tabs.length - 1].focus();
    }
  }

  function buildMediaTabsMarkup() {
    var listItems = CATEGORY_ORDER.map(function (type) {
      var label = tabLabelForType(type);
      return (
        '<li role="presentation">' +
        '<button type="button" class="fd-media-tabs__tab media-tabs__tab" role="tab" id="fdMediaTab_' + type + '" data-media-type="' + type + '" aria-controls="' + panelIdForType(type) + '" aria-selected="false" tabindex="-1">' +
        esc(label) +
        '</button></li>'
      );
    }).join('');

    var selectOpts = CATEGORY_ORDER.map(function (type) {
      return '<option value="' + type + '">' + esc(tabLabelForType(type)) + '</option>';
    }).join('');

    return (
      '<div class="fd-media-tabs__select-wrap media-tabs__select-wrap">' +
      '<label class="fd-media-tabs__select-label media-tabs__select-label" for="fdMediaCategorySelect">Categoria asset</label>' +
      '<select id="fdMediaCategorySelect" class="fd-media-tabs__select media-tabs__select" aria-label="Categoria asset">' +
      selectOpts +
      '</select></div>' +
      '<ul class="fd-media-tabs__list media-tabs__list" role="tablist" aria-label="Categorie asset">' +
      listItems +
      '</ul>'
    );
  }

  function assertMediaPanelIntegrity(grid) {
    if (!grid) return;
    var tabs = document.querySelectorAll('#fdMediaTabs .fd-media-tabs__tab');
    var panels = grid.querySelectorAll(':scope > .fd-media-section[data-media-type]');
    if (tabs.length !== panels.length) {
      console.warn(
        '[fd-media-library] Tab/panel count mismatch: tabs=',
        tabs.length,
        'panels=',
        panels.length
      );
    }
    CATEGORY_ORDER.forEach(function (type) {
      var panel = document.getElementById(panelIdForType(type));
      if (!panel) {
        console.warn('[fd-media-library] Missing panel for type:', type);
      }
    });
    tabs.forEach(function (tab) {
      var controls = tab.getAttribute('aria-controls');
      if (!controls || !document.getElementById(controls)) {
        console.warn('[fd-media-library] Tab points to missing panel:', controls);
      }
    });
  }

  function hideLegacyA2wMediaTabs(section) {
    if (!section) return;
    var legacy = section.querySelector('#a2wMediaTabs');
    if (legacy) legacy.remove();
  }

  function ensureMediaCategoryTabs() {
    var section = document.getElementById('media-library');
    if (!section) return;
    hideLegacyA2wMediaTabs(section);
    var grid = section.querySelector('.fd-media-grid');
    if (!grid) return;

    grid.classList.add('fd-media-grid--tabs', 'media-buckets');

    CATEGORY_ORDER.forEach(function (type) {
      var panel = document.getElementById(panelIdForType(type))
        || grid.querySelector('.fd-media-section[data-media-type="' + type + '"]');
      if (!panel) return;
      panel.id = panelIdForType(type);
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', 'fdMediaTab_' + type);
    });

    if (!section.querySelector('#fdMediaTabs')) {
      var tabs = document.createElement('div');
      tabs.className = 'fd-media-tabs media-tabs';
      tabs.id = 'fdMediaTabs';
      tabs.setAttribute('data-component', 'media-tabs');
      tabs.innerHTML = buildMediaTabsMarkup();
      grid.parentNode.insertBefore(tabs, grid);
    } else {
      var existingTabs = section.querySelector('#fdMediaTabs');
      existingTabs.classList.add('media-tabs');
      existingTabs.setAttribute('data-component', 'media-tabs');
    }

    if (section.dataset.fdMediaTabsBound !== '1') {
      section.dataset.fdMediaTabsBound = '1';
      section.addEventListener('click', onMediaTabsClick);
      section.addEventListener('change', onMediaTabsSelectChange);
      section.addEventListener('keydown', onMediaTabsKeydown);
    }

    section.dataset.fdMediaTabs = '1';
    assertMediaPanelIntegrity(grid);
    switchMediaCategory(readSavedCategory(), { skipPersist: true, skipAnimation: true });
  }

  /*
   * Variante accordion (non attiva — default = segmented tabs):
   *
   * function ensureMediaAccordion() {
   *   document.querySelectorAll('#media-library .fd-media-section__head').forEach(function (head) {
   *     head.addEventListener('click', function () {
   *       var panel = head.closest('.fd-media-section');
   *       var type = panel && panel.getAttribute('data-media-type');
   *       if (type) switchMediaCategory(type);
   *     });
   *   });
   * }
   */

  function removeLegacyMediaSearches() {
    document.querySelectorAll('.fd-media-context-search-wrap, #' + 'fdMediaContextSearch').forEach(function (el) {
      el.remove();
    });
    var global = document.getElementById('fdMediaGlobalSearch');
    if (global) global.remove();
    document.querySelectorAll('#mediaStripSearch').forEach(function (el) {
      el.remove();
    });
    document.querySelectorAll('[id^="fdMediaSearch_"]').forEach(function (el) {
      el.remove();
    });
  }

  function buildMediaDialogs() {
    if (document.getElementById('fdMediaSpecsDialog')) return;
    var host = document.createElement('div');
    host.innerHTML =
      '<div id="fdMediaSpecsDialog" class="fd-media-dialog" hidden>' +
      '<div class="fd-media-dialog__backdrop" data-close="specs"></div>' +
      '<div class="fd-media-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="fdMediaSpecsTitle">' +
      '<h3 id="fdMediaSpecsTitle">Specifiche tecniche</h3>' +
      '<table class="fd-media-specs-table"><tbody>' +
      '<tr><th>Logo</th><td>PNG trasparente · 320×100 px · max 2MB</td></tr>' +
      '<tr><th>Icona Wallet</th><td>PNG/JPG quadrata · 512×512 px · max 2MB</td></tr>' +
      '<tr><th>Strip</th><td>PNG/JPG · 750×246 px · max 2MB</td></tr>' +
      '<tr><th>Thumbnail</th><td>PNG/JPG · 90×90 px · max 2MB</td></tr>' +
      '<tr><th>Background</th><td>PNG/JPG · 360×440 px · max 2MB</td></tr>' +
      '</tbody></table>' +
      '<div class="fd-media-dialog__actions"><button type="button" class="btn sec" data-close="specs">Chiudi</button></div>' +
      '</div></div>' +
      '<div id="fdMediaClearDialog" class="fd-media-dialog" hidden>' +
      '<div class="fd-media-dialog__backdrop" data-close="clear"></div>' +
      '<div class="fd-media-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="fdMediaClearTitle">' +
      '<h3 id="fdMediaClearTitle">Svuotare la libreria?</h3>' +
      '<p>Questa azione elimina tutti gli asset del brand. Scrivi <strong>SVUOTA</strong> per confermare.</p>' +
      '<label class="form-label" for="fdMediaClearInput">Conferma</label>' +
      '<input id="fdMediaClearInput" type="text" autocomplete="off" placeholder="SVUOTA">' +
      '<div class="fd-media-dialog__actions">' +
      '<button type="button" class="btn sec" data-close="clear">Annulla</button>' +
      '<button type="button" id="fdMediaClearConfirmBtn" class="btn danger" disabled>Svuota libreria</button>' +
      '</div></div></div>';
    host.innerHTML +=
      '<div id="fdMediaAssetDeleteDialog" class="fd-media-dialog" hidden>' +
      '<div class="fd-media-dialog__backdrop" data-close="asset-delete"></div>' +
      '<div class="fd-media-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="fdMediaAssetDeleteTitle">' +
      '<h3 id="fdMediaAssetDeleteTitle">Eliminare questo asset?</h3>' +
      '<p id="fdMediaAssetDeleteDesc">Questa azione non può essere annullata.</p>' +
      '<label class="form-label" for="fdMediaAssetDeleteInput">Conferma</label>' +
      '<input id="fdMediaAssetDeleteInput" type="text" autocomplete="off" placeholder="ELIMINA">' +
      '<div class="fd-media-dialog__actions">' +
      '<button type="button" class="btn sec" data-close="asset-delete">Annulla</button>' +
      '<button type="button" id="fdMediaAssetDeleteConfirmBtn" class="btn danger" disabled>Elimina asset</button>' +
      '</div></div></div>' +
      '<div id="fdMediaBulkDeleteDialog" class="fd-media-dialog" hidden>' +
      '<div class="fd-media-dialog__backdrop" data-close="bulk-delete"></div>' +
      '<div class="fd-media-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="fdMediaBulkDeleteTitle">' +
      '<h3 id="fdMediaBulkDeleteTitle">Eliminare gli asset selezionati?</h3>' +
      '<p id="fdMediaBulkDeleteDesc">Conferma digitando <strong>ELIMINA</strong>.</p>' +
      '<label class="form-label" for="fdMediaBulkDeleteInput">Conferma</label>' +
      '<input id="fdMediaBulkDeleteInput" type="text" autocomplete="off" placeholder="ELIMINA">' +
      '<div class="fd-media-dialog__actions">' +
      '<button type="button" class="btn sec" data-close="bulk-delete">Annulla</button>' +
      '<button type="button" id="fdMediaBulkDeleteConfirmBtn" class="btn danger" disabled>Elimina selezionati</button>' +
      '</div></div></div>' +
      '<div id="fdMediaAriaLive" class="sr-only" aria-live="polite"></div>';
    document.body.appendChild(host);

    var clearInput = document.getElementById('fdMediaClearInput');
    var clearBtn = document.getElementById('fdMediaClearConfirmBtn');
    if (clearInput && clearBtn) {
      clearInput.addEventListener('input', function () {
        clearBtn.disabled = (clearInput.value || '').trim().toUpperCase() !== 'SVUOTA';
      });
    }

    document.querySelectorAll('.fd-media-dialog [data-close]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-close');
        var dlg = document.getElementById(key === 'specs' ? 'fdMediaSpecsDialog' : 'fdMediaClearDialog');
        if (dlg) dlg.hidden = true;
      });
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        var dlg = document.getElementById('fdMediaClearDialog');
        if (dlg) dlg.hidden = true;
        window.__fdSkipMediaAppConfirm = true;
        if (typeof window.deleteAllMedia === 'function') window.deleteAllMedia();
      });
    }

    var assetInput = document.getElementById('fdMediaAssetDeleteInput');
    var assetBtn = document.getElementById('fdMediaAssetDeleteConfirmBtn');
    if (assetInput && assetBtn) {
      assetInput.addEventListener('input', function () {
        var expected = pendingDeleteAsset && pendingDeleteAsset.requireType ? String(pendingDeleteAsset.requireType) : 'ELIMINA';
        assetBtn.disabled = (assetInput.value || '').trim().toUpperCase() !== expected.toUpperCase();
      });
      assetBtn.addEventListener('click', function () {
        var dlg = document.getElementById('fdMediaAssetDeleteDialog');
        if (dlg) dlg.hidden = true;
        if (pendingDeleteAsset && typeof window.deleteMediaItem === 'function') {
          window.__fdSkipMediaAppConfirm = true;
          window.deleteMediaItem(pendingDeleteAsset.id);
        }
        pendingDeleteAsset = null;
      });
    }

    var bulkInput = document.getElementById('fdMediaBulkDeleteInput');
    var bulkBtn = document.getElementById('fdMediaBulkDeleteConfirmBtn');
    if (bulkInput && bulkBtn) {
      bulkInput.addEventListener('input', function () {
        bulkBtn.disabled = (bulkInput.value || '').trim().toUpperCase() !== 'ELIMINA';
      });
      bulkBtn.addEventListener('click', function () {
        var ids = Array.from(selectedIds);
        var dlg = document.getElementById('fdMediaBulkDeleteDialog');
        if (dlg) dlg.hidden = true;
        selectedIds.clear();
        syncBulkUi();
        ids.forEach(function (id) {
          window.__fdSkipMediaAppConfirm = true;
          if (typeof window.deleteMediaItem === 'function') window.deleteMediaItem(id);
        });
      });
    }
  }

  function openDialog(id) {
    var dlg = document.getElementById(id);
    if (!dlg) return;
    if (id === 'fdMediaClearDialog') {
      var input = document.getElementById('fdMediaClearInput');
      var btn = document.getElementById('fdMediaClearConfirmBtn');
      if (input) input.value = '';
      if (btn) btn.disabled = true;
    }
    if (id === 'fdMediaAssetDeleteDialog') {
      var aInput = document.getElementById('fdMediaAssetDeleteInput');
      var aBtn = document.getElementById('fdMediaAssetDeleteConfirmBtn');
      if (aInput) aInput.value = '';
      if (aBtn) aBtn.disabled = true;
    }
    if (id === 'fdMediaBulkDeleteDialog') {
      var bInput = document.getElementById('fdMediaBulkDeleteInput');
      var bBtn = document.getElementById('fdMediaBulkDeleteConfirmBtn');
      var bDesc = document.getElementById('fdMediaBulkDeleteDesc');
      if (bInput) bInput.value = '';
      if (bBtn) bBtn.disabled = true;
      if (bDesc) bDesc.innerHTML = 'Stai eliminando <strong>' + selectedIds.size + '</strong> asset. Conferma digitando <strong>ELIMINA</strong>.';
    }
    dlg.hidden = false;
  }

  window.fdMediaOpenSpecs = function () { openDialog('fdMediaSpecsDialog'); };
  window.fdMediaOpenClearDialog = function () { openDialog('fdMediaClearDialog'); };
  window.fdMediaOpenBulkDeleteDialog = function () { openDialog('fdMediaBulkDeleteDialog'); };
  window.fdMediaExportLibrary = function () {
    if (typeof window.toast === 'function') window.toast('Export libreria disponibile a breve');
  };

  function renderLoadingSkeleton() {
    return (
      '<div class="fd-media-skeleton" aria-busy="true" aria-live="polite">' +
      '<span class="fd-skeleton fd-skeleton--title" style="width:55%;max-width:220px"></span>' +
      '<span class="fd-skeleton fd-skeleton--text" style="width:80%;margin-top:10px"></span>' +
      '<span class="fd-skeleton fd-skeleton--text" style="width:60%;margin-top:6px"></span>' +
      '</div>'
    );
  }

  function applyDsButtonClasses(root) {
    var scope = root || document;
    scope.querySelectorAll('#media-library #fdMediaBulkClearBtn').forEach(function (btn) {
      if (!btn.classList.contains('sec')) btn.classList.add('sec');
    });
    scope.querySelectorAll('#media-library #fdMediaBulkDeleteBtn').forEach(function (btn) {
      if (!btn.classList.contains('danger')) btn.classList.add('danger');
    });
  }

  function enhanceMediaHeaderDesign(header) {
    if (!header || header.dataset.fdDsHeader === '1') return;
    header.dataset.fdDsHeader = '1';
    header.classList.add('fd-page-header');

    var copy = header.querySelector('.fd-media-header__copy');
    if (copy) copy.classList.add('fd-page-header__copy');
    var h1 = header.querySelector('h1, .page-title');
    if (h1) h1.classList.add('fd-page-header__title');
    var lead = header.querySelector('.fd-media-lead');
    if (lead) lead.classList.add('fd-page-header__lead');

    var actions = header.querySelector('.fd-media-header__actions');
    if (actions) actions.classList.add('fd-page-header__actions');

    applyDsButtonClasses(header);
  }

  function ensureSpecsPanel(page) {
    /* Specs live in each dropzone — no collapsed panel. */
    if (!page) return;
    page.querySelectorAll('.fd-media-specs').forEach(function (node) {
      node.remove();
    });
  }

  function enhanceSectionDesign(card) {
    if (!card) return;
    card.classList.add('fd-card', 'fd-form-section');
  }

  function findBucketForType(type) {
    var hostId = HOST_ID_BY_TYPE[type];
    if (!hostId) return null;
    var host = document.getElementById(hostId);
    if (!host) return null;
    return host.closest('.fd-media-section, .a2w-media-bucket, .card');
  }

  function bindUploadButtons(scope) {
    if (!scope) return;
    scope.querySelectorAll('.fd-media-upload-type').forEach(function (btn) {
      if (btn.dataset.uploadBound === '1') return;
      btn.dataset.uploadBound = '1';
      btn.addEventListener('click', function () {
        openUploadForType(btn.getAttribute('data-upload-type'));
      });
    });
  }

  function applySectionMeta(card, type) {
    var meta = SECTION_META[type] || { title: type, hint: '', uploadLabel: 'Carica' };
    card.dataset.mediaType = type;
    card.dataset.fdMediaSection = '1';
    card.dataset.a2wBucketType = type;
    card.classList.add('fd-media-section', 'media-bucket', 'card', 'fd-card', 'fd-form-section');
    card.id = panelIdForType(type);
    card.setAttribute('role', 'tabpanel');
    card.setAttribute('aria-labelledby', 'fdMediaTab_' + type);

    var titleEl = card.querySelector('.fd-media-section__title');
    var hintEl = card.querySelector('.fd-media-section__hint');
    if (titleEl) titleEl.textContent = meta.title;
    if (hintEl) hintEl.textContent = meta.hint;

    var actions = card.querySelector('.fd-media-section__actions');
    if (actions) actions.remove();
    bindUploadButtons(card);
  }

  function buildSectionShell(type) {
    var meta = SECTION_META[type];
    var hostId = HOST_ID_BY_TYPE[type];
    var card = document.createElement('div');
    card.className = 'card fd-media-section media-bucket';
    card.dataset.mediaType = type;
    card.dataset.fdMediaSection = '1';
    card.id = panelIdForType(type);
    card.setAttribute('role', 'tabpanel');
    card.setAttribute('aria-labelledby', 'fdMediaTab_' + type);
    card.innerHTML =
      '<div class="fd-media-section__head">' +
      '<div class="fd-media-section__copy">' +
      '<h2 class="fd-media-section__title">' + esc(meta.title) + '</h2>' +
      '<p class="fd-media-section__hint">' + esc(meta.hint) + '</p>' +
      '</div></div>' +
      '<div class="fd-media-section__body">' +
      '<div id="' + hostId + '" class="strip-gallery">' + renderLoadingSkeleton() + '</div>' +
      '</div>';
    bindUploadButtons(card);
    return card;
  }

  function wrapSectionCard(card, type) {
    if (!card) return null;
    if (card.dataset.fdMediaSection === '1') {
      applySectionMeta(card, type);
      return card;
    }

    var meta = SECTION_META[type] || { title: type, hint: '', uploadLabel: 'Carica' };
    var oldTitle = card.querySelector('.sec-title');
    var oldHint = card.querySelector('p');

    card.dataset.fdMediaSection = '1';
    card.dataset.mediaType = type;
    card.classList.add('fd-media-section', 'media-bucket');
    card.id = panelIdForType(type);
    card.setAttribute('role', 'tabpanel');
    card.setAttribute('aria-labelledby', 'fdMediaTab_' + type);

    var head = document.createElement('div');
    head.className = 'fd-media-section__head';
    head.innerHTML =
      '<div class="fd-media-section__copy">' +
      '<h2 class="fd-media-section__title">' + esc(meta.title) + '</h2>' +
      '<p class="fd-media-section__hint">' + esc(meta.hint) + '</p>' +
      '</div>';

    if (oldTitle) oldTitle.remove();
    if (oldHint) oldHint.remove();

    var bodyHost = document.createElement('div');
    bodyHost.className = 'fd-media-section__body';
    while (card.firstChild) bodyHost.appendChild(card.firstChild);

    card.appendChild(head);
    card.appendChild(bodyHost);
    bindUploadButtons(card);
    return card;
  }

  function removeDuplicateSections(grid) {
    CATEGORY_ORDER.forEach(function (type) {
      var hostId = HOST_ID_BY_TYPE[type];
      var panels = Array.from(grid.querySelectorAll('.fd-media-section[data-media-type="' + type + '"]'));
      if (panels.length <= 1) return;
      panels.forEach(function (panel) {
        if (!panel.querySelector('#' + hostId)) panel.remove();
      });
    });
  }

  function removeOrphanBuckets(grid) {
    grid.querySelectorAll(':scope > .a2w-media-bucket:not(.fd-media-section), :scope > .card:not(.fd-media-section)').forEach(function (node) {
      console.warn('[fd-media-library] Removing orphan bucket outside tab panels:', node);
      node.remove();
    });
  }

  function rebuildMediaSections(grid) {
    var sections = {};

    CATEGORY_ORDER.forEach(function (type) {
      var bucket = findBucketForType(type);
      if (bucket) {
        sections[type] = wrapSectionCard(bucket, type);
      } else if (!document.getElementById(HOST_ID_BY_TYPE[type])) {
        sections[type] = buildSectionShell(type);
      }
    });

    removeDuplicateSections(grid);

    CATEGORY_ORDER.forEach(function (type) {
      var panel = sections[type] || document.getElementById(panelIdForType(type));
      if (panel) grid.appendChild(panel);
    });

    removeOrphanBuckets(grid);
    assertMediaPanelIntegrity(grid);
  }

  function ensureMediaLayout() {
    var section = document.getElementById('media-library');
    if (!section) return;

    hideLegacyA2wMediaTabs(section);

    var page = section.querySelector('.a2w-media-page') || section;
    var grid = page.querySelector('.a2w-media-buckets-grid, .fd-media-grid');

    if (section.dataset.fdMediaLayout === '1') {
      if (grid) rebuildMediaSections(grid);
      if (typeof window.fdInjectBrandPassFlowBar === 'function') {
        window.fdInjectBrandPassFlowBar('media-library');
      }
      if (typeof window.fdRelocateBrandPassFlowBar === 'function') {
        window.fdRelocateBrandPassFlowBar(section);
      }
      ensureMediaCategoryTabs();
      removeLegacyMediaSearches();
      ensureBucketDropzones();
      ensureCropModalsOutsideSection();
      applyDsButtonClasses(section);
      return;
    }

    section.classList.add('media-library--fd-layout');

    var header = page.querySelector('.a2w-media-page-head, .fd-media-header') || section.querySelector(':scope > div');
    if (header) {
      header.classList.add('fd-media-header');
      var h1 = header.querySelector('h1');
      var actions = header.querySelector(':scope > div:last-child') || header.querySelector(':scope > div');
      if (h1 && actions && !header.querySelector('.fd-media-header__copy')) {
        var copy = document.createElement('div');
        copy.className = 'fd-media-header__copy';
        copy.appendChild(h1);
        var lead = document.createElement('p');
        lead.className = 'fd-media-lead';
        lead.textContent =
          'Deposito immagini del brand e del pass. Scegli i file qui, poi assegnali in Template Pass o nelle push.';
        copy.appendChild(lead);
        header.insertBefore(copy, actions);
        actions.classList.add('fd-media-header__actions');
        actions.querySelectorAll('button[onclick*="deleteAllMedia"]').forEach(function (btn) { btn.remove(); });
        actions.querySelectorAll('button[onclick*="openMediaUpload"]').forEach(function (btn) { btn.remove(); });
        enhanceMediaHeaderDesign(header);
      }
    }

    page.querySelectorAll('.a2w-media-specs-card').forEach(function (specsCard) {
      specsCard.remove();
    });
    ensureSpecsPanel(page);

    if (!grid) {
      grid = document.createElement('div');
      grid.className = 'fd-media-grid';
      page.appendChild(grid);
    }
    grid.classList.add('fd-media-grid');
    grid.classList.remove('a2w-media-buckets-grid');
    grid.style.display = '';
    grid.style.gridTemplateColumns = '';

    rebuildMediaSections(grid);
    if (typeof window.fdInjectBrandPassFlowBar === 'function') {
      window.fdInjectBrandPassFlowBar('media-library');
    }
    if (typeof window.fdRelocateBrandPassFlowBar === 'function') {
      window.fdRelocateBrandPassFlowBar(section);
    }
    ensureMediaCategoryTabs();
    removeLegacyMediaSearches();
    ensureBucketDropzones();
    ensureCropModalsOutsideSection();

    if (!section.querySelector('#fdMediaBulkBar')) {
      var bulk = document.createElement('div');
      bulk.id = 'fdMediaBulkBar';
      bulk.className = 'fd-media-bulk-bar';
      bulk.hidden = true;
      bulk.innerHTML =
        '<span id="fdMediaBulkCount">0 selezionati</span>' +
        '<button type="button" class="fd-btn fd-btn--secondary" id="fdMediaBulkClearBtn">Deseleziona</button>' +
        '<button type="button" class="fd-btn fd-btn--danger" id="fdMediaBulkDeleteBtn">Elimina selezionati</button>';
      section.appendChild(bulk);
      document.getElementById('fdMediaBulkClearBtn').addEventListener('click', function () {
        selectedIds.clear();
        syncBulkUi();
        document.querySelectorAll('#media-library .media-card__check').forEach(function (c) { c.checked = false; });
      });
      document.getElementById('fdMediaBulkDeleteBtn').addEventListener('click', function () {
        window.fdMediaOpenBulkDeleteDialog();
      });
    }

    if (!section.querySelector('.fd-media-link-template')) {
      var link = document.createElement('p');
      link.className = 'fd-media-link-template';
      link.innerHTML = 'Dopo il caricamento, assegna le immagini in <a href="#" data-fd-nav="templates">Template Pass</a>.';
      link.querySelector('a').addEventListener('click', function (e) {
        e.preventDefault();
        if (typeof window.nav === 'function') window.nav('templates');
      });
      section.appendChild(link);
    }

    ensureUploadTypeOption();
    buildMediaDialogs();
    applyDsButtonClasses(section);
    section.dataset.fdMediaLayout = '1';
  }

  function estimateDims(type) {
    if (type === 'logo') return '320×100';
    if (type === 'wallet_icon') return '512×512';
    if (type === 'strip') return '750×246';
    if (type === 'thumbnail') return '90×90';
    if (type === 'background') return '360×440';
    return '—';
  }

  function formatSize(bytes) {
    var n = Number(bytes || 0);
    if (!n) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function timeAgo(dateString) {
    if (!dateString) return '—';
    var d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return '—';
    var min = Math.max(1, Math.floor((Date.now() - d.getTime()) / 60000));
    if (min < 60) return min + ' min fa';
    var h = Math.floor(min / 60);
    if (h < 24) return h + ' ore fa';
    var day = Math.floor(h / 24);
    return day + ' giorni fa';
  }

  function fdIcon(name, label) {
    if (window.FD_ICONS && typeof window.FD_ICONS.svg === 'function') {
      return window.FD_ICONS.svg(name, 15);
    }
    return '';
  }

  function renderAssetCard(item, type) {
    var name = item.title || item.filename || SECTION_META[type].title;
    var usedIn = Number(item.used_in_count || 0);
    var metadata = estimateDims(type) + ' · ' + formatSize(item.size_bytes) + ' · ' + timeAgo(item.created_at);
    return (
      '<article class="media-card media-card--fd" data-asset-id="' + esc(item.id) + '" data-asset-type="' + esc(type) + '" data-asset-name="' + esc(name) + '" data-used-in="' + esc(usedIn) + '">' +
      '<div class="media-card__thumb-wrap">' +
      '<label class="media-card__check-wrap"><input type="checkbox" class="media-card__check" data-action="select" aria-label="Seleziona asset"></label>' +
      '<img src="/api/v1/media/' + esc(item.id) + '/image" alt="' + esc(name) + '">' +
      '<div class="media-card__overlay">' +
      '<button type="button" class="media-card__icon-btn" data-action="preview" aria-label="Anteprima asset" title="Anteprima">' + fdIcon('eye') + '</button>' +
      '<button type="button" class="media-card__icon-btn" data-action="rename" aria-label="Rinomina asset" title="Rinomina">' + fdIcon('pencil') + '</button>' +
      '<button type="button" class="media-card__icon-btn media-card__icon-btn--danger" data-action="delete" aria-label="Elimina asset" title="Elimina">' + fdIcon('trash') + '</button>' +
      '</div>' +
      '</div>' +
      '<div class="media-card__title">' + esc(name) + '</div>' +
      '<div class="media-card__meta" title="' + esc(metadata) + '">' + esc(metadata) + '</div>' +
      '</article>'
    );
  }

  function buildDropzoneMarkup(type) {
    var meta = SECTION_META[type] || { title: type, tabLabel: type };
    var dims = estimateDims(type);
    return (
      '<div class="fd-media-dropzone media-dropzone" data-component="dropzone" data-upload-type="' + esc(type) + '" tabindex="0" role="button">' +
      '<span class="fd-media-dropzone__title media-dropzone__title">Trascina o clicca per caricare</span>' +
      '<span class="fd-media-dropzone__hint media-dropzone__hint">' + esc(meta.tabLabel || meta.title) + '</span>' +
      '<span class="fd-media-dropzone__specs media-dropzone__specs">' + esc(dims) + ' px</span>' +
      '</div>'
    );
  }

  function bindDropzoneElement(dropzone, type) {
    if (!dropzone || dropzone.dataset.bound === '1') return;
    dropzone.dataset.bound = '1';
    dropzone.addEventListener('click', function () {
      openUploadForType(type);
    });
    dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openUploadForType(type);
      }
    });
    ['dragenter', 'dragover'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
        announceDnD('Rilascia per caricare');
      });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (evt) {
      dropzone.addEventListener(evt, function () {
        dropzone.classList.remove('is-dragover');
      });
    });
    dropzone.addEventListener('drop', function (e) {
      e.preventDefault();
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      openUploadForType(type);
      var input = document.getElementById('mediaUploadFile');
      try {
        var dt = new DataTransfer();
        dt.items.add(file);
        if (input) input.files = dt.files;
      } catch (_) {}
      announceDnD('File pronto per il caricamento');
    });
  }

  function galleryAccordionId(type) {
    return 'fdMediaGalleryAccordion_' + type;
  }

  function galleryOpenStorageKey(type) {
    return GALLERY_OPEN_PREFIX + type;
  }

  function ensureGalleryAccordion(panel, type) {
    var body = panel && panel.querySelector('.fd-media-section__body');
    if (!body) return null;
    var hostId = HOST_ID_BY_TYPE[type];
    var host = document.getElementById(hostId);
    if (!host) return null;

    var accordion = body.querySelector('.fd-media-gallery-accordion[data-media-type="' + type + '"]');
    if (!accordion) {
      accordion = document.createElement('details');
      accordion.className = 'fd-media-gallery-accordion';
      accordion.id = galleryAccordionId(type);
      accordion.dataset.mediaType = type;

      var summary = document.createElement('summary');
      summary.className = 'fd-media-gallery-accordion__trigger';
      summary.setAttribute('aria-controls', hostId);
      summary.innerHTML =
        '<span class="fd-media-gallery-accordion__label">Immagini già caricate</span>' +
        '<span class="fd-media-gallery-accordion__meta">' +
        '<span class="fd-media-gallery-accordion__count" data-role="count"></span>' +
        '<span class="fd-media-gallery-accordion__chevron" aria-hidden="true"></span>' +
        '</span>';

      var inner = document.createElement('div');
      inner.className = 'fd-media-gallery-accordion__body';

      var dropzone = body.querySelector('.media-dropzone, .fd-media-dropzone');
      if (dropzone && dropzone.nextSibling) {
        body.insertBefore(accordion, dropzone.nextSibling);
      } else {
        body.appendChild(accordion);
      }
      inner.appendChild(host);
      accordion.appendChild(summary);
      accordion.appendChild(inner);
    }

    try {
      accordion.open = sessionStorage.getItem(galleryOpenStorageKey(type)) === '1';
    } catch (_) {
      accordion.open = false;
    }

    if (accordion.dataset.bound !== '1') {
      accordion.dataset.bound = '1';
      accordion.addEventListener('toggle', function () {
        try {
          sessionStorage.setItem(galleryOpenStorageKey(type), accordion.open ? '1' : '0');
        } catch (_) {}
      });
    }

    return accordion;
  }

  function syncGalleryAccordion(type, count) {
    var accordion = document.getElementById(galleryAccordionId(type));
    if (!accordion) return;
    var countEl = accordion.querySelector('[data-role="count"]');
    if (countEl) {
      countEl.textContent = count > 0 ? '(' + count + ')' : '';
    }
    accordion.hidden = count === 0;
    if (count === 0) accordion.open = false;
  }

  function ensureBucketDropzones() {
    CATEGORY_ORDER.forEach(function (type) {
      var panel = document.getElementById(panelIdForType(type));
      if (!panel) return;
      var body = panel.querySelector('.fd-media-section__body');
      if (!body) return;
      var hostId = HOST_ID_BY_TYPE[type];
      var host = document.getElementById(hostId);
      if (!host) return;
      var dropzone = body.querySelector('.media-dropzone, .fd-media-dropzone');
      if (!dropzone) {
        var wrap = document.createElement('div');
        wrap.innerHTML = buildDropzoneMarkup(type);
        dropzone = wrap.firstChild;
        var accordion = body.querySelector('.fd-media-gallery-accordion[data-media-type="' + type + '"]');
        if (accordion) body.insertBefore(dropzone, accordion);
        else body.insertBefore(dropzone, host);
      }
      bindDropzoneElement(dropzone, type);
      ensureGalleryAccordion(panel, type);
    });
  }

  function ensureCropModalsOutsideSection() {
    var section = document.getElementById('media-library');
    if (!section) return;
    ['mediaUploadModal', 'mediaCropModal'].forEach(function (id) {
      var modal = document.getElementById(id);
      if (!modal) return;
      if (section.contains(modal)) {
        var main = document.getElementById('main-content') || document.body;
        main.appendChild(modal);
      }
    });
  }

  function renderEmptyDropzone(type) {
    var m = SECTION_META[type];
    return (
      '<p class="fd-media-empty fd-media-empty-state__inline">Nessun asset ' + esc((m.tabLabel || m.title).toLowerCase()) + ' caricato.</p>'
    );
  }

  function bindAssetCardActions(scope) {
    if (!scope) return;
    scope.querySelectorAll('.media-card--fd').forEach(function (card) {
      if (card.dataset.bound === '1') return;
      card.dataset.bound = '1';
      var id = card.getAttribute('data-asset-id');
      var type = card.getAttribute('data-asset-type');
      var name = card.getAttribute('data-asset-name') || 'Asset';
      var check = card.querySelector('.media-card__check');
      if (check) {
        check.checked = selectedIds.has(id);
        check.addEventListener('change', function () {
          if (check.checked) selectedIds.add(id);
          else selectedIds.delete(id);
          syncBulkUi();
        });
      }

      card.querySelectorAll('[data-action]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var action = btn.getAttribute('data-action');
          if (action === 'preview') {
            window.open('/api/v1/media/' + encodeURIComponent(id) + '/image', '_blank');
            return;
          }
          if (action === 'rename') {
            var next = window.prompt('Nuovo nome asset', name);
            if (!next || next.trim() === name) return;
            var brandId = getCurrentBrandId();
            fetch((window.API || '/api/v1') + '/media/' + encodeURIComponent(id), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', ...authHeaders() },
              body: JSON.stringify({ title: next.trim(), type: type, brand_id: brandId || undefined })
            }).then(function () {
              if (typeof window.loadMediaLibrary === 'function') window.loadMediaLibrary();
            });
            return;
          }
          if (action === 'delete') {
            var usedIn = Number(card.getAttribute('data-used-in') || 0);
            pendingDeleteAsset = {
              id: id,
              requireType: usedIn > 0 ? name : 'ELIMINA'
            };
            var desc = document.getElementById('fdMediaAssetDeleteDesc');
            if (desc) {
              desc.innerHTML = usedIn > 0
                ? 'Asset usato in <strong>' + usedIn + '</strong> elementi. Digita <strong>' + esc(name) + '</strong> per confermare.'
                : 'Questa azione non può essere annullata. Digita <strong>ELIMINA</strong> per confermare.';
            }
            openDialog('fdMediaAssetDeleteDialog');
            return;
          }
        });
      });
    });

    scope.querySelectorAll('.fd-media-dropzone, .media-dropzone').forEach(function (btn) {
      if (btn.dataset.bound === '1') return;
      bindDropzoneElement(btn, btn.getAttribute('data-upload-type'));
    });
  }

  function announceDnD(message) {
    var node = document.getElementById('fdMediaAriaLive');
    if (node) node.textContent = message || '';
  }

  function bindDropzoneDnD(host, type) {
    if (!host || host.dataset.dragBound === '1') return;
    host.dataset.dragBound = '1';
    ['dragenter', 'dragover'].forEach(function (evt) {
      host.addEventListener(evt, function (e) {
        e.preventDefault();
        host.classList.add('is-dragover');
        announceDnD('Rilascia per caricare');
      });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (evt) {
      host.addEventListener(evt, function () {
        host.classList.remove('is-dragover');
      });
    });
    host.addEventListener('drop', function (e) {
      e.preventDefault();
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      openUploadForType(type);
      var input = document.getElementById('mediaUploadFile');
      try {
        var dt = new DataTransfer();
        dt.items.add(file);
        if (input) input.files = dt.files;
      } catch (_) {}
      announceDnD('File pronto per il caricamento');
    });
  }

  function syncBulkUi() {
    var bar = document.getElementById('fdMediaBulkBar');
    var count = document.getElementById('fdMediaBulkCount');
    var delBtn = document.getElementById('fdMediaBulkDeleteBtn');
    if (!bar || !count || !delBtn) return;
    var n = selectedIds.size;
    bar.hidden = n === 0;
    count.textContent = n + ' selezionati';
    delBtn.disabled = n === 0;
  }

  function renderSectionAssets(type, items) {
    var hostId = type === 'logo' ? 'mediaLogoBox'
      : type === 'wallet_icon' ? 'mediaWalletIconGrid'
      : type === 'strip' ? 'mediaStripGrid'
      : type === 'thumbnail' ? 'mediaThumbnailGrid'
      : 'mediaBackgroundGrid';
    var host = document.getElementById(hostId);
    if (!host) return;

    var list = items;

    if (!list.length) {
      host.innerHTML = renderEmptyDropzone(type);
      syncGalleryAccordion(type, 0);
      bindAssetCardActions(host);
      bindDropzoneDnD(host, type);
      return;
    }
    host.innerHTML = list.map(function (it) { return renderAssetCard(it, type); }).join('');
    syncGalleryAccordion(type, list.length);
    bindAssetCardActions(host);
    bindDropzoneDnD(host, type);
  }


  function patchLoadMediaLibrary() {
    if (window.__fdMediaLoadPatched) return;
    if (typeof window.loadMediaLibrary !== 'function') {
      window.setTimeout(patchLoadMediaLibrary, 50);
      return;
    }
    window.__fdMediaLoadPatched = true;
    window.loadMediaLibrary = async function () {
      ensureMediaLayout();
      document.querySelectorAll('#mediaLogoBox, #mediaWalletIconGrid, #mediaStripGrid, #mediaThumbnailGrid, #mediaBackgroundGrid').forEach(function (node) {
        if (!node) return;
        if (node.querySelector('.fd-media-skeleton') || node.querySelector('.fd-media-empty-state') || node.querySelector('.media-card--fd')) return;
        var txt = (node.textContent || '').trim();
        if (/caricamento/i.test(txt) || !txt) {
          node.innerHTML = renderLoadingSkeleton();
        }
      });
      try {
        var brandId = getCurrentBrandId();
        if (!brandId) return;
        syncDashboardBrandId(brandId);
        var api = window.API || '/api/v1';
        var res = await fetch(api + '/media?brand_id=' + encodeURIComponent(brandId), {
          headers: authHeaders()
        });
        if (!res.ok) throw new Error('media fetch failed ' + res.status);
        var items = await res.json().catch(function () { return []; });
        var rows = mediaRowsFromPayload(items);
        var keep = new Set(rows.map(function (x) { return String(x.id); }));
        Array.from(selectedIds).forEach(function (id) {
          if (!keep.has(String(id))) selectedIds.delete(id);
        });
        renderSectionAssets('logo', rows.filter(function (x) { return x.type === 'logo'; }));
        renderSectionAssets('wallet_icon', rows.filter(function (x) { return x.type === 'wallet_icon'; }));
        renderSectionAssets('strip', rows.filter(function (x) { return x.type === 'strip'; }));
        renderSectionAssets('thumbnail', rows.filter(function (x) { return x.type === 'thumbnail'; }));
        renderSectionAssets('background', rows.filter(function (x) { return x.type === 'background'; }));
        syncBulkUi();
        if (document.getElementById('fdMediaTabs')) {
          switchMediaCategory(activeCategory || readSavedCategory(), { skipPersist: true, skipAnimation: true });
        }
        if (typeof window.fdRbacHook === 'function') window.fdRbacHook('media-library');
      } catch (e) {
        console.error('fd-media-library load error:', e);
        document.querySelectorAll('#mediaLogoBox, #mediaWalletIconGrid, #mediaStripGrid, #mediaThumbnailGrid, #mediaBackgroundGrid').forEach(function (node) {
          if (!node) return;
          var txt = (node.textContent || '').trim();
          if (/caricamento/i.test(txt) || !txt) {
            node.innerHTML =
              typeof window.fdRenderErrorState === 'function'
                ? window.fdRenderErrorState('Errore caricamento. Riprova tra poco.', {
                    title: 'Media Library non disponibile'
                  })
                : '<p class="fd-media-empty">Errore caricamento. Riprova tra poco.</p>';
          }
        });
        if (typeof window.toast === 'function') window.toast('Media Library: errore caricamento');
      }
    };
  }

  function patchMediaDeleteConfirm() {
    if (window.__fdMediaDeletePatched) return;
    window.__fdMediaDeletePatched = true;

    if (typeof window.deleteMediaItem === 'function') {
      var origItem = window.deleteMediaItem;
      window.deleteMediaItem = async function (id) {
        if (window.__fdSkipMediaAppConfirm) {
          window.__fdSkipMediaAppConfirm = false;
          try {
            await fetch((window.API || '/api/v1') + '/media/' + encodeURIComponent(id), {
              method: 'DELETE',
              headers: authHeaders()
            });
            if (typeof window.toast === 'function') window.toast('Media eliminato');
            if (typeof window.loadMediaLibrary === 'function') window.loadMediaLibrary();
          } catch (err) {
            if (typeof window.toast === 'function') window.toast('Errore: ' + err.message);
          }
          return;
        }
        return origItem.apply(this, arguments);
      };
    }

    if (typeof window.deleteAllMedia === 'function') {
      var origAll = window.deleteAllMedia;
      window.deleteAllMedia = async function () {
        if (window.__fdSkipMediaAppConfirm) {
          window.__fdSkipMediaAppConfirm = false;
          var brandId = getCurrentBrandId();
          if (!brandId) return;
          try {
            var res = await fetch((window.API || '/api/v1') + '/media?brand_id=' + encodeURIComponent(brandId), {
              method: 'DELETE',
              headers: authHeaders()
            });
            var data = await res.json();
            if (typeof window.toast === 'function') window.toast((data.deleted || 0) + ' media eliminati');
            if (typeof window.loadMediaLibrary === 'function') window.loadMediaLibrary();
          } catch (err) {
            if (typeof window.toast === 'function') window.toast('Errore: ' + err.message);
          }
          return;
        }
        return origAll.apply(this, arguments);
      };
    }
  }

  function reconcileLegacyMediaTabs() {
    var section = document.getElementById('media-library');
    if (!section) return;
    hideLegacyA2wMediaTabs(section);
    if (!section.querySelector('#fdMediaTabs')) {
      ensureMediaCategoryTabs();
    }
  }

  function boot() {
    if (!isFiloMedia()) return;
    patchMediaDeleteConfirm();
    ensureUploadTypeOption();
    patchLoadMediaLibrary();
    ensureMediaLayout();
    reconcileLegacyMediaTabs();
  }

  function scheduleMediaLibraryBoot() {
    boot();
    window.requestAnimationFrame(function () {
      if (!isFiloMedia()) return;
      reconcileLegacyMediaTabs();
    });
  }

  window.fdEnsureMediaLibraryLayout = function () {
    if (!isFiloMedia()) return;
    ensureMediaLayout();
    reconcileLegacyMediaTabs();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleMediaLibraryBoot);
  } else {
    scheduleMediaLibraryBoot();
  }

  window.addEventListener('load', scheduleMediaLibraryBoot);

  var mediaLibrarySection = document.getElementById('media-library');
  if (mediaLibrarySection && typeof MutationObserver !== 'undefined') {
    new MutationObserver(function () {
      if (!mediaLibrarySection.classList.contains('active')) return;
      if (document.getElementById('a2wMediaTabs')) {
        window.fdEnsureMediaLibraryLayout();
      }
    }).observe(mediaLibrarySection, { attributes: true, attributeFilter: ['class'] });
  }

  var origNav = window.nav;
  if (typeof origNav === 'function' && !window.__fdMediaNav) {
    window.__fdMediaNav = true;
    window.nav = function (id) {
      var r = origNav.apply(this, arguments);
      var done = function () {
        if (id === 'media-library') scheduleMediaLibraryBoot();
      };
      if (r && typeof r.then === 'function') return r.then(done);
      setTimeout(done, 0);
      return r;
    };
  }
})();


/* === fd-templates.js === */
/**
 * FD — Template Pass (FASE 4): DS layout, richer cards, completeness, skeleton loading.
 */
(function () {
  'use strict';

  function isFiloTplApp() {
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

  function formatDateIt(value) {
    if (!value) return '—';
    try {
      return new Intl.DateTimeFormat('it-IT', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).format(new Date(value));
    } catch (_) {
      return '—';
    }
  }

  function templateImages(t) {
    var style = t.style;
    if (typeof style === 'string') {
      try {
        style = JSON.parse(style);
      } catch (_) {
        style = {};
      }
    }
    return (style && style.images) || {};
  }

  function templateStyle(t) {
    var style = t.style;
    if (typeof style === 'string') {
      try {
        style = JSON.parse(style);
      } catch (_) {
        style = {};
      }
    }
    return style || {};
  }

  function apiBase() {
    return window.API || '/api/v1';
  }

  function walletImageSrc(templateId, imageType, rawValue) {
    if (!rawValue) return '';
    var value = String(rawValue);
    if (value.indexOf('data:image/') === 0) return value;
    if (value.length > 120 && !/^https?:\/\//i.test(value)) {
      return 'data:image/png;base64,' + value;
    }
    return apiBase() + '/templates/' + encodeURIComponent(templateId) + '/wallet-image/' + imageType;
  }

  function evaluateCompleteness(t, brandSnapshot) {
    var images = templateImages(t);
    var checks = [
      { id: 'logo', label: 'Logo', ok: !!images.logo },
      { id: 'strip', label: 'Strip', ok: !!images.strip },
      {
        id: 'contacts',
        label: 'Contatti HR',
        ok: !!(brandSnapshot && (brandSnapshot.hr_email || brandSnapshot.support_email))
      }
    ];
    var done = checks.filter(function (c) {
      return c.ok;
    }).length;
    var ready = done === checks.length;
    return { checks: checks, done: done, total: checks.length, ready: ready };
  }

  function renderPreview(t) {
    var style = templateStyle(t);
    var images = templateImages(t);
    var strip = walletImageSrc(t.id, 'strip', images.strip);
    var logo = walletImageSrc(t.id, 'logo', images.logo);
    var bg = style.backgroundColor || style.background || '#1e1b4b';
    var fg = style.foregroundColor || style.foreground || '#ffffff';
    return (
      '<div class="fd-tpl-card__preview" style="background:' + esc(bg) + ';color:' + esc(fg) + '">' +
      '<div class="fd-tpl-card__strip"' +
      (strip ? ' style="background-image:url(\'' + esc(strip) + '\')"' : '') +
      '></div>' +
      '<div class="fd-tpl-card__body">' +
      (logo
        ? '<img class="fd-tpl-card__logo" src="' + esc(logo) + '" alt="">'
        : '<span class="fd-tpl-card__logo fd-tpl-card__logo--empty" aria-hidden="true"></span>') +
      '<div class="fd-tpl-card__fields">' +
      '<span class="fd-tpl-card__line"></span><span class="fd-tpl-card__line fd-tpl-card__line--short"></span>' +
      '</div></div></div>'
    );
  }

  function renderTemplateCard(t, passCount, brandSnapshot) {
    var completeness = evaluateCompleteness(t, brandSnapshot);
    var statusClass = completeness.ready ? 'is-ready' : 'is-incomplete';
    var statusLabel = completeness.ready ? 'Pronto' : 'Incompleto';
    var checksHtml = completeness.checks
      .map(function (c) {
        return (
          '<span class="fd-tpl-check' +
          (c.ok ? ' is-done' : '') +
          '" title="' +
          esc(c.label) +
          '">' +
          esc(c.label) +
          '</span>'
        );
      })
      .join('');
    var typeLabel =
      typeof window.formatTemplatePassTypeLabel === 'function'
        ? window.formatTemplatePassTypeLabel(t.pass_type)
        : t.pass_type || 'Pass';
    var updated = t.updated_at || t.created_at;
    return (
      '<article class="fd-card fd-tpl-card">' +
      '<div class="fd-tpl-card__grid">' +
      renderPreview(t) +
      '<div class="fd-tpl-card__content">' +
      '<div class="fd-tpl-card__head">' +
      '<h3 class="fd-tpl-card__title">' +
      esc(t.name) +
      '</h3>' +
      '<span class="fd-tpl-card__status ' +
      statusClass +
      '">' +
      esc(statusLabel) +
      '</span></div>' +
      '<p class="fd-tpl-card__meta">' +
      esc(typeLabel) +
      ' · ' +
      (passCount > 0 ? passCount + ' pass emessi' : 'Nessun pass emesso') +
      ' · Ultima modifica ' +
      esc(formatDateIt(updated)) +
      '</p>' +
      '<div class="fd-tpl-card__checks" aria-label="Completezza template">' +
      checksHtml +
      '</div>' +
      '<div class="fd-tpl-card__actions">' +
      '<button type="button" class="fd-btn fd-btn--primary fd-btn--sm" onclick="editTemplate(\'' +
      esc(t.id) +
      '\')">Modifica</button>' +
      '<button type="button" class="fd-btn fd-btn--danger fd-btn--sm fd-tpl-card-delete" data-tpl-id="' +
      esc(t.id) +
      '" data-tpl-name="' +
      esc(t.name) +
      '" data-rbac-write="templates">Elimina</button>' +
      '</div></div></div></article>'
    );
  }

  function bindTemplateDeleteButtons(scope) {
    (scope || document).querySelectorAll('.fd-tpl-card-delete').forEach(function (btn) {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', function () {
        var tplId = btn.getAttribute('data-tpl-id');
        var tplName = btn.getAttribute('data-tpl-name') || '';
        if (typeof window.fdDeleteTemplateWithConfirm === 'function') {
          window.fdDeleteTemplateWithConfirm(tplId, tplName);
        } else if (typeof window.deleteTemplate === 'function') {
          window.deleteTemplate(tplId);
        }
      });
    });
  }

  function patchDeleteTemplateFlow() {
    if (window.__fdTplDeletePatched) return;
    window.__fdTplDeletePatched = true;

    async function executeTemplateDelete(id) {
      try {
        var res = await fetch(apiBase() + '/templates/' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : {}
        });
        if (!res.ok) {
          var err = await res.json().catch(function () { return {}; });
          throw new Error(err.error || 'Errore eliminazione');
        }
        if (typeof window.toast === 'function') window.toast('Template eliminato');
        if (typeof window.invalidateBrandCache === 'function') window.invalidateBrandCache();
        if (typeof window.loadTemplates === 'function') window.loadTemplates();
      } catch (err) {
        if (typeof toast === 'function') toast('Errore: ' + err.message);
        else if (typeof window.alert === 'function') window.alert('Errore: ' + err.message);
      }
    }

    window.fdDeleteTemplateWithConfirm = async function (id, templateName) {
      var name = String(templateName || '').trim();
      var important = name.length > 0;
      if (typeof window.appConfirm === 'function') {
        var ok = await window.appConfirm({
          title: 'Elimina template',
          message: important
            ? 'Eliminare il template «' + name + '»? Verranno eliminati anche i pass collegati.'
            : 'Eliminare questo template? Verranno eliminati anche i pass collegati.',
          confirmLabel: 'Elimina',
          tone: 'danger'
        });
        if (!ok) return;
      }
      if (important) {
        var typed = window.prompt('Conferma definitiva: digita il nome del template per procedere.', '');
        if (String(typed || '').trim() !== name) {
          if (typeof window.toast === 'function') window.toast('Eliminazione annullata');
          return;
        }
      } else {
        var guard = window.prompt('Conferma definitiva: scrivi ELIMINA per procedere.');
        if (guard !== 'ELIMINA') {
          if (typeof window.toast === 'function') window.toast('Eliminazione annullata');
          return;
        }
      }
      await executeTemplateDelete(id);
    };

    if (typeof window.deleteTemplate === 'function') {
      var orig = window.deleteTemplate;
      window.deleteTemplate = async function (id) {
        if (!isFiloTplApp()) return orig(id);
        return window.fdDeleteTemplateWithConfirm(id, '');
      };
    }
  }

  function renderLoadingSkeleton() {
    function cardSkeleton() {
      return (
        '<article class="fd-card fd-tpl-card fd-tpl-card--skeleton" aria-hidden="true">' +
        '<div class="fd-tpl-card__grid">' +
        '<div class="fd-skeleton fd-tpl-card__preview-skeleton"></div>' +
        '<div class="fd-tpl-card__content">' +
        '<span class="fd-skeleton fd-skeleton--title" style="width:52%"></span>' +
        '<span class="fd-skeleton fd-skeleton--text" style="width:78%;margin-top:10px"></span>' +
        '<span class="fd-skeleton fd-skeleton--text" style="width:42%;margin-top:6px"></span>' +
        '</div></div></article>'
      );
    }
    return (
      '<div class="fd-tpl-list fd-tpl-skeleton" aria-busy="true" aria-live="polite">' +
      cardSkeleton() +
      cardSkeleton() +
      '</div>'
    );
  }

  function enhanceTemplatesSectionDesign() {
    var section = document.getElementById('templates');
    if (!section || section.dataset.fdDsSection === '1') return;
    section.dataset.fdDsSection = '1';
    section.classList.add('templates--fd-layout');

    var headerWrap = section.querySelector(':scope > div');
    var title = section.querySelector('h1.page-title, h1.sec-title');
    var createBtn = section.querySelector('[data-fd-template-create]');
    if (headerWrap && title && !headerWrap.classList.contains('fd-page-header')) {
      headerWrap.classList.add('fd-page-header', 'fd-tpl-header');
      headerWrap.style.display = '';
      headerWrap.style.justifyContent = '';
      headerWrap.style.alignItems = '';
      headerWrap.style.marginBottom = '';

      var copy = headerWrap.querySelector('.fd-page-header__copy');
      if (!copy) {
        copy = document.createElement('div');
        copy.className = 'fd-page-header__copy';
        copy.appendChild(title);
        var lead = document.createElement('p');
        lead.className = 'fd-page-header__lead fd-tpl-lead';
        lead.textContent =
          'Definisci layout, immagini e testi del pass dipendente riutilizzabile in tutte le attivazioni.';
        copy.appendChild(lead);
        headerWrap.insertBefore(copy, headerWrap.firstChild);
      }

      title.classList.add('fd-page-header__title');
      var existingLead = copy.querySelector('.fd-page-header__lead, .fd-tpl-lead');
      if (existingLead) existingLead.classList.add('fd-page-header__lead');

      var actions = headerWrap.querySelector('.fd-page-header__actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'fd-page-header__actions fd-tpl-header__actions';
        headerWrap.appendChild(actions);
      }
      if (!createBtn) {
        createBtn = document.createElement('button');
        createBtn.type = 'button';
        createBtn.textContent = '+ Nuovo Template';
        createBtn.setAttribute('data-fd-template-create', '1');
        createBtn.setAttribute('data-requires-write', 'templates');
        createBtn.addEventListener('click', function () {
          if (typeof window.openTemplateModal === 'function') window.openTemplateModal();
        });
        actions.appendChild(createBtn);
      }
      if (createBtn) {
        createBtn.classList.add('fd-btn', 'fd-btn--primary');
        createBtn.classList.remove('sec', 'small');
      }
    }

    var list = document.getElementById('templatesList');
    if (list) list.classList.add('fd-tpl-list-host');

    if (typeof window.fdInjectBrandPassFlowBar === 'function') {
      window.fdInjectBrandPassFlowBar('templates');
    }
    if (typeof window.fdRelocateBrandPassFlowBar === 'function') {
      window.fdRelocateBrandPassFlowBar(section);
    }
  }

  function setHeaderCreateButtonVisible(visible) {
    var section = document.getElementById('templates');
    if (!section) return;
    var createBtn = section.querySelector('.fd-tpl-header__actions [data-fd-template-create]');
    if (!createBtn) return;
    createBtn.hidden = !visible;
    createBtn.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  async function fetchBrandSnapshot() {
    var brandId = window.brandId;
    if (!brandId) return window.__fdBrandPassSnapshot || null;
    if (window.__fdBrandPassSnapshot && window.__fdBrandPassSnapshot.id === brandId) {
      return window.__fdBrandPassSnapshot;
    }
    try {
      var api = window.API || '/api/v1';
      var res = await fetch(api + '/brands/' + encodeURIComponent(brandId), {
        headers: typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : {}
      });
      if (!res.ok) return null;
      var brand = await res.json();
      window.__fdBrandPassSnapshot = {
        id: brandId,
        hr_email: brand.hr_email,
        support_email: brand.support_email || (brand.config && brand.config.support_email)
      };
      return window.__fdBrandPassSnapshot;
    } catch (_) {
      return null;
    }
  }

  async function fetchPassCountsByTemplate() {
    var brandId = window.brandId;
    if (!brandId) return {};
    try {
      var api = window.API || '/api/v1';
      var res = await fetch(
        api + '/passes?brand_id=' + encodeURIComponent(brandId) + '&limit=500&offset=0',
        { headers: typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : {} }
      );
      if (!res.ok) return {};
      var payload = await res.json();
      var rows = Array.isArray(payload) ? payload : payload.passes || [];
      var map = {};
      rows.forEach(function (p) {
        if (!p.template_id) return;
        map[p.template_id] = (map[p.template_id] || 0) + 1;
      });
      return map;
    } catch (_) {
      return {};
    }
  }

  function patchLoadTemplates() {
    if (window.__fdTplListPatched || typeof window.loadTemplates !== 'function') return;
    window.__fdTplListPatched = true;
    var orig = window.loadTemplates;
    window.loadTemplates = async function () {
      if (!isFiloTplApp() || !window.brandId) return orig.apply(this, arguments);
      var el = document.getElementById('templatesList');
      if (!el) return orig.apply(this, arguments);
      enhanceTemplatesSectionDesign();
      setHeaderCreateButtonVisible(false);
      el.innerHTML = renderLoadingSkeleton();
      try {
        var api = window.API || '/api/v1';
        var templates = await window.fetchCachedJson(api + '/templates?brand_id=' + window.brandId, {
          headers: typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : {}
        });
        var passCounts = await fetchPassCountsByTemplate();
        var brandSnapshot = await fetchBrandSnapshot();
        if (!templates.length) {
          setHeaderCreateButtonVisible(false);
          if (typeof window.renderEmptyState === 'function') {
            el.innerHTML = window.renderEmptyState({
              title: 'Nessun template',
              description: 'Crea un template dipendente con logo, strip e testi del pass.',
              ctaLabel: 'Nuovo template',
              ctaOnclick: 'openTemplateModal()',
              icon: 'inbox'
            });
          } else {
            el.innerHTML = '<p>Nessun template</p>';
          }
          if (typeof window.fdRbacHook === 'function') window.fdRbacHook('templates');
          return;
        }
        setHeaderCreateButtonVisible(true);
        el.innerHTML =
          '<div class="fd-tpl-list">' +
          templates
            .map(function (t) {
              return renderTemplateCard(t, passCounts[t.id] || 0, brandSnapshot);
            })
            .join('') +
          '</div>';
        bindTemplateDeleteButtons(el);
        if (typeof window.fdRbacHook === 'function') window.fdRbacHook('templates');
      } catch (e) {
        console.error('fd-templates loadTemplates', e);
        return orig.apply(this, arguments);
      }
    };
  }

  function patchNavForTemplates() {
    if (window.__fdTplNavPatched || typeof window.nav !== 'function') return;
    window.__fdTplNavPatched = true;
    var origNav = window.nav;
    window.nav = function (id) {
      var r = origNav.apply(this, arguments);
      var done = function () {
        if (id === 'templates') enhanceTemplatesSectionDesign();
      };
      if (r && typeof r.then === 'function') return r.then(done);
      setTimeout(done, 0);
      return r;
    };
  }

  function setPreviewFace(face) {
    var container = document.getElementById('tplPassFlip');
    if (!container) return;
    var isBack = face === 'back';
    container.classList.toggle('a2w-tpl-show-back', isBack);
    container.classList.remove('flipped');
    document.querySelectorAll('#templateModal .a2w-tpl-preview-toggle__btn').forEach(function (btn) {
      var active = btn.getAttribute('data-tpl-face') === face;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function initPreviewToggle() {
    var container = document.getElementById('tplPassFlip');
    if (!container || container.dataset.fdTplToggleBound === '1') return;
    container.dataset.fdTplToggleBound = '1';
    container.classList.remove('flipped');
    container.removeAttribute('onmouseenter');
    container.removeAttribute('onmouseleave');
    container.onmouseenter = null;
    container.onmouseleave = null;

    document.querySelectorAll('#templateModal .a2w-tpl-preview-toggle__btn').forEach(function (btn) {
      if (btn.dataset.fdTplToggleBtn === '1') return;
      btn.dataset.fdTplToggleBtn = '1';
      btn.addEventListener('click', function () {
        setPreviewFace(btn.getAttribute('data-tpl-face') || 'front');
      });
    });
    setPreviewFace('front');
  }

  function patchTemplateModalFlip() {
    if (window.__fdTplFlipPatched) return;
    ['openTemplateModal', 'editTemplate'].forEach(function (name) {
      if (typeof window[name] !== 'function') return;
      var orig = window[name];
      window[name] = async function () {
        var out = orig.apply(this, arguments);
        if (out && typeof out.then === 'function') await out;
        if (!isFiloTplApp()) return out;
        initPreviewToggle();
        setPreviewFace('front');
        return out;
      };
      window.__fdTplFlipPatched = true;
    });
  }

  function initFdTemplates() {
    if (!isFiloTplApp()) return;
    patchDeleteTemplateFlow();
    patchLoadTemplates();
    patchNavForTemplates();
    patchTemplateModalFlip();
    enhanceTemplatesSectionDesign();
  }

  window.fdInitTemplates = initFdTemplates;
  window.fdSetTplPreviewFace = setPreviewFace;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdTemplates);
  } else {
    initFdTemplates();
  }
})();


/* === fd-passes.js === */
/**
 * FD — Pass Emessi (FASE 4): DS layout, KPI grid, toolbar, table UX, azioni riga.
 */
(function () {
  'use strict';

  function isFiloPassesApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function renderLoadingSkeleton() {
    function statSkel() {
      return (
        '<div class="fd-stat-card fd-stat-card--skeleton" aria-hidden="true">' +
        '<span class="fd-skeleton fd-skeleton--text" style="width:72%"></span>' +
        '<span class="fd-skeleton fd-skeleton--title" style="width:38%;margin-top:8px"></span>' +
        '</div>'
      );
    }
    return (
      '<div class="fd-passes-skeleton" aria-busy="true" aria-live="polite">' +
      '<div class="fd-stat-grid fd-passes-stat-grid">' +
      statSkel() +
      statSkel() +
      statSkel() +
      statSkel() +
      statSkel() +
      statSkel() +
      '</div>' +
      '<div class="fd-table-wrap fd-passes-table-skeleton">' +
      '<span class="fd-skeleton" style="display:block;width:100%;height:240px;border-radius:var(--fd-radius-md,12px)"></span>' +
      '</div></div>'
    );
  }

  function enhancePassesSectionDesign() {
    var section = document.getElementById('passes');
    if (!section || section.dataset.fdDsSection === '1') return;
    section.dataset.fdDsSection = '1';
    section.classList.add('passes--fd-layout', 'passes--fd-ds');

    var headerWrap = section.querySelector(':scope > div');
    var title = section.querySelector('h1.page-title, h1.sec-title');
    var filterWrap = section.querySelector('#passFilterCampaign')?.closest('div');
    if (headerWrap && title && !headerWrap.classList.contains('fd-page-header')) {
      headerWrap.classList.add('fd-page-header', 'fd-passes-header');
      headerWrap.style.display = '';
      headerWrap.style.justifyContent = '';
      headerWrap.style.alignItems = '';
      headerWrap.style.marginBottom = '';

      var copy = headerWrap.querySelector('.fd-page-header__copy');
      if (!copy) {
        copy = document.createElement('div');
        copy.className = 'fd-page-header__copy';
        copy.appendChild(title);
        var lead = document.createElement('p');
        lead.className = 'fd-page-header__lead fd-passes-lead';
        lead.textContent =
          'Monitora pass generati, installazioni Wallet e canali raggiungibili per il supporto HR.';
        copy.appendChild(lead);
        headerWrap.insertBefore(copy, headerWrap.firstChild);
      }

      title.classList.add('fd-page-header__title');
      var existingLead = copy.querySelector('.fd-page-header__lead, .fd-passes-lead');
      if (existingLead) existingLead.classList.add('fd-page-header__lead');

      if (filterWrap && filterWrap.parentNode === headerWrap) {
        filterWrap.classList.add('fd-page-header__actions', 'fd-passes-header__filters');
        filterWrap.style.display = '';
        filterWrap.style.gap = '';
        headerWrap.appendChild(filterWrap);
        var select = filterWrap.querySelector('#passFilterCampaign');
        if (select) select.classList.add('fd-passes-campaign-select');
      }
    }

    var hint = document.getElementById('passFilterSessionHint');
    if (hint) hint.classList.add('fd-passes-session-hint');

    var content = document.getElementById('passesContent');
    if (content) content.classList.add('fd-passes-content');

    var accordion = document.getElementById('passWalletTechAccordion');
    if (accordion) accordion.classList.add('fd-card', 'fd-passes-tech-accordion');

    if (typeof window.fdInjectBrandPassFlowBar === 'function') {
      window.fdInjectBrandPassFlowBar('passes');
    }
    if (typeof window.fdRelocateBrandPassFlowBar === 'function') {
      window.fdRelocateBrandPassFlowBar(section);
    }
  }

  function ensurePassesLayout() {
    var section = document.getElementById('passes');
    var accordion = document.getElementById('passWalletTechAccordion');
    var diag = document.getElementById('passWalletChannelsDiag');
    var content = document.getElementById('passesContent');
    if (!section || !content || section.dataset.fdPassesLayout === '1') return;
    if (!accordion && !diag) return;
    section.dataset.fdPassesLayout = '1';
    section.classList.add('passes--fd-layout');
    if (accordion) section.appendChild(accordion);
    else if (diag) section.appendChild(diag);
  }

  function passStatusMeta(status) {
    var key = String(status || '').toLowerCase();
    var map = {
      active: { label: 'Attivo', cls: 'fd-pass-status--active' },
      expired: { label: 'Scaduto', cls: 'fd-pass-status--expired' },
      revoked: { label: 'Revocato', cls: 'fd-pass-status--revoked' },
      inactive: { label: 'Inattivo', cls: 'fd-pass-status--inactive' },
      suspended: { label: 'Sospeso', cls: 'fd-pass-status--inactive' }
    };
    return map[key] || { label: status || '—', cls: 'fd-pass-status--neutral' };
  }

  function relocatePassesRangeHint(root, text) {
    if (!text || root.querySelector('.fd-passes-toolbar__range')) return;
    var toolbar = root.querySelector('#passSearchInput')?.closest('div');
    if (!toolbar) return;
    var sub = document.createElement('div');
    sub.className = 'fd-passes-toolbar__range';
    sub.textContent = text;
    toolbar.insertAdjacentElement('afterend', sub);
  }

  function enhanceStatsGrid(scope) {
    var root = scope || document.getElementById('passesContent');
    if (!root) return;
    var grid = root.querySelector('.stats-grid');
    if (!grid || grid.dataset.fdDsStats === '1') return;
    grid.dataset.fdDsStats = '1';
    grid.classList.add('fd-stat-grid', 'fd-passes-stat-grid');
    grid.style.marginBottom = '';
    var rangeHintText = '';
    grid.querySelectorAll('.stat-card').forEach(function (card) {
      card.classList.add('fd-stat-card');
      var label = card.querySelector('.stat-label');
      if (label) label.classList.add('fd-stat-card__label');
      var value = card.querySelector('.stat-value');
      if (value) value.classList.add('fd-stat-card__value');
      card.querySelectorAll('div[style*="font-size:11px"], div[style*="font-size: 11px"], .fd-stat-card__hint').forEach(function (hint) {
        var hintText = (hint.textContent || '').trim();
        if (hintText && !rangeHintText) rangeHintText = hintText;
        hint.remove();
      });
    });
    if (rangeHintText) relocatePassesRangeHint(root, rangeHintText);
  }

  function enhancePassesToolbar(scope) {
    var root = scope || document.getElementById('passesContent');
    if (!root) return;
    var input = root.querySelector('#passSearchInput');
    if (!input) return;
    var row = input.closest('div');
    if (!row || row.dataset.fdDsToolbar === '1') return;
    row.dataset.fdDsToolbar = '1';
    row.classList.add('fd-toolbar', 'fd-passes-toolbar');
    row.style.display = '';
    row.style.justifyContent = '';
    row.style.alignItems = '';
    row.style.gap = '';
    row.style.flexWrap = '';
    row.style.marginBottom = '';
    input.classList.add('fd-passes-search');
    input.style.maxWidth = '';

    var csvBtn = row.querySelector('[onclick*="downloadPassesTableCsv"]');
    var start = row.querySelector('.fd-toolbar__start');
    if (!start) {
      start = document.createElement('div');
      start.className = 'fd-toolbar__start';
      row.insertBefore(start, row.firstChild);
      start.appendChild(input);
    }

    var actions = row.querySelector('.fd-passes-toolbar__actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'fd-toolbar__end fd-passes-toolbar__actions';
      row.appendChild(actions);
      if (csvBtn && csvBtn.parentNode !== actions) actions.appendChild(csvBtn);
    } else if (csvBtn && csvBtn.parentNode !== actions) {
      actions.appendChild(csvBtn);
    }
  }

  function enhancePassesPagination(scope) {
    var root = scope || document.getElementById('passesContent');
    if (!root) return;
    root.querySelectorAll('.fd-passes-pagination').forEach(function (el) {
      if (el.dataset.fdDsPagination === '1') return;
      el.dataset.fdDsPagination = '1';
    });
    var table = root.querySelector('.pass-table');
    if (!table) return;
    var pager = table.closest('.pass-table-wrap')?.nextElementSibling;
    if (!pager || pager.dataset.fdDsPagination === '1') return;
    if (!pager.querySelector('button[onclick*="goPrevPassesPage"], button[onclick*="goNextPassesPage"]')) return;
    pager.dataset.fdDsPagination = '1';
    pager.classList.add('fd-passes-pagination');
    pager.style.display = '';
    pager.style.justifyContent = '';
    pager.style.alignItems = '';
    pager.style.marginTop = '';
    pager.style.gap = '';
    pager.style.flexWrap = '';
  }

  function enhanceBulkBar(scope) {
    var root = scope || document.getElementById('passesContent');
    if (!root) return;
    var bar = root.querySelector('#passBulkBar');
    if (!bar || bar.dataset.fdDsBulk === '1') return;
    bar.dataset.fdDsBulk = '1';
    bar.classList.add('fd-passes-bulk-bar');
    var hint = root.querySelector('.bulk-select-hint');
    if (hint) hint.classList.add('fd-passes-bulk-hint');
  }

  function applyDsButtonClasses(scope) {
    var root = scope || document.getElementById('passesContent');
    if (!root) return;

    root.querySelectorAll('#passBulkBar .btn.small.sec, #passBulkBar .btn.sec.small').forEach(function (btn) {
      if (!btn.classList.contains('small')) btn.classList.add('small');
    });
    root.querySelectorAll('#passBulkBar .btn.small.danger, #passBulkBar .btn.danger.small').forEach(function (btn) {
      if (!btn.classList.contains('small')) btn.classList.add('small');
    });
    root.querySelectorAll('[onclick*="downloadPassesTableCsv"]').forEach(function (btn) {
      btn.classList.remove('sec');
      btn.classList.add('small');
    });
    root.querySelectorAll('.fd-passes-pagination button').forEach(function (btn) {
      btn.classList.add('small', 'sec');
    });

    root.querySelectorAll('#fdPassesColsToggle').forEach(function (btn) {
      btn.remove();
    });
  }

  function enhancePassTable(scope) {
    var root = scope || document.getElementById('passesContent');
    if (!root) return;
    var table = root.querySelector('.pass-table');
    if (table) table.classList.add('fd-table');
    var wrap = root.querySelector('.pass-table-wrap');
    if (wrap) wrap.classList.add('fd-table-wrap');
  }

  function ensureAdvancedColumnsToggle() {
    var section = document.getElementById('passes');
    if (section) section.classList.add('passes--advanced-cols');
    document.querySelectorAll('#fdPassesColsToggle').forEach(function (btn) {
      btn.remove();
    });
  }

  function markAdvancedColumns() {
    var table = document.querySelector('#passesContent .pass-table');
    if (!table) return;
    table.querySelectorAll('.pass-col-advanced').forEach(function (cell) {
      cell.classList.remove('pass-col-advanced');
    });
  }

  function enhancePassIdCells(scope) {
    var root = scope || document.getElementById('passesContent');
    if (!root) return;
    root.querySelectorAll('.pass-id-copy').forEach(function (btn) {
      if (btn.dataset.fdCopyEnhanced === '1') return;
      btn.dataset.fdCopyEnhanced = '1';
      btn.classList.add('fd-pass-id-copy');
      var fullId = btn.getAttribute('title') || btn.textContent || '';
      var text = btn.textContent || '';
      btn.innerHTML =
        '<span class="fd-pass-id-copy__icon" aria-hidden="true" title="Copia Pass ID">⧉</span>' +
        '<span class="fd-pass-id-copy__text">' + text + '</span>';
      btn.setAttribute('aria-label', 'Copia Pass ID ' + fullId);
    });
  }

  function enhancePassStatusBadges(scope) {
    var root = scope || document.getElementById('passesContent');
    if (!root) return;
    root.querySelectorAll('.pass-table tbody tr').forEach(function (row) {
      var badge = row.querySelector('td .badge');
      if (!badge || badge.dataset.fdStatusLocalized === '1') return;
      var raw = (badge.textContent || '').trim();
      var meta = passStatusMeta(raw);
      badge.dataset.fdStatusLocalized = '1';
      badge.textContent = meta.label;
      badge.classList.remove('active', 'inactive');
      badge.classList.add('fd-pass-status', meta.cls);
    });
  }

  function fdPassToast(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
  }

  function fdPassConfirm(opts) {
    if (typeof window.appConfirm === 'function') return window.appConfirm(opts);
    return Promise.resolve(window.confirm(opts.message || opts.title || 'Confermi?'));
  }

  function passIdLabel(id) {
    if (typeof window.formatPassIdShort === 'function') return window.formatPassIdShort(id);
    var s = String(id || '');
    if (s.length <= 14) return s;
    return s.slice(0, 8) + '…' + s.slice(-4);
  }

  async function callRegeneratePassApi(passId) {
    var api = typeof window.API !== 'undefined' ? window.API : '/api/v1';
    var headers = typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : {};
    var res = await fetch(api + '/passes/' + encodeURIComponent(passId) + '/regenerate?json=1', {
      method: 'POST',
      headers: Object.assign({}, headers, { Accept: 'application/json' })
    });
    var data = {};
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) throw new Error((data && data.error) || res.statusText || 'Errore rigenerazione');
    return data;
  }

  async function callSetPassTestDeviceApi(passId, enabled) {
    var api = typeof window.API !== 'undefined' ? window.API : '/api/v1';
    var headers = typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : {};
    var res = await fetch(api + '/passes/' + encodeURIComponent(passId), {
      method: 'PUT',
      headers: Object.assign({}, headers, {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({ is_test_device: !!enabled })
    });
    var data = {};
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) throw new Error((data && data.error) || res.statusText || 'Errore aggiornamento');
    return data;
  }

  async function setPassTestDevice(passId, enabled, menuBtn) {
    var btn = menuBtn || null;
    var origText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.textContent = enabled ? 'Imposto…' : 'Rimuovo…';
    }
    try {
      await callSetPassTestDeviceApi(passId, enabled);
      fdPassToast(enabled ? 'Pass impostato come device di prova' : 'Pass rimosso dai device di prova');
      if (typeof window.loadPasses === 'function') await window.loadPasses(false);
      if (typeof window.refreshTestPassOptions === 'function') window.refreshTestPassOptions();
      return true;
    } catch (err) {
      fdPassToast('Errore: ' + (err && err.message ? err.message : err));
      return false;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.textContent = origText;
      }
    }
  }

  function regenerateSuccessMessage(data) {
    var msg = 'Pass rigenerato';
    if (data && data.apns_sent > 0) msg += ' — notifica inviata (' + data.apns_sent + ')';
    return msg;
  }

  async function regeneratePassInstance(passId, menuBtn) {
    var label = passIdLabel(passId);
    var ok = await fdPassConfirm({
      title: 'Rigenera pass',
      message:
        'Rigenerare il pass ' +
        label +
        '? Verrà ricreato il file wallet e re-inviata la notifica di installazione al device, se disponibile.',
      confirmLabel: 'Rigenera'
    });
    if (!ok) return false;

    var btn = menuBtn || null;
    var origText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.textContent = 'Rigenerazione…';
    }
    try {
      var data = await callRegeneratePassApi(passId);
      fdPassToast(regenerateSuccessMessage(data));
      if (typeof window.loadPasses === 'function') window.loadPasses(false);
      return true;
    } catch (err) {
      fdPassToast('Errore: ' + (err && err.message ? err.message : err));
      return false;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
        btn.textContent = origText;
      }
    }
  }

  async function regenerateSelectedPasses() {
    var set =
      typeof window.getPassSelectedIds === 'function' ? window.getPassSelectedIds() : null;
    var ids = set ? Array.from(set) : [];
    if (!ids.length) return;

    var ok = await fdPassConfirm({
      title: 'Rigenera pass selezionati',
      message:
        'Rigenerare ' +
        ids.length +
        ' pass selezionati? Verranno ricreati i file wallet e re-inviate le notifiche di installazione ai device registrati.',
      confirmLabel: 'Rigenera'
    });
    if (!ok) return;

    var bulkBtn = document.getElementById('fdPassBulkRegenerateBtn');
    var bulkOrig = bulkBtn ? bulkBtn.textContent : '';
    if (bulkBtn) {
      bulkBtn.disabled = true;
      bulkBtn.setAttribute('aria-busy', 'true');
      bulkBtn.textContent = 'Rigenerazione…';
    }

    var okCount = 0;
    var failCount = 0;
    var pushCount = 0;
    for (var i = 0; i < ids.length; i++) {
      try {
        var data = await callRegeneratePassApi(ids[i]);
        okCount += 1;
        if (data && data.apns_sent > 0) pushCount += data.apns_sent;
      } catch (_) {
        failCount += 1;
      }
    }

    if (bulkBtn) {
      bulkBtn.disabled = false;
      bulkBtn.removeAttribute('aria-busy');
      bulkBtn.textContent = bulkOrig;
    }

    if (okCount) {
      var bulkMsg = 'Rigenerati ' + okCount + ' pass';
      if (pushCount > 0) bulkMsg += ' — ' + pushCount + ' notifiche inviate';
      fdPassToast(bulkMsg);
    }
    if (failCount) fdPassToast(failCount + ' pass non rigenerati');
    if (okCount && typeof window.loadPasses === 'function') window.loadPasses(false);
  }

  function ensurePassBulkRegenerateButton() {
    var bar = document.querySelector('#passBulkBar div[style*="display:flex"]');
    if (!bar || document.getElementById('fdPassBulkRegenerateBtn')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'fdPassBulkRegenerateBtn';
    btn.className = 'btn small sec';
    btn.textContent = 'Rigenera selezionati';
    btn.setAttribute('data-rbac-write', 'passes');
    btn.addEventListener('click', regenerateSelectedPasses);
    var deleteBtn = bar.querySelector('.btn.danger');
    if (deleteBtn) bar.insertBefore(btn, deleteBtn);
    else bar.appendChild(btn);
  }

  function restorePassRowMenuPanel(panel) {
    if (!panel || !panel._fdMenuHome) return;
    if (panel.parentNode !== panel._fdMenuHome) {
      panel._fdMenuHome.appendChild(panel);
    }
    panel._fdMenuTrigger = null;
  }

  function resetPassRowMenuPanel(panel) {
    if (!panel) return;
    panel.classList.remove('fd-pass-row-menu__panel--floating');
    panel.style.top = '';
    panel.style.left = '';
    panel.style.right = '';
    panel.style.minWidth = '';
    panel.style.zIndex = '';
  }

  function positionPassRowMenuPanel(trigger, panel) {
    if (!trigger || !panel) return;
    panel.classList.add('fd-pass-row-menu__panel--floating');
    var minW = Math.max(168, Math.round(trigger.getBoundingClientRect().width));
    var rect = trigger.getBoundingClientRect();
    panel.style.minWidth = minW + 'px';
    panel.style.right = 'auto';
    panel.style.left = Math.max(8, Math.round(rect.right - minW)) + 'px';
    panel.style.top = Math.round(rect.bottom + 4) + 'px';
    panel.style.zIndex = '1200';

    var panelRect = panel.getBoundingClientRect();
    if (panelRect.bottom > window.innerHeight - 8) {
      panel.style.top = Math.max(8, Math.round(rect.top - panelRect.height - 4)) + 'px';
    }
    if (panelRect.left < 8) {
      panel.style.left = '8px';
    }
    if (panelRect.right > window.innerWidth - 8) {
      panel.style.left = Math.max(8, Math.round(window.innerWidth - panelRect.width - 8)) + 'px';
    }
  }

  function closeAllPassRowMenus() {
    document.querySelectorAll('.fd-pass-row-menu__panel').forEach(function (p) {
      p.hidden = true;
      resetPassRowMenuPanel(p);
      restorePassRowMenuPanel(p);
    });
    document.querySelectorAll('.fd-pass-row-menu__trigger').forEach(function (t) {
      t.setAttribute('aria-expanded', 'false');
    });
  }

  function openPassRowMenu(trigger, panel) {
    closeAllPassRowMenus();
    var menu = trigger.closest('.fd-pass-row-menu');
    if (!menu) return;
    panel._fdMenuHome = menu;
    panel._fdMenuTrigger = trigger;
    document.body.appendChild(panel);
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    positionPassRowMenuPanel(trigger, panel);
  }

  function wirePassTableScrollDismiss() {
    if (document.body.dataset.fdPassTableScrollDismiss) return;
    document.body.dataset.fdPassTableScrollDismiss = '1';
    document.addEventListener(
      'scroll',
      function (e) {
        if (e.target && e.target.closest && e.target.closest('.pass-table-wrap')) {
          closeAllPassRowMenus();
        }
      },
      true
    );
    window.addEventListener('resize', closeAllPassRowMenus);
  }

  function enhancePassRowActions() {
    document.querySelectorAll('#passesContent .pass-row-actions').forEach(function (wrap) {
      if (wrap.dataset.fdActionsEnhanced === '1') return;
      wrap.dataset.fdActionsEnhanced = '1';
      var viewBtn = wrap.querySelector('.pass-action-btn--view');
      var delBtn = wrap.querySelector('.pass-action-btn--danger');
      if (!viewBtn || !delBtn) return;
      var row = wrap.closest('tr');
      var isTestDevice = row && row.dataset.passTestDevice === '1';
      var passId =
        viewBtn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] ||
        delBtn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] ||
        '';
      var menuId = 'fdPassMenu_' + passId.replace(/[^a-z0-9]/gi, '');
      wrap.innerHTML =
        '<div class="fd-pass-row-menu">' +
        '<button type="button" class="fd-btn fd-btn--secondary fd-btn--sm fd-pass-row-menu__trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="' +
        menuId +
        '">Azioni</button>' +
        '<div class="fd-pass-row-menu__panel" id="' +
        menuId +
        '" role="menu" hidden>' +
        '<button type="button" class="fd-pass-row-menu__item" role="menuitem" data-action="view">Dettaglio pass</button>' +
        '<button type="button" class="fd-pass-row-menu__item" role="menuitem" data-action="toggle-test" data-rbac-write="passes">' +
        (isTestDevice ? 'Rimuovi da test' : 'Imposta come test') +
        '</button>' +
        '<button type="button" class="fd-pass-row-menu__item" role="menuitem" data-action="regenerate" data-rbac-write="passes">Rigenera pass</button>' +
        '<hr class="fd-pass-row-menu__sep" role="separator">' +
        '<button type="button" class="fd-pass-row-menu__item fd-pass-row-menu__item--danger" role="menuitem" data-action="delete" data-rbac-write="passes">Elimina pass</button>' +
        '</div></div>';
      var trigger = wrap.querySelector('.fd-pass-row-menu__trigger');
      var panel = wrap.querySelector('.fd-pass-row-menu__panel');
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        if (panel.hidden) openPassRowMenu(trigger, panel);
        else closeAllPassRowMenus();
      });
      wrap.querySelector('[data-action="view"]').addEventListener('click', function () {
        closeAllPassRowMenus();
        if (typeof window.viewPassDetail === 'function') window.viewPassDetail(passId);
      });
      wrap.querySelector('[data-action="regenerate"]').addEventListener('click', function (e) {
        var regenBtn = e.currentTarget;
        closeAllPassRowMenus();
        regeneratePassInstance(passId, regenBtn);
      });
      wrap.querySelector('[data-action="toggle-test"]').addEventListener('click', function (e) {
        var testBtn = e.currentTarget;
        closeAllPassRowMenus();
        setPassTestDevice(passId, !isTestDevice, testBtn);
      });
      wrap.querySelector('[data-action="delete"]').addEventListener('click', function () {
        closeAllPassRowMenus();
        if (typeof window.deletePassInstance === 'function') window.deletePassInstance(passId);
      });
    });
    if (!document.body.dataset.fdPassMenuDismiss) {
      document.body.dataset.fdPassMenuDismiss = '1';
      document.addEventListener('click', closeAllPassRowMenus);
    }
  }

  function renderCompactPassLegendHtml() {
    return (
      '<div class="fd-passes-legend-hint">' +
      '<button type="button" class="fd-btn fd-btn--ghost fd-btn--sm fd-passes-legend-trigger" ' +
      'id="fdPassTableLegendBtn" aria-expanded="false" aria-controls="fdPassTableLegendPanel">' +
      'Legenda colonne</button>' +
      '<div class="fd-passes-legend-panel" id="fdPassTableLegendPanel" role="dialog" aria-label="Legenda tabella pass emessi" hidden>' +
      '<div class="fd-passes-legend-panel__title">Legenda tabella</div>' +
      '<ul class="fd-passes-legend-panel__list">' +
      '<li><strong>Installato</strong> — salvato nel wallet vs solo generato</li>' +
      '<li><strong>Apple</strong> — token push (APNs) attivo o assente</li>' +
      '<li><strong>Google</strong> — GW salvato · GW° in attesa · — non usato</li>' +
      '<li class="fd-wallet-samsung-ui"><strong>Samsung</strong> — SW salvato · SW° in attesa</li>' +
      '<li><strong>Push (APNs)</strong> — ✔ consegnata · ✖ errore · Nx = numero invii</li>' +
      '<li><strong>Pass ID</strong> — clic per copiare l’identificativo</li>' +
      '<li><strong>Selezione</strong> — ☑ prima colonna → Rigenera / Elimina selezionati</li>' +
      '</ul></div></div>'
    );
  }

  function wirePassLegendPopover(scope) {
    var root = scope || document.getElementById('passesContent');
    if (!root) return;
    var btn = root.querySelector('#fdPassTableLegendBtn');
    var panel = root.querySelector('#fdPassTableLegendPanel');
    if (!btn || !panel || btn.dataset.fdLegendWired === '1') return;
    btn.dataset.fdLegendWired = '1';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = panel.hidden;
      document.querySelectorAll('.fd-passes-legend-panel').forEach(function (p) {
        p.hidden = true;
      });
      document.querySelectorAll('.fd-passes-legend-trigger').forEach(function (t) {
        t.setAttribute('aria-expanded', 'false');
      });
      if (open) {
        panel.hidden = false;
        btn.setAttribute('aria-expanded', 'true');
      }
    });
    if (!document.body.dataset.fdPassLegendDismiss) {
      document.body.dataset.fdPassLegendDismiss = '1';
      document.addEventListener('click', function () {
        document.querySelectorAll('.fd-passes-legend-panel').forEach(function (p) {
          p.hidden = true;
        });
        document.querySelectorAll('.fd-passes-legend-trigger').forEach(function (t) {
          t.setAttribute('aria-expanded', 'false');
        });
      });
    }
  }

  function patchPassTableLegend() {
    if (window.__fdPassLegendPatched || typeof window.renderPassTableLegendHtml !== 'function') return;
    window.__fdPassLegendPatched = true;
    var orig = window.renderPassTableLegendHtml;
    window.renderPassTableLegendHtml = function () {
      if (!isFiloPassesApp()) return orig();
      return renderCompactPassLegendHtml();
    };
  }

  function collapsePassTableLegend(scope) {
    var root = scope || document.getElementById('passesContent');
    if (!root) return;
    root.querySelectorAll('.pass-table-legend').forEach(function (el) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    });
  }

  function enhancePassesDom() {
    var content = document.getElementById('passesContent');
    enhancePassesSectionDesign();
    ensurePassesLayout();
    if (!content) return;
    enhanceStatsGrid(content);
    enhanceBulkBar(content);
    enhancePassesToolbar(content);
    enhancePassTable(content);
    ensureAdvancedColumnsToggle();
    markAdvancedColumns();
    enhancePassesPagination(content);
    applyDsButtonClasses(content);
    enhancePassRowActions();
    wirePassTableScrollDismiss();
    ensurePassBulkRegenerateButton();
    enhancePassIdCells(content);
    enhancePassStatusBadges(content);
    wirePassLegendPopover(content);
    collapsePassTableLegend(content);
    if (typeof window.fdEnhanceResponsiveTables === 'function') {
      window.fdEnhanceResponsiveTables();
    }
  }

  function patchLoadPasses() {
    if (window.__fdPassesPatched || typeof window.loadPasses !== 'function') return;
    window.__fdPassesPatched = true;
    var orig = window.loadPasses;
    window.loadPasses = async function () {
      if (!isFiloPassesApp()) return orig.apply(this, arguments);
      if (!window.brandId) return orig.apply(this, arguments);
      enhancePassesSectionDesign();
      var el = document.getElementById('passesContent');
      if (el) el.innerHTML = renderLoadingSkeleton();
      var origDiag = window.loadPassWalletChannelsDiag;
      window.loadPassWalletChannelsDiag = function () {};
      try {
        await orig.apply(this, arguments);
        enhancePassesDom();
        if (typeof origDiag === 'function') await origDiag();
        if (typeof window.fdRbacHook === 'function') window.fdRbacHook('passes');
      } finally {
        window.loadPassWalletChannelsDiag = origDiag;
      }
    };
  }

  function patchNavForPasses() {
    if (window.__fdPassesNavPatched || typeof window.nav !== 'function') return;
    window.__fdPassesNavPatched = true;
    var origNav = window.nav;
    window.nav = function (id) {
      var r = origNav.apply(this, arguments);
      var done = function () {
        if (id === 'passes') enhancePassesSectionDesign();
      };
      if (r && typeof r.then === 'function') return r.then(done);
      setTimeout(done, 0);
      return r;
    };
  }

  function initFdPasses() {
    if (!isFiloPassesApp()) return;
    patchPassTableLegend();
    ensurePassesLayout();
    patchLoadPasses();
    patchNavForPasses();
    enhancePassesSectionDesign();
  }

  window.fdInitPasses = initFdPasses;
  window.fdEnhancePassesDom = enhancePassesDom;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdPasses);
  } else {
    initFdPasses();
  }
})();


/* === fd-destructive.js === */
/**
 * FD-05 — FiloDiretto: de-emphasized destructive actions (media kebab, outline deletes).
 */
(function () {
  'use strict';

  function isFiloDestructiveApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function closeMediaMenu() {
    var panel = document.getElementById('fdMediaPageMenuPanel');
    var trigger = document.getElementById('fdMediaPageMenuBtn');
    if (panel) {
      panel.hidden = true;
      panel.classList.remove('fd-floating-menu-panel');
    }
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
  }

  function ensureMediaPageMenu() {
    var section = document.getElementById('media-library');
    if (!section) return;
    section.classList.add('media-library--fd');

    var header = section.querySelector('.fd-media-header') || section.querySelector(':scope > div');
    if (!header) return;
    var actions = header.querySelector('.fd-media-header__actions') || header.querySelector(':scope > div:last-child') || header.querySelector('div');
    if (!actions) return;

    var clearBtn = actions.querySelector('button[onclick*="deleteAllMedia"]');
    if (clearBtn) clearBtn.classList.add('fd-media-clear-btn');

    var existing = document.getElementById('fdMediaPageMenu');
    if (existing) {
      if (existing.parentNode !== actions) actions.appendChild(existing);
      return;
    }

    var menu = document.createElement('div');
    menu.className = 'fd-media-page-menu';
    menu.id = 'fdMediaPageMenu';
    var kebabIcon =
      window.FD_ICONS && typeof window.FD_ICONS.svg === 'function'
        ? window.FD_ICONS.svg('kebab', 18)
        : '⋮';
    menu.innerHTML =
      '<button type="button" class="fd-media-page-menu__trigger" id="fdMediaPageMenuBtn" aria-label="Altre azioni libreria media" title="Altre azioni" aria-haspopup="menu" aria-expanded="false">' +
      kebabIcon +
      '</button>' +
      '<div class="fd-media-page-menu__panel" id="fdMediaPageMenuPanel" role="menu" hidden>' +
      '<button type="button" class="fd-media-page-menu__item" id="fdMediaExportBtn" role="menuitem">Esporta libreria (.zip)</button>' +
      '<button type="button" class="fd-media-page-menu__item" id="fdMediaSpecsBtn" role="menuitem">Specifiche tecniche</button>' +
      '<hr class="fd-media-page-menu__sep">' +
      '<button type="button" class="fd-media-page-menu__item fd-media-page-menu__item--danger" id="fdMediaClearAllBtn" role="menuitem">Svuota libreria…</button>' +
      '</div>';
    actions.appendChild(menu);

    var trigger = document.getElementById('fdMediaPageMenuBtn');
    var panel = document.getElementById('fdMediaPageMenuPanel');
    var exportItem = document.getElementById('fdMediaExportBtn');
    var specsItem = document.getElementById('fdMediaSpecsBtn');
    var item = document.getElementById('fdMediaClearAllBtn');

    if (trigger && panel) {
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        var menuWrap = e.currentTarget && e.currentTarget.closest('.fd-media-page-menu');
        var panelLocal = menuWrap ? menuWrap.querySelector('.fd-media-page-menu__panel') : panel;
        var triggerLocal = e.currentTarget || trigger;
        var open = panelLocal ? panelLocal.hidden : true;
        closeMediaMenu();
        if (open) {
          triggerLocal.setAttribute('aria-expanded', 'true');
          if (typeof window.fdPositionFloatingMenu === 'function') {
            window.fdPositionFloatingMenu(triggerLocal, panelLocal || panel);
          } else {
            if (panelLocal) panelLocal.hidden = false;
          }
        }
      });
    }

    if (exportItem) {
      exportItem.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMediaMenu();
        if (typeof window.fdMediaExportLibrary === 'function') window.fdMediaExportLibrary();
      });
    }

    if (specsItem) {
      specsItem.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMediaMenu();
        if (typeof window.fdMediaOpenSpecs === 'function') window.fdMediaOpenSpecs();
      });
    }

    if (item) {
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        closeMediaMenu();
        if (typeof window.fdMediaOpenClearDialog === 'function') window.fdMediaOpenClearDialog();
        else if (typeof window.deleteAllMedia === 'function') window.deleteAllMedia();
      });
    }

    if (document.body.dataset.fdMediaMenuBound !== '1') {
      document.body.dataset.fdMediaMenuBound = '1';
      document.addEventListener('click', closeMediaMenu);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeMediaMenu();
      });
    }
  }

  function enhanceMediaDeleteButtons(root) {
    if (!root) return;
    root.querySelectorAll('button[onclick*="deleteMediaItem"]').forEach(function (btn) {
      btn.className = 'btn small sec fd-btn-danger-outline fd-media-delete-btn';
      if (!btn.textContent.trim()) btn.textContent = 'Elimina';
    });
  }

  function enhanceBrandIdentityAssetButtons() {
    document.querySelectorAll('#brand-identity .a2w-bi-asset-actions button[id*="RemoveBtn"]').forEach(function (btn) {
      btn.classList.remove('danger');
      btn.classList.add('sec', 'small', 'fd-btn-danger-outline');
    });
  }

  function enhanceMediaLibraryDom() {
    if (!isFiloDestructiveApp()) return;
    ensureMediaPageMenu();
    var section = document.getElementById('media-library');
    if (section) enhanceMediaDeleteButtons(section);
  }

  function patchRenderers() {
    if (window.__fdDestructivePatched) return;
    window.__fdDestructivePatched = true;

    var origMedia = window.loadMediaLibrary;
    if (typeof origMedia === 'function') {
      window.loadMediaLibrary = async function () {
        await origMedia.apply(this, arguments);
        if (isFiloDestructiveApp()) enhanceMediaLibraryDom();
        if (typeof window.fdRbacHook === 'function') window.fdRbacHook('media-library');
      };
    }

    var origBiGrid = window.a2wBiRenderAssetsGrid;
    if (typeof origBiGrid === 'function') {
      window.a2wBiRenderAssetsGrid = function () {
        origBiGrid.apply(this, arguments);
        if (isFiloDestructiveApp()) enhanceBrandIdentityAssetButtons();
        if (typeof window.fdRbacHook === 'function') window.fdRbacHook('brand-identity');
      };
    }
  }

  function initFdDestructive() {
    if (!isFiloDestructiveApp()) return;
    patchRenderers();
    ensureMediaPageMenu();
    enhanceMediaLibraryDom();
    enhanceBrandIdentityAssetButtons();
  }

  window.fdInitDestructive = initFdDestructive;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdDestructive);
  } else {
    initFdDestructive();
  }
})();


/* === fd-form-dirty.js === */
/**
 * FD-06 — FiloDiretto form dirty state (brand identity v2 + template save guard).
 */
(function () {
  'use strict';

  function isFiloFormDirtyApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function isHrContext() {
    if (typeof window.isHrDashboard === 'function') return window.isHrDashboard();
    return false;
  }

  function isBrandIdentityActive() {
    var section = document.getElementById('brand-identity');
    return !!(section && section.classList.contains('active'));
  }

  function patchBrandIdentityV2Flag() {
    if (window.__fdBiV2Patched) return;
    window.__fdBiV2Patched = true;
    var orig = window.isA2wBrandIdentityV2Enabled;
    window.isA2wBrandIdentityV2Enabled = function () {
      if (isFiloFormDirtyApp()) return true;
      if (typeof orig === 'function') return orig();
      return false;
    };
  }

  var TPL_FIELD_IDS = [
    'tplName', 'tplDescription', 'tplHeaderLabel', 'tplHeaderValue',
    'tplSecLabel', 'tplSecValue', 'tplAuxLabel', 'tplAuxValue',
    'tplLink1Label', 'tplLink1Url', 'tplLink2Label', 'tplLink2Url',
    'tplLink3Label', 'tplLink3Url', 'tplRegolamento', 'tplContatti',
    'hrFixedLinkLabel', 'hrFixedLinkUrl'
  ];

  function serializeTemplateImageState() {
    var parts = [];
    try {
      var cache = window.tplImageCache || {};
      Object.keys(cache).sort().forEach(function (key) {
        if (cache[key]) parts.push('c:' + key);
      });
      var rem = window.tplImageRemovals || {};
      Object.keys(rem).sort().forEach(function (key) {
        if (rem[key]) parts.push('r:' + key);
      });
      ['logo', 'strip', 'thumbnail', 'background', 'wallet_icon'].forEach(function (type) {
        var prevId = typeof window.tplMediaPreviewId === 'function' ? window.tplMediaPreviewId(type) : '';
        var el = prevId ? document.getElementById(prevId) : null;
        var visible = !!(el && el.style.display !== 'none' && el.getAttribute('src'));
        parts.push('p:' + type + ':' + (visible ? '1' : '0'));
      });
    } catch (_) {}
    return parts.join(',');
  }

  function serializeTemplateModalState() {
    var parts = [document.getElementById('templateEditId')?.value || ''];
    TPL_FIELD_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      parts.push(el ? el.value : '');
    });
    try {
      parts.push(String(window.tplWalletIconMediaId || ''));
    } catch (_) {}
    parts.push(serializeTemplateImageState());
    return parts.join('\u0001');
  }

  function ensureTemplateDirtyUi() {
    var modal = document.getElementById('templateModal');
    if (!modal) return null;
    var saveBtn = modal.querySelector('button[onclick*="saveTemplate"]');
    if (!saveBtn) return null;
    if (!saveBtn.id) saveBtn.id = 'fdTplSaveBtn';

    var legacyStatus = document.getElementById('tplSaveStatus');
    if (legacyStatus) legacyStatus.hidden = true;

    var footer = saveBtn.closest('.a2w-tpl-modal__footer');
    var bar = modal.querySelector('.fd-form-dirty-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'fd-form-dirty-bar';
      var badge = document.createElement('span');
      badge.className = 'fd-form-dirty-badge';
      badge.id = 'fdTplDirtyBadge';
      badge.textContent = 'Salvato';
      bar.appendChild(badge);
      if (footer) footer.appendChild(bar);
      else saveBtn.parentNode.insertBefore(bar, saveBtn);
    }
    if (saveBtn.parentNode !== bar) bar.appendChild(saveBtn);
    return {
      saveBtn: saveBtn,
      badge: document.getElementById('fdTplDirtyBadge')
    };
  }

  function syncTemplateDirtyState() {
    if (!isFiloFormDirtyApp() || !isHrContext()) return;
    if (isSectionReadOnly()) return;
    var ui = ensureTemplateDirtyUi();
    if (!ui) return;
    var dirty = serializeTemplateModalState() !== (window.__fdTplBaseline || '');
    ui.saveBtn.disabled = !dirty;
    if (!dirty) {
      ui.saveBtn.title = 'Nessuna modifica da salvare';
    } else {
      ui.saveBtn.removeAttribute('title');
    }
    if (ui.badge) {
      ui.badge.textContent = dirty ? 'Modifiche non salvate' : 'Salvato';
      ui.badge.classList.toggle('is-dirty', dirty);
    }
  }

  function resetTemplateBaseline() {
    window.__fdTplBaseline = serializeTemplateModalState();
    syncTemplateDirtyState();
  }

  function bindTemplateModalDirty() {
    var modal = document.getElementById('templateModal');
    if (!modal || modal.dataset.fdDirtyBound === '1') return;
    modal.dataset.fdDirtyBound = '1';
    modal.addEventListener('input', syncTemplateDirtyState);
    modal.addEventListener('change', syncTemplateDirtyState);
  }

  function patchTemplateFlows() {
    if (window.__fdTplDirtyPatched) return;
    window.__fdTplDirtyPatched = true;

    var origOpen = window.openTemplateModal;
    if (typeof origOpen === 'function') {
      window.openTemplateModal = async function () {
        await origOpen.apply(this, arguments);
        if (!isFiloFormDirtyApp()) return;
        bindTemplateModalDirty();
        resetTemplateBaseline();
      };
    }

    var origEdit = window.editTemplate;
    if (typeof origEdit === 'function') {
      window.editTemplate = async function () {
        await origEdit.apply(this, arguments);
        if (!isFiloFormDirtyApp()) return;
        bindTemplateModalDirty();
        resetTemplateBaseline();
      };
    }

    var origSave = window.saveTemplate;
    if (typeof origSave === 'function') {
      window.saveTemplate = async function () {
        await origSave.apply(this, arguments);
        if (!isFiloFormDirtyApp()) return;
        resetTemplateBaseline();
        if (typeof window.fdSyncBrandIdentityAside === 'function') window.fdSyncBrandIdentityAside();
      };
    }

    function patchTplImageDirtyHook(name) {
      var orig = window[name];
      if (typeof orig !== 'function' || window['__fdTplDirty_' + name]) return;
      window['__fdTplDirty_' + name] = true;
      window[name] = function () {
        var out = orig.apply(this, arguments);
        if (out && typeof out.then === 'function') {
          return out.then(function (res) {
            syncTemplateDirtyState();
            return res;
          });
        }
        syncTemplateDirtyState();
        return out;
      };
    }

    patchTplImageDirtyHook('clearTplImage');
    patchTplImageDirtyHook('previewTplImage');
    patchTplImageDirtyHook('tplPickFromMedia');
  }

  window.fdSyncTemplateDirtyState = syncTemplateDirtyState;

  var BI_SECTION_DEFS = {
    base: {
      key: 'base',
      selector: '#brand-identity .a2w-bi-section--base',
      fields: ['biName', 'biSlug', 'biTagline', 'biSettore', 'biLang']
    },
    contacts: {
      key: 'contacts',
      selector: '#brand-identity .a2w-bi-section--contacts',
      fields: ['biHomepage', 'biSupportEmail', 'biSupportPhone', 'biEmergencyPhone']
    },
    privacy: {
      key: 'privacy',
      selector: '#brand-identity .a2w-bi-section--privacy',
      fields: ['biDpoEmail', 'biPrivacyUrl']
    },
    social: {
      key: 'social',
      selector: '#brand-identity .a2w-bi-section--social',
      fields: ['biSocialInstagram', 'biSocialFacebook', 'biSocialLinkedin', 'biSocialTiktok', 'biSocialX']
    }
  };

  var biSectionState = {
    base: { baseline: '', dirty: false, saving: false, lastSavedAt: null },
    contacts: { baseline: '', dirty: false, saving: false, lastSavedAt: null },
    privacy: { baseline: '', dirty: false, saving: false, lastSavedAt: null },
    social: { baseline: '', dirty: false, saving: false, lastSavedAt: null }
  };

  function isSectionReadOnly() {
    if (window.FdRbac && typeof window.FdRbac.isActiveSectionReadOnly === 'function') {
      return window.FdRbac.isActiveSectionReadOnly();
    }
    return document.body && document.body.classList.contains('fd-rbac-readonly');
  }

  function removeBottomSaveBar() {
    var bar = document.getElementById('fdBiStickyBar');
    if (bar) bar.remove();
    document.body.classList.remove('fd-bi-bottom-bar-visible');
    var section = document.getElementById('brand-identity');
    if (section) section.classList.remove('brand-identity--fd-bottom-save');
    var footer = document.getElementById('fdBiFormFooter');
    if (footer) footer.remove();
  }

  function hideGlobalBrandSaveChrome() {
    var headerActions = document.querySelector('#brand-identity .a2w-bi-header__actions');
    if (headerActions) {
      headerActions.hidden = true;
      headerActions.setAttribute('aria-hidden', 'true');
    }
    var saveBtn = document.getElementById('a2wBiSaveBtn');
    if (saveBtn) saveBtn.hidden = true;
    var badge = document.getElementById('a2wBiSaveStateBadge');
    if (badge) badge.hidden = true;
  }

  function serializeSectionFields(sectionKey) {
    var def = BI_SECTION_DEFS[sectionKey];
    if (!def || typeof window.a2wBiCollectFormData !== 'function') return '';
    var data = window.a2wBiCollectFormData();
    var map = {
      biName: data.name,
      biSlug: data.slug,
      biTagline: data.tagline,
      biSettore: data.settore,
      biLang: data.lang,
      biHomepage: data.homepage,
      biSupportEmail: data.supportEmail,
      biSupportPhone: data.supportPhone,
      biDpoEmail: data.dpoEmail,
      biPrivacyUrl: data.privacyUrl,
      biEmergencyPhone: data.emergencyPhone,
      biSocialInstagram: data.socialInstagram,
      biSocialFacebook: data.socialFacebook,
      biSocialLinkedin: data.socialLinkedin,
      biSocialTiktok: data.socialTiktok,
      biSocialX: data.socialX
    };
    return def.fields.map(function (id) { return map[id] || ''; }).join('\u0001');
  }

  function resetSectionBaseline(sectionKey) {
    biSectionState[sectionKey].baseline = serializeSectionFields(sectionKey);
    biSectionState[sectionKey].dirty = false;
  }

  function resetAllSectionBaselines() {
    Object.keys(BI_SECTION_DEFS).forEach(resetSectionBaseline);
  }

  function syncSectionDirtyState(sectionKey) {
    var state = biSectionState[sectionKey];
    if (!state) return;
    state.dirty = serializeSectionFields(sectionKey) !== state.baseline;
  }

  function syncAllSectionDirtyState() {
    Object.keys(BI_SECTION_DEFS).forEach(function (key) {
      syncSectionDirtyState(key);
      syncSectionSaveUi(key);
    });
    syncGlobalDirtyFromSections();
  }

  function syncGlobalDirtyFromSections() {
    if (!window.brandIdentityState) return;
    var anyDirty = Object.keys(BI_SECTION_DEFS).some(function (key) {
      return biSectionState[key].dirty;
    });
    window.brandIdentityState.dirty = anyDirty;
  }

  function formatSectionSavedLabel(sectionKey) {
    var state = biSectionState[sectionKey];
    if (state.dirty) return 'Modifiche non salvate';
    if (state.saving) return 'Salvataggio…';
    if (state.lastSavedAt && typeof window.formatRelativeSavedLabel === 'function') {
      var rel = window.formatRelativeSavedLabel(state.lastSavedAt);
      if (rel && rel.label) return rel.label.indexOf('✓') >= 0 ? rel.label : rel.label + ' ✓';
    }
    if (state.lastSavedAt) return 'Salvato ✓';
    if (!window.brandId && sectionKey === 'base') return '';
    return 'Salvato ✓';
  }

  function sectionSaveDisabledReason(sectionKey) {
    var state = biSectionState[sectionKey];
    if (isSectionReadOnly()) return 'Sola lettura';
    if (state.saving) return 'Salvataggio in corso';
    if (!state.dirty) return 'Nessuna modifica da salvare';
    if (sectionKey !== 'base' && !window.brandId) return 'Salva prima le informazioni base';
    if (sectionKey === 'base' && window.brandIdentityState && window.brandIdentityState.slugChecking) {
      return 'Verifica slug in corso';
    }
    if (sectionKey === 'base' && window.brandIdentityState && window.brandIdentityState.slugAvailable === false) {
      return 'Slug non disponibile';
    }
    var errors = collectSectionErrors(sectionKey);
    var count = Object.keys(errors).length;
    if (count > 0) return count === 1 ? '1 campo da correggere' : count + ' campi da correggere';
    return '';
  }

  function collectSectionErrors(sectionKey) {
    if (typeof window.a2wBiValidate !== 'function' || typeof window.a2wBiCollectFormData !== 'function') {
      return {};
    }
    var def = BI_SECTION_DEFS[sectionKey];
    var allErrors = window.a2wBiValidate(window.a2wBiCollectFormData());
    var errors = {};
    def.fields.forEach(function (fieldId) {
      if (allErrors[fieldId]) errors[fieldId] = allErrors[fieldId];
    });
    if (sectionKey === 'base' || !window.brandId) {
      if (allErrors.biName) errors.biName = allErrors.biName;
      if (allErrors.biSlug) errors.biSlug = allErrors.biSlug;
    }
    return errors;
  }

  function syncSectionSaveUi(sectionKey) {
    var def = BI_SECTION_DEFS[sectionKey];
    if (!def) return;
    var bar = document.getElementById('fdBiSectionSave-' + sectionKey);
    if (!bar) return;
    var state = biSectionState[sectionKey];
    var btn = document.getElementById('fdBiSectionSaveBtn-' + sectionKey);
    var status = document.getElementById('fdBiSectionSaveStatus-' + sectionKey);
    var reason = sectionSaveDisabledReason(sectionKey);

    bar.classList.toggle('is-dirty', !!state.dirty && !state.saving);
    bar.classList.toggle('is-saving', !!state.saving);
    bar.classList.toggle('is-clean', !state.dirty && !state.saving);

    if (btn) {
      btn.disabled = !!reason;
      btn.textContent = state.saving ? 'Salvataggio…' : 'Salva';
      if (reason) btn.title = reason;
      else btn.removeAttribute('title');
    }
    if (status) {
      status.textContent = formatSectionSavedLabel(sectionKey);
      status.classList.toggle('is-dirty', !!state.dirty && !state.saving);
      status.classList.toggle('is-saving', !!state.saving);
      status.classList.toggle('is-clean', !state.dirty && !state.saving);
    }
  }

  function ensureSectionSaveBar(sectionKey) {
    var def = BI_SECTION_DEFS[sectionKey];
    var sectionEl = document.querySelector(def.selector);
    if (!sectionEl) return;
    var barId = 'fdBiSectionSave-' + sectionKey;
    if (document.getElementById(barId)) return;

    var bar = document.createElement('div');
    bar.id = barId;
    bar.className = 'fd-bi-section-save';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Salvataggio sezione');
    bar.innerHTML =
      '<span class="fd-bi-section-save__status is-clean" id="fdBiSectionSaveStatus-' + sectionKey + '" aria-live="polite"></span>' +
      '<button type="button" class="fd-btn fd-btn--secondary fd-btn--sm fd-bi-section-save__btn" ' +
      'id="fdBiSectionSaveBtn-' + sectionKey + '" data-fd-section-save="' + sectionKey + '" disabled>Salva</button>';
    var saveHost = sectionEl.querySelector('.fd-bi-section-body') || sectionEl;
    saveHost.appendChild(bar);

    document.getElementById('fdBiSectionSaveBtn-' + sectionKey).addEventListener('click', function () {
      saveBrandIdentitySection(sectionKey);
    });
    syncSectionSaveUi(sectionKey);
  }

  function ensureAllSectionSaveBars() {
    if (!isFiloFormDirtyApp() || !isBrandIdentityActive()) return;
    removeBottomSaveBar();
    hideGlobalBrandSaveChrome();
    Object.keys(BI_SECTION_DEFS).forEach(ensureSectionSaveBar);
    syncAllSectionDirtyState();
  }

  function buildBrandConfigFromForm(data) {
    var config = {
      settore: data.settore,
      homepage: data.homepage,
      language: data.lang,
      support: {
        email: data.supportEmail,
        phone: data.supportPhone
      },
      social: {
        instagram: data.socialInstagram,
        facebook: data.socialFacebook,
        linkedin: data.socialLinkedin,
        tiktok: data.socialTiktok,
        x: data.socialX
      }
    };
    if (typeof window.isBrandIdentityPassFieldsExcluded === 'function' && !window.isBrandIdentityPassFieldsExcluded()) {
      config.tagline = data.tagline;
    }
    return config;
  }

  function apiBase() {
    return (typeof window.API === 'string' && window.API) ? window.API : '/api/v1';
  }

  async function saveBrandIdentitySection(sectionKey) {
    var state = biSectionState[sectionKey];
    if (!state || state.saving || !state.dirty || isSectionReadOnly()) return;
    if (sectionKey !== 'base' && !window.brandId) {
      if (typeof window.toast === 'function') window.toast('Salva prima le informazioni base');
      return;
    }

    var data = window.a2wBiCollectFormData();
    var errors = collectSectionErrors(sectionKey);
    if (typeof window.a2wBiClearErrors === 'function') window.a2wBiClearErrors();
    Object.keys(errors).forEach(function (fieldId) {
      if (window.brandIdentityState) window.brandIdentityState.touched[fieldId] = true;
      if (typeof window.a2wBiSetFieldError === 'function') {
        window.a2wBiSetFieldError(fieldId, errors[fieldId]);
      }
    });
    if (Object.keys(errors).length > 0) {
      syncSectionSaveUi(sectionKey);
      if (typeof window.toast === 'function') window.toast('Correggi i campi evidenziati');
      return;
    }

    if (sectionKey === 'base' && window.brandIdentityState && window.brandIdentityState.slugAvailable === false) {
      if (typeof window.a2wBiSetFieldError === 'function') {
        window.a2wBiSetFieldError('biSlug', 'Slug già in uso');
      }
      syncSectionSaveUi(sectionKey);
      return;
    }

    state.saving = true;
    if (window.brandIdentityState) window.brandIdentityState.saving = true;
    syncSectionSaveUi(sectionKey);

    try {
      var name = data.name;
      var slug = data.slug || (typeof window.a2wBiSlugify === 'function' ? window.a2wBiSlugify(name) : name);
      var config = buildBrandConfigFromForm(data);
      var hrScalars = (typeof window.isBrandIdentityPassFieldsExcluded === 'function' && window.isBrandIdentityPassFieldsExcluded()) ? {
        hr_email: data.supportEmail || null,
        hr_phone: data.supportPhone || null,
        dpo_email: data.dpoEmail || null,
        emergency_phone: data.emergencyPhone || null
      } : {};
      var assets = null;
      if (typeof window.isBrandIdentityPassFieldsExcluded === 'function' && !window.isBrandIdentityPassFieldsExcluded() && window.brandIdentityState) {
        assets = {
          logo: window.brandIdentityState.selectedAssets.logo?.id || null,
          wallet_icon: window.brandIdentityState.selectedAssets.wallet_icon?.id || null,
          strip: window.brandIdentityState.selectedAssets.strip?.id || null,
          thumbnail: window.brandIdentityState.selectedAssets.thumbnail?.id || null,
          background: window.brandIdentityState.selectedAssets.background?.id || null
        };
      }

      if (!window.brandId) {
        var productLine = typeof window.getLockedProductLine === 'function'
          ? window.getLockedProductLine()
          : (typeof window.getUnscopedDashboardProductLine === 'function' ? window.getUnscopedDashboardProductLine() : null);
        var fixedColors = window.BRAND_PASS_FIXED_COLORS || {
          backgroundColor: '#0D0B1A',
          foregroundColor: '#FFFFFF',
          labelColor: '#A78BFA'
        };
        var createConfig = Object.assign({}, fixedColors, config, {
          brand_identity_last_saved_at: new Date().toISOString(),
          product_line: productLine
        });
        if (assets) createConfig.brand_identity_assets = assets;
        var createRes = await fetch(apiBase() + '/brands', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ name: name, slug: slug, config: createConfig }, hrScalars))
        });
        var newBrand = await createRes.json().catch(function () { return {}; });
        if (!createRes.ok || !newBrand.id) {
          if (typeof window.a2wBiSetFieldError === 'function') {
            window.a2wBiSetFieldError('biSlug', 'Slug non disponibile o dati non validi');
          }
          if (typeof window.toast === 'function') window.toast('Errore creazione brand');
          return;
        }
        window.brandId = newBrand.id;
        if (typeof window.syncBrandUrl === 'function') window.syncBrandUrl();
        if (typeof window.toast === 'function') window.toast('Brand creato!');
        if (typeof window.loadBrands === 'function') await window.loadBrands();
      } else {
        var headers = typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : {};
        var existing = await fetch(apiBase() + '/brands/' + window.brandId, { headers: headers }).then(function (r) { return r.json(); });
        var mergedConfig = Object.assign({}, existing.config || {}, config, {
          brand_identity_last_saved_at: new Date().toISOString()
        });
        if (assets) mergedConfig.brand_identity_assets = assets;
        var saveRes = await fetch(apiBase() + '/brands/' + window.brandId, {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: JSON.stringify(Object.assign({ name: name, slug: slug, config: mergedConfig }, hrScalars))
        });
        if (!saveRes.ok) {
          var err = await saveRes.json().catch(function () { return {}; });
          if (/slug|duplicate|unique/i.test(err.error || '')) {
            if (typeof window.a2wBiSetFieldError === 'function') {
              window.a2wBiSetFieldError('biSlug', 'Slug già in uso');
            }
          }
          throw new Error(err.error || 'Errore salvataggio identità');
        }
        if (typeof window.toast === 'function') window.toast('Sezione salvata');
      }

      state.lastSavedAt = Date.now();
      if (window.brandIdentityState) window.brandIdentityState.lastSavedAt = state.lastSavedAt;
      if (typeof window.applyBrandTheme === 'function') window.applyBrandTheme();
      if (typeof window.loadBrandIdentity === 'function') await window.loadBrandIdentity();
      if (typeof window.fdSyncBrandIdentityAside === 'function') window.fdSyncBrandIdentityAside();
    } catch (e) {
      if (typeof window.toast === 'function') window.toast(e.message || 'Errore salvataggio identità');
    } finally {
      state.saving = false;
      if (window.brandIdentityState) window.brandIdentityState.saving = false;
      syncAllSectionDirtyState();
    }
  }

  function patchBrandIdentitySaveUi() {
    if (window.__fdBiSectionSavePatched) return;
    window.__fdBiSectionSavePatched = true;
    removeBottomSaveBar();
    hideGlobalBrandSaveChrome();

    if (typeof window.a2wBiSyncDirtyState === 'function') {
      var origDirty = window.a2wBiSyncDirtyState;
      window.a2wBiSyncDirtyState = function () {
        origDirty.apply(this, arguments);
        syncAllSectionDirtyState();
      };
    }

    if (typeof window.loadBrandIdentity === 'function' && !window.__fdBiSectionLoadPatched) {
      window.__fdBiSectionLoadPatched = true;
      var origLoad = window.loadBrandIdentity;
      window.loadBrandIdentity = async function () {
        await origLoad.apply(this, arguments);
        resetAllSectionBaselines();
        Object.keys(BI_SECTION_DEFS).forEach(function (key) {
          if (window.brandIdentityState && window.brandIdentityState.lastSavedAt) {
            biSectionState[key].lastSavedAt = window.brandIdentityState.lastSavedAt;
          }
        });
        ensureAllSectionSaveBars();
      };
    }
  }

  function patchNavForSectionSave() {
    if (window.__fdBiNavSectionPatched || typeof window.nav !== 'function') return;
    window.__fdBiNavSectionPatched = true;
    var orig = window.nav;
    window.nav = function (id) {
      var out = orig.apply(this, arguments);
      var done = function () {
        ensureAllSectionSaveBars();
      };
      if (out && typeof out.then === 'function') return out.then(done);
      setTimeout(done, 80);
      return out;
    };
  }

  function initFdFormDirty() {
    if (!isFiloFormDirtyApp()) return;
    patchBrandIdentityV2Flag();
    patchTemplateFlows();
    patchBrandIdentitySaveUi();
    patchNavForSectionSave();
    bindTemplateModalDirty();
    document.getElementById('brand-identity')?.classList.add('brand-identity--fd-dirty');
    removeBottomSaveBar();
    ensureAllSectionSaveBars();
  }

  window.fdInitFormDirty = initFdFormDirty;
  window.fdSyncBrandIdentitySectionSaves = ensureAllSectionSaveBars;
  window.saveBrandIdentitySection = saveBrandIdentitySection;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdFormDirty);
  } else {
    initFdFormDirty();
  }
})();


/* === fd-form-help.js === */
/**
 * FD-07 — FiloDiretto: helper contrast + complete placeholders/labels.
 */
(function () {
  'use strict';

  var URL_PLACEHOLDER = 'https://www.esempio.it/pagina';
  var URL_PLACEHOLDER_OPT = 'https://www.esempio.it/pagina (opzionale)';
  var PHONE_PLACEHOLDER = '+39 02 1234 5678';

  function isFiloFormHelpApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function fixPlaceholder(el) {
    if (!el || el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
    var ph = (el.getAttribute('placeholder') || '').trim();
    if (!ph) return;
    if (ph === 'https://...' || ph === 'https://... (opzionale)') {
      el.setAttribute('placeholder', ph.indexOf('opzionale') >= 0 ? URL_PLACEHOLDER_OPT : URL_PLACEHOLDER);
      return;
    }
    if (ph === '+39 ...') {
      el.setAttribute('placeholder', PHONE_PLACEHOLDER);
    }
  }

  function fixPlaceholdersIn(root) {
    if (!root) return;
    root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(fixPlaceholder);
  }

  function ensureSlugHelp() {
    var slugInput = document.getElementById('biSlug');
    if (!slugInput || document.getElementById('fdSlugHelp')) return;
    var row = slugInput.closest('.a2w-bi-slug-row');
    var host = row ? row.parentElement : slugInput.parentElement;
    if (!host) return;
    var help = document.createElement('p');
    help.id = 'fdSlugHelp';
    help.className = 'fd-slug-help fd-helper-text';
    help.textContent = 'Identificatore URL del brand (solo minuscole, numeri e trattini). Es. motor-k → landing /motor-k';
    var err = document.getElementById('biSlugError');
    if (err && err.parentElement === host) host.insertBefore(help, err);
    else host.appendChild(help);
  }

  function fixHrTemplateLabels() {
    var urlLabel = document.querySelector('label[for="hrFixedLinkUrl"]');
    if (urlLabel) urlLabel.textContent = 'URL link fisso';
    var tplUrlInputs = ['tplLink1Url', 'tplLink2Url', 'tplLink3Url', 'hrFixedLinkUrl', 'pushPassLinkUrl', 'pushBackLinkUrl', 'wzLink1Url'];
    tplUrlInputs.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) fixPlaceholder(el);
    });
  }

  function markInlineHelpers(root) {
    if (!root) return;
    root.querySelectorAll('p[style*="color:var(--text2)"], p[style*="color: var(--text2)"]').forEach(function (p) {
      if (p.classList.contains('a2w-bi-field-error')) return;
      p.classList.add('fd-helper-text');
    });
  }

  function applyFormHelpEnhancements() {
    if (!isFiloFormHelpApp()) return;
    fixPlaceholdersIn(document);
    ensureSlugHelp();
    fixHrTemplateLabels();
    markInlineHelpers(document.getElementById('brand-identity'));
    markInlineHelpers(document.getElementById('templateModal'));
    markInlineHelpers(document.getElementById('push'));
    markInlineHelpers(document.getElementById('media-library'));
    markInlineHelpers(document.getElementById('leads'));
  }

  function patchHrAddLinkRow() {
    if (window.__fdHrLinkRowPatched) return;
    window.__fdHrLinkRowPatched = true;
    var orig = window.hrAddLinkRow;
    if (typeof orig !== 'function') return;
    window.hrAddLinkRow = function (containerId, label, url) {
      orig.apply(this, arguments);
      if (!isFiloFormHelpApp()) return;
      var box = document.getElementById(containerId);
      if (!box) return;
      var row = box.querySelector('.hr-link-row:last-child');
      if (!row) return;
      var urlInput = row.querySelector('.hr-row-url');
      if (urlInput) urlInput.setAttribute('placeholder', URL_PLACEHOLDER);
    };
  }

  function patchNavRefresh() {
    if (window.__fdFormHelpNavPatched) return;
    window.__fdFormHelpNavPatched = true;
    var orig = window.nav;
    if (typeof orig !== 'function') return;
    window.nav = function (id) {
      orig.apply(this, arguments);
      if (isFiloFormHelpApp()) {
        window.setTimeout(applyFormHelpEnhancements, 0);
      }
    };
  }

  function patchLoadBrandIdentity() {
    if (window.__fdBiHelpPatched) return;
    window.__fdBiHelpPatched = true;
    var orig = window.loadBrandIdentity;
    if (typeof orig !== 'function') return;
    window.loadBrandIdentity = async function () {
      await orig.apply(this, arguments);
      if (isFiloFormHelpApp()) applyFormHelpEnhancements();
    };
  }

  function patchOpenTemplateModal() {
    if (window.__fdTplHelpPatched) return;
    window.__fdTplHelpPatched = true;
    ['openTemplateModal', 'editTemplate'].forEach(function (name) {
      var orig = window[name];
      if (typeof orig !== 'function') return;
      window[name] = async function () {
        await orig.apply(this, arguments);
        if (isFiloFormHelpApp()) applyFormHelpEnhancements();
      };
    });
  }

  function initFdFormHelp() {
    if (!isFiloFormHelpApp()) return;
    patchHrAddLinkRow();
    patchNavRefresh();
    patchLoadBrandIdentity();
    patchOpenTemplateModal();
    applyFormHelpEnhancements();
  }

  window.fdInitFormHelp = initFdFormHelp;
  window.fdApplyFormHelp = applyFormHelpEnhancements;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdFormHelp);
  } else {
    initFdFormHelp();
  }
})();


/* === fd-form-a11y.js === */
/**
 * FiloDiretto — associa label↔campi e alt mancanti nelle viste HR.
 */
(function () {
  'use strict';

  function isHr() {
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function wireFormLabels(root) {
    if (!root) return;
    root.querySelectorAll('.form-group').forEach(function (group) {
      var label = group.querySelector(':scope > label.form-label, :scope > .form-row > label.form-label');
      if (!label) return;
      var control = group.querySelector('input:not([type="hidden"]), select, textarea');
      if (!control) return;
      if (!control.id) {
        var base = (control.name || control.type || 'field').replace(/\W+/g, '-').slice(0, 24);
        control.id = 'fd-auto-' + base + '-' + Math.random().toString(36).slice(2, 7);
      }
      if (!label.getAttribute('for')) label.setAttribute('for', control.id);
      if (!control.getAttribute('aria-label') && label.textContent) {
        var text = label.textContent.replace(/[ⓘ*]/g, '').trim();
        if (text) control.setAttribute('aria-label', text);
      }
    });
  }

  function fixPreviewImages(root) {
    if (!root) return;
    var alts = {
      tplImgLogoPreview: 'Anteprima logo template',
      tplImgWalletIconPreview: 'Anteprima icona wallet',
      tplImgStripPreview: 'Anteprima strip template',
      tplImgThumbPreview: 'Anteprima thumbnail template',
      tplImgBgPreview: 'Anteprima sfondo template',
      bsLogoPreview: 'Anteprima logo brand',
      bsStripPreview: 'Anteprima strip brand',
      wzLogoPreview: 'Anteprima logo wizard'
    };
    Object.keys(alts).forEach(function (id) {
      var img = root.querySelector('#' + id);
      if (img && !img.hasAttribute('alt')) img.setAttribute('alt', alts[id]);
    });
    root.querySelectorAll('img:not([alt])').forEach(function (img) {
      if (img.closest('.pass-preview, .wallet-preview, [aria-hidden="true"]')) {
        img.setAttribute('alt', '');
      } else {
        img.setAttribute('alt', 'Immagine');
      }
    });
  }

  function enhanceConfirmDialogA11y() {
    var dlg = document.getElementById('appConfirmDialog');
    if (!dlg) return;
    dlg.setAttribute('role', 'dialog');
    dlg.setAttribute('aria-modal', 'true');
  }

  function ensureGlobalLiveRegion() {
    if (document.getElementById('fdGlobalAriaLive')) return;
    var node = document.createElement('div');
    node.id = 'fdGlobalAriaLive';
    node.className = 'sr-only';
    node.setAttribute('aria-live', 'polite');
    node.setAttribute('aria-atomic', 'true');
    document.body.appendChild(node);
  }

  function run() {
    if (!isHr()) return;
    var main = document.getElementById('main-content') || document.body;
    wireFormLabels(main);
    fixPreviewImages(main);
    enhanceConfirmDialogA11y();
    ensureGlobalLiveRegion();
    if (typeof window.fdEnhanceLoadingRegions === 'function') {
      window.fdEnhanceLoadingRegions(main);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
  window.fdWireFormA11y = run;
})();


/* === fd-empty-states.js === */
/**
 * FD-08 — FiloDiretto empty states: CTA + «Come funziona» (docs placeholder).
 */
(function () {
  'use strict';

  var DOC_BASE = 'https://docs.filodiretto.app/guide';

  var PRESETS = {
    templates: {
      title: 'Nessun template pass',
      description: 'Il template definisce layout, immagini e testi del pass dipendente usato in tutte le attivazioni.',
      ctaLabel: 'Crea template',
      ctaOnclick: 'openTemplateModal()',
      helpHref: DOC_BASE + '#template-pass',
      icon: 'inbox'
    },
    passes: {
      title: 'Nessun pass emesso',
      description: 'Qui trovi i pass generati dopo import anagrafica, inviti o attivazioni. Monitora installazioni e stato Wallet.',
      ctaLabel: 'Vai ai dipendenti',
      ctaOnclick: "nav('leads')",
      helpHref: DOC_BASE + '#pass-emessi',
      icon: 'inbox'
    },
    reward: {
      title: 'Nessuna campagna Reward',
      description: 'Premia i tuoi dipendenti con bonus, voucher welfare, gift card e premi a sorpresa.',
      ctaLabel: '+ Nuova Campagna',
      ctaOnclick: 'openIwModal()',
      helpHref: DOC_BASE + '#reward',
      icon: 'ticket'
    },
    challenge: {
      title: 'Nessuna campagna Challenge',
      description: 'Crea sfide basate sulle abilità: quiz formativi, Memory Match, Puzzle e classifica a punti.',
      ctaLabel: '+ Nuova Campagna',
      ctaOnclick: 'openGamModal()',
      helpHref: DOC_BASE + '#challenge',
      icon: 'ticket'
    },
    activity: {
      title: 'Nessun evento registrato',
      description: 'Il log raccoglie download, installazioni Wallet, push e altre azioni utili per il supporto HR.',
      ctaLabel: 'Invia una push',
      ctaOnclick: "nav('push')",
      helpHref: DOC_BASE + '#log-attivita',
      icon: 'inbox'
    },
    contacts: {
      title: 'Nessun dipendente in anagrafica',
      description: 'Importa l\'elenco dipendenti o aggiungi le schede manualmente, poi invia l\'attivazione del pass.',
      ctaLabel: 'Importa da file',
      ctaOnclick: 'openEmployeeImportModal()',
      helpHref: DOC_BASE + '#dipendenti',
      icon: 'users'
    }
  };

  function isFiloEmptyApp() {
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

  function inferPresetKey(opts) {
    var on = String(opts.ctaOnclick || '');
    var title = String(opts.title || '').toLowerCase();
    if (on.indexOf('openTemplateModal') >= 0 || title.indexOf('template') >= 0) return 'templates';
    if (title.indexOf('pass emesso') >= 0 || title.indexOf('nessun pass') >= 0) return 'passes';
    if (on.indexOf('openIwModal') >= 0 || title.indexOf('reward') >= 0) return 'reward';
    if (on.indexOf('openGamModal') >= 0 || title.indexOf('challenge') >= 0) return 'challenge';
    if (title.indexOf('evento') >= 0 || title.indexOf('attivit') >= 0) return 'activity';
    if (
      on.indexOf('openEmployee') >= 0 ||
      title.indexOf('dipendent') >= 0 ||
      title.indexOf('contatt') >= 0 ||
      opts.icon === 'users'
    ) return 'contacts';
    return null;
  }

  function mergeEmptyOpts(opts) {
    var key = inferPresetKey(opts);
    var preset = key ? PRESETS[key] : null;
    if (!preset) return opts;
    opts = opts || {};
    return {
      icon: opts.icon || preset.icon,
      title: opts.title || preset.title,
      description: preset.description || opts.description,
      ctaLabel: opts.ctaLabel || preset.ctaLabel,
      ctaOnclick: opts.ctaOnclick || preset.ctaOnclick,
      helpHref: preset.helpHref,
      helpLabel: opts.helpLabel || 'Come funziona'
    };
  }

  function ensureEmptyStateA11y(html) {
    if (!html || html.indexOf('role=') >= 0) return html;
    if (html.indexOf('empty-state') >= 0) {
      return html.replace(/class="empty-state([^"]*)"/, 'class="empty-state fd-empty-state$1" role="status"');
    }
    if (html.indexOf('fd-empty-state') >= 0) {
      return html.replace(/(<div class="fd-empty-state[^"]*")>/, '$1 role="status">');
    }
    return html;
  }

  function renderFiloEmptyState(opts, baseRender) {
    opts = mergeEmptyOpts(opts || {});
    var html = ensureEmptyStateA11y(baseRender(opts));
    if (!opts.helpHref) return html;

    var help = '<a class="fd-empty-state__help" href="' + esc(opts.helpHref) + '" target="_blank" rel="noopener noreferrer">' +
      esc(opts.helpLabel || 'Come funziona') + '</a>';

    if (html.indexOf('fd-empty-state__actions') >= 0) return html;

    var ctaMatch = html.match(/<button[^>]*class="btn"[^>]*>[\s\S]*?<\/button>/);
    if (ctaMatch) {
      return html.replace(
        ctaMatch[0],
        '<div class="fd-empty-state__actions">' + ctaMatch[0] + help + '</div>'
      ).replace('class="empty-state"', 'class="empty-state fd-empty-state"');
    }

    return html
      .replace('class="empty-state"', 'class="empty-state fd-empty-state"')
      .replace('</div>', '<div class="fd-empty-state__actions">' + help + '</div></div>');
  }

  function patchRenderEmptyState() {
    if (window.__fdEmptyPatched || typeof window.renderEmptyState !== 'function') return;
    window.__fdEmptyPatched = true;
    var baseRender = window.renderEmptyState;
    window.renderEmptyState = function (opts) {
      if (!isFiloEmptyApp()) return baseRender(opts);
      return renderFiloEmptyState(opts, baseRender);
    };
  }

  function initFdEmptyStates() {
    if (!isFiloEmptyApp()) return;
    patchRenderEmptyState();
  }

  /** Table tbody row with Filo-enriched empty state (preset by key or inferred from opts). */
  function fdTableEmptyState(colspan, opts) {
    opts = mergeEmptyOpts(opts || {});
    var html = typeof window.renderEmptyState === 'function'
      ? window.renderEmptyState(opts)
      : '';
    html = ensureEmptyStateA11y(html);
    var span = Math.max(1, parseInt(colspan, 10) || 1);
    return '<tr class="table-empty-row"><td colspan="' + span + '">' + html + '</td></tr>';
  }

  window.fdTableEmptyState = fdTableEmptyState;
  window.fdInitEmptyStates = initFdEmptyStates;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdEmptyStates);
  } else {
    initFdEmptyStates();
  }
})();


/* === fd-page-states.js === */
/**
 * FD-DS FASE 5 — Unified loading / error helpers + Filo patches for table errors.
 */
(function () {
  'use strict';

  var patchRetryTimer = null;
  var patchRetryCount = 0;
  var PATCH_RETRY_MAX = 80;

  function isFiloApp() {
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

  /**
   * Wrap skeleton markup with consistent aria-busy / aria-live.
   * @param {string} innerHtml
   * @param {{ id?: string, className?: string, label?: string }} [opts]
   */
  function fdRenderLoadingRegion(innerHtml, opts) {
    opts = opts || {};
    var cls = 'fd-loading-region' + (opts.className ? ' ' + opts.className : '');
    return (
      '<div class="' + esc(cls) + '"' +
      (opts.id ? ' id="' + esc(opts.id) + '"' : '') +
      ' aria-busy="true" aria-live="polite"' +
      ' aria-label="' + esc(opts.label || 'Caricamento in corso') + '">' +
      (innerHtml || '') +
      '</div>'
    );
  }

  /**
   * Inline or block error banner using DS tokens.
   * @param {string} message
   * @param {{ title?: string, retryOnclick?: string, retryId?: string, retryLabel?: string, id?: string }} [opts]
   */
  function fdRenderErrorState(message, opts) {
    opts = opts || {};
    var retry = '';
    if (opts.retryOnclick) {
      retry =
        '<button type="button" class="fd-btn fd-btn--secondary fd-error-state__retry"' +
        (opts.retryId ? ' id="' + esc(opts.retryId) + '"' : '') +
        ' onclick="' + esc(opts.retryOnclick) + '">' +
        esc(opts.retryLabel || 'Riprova') +
        '</button>';
    } else if (opts.retryId) {
      retry =
        '<button type="button" class="fd-btn fd-btn--secondary fd-error-state__retry" id="' +
        esc(opts.retryId) +
        '">' +
        esc(opts.retryLabel || 'Riprova') +
        '</button>';
    }
    return (
      '<div class="fd-error-state"' +
      (opts.id ? ' id="' + esc(opts.id) + '"' : '') +
      ' role="alert">' +
      '<p class="fd-error-state__title">' + esc(opts.title || 'Errore di caricamento') + '</p>' +
      '<p class="fd-error-state__desc">' + esc(message || 'Si è verificato un errore.') + '</p>' +
      (retry ? '<div class="fd-error-state__actions">' + retry + '</div>' : '') +
      '</div>'
    );
  }

  function fdRenderTableErrorRow(colspan, message, retryOnclick) {
    var span = Math.max(1, parseInt(colspan, 10) || 1);
    return (
      '<tr class="table-error-row fd-table-error-row"><td colspan="' + span + '">' +
      fdRenderErrorState(message, { retryOnclick: retryOnclick }) +
      '</td></tr>'
    );
  }

  function fdRenderTableErrorBlock(message, retryOnclick) {
    return fdRenderErrorState(message, { retryOnclick: retryOnclick });
  }

  function patchTableErrorRenderers() {
    if (window.__fdPageStatesPatched) return true;
    if (typeof window.renderTableErrorRow !== 'function') return false;
    window.__fdPageStatesPatched = true;
    var baseRow = window.renderTableErrorRow;
    var baseBlock =
      typeof window.renderTableErrorBlock === 'function' ? window.renderTableErrorBlock : null;
    window.renderTableErrorRow = function (colspan, message, retryOnclick) {
      if (!isFiloApp()) return baseRow(colspan, message, retryOnclick);
      return fdRenderTableErrorRow(colspan, message, retryOnclick);
    };
    if (baseBlock) {
      window.renderTableErrorBlock = function (message, retryOnclick) {
        if (!isFiloApp()) return baseBlock(message, retryOnclick);
        return fdRenderTableErrorBlock(message, retryOnclick);
      };
    }
    return true;
  }

  function schedulePatchRetry() {
    if (patchTableErrorRenderers()) {
      if (patchRetryTimer) clearTimeout(patchRetryTimer);
      return;
    }
    patchRetryCount += 1;
    if (patchRetryCount >= PATCH_RETRY_MAX) return;
    patchRetryTimer = setTimeout(schedulePatchRetry, 50);
  }

  function enhanceLoadingRegions(root) {
    if (!root) return;
    root.querySelectorAll(
      '[class*="skeleton"]:not([aria-busy]), [data-fd-loading]:not([aria-busy])'
    ).forEach(function (el) {
      if (el.classList.contains('fd-skeleton') && !el.querySelector('.fd-skeleton, [class*="skeleton"]')) {
        return;
      }
      el.setAttribute('aria-busy', 'true');
      if (!el.hasAttribute('aria-live')) el.setAttribute('aria-live', 'polite');
      if (!el.classList.contains('fd-loading-region')) el.classList.add('fd-loading-region');
    });
  }

  function initFdPageStates() {
    if (!isFiloApp()) return;
    schedulePatchRetry();
    var root = document.getElementById('main-content') || document.body;
    enhanceLoadingRegions(root);
  }

  window.fdRenderLoadingRegion = fdRenderLoadingRegion;
  window.fdRenderErrorState = fdRenderErrorState;
  window.fdRenderTableErrorRow = fdRenderTableErrorRow;
  window.fdRenderTableErrorBlock = fdRenderTableErrorBlock;
  window.fdEnhanceLoadingRegions = enhanceLoadingRegions;
  window.fdInitPageStates = initFdPageStates;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdPageStates);
  } else {
    initFdPageStates();
  }

  window.addEventListener('load', schedulePatchRetry);
})();


/* === fd-danger-zone.js === */
/**
 * FD-12 — FiloDiretto danger zone chrome + confirm-by-typing polish.
 */
(function () {
  'use strict';

  var HR_COPY =
    'Rimuove il brand e tutti i dati collegati. Operazione irreversibile.';

  function isFiloDangerApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function isConfirmTypingMatch(input, expected) {
    if (window.A2W && window.A2W.UI && typeof window.A2W.UI.isConfirmTypingMatch === 'function') {
      return window.A2W.UI.isConfirmTypingMatch(input, expected);
    }
    return String(input || '').trim() === String(expected || '').trim();
  }

  function pluralCount(n, singular, plural) {
    var num = Number(n) || 0;
    return num + ' ' + (num === 1 ? singular : plural);
  }

  function formatDeleteBrandCounts(counts) {
    if (!counts) return '—';
    var parts = buildDeleteBrandImpactItems(counts);
    return parts.length ? parts.join(', ') : 'nessuna entità collegata';
  }

  function buildDeleteBrandImpactItems(counts) {
    if (!counts) return [];
    var items = [];
    if (counts.passes > 0) items.push(pluralCount(counts.passes, 'pass emesso', 'pass emessi'));
    if (counts.contatti > 0) items.push(pluralCount(counts.contatti, 'contatto', 'contatti'));
    if (counts.campagne > 0) items.push(pluralCount(counts.campagne, 'campagna', 'campagne'));
    return items;
  }

  function resolveBrandConfirmName() {
    var name = '';
    if (typeof window.a2wBiCollectFormData === 'function') {
      try {
        name = String(window.a2wBiCollectFormData().name || '').trim();
      } catch (_) {}
    }
    if (name) return name;
    if (window.currentBrandName && String(window.currentBrandName).trim()) {
      return String(window.currentBrandName).trim();
    }
    if (window.brandId && window.brandsListCache && window.brandsListCache.length) {
      var match = window.brandsListCache.find(function (b) {
        return String(b.id) === String(window.brandId);
      });
      if (match && match.name) return String(match.name).trim();
    }
    return '';
  }

  window.fdFormatDeleteBrandCounts = formatDeleteBrandCounts;
  window.fdBuildDeleteBrandImpactItems = buildDeleteBrandImpactItems;
  window.fdResolveBrandConfirmName = resolveBrandConfirmName;

  function ensureDangerIcon(parent, small) {
    if (!parent || parent.querySelector('.fd-danger-zone__icon')) return;
    var icon = document.createElement('span');
    icon.className = 'fd-danger-zone__icon' + (small ? ' fd-danger-zone__icon--sm' : '');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⚠️';
    parent.insertBefore(icon, parent.firstChild);
  }

  function enhanceBrandDangerZone() {
    var zone = document.querySelector('#brand-identity .a2w-bi-danger-zone');
    if (!zone || zone.dataset.fdDangerZone === '1') return;
    zone.dataset.fdDangerZone = '1';
    zone.classList.add('fd-danger-zone');

    var title = zone.querySelector('#brandDangerTitle');
    if (title && !zone.querySelector('.fd-danger-zone__head')) {
      var head = document.createElement('div');
      head.className = 'fd-danger-zone__head';
      ensureDangerIcon(head, false);
      head.appendChild(title);
      zone.insertBefore(head, zone.firstChild);
    }

    var copy = zone.querySelector('p');
    if (copy) copy.textContent = HR_COPY;
  }

  function enhanceDeleteTrigger() {
    var host = document.getElementById('a2wBiDangerActionHost');
    if (!host) return;
    var btn = host.querySelector('button');
    if (!btn || btn.dataset.fdDangerBtn === '1') return;
    btn.dataset.fdDangerBtn = '1';
    btn.setAttribute('data-rbac-write', 'brand-identity');
    btn.className = 'btn sec fd-btn-danger-outline';
    btn.textContent = 'Elimina brand…';
  }

  function patchOpenConfirmDialog() {
    if (window.__fdDangerConfirmPatched) return;
    if (!window.A2W || !window.A2W.UI || typeof window.A2W.UI.openConfirmDialog !== 'function') return;
    window.__fdDangerConfirmPatched = true;

    var orig = window.A2W.UI.openConfirmDialog;
    window.A2W.UI.openConfirmDialog = function (opts) {
      opts = opts || {};
      var promise = orig.call(window.A2W.UI, opts);

      if (opts.requireTyping) {
        requestAnimationFrame(function () {
          var dlg = document.getElementById('a2wUiConfirmDialog');
          if (!dlg) return;
          dlg.classList.add('fd-danger-confirm');
          var titleEl = dlg.querySelector('#a2wUiConfirmTitle');
          if (titleEl) ensureDangerIcon(titleEl, true);
        });
      }

      return promise.finally(function () {
        var dlg = document.getElementById('a2wUiConfirmDialog');
        if (dlg) {
          dlg.classList.remove('fd-danger-confirm');
          var titleEl = dlg.querySelector('#a2wUiConfirmTitle');
          if (titleEl) {
            var icon = titleEl.querySelector('.fd-danger-zone__icon');
            if (icon) icon.remove();
          }
        }
      });
    };
  }

  function observeDangerHost() {
    var host = document.getElementById('a2wBiDangerActionHost');
    if (!host) return;
    var obs = new MutationObserver(function () {
      enhanceDeleteTrigger();
      if (typeof window.fdRbacHook === 'function') window.fdRbacHook('brand-identity');
    });
    obs.observe(host, { childList: true, subtree: true });
    enhanceDeleteTrigger();
  }

  function initFdDangerZone() {
    if (!isFiloDangerApp()) return;
    enhanceBrandDangerZone();
    observeDangerHost();
    patchOpenConfirmDialog();
  }

  window.fdInitDangerZone = initFdDangerZone;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdDangerZone);
  } else {
    initFdDangerZone();
  }
})();


/* === fd-rbac.js === */
/**
 * FiloDiretto — client RBAC (derived from session user.role, mirrors server matrix).
 */
(function (global) {
  'use strict';

  var ROLES = ['admin', 'manager', 'sender', 'reporter'];

  var SECTION_PERMS = {
    manager: {
      brand_identity: 'full', media_library: 'full', templates: 'full', passes: 'full',
      push: 'full', rewards: 'full', challenges: 'full', employees: 'full',
      audiences: 'full', analytics: 'full', activity_log: 'none', users: 'full', welcome: 'full',
      profile: 'full', conventions: 'full',
      pga_catalog: 'full', pga_engagement: 'full'
    },
    sender: {
      brand_identity: 'none', media_library: 'read', templates: 'read', passes: 'read',
      push: 'full', rewards: 'read', challenges: 'read', employees: 'none',
      audiences: 'read', analytics: 'read', activity_log: 'none', users: 'none', welcome: 'read',
      profile: 'full', conventions: 'none',
      pga_catalog: 'none', pga_engagement: 'none'
    },
    reporter: {
      brand_identity: 'read', media_library: 'none', templates: 'none', passes: 'read',
      push: 'none', rewards: 'none', challenges: 'none', employees: 'none',
      audiences: 'none', analytics: 'read', activity_log: 'read', users: 'none', welcome: 'read',
      profile: 'full', conventions: 'read',
      pga_catalog: 'read', pga_engagement: 'read'
    }
  };

  var UI_SECTION_MAP = {
    welcome: 'welcome',
    'brand-identity': 'brand_identity',
    'media-library': 'media_library',
    templates: 'templates',
    passes: 'passes',
    push: 'push',
    'instant-win': 'rewards',
    gamification: 'challenges',
    leads: 'employees',
    audiences: 'audiences',
    analytics: 'analytics',
    'activity-log': 'activity_log',
    users: 'users',
    profile: 'profile',
    conventions: 'conventions',
    'pga-catalog': 'pga_catalog',
    'pga-engagement': 'pga_engagement'
  };

  var DEFAULT_LANDING = {
    admin: 'welcome',
    manager: 'welcome',
    sender: 'push',
    reporter: 'analytics'
  };

  var WRITE_FORM_SECTIONS = { 'brand-identity': true };

  var FORM_FIELD_QUERY = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea';

  var WRITE_ACTION_SELECTORS = [
    '[data-rbac-write]',
    '[data-requires-write]',
    '[data-fd-danger-btn]',
    '.fd-rbac-write',
    '.btn:not(.sec):not([data-allow-readonly])',
    '.btn.danger',
    '.btn.sec.danger',
    '.btn.sec.fd-rbac-write',
    '.a2w-bi-link-btn',
    '.a2w-ui-btn-destructive',
    '.fd-btn-danger-outline',
    '.a2w-bi-danger-zone button',
    '#a2wBiDangerActionHost button',
    '.card-actions .btn',
    '.pass-action-btn--danger',
    '.pass-bulk-bar .btn.danger',
    '.import-wizard__cta',
    '.empty-state__cta',
    'button[onclick*="delete"]',
    'button[onclick*="Delete"]',
    'button[onclick*="save"]',
    'button[onclick*="Save"]',
    'button[onclick*="openTemplateModal"]',
    'button[onclick*="openAudienceEditor"]',
    'button[onclick*="openMediaUpload"]',
    'button[onclick*="deleteAllMedia"]',
    'button[onclick*="editTemplate"]',
    'button[onclick*="editAudience"]',
    'button[onclick*="deleteAudience"]',
    'button[onclick*="deleteMedia"]',
    'button[onclick*="saveBrandIdentity"]',
    'button[onclick*="deletePass"]',
    'button[onclick*="openIwModal"]',
    'button[onclick*="editIwCampaign"]',
    'button[onclick*="deleteIwCampaign"]',
    'button[onclick*="openGamModal"]',
    'button[onclick*="editGamCampaign"]',
    'button[onclick*="deleteGamCampaign"]'
  ].join(',');

  var READONLY_SAFE_PATTERNS = /download|export|csv|close|annulla|cancel|deseleziona|copy|anteprima|preview|viewpass|dettaglio|precedente|successiva|pushtab|switchaudience|switchpush|mpfilter|useaudienceinpush|exportaudience|closemodal|closeaudience|closeiwmodal|closegammodal|gotostep|wzgo|loadactivitylog|loadpasses|exportanalytics|viewpassdetail|setanalytics/i;

  function isFiloApp() {
    return document.documentElement.getAttribute('data-app') === 'filodiretto' ||
      global.__2WALLET_PRODUCT_LOCK__ === 'hr';
  }

  function normalizeRole(role) {
    var r = String(role || 'manager').toLowerCase();
    if (r === 'viewer') return 'reporter';
    if (ROLES.indexOf(r) >= 0) return r;
    return 'manager';
  }

  function getAllowlistEmails() {
    try {
      var raw = global.__2WALLET_LOGIN_ALLOWLIST__;
      if (!raw || !String(raw).trim()) {
        if (global.__2WALLET_PRODUCT_LOCK__ === 'hr') return ['admin@nudj.studio'];
        return [];
      }
      return String(raw).split(',').map(function (e) { return e.trim().toLowerCase(); }).filter(Boolean);
    } catch (_) {
      return [];
    }
  }

  function isAllowlistOperator(email) {
    if (!email) return false;
    var list = getAllowlistEmails();
    return list.indexOf(String(email).trim().toLowerCase()) >= 0;
  }

  function getCurrentRole() {
    try {
      if (global.currentUser) {
        if (isAllowlistOperator(global.currentUser.email)) return 'admin';
        if (global.currentUser.role) return normalizeRole(global.currentUser.role);
      }
    } catch (_) {}
    return 'manager';
  }

  function sectionKey(sectionId) {
    return UI_SECTION_MAP[sectionId] || null;
  }

  function sectionAccess(role, section) {
    var r = normalizeRole(role);
    if (r === 'admin') return 'full';
    var map = SECTION_PERMS[r];
    if (!map) return 'none';
    return map[section] || 'none';
  }

  function canAccessSection(sectionId, role) {
    var key = sectionKey(sectionId);
    if (!key) return normalizeRole(role || getCurrentRole()) === 'admin';
    var access = sectionAccess(role || getCurrentRole(), key);
    return access === 'full' || access === 'read';
  }

  function canWriteSection(sectionId, role) {
    var key = sectionKey(sectionId);
    if (!key) return normalizeRole(role || getCurrentRole()) === 'admin';
    return sectionAccess(role || getCurrentRole(), key) === 'full';
  }

  function defaultLandingSection(role) {
    var r = getCurrentRole();
    return DEFAULT_LANDING[r] || 'welcome';
  }

  function roleLabel(role) {
    var labels = {
      admin: 'Admin',
      manager: 'Manager',
      sender: 'Sender',
      reporter: 'Reporter',
      reporter_legacy: 'Reporter'
    };
    return labels[normalizeRole(role)] || role;
  }

  function resolveWriteSection(el, sectionId) {
    var explicit = el.getAttribute('data-requires-write');
    if (explicit) {
      return UI_SECTION_MAP[explicit] ? explicit : explicit;
    }
    var host = el.closest('[data-rbac-section]');
    if (host) return host.getAttribute('data-rbac-section');
    return sectionId;
  }

  function isReadControl(el) {
    if (!el) return false;
    if (el.getAttribute('data-allow-readonly') === 'true') return true;
    if (el.getAttribute('data-rbac-read') === 'true') return true;
    if (el.closest('[data-rbac-read-scope], .fd-rbac-read-scope, .fd-activity-log-toolbar, .analytics-toolbar, .analytics-actions')) return true;
    if (el.id === 'brandSelector' || el.id === 'passFilterCampaign' || el.id === 'passSearchInput') return true;
    if (el.classList.contains('pass-id-copy') || el.classList.contains('fd-activity-id-copy')) return true;
    if (el.classList.contains('analytics-chip')) return true;
    var type = String(el.type || '').toLowerCase();
    if (type === 'search') return true;
    var onclick = el.getAttribute('onclick') || '';
    if (/loadpasses|loadactivitylog|exportanalytics|viewpassdetail|onanalytics/i.test(onclick)) return true;
    return false;
  }

  function isExplicitWriteControl(el) {
    if (!el) return false;
    if (el.closest('#a2wBiDangerActionHost, .a2w-bi-danger-zone, .fd-danger-zone')) return true;
    if (el.getAttribute('data-fd-danger-btn')) return true;
    if (el.classList.contains('fd-btn-danger-outline')) return true;
    if (el.classList.contains('a2w-ui-btn-destructive')) return true;
    if (el.classList.contains('fd-rbac-write')) return true;
    if (el.hasAttribute('data-rbac-write')) return true;
    if (el.hasAttribute('data-requires-write')) return true;
    if (el.closest('.card-actions')) return true;
    return false;
  }

  function isReadonlySafeAction(el) {
    if (isExplicitWriteControl(el)) return false;
    if (el.getAttribute('data-allow-readonly') === 'true') return true;
    if (el.classList.contains('pass-action-btn--view')) return true;
    if (el.classList.contains('pass-id-copy')) return true;
    if (el.classList.contains('modal-close')) return true;
    if (el.getAttribute('type') === 'search' || el.getAttribute('role') === 'tab') return true;
    var onclick = el.getAttribute('onclick') || '';
    if (READONLY_SAFE_PATTERNS.test(onclick)) return true;
    if (el.classList.contains('sec') && !el.classList.contains('danger') && !el.classList.contains('fd-rbac-write') && !el.hasAttribute('data-requires-write')) {
      if (/download|export|csv|push|goprev|gonext|switch|filter|clearselection|deseleziona|cancel|annulla|close|chiudi/i.test(onclick)) return true;
      var label = (el.textContent || '').trim().toLowerCase();
      if (/^(annulla|chiudi|cancel|indietro|close)$/.test(label)) return true;
    }
    return false;
  }

  function shouldSkipFormFieldLock(el) {
    if (!el) return true;
    if (el.id === 'brandSelector') return true;
    if (el.getAttribute('data-allow-readonly') === 'true') return true;
    if (el.getAttribute('data-fd-rbac-field-exempt') === 'true') return true;
    if (el.closest('#loginGate, .sidebar, .topbar, .user-menu')) return true;
    return false;
  }

  function shouldLockFormField(el, sectionId, readonly) {
    if (!readonly || !el) return false;
    if (isReadControl(el)) return false;
    if (shouldSkipFormFieldLock(el)) return false;
    if (el.hasAttribute('data-rbac-write')) return true;
    if (el.closest('[data-rbac-write-form]')) return true;
    return !!WRITE_FORM_SECTIONS[sectionId];
  }

  function unlockFormField(el) {
    if (!el || el.getAttribute('data-fd-rbac-locked') !== '1') return;
    var wasDisabled = el.getAttribute('data-fd-rbac-was-disabled') === '1';
    el.removeAttribute('data-fd-rbac-locked');
    el.removeAttribute('data-fd-rbac-was-disabled');
    el.classList.remove('fd-rbac-field-locked');
    el.readOnly = false;
    el.disabled = wasDisabled;
  }

  function lockSectionFormFields(sectionEl, sectionId, readonly) {
    if (!sectionEl) return;
    sectionEl.querySelectorAll(FORM_FIELD_QUERY).forEach(function (el) {
      if (!shouldLockFormField(el, sectionId, readonly)) {
        if (!readonly) unlockFormField(el);
        return;
      }
      if (readonly) {
        if (el.getAttribute('data-fd-rbac-locked') === '1') return;
        el.setAttribute('data-fd-rbac-locked', '1');
        el.setAttribute('data-fd-rbac-was-disabled', el.disabled ? '1' : '0');
        el.classList.add('fd-rbac-field-locked');
        if (el.tagName === 'SELECT') {
          el.disabled = true;
        } else if (el.tagName === 'TEXTAREA') {
          el.readOnly = true;
          el.disabled = true;
        } else if (el.tagName === 'INPUT') {
          el.readOnly = true;
        }
      } else {
        unlockFormField(el);
      }
    });
  }

  function suppressBrandIdentityDirtyState() {
    try {
      if (global.brandIdentityState) global.brandIdentityState.dirty = false;
    } catch (_) {}
    if (typeof global.fdSyncBrandIdentitySectionSaves === 'function') {
      global.fdSyncBrandIdentitySectionSaves();
    }
    if (typeof global.a2wBiUpdateSaveStateBadge === 'function') {
      global.a2wBiUpdateSaveStateBadge('Salvato', '');
    }
  }

  function isActiveSectionReadOnly() {
    return document.body && document.body.classList.contains('fd-rbac-readonly');
  }

  function patchBrandIdentityDirtyFlows() {
    if (global.__fdRbacBiDirtyPatched) return;
    global.__fdRbacBiDirtyPatched = true;

    if (typeof global.a2wBiSyncDirtyState === 'function') {
      var origSync = global.a2wBiSyncDirtyState;
      global.a2wBiSyncDirtyState = function () {
        if (isActiveSectionReadOnly()) {
          suppressBrandIdentityDirtyState();
          return;
        }
        return origSync.apply(this, arguments);
      };
    }

    var origBindGuards = global.a2wBiBindGuards;
    if (typeof origBindGuards === 'function') {
      global.a2wBiBindGuards = function () {
        origBindGuards.apply(this, arguments);
        if (global.__fdRbacNavInnerPatched) return;
        global.__fdRbacNavInnerPatched = true;
        var navFn = global.nav;
        if (typeof navFn !== 'function') return;
        global.nav = async function fdRbacReadonlyNav(id) {
          if (isActiveSectionReadOnly()) suppressBrandIdentityDirtyState();
          return navFn.apply(this, arguments);
        };
      };
    }

    window.addEventListener('beforeunload', function () {
      if (isActiveSectionReadOnly() && global.brandIdentityState) {
        global.brandIdentityState.dirty = false;
      }
    }, true);
  }

  function restoreWriteElement(el) {
    if (!el || el.getAttribute('data-fd-rbac-gated') !== '1') return;
    el.removeAttribute('data-fd-rbac-gated');
    el.classList.remove('fd-rbac-neutralized');
    el.removeAttribute('disabled');
    el.removeAttribute('aria-disabled');
    el.removeAttribute('tabindex');
    el.style.removeProperty('display');
    el.style.removeProperty('pointer-events');
    el.style.removeProperty('visibility');
    el.setAttribute('aria-hidden', 'false');
  }

  function neutralizeWriteElement(el, sectionId, role) {
    if (isReadonlySafeAction(el)) {
      restoreWriteElement(el);
      el.classList.remove('fd-rbac-gated');
      return;
    }
    var allow = canWriteSection(sectionId, role);
    el.classList.toggle('fd-rbac-gated', !allow);
    if (allow) {
      restoreWriteElement(el);
      return;
    }
    if (!el.getAttribute('data-rbac-write')) {
      el.setAttribute('data-rbac-write', resolveWriteSection(el, sectionId) || sectionId || 'true');
    }
    el.setAttribute('data-fd-rbac-gated', '1');
    el.classList.add('fd-rbac-neutralized');
    if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
      el.disabled = true;
      el.setAttribute('aria-disabled', 'true');
    }
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.setAttribute('tabindex', '-1');
    el.setAttribute('aria-hidden', 'true');
  }

  function gateWriteElement(el, sectionId, role) {
    neutralizeWriteElement(el, sectionId, role);
  }

  function markSectionReadScopes(sectionEl) {
    if (!sectionEl) return;
    sectionEl.querySelectorAll('.analytics-toolbar, .analytics-actions, .fd-activity-log-toolbar').forEach(function (el) {
      el.classList.add('fd-rbac-read-scope');
      el.setAttribute('data-rbac-read-scope', 'true');
    });
    ['passFilterCampaign', 'passSearchInput', 'analyticsTrendRange', 'analyticsDateFrom', 'analyticsDateTo'].forEach(function (id) {
      var el = sectionEl.querySelector('#' + id);
      if (el) el.setAttribute('data-rbac-read', 'true');
    });
  }

  function patchSaveBlockers() {
    if (global.__fdRbacSaveBlocked) return;
    global.__fdRbacSaveBlocked = true;

    if (typeof global.saveBrandIdentity === 'function') {
      var origSaveBi = global.saveBrandIdentity;
      global.saveBrandIdentity = async function () {
        if (isActiveSectionReadOnly()) return;
        return origSaveBi.apply(this, arguments);
      };
    }

    document.addEventListener('keydown', function (e) {
      if (!isActiveSectionReadOnly()) return;
      if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 's') {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    document.addEventListener('submit', function (e) {
      if (!isActiveSectionReadOnly()) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  function cleanupStrayMainContentBanners() {
    var main = document.getElementById('main-content');
    if (!main) return;
    main.querySelectorAll(':scope > .fd-rbac-readonly-banner').forEach(function (el) {
      if (el.id !== 'fdRbacGlobalBanner') el.remove();
    });
  }

  function removeSectionReadOnlyBanners(scope) {
    var root = scope || document;
    root.querySelectorAll('.fd-rbac-readonly-banner[data-rbac-section-banner]').forEach(function (el) {
      el.remove();
    });
  }

  function ensureGlobalReadOnlyBanner(show) {
    var main = document.getElementById('main-content');
    if (!main) return;
    cleanupStrayMainContentBanners();
    var banner = document.getElementById('fdRbacGlobalBanner');
    if (show) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'fdRbacGlobalBanner';
        banner.className = 'fd-rbac-readonly-banner fd-rbac-readonly-banner--global';
        banner.setAttribute('role', 'status');
        banner.textContent = 'Sola lettura — il tuo ruolo consente solo consultazione in questa sezione.';
        main.insertBefore(banner, main.firstChild);
      }
      banner.hidden = false;
    } else if (banner) {
      banner.hidden = true;
    }
  }

  function shouldSkipWriteScan(el) {
    return !!(el.closest('#loginGate') || el.closest('.sidebar') || el.closest('.topbar') || el.closest('.user-menu'));
  }

  function scanWriteTargets(root, sectionId, role) {
    if (!root) return;
    root.querySelectorAll(WRITE_ACTION_SELECTORS).forEach(function (el) {
      if (shouldSkipWriteScan(el)) return;
      var sid = resolveWriteSection(el, sectionId);
      gateWriteElement(el, sid, role);
    });
    root.querySelectorAll('button[onclick*="deleteMediaItem"]').forEach(function (el) {
      if (shouldSkipWriteScan(el)) return;
      gateWriteElement(el, resolveWriteSection(el, sectionId), role);
    });
  }

  function observeSectionFields(sectionEl, sectionId) {
    if (!sectionEl || sectionEl.dataset.fdRbacFieldObs === '1') return;
    sectionEl.dataset.fdRbacFieldObs = '1';
    var obs = new MutationObserver(function () {
      var readonly = !canWriteSection(sectionId, getCurrentRole());
      if (readonly) {
        lockSectionFormFields(sectionEl, sectionId, true);
        markSectionReadScopes(sectionEl);
        scanWriteTargets(sectionEl, sectionId, getCurrentRole());
      }
    });
    obs.observe(sectionEl, { childList: true, subtree: true, attributes: false });
  }

  function scanSectionWriteActions(sectionId, role) {
    if (!isFiloApp() || !sectionId) return;
    var sectionEl = document.getElementById(sectionId);
    if (!sectionEl) return;
    var readonly = !canWriteSection(sectionId, role);
    sectionEl.classList.toggle('fd-rbac-section-readonly', readonly);
    removeSectionReadOnlyBanners(sectionEl);
    markSectionReadScopes(sectionEl);
    lockSectionFormFields(sectionEl, sectionId, readonly);
    observeSectionFields(sectionEl, sectionId);
    scanWriteTargets(sectionEl, sectionId, role);
    if (readonly && sectionId === 'brand-identity') suppressBrandIdentityDirtyState();
  }

  function scanLinkedModals(sectionId, role) {
    var readonly = !canWriteSection(sectionId, role);
    document.querySelectorAll('[data-rbac-section="' + sectionId + '"]').forEach(function (modal) {
      if (modal.id === sectionId) return;
      lockSectionFormFields(modal, sectionId, readonly);
      scanWriteTargets(modal, sectionId, role);
    });
  }

  function applyBodyRoleClasses(role) {
    role = normalizeRole(role || getCurrentRole());
    var body = document.body;
    if (!body) return;
    ROLES.concat(['admin', 'viewer']).forEach(function (r) {
      body.classList.remove('role-' + r);
    });
    body.classList.remove('role-viewer');
    body.classList.add('role-' + role);
    if (role === 'reporter') body.classList.add('role-viewer');
    body.classList.toggle('role-admin', role === 'admin');
    body.classList.toggle('role-manager', role === 'manager');
    body.classList.toggle('role-sender', role === 'sender');
    body.classList.toggle('role-reporter', role === 'reporter');
  }

  function applyNavGating(role) {
    if (!isFiloApp()) return;
    role = getCurrentRole();
    document.querySelectorAll('.nav-item[data-section-id]').forEach(function (el) {
      var sid = el.getAttribute('data-section-id');
      var perm = el.getAttribute('data-requires-perm') || sectionKey(sid);
      if (!perm) return;
      var access = sectionAccess(role, perm);
      var allowed = access === 'full' || access === 'read';
      el.style.display = allowed ? '' : 'none';
      el.setAttribute('aria-hidden', allowed ? 'false' : 'true');
      if (!allowed) el.classList.add('fd-rbac-hidden');
      else el.classList.remove('fd-rbac-hidden');
    });
    document.querySelectorAll('.nav-group[data-nav-group]').forEach(function (group) {
      var visible = 0;
      group.querySelectorAll('.nav-item[data-section-id]').forEach(function (item) {
        if (item.style.display !== 'none' && item.getAttribute('aria-hidden') !== 'true') visible += 1;
      });
      group.style.display = visible ? '' : 'none';
      group.setAttribute('aria-hidden', visible ? 'false' : 'true');
    });
  }

  function applyReadOnlyMode(activeSectionId, role) {
    if (!isFiloApp()) return;
    role = getCurrentRole();
    var sid = activeSectionId ||
      (typeof global.getActiveSectionId === 'function' ? global.getActiveSectionId() : '');
    var readonly = sid && !canWriteSection(sid, role);
    document.body.classList.toggle('fd-rbac-readonly', !!readonly);
    document.body.classList.toggle('role-readonly', !!readonly);
    removeSectionReadOnlyBanners(document);
    ensureGlobalReadOnlyBanner(!!readonly);
    cleanupStrayMainContentBanners();

    document.querySelectorAll('[data-requires-write]').forEach(function (el) {
      var section = el.getAttribute('data-requires-write') || sid;
      gateWriteElement(el, section, role);
    });

    if (sid) {
      scanSectionWriteActions(sid, role);
      scanLinkedModals(sid, role);
    }
  }

  function hookSectionRender(sectionId) {
    if (!isFiloApp()) return;
    applyReadOnlyMode(sectionId, getCurrentRole());
  }

  function guardNav(sectionId) {
    if (!isFiloApp()) return sectionId;
    if (!sectionId || sectionId === 'welcome') {
      if (!canAccessSection('welcome')) return defaultLandingSection();
      return sectionId;
    }
    if (canAccessSection(sectionId)) return sectionId;
    if (typeof global.toast === 'function') global.toast('Accesso non consentito per il tuo ruolo');
    return defaultLandingSection();
  }

  function syncRbac(role) {
    if (!isFiloApp()) return;
    role = getCurrentRole();
    applyBodyRoleClasses(role);
    applyNavGating(role);
    applyReadOnlyMode(null, role);
  }

  function initFdRbac() {
    if (!isFiloApp()) return;
    patchBrandIdentityDirtyFlows();
    patchSaveBlockers();
    syncRbac(getCurrentRole());
  }

  global.fdRbacHook = hookSectionRender;

  global.FdRbac = {
    ROLES: ROLES,
    normalizeRole: normalizeRole,
    getCurrentRole: getCurrentRole,
    canAccessSection: canAccessSection,
    canWriteSection: canWriteSection,
    defaultLandingSection: defaultLandingSection,
    roleLabel: roleLabel,
    guardNav: guardNav,
    syncRbac: syncRbac,
    applyNavGating: applyNavGating,
    applyReadOnlyMode: applyReadOnlyMode,
    applyBodyRoleClasses: applyBodyRoleClasses,
    hookSectionRender: hookSectionRender,
    isActiveSectionReadOnly: isActiveSectionReadOnly,
    UI_SECTION_MAP: UI_SECTION_MAP
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdRbac);
  } else {
    initFdRbac();
  }
})(typeof window !== 'undefined' ? window : global);


/* === fd-wallet-ui.js === */
/**
 * FD — Samsung Wallet UI frozen by default (on-request only).
 * Server: SAMSUNG_WALLET_UI_ENABLED=true to re-enable everywhere.
 */
(function (global) {
  'use strict';

  function isSamsungWalletUiEnabled() {
    try {
      if (global.__FD_SAMSUNG_WALLET_UI__ === true) return true;
    } catch (_) {}
    return false;
  }

  function isFiloApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (global.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  global.__FD_SAMSUNG_WALLET_UI__ = global.__FD_SAMSUNG_WALLET_UI__ === true;
  global.fdActiveWalletChannelKeys = function fdActiveWalletChannelKeys() {
    return isSamsungWalletUiEnabled() ? ['apple', 'google', 'samsung'] : ['apple', 'google'];
  };

  function hideSamsungWalletUi() {
    if (!isFiloApp() || isSamsungWalletUiEnabled()) return;
    document.documentElement.setAttribute('data-samsung-wallet-ui', '0');

    document.querySelectorAll('option[value="samsung"]').forEach(function (opt) {
      opt.disabled = true;
      opt.hidden = true;
    });

    ['passDetailSamsungBtn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
      el.tabIndex = -1;
    });

    document.querySelectorAll('.wallet-diag-item--samsung, .fd-push-preview__device--samsung').forEach(function (el) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hideSamsungWalletUi);
  } else {
    hideSamsungWalletUi();
  }
})(typeof window !== 'undefined' ? window : global);


/* === fd-push.js === */
/**
 * FD-14 — FiloDiretto Push UI (FASE 4): preview, char limits, channel segmented, DS layout.
 */
(function () {
  'use strict';

  var TITLE_MAX = 22; // sync: src/engine/push-text-limits.js PUSH_TITLE_MAX
  var MESSAGE_MAX = 66; // sync: src/engine/push-text-limits.js PUSH_MESSAGE_MAX
  var BACK_DETAILS_MAX = 500; // sync: src/engine/push-text-limits.js PUSH_BACK_DETAILS_MAX
  var SCREEN_ALERT_MAX = 110; // sync: src/engine/push-text-limits.js PUSH_SCREEN_ALERT_MAX
  // Budget di visualizzazione lock screen validato su device: testo + separatore + didascalia.
  var SCREEN_ALERT_DISPLAY_BUDGET = 178;
  var DEFAULT_PUSH_TITLE = '';
  var DEFAULT_PUSH_MESSAGE = '';
  var TEST_PASS_KEY = 'fd:pushTestPassId';
  var STRIP_PREVIEW_DEBOUNCE_MS = 400;
  var HR_HUB_BACK_TITLE = 'HUB PERSONALE';
  var HR_PORTAL_BACK_TITLE = 'AREA PRIVATA';
  var HR_SUPPORT_LABEL = 'SUPPORT';

  var stripPreviewTimer = null;
  var stripPreviewSeq = 0;
  var passPreviewCache = null;
  var activePreviewTab = 'notify';

  var CHANNELS = [
    { value: 'apple', label: 'Apple Wallet', icon: '', tip: 'Invio tramite APNs (Apple Push Notification service)' },
    { value: 'google', label: 'Google Wallet', icon: '', tip: 'Aggiornamento messaggio su Google Wallet' },
    { value: 'samsung', label: 'Samsung Wallet', icon: '', tip: 'Aggiornamento contenuto su Samsung Wallet (solo su richiesta)' }
  ];

  function channelKeys() {
    if (typeof window.fdActiveWalletChannelKeys === 'function') {
      return window.fdActiveWalletChannelKeys();
    }
    return ['apple', 'google'];
  }

  function visibleChannels() {
    var keys = channelKeys();
    return CHANNELS.filter(function (c) {
      return keys.indexOf(c.value) !== -1;
    });
  }

  function getApiBase() {
    if (typeof window.API === 'string' && window.API) return window.API;
    return '/api/v1';
  }

  function isFiloPushApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function isValidBrandId(value) {
    if (value == null) return false;
    var id = String(value).trim();
    return !!(id && id !== 'undefined' && id !== 'null');
  }

  /** Stessa risoluzione brand di Contatti/Media: selector → URL → ensureBrandIdFromContext. */
  function getCurrentBrandId() {
    if (typeof window.ensureBrandIdFromContext === 'function') {
      try {
        var fromCtx = window.ensureBrandIdFromContext();
        if (isValidBrandId(fromCtx)) return String(fromCtx).trim();
      } catch (_) {}
    }
    try {
      var sel = document.getElementById('brandSelector');
      if (sel && isValidBrandId(sel.value)) return String(sel.value).trim();
    } catch (_) {}
    try {
      var qpBrandId = new URLSearchParams(window.location.search || '').get('brand_id');
      if (isValidBrandId(qpBrandId)) return String(qpBrandId).trim();
    } catch (_) {}
    try {
      if (isValidBrandId(window.brandId)) return String(window.brandId).trim();
    } catch (_) {}
    return '';
  }

  function syncBrandIdForPush() {
    var id = getCurrentBrandId();
    if (!id) return '';
    try {
      window.brandId = id;
    } catch (_) {}
    if (typeof window.ensureBrandIdFromContext === 'function') {
      try {
        window.ensureBrandIdFromContext();
      } catch (_) {}
    }
    return id;
  }

  function getBrandLabel() {
    var sel = document.getElementById('brandSelector');
    if (sel && sel.value && sel.selectedIndex >= 0) {
      return sel.options[sel.selectedIndex].textContent || 'Brand';
    }
    return (window.currentBrandName || 'Brand');
  }

  function updateCharCount(input, counter, max) {
    if (!input || !counter) return;
    var len = (input.value || '').length;
    counter.textContent = len + '/' + max;
    counter.classList.remove('is-warn', 'is-over');
    if (len > max) counter.classList.add('is-over');
    else if (len > max * 0.9) counter.classList.add('is-warn');
  }

  function truncateBrandName(name, max) {
    var n = String(name || '').trim();
    if (n.length <= max) return n;
    return n.slice(0, Math.max(1, max - 1)) + '…';
  }

  function buildLockScreenPreviewText(titleRaw, messageRaw, screenRaw) {
    var screen = String(screenRaw || '').trim();
    if (screen) return screen.slice(0, SCREEN_ALERT_MAX);
    var title = String(titleRaw || '').trim();
    var message = String(messageRaw || '').trim();
    if (!title && !message) return '';
    if (title && message) return (title.toUpperCase() + ': ' + message).slice(0, SCREEN_ALERT_MAX);
    return (message || title).slice(0, SCREEN_ALERT_MAX);
  }

  // Anteprima inline sotto il campo notifica: testo manuale + coda automatica
  // (didascalia header del template, iOS la accoda via %@ — vedi employee-pass.js).
  // La didascalia arriva da passPreviewCache.header (motore reale del pass).
  function renderScreenAlertInlinePreview(inputId, previewId) {
    var el = document.getElementById(previewId);
    if (!el) return;
    var manual = (document.getElementById(inputId)?.value || '').trim();
    var caption = String(passPreviewCache?.header?.value || '').trim();
    if (!manual) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    var html = '<span style="color:var(--text2);">Notifica completa:</span> \u201c<strong>' + esc(manual) + '</strong>';
    if (caption) {
      html += '<span style="color:var(--text2);"> \u00b7 ' + esc(caption) + '</span>\u201d ' +
        '<span style="color:var(--text2);font-style:italic;">(la parte dopo \u00b7 \u00e8 la didascalia del template, aggiunta automatica)</span>';
      // Con limite manuale 110 e didascalia max 64 il totale (max 177) resta nel
      // budget display (178); il warning \u00e8 una rete di sicurezza se i limiti cambiano.
      var total = manual.length + 3 + caption.length;
      if (total > SCREEN_ALERT_DISPLAY_BUDGET) {
        html += '<br><span style="color:var(--fd-color-warning-text, #a16207);">\u26a0 Testo + didascalia = ' + total +
          ' caratteri: oltre ' + SCREEN_ALERT_DISPLAY_BUDGET + ' iOS pu\u00f2 troncare la parte finale sul lock screen. ' +
          'Consigliato max ' + Math.max(0, SCREEN_ALERT_DISPLAY_BUDGET - 3 - caption.length) + ' caratteri di testo.</span>';
      }
    } else {
      html += '\u201d';
    }
    el.hidden = false;
    el.innerHTML = html;
  }

  function syncScreenAlertInlinePreviews() {
    renderScreenAlertInlinePreview('pushScreenAlert', 'pushScreenAlertFullPreview');
    renderScreenAlertInlinePreview('schedScreenAlert', 'schedScreenAlertFullPreview');
  }

  function getPushScreenAlertValue() {
    return (document.getElementById('pushScreenAlert')?.value || '').trim();
  }

  function getPushTitleValue() {
    var explicit = (document.getElementById('pushTitle')?.value || '').trim();
    var screen = getPushScreenAlertValue();
    return (explicit || screen || 'Aggiornamento').slice(0, TITLE_MAX);
  }

  function getPushMessageValue() {
    var explicit = (document.getElementById('pushMessage')?.value || '').trim();
    var screen = getPushScreenAlertValue();
    return (explicit || screen || 'Apri il pass per i dettagli').slice(0, MESSAGE_MAX);
  }

  function syncPreview() {
    var titleEl = document.getElementById('pushTitle');
    var messageEl = document.getElementById('pushMessage');
    var titleRaw = titleEl ? titleEl.value : '';
    var messageRaw = messageEl ? messageEl.value : '';
    var screenRaw = document.getElementById('pushScreenAlert') ? document.getElementById('pushScreenAlert').value : '';
    var brand = getBrandLabel();
    var lockBody = passPreviewCache?.lock_screen?.body
      || buildLockScreenPreviewText(titleRaw, messageRaw, screenRaw);
    document.querySelectorAll('[data-fd-push-preview-brand]').forEach(function (el) {
      var isLock = el.closest('.fd-push-preview__notif-banner');
      el.textContent = isLock ? truncateBrandName(brand, 18) : brand;
    });
    document.querySelectorAll('[data-fd-push-preview-lock-body]').forEach(function (el) {
      el.textContent = lockBody;
    });
    syncScreenAlertInlinePreviews();
    syncPassPreview();
  }

  function buildPassBackPreviewRows() {
    var rows = [];
    var linkUrl = (document.getElementById('pushPassLinkUrl')?.value || '').trim();
    var linkLabel = (document.getElementById('pushPassLinkLabel')?.value || '').trim();
    if (linkUrl) {
      rows.push({
        key: 'dynamic_push_link',
        label: linkLabel || 'Scopri di più',
        url: linkUrl
      });
    }
    var backDetails = (document.getElementById('pushBackDetails')?.value || '').trim();
    if (backDetails) {
      rows.push({ key: 'push_back_details', label: 'DETTAGLI', body: backDetails });
    }
    rows.push({ key: 'hub_employee', label: HR_HUB_BACK_TITLE });
    rows.push({ key: 'support', label: HR_SUPPORT_LABEL });
    rows.push({ key: 'portal_profile', label: HR_PORTAL_BACK_TITLE });
    return rows;
  }

  function renderPassBackPreviewFromApi(backRows) {
    var list = document.querySelector('[data-fd-push-preview-back-rows]');
    if (!list) return;
    var rows = backRows || buildPassBackPreviewRows().map(function (row) {
      if (row.body) return { type: 'text', label: row.label, body: row.body };
      return { type: 'link', label: row.label, url: row.url };
    });
    list.innerHTML = rows.map(function (row) {
      if (row.type === 'text' && row.body) {
        var preview = row.body.length > 200 ? row.body.slice(0, 197) + '…' : row.body;
        return '<li class="fd-wallet-pass-back__row fd-wallet-pass-back__row--text">' +
          '<span class="fd-wallet-pass-back__label">' + esc(row.label) + '</span>' +
          '<span class="fd-wallet-pass-back__body">' + esc(preview) + '</span></li>';
      }
      return '<li class="fd-wallet-pass-back__row fd-wallet-pass-back__row--link">' +
        '<a href="#" tabindex="-1" onclick="return false">' + esc(row.label || row.url || 'Link') + '</a></li>';
    }).join('');
  }

  function renderPassBackPreview() {
    renderPassBackPreviewFromApi(passPreviewCache?.back || null);
  }

  function applyPassPreviewData(data) {
    passPreviewCache = data || null;
    var card = document.querySelector('[data-fd-push-preview-pass-card]');
    if (card && data?.colors) {
      card.style.setProperty('--fd-pass-bg', data.colors.background || 'rgb(13, 11, 26)');
      card.style.setProperty('--fd-pass-fg', data.colors.foreground || 'rgb(255, 255, 255)');
      card.style.setProperty('--fd-pass-label', data.colors.label || 'rgb(168, 85, 247)');
    }
    var logoImg = document.querySelector('[data-fd-push-preview-logo]');
    if (logoImg) {
      if (data?.logo_data_url) {
        logoImg.src = data.logo_data_url;
        logoImg.hidden = false;
      } else {
        logoImg.hidden = true;
        logoImg.removeAttribute('src');
      }
    }
    var iconImg = document.querySelector('[data-fd-push-preview-icon]');
    if (iconImg) {
      if (data?.wallet_icon_data_url) {
        iconImg.src = data.wallet_icon_data_url;
        iconImg.hidden = false;
      } else {
        iconImg.hidden = true;
        iconImg.removeAttribute('src');
      }
    }
    var headerEl = document.querySelector('[data-fd-push-preview-header]');
    if (headerEl) {
      if (data?.header?.label || data?.header?.value) {
        headerEl.innerHTML =
          '<span class="fd-wallet-pass__hf-label">' + esc(data.header.label) + '</span>' +
          '<span class="fd-wallet-pass__hf-value">' + esc(data.header.value) + '</span>';
        headerEl.hidden = false;
      } else {
        headerEl.innerHTML = '';
        headerEl.hidden = true;
      }
    }
    var secondaryEl = document.querySelector('[data-fd-push-preview-secondary]');
    if (secondaryEl && data?.secondary?.length) {
      secondaryEl.innerHTML = data.secondary.map(function (f) {
        return '<div class="fd-wallet-pass__field">' +
          '<span class="fd-wallet-pass__field-label">' + esc(f.label) + '</span>' +
          '<span class="fd-wallet-pass__field-value">' + esc(f.value) + '</span></div>';
      }).join('');
    }
    var backTitle = document.querySelector('[data-fd-push-preview-back-title]');
    if (backTitle && data?.brand_name) {
      backTitle.textContent = (data.brand_name.split(/\s+/)[0] || 'PASS').toUpperCase() + ' PASS';
    }
    renderPassBackPreviewFromApi(data?.back || null);
    syncPreview();
  }

  function scheduleStripPreview() {
    if (stripPreviewTimer) clearTimeout(stripPreviewTimer);
    stripPreviewTimer = setTimeout(fetchPassPreview, STRIP_PREVIEW_DEBOUNCE_MS);
  }

  function buildPassPreviewRequestBody() {
    var linkUrl = (document.getElementById('pushPassLinkUrl')?.value || '').trim();
    var body = {
      title: getPushTitleValue(),
      message: getPushMessageValue(),
      update_pass: true,
      back_details: (document.getElementById('pushBackDetails')?.value || '').trim() || undefined,
      screen_alert: getPushScreenAlertValue() || undefined,
      include_pass_link: !!linkUrl,
      pass_link_url: linkUrl || undefined,
      pass_link_label: (document.getElementById('pushPassLinkLabel')?.value || '').trim() || undefined,
    };
    if (window.pushStripMediaId) body.strip_media_id = window.pushStripMediaId;
    return body;
  }

  function setStripPreviewLoading(isLoading) {
    var loading = document.querySelector('[data-fd-push-preview-strip-loading]');
    if (loading) loading.hidden = true;
    var strip = document.querySelector('.fd-wallet-pass__strip');
    if (strip) strip.classList.toggle('is-updating', !!isLoading);
  }

  async function fetchPassPreview() {
    var brandId = syncBrandIdForPush();
    var hint = document.querySelector('[data-fd-push-preview-strip-hint]');
    var img = document.querySelector('[data-fd-push-preview-strip]');
    var loading = document.querySelector('[data-fd-push-preview-strip-loading]');
    var body = buildPassPreviewRequestBody();
    var message = body.message;

    if (!message) {
      passPreviewCache = null;
      if (img) {
        img.hidden = true;
        img.removeAttribute('src');
      }
      if (hint) {
        hint.hidden = false;
        hint.textContent = 'Inserisci un messaggio per vedere l\'anteprima completa';
      }
      if (loading) loading.hidden = true;
      setStripPreviewLoading(false);
      renderPassBackPreview();
      syncPreview();
      return;
    }

    if (!brandId) {
      if (hint) {
        hint.hidden = false;
        hint.textContent = 'Seleziona un brand per l\'anteprima';
      }
      if (img) {
        img.hidden = true;
        img.removeAttribute('src');
      }
      setStripPreviewLoading(false);
      return;
    }

    if (hint) hint.hidden = true;
    setStripPreviewLoading(true);
    var seq = ++stripPreviewSeq;

    try {
      var res = await fetch(
        getApiBase() + '/brands/' + encodeURIComponent(brandId) + '/push/pass-preview',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(typeof getAuthHeaders === 'function' ? getAuthHeaders() : {})
          },
          body: JSON.stringify(body)
        }
      );
      if (seq !== stripPreviewSeq) return;
      if (!res.ok) {
        var errBody = {};
        try { errBody = await res.json(); } catch (_) {}
        throw new Error(errBody.error || 'Anteprima non disponibile');
      }
      var data = await res.json();
      if (seq !== stripPreviewSeq) return;
      if (img && data.strip_preview) {
        img.src = data.strip_preview;
        img.hidden = false;
        if (hint) hint.hidden = true;
      } else if (img) {
        img.hidden = true;
        img.removeAttribute('src');
        if (hint) {
          hint.hidden = false;
          hint.textContent = 'Nessuna strip disponibile per questo template';
        }
      }
      applyPassPreviewData(data);
    } catch (_) {
      if (seq === stripPreviewSeq) {
        passPreviewCache = null;
        if (img) {
          img.hidden = true;
          img.removeAttribute('src');
        }
        if (hint) {
          hint.hidden = false;
          hint.textContent = 'Anteprima pass non disponibile';
        }
        renderPassBackPreview();
        syncPreview();
      }
    } finally {
      if (seq === stripPreviewSeq) setStripPreviewLoading(false);
    }
  }

  function syncPassPreview() {
    renderPassBackPreview();
    scheduleStripPreview();
  }

  function wirePassPreviewListeners() {
    var ids = [
      'pushScreenAlert', 'pushTitle', 'pushMessage',
      'pushPassLinkUrl', 'pushPassLinkLabel', 'pushBackDetails'
    ];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.fdPassPreviewBound === '1') return;
      el.dataset.fdPassPreviewBound = '1';
      el.addEventListener('input', syncPassPreview);
      el.addEventListener('change', syncPassPreview);
    });

    var brandSel = document.getElementById('brandSelector');
    if (brandSel && brandSel.dataset.fdPassPreviewBound !== '1') {
      brandSel.dataset.fdPassPreviewBound = '1';
      brandSel.addEventListener('change', syncPassPreview);
    }

    var stripPreview = document.getElementById('pushStripPreview');
    if (stripPreview && stripPreview.dataset.fdPassPreviewObs !== '1') {
      stripPreview.dataset.fdPassPreviewObs = '1';
      new MutationObserver(function () {
        scheduleStripPreview();
      }).observe(stripPreview, { childList: true, subtree: true });
    }
  }

  var channelSelection = {
    apple: true,
    google: true,
    samsung: true
  };

  function walletChannelSelectionHidden() {
    return true;
  }

  function isAllChannelsSelected() {
    return channelKeys().every(function (k) {
      return channelSelection[k];
    });
  }

  function channelsToApiValue() {
    if (walletChannelSelectionHidden()) return 'all';
    var active = channelKeys().filter(function (k) {
      return channelSelection[k];
    });
    if (!active.length) return 'apple';
    if (active.length >= channelKeys().length) return 'all';
    if (active.length === 1) return active[0];
    return active.join(',');
  }

  function setChannelSelectionFromValue(value) {
    if (walletChannelSelectionHidden()) {
      channelKeys().forEach(function (k) {
        channelSelection[k] = true;
      });
      return;
    }
    var raw = String(value || 'all').trim().toLowerCase();
    if (raw === 'all') {
      channelKeys().forEach(function (k) {
        channelSelection[k] = true;
      });
      return;
    }
    if (raw.indexOf(',') !== -1) {
      var parts = raw.split(',').map(function (s) { return s.trim(); });
      channelKeys().forEach(function (k) {
        channelSelection[k] = parts.indexOf(k) !== -1;
      });
    } else {
      channelKeys().forEach(function (k) {
        channelSelection[k] = k === raw;
      });
    }
    if (!channelKeys().some(function (k) {
      return channelSelection[k];
    })) {
      channelSelection.apple = true;
    }
  }

  function syncChannelUi() {
    var sel = document.getElementById('pushChannel');
    var apiValue = channelsToApiValue();
    if (sel) sel.value = apiValue;
    if (walletChannelSelectionHidden()) {
      var group = sel ? sel.closest('.form-group') : null;
      if (group) {
        group.hidden = true;
        group.setAttribute('aria-hidden', 'true');
        group.style.display = 'none';
      }
      return;
    }

    var allOn = isAllChannelsSelected();
    document.querySelectorAll('.fd-push-channel-seg__btn').forEach(function (btn) {
      var ch = btn.getAttribute('data-channel');
      var on = !!channelSelection[ch];
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    var help = document.getElementById('fdPushChannelHelp');
    if (help) {
      var labels = channelKeys()
        .filter(function (k) {
          return channelSelection[k];
        })
        .map(function (k) {
          var ch = CHANNELS.find(function (c) {
            return c.value === k;
          });
          return ch ? ch.label : k;
        });
      if (allOn) {
        help.textContent = channelKeys().length > 2
          ? 'Invio su tutti i canali Wallet (Apple, Google, Samsung)'
          : 'Invio su Apple Wallet e Google Wallet';
      } else if (labels.length) {
        help.textContent = 'Invio su: ' + labels.join(', ');
      } else {
        help.textContent = 'Seleziona almeno un canale';
      }
    }
  }

  function toggleChannel(ch) {
    channelSelection[ch] = !channelSelection[ch];
    if (!channelKeys().some(function (k) {
      return channelSelection[k];
    })) {
      channelSelection[ch] = true;
    }
    syncChannelUi();
  }

  function setChannelValue(value) {
    setChannelSelectionFromValue(value || 'all');
    syncChannelUi();
  }

  function parsePushLinkedContent(raw) {
    var value = String(raw || '').trim();
    if (!value) return {};
    var sep = value.indexOf(':');
    if (sep < 1) return {};
    var kind = value.slice(0, sep);
    var id = value.slice(sep + 1);
    if (!id) return {};
    if (kind === 'reward') return { instant_win_id: id };
    if (kind === 'challenge') return { gamification_id: id };
    if (kind === 'convention') return { convention_id: id };
    return {};
  }

  function getHubAppBaseUrl() {
    var host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.indexOf('studio.') === 0) {
      return window.location.origin + '/hub';
    }
    return 'https://hub.filodiretto.app';
  }

  function resolveMerchantPushLink(merchant) {
    var name = String((merchant && (merchant.name || merchant.title)) || 'Convenzione').trim();
    var online = String((merchant && merchant.online_url) || '').trim();
    if (merchant && merchant.online_enabled !== false && /^https:\/\//i.test(online)) {
      return { label: name, url: online };
    }
    var params = new URLSearchParams();
    if (window.currentBrandSlug) params.set('brand', window.currentBrandSlug);
    var qs = params.toString();
    var base = getHubAppBaseUrl().replace(/\/+$/, '');
    return {
      label: name,
      url: base + '/conv/' + encodeURIComponent(merchant.id) + (qs ? '?' + qs : '')
    };
  }

  function applyPushLinkedContentToBody(body, rawValue) {
    var linked = parsePushLinkedContent(rawValue);
    if (linked.instant_win_id) body.instant_win_id = linked.instant_win_id;
    if (linked.gamification_id) body.gamification_id = linked.gamification_id;
    if (linked.convention_id) {
      var merchantsById = window.pushMerchantsById || {};
      var merchant = merchantsById[linked.convention_id];
      if (merchant) {
        var link = resolveMerchantPushLink(merchant);
        body.include_pass_link = true;
        body.pass_link_url = link.url;
        body.pass_link_label = link.label;
      }
    }
    return linked;
  }

  function buildPushBody(extra) {
    extra = extra || {};
    var title = getPushTitleValue();
    var message = getPushMessageValue();
    var campaignId =
      typeof window.isLegacyCampaignsUiEnabled === 'function' && window.isLegacyCampaignsUiEnabled()
        ? document.getElementById('pushCampaignTarget')?.value || null
        : null;
    var audienceId = document.getElementById('pushAudienceTarget')?.value || null;
    var channel = 'all';
    var body = {
      brand_id: syncBrandIdForPush(),
      title: title,
      message: message,
      update_pass: true,
      channel: channel
    };
    var screenAlert = getPushScreenAlertValue();
    body.screen_alert = screenAlert;
    if (audienceId) body.audience_id = audienceId;
    else if (campaignId) body.campaign_id = campaignId;

    var passLinkUrl = (document.getElementById('pushPassLinkUrl')?.value || '').trim();
    if (passLinkUrl) {
      body.include_pass_link = true;
      body.pass_link_url = passLinkUrl;
      body.pass_link_label = (document.getElementById('pushPassLinkLabel')?.value || '').trim();
      var expLocal = document.getElementById('pushPassLinkExpires')?.value;
      if (expLocal) body.pass_link_expires_at = new Date(expLocal).toISOString();
    }

    var backDetails = (document.getElementById('pushBackDetails')?.value || '').trim();
    if (backDetails) body.back_details = backDetails;

    applyPushLinkedContentToBody(body, document.getElementById('pushLinkedContent')?.value);

    if (window.pushStripMediaId) body.strip_media_id = window.pushStripMediaId;
    if (extra.test_pass_id) body.test_pass_id = extra.test_pass_id;
    return body;
  }

  async function loadTestPasses() {
    var sel = document.getElementById('fdPushTestPass');
    var brandId = syncBrandIdForPush();
    if (!sel || !brandId) return;
    sel.innerHTML = '<option value="">— Caricamento… —</option>';
    try {
      var res = await fetch(
        getApiBase() + '/passes?brand_id=' + encodeURIComponent(brandId) + '&limit=600',
        { headers: typeof getAuthHeaders === 'function' ? getAuthHeaders() : {} }
      );
      if (!res.ok) {
        console.warn('[fd-push] loadTestPasses HTTP', res.status);
        sel.innerHTML = '<option value="">— Lista pass non disponibile —</option>';
        return;
      }
      var rows = await res.json();
      var list = Array.isArray(rows) ? rows : rows.passes || rows.items || [];
      var withPush = list.filter(function (p) {
        return (
          p.push_token ||
          p.device_source === 'apple' ||
          p.device_source === 'google' ||
          p.device_source === 'samsung' ||
          p.google_wallet_saved ||
          p.samsung_wallet_saved ||
          p.samsung_wallet_ref_id
        );
      });
      withPush.sort(function (a, b) {
        var aTest = a.is_test_device === true || a.is_test_device === 'true' || a.is_test_device === 't' || a.is_test_device === 1 || a.is_test_device === '1';
        var bTest = b.is_test_device === true || b.is_test_device === 'true' || b.is_test_device === 't' || b.is_test_device === 1 || b.is_test_device === '1';
        if (aTest !== bTest) return bTest ? 1 : -1;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      });
      sel.innerHTML = '<option value="">— Seleziona pass di prova —</option>';
      if (!withPush.length) {
        sel.innerHTML = '<option value="">— Nessun pass con Wallet installato —</option>';
        return;
      }
      withPush.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        var fields = p.field_values || {};
        if (typeof fields === 'string') {
          try {
            fields = JSON.parse(fields);
          } catch (_) {
            fields = {};
          }
        }
        var fullName = [fields.nome || fields.first_name, fields.cognome || fields.last_name].filter(Boolean).join(' ');
        var label = (p.member_name || p.holder_name || fullName || p.email || fields.email || p.serial_number || p.id).toString();
        var isTest = p.is_test_device === true || p.is_test_device === 'true' || p.is_test_device === 't' || p.is_test_device === 1 || p.is_test_device === '1';
        if (isTest) label = 'TEST · ' + label;
        if (p.push_token || p.device_source === 'apple') label += ' · iPhone';
        else if (p.google_wallet_saved || p.device_source === 'google') label += ' · Google';
        else if (p.samsung_wallet_saved || p.samsung_wallet_ref_id || p.device_source === 'samsung') label += ' · Samsung';
        opt.textContent = label.slice(0, 72);
        sel.appendChild(opt);
      });
      var saved = localStorage.getItem(TEST_PASS_KEY);
      var marked = withPush.find(function (p) {
        return p.is_test_device === true || p.is_test_device === 'true' || p.is_test_device === 't' || p.is_test_device === 1 || p.is_test_device === '1';
      });
      if (marked) {
        sel.value = marked.id;
      } else if (saved && withPush.some(function (p) {
        return String(p.id) === String(saved);
      })) {
        sel.value = saved;
      }
    } catch (e) {
      console.warn('[fd-push] loadTestPasses failed', e);
      sel.innerHTML = '<option value="">— Lista pass non disponibile —</option>';
    } finally {
      // Stesse opzioni anche nel pannello programmata.
      var schedSel = document.getElementById('fdSchedTestPass');
      if (schedSel) {
        schedSel.innerHTML = sel.innerHTML;
        schedSel.value = sel.value;
      }
    }
  }

  window.refreshTestPassOptions = loadTestPasses;

  async function sendTestPush() {
    if (!syncBrandIdForPush()) {
      if (typeof toast === 'function') toast('Seleziona un brand');
      return;
    }
    var passId = document.getElementById('fdPushTestPass')?.value;
    if (!passId) {
      if (typeof toast === 'function') toast('Seleziona un dispositivo di prova');
      return;
    }
    if (typeof window.clearPushFieldErrors === 'function') window.clearPushFieldErrors();
    var screenAlert = getPushScreenAlertValue();
    if (!screenAlert) {
      if (typeof window.setPushFieldError === 'function') {
        window.setPushFieldError('pushScreenAlert', 'Inserisci il testo della notifica Wallet (lock screen)');
      } else if (typeof toast === 'function') toast('Compila la notifica lock screen');
      return;
    }
    if (screenAlert.length > SCREEN_ALERT_MAX) {
      if (typeof window.setPushFieldError === 'function') {
        window.setPushFieldError('pushScreenAlert', 'Notifica lock screen max ' + SCREEN_ALERT_MAX + ' caratteri');
      }
      return;
    }
    var backDetails = (document.getElementById('pushBackDetails')?.value || '').trim();
    if (backDetails.length > BACK_DETAILS_MAX) {
      if (typeof window.setPushFieldError === 'function') {
        window.setPushFieldError('pushBackDetails', 'Dettagli retro max ' + BACK_DETAILS_MAX + ' caratteri');
      } else if (typeof toast === 'function') {
        toast('Dettagli retro max ' + BACK_DETAILS_MAX + ' caratteri');
      }
      return;
    }

    var btn = document.getElementById('fdPushTestBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Invio prova…';
    }
    var controller = new AbortController();
    var timeoutId = setTimeout(function () {
      controller.abort();
    }, 60000);
    try {
      var body = buildPushBody({ test_pass_id: passId });
      var res = await fetch(getApiBase() + '/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(typeof getAuthHeaders === 'function' ? getAuthHeaders() : {}) },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.error) {
        var errMsg = data.error || 'Invio non riuscito, riprova';
        var banner = document.getElementById('pushSendError');
        if (banner) {
          banner.textContent = errMsg;
          banner.hidden = false;
        } else if (typeof toast === 'function') toast('Errore: ' + errMsg);
        return;
      }
      localStorage.setItem(TEST_PASS_KEY, passId);
      var msg =
        typeof buildPushDeliveryMessage === 'function'
          ? buildPushDeliveryMessage(data)
          : 'Push di prova inviata';
      if (typeof toast === 'function') toast(msg);
      else if (typeof toast === 'function') toast(msg);
    } catch (e) {
      var failMsg = (e && e.name === 'AbortError')
        ? 'Invio non riuscito, riprova'
        : (e.message || 'Invio non riuscito, riprova');
      var failBanner = document.getElementById('pushSendError');
      if (failBanner) {
        failBanner.textContent = failMsg;
        failBanner.hidden = false;
      } else if (typeof toast === 'function') toast('Errore: ' + failMsg);
    } finally {
      clearTimeout(timeoutId);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Invia di prova';
      }
    }
  }

  function charCounterIdForInput(inputId) {
    if (inputId === 'pushScreenAlert') return 'fdPushScreenAlertCount';
    if (inputId === 'pushTitle') return 'fdPushTitleCount';
    if (inputId === 'pushMessage') return 'fdPushMessageCount';
    if (inputId === 'pushBackDetails') return 'fdPushBackDetailsCount';
    return '';
  }

  function wrapCharField(inputId, max) {
    var input = document.getElementById(inputId);
    if (!input || input.dataset.fdCharWrapped === '1') return;
    input.dataset.fdCharWrapped = '1';
    var group = input.closest('.form-group');
    if (!group) return;
    var label = group.querySelector('.form-label');
    var counterId = charCounterIdForInput(inputId);
    if (label && !label.parentElement.classList.contains('fd-push-field-head')) {
      var head = document.createElement('div');
      head.className = 'fd-push-field-head';
      label.parentNode.insertBefore(head, label);
      head.appendChild(label);
      var count = document.createElement('span');
      count.className = 'fd-push-char-count';
      count.id = counterId;
      count.textContent = '0/' + max;
      head.appendChild(count);
    }
    var counter = counterId ? document.getElementById(counterId) : null;
    input.addEventListener('input', function () {
      updateCharCount(input, counter, max);
      syncPreview();
    });
    updateCharCount(input, counter, max);
  }

  function buildChannelSegmented() {
    var sel = document.getElementById('pushChannel');
    if (!sel || document.getElementById('fdPushChannelSeg')) return;
    sel.classList.add('fd-push-channel-native');
    sel.setAttribute('hidden', 'hidden');
    sel.tabIndex = -1;

    var group = sel.closest('.form-group');
    if (!group) return;
    if (walletChannelSelectionHidden()) {
      sel.value = 'all';
      group.hidden = true;
      group.setAttribute('aria-hidden', 'true');
      group.style.display = 'none';
      syncChannelUi();
      return;
    }

    var label = group.querySelector('.form-label[for="pushChannel"]');
    if (label) label.setAttribute('for', 'fdPushChannelSeg');

    var seg = document.createElement('div');
    seg.id = 'fdPushChannelSeg';
    seg.className = 'fd-push-channel-seg';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Canale invio');

    visibleChannels().forEach(function (ch) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'fd-push-channel-seg__btn';
      btn.id = ch.value === 'apple' ? 'fdPushChannelSeg' : '';
      btn.setAttribute('data-channel', ch.value);
      btn.setAttribute('aria-pressed', 'false');
      btn.title = ch.tip;
      btn.innerHTML =
        (ch.icon ? '<span aria-hidden="true">' + ch.icon + '</span> ' : '') + esc(ch.label);
      btn.addEventListener('click', function () {
        toggleChannel(ch.value);
      });
      seg.appendChild(btn);
    });

    var help = document.createElement('p');
    help.id = 'fdPushChannelHelp';
    help.className = 'fd-push-channel-help';

    group.appendChild(seg);
    group.appendChild(help);
    setChannelValue(sel.value || 'all');
  }

  function setPreviewTab(tab) {
    activePreviewTab = tab || 'notify';
    document.querySelectorAll('.fd-push-preview__tab').forEach(function (btn) {
      var on = btn.getAttribute('data-preview-tab') === activePreviewTab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.fd-push-preview__panel').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-preview-panel') !== activePreviewTab;
    });
  }

  function wirePreviewTabs(root) {
    var scope = root || document.getElementById('fdPushPreview') || document;
    scope.querySelectorAll('.fd-push-preview__tab').forEach(function (btn) {
      if (btn.dataset.fdPreviewTabBound === '1') return;
      btn.dataset.fdPreviewTabBound = '1';
      btn.addEventListener('click', function () {
        setPreviewTab(btn.getAttribute('data-preview-tab'));
      });
    });
  }

  function buildPreviewPanel() {
    if (document.getElementById('fdPushPreview')) return;
    var aside = document.createElement('aside');
    aside.id = 'fdPushPreview';
    aside.className = 'fd-push-preview';
    aside.setAttribute('aria-label', 'Anteprima push e pass');
    aside.innerHTML =
      '<h2 class="fd-push-preview__title">Anteprima live</h2>' +
      '<p class="fd-push-preview__lead">Stesso motore del pass reale — strip, notifica Wallet, fronte e retro.</p>' +
      '<div class="fd-push-preview__tabs" role="tablist">' +
      '<button type="button" class="fd-push-preview__tab is-active" role="tab" data-preview-tab="notify" aria-selected="true">Notifica</button>' +
      '<button type="button" class="fd-push-preview__tab" role="tab" data-preview-tab="front" aria-selected="false">Fronte</button>' +
      '<button type="button" class="fd-push-preview__tab" role="tab" data-preview-tab="back" aria-selected="false">Retro</button>' +
      '</div>' +
      '<div class="fd-push-preview__panel is-active" data-preview-panel="notify" role="tabpanel">' +
      '<div class="fd-push-preview__ios-scene">' +
      '<div class="fd-push-preview__notif-banner">' +
      '<img class="fd-push-preview__notif-icon" data-fd-push-preview-icon alt="" width="38" height="38" hidden>' +
      '<div class="fd-push-preview__notif-copy">' +
      '<div class="fd-push-preview__notif-meta">' +
      '<span class="fd-push-preview__notif-app" data-fd-push-preview-brand>Brand</span>' +
      '<span class="fd-push-preview__notif-now">adesso</span></div>' +
      '<div class="fd-push-preview__notif-body" data-fd-push-preview-lock-body>Titolo: messaggio…</div>' +
      '</div></div></div>' +
      '<p class="fd-push-preview__note">Il testo della notifica Wallet è quello del campo &quot;Notifica su lock screen&quot; (o titolo + messaggio strip se lasci vuoto).</p>' +
      '</div>' +
      '<div class="fd-push-preview__panel" data-preview-panel="front" role="tabpanel" hidden>' +
      '<div class="fd-wallet-pass" data-fd-push-preview-pass-card>' +
      '<div class="fd-wallet-pass__top">' +
      '<div class="fd-wallet-pass__brand">' +
      '<img class="fd-wallet-pass__logo" data-fd-push-preview-logo alt="" hidden>' +
      '<span class="fd-wallet-pass__brand-name" data-fd-push-preview-brand>Brand</span></div>' +
      '<div class="fd-wallet-pass__header-field" data-fd-push-preview-header hidden></div></div>' +
      '<div class="fd-wallet-pass__strip">' +
      '<img class="fd-wallet-pass__strip-img" data-fd-push-preview-strip alt="Strip pass" hidden>' +
      '<div class="fd-push-preview__pass-strip-hint" data-fd-push-preview-strip-hint>Anteprima strip del pass</div>' +
      '<div class="fd-push-preview__pass-strip-loading" data-fd-push-preview-strip-loading hidden>Caricamento…</div></div>' +
      '<div class="fd-wallet-pass__secondary" data-fd-push-preview-secondary>' +
      '<div class="fd-wallet-pass__field"><span class="fd-wallet-pass__field-label">NOME</span><span class="fd-wallet-pass__field-value">Mario Rossi</span></div>' +
      '<div class="fd-wallet-pass__field"><span class="fd-wallet-pass__field-label">AREA</span><span class="fd-wallet-pass__field-value">Engineering</span></div>' +
      '<div class="fd-wallet-pass__field"><span class="fd-wallet-pass__field-label">COIN</span><span class="fd-wallet-pass__field-value">25</span></div></div>' +
      '<div class="fd-wallet-pass__qr" aria-hidden="true"></div></div></div>' +
      '<div class="fd-push-preview__panel" data-preview-panel="back" role="tabpanel" hidden>' +
      '<div class="fd-wallet-pass-back">' +
      '<div class="fd-wallet-pass-back__nav"><span class="fd-wallet-pass-back__chev">‹</span>' +
      '<span class="fd-wallet-pass-back__title" data-fd-push-preview-back-title>BRAND PASS</span></div>' +
      '<ul class="fd-wallet-pass-back__rows" data-fd-push-preview-back-rows></ul></div>' +
      '<p class="fd-push-preview__note">Link promo e DETTAGLI in cima, poi HUB / SUPPORT / AREA PRIVATA.</p></div>';
    wirePreviewTabs(aside);
    setPreviewTab(activePreviewTab);
    return aside;
  }

  function buildTestBlock() {
    if (document.getElementById('fdPushTestBlock')) return;
    var card = document.querySelector('#pushPanel_immediate .push-card');
    if (!card) return;
    var block = document.createElement('div');
    block.id = 'fdPushTestBlock';
    block.className = 'fd-push-test';
    block.innerHTML =
      '<label class="form-label" for="fdPushTestPass">Dispositivo di prova</label>' +
      '<p class="form-hint" style="margin:0 0 8px">Seleziona qui il pass/device da usare per i test. L&#39;elenco si popola dai pass gia installati o salvati nel Wallet.</p>' +
      '<div class="fd-push-test__row">' +
      '<select id="fdPushTestPass" aria-label="Pass di prova"></select>' +
      '<button type="button" class="fd-btn fd-btn--secondary" id="fdPushTestBtn">Invia di prova</button>' +
      '</div>';
    var sendBtn = card.querySelector('button[onclick*="sendImmediatePush"]');
    if (sendBtn) card.insertBefore(block, sendBtn);
    else card.appendChild(block);
    document.getElementById('fdPushTestBtn').addEventListener('click', sendTestPush);
  }

  function buildSchedTestBlock() {
    if (document.getElementById('fdSchedTestBlock')) return;
    var card = document.querySelector('#pushPanel_scheduled .push-card');
    if (!card) return;
    var block = document.createElement('div');
    block.id = 'fdSchedTestBlock';
    block.className = 'fd-push-test';
    block.innerHTML =
      '<label class="form-label" for="fdSchedTestPass">Dispositivo di prova</label>' +
      '<p class="form-hint" style="margin:0 0 8px">Invia subito il contenuto di questa programmata al solo pass di prova, per verificarla prima della pianificazione.</p>' +
      '<div class="fd-push-test__row">' +
      '<select id="fdSchedTestPass" aria-label="Pass di prova"></select>' +
      '<button type="button" class="fd-btn fd-btn--secondary" id="fdSchedTestBtn">Invia test ora</button>' +
      '</div>';
    var scheduleBtn = card.querySelector('button[onclick*="createScheduledPush"]');
    if (scheduleBtn) card.insertBefore(block, scheduleBtn);
    else card.appendChild(block);
    document.getElementById('fdSchedTestBtn').addEventListener('click', sendSchedTestPush);
  }

  // Test della programmata: stesso motore dell'invio immediato (POST /push/send
  // con test_pass_id) ma con i campi della form programmata.
  async function sendSchedTestPush() {
    if (!syncBrandIdForPush()) {
      if (typeof toast === 'function') toast('Seleziona un brand');
      return;
    }
    var passId = document.getElementById('fdSchedTestPass')?.value;
    if (!passId) {
      if (typeof toast === 'function') toast('Seleziona un dispositivo di prova');
      return;
    }
    var screenAlert = (document.getElementById('schedScreenAlert')?.value || '').trim();
    if (!screenAlert) {
      if (typeof window.setPushFieldError === 'function') {
        window.setPushFieldError('schedScreenAlert', 'Inserisci il testo della notifica Wallet (lock screen)');
      } else if (typeof toast === 'function') toast('Compila la notifica lock screen');
      return;
    }
    if (screenAlert.length > SCREEN_ALERT_MAX) {
      if (typeof window.setPushFieldError === 'function') {
        window.setPushFieldError('schedScreenAlert', 'Notifica lock screen max ' + SCREEN_ALERT_MAX + ' caratteri');
      }
      return;
    }
    var title = (document.getElementById('schedTitle')?.value || '').trim() || screenAlert;
    var message = (document.getElementById('schedMessage')?.value || '').trim() || screenAlert;
    var body = {
      brand_id: syncBrandIdForPush(),
      title: title.slice(0, TITLE_MAX),
      message: message.slice(0, MESSAGE_MAX),
      screen_alert: screenAlert,
      update_pass: true,
      channel: document.getElementById('schedChannel')?.value || 'all',
      test_pass_id: passId
    };
    var backDetails = (document.getElementById('schedBackDetails')?.value || '').trim();
    if (backDetails) body.back_details = backDetails;
    var linkUrl = (document.getElementById('schedPassLinkUrl')?.value || '').trim();
    if (linkUrl) {
      body.include_pass_link = true;
      body.pass_link_url = linkUrl;
      body.pass_link_label = (document.getElementById('schedPassLinkLabel')?.value || '').trim();
    }
    var btn = document.getElementById('fdSchedTestBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Invio prova…';
    }
    try {
      var res = await fetch(getApiBase() + '/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(typeof getAuthHeaders === 'function' ? getAuthHeaders() : {}) },
        body: JSON.stringify(body)
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.error) {
        if (typeof toast === 'function') toast('Errore invio prova: ' + (data.error || res.status));
        return;
      }
      localStorage.setItem(TEST_PASS_KEY, passId);
      if (typeof toast === 'function') toast('Prova inviata al dispositivo di test');
    } catch (err) {
      if (typeof toast === 'function') toast('Errore invio prova: ' + (err.message || err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Invia test ora';
      }
    }
  }

  var fdModalOpeners = Object.create(null);

  function getFocusables(root) {
    var sel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    return Array.prototype.filter.call(root.querySelectorAll(sel), function (el) {
      return el.getAttribute('aria-hidden') !== 'true' && !el.closest('[hidden]');
    });
  }

  function setupFdModal(modal) {
    if (!modal || modal.dataset.fdModalSetup === '1') return;
    modal.dataset.fdModalSetup = '1';
    var dialog = modal.querySelector('.modal-content') || modal;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    var title = dialog.querySelector('.modal-header');
    if (title) {
      if (!title.id) title.id = modal.id + 'Title';
      dialog.setAttribute('aria-labelledby', title.id);
    }
    if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1');

    modal.addEventListener('click', function (e) {
      if (e.target === modal && modal.classList.contains('active')) closeFdModal(modal.id);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !modal.classList.contains('active')) return;
      e.preventDefault();
      closeFdModal(modal.id);
    });

    dialog.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || !modal.classList.contains('active')) return;
      var nodes = getFocusables(dialog);
      if (!nodes.length) return;
      var first = nodes[0];
      var last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }

  function openFdModal(modalId, trigger) {
    if (typeof window.prepareModalOpen === 'function') window.prepareModalOpen(modalId, trigger);
    fdModalOpeners[modalId] = trigger || document.activeElement;
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    var dialog = modal.querySelector('.modal-content') || modal;
    var nodes = getFocusables(dialog);
    requestAnimationFrame(function () {
      (nodes[0] || dialog).focus();
    });
  }

  function closeFdModal(modalId) {
    var modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal.active')) document.body.classList.remove('modal-open');
    var opener = fdModalOpeners[modalId];
    delete fdModalOpeners[modalId];
    requestAnimationFrame(function () {
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    });
  }

  function ensurePushConfirmModal() {
    if (document.getElementById('fdPushConfirmModal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'fdPushConfirmModal';
    wrap.className = 'modal';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<div class="modal-content">' +
      '<button type="button" class="modal-close" data-fd-close="fdPushConfirmModal" aria-label="Chiudi">&times;</button>' +
      '<div class="modal-header" id="fdPushConfirmTitle">Conferma invio notifica</div>' +
      '<p class="form-hint" style="margin:0 0 12px">Verifica destinatari e contenuto prima dell’invio massivo.</p>' +
      '<ul class="fd-push-confirm-summary" id="fdPushConfirmSummary"></ul>' +
      '<p class="fd-push-confirm-zero" id="fdPushConfirmZero" hidden>Nessun pass raggiungibile per questo canale.</p>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn sec" id="fdPushConfirmCancel">Annulla</button>' +
      '<button type="button" class="btn" id="fdPushConfirmSubmit">Conferma invio</button>' +
      '</div></div>';
    document.body.appendChild(wrap);
    setupFdModal(wrap);
    wrap.querySelector('[data-fd-close]').addEventListener('click', function () {
      closeFdModal('fdPushConfirmModal');
    });
    document.getElementById('fdPushConfirmCancel').addEventListener('click', function () {
      closeFdModal('fdPushConfirmModal');
    });
  }

  function ensurePushHistoryConfirmModal() {
    if (document.getElementById('fdPushHistoryConfirmModal')) return;
    var wrap = document.createElement('div');
    wrap.id = 'fdPushHistoryConfirmModal';
    wrap.className = 'modal';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<div class="modal-content">' +
      '<button type="button" class="modal-close" data-fd-close="fdPushHistoryConfirmModal" aria-label="Chiudi">&times;</button>' +
      '<div class="modal-header" id="fdPushHistoryConfirmTitle">Elimina dallo storico</div>' +
      '<p id="fdPushHistoryConfirmMessage" class="form-hint" style="margin:0"></p>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn sec" id="fdPushHistoryConfirmCancel">Annulla</button>' +
      '<button type="button" class="btn danger" id="fdPushHistoryConfirmSubmit">Elimina</button>' +
      '</div></div>';
    document.body.appendChild(wrap);
    setupFdModal(wrap);
    wrap.querySelector('[data-fd-close]').addEventListener('click', function () {
      closeFdModal('fdPushHistoryConfirmModal');
    });
    document.getElementById('fdPushHistoryConfirmCancel').addEventListener('click', function () {
      closeFdModal('fdPushHistoryConfirmModal');
    });
  }

  function fdConfirmDialog(opts) {
    ensurePushHistoryConfirmModal();
    return new Promise(function (resolve) {
      var titleEl = document.getElementById('fdPushHistoryConfirmTitle');
      var msgEl = document.getElementById('fdPushHistoryConfirmMessage');
      var submit = document.getElementById('fdPushHistoryConfirmSubmit');
      var cancel = document.getElementById('fdPushHistoryConfirmCancel');
      if (titleEl) titleEl.textContent = opts.title || 'Confermi?';
      if (msgEl) msgEl.textContent = opts.message || '';
      if (submit) submit.textContent = opts.confirmLabel || 'Conferma';
      submit.classList.toggle('danger', opts.tone === 'danger');

      function cleanup(result) {
        submit.removeEventListener('click', onConfirm);
        cancel.removeEventListener('click', onCancel);
        closeFdModal('fdPushHistoryConfirmModal');
        resolve(result);
      }
      function onConfirm() { cleanup(true); }
      function onCancel() { cleanup(false); }

      submit.addEventListener('click', onConfirm);
      cancel.addEventListener('click', onCancel);
      openFdModal('fdPushHistoryConfirmModal', opts.trigger || document.activeElement);
    });
  }

  function passGoogleSavedLocal(p) {
    if (typeof window.passGoogleSaved === 'function') return window.passGoogleSaved(p);
    if (!p) return false;
    if (p.google_wallet_saved === true || p.google_wallet_saved === 'true' || p.google_wallet_saved === 1) return true;
    if (p.google_installed_at || p.device_source === 'google') return true;
    return false;
  }

  function passGooglePendingLocal(p) {
    if (typeof window.passGooglePending === 'function') return window.passGooglePending(p);
    if (!p || !p.google_wallet_object_id) return false;
    return !passGoogleSavedLocal(p);
  }

  function passSamsungSavedLocal(p) {
    if (typeof window.passSamsungSaved === 'function') return window.passSamsungSaved(p);
    if (!p) return false;
    if (p.samsung_wallet_saved === true || p.samsung_wallet_saved === 'true' || p.samsung_wallet_saved === 1) return true;
    if (p.samsung_installed_at || p.device_source === 'samsung') return true;
    return false;
  }

  function passSamsungPendingLocal(p) {
    if (typeof window.passSamsungPending === 'function') return window.passSamsungPending(p);
    if (!p || !p.samsung_wallet_ref_id) return false;
    return !passSamsungSavedLocal(p);
  }

  function isAppleReachable(p) {
    return !!p.push_token;
  }

  function isGoogleReachable(p) {
    return !!(p.google_wallet_object_id || passGoogleSavedLocal(p) || passGooglePendingLocal(p));
  }

  function isSamsungReachable(p) {
    return !!(p.samsung_wallet_ref_id && passSamsungSavedLocal(p)) || passSamsungPendingLocal(p);
  }

  function parseSelectedChannels(channel) {
    var raw = String(channel || 'all').trim().toLowerCase();
    if (raw === 'all') return channelKeys().slice();
    if (raw.indexOf(',') !== -1) {
      return raw.split(',').map(function (s) { return s.trim(); }).filter(function (k) {
        return channelKeys().indexOf(k) !== -1;
      });
    }
    return [raw];
  }

  function countRecipients(passes, channel) {
    var apple = 0;
    var google = 0;
    var samsung = 0;
    var any = 0;
    var selected = parseSelectedChannels(channel);
    var total = 0;
    passes.forEach(function (p) {
      var a = isAppleReachable(p);
      var g = isGoogleReachable(p);
      var s = isSamsungReachable(p);
      if (a) apple += 1;
      if (g) google += 1;
      if (s) samsung += 1;
      if (a || g || s) any += 1;
      var reachable =
        (selected.indexOf('apple') !== -1 && a) ||
        (selected.indexOf('google') !== -1 && g) ||
        (selected.indexOf('samsung') !== -1 && s);
      if (reachable) total += 1;
    });
    if (selected.length === 1) {
      var k = selected[0];
      if (k === 'apple') return { total: apple, apple: apple, google: 0, samsung: 0, any: any, selected: selected };
      if (k === 'google') return { total: google, apple: 0, google: google, samsung: 0, any: any, selected: selected };
      if (k === 'samsung') return { total: samsung, apple: 0, google: 0, samsung: samsung, any: any, selected: selected };
    }
    return { total: total, apple: apple, google: google, samsung: samsung, any: any, selected: selected };
  }

  async function fetchRecipientCounts(channel) {
    var brandId = syncBrandIdForPush();
    if (!brandId) return { counts: null, note: null };
    try {
      var res = await fetch(
        getApiBase() + '/passes?brand_id=' + encodeURIComponent(brandId) + '&limit=600',
        { headers: typeof getAuthHeaders === 'function' ? getAuthHeaders() : {} }
      );
      var rows = await res.json();
      var list = Array.isArray(rows) ? rows : rows.passes || rows.items || [];
      var audienceId = document.getElementById('pushAudienceTarget')?.value || '';
      var campaignId =
        typeof window.isLegacyCampaignsUiEnabled === 'function' && window.isLegacyCampaignsUiEnabled()
          ? document.getElementById('pushCampaignTarget')?.value || ''
          : '';
      var note = null;
      if (audienceId || campaignId) {
        note = 'Conteggio sul brand; audience/campagna applicata al momento dell’invio.';
      }
      return { counts: countRecipients(list, channel), note: note };
    } catch (e) {
      console.warn('[fd-push] recipient count unavailable', e);
      return { counts: null, note: 'Conteggio destinatari non disponibile; l’invio userà i filtri server.' };
    }
  }

  function firstMessageLine(text) {
    var line = String(text || '').split(/\r?\n/)[0] || '';
    return line.length > 120 ? line.slice(0, 117) + '…' : line;
  }

  function selectedOptionLabel(selectId) {
    var sel = document.getElementById(selectId);
    if (!sel || !sel.value) return null;
    var opt = sel.options[sel.selectedIndex];
    return opt ? opt.textContent.trim() : sel.value;
  }

  function channelLabel(value) {
    var raw = String(value || 'all').trim().toLowerCase();
    if (raw === 'all') return 'Tutti i canali';
    if (raw.indexOf(',') !== -1) {
      return raw.split(',').map(function (part) {
        var ch = CHANNELS.find(function (c) { return c.value === part.trim(); });
        return ch ? ch.label : part.trim();
      }).join(' + ');
    }
    var ch = CHANNELS.find(function (c) { return c.value === raw; });
    return ch ? ch.label : value;
  }

  function renderRecipientLines(counts, channel) {
    if (!counts) return '<li><strong>Destinatari</strong>Conteggio non disponibile</li>';
    var selected = counts.selected || parseSelectedChannels(channel);
    var names = { apple: 'Apple', google: 'Google', samsung: 'Samsung' };
    if (selected.length > 1) {
      var parts = selected.map(function (k) {
        return names[k] + ': ' + (counts[k] || 0);
      });
      return (
        '<li><strong>Destinatari raggiungibili</strong>' +
        parts.join(' · ') +
        ' (totale unico: ' + counts.total + ')</li>'
      );
    }
    var single = selected[0] || channel;
    return '<li><strong>Destinatari raggiungibili</strong>' +
      (names[single] || single) + ': ' + counts.total + ' pass</li>';
  }

  async function openPushSendConfirm(trigger) {
    if (typeof window.clearPushFieldErrors === 'function') window.clearPushFieldErrors();
    var invalid = false;
    var screenAlert = getPushScreenAlertValue();
    if (!screenAlert) {
      if (typeof window.setPushFieldError === 'function') {
        window.setPushFieldError('pushScreenAlert', 'Inserisci il testo della notifica Wallet (lock screen)');
      }
      invalid = true;
    } else if (screenAlert.length > SCREEN_ALERT_MAX) {
      if (typeof window.setPushFieldError === 'function') {
        window.setPushFieldError('pushScreenAlert', 'Notifica lock screen max ' + SCREEN_ALERT_MAX + ' caratteri');
      }
      invalid = true;
    }
    if (!syncBrandIdForPush()) {
      if (typeof toast === 'function') toast('Seleziona un brand');
      return;
    }
    if (invalid) return;
    var backDetails = (document.getElementById('pushBackDetails')?.value || '').trim();
    if (backDetails.length > BACK_DETAILS_MAX) {
      if (typeof window.setPushFieldError === 'function') {
        window.setPushFieldError('pushBackDetails', 'Dettagli retro max ' + BACK_DETAILS_MAX + ' caratteri');
      }
      invalid = true;
    }
    if (invalid) return;

    ensurePushConfirmModal();
    var channel = 'all';
    var summary = document.getElementById('fdPushConfirmSummary');
    var zeroBanner = document.getElementById('fdPushConfirmZero');
    var submitBtn = document.getElementById('fdPushConfirmSubmit');
    if (summary) summary.innerHTML = '<li><strong>Caricamento…</strong>Calcolo destinatari</li>';

    openFdModal('fdPushConfirmModal', trigger || document.getElementById('pushSendBtn'));

    var result = await fetchRecipientCounts(channel);
    var counts = result.counts;
    var html = renderRecipientLines(counts, channel);
    var linkedLabel = selectedOptionLabel('pushLinkedContent');
    if (linkedLabel && document.getElementById('pushLinkedContent')?.value) {
      html += '<li><strong>Contenuto collegato</strong>' + esc(linkedLabel) + '</li>';
    }
    if (result.note) html += '<li><strong>Nota</strong>' + esc(result.note) + '</li>';
    if (summary) summary.innerHTML = html;

    var disable = counts && counts.total === 0;
    if (zeroBanner) zeroBanner.hidden = !disable;
    if (submitBtn) submitBtn.disabled = !!disable;
  }

  function wirePushSendConfirm() {
    var btn = document.getElementById('pushSendBtn');
    if (!btn || btn.dataset.fdConfirmWired === '1') return;
    btn.dataset.fdConfirmWired = '1';
    btn.removeAttribute('onclick');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openPushSendConfirm(btn);
    });

    ensurePushConfirmModal();
    var submitBtn = document.getElementById('fdPushConfirmSubmit');
    if (submitBtn && !submitBtn.dataset.fdWired) {
      submitBtn.dataset.fdWired = '1';
      submitBtn.addEventListener('click', async function () {
        if (submitBtn.disabled) return;
        if (!syncBrandIdForPush()) {
          if (typeof toast === 'function') toast('Seleziona un brand');
          return;
        }
        closeFdModal('fdPushConfirmModal');
        if (typeof window.sendImmediatePush === 'function') {
          await window.sendImmediatePush();
        }
      });
    }
  }

  async function deletePushHistoryCore(pushId) {
    try {
      var res = await fetch(getApiBase() + '/push/' + encodeURIComponent(pushId), {
        method: 'DELETE',
        headers: typeof getAuthHeaders === 'function' ? getAuthHeaders() : {}
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || data.error) throw new Error(data.error || 'Eliminazione non riuscita');
      if (typeof toast === 'function') toast('Voce eliminata');
      if (typeof window.getPushSelectedIds === 'function') window.getPushSelectedIds().delete(String(pushId));
      if (typeof window.loadPushHistory === 'function') await window.loadPushHistory();
    } catch (err) {
      if (typeof toast === 'function') toast('Errore eliminazione: ' + (err.message || err));
    }
  }

  async function deleteSelectedPushHistoryCore(ids) {
    var ok = 0;
    var fail = 0;
    for (var i = 0; i < ids.length; i += 1) {
      try {
        var res = await fetch(getApiBase() + '/push/' + encodeURIComponent(ids[i]), {
          method: 'DELETE',
          headers: typeof getAuthHeaders === 'function' ? getAuthHeaders() : {}
        });
        var data = await res.json().catch(function () { return {}; });
        if (res.ok && !data.error) {
          ok += 1;
          if (typeof window.getPushSelectedIds === 'function') window.getPushSelectedIds().delete(ids[i]);
        } else fail += 1;
      } catch (_) {
        fail += 1;
      }
    }
    if (ok && typeof toast === 'function') toast('Eliminate ' + ok + ' voci dallo storico');
    if (fail && typeof toast === 'function') toast(fail + ' voci non eliminate');
    if (typeof window.updatePushBulkBar === 'function') window.updatePushBulkBar();
    if (typeof window.loadPushHistory === 'function') await window.loadPushHistory();
  }

  function patchPushHistoryDelete() {
    if (window.__fdPushHistoryPatched || !isFiloPushApp()) return;
    window.__fdPushHistoryPatched = true;
    ensurePushHistoryConfirmModal();

    window.deletePushFromHistory = async function (pushId) {
      var log = (window.pushHistoryCache || []).find(function (row) {
        return String(row.id) === String(pushId);
      });
      var ok = await fdConfirmDialog({
        title: 'Elimina dallo storico',
        message: 'Eliminare 1 notifica dallo storico' + (log && log.title ? ' («' + log.title + '»)' : '') + '?',
        confirmLabel: 'Elimina',
        tone: 'danger',
        trigger: document.activeElement
      });
      if (!ok) return;
      return deletePushHistoryCore(pushId);
    };

    window.deleteSelectedPushHistory = async function () {
      var ids = typeof window.getPushSelectedIds === 'function' ? [...window.getPushSelectedIds()] : [];
      if (!ids.length) return;
      var ok = await fdConfirmDialog({
        title: 'Elimina notifiche selezionate',
        message: 'Eliminare ' + ids.length + ' voci dallo storico?',
        confirmLabel: 'Elimina',
        tone: 'danger',
        trigger: document.activeElement
      });
      if (!ok) return;
      return deleteSelectedPushHistoryCore(ids);
    };
  }

  function wrapPushHistorySection(panel) {
    var historyWrap = panel.querySelector(':scope > .fd-push-history-wrap');
    if (historyWrap) return historyWrap;

    var historyTitle = panel.querySelector(':scope > .sec-title');
    var historyEl = panel.querySelector(':scope > #pushHistory');
    if (!historyTitle && !historyEl) return null;

    historyWrap = document.createElement('div');
    historyWrap.className = 'fd-push-history-wrap';
    if (historyTitle) historyWrap.appendChild(historyTitle);
    if (historyEl) historyWrap.appendChild(historyEl);
    panel.appendChild(historyWrap);
    return historyWrap;
  }

  function enhanceImmediatePanel() {
    var panel = document.getElementById('pushPanel_immediate');
    if (!panel || panel.dataset.fdPushEnhanced === '1') return;
    panel.dataset.fdPushEnhanced = '1';
    panel.classList.add('fd-push-panel--enhanced');

    var card = panel.querySelector('.push-card');
    if (card) card.classList.add('fd-card', 'fd-push-card');
    if (!card) return;

    var formCol = panel.querySelector(':scope > .fd-push-form-col');
    if (!formCol) {
      formCol = document.createElement('div');
      formCol.className = 'fd-push-form-col';
      panel.insertBefore(formCol, panel.firstChild);
    }
    if (card.parentElement !== formCol) {
      formCol.appendChild(card);
    }

    wrapPushHistorySection(panel);

    var asideCol = panel.querySelector(':scope > .fd-push-aside-col');
    if (!asideCol) {
      asideCol = document.createElement('div');
      asideCol.className = 'fd-push-aside-col';
      var historyWrap = panel.querySelector(':scope > .fd-push-history-wrap');
      panel.insertBefore(asideCol, historyWrap);
    }

    var preview = asideCol.querySelector('.fd-push-preview') || buildPreviewPanel();
    if (preview && preview.parentElement !== asideCol) {
      asideCol.appendChild(preview);
    }
    wirePreviewTabs(preview);

    buildChannelSegmented();
    buildTestBlock();
    buildSchedTestBlock();
    wrapCharField('pushScreenAlert', SCREEN_ALERT_MAX);
    wrapCharField('pushTitle', TITLE_MAX);
    wrapCharField('pushMessage', MESSAGE_MAX);
    wrapCharField('pushBackDetails', BACK_DETAILS_MAX);
    syncPreview();
    wirePassPreviewListeners();
    loadTestPasses();
    wirePushSendConfirm();

    var brandSel = document.getElementById('brandSelector');
    if (brandSel && brandSel.dataset.fdPushPreviewBound !== '1') {
      brandSel.dataset.fdPushPreviewBound = '1';
      brandSel.addEventListener('change', syncPreview);
    }
    var schedAlertEl = document.getElementById('schedScreenAlert');
    if (schedAlertEl && !schedAlertEl.dataset.fdInlinePreviewWired) {
      schedAlertEl.dataset.fdInlinePreviewWired = '1';
      schedAlertEl.addEventListener('input', syncScreenAlertInlinePreviews);
    }
    ['pushScreenAlert', 'pushTitle', 'pushMessage'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.dataset.fdPreviewBound !== '1') {
        el.dataset.fdPreviewBound = '1';
        el.addEventListener('input', syncPreview);
      }
    });
  }

  function enhancePushSectionDesign() {
    var push = document.getElementById('push');
    if (!push || push.dataset.fdDsSection === '1') return;
    push.dataset.fdDsSection = '1';
    push.classList.add('push--fd-ds');

    var title = push.querySelector('h1.page-title, h1.sec-title');
    var intro = push.querySelector(':scope > p');
    if (title && !title.closest('.fd-page-header')) {
      var header = document.createElement('header');
      header.className = 'fd-page-header fd-push-header';
      var copy = document.createElement('div');
      copy.className = 'fd-page-header__copy';
      copy.appendChild(title);
      title.classList.add('fd-page-header__title');
      if (intro) {
        intro.classList.add('fd-page-header__lead', 'fd-push-intro');
        intro.style.fontSize = '';
        intro.style.color = '';
        intro.style.marginBottom = '';
        copy.appendChild(intro);
      } else {
        var lead = document.createElement('p');
        lead.className = 'fd-page-header__lead fd-push-intro';
        lead.innerHTML =
          'Invia notifiche ai dipendenti con pass in Wallet. Scegli il <strong>canale</strong>, ' +
          'controlla i limiti di caratteri e usa l’<strong>anteprima</strong> prima dell’invio massivo.';
        copy.appendChild(lead);
      }
      header.appendChild(copy);
      push.insertBefore(header, push.firstChild);
    }

    var tabs = push.querySelector('.tabs-bar');
    if (tabs) tabs.classList.add('fd-push-tabs');
  }

  function enhancePushCards(scope) {
    var root = scope || document.getElementById('push');
    if (!root) return;
    root.querySelectorAll('.push-card').forEach(function (card) {
      card.classList.add('fd-card', 'fd-push-card');
    });
  }

  function applyDsButtonClasses(scope) {
    var root = scope || document.getElementById('push');
    if (!root) return;

    var sendBtn = root.querySelector('#pushSendBtn');
    if (sendBtn) sendBtn.classList.add('fd-push-send-btn');

    root.querySelectorAll('#fdPushTestBtn').forEach(function (btn) {
      if (!btn.classList.contains('sec')) btn.classList.add('sec');
    });

    root.querySelectorAll('[onclick*="pushPickStripFromMedia"]').forEach(function (btn) {
      btn.classList.add('sec', 'small');
    });
    root.querySelectorAll('[onclick*="schedPickStripFromMedia"]').forEach(function (btn) {
      btn.classList.add('sec', 'small');
    });
    root.querySelectorAll('#pushStripClearBtn').forEach(function (btn) {
      btn.classList.add('fd-btn-ghost', 'small', 'fd-push-strip-clear');
    });
    root.querySelectorAll('#schedStripClearBtn').forEach(function (btn) {
      btn.classList.add('fd-btn-ghost', 'small', 'fd-push-strip-clear');
    });

    root.querySelectorAll('[onclick*="createScheduledPush"]').forEach(function (btn) {
      btn.classList.add('fd-push-send-btn');
    });
    root.querySelectorAll('[onclick*="addGeoLocation"]').forEach(function (btn) {
      btn.classList.add('sec', 'small');
    });
    root.querySelectorAll('[onclick*="saveGeoConfig"]').forEach(function (btn) {
      btn.classList.remove('purple');
      btn.classList.add('sec');
    });

    root.querySelectorAll('#pushBulkBar .btn.small.sec, #pushBulkBar .btn.sec.small').forEach(function (btn) {
      if (!btn.classList.contains('small')) btn.classList.add('small');
    });
    root.querySelectorAll('#pushBulkBar .btn.small.danger, #pushBulkBar .btn.danger.small').forEach(function (btn) {
      if (!btn.classList.contains('small')) btn.classList.add('small');
    });
  }

  function renderHistorySkeleton() {
    return (
      '<div class="fd-push-history-skeleton" aria-busy="true" aria-live="polite">' +
      '<span class="fd-skeleton fd-skeleton--title" style="width:42%;max-width:220px"></span>' +
      '<span class="fd-skeleton" style="display:block;width:100%;height:180px;margin-top:12px;border-radius:12px"></span>' +
      '</div>'
    );
  }

  function enhancePushHistoryDom() {
    var history = document.getElementById('pushHistory');
    if (!history) return;

    var wrap = history.closest('.fd-push-history-wrap');
    if (wrap) {
      wrap.classList.add('fd-card', 'fd-push-history-section');
      var historyTitle = wrap.querySelector('.sec-title');
      if (historyTitle) historyTitle.classList.add('fd-push-history-title');
    }

    var bulkHint = history.querySelector('.bulk-select-hint');
    if (bulkHint) bulkHint.classList.add('fd-pushes-bulk-hint');

    var bulkBar = history.querySelector('#pushBulkBar');
    if (bulkBar) bulkBar.classList.add('fd-passes-bulk-bar', 'fd-push-bulk-bar');

    var table = history.querySelector('.pass-table, .table');
    if (table) table.classList.add('fd-table');
    var tableWrap = history.querySelector('.pass-table-wrap');
    if (tableWrap) tableWrap.classList.add('fd-table-wrap');

    enhancePushHistoryRowActions(history);
    applyDsButtonClasses(document.getElementById('push'));

    if (typeof window.fdEnhanceResponsiveTables === 'function') {
      window.fdEnhanceResponsiveTables();
    }
  }

  function restorePushHistoryMenuPanel(panel) {
    if (!panel || !panel._fdMenuHome) return;
    if (panel.parentNode !== panel._fdMenuHome) {
      panel._fdMenuHome.appendChild(panel);
    }
    panel._fdMenuTrigger = null;
  }

  function resetPushHistoryMenuPanel(panel) {
    if (!panel) return;
    panel.classList.remove('fd-pass-row-menu__panel--floating');
    panel.style.top = '';
    panel.style.left = '';
    panel.style.right = '';
    panel.style.minWidth = '';
    panel.style.zIndex = '';
  }

  function positionPushHistoryMenuPanel(trigger, panel) {
    if (!trigger || !panel) return;
    panel.classList.add('fd-pass-row-menu__panel--floating');
    var minW = Math.max(168, Math.round(trigger.getBoundingClientRect().width));
    var rect = trigger.getBoundingClientRect();
    panel.style.minWidth = minW + 'px';
    panel.style.right = 'auto';
    panel.style.left = Math.max(8, Math.round(rect.right - minW)) + 'px';
    panel.style.top = Math.round(rect.bottom + 4) + 'px';
    panel.style.zIndex = '1200';

    var panelRect = panel.getBoundingClientRect();
    if (panelRect.bottom > window.innerHeight - 8) {
      panel.style.top = Math.max(8, Math.round(rect.top - panelRect.height - 4)) + 'px';
    }
    if (panelRect.left < 8) {
      panel.style.left = '8px';
    }
    if (panelRect.right > window.innerWidth - 8) {
      panel.style.left = Math.max(8, Math.round(window.innerWidth - panelRect.width - 8)) + 'px';
    }
  }

  function closeAllPushHistoryMenus() {
    document.querySelectorAll('#pushHistory .fd-pass-row-menu__panel').forEach(function (p) {
      p.hidden = true;
      resetPushHistoryMenuPanel(p);
      restorePushHistoryMenuPanel(p);
    });
    document.querySelectorAll('#pushHistory .fd-pass-row-menu__trigger').forEach(function (t) {
      t.setAttribute('aria-expanded', 'false');
    });
  }

  function openPushHistoryMenu(trigger, panel) {
    closeAllPushHistoryMenus();
    var menu = trigger.closest('.fd-pass-row-menu');
    if (!menu) return;
    panel._fdMenuHome = menu;
    panel._fdMenuTrigger = trigger;
    document.body.appendChild(panel);
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    positionPushHistoryMenuPanel(trigger, panel);
  }

  function wirePushHistoryMenuDismiss() {
    if (document.body.dataset.fdPushHistMenuDismiss === '1') return;
    document.body.dataset.fdPushHistMenuDismiss = '1';
    document.addEventListener('click', closeAllPushHistoryMenus);
    window.addEventListener('resize', closeAllPushHistoryMenus);
    document.addEventListener(
      'scroll',
      function (e) {
        if (e.target && e.target.closest && e.target.closest('#pushHistory .pass-table-wrap')) {
          closeAllPushHistoryMenus();
        }
      },
      true
    );
  }

  function enhancePushHistoryRowActions(scope) {
    wirePushHistoryMenuDismiss();
    (scope || document).querySelectorAll('#pushHistory .pass-row-actions').forEach(function (wrap) {
      if (wrap.dataset.fdActionsEnhanced === '1') return;
      wrap.dataset.fdActionsEnhanced = '1';
      var resendBtn = wrap.querySelector('[onclick*="resendPushFromHistory"]');
      var delBtn = wrap.querySelector('.pass-action-btn--danger, [onclick*="deletePushFromHistory"]');
      if (!resendBtn || !delBtn) return;
      var row = wrap.closest('tr');
      var pushId =
        wrap.getAttribute('data-push-id') ||
        (row && row.querySelector('.push-row-cb') && row.querySelector('.push-row-cb').getAttribute('data-push-id')) ||
        resendBtn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] ||
        delBtn.getAttribute('onclick')?.match(/'([^']+)'/)?.[1] ||
        '';
      if (!pushId) return;
      var menuId = 'fdPushHistMenu_' + pushId.replace(/[^a-z0-9]/gi, '');
      wrap.innerHTML =
        '<div class="fd-pass-row-menu fd-push-history-menu">' +
        '<button type="button" class="fd-btn fd-btn--secondary fd-btn--sm fd-pass-row-menu__trigger" aria-haspopup="menu" aria-expanded="false" aria-controls="' +
        menuId +
        '">Azioni</button>' +
        '<div class="fd-pass-row-menu__panel" id="' +
        menuId +
        '" role="menu" hidden>' +
        '<button type="button" class="fd-pass-row-menu__item" role="menuitem" data-action="resend">Reinvia</button>' +
        '<button type="button" class="fd-pass-row-menu__item fd-pass-row-menu__item--danger" role="menuitem" data-action="delete">Elimina dallo storico</button>' +
        '</div></div>';
      var trigger = wrap.querySelector('.fd-pass-row-menu__trigger');
      var panel = wrap.querySelector('.fd-pass-row-menu__panel');
      trigger.addEventListener('click', function (e) {
        e.stopPropagation();
        if (panel.hidden) openPushHistoryMenu(trigger, panel);
        else closeAllPushHistoryMenus();
      });
      wrap.querySelector('[data-action="resend"]').addEventListener('click', function () {
        closeAllPushHistoryMenus();
        if (typeof window.resendPushFromHistory === 'function') window.resendPushFromHistory(pushId);
      });
      wrap.querySelector('[data-action="delete"]').addEventListener('click', function () {
        closeAllPushHistoryMenus();
        if (typeof window.deletePushFromHistory === 'function') window.deletePushFromHistory(pushId);
      });
    });
  }

  function patchLoadPushHistory() {
    if (window.__fdPushHistoryLoadPatched || typeof window.loadPushHistory !== 'function') return;
    window.__fdPushHistoryLoadPatched = true;
    var orig = window.loadPushHistory;
    window.loadPushHistory = async function () {
      if (!isFiloPushApp() || !window.brandId) return orig.apply(this, arguments);
      var el = document.getElementById('pushHistory');
      if (el) el.innerHTML = renderHistorySkeleton();
      await orig.apply(this, arguments);
      enhancePushHistoryDom();
    };
  }

  function enhanceScheduledPanel() {
    var panel = document.getElementById('pushPanel_scheduled');
    if (!panel || panel.dataset.fdDsPanel === '1') return;
    panel.dataset.fdDsPanel = '1';
    panel.classList.add('fd-push-panel--ds');
    enhancePushCards(panel);
    var listTitle = panel.querySelector(':scope > .sec-title');
    if (listTitle) {
      var section = document.createElement('div');
      section.className = 'fd-card fd-push-scheduled-list';
      section.appendChild(listTitle);
      var list = panel.querySelector('#scheduledList');
      if (list) section.appendChild(list);
      panel.appendChild(section);
      listTitle.classList.add('fd-push-section-title');
    }
  }

  function enhanceGeofencingPanel() {
    var panel = document.getElementById('pushPanel_geofencing');
    if (!panel || panel.dataset.fdDsPanel === '1') return;
    panel.dataset.fdDsPanel = '1';
    panel.classList.add('fd-push-panel--ds');
    enhancePushCards(panel);
    var empty = panel.querySelector('#geoEmptyMsg');
    if (empty) empty.classList.add('fd-empty-state', 'fd-push-geo-empty');
  }

  function enhancePushPanelsDom() {
    enhancePushCards(document.getElementById('push'));
    enhanceScheduledPanel();
    enhanceGeofencingPanel();
    applyDsButtonClasses(document.getElementById('push'));
    enhancePushHistoryDom();
  }

  function patchSwitchPushTab() {
    if (window.__fdPushTabPatched || typeof window.switchPushTab !== 'function') return;
    window.__fdPushTabPatched = true;
    var orig = window.switchPushTab;
    window.switchPushTab = function (tab) {
      var out = orig.apply(this, arguments);
      setTimeout(enhancePushPanelsDom, 0);
      return out;
    };
  }

  function enhanceIntro() {
    /* intro merged into enhancePushSectionDesign */
  }

  function patchNavForPush() {
    if (window.__fdPushNavPatched || typeof window.nav !== 'function') return;
    window.__fdPushNavPatched = true;
    var orig = window.nav;
    window.nav = function (sectionId) {
      var out = orig.apply(this, arguments);
      if (sectionId === 'push' && isFiloPushApp()) {
        setTimeout(initFdPush, 80);
      }
      return out;
    };
  }

  function initFdPush() {
    if (!isFiloPushApp()) return;
    var push = document.getElementById('push');
    if (push) push.classList.add('push--fd');
    patchLoadPushHistory();
    patchSwitchPushTab();
    patchNavForPush();
    patchPushHistoryDelete();
    enhancePushSectionDesign();
    if (typeof window.fdInjectSectionFlowBar === 'function') {
      window.fdInjectSectionFlowBar('push');
    }
    enhanceImmediatePanel();
    enhancePushPanelsDom();
  }

  window.fdInitPush = initFdPush;
  window.fdSendTestPush = sendTestPush;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdPush);
  } else {
    initFdPush();
  }
})();


/* === fd-reward-challenge.js === */
/**
 * FD — Reward & Challenge (FASE 4): DS layout, KPI grid, table UX, tooltip colonne.
 */
(function () {
  'use strict';

  function isFilo() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function setStatsCompact(gridId, totalCampaigns) {
    var grid = document.getElementById(gridId);
    if (!grid) return;
    grid.classList.toggle('stats-grid--compact', totalCampaigns === 0);
  }

  function tableHasDataRows(tableId) {
    var tbody = document.querySelector('#' + tableId + ' tbody');
    return !!(tbody && tbody.querySelector('tr td:not([colspan])'));
  }

  function tableHasEmptyStateRow(tableId) {
    var tbody = document.querySelector('#' + tableId + ' tbody');
    return !!(tbody && tbody.querySelector('tr.table-empty-row'));
  }

  function getEngagementEmptyHost(tableId) {
    if (tableId === 'gamTable') return document.getElementById('gamEmptyHost');
    if (tableId === 'iwTable') return document.getElementById('iwEmptyHost');
    return null;
  }

  function syncEngagementToolbarCta(tableId) {
    var toolbarBtnId = tableId === 'iwTable' ? 'iwToolbarCreateBtn' : tableId === 'gamTable' ? 'gamToolbarCreateBtn' : null;
    if (!toolbarBtnId) return;
    var btn = document.getElementById(toolbarBtnId);
    if (!btn) return;
    var emptyHost = getEngagementEmptyHost(tableId);
    var emptyHostVisible = !!(emptyHost && !emptyHost.hidden && emptyHost.innerHTML.trim());
    var hasEmptyRow = isFilo() && tableHasEmptyStateRow(tableId);
    var hasData = tableHasDataRows(tableId);
    btn.hidden = !hasData && (emptyHostVisible || hasEmptyRow);
  }

  function syncEngagementTableHead(tableId) {
    syncEngagementToolbarCta(tableId);
    if (!isFilo()) return;
    var table = document.getElementById(tableId);
    if (!table) return;
    var thead = table.querySelector('thead');
    if (!thead) return;
    var emptyHost = getEngagementEmptyHost(tableId);
    var emptyHostVisible = !!(emptyHost && !emptyHost.hidden && emptyHost.innerHTML.trim());
    var tableHidden = table.hidden === true;
    var hasData = !emptyHostVisible && !tableHidden && tableHasDataRows(tableId);
    thead.hidden = !hasData;
    table.classList.toggle('fd-table--empty', !hasData);
    if (emptyHostVisible) table.hidden = true;
  }

  function challengeStatusMeta(status) {
    var key = String(status || '').toLowerCase();
    var map = {
      active: { label: 'Attiva', cls: 'fd-challenge-status--active' },
      draft: { label: 'Bozza', cls: 'fd-challenge-status--draft' },
      paused: { label: 'In pausa', cls: 'fd-challenge-status--paused' },
      ended: { label: 'Terminata', cls: 'fd-challenge-status--ended' },
      inactive: { label: 'Inattiva', cls: 'fd-challenge-status--inactive' }
    };
    return map[key] || { label: status || '—', cls: 'fd-challenge-status--neutral' };
  }

  function enhanceChallengeStatusBadges(scope) {
    var root = scope || document.getElementById('gamification');
    if (!root) return;
    root.querySelectorAll('#gamTable tbody tr').forEach(function (row) {
      var badge = row.querySelector('td .badge');
      if (!badge || badge.dataset.fdStatusLocalized === '1') return;
      var raw = (badge.textContent || '').trim();
      var meta = challengeStatusMeta(raw);
      badge.dataset.fdStatusLocalized = '1';
      badge.textContent = meta.label;
      badge.classList.remove('active', 'inactive');
      badge.classList.add('fd-challenge-status', meta.cls);
    });
  }

  function formatRedemptionRate(stats) {
    if (!stats) return '—';
    var plays = Number(stats.total_plays) || 0;
    if (plays <= 0) return '—';
    if (stats.win_rate == null || stats.win_rate === '') return '—';
    var rate = Number(stats.win_rate);
    if (!Number.isFinite(rate)) return '—';
    return rate.toFixed(1) + '%';
  }

  function applyRewardStats(stats) {
    var el = document.getElementById('iwStatRate');
    if (!el) return;
    el.textContent = formatRedemptionRate(stats);
  }

  var thHelpTipNode = null;
  var thHelpTipAnchor = null;

  function hideThHelpTip() {
    if (!thHelpTipNode) return;
    thHelpTipNode.hidden = true;
    thHelpTipNode.setAttribute('aria-hidden', 'true');
    thHelpTipAnchor = null;
  }

  function ensureThHelpTip() {
    if (thHelpTipNode) return thHelpTipNode;
    thHelpTipNode = document.createElement('div');
    thHelpTipNode.id = 'fdThHelpTip';
    thHelpTipNode.className = 'fd-th-help-tip';
    thHelpTipNode.setAttribute('role', 'tooltip');
    thHelpTipNode.hidden = true;
    thHelpTipNode.setAttribute('aria-hidden', 'true');
    document.body.appendChild(thHelpTipNode);
    document.addEventListener('scroll', hideThHelpTip, true);
    window.addEventListener('resize', hideThHelpTip);
    return thHelpTipNode;
  }

  function positionThHelpTip(anchor, text) {
    var tip = ensureThHelpTip();
    tip.textContent = text;
    tip.hidden = false;
    tip.setAttribute('aria-hidden', 'false');
    thHelpTipAnchor = anchor;

    var collision = 12;
    var gap = 8;
    var rect = anchor.getBoundingClientRect();
    tip.style.transform = 'none';
    var width = tip.offsetWidth || 240;
    var height = tip.offsetHeight || 80;

    var top = rect.bottom + gap;
    var left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(collision, Math.min(left, window.innerWidth - width - collision));

    if (top + height > window.innerHeight - collision) {
      top = Math.max(collision, rect.top - height - gap);
      tip.classList.add('fd-th-help-tip--above');
    } else {
      tip.classList.remove('fd-th-help-tip--above');
    }

    if (left + width > window.innerWidth - collision) {
      left = Math.max(collision, window.innerWidth - width - collision);
    }

    tip.style.position = 'fixed';
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
    tip.style.zIndex = '9300';
  }

  function bindThHelpTooltips() {
    document.querySelectorAll('#iwTable th .fd-th-help, #gamTable th .fd-th-help').forEach(function (hint) {
      if (hint.dataset.fdTipBound === '1') return;
      hint.dataset.fdTipBound = '1';
      var th = hint.closest('th');
      if (!th) return;
      var tipText = th.getAttribute('aria-label') || th.getAttribute('title') || '';
      th.removeAttribute('title');
      hint.setAttribute('tabindex', '0');
      hint.setAttribute('role', 'button');
      hint.setAttribute('aria-label', tipText);

      function show() {
        if (!tipText) return;
        positionThHelpTip(hint, tipText);
      }

      hint.addEventListener('mouseenter', show);
      hint.addEventListener('focus', show);
      hint.addEventListener('mouseleave', hideThHelpTip);
      hint.addEventListener('blur', hideThHelpTip);
      hint.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (thHelpTipAnchor === hint && thHelpTipNode && !thHelpTipNode.hidden) hideThHelpTip();
        else show();
      });
    });
  }

  function updateIwStatsCompact() {
    setStatsCompact('iwStats', tableHasDataRows('iwTable') ? 1 : 0);
  }

  function updateGamStatsCompact() {
    setStatsCompact('gamStats', tableHasDataRows('gamTable') ? 1 : 0);
  }

  function addThHelp(th, tip) {
    if (!th || th.querySelector('.fd-th-help')) return;
    th.setAttribute('aria-label', (th.textContent || '').trim() + '. ' + tip);
    var hint = document.createElement('span');
    hint.className = 'fd-th-help';
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = '?';
    th.appendChild(hint);
  }

  function enhanceTableHeaders() {
    var iwHead = document.querySelector('#iwTable thead tr');
    if (iwHead) {
      var iwThs = iwHead.querySelectorAll('th');
      if (iwThs[3]) {
        addThHelp(
          iwThs[3],
          'Percentuale di probabilità che un dipendente vinca il premio a ogni tentativo.'
        );
      }
    }
    var gamHead = document.querySelector('#gamTable thead tr');
    if (gamHead) {
      var gamThs = gamHead.querySelectorAll('th');
      var podioTip =
        'Soglia podio: premio assegnato se la sfida viene completata entro il tempo indicato (secondi).';
      if (gamThs[2]) addThHelp(gamThs[2], 'Premio oro. ' + podioTip);
      if (gamThs[3]) addThHelp(gamThs[3], 'Premio argento. ' + podioTip);
      if (gamThs[4]) addThHelp(gamThs[4], 'Premio bronzo. ' + podioTip);
    }
  }

  function enhanceStatsGrid(gridId) {
    var grid = document.getElementById(gridId);
    if (!grid || grid.dataset.fdDsStats === '1') return;
    grid.dataset.fdDsStats = '1';
    grid.classList.add('fd-stat-grid', 'fd-reward-stat-grid');
    grid.querySelectorAll('.stat-card').forEach(function (card) {
      card.classList.add('fd-stat-card');
      var label = card.querySelector('.stat-label');
      if (label) label.classList.add('fd-stat-card__label');
      var value = card.querySelector('.stat-value');
      if (value) value.classList.add('fd-stat-card__value');
    });
  }

  function enhanceRewardSectionDesign() {
    var section = document.getElementById('instant-win');
    if (!section || section.dataset.fdDsSection === '1') return;
    section.dataset.fdDsSection = '1';
    section.classList.add('instant-win--fd-ds');

    var title = section.querySelector('h1.page-title, h1.sec-title');
    var blurb = section.querySelector('#iwPageBlurb, :scope > p');
    if (title && !title.closest('.fd-page-header')) {
      var header = document.createElement('header');
      header.className = 'fd-page-header fd-reward-header';
      var copy = document.createElement('div');
      copy.className = 'fd-page-header__copy';
      copy.appendChild(title);
      title.classList.add('fd-page-header__title');
      if (blurb) {
        blurb.classList.add('fd-page-header__lead', 'fd-reward-lead');
        blurb.style.color = '';
        blurb.style.fontSize = '';
        blurb.style.marginBottom = '';
        copy.appendChild(blurb);
      }
      header.appendChild(copy);
      section.insertBefore(header, section.firstChild);
    }

    enhanceStatsGrid('iwStats');

    var toolbar = section.querySelector(':scope > div[style*="justify-content"]');
    var listTitle = toolbar?.querySelector('.sec-title');
    var createBtn = section.querySelector('[onclick*="openIwModal"]');
    if (toolbar && listTitle && !toolbar.classList.contains('fd-toolbar')) {
      toolbar.classList.add('fd-toolbar', 'fd-reward-toolbar');
      toolbar.style.display = '';
      toolbar.style.justifyContent = '';
      toolbar.style.alignItems = '';
      toolbar.style.marginBottom = '';
      listTitle.classList.add('fd-reward-list-title');
      if (createBtn) {
        createBtn.classList.add('fd-btn', 'fd-btn--primary');
      }
    }

    wrapRewardTable();
    enhanceRewardModal();
  }

  function wrapRewardTable() {
    var table = document.getElementById('iwTable');
    if (!table || table.closest('.fd-table-wrap, .fd-reward-table-wrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'fd-table-wrap fd-reward-table-wrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
    table.classList.add('fd-table');
  }

  function enhanceRewardModal() {
    var modal = document.getElementById('iwModal');
    if (!modal || modal.dataset.fdDsModal === '1') return;
    modal.dataset.fdDsModal = '1';
    if (!modal.classList.contains('modal')) modal.classList.add('modal');
    var panel = modal.querySelector('.modal-content');
    if (panel) panel.classList.add('fd-card', 'fd-reward-modal');
    modal.querySelectorAll('[onclick*="closeIwModal"]').forEach(function (btn) {
      btn.classList.add('fd-btn', 'fd-btn--ghost', 'fd-btn--sm');
      btn.classList.remove('sec');
    });
    modal.querySelectorAll('[onclick*="saveIwCampaign"]').forEach(function (btn) {
      btn.classList.add('fd-btn', 'fd-btn--primary', 'fd-reward-modal-save');
    });
  }

  function renderRewardTableSkeleton() {
    return (
      '<tr class="table-skeleton-row" aria-hidden="true">' +
      '<td colspan="8">' +
      '<div class="fd-reward-table-skeleton fd-loading-region" aria-busy="true" aria-live="polite">' +
      '<span class="fd-skeleton" style="display:block;width:100%;height:160px;border-radius:12px"></span>' +
      '</div></td></tr>'
    );
  }

  function showRewardLoadingState() {
    var tbody = document.querySelector('#iwTable tbody');
    if (tbody) tbody.innerHTML = renderRewardTableSkeleton();
    var section = document.getElementById('instant-win');
    if (section) section.classList.add('fd-reward--loading');
  }

  function clearRewardLoadingState() {
    var section = document.getElementById('instant-win');
    if (section) section.classList.remove('fd-reward--loading');
  }

  function enhanceRewardRowActions() {
    document.querySelectorAll('#iwTable tbody tr').forEach(function (tr) {
      if (tr.classList.contains('table-skeleton-row') || tr.classList.contains('table-empty-row')) return;
      var actions = tr.querySelector('td:last-child');
      if (!actions || actions.dataset.fdDsActions === '1') return;
      var modBtn = actions.querySelector('[onclick*="editIwCampaign"]');
      var delBtn = actions.querySelector('[onclick*="deleteIwCampaign"]');
      if (!modBtn || !delBtn) return;
      actions.dataset.fdDsActions = '1';
      actions.classList.add('fd-reward-row-actions');
      modBtn.classList.add('fd-btn', 'fd-btn--primary', 'fd-btn--sm');
      delBtn.classList.add('fd-btn', 'fd-btn--ghost', 'fd-btn--sm', 'fd-reward-row-delete');
      modBtn.classList.remove('sec');
      delBtn.classList.remove('sec');
      modBtn.style.fontSize = '';
      modBtn.style.padding = '';
      delBtn.style.fontSize = '';
      delBtn.style.padding = '';
      delBtn.style.color = '';
    });
  }

  function enhanceRewardDom() {
    enhanceRewardSectionDesign();
    enhanceStatsGrid('iwStats');
    wrapRewardTable();
    var table = document.getElementById('iwTable');
    if (table) table.classList.add('fd-table');
    enhanceRewardRowActions();
    enhanceTableHeaders();
    bindThHelpTooltips();
    updateIwStatsCompact();
    syncEngagementTableHead('iwTable');
    if (typeof window.fdEnhanceResponsiveTables === 'function') {
      window.fdEnhanceResponsiveTables();
    }
    if (typeof window.fdInjectSectionFlowBar === 'function') {
      window.fdInjectSectionFlowBar('instant-win');
    }
  }

  function enhanceChallengeSectionDesign() {
    var section = document.getElementById('gamification');
    if (!section || section.dataset.fdDsSection === '1') return;
    section.dataset.fdDsSection = '1';
    section.classList.add('gamification--fd-ds');

    var title = section.querySelector('h1.page-title, h1.sec-title');
    var blurb = section.querySelector('#gamPageBlurb, :scope > p');
    if (title && !title.closest('.fd-page-header')) {
      var header = document.createElement('header');
      header.className = 'fd-page-header fd-challenge-header';
      var copy = document.createElement('div');
      copy.className = 'fd-page-header__copy';
      copy.appendChild(title);
      title.classList.add('fd-page-header__title');
      if (blurb) {
        blurb.classList.add('fd-page-header__lead', 'fd-challenge-lead');
        blurb.style.color = '';
        blurb.style.fontSize = '';
        blurb.style.marginBottom = '';
        copy.appendChild(blurb);
      }
      header.appendChild(copy);
      section.insertBefore(header, section.firstChild);
    }

    enhanceStatsGrid('gamStats');

    var toolbar = section.querySelector(':scope > div[style*="justify-content"]');
    var listTitle = toolbar?.querySelector('.sec-title');
    var createBtn = section.querySelector('[onclick*="openGamModal"]');
    if (toolbar && listTitle && !toolbar.classList.contains('fd-toolbar')) {
      toolbar.classList.add('fd-toolbar', 'fd-challenge-toolbar');
      toolbar.style.display = '';
      toolbar.style.justifyContent = '';
      toolbar.style.alignItems = '';
      toolbar.style.marginBottom = '';
      listTitle.classList.add('fd-challenge-list-title');
      if (createBtn) {
        createBtn.classList.add('fd-btn', 'fd-btn--primary');
      }
    }

    wrapChallengeTable();
    enhanceChallengeModal();
  }

  function wrapChallengeTable() {
    var table = document.getElementById('gamTable');
    if (!table || table.closest('.fd-table-wrap, .fd-challenge-table-wrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'fd-table-wrap fd-challenge-table-wrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
    table.classList.add('fd-table');
  }

  function enhanceChallengeModal() {
    var modal = document.getElementById('gamModal');
    if (!modal || modal.dataset.fdDsModal === '1') return;
    modal.dataset.fdDsModal = '1';
    if (!modal.classList.contains('modal')) modal.classList.add('modal');
    var panel = modal.querySelector('.modal-content');
    if (panel) panel.classList.add('fd-card', 'fd-challenge-modal');
    modal.querySelectorAll('[onclick*="closeGamModal"]').forEach(function (btn) {
      btn.classList.add('fd-btn', 'fd-btn--ghost', 'fd-btn--sm');
      btn.classList.remove('sec');
    });
    modal.querySelectorAll('[onclick*="saveGamCampaign"]').forEach(function (btn) {
      btn.classList.add('fd-btn', 'fd-btn--primary', 'fd-challenge-modal-save');
    });
  }

  function renderChallengeTableSkeleton() {
    return (
      '<tr class="table-skeleton-row" aria-hidden="true">' +
      '<td colspan="8">' +
      '<div class="fd-challenge-table-skeleton fd-loading-region" aria-busy="true" aria-live="polite">' +
      '<span class="fd-skeleton" style="display:block;width:100%;height:160px;border-radius:12px"></span>' +
      '</div></td></tr>'
    );
  }

  function showChallengeLoadingState() {
    var tbody = document.querySelector('#gamTable tbody');
    if (tbody) tbody.innerHTML = renderChallengeTableSkeleton();
    var section = document.getElementById('gamification');
    if (section) section.classList.add('fd-challenge--loading');
  }

  function clearChallengeLoadingState() {
    var section = document.getElementById('gamification');
    if (section) section.classList.remove('fd-challenge--loading');
  }

  function enhanceChallengeRowActions() {
    document.querySelectorAll('#gamTable tbody tr').forEach(function (tr) {
      if (tr.classList.contains('table-skeleton-row') || tr.classList.contains('table-empty-row')) return;
      var actions = tr.querySelector('td:last-child');
      if (!actions || actions.dataset.fdDsActions === '1') return;
      var modBtn = actions.querySelector('[onclick*="editGamCampaign"]');
      var delBtn = actions.querySelector('[onclick*="deleteGamCampaign"]');
      if (!modBtn || !delBtn) return;
      actions.dataset.fdDsActions = '1';
      actions.classList.add('fd-challenge-row-actions');
      modBtn.classList.add('fd-btn', 'fd-btn--primary', 'fd-btn--sm');
      delBtn.classList.add('fd-btn', 'fd-btn--ghost', 'fd-btn--sm', 'fd-challenge-row-delete');
      modBtn.classList.remove('sec');
      delBtn.classList.remove('sec');
      modBtn.style.fontSize = '';
      modBtn.style.padding = '';
      delBtn.style.fontSize = '';
      delBtn.style.padding = '';
      delBtn.style.color = '';
    });
  }

  function enhanceChallengeDom() {
    enhanceChallengeSectionDesign();
    enhanceStatsGrid('gamStats');
    wrapChallengeTable();
    var table = document.getElementById('gamTable');
    if (table) table.classList.add('fd-table');
    enhanceChallengeRowActions();
    enhanceTableHeaders();
    bindThHelpTooltips();
    enhanceChallengeStatusBadges();
    updateGamStatsCompact();
    syncEngagementTableHead('gamTable');
    if (typeof window.fdEnhanceResponsiveTables === 'function') {
      window.fdEnhanceResponsiveTables();
    }
    if (typeof window.fdInjectSectionFlowBar === 'function') {
      window.fdInjectSectionFlowBar('gamification');
    }
  }

  function patchLoaders() {
    if (window.__fdRcPatched) return;
    window.__fdRcPatched = true;

    if (typeof window.loadInstantWin === 'function') {
      var origIw = window.loadInstantWin;
      window.loadInstantWin = async function () {
        if (isFilo() && window.brandId) showRewardLoadingState();
        try {
          await origIw.apply(this, arguments);
        } finally {
          clearRewardLoadingState();
        }
        if (isFilo()) {
          var plays = parseInt((document.getElementById('iwStatPlays') || {}).textContent, 10);
          if (!Number.isFinite(plays) || plays <= 0) {
            applyRewardStats(null);
          }
          enhanceRewardDom();
        } else {
          updateIwStatsCompact();
        }
        syncEngagementTableHead('iwTable');
      };
    }
    if (typeof window.loadGamification === 'function') {
      var origGam = window.loadGamification;
      window.loadGamification = async function () {
        if (isFilo() && window.brandId) showChallengeLoadingState();
        try {
          await origGam.apply(this, arguments);
        } finally {
          clearChallengeLoadingState();
        }
        if (isFilo()) enhanceChallengeDom();
        else updateGamStatsCompact();
        syncEngagementTableHead('gamTable');
      };
    }
  }

  function patchNav() {
    if (window.__fdRcNavPatched || typeof window.nav !== 'function') return;
    window.__fdRcNavPatched = true;
    var orig = window.nav;
    window.nav = function (sectionId) {
      var out = orig.apply(this, arguments);
      if (sectionId === 'instant-win' || sectionId === 'gamification') {
        setTimeout(function () {
          if (sectionId === 'instant-win' && isFilo()) {
            enhanceRewardSectionDesign();
            enhanceRewardDom();
          } else if (sectionId === 'gamification' && isFilo()) {
            enhanceChallengeSectionDesign();
            enhanceChallengeDom();
          } else {
            enhanceTableHeaders();
            bindThHelpTooltips();
            if (sectionId === 'instant-win') {
              updateIwStatsCompact();
              syncEngagementTableHead('iwTable');
            } else {
              updateGamStatsCompact();
              syncEngagementTableHead('gamTable');
            }
          }
        }, 120);
      }
      return out;
    };
  }

  function init() {
    if (!isFilo()) return;
    patchLoaders();
    patchNav();
    enhanceRewardSectionDesign();
    enhanceRewardDom();
    enhanceChallengeSectionDesign();
    enhanceChallengeDom();
    enhanceTableHeaders();
    updateGamStatsCompact();
  }

  window.fdInitRewardChallenge = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


/* === fd-analytics.js === */
/**
 * FD — Analytics (FASE 4): DS layout, KPI grid, chart cards, table UX, skeleton loading.
 */
(function () {
  'use strict';

  function isFiloAnalyticsApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function renderStatsSkeleton() {
    function statSkel() {
      return (
        '<div class="fd-stat-card fd-analytics-kpi fd-stat-card--skeleton" aria-hidden="true">' +
        '<span class="fd-skeleton fd-skeleton--text" style="width:72%"></span>' +
        '<span class="fd-skeleton fd-skeleton--title" style="width:38%"></span>' +
        '<span class="fd-skeleton fd-skeleton--text" style="width:88%;margin-top:auto"></span>' +
        '</div>'
      );
    }
    return (
      '<div class="fd-analytics-stats-skeleton" aria-busy="true" aria-live="polite">' +
      '<div class="fd-stat-grid fd-analytics-stat-grid">' +
      statSkel() + statSkel() + statSkel() + statSkel() +
      statSkel() + statSkel() + statSkel() + statSkel() +
      '</div></div>'
    );
  }

  function renderChartSkeleton(height) {
    return (
      '<div class="fd-analytics-chart-skeleton" aria-busy="true">' +
      '<span class="fd-skeleton" style="display:block;width:100%;height:' + (height || 220) +
      'px;border-radius:var(--fd-radius-md,12px)"></span></div>'
    );
  }

  function findAnalyticsTitleEl() {
    return document.querySelector(
      '#analytics h1.page-title, #analytics h1.sec-title, #analytics h1.page-header__title, #analytics .fd-page-header__title'
    );
  }

  function resolveAnalyticsChromeTab(tab) {
    if (tab === 'activity-log' || tab === 'metrics') return tab;
    if (typeof window.getAnalyticsSectionTab === 'function') {
      var detected = window.getAnalyticsSectionTab();
      if (detected === 'activity-log' || detected === 'metrics') return detected;
    }
    var activeNav = document.querySelector('.nav-item.active[data-section-id="activity-log"]');
    if (activeNav) return 'activity-log';
    var path = String(window.location.pathname || '');
    if (/\/analytics\/log\/?$/i.test(path)) return 'activity-log';
    return 'metrics';
  }

  function syncAnalyticsHrChrome(tab) {
    if (!isFiloAnalyticsApp()) return;
    tab = resolveAnalyticsChromeTab(tab);

    var tabsBar = document.getElementById('analyticsSectionTabs');
    if (tabsBar) tabsBar.hidden = true;

    var titleText = tab === 'activity-log' ? 'Log Attività' : 'Analytics';
    var h1 = findAnalyticsTitleEl();
    if (h1) h1.textContent = titleText;

    var lead = document.querySelector('#analytics .fd-analytics-lead');
    if (lead) {
      lead.textContent =
        tab === 'activity-log'
          ? 'Cronologia eventi pass, download, push e azioni sul wallet.'
          : 'Metriche pass, installazioni wallet e andamento campagne per monitorare l\'adozione HR.';
    }
  }

  function enhanceAnalyticsSectionDesign() {
    var section = document.getElementById('analytics');
    if (!section || section.dataset.fdDsSection === '1') return;
    section.dataset.fdDsSection = '1';
    section.classList.add('analytics--fd-ds');

    var title = findAnalyticsTitleEl();
    if (title && !title.closest('.fd-page-header')) {
      var header = document.createElement('header');
      header.className = 'fd-page-header fd-analytics-header';
      var copy = document.createElement('div');
      copy.className = 'fd-page-header__copy';
      copy.appendChild(title);
      title.classList.add('fd-page-header__title');
      var lead = document.createElement('p');
      lead.className = 'fd-page-header__lead fd-analytics-lead';
      lead.textContent =
        'Metriche pass, installazioni wallet e andamento campagne per monitorare l\'adozione HR.';
      copy.appendChild(lead);
      header.appendChild(copy);
      section.insertBefore(header, section.firstChild);
    }

    var tabs = section.querySelector('#analyticsSectionTabs');
    if (tabs) tabs.classList.add('fd-analytics-tabs');

    var perfTitle = section.querySelector('#analyticsTabPanel_metrics > .sec-title');
    if (perfTitle) perfTitle.classList.add('fd-analytics-section-title');

    enhanceAnalyticsCards();
    enhanceAnalyticsToolbars();
    wrapCampaignTable();
    enhanceActivityLogPanel();
  }

  function enhanceStatsGrid() {
    var grid = document.getElementById('analyticsStats');
    if (!grid || !grid.querySelector('.stat-card, .fd-stat-card')) return;
    grid.classList.add('fd-stat-grid', 'fd-analytics-stat-grid');
    grid.querySelectorAll('.stat-card').forEach(function (card) {
      if (card.classList.contains('fd-analytics-kpi')) return;
      card.classList.add('fd-stat-card', 'fd-analytics-kpi');
      var label = card.querySelector('.stat-label');
      if (label) label.classList.add('fd-stat-card__label');
      var value = card.querySelector('.stat-value');
      if (value) value.classList.add('fd-stat-card__value');
      var legacyHints = card.querySelectorAll('div[style*="font-size:11px"], div[style*="font-size: 11px"]');
      if (legacyHints.length) {
        legacyHints.forEach(function (hint) {
          hint.classList.add('fd-stat-card__hint');
          hint.style.fontSize = '';
          hint.style.color = '';
          hint.style.marginTop = '';
        });
      } else if (!card.querySelector('.fd-stat-card__hint')) {
        var emptyHint = document.createElement('p');
        emptyHint.className = 'fd-stat-card__hint fd-stat-card__hint--empty';
        emptyHint.setAttribute('aria-hidden', 'true');
        emptyHint.textContent = '\u00A0';
        card.appendChild(emptyHint);
      }
    });
  }

  function enhanceAnalyticsCards() {
    var panel = document.getElementById('analyticsTabPanel_metrics');
    if (!panel) return;
    panel.querySelectorAll(':scope > .form-row .card, :scope > .card').forEach(function (card) {
      if (card.dataset.fdDsCard === '1') return;
      card.dataset.fdDsCard = '1';
      card.classList.add('fd-card', 'fd-analytics-card');
      card.style.marginBottom = '';
    });
  }

  function enhanceAnalyticsToolbars() {
    document.querySelectorAll('#analytics .analytics-toolbar').forEach(function (bar) {
      if (bar.dataset.fdDsToolbar === '1') return;
      bar.dataset.fdDsToolbar = '1';
      bar.classList.add('fd-toolbar', 'fd-analytics-toolbar');
      var title = bar.querySelector('.sec-title');
      if (title) title.classList.add('fd-analytics-toolbar__title');
      var actions = bar.querySelector('.analytics-actions');
      if (actions) actions.classList.add('fd-analytics-toolbar__actions');

      bar.querySelectorAll('.analytics-chip').forEach(function (chip) {
        chip.classList.add('fd-analytics-chip');
      });
      bar.querySelectorAll('.btn.small.sec, .btn.sec.small').forEach(function (btn) {
        if (!btn.classList.contains('small')) btn.classList.add('small');
      });
      bar.querySelectorAll('#analyticsTrendRange, .analytics-date').forEach(function (el) {
        el.classList.add('fd-analytics-control');
      });
    });
  }

  function wrapCampaignTable() {
    var table = document.getElementById('campaignAnalyticsTable');
    if (!table || table.closest('.fd-table-wrap, .fd-analytics-table-wrap')) return;
    var wrap = document.createElement('div');
    wrap.className = 'fd-table-wrap fd-analytics-table-wrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
    table.classList.add('fd-table');
  }

  function enhanceActivityLogPanel() {
    var panel = document.getElementById('activity-log');
    if (!panel) return;
    panel.classList.add('activity-log--fd');

    var introRow = panel.querySelector(':scope > div[style*="justify-content"]');
    if (introRow && !introRow.classList.contains('fd-toolbar')) {
      introRow.classList.add('fd-toolbar', 'fd-analytics-activity-toolbar');
      introRow.style.display = '';
      introRow.style.justifyContent = '';
      introRow.style.alignItems = '';
      introRow.style.flexWrap = '';
      introRow.style.gap = '';
      introRow.style.marginBottom = '';
      var intro = introRow.querySelector('p');
      if (intro) {
        intro.classList.add('fd-analytics-activity-lead');
        intro.style.fontSize = '';
        intro.style.color = '';
        intro.style.margin = '';
        intro.style.maxWidth = '';
        intro.style.lineHeight = '';
      }
      introRow.querySelectorAll('.btn').forEach(function (btn) {
        if (btn.id === 'fdActivityLogExportBtn') return;
        btn.classList.add('small', 'sec');
      });
    }

    var tableWrap = panel.querySelector('.pass-table-wrap');
    if (tableWrap && !tableWrap.classList.contains('fd-table-wrap')) {
      tableWrap.classList.add('fd-table-wrap', 'fd-analytics-activity-table-wrap');
    }
    var table = document.getElementById('activityLogTable');
    if (table) table.classList.add('fd-table');
  }

  function showAnalyticsLoadingState() {
    var stats = document.getElementById('analyticsStats');
    if (stats) stats.innerHTML = renderStatsSkeleton();
    ['analyticsTrendChart', 'analyticsWalletSplit', 'analyticsTopCampaigns'].forEach(function (id, i) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = renderChartSkeleton(i === 1 ? 180 : 220);
    });
    var tbody = document.querySelector('#campaignAnalyticsTable tbody');
    if (tbody) {
      tbody.innerHTML = typeof window.renderTableSkeletonRows === 'function'
        ? window.renderTableSkeletonRows(4, 6)
        : '<tr><td colspan="6"><div class="fd-analytics-chart-skeleton" aria-busy="true">' +
          '<span class="fd-skeleton" style="display:block;width:100%;height:120px;border-radius:12px"></span></div></td></tr>';
    }
    var section = document.getElementById('analytics');
    if (section) section.classList.add('fd-analytics--loading');
  }

  function clearAnalyticsLoadingState() {
    var section = document.getElementById('analytics');
    if (section) section.classList.remove('fd-analytics--loading');
  }

  function enhanceAnalyticsDom() {
    enhanceAnalyticsSectionDesign();
    enhanceStatsGrid();
    enhanceAnalyticsCards();
    enhanceAnalyticsToolbars();
    wrapCampaignTable();
    enhanceActivityLogPanel();
    syncAnalyticsHrChrome();
    if (typeof window.fdEnhanceResponsiveTables === 'function') {
      window.fdEnhanceResponsiveTables();
    }
    if (typeof window.fdInjectSectionFlowBar === 'function') {
      var tab =
        typeof window.getAnalyticsSectionTab === 'function' ? window.getAnalyticsSectionTab() : 'metrics';
      window.fdInjectSectionFlowBar(tab === 'activity-log' ? 'activity-log' : 'analytics');
    }
  }

  function patchAnalyticsSubnav() {
    if (window.__fdAnalyticsSubnavPatched || typeof window.switchAnalyticsSectionTab !== 'function') return;
    window.__fdAnalyticsSubnavPatched = true;
    var orig = window.switchAnalyticsSectionTab;
    window.switchAnalyticsSectionTab = function (tab, options) {
      var active = orig.apply(this, arguments);
      if (isFiloAnalyticsApp()) {
        syncAnalyticsHrChrome(active || tab);
        requestAnimationFrame(function () {
          syncAnalyticsHrChrome(active || tab);
        });
      }
      return active;
    };
  }

  function patchLoader() {
    if (typeof window.loadAnalytics !== 'function') return;
    if (window.__fdAnalyticsLoadAnalyticsPatched) return;
    window.__fdAnalyticsLoadAnalyticsPatched = true;

    var orig = window.loadAnalytics;
    window.loadAnalytics = async function () {
      if (isFiloAnalyticsApp() && window.brandId) showAnalyticsLoadingState();
      try {
        await orig.apply(this, arguments);
      } finally {
        clearAnalyticsLoadingState();
      }
      if (isFiloAnalyticsApp()) enhanceAnalyticsDom();
    };
  }

  function patchNav() {
    if (window.__fdAnalyticsNavPatched || typeof window.nav !== 'function') return;
    window.__fdAnalyticsNavPatched = true;
    var orig = window.nav;
    window.nav = function (sectionId, options) {
      var out = orig.apply(this, arguments);
      options = options || {};
      var resolved = typeof window.resolveNavTarget === 'function'
        ? window.resolveNavTarget(sectionId, options)
        : { section: sectionId, tab: options.tab || '' };
      if (resolved.section === 'analytics' || sectionId === 'analytics' || sectionId === 'activity-log') {
        setTimeout(function () {
          if (!isFiloAnalyticsApp()) return;
          enhanceAnalyticsDom();
          syncAnalyticsHrChrome(resolved.tab || (sectionId === 'activity-log' ? 'activity-log' : 'metrics'));
        }, 120);
      }
      return out;
    };
  }

  function patchApplyNavNaming() {
    if (window.__fdAnalyticsNavNamingPatched || !window.FD_NAV) return;
    window.__fdAnalyticsNavNamingPatched = true;
    var orig = window.FD_NAV.applyNavNaming;
    if (typeof orig !== 'function') return;
    window.FD_NAV.applyNavNaming = function () {
      var out = orig.apply(this, arguments);
      if (isFiloAnalyticsApp()) {
        syncAnalyticsHrChrome();
        requestAnimationFrame(function () {
          syncAnalyticsHrChrome();
        });
      }
      return out;
    };
  }

  function init() {
    if (!isFiloAnalyticsApp()) return;
    patchLoader();
    patchAnalyticsSubnav();
    patchNav();
    patchApplyNavNaming();
    enhanceAnalyticsDom();
  }

  window.fdInitAnalytics = init;
  window.fdSyncAnalyticsHrChrome = syncAnalyticsHrChrome;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


/* === fd-audiences.js === */
/**
 * FD — Audience: fix tab Comportamento layout, KPI grid consistency.
 */
(function () {
  'use strict';

  function isFilo() {
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function escHtml(s) {
    if (typeof window.esc === 'function') return window.esc(s);
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function statCard(num, label) {
    return (
      '<div class="stat-card">' +
      '<div class="stat-num">' + escHtml(num) + '</div>' +
      '<div class="stat-label">' + escHtml(label) + '</div>' +
      '</div>'
    );
  }

  function renderBehaviorStatsHtml(b, f, days) {
    return (
      '<div class="fd-aud-behavior-metrics">' +
      '<header class="fd-aud-behavior-head">' +
      '<p class="fd-aud-behavior-head__label">Eventi (' + escHtml(days) + ' gg)</p>' +
      '<p class="fd-aud-behavior-head__value">' + escHtml(b.total_events ?? 0) + '</p>' +
      '</header>' +
      '<div class="stats-grid fd-aud-behavior-grid">' +
      statCard(b.unique_holders_active ?? 0, 'Possessori attivi') +
      statCard(f.opened ?? 0, 'Aperture pass') +
      statCard(f.link_clicks ?? 0, 'Clic link retro') +
      statCard(f.unique_clickers ?? 0, 'Utenti unici clic') +
      '</div></div>'
    );
  }

  function renderLinkFunnels(funnels) {
    if (!funnels.length) {
      return '<span>Nessun clic per link nel periodo. Rigenera i pass per attivare il tracking.</span>';
    }
    return funnels.map(function (item) {
      return (
        '<div class="fd-aud-funnel-row" style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border);">' +
        '<strong>' + escHtml(item.target_label || item.target_key) + '</strong> ' +
        '<span style="color:var(--text2);font-size:11px;">(' + escHtml(item.target_key) + ')</span>' +
        '<div class="fd-aud-funnel-grid">' +
        '<div><strong>' + escHtml(item.pass_holders) + '</strong><span>Pass</span></div>' +
        '<div><strong>' + escHtml(item.installed) + '</strong><span>Install.</span></div>' +
        '<div><strong>' + escHtml(item.opened) + '</strong><span>Aperti</span></div>' +
        '<div><strong>' + escHtml(item.unique_clickers) + '</strong><span>Clic unici</span></div>' +
        '<div><strong>' + escHtml(item.ctr_from_opened_pct) + '%</strong><span>CTR/Aperti</span></div>' +
        '</div></div>'
      );
    }).join('');
  }

  async function loadAudienceBehaviorFixed() {
    var brandId = typeof window.ensureBrandIdFromContext === 'function'
      ? window.ensureBrandIdFromContext()
      : window.brandId;
    if (!brandId) return;

    var statsHost = document.getElementById('audienceBehaviorStats');
    if (!statsHost) return;
    statsHost.classList.remove('stats-grid');
    statsHost.classList.add('fd-aud-behavior-stats-host');

    try {
      var days = document.getElementById('audBehaviorDays')?.value || 30;
      var api = typeof window.API === 'string' && window.API ? window.API : '/api/v1';
      var headers = typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : {};
      var res = await fetch(api + '/brands/' + encodeURIComponent(brandId) + '/audiences/insights?days=' + encodeURIComponent(days), {
        headers: headers
      });
      var data = res.ok ? await res.json() : {};
      var b = data.behavior || {};
      var f = b.funnel || {};

      statsHost.innerHTML = renderBehaviorStatsHtml(b, f, days);

      var funnelsEl = document.getElementById('audienceLinkFunnels');
      if (funnelsEl) funnelsEl.innerHTML = renderLinkFunnels(b.link_funnels || []);

      var links = b.top_link_clicks || [];
      var linksEl = document.getElementById('audienceTopLinks');
      if (linksEl) {
        linksEl.innerHTML = links.length
          ? links.map(function (l) {
            return (
              '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);">' +
              '<span>' + escHtml(l.target_label || l.target_key || 'Link') +
              ' <span style="color:var(--text2);font-size:11px;">' + escHtml((l.target_url || '').slice(0, 40)) + '</span></span>' +
              '<strong>' + escHtml(l.clicks) + '</strong></div>'
            );
          }).join('')
          : '<span>Nessun clic registrato ancora. I nuovi pass tracciano i link del retro.</span>';
      }

      var evRes = await fetch(api + '/brands/' + encodeURIComponent(brandId) + '/holder-events?limit=40', {
        headers: headers
      });
      var events = evRes.ok ? await evRes.json() : [];
      var eventsEl = document.getElementById('audienceRecentEvents');
      if (eventsEl) {
        eventsEl.innerHTML = events.length
          ? events.map(function (e) {
            return (
              '<div style="padding:6px 0;border-bottom:1px solid var(--border);">' +
              '<span style="color:var(--teal);">' + escHtml(e.event_action) + '</span>' +
              (e.target_label ? ' · ' + escHtml(e.target_label) : '') +
              '<span style="float:right;color:var(--text2);">' +
              (e.created_at ? new Date(e.created_at).toLocaleString('it-IT') : '') +
              '</span></div>'
            );
          }).join('')
          : 'Nessun evento';
      }
    } catch (e) {
      console.error('[fd-audiences] loadAudienceBehavior', e);
      statsHost.innerHTML =
        '<p style="color:var(--text2);margin:0;">Metriche comportamento non disponibili al momento.</p>';
    }
  }

  function enhanceBehaviorPanel() {
    var panel = document.getElementById('audPanel_behavior');
    if (!panel || panel.dataset.fdAudEnhanced === '1') return;
    panel.dataset.fdAudEnhanced = '1';

    var toolbarRow = panel.querySelector('div[style*="justify-content:flex-end"]');
    if (toolbarRow && !panel.querySelector('.fd-aud-behavior-toolbar')) {
      toolbarRow.className = 'fd-aud-behavior-toolbar';
      var select = toolbarRow.querySelector('#audBehaviorDays');
      var exportBtn = toolbarRow.querySelector('button');
      toolbarRow.innerHTML = '';
      var actions = document.createElement('div');
      actions.className = 'fd-aud-behavior-toolbar__actions';
      if (select) actions.appendChild(select);
      if (exportBtn) actions.appendChild(exportBtn);
      toolbarRow.appendChild(actions);
    }

    var statsHost = document.getElementById('audienceBehaviorStats');
    if (statsHost) {
      statsHost.classList.remove('stats-grid');
      statsHost.classList.add('fd-aud-behavior-stats-host');
    }
  }

  function patchAudienceLoaders() {
    if (window.__fdAudiencesPatched) return;
    window.__fdAudiencesPatched = true;
    window.loadAudienceBehavior = loadAudienceBehaviorFixed;
  }

  function patchNav() {
    if (window.__fdAudiencesNavPatched || typeof window.nav !== 'function') return;
    window.__fdAudiencesNavPatched = true;
    var orig = window.nav;
    window.nav = function (sectionId, options) {
      var out = orig.apply(this, arguments);
      options = options || {};
      var resolved = typeof window.resolveNavTarget === 'function'
        ? window.resolveNavTarget(sectionId, options)
        : { section: sectionId, tab: options.tab || '' };
      var isAudience = sectionId === 'audiences'
        || (resolved.section === 'leads' && resolved.tab === 'audience');
      if (isAudience) {
        setTimeout(function () {
          enhanceBehaviorPanel();
          if (document.getElementById('audPanel_behavior')?.style.display !== 'none') {
            loadAudienceBehaviorFixed();
          }
        }, 80);
      }
      return out;
    };
  }

  function init() {
    if (!isFilo()) return;
    var section = document.getElementById('audiences');
    if (section) section.classList.add('audiences--fd');
    patchAudienceLoaders();
    patchNav();
    enhanceBehaviorPanel();
  }

  window.fdInitAudiences = init;
  window.fdLoadAudienceBehavior = loadAudienceBehaviorFixed;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


/* === fd-conventions.js === */
/**
 * FD — HUB Convenzioni (Sprint 4): HR dashboard merchant management, analytics, settings.
 */
(function (global) {
  'use strict';

  var HUB_CATEGORIES = [
    { id: 'food', label: 'Alimentare' },
    { id: 'fitness', label: 'Fitness' },
    { id: 'retail', label: 'Retail' },
    { id: 'salute', label: 'Salute' },
    { id: 'viaggi', label: 'Viaggi' },
    { id: 'tech', label: 'Tech' },
    { id: 'servizi', label: 'Servizi' },
    { id: 'altro', label: 'Altro' }
  ];

  var state = {
    merchants: [],
    analytics: null,
    settings: null,
    tab: 'merchants',
    filterCategory: '',
    filterMerchantId: '',
    editingId: null
  };

  function isFiloConventionsApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (global.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function apiBase() {
    return typeof global.API === 'string' ? global.API : '/api/v1';
  }

  function brandId() {
    return global.brandId || null;
  }

  function authHeaders() {
    if (typeof global.getDashboardFetchHeaders === 'function') return global.getDashboardFetchHeaders();
    if (typeof global.getAuthHeaders === 'function') return global.getAuthHeaders();
    return {};
  }

  function toast(msg) {
    if (typeof global.toast === 'function') global.toast(msg);
  }

  function categoryLabel(id) {
    var found = HUB_CATEGORIES.filter(function (c) { return c.id === id; })[0];
    return found ? found.label : id;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function enhanceConventionsSectionDesign() {
    var section = document.getElementById('conventions');
    if (!section || section.dataset.fdDsSection === '1') return;
    section.dataset.fdDsSection = '1';
    section.classList.add('conventions--fd-ds');

    var title = section.querySelector('h1.page-title, h1.sec-title');
    var blurb = section.querySelector('#conventionsPageBlurb, .fd-conventions-lead');
    if (title && !title.closest('.fd-page-header')) {
      var header = document.createElement('header');
      header.className = 'fd-page-header fd-conventions-header';
      var copy = document.createElement('div');
      copy.className = 'fd-page-header__copy';
      copy.appendChild(title);
      title.classList.add('fd-page-header__title');
      if (blurb) {
        blurb.classList.add('fd-page-header__lead', 'fd-conventions-lead');
        blurb.style.color = '';
        blurb.style.fontSize = '';
        blurb.style.marginBottom = '';
        copy.appendChild(blurb);
      } else {
        var lead = document.createElement('p');
        lead.className = 'fd-page-header__lead fd-conventions-lead';
        lead.textContent =
          'Gestisci le convenzioni aziendali, monitora gli utilizzi aggregati e personalizza l\'Hub per i dipendenti.';
        copy.appendChild(lead);
      }
      header.appendChild(copy);
      section.insertBefore(header, section.firstChild);
    }

    var tabs = section.querySelector('#conventionsSectionTabs');
    if (tabs) tabs.classList.add('fd-conventions-tabs');
  }

  function getConventionsTab() {
    var panel = document.getElementById('conventionsTabPanel_settings');
    if (panel && !panel.hidden) return 'settings';
    panel = document.getElementById('conventionsTabPanel_guide');
    if (panel && !panel.hidden) return 'guide';
    panel = document.getElementById('conventionsTabPanel_onboarding');
    if (panel && !panel.hidden) return 'onboarding';
    return 'merchants';
  }

  function setConventionsTabUi(tab) {
    ['merchants', 'onboarding', 'settings', 'guide'].forEach(function (t) {
      var btn = document.getElementById('conventionsTab_' + t);
      var panel = document.getElementById('conventionsTabPanel_' + t);
      var on = t === tab;
      if (btn) {
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        btn.tabIndex = on ? 0 : -1;
      }
      if (panel) {
        panel.hidden = !on;
        panel.setAttribute('aria-hidden', on ? 'false' : 'true');
      }
    });
    state.tab = tab;
  }

  function switchConventionsTab(tab, options) {
    options = options || {};
    tab = tab || 'merchants';
    setConventionsTabUi(tab);
    if (!options.skipLoad) {
      if (tab === 'settings') loadHubSettingsForm();
      else if (tab === 'merchants') renderMerchantsTable();
    }
    if (typeof global.fdRbacHook === 'function') global.fdRbacHook('conventions');
  }

  function renderAnalyticsKpiSkeleton() {
    var host = document.getElementById('hubConventionsKpis');
    if (!host) return;
    host.classList.add('fd-conventions-kpi-grid--loading');
    state.analytics = null;
    renderAnalyticsKpis();
  }

  function renderAnalyticsKpis() {
    var host = document.getElementById('hubConventionsKpis');
    if (!host) return;
    var a = state.analytics;
    var te = (a && a.total_events) || {};
    var engagementItems = [
      { label: 'Eventi totali', value: te.total || 0, primary: true },
      { label: 'Visualizzazioni', value: te.view || 0 },
      { label: 'Click sito', value: te.click_site || 0 },
      { label: 'Copy codice', value: te.copy_code || 0 }
    ];
    var qrItems = [
      { label: 'QR mostrati', value: te.show_qr || 0 },
      { label: 'QR scansionati', value: te.scan_qr || 0 }
    ];

    function renderGroup(title, items) {
      return (
        '<section class="fd-conventions-kpi-group" aria-label="' + escapeHtml(title) + '">' +
        '<h3 class="fd-conventions-kpi-group__title">' + escapeHtml(title) + '</h3>' +
        '<div class="fd-conventions-kpi-group__grid">' +
        items.map(function (item) {
          var cls = 'fd-conventions-kpi' + (item.primary ? ' fd-conventions-kpi--primary' : '');
          return (
            '<div class="' + cls + '">' +
            '<div class="fd-conventions-kpi__label">' + escapeHtml(item.label) + '</div>' +
            '<div class="fd-conventions-kpi__value">' + escapeHtml(String(item.value)) + '</div>' +
            '</div>'
          );
        }).join('') +
        '</div></section>'
      );
    }

    host.classList.remove('fd-conventions-kpi-grid--loading');
    host.innerHTML =
      '<div class="fd-conventions-kpi-groups">' +
      renderGroup('Engagement', engagementItems) +
      renderGroup('QR in negozio', qrItems) +
      '</div>';
  }

  function merchantStatsSummary(merchantId) {
    if (!state.analytics || !Array.isArray(state.analytics.by_merchant)) return '—';
    var row = state.analytics.by_merchant.filter(function (m) {
      return m.merchant_id === merchantId;
    })[0];
    if (!row || !row.total) return '0 evt';
    return row.total + ' evt · ' + (row.views || 0) + ' view';
  }

  function filteredMerchants() {
    return state.merchants.filter(function (m) {
      if (state.filterCategory && m.category !== state.filterCategory) return false;
      if (state.filterMerchantId && m.id !== state.filterMerchantId) return false;
      return true;
    });
  }

  function renderMerchantsTable() {
    var tbody = document.querySelector('#hubMerchantsTable tbody');
    if (!tbody) return;
    var rows = filteredMerchants();
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="6" style="color:var(--text2);padding:24px;text-align:center">' +
        'Nessun merchant. Aggiungi manualmente o importa da CSV.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (m) {
      var activeBadge = m.active !== false
        ? '<span class="fd-conventions-badge fd-conventions-badge--active">Attivo</span>'
        : '<span class="fd-conventions-badge fd-conventions-badge--inactive">Disattivo</span>';
      return (
        '<tr data-merchant-id="' + escapeHtml(m.id) + '">' +
        '<td><strong>' + escapeHtml(m.name) + '</strong></td>' +
        '<td>' + escapeHtml(categoryLabel(m.category)) + '</td>' +
        '<td>' + escapeHtml(m.discount_label || '') + '</td>' +
        '<td>' + activeBadge + '</td>' +
        '<td class="fd-conventions-stats-cell">' + escapeHtml(merchantStatsSummary(m.id)) + '</td>' +
        '<td><button type="button" class="btn sec small fd-rbac-write" data-hub-edit="' + escapeHtml(m.id) + '">Modifica</button></td>' +
        '</tr>'
      );
    }).join('');

    tbody.querySelectorAll('[data-hub-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openMerchantModal(btn.getAttribute('data-hub-edit'));
      });
    });

    if (typeof global.FdRbac !== 'undefined' && typeof global.FdRbac.applyReadOnlyMode === 'function') {
      global.FdRbac.applyReadOnlyMode('conventions');
    }
  }

  async function fetchMerchants() {
    var bid = brandId();
    if (!bid) return [];
    var url = apiBase() + '/merchants?brand_id=' + encodeURIComponent(bid);
    var res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error('Errore caricamento merchant');
    return res.json();
  }

  async function fetchHubAnalytics() {
    var bid = brandId();
    if (!bid) return null;
    var url = apiBase() + '/brands/' + encodeURIComponent(bid) + '/hub-analytics?days=30';
    var res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error('Errore caricamento analytics');
    return res.json();
  }

  async function fetchHubSettings() {
    var bid = brandId();
    if (!bid) return null;
    var url = apiBase() + '/brands/' + encodeURIComponent(bid) + '/hub-settings';
    var res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error('Errore caricamento impostazioni Hub');
    return res.json();
  }

  function renderTopMerchants() {
    var host = document.getElementById('hubConventionsTop10');
    if (!host || !state.analytics) return;
    var top = state.analytics.top_10 || [];
    if (!top.length) {
      host.innerHTML = '<p style="color:var(--text2);font-size:13px;margin:0">Nessun utilizzo negli ultimi 30 giorni.</p>';
      return;
    }
    host.innerHTML =
      '<ol style="margin:0;padding-left:20px;font-size:13px;line-height:1.8">' +
      top.map(function (m) {
        return '<li><strong>' + escapeHtml(m.name) + '</strong> — ' + escapeHtml(String(m.total)) + ' attivazioni</li>';
      }).join('') +
      '</ol>';
  }

  function populateCategoryFilter() {
    var sel = document.getElementById('hubMerchantCategoryFilter');
    if (!sel || sel.dataset.fdPopulated === '1') return;
    sel.dataset.fdPopulated = '1';
    HUB_CATEGORIES.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label;
      sel.appendChild(opt);
    });
  }

  function merchantsForCategory(categoryId) {
    if (!categoryId) return state.merchants.slice();
    return state.merchants.filter(function (m) {
      return m.category === categoryId;
    });
  }

  function populateMerchantFilter() {
    var sel = document.getElementById('hubMerchantFilter');
    if (!sel) return;
    var current = sel.value || state.filterMerchantId || '';
    var pool = merchantsForCategory(state.filterCategory);
    sel.innerHTML = '<option value="">Tutti i merchant</option>';
    pool.slice().sort(function (a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''), 'it', { sensitivity: 'base' });
    }).forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name || m.id;
      sel.appendChild(opt);
    });
    if (current && pool.some(function (m) { return m.id === current; })) {
      sel.value = current;
      state.filterMerchantId = current;
    } else {
      sel.value = '';
      state.filterMerchantId = '';
    }
  }

  function populateMerchantFormCategories() {
    var sel = document.getElementById('hubMerchantCategory');
    if (!sel || sel.dataset.fdPopulated === '1') return;
    sel.dataset.fdPopulated = '1';
    HUB_CATEGORIES.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.label;
      sel.appendChild(opt);
    });
  }

  function openMerchantModal(id) {
    state.editingId = id || null;
    var modal = document.getElementById('hubMerchantModal');
    if (!modal) return;
    populateMerchantFormCategories();

    var title = document.getElementById('hubMerchantModalTitle');
    var form = document.getElementById('hubMerchantForm');
    if (!form) return;

    if (id) {
      var m = state.merchants.filter(function (x) { return x.id === id; })[0];
      if (!m) return;
      if (title) title.textContent = 'Modifica merchant';
      form.name.value = m.name || '';
      form.category.value = m.category || 'altro';
      form.discount_label.value = m.discount_label || '';
      form.logo_url.value = m.logo_url || '';
      form.description.value = m.description || '';
      form.conditions.value = m.conditions || '';
      form.valid_until.value = m.valid_until ? String(m.valid_until).slice(0, 10) : '';
      form.online_enabled.checked = !!m.online_enabled;
      form.online_url.value = m.online_url || '';
      form.online_promo_code.value = m.online_promo_code || '';
      form.physical_enabled.checked = !!m.physical_enabled;
      form.active.checked = m.active !== false;
    } else {
      if (title) title.textContent = 'Aggiungi merchant';
      form.reset();
      form.active.checked = true;
      form.category.value = 'fitness';
    }

    modal.classList.add('open');
    modal.style.display = 'flex';
  }

  function closeMerchantModal() {
    var modal = document.getElementById('hubMerchantModal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.style.display = 'none';
    state.editingId = null;
  }

  async function saveMerchantForm(e) {
    if (e) e.preventDefault();
    var bid = brandId();
    if (!bid) return;
    var form = document.getElementById('hubMerchantForm');
    if (!form) return;

    var payload = {
      brand_id: bid,
      name: form.name.value.trim(),
      category: form.category.value,
      discount_label: form.discount_label.value.trim(),
      logo_url: form.logo_url.value.trim() || null,
      description: form.description.value.trim() || null,
      conditions: form.conditions.value.trim() || null,
      valid_until: form.valid_until.value || null,
      online_enabled: form.online_enabled.checked,
      online_url: form.online_url.value.trim() || null,
      online_promo_code: form.online_promo_code.value.trim() || null,
      physical_enabled: form.physical_enabled.checked,
      active: form.active.checked
    };

    if (!payload.name || !payload.discount_label) {
      toast('Nome e sconto sono obbligatori');
      return;
    }

    var url = state.editingId
      ? apiBase() + '/merchants/' + encodeURIComponent(state.editingId)
      : apiBase() + '/merchants';
    var method = state.editingId ? 'PUT' : 'POST';

    try {
      var res = await fetch(url, {
        method: method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Salvataggio fallito');
      toast(state.editingId ? 'Merchant aggiornato' : 'Merchant creato');
      closeMerchantModal();
      await reloadConventionsData();
    } catch (err) {
      toast(err.message || 'Errore salvataggio');
    }
  }

  async function importMerchantsCsv(file) {
    var bid = brandId();
    if (!bid || !file) return;
    var formData = new FormData();
    formData.append('brand_id', bid);
    formData.append('file', file);

    try {
      toast('Import CSV in corso…');
      var res = await fetch(apiBase() + '/merchants/import-csv', {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Import fallito');
      var msg = 'Import completato: ' + (data.imported || 0) + ' merchant';
      if (data.skipped) msg += ', ' + data.skipped + ' saltati';
      toast(msg);
      await reloadConventionsData();
    } catch (err) {
      toast(err.message || 'Errore import CSV');
    }
  }

  function downloadCsvTemplate() {
    var a = document.createElement('a');
    a.href = '/hub-merchant-import-template.csv';
    a.download = 'hub-merchant-import-template.csv';
    a.click();
  }

  function renderSettingsCategories(settings) {
    var host = document.getElementById('hubSettingsCategories');
    if (!host) return;
    var enabled = settings && settings.categories_enabled;
    if (typeof enabled === 'string') {
      try { enabled = JSON.parse(enabled); } catch (_) { enabled = []; }
    }
    if (!Array.isArray(enabled)) enabled = HUB_CATEGORIES.map(function (c) { return c.id; });

    host.innerHTML = HUB_CATEGORIES.map(function (c) {
      var checked = enabled.indexOf(c.id) >= 0 ? ' checked' : '';
      return (
        '<label class="fd-conventions-cat-chip">' +
        '<input type="checkbox" name="hub_cat" value="' + escapeHtml(c.id) + '"' + checked + '> ' +
        escapeHtml(c.label) +
        '</label>'
      );
    }).join('');
  }

  async function loadHubSettingsForm() {
    try {
      state.settings = await fetchHubSettings();
    } catch (err) {
      toast(err.message || 'Errore impostazioni');
      return;
    }
    var s = state.settings || {};
    var logo = document.getElementById('hubSettingsLogoUrl');
    var accent = document.getElementById('hubSettingsAccentColor');
    var welcome = document.getElementById('hubSettingsWelcomeMessage');
    var geo = document.getElementById('hubSettingsGeofencing');
    if (logo) logo.value = s.logo_url || '';
    if (accent) accent.value = s.accent_color || '#8B5CF6';
    if (welcome) welcome.value = s.welcome_message || '';
    if (geo) geo.checked = s.geofencing_enabled !== false;
    renderSettingsCategories(s);
  }

  async function saveHubSettings(e) {
    if (e) e.preventDefault();
    var bid = brandId();
    if (!bid) return;

    var cats = [];
    document.querySelectorAll('#hubSettingsCategories input[name="hub_cat"]:checked').forEach(function (el) {
      cats.push(el.value);
    });

    var payload = {
      logo_url: (document.getElementById('hubSettingsLogoUrl') || {}).value || null,
      accent_color: (document.getElementById('hubSettingsAccentColor') || {}).value || '#8B5CF6',
      welcome_message: (document.getElementById('hubSettingsWelcomeMessage') || {}).value || null,
      geofencing_enabled: !!(document.getElementById('hubSettingsGeofencing') || {}).checked,
      categories_enabled: cats
    };

    try {
      var res = await fetch(apiBase() + '/brands/' + encodeURIComponent(bid) + '/hub-settings', {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Salvataggio fallito');
      state.settings = data;
      toast('Impostazioni Hub salvate');
    } catch (err) {
      toast(err.message || 'Errore salvataggio impostazioni');
    }
  }

  async function reloadConventionsData() {
    renderAnalyticsKpiSkeleton();
    try {
      var results = await Promise.all([
        fetchMerchants(),
        fetchHubAnalytics().catch(function () { return null; })
      ]);
      state.merchants = results[0] || [];
      state.analytics = results[1];
      populateMerchantFilter();
      renderAnalyticsKpis();
      renderTopMerchants();
      renderMerchantsTable();
    } catch (err) {
      toast(err.message || 'Errore caricamento convenzioni');
    }
  }

  function bindConventionsEvents() {
    var section = document.getElementById('conventions');
    if (!section || section.dataset.fdEventsBound === '1') return;
    section.dataset.fdEventsBound = '1';

    populateCategoryFilter();

    var addBtn = document.getElementById('hubMerchantAddBtn');
    if (addBtn) addBtn.addEventListener('click', function () { openMerchantModal(null); });

    var importBtn = document.getElementById('hubMerchantImportBtn');
    var importInput = document.getElementById('hubMerchantCsvInput');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', function () { importInput.click(); });
      importInput.addEventListener('change', function () {
        if (importInput.files && importInput.files[0]) {
          importMerchantsCsv(importInput.files[0]);
          importInput.value = '';
        }
      });
    }

    var templateBtn = document.getElementById('hubMerchantTemplateBtn');
    if (templateBtn) templateBtn.addEventListener('click', downloadCsvTemplate);

    var guideTemplateBtn = document.getElementById('hubGuideTemplateBtn');
    if (guideTemplateBtn) guideTemplateBtn.addEventListener('click', downloadCsvTemplate);

    var onboardingTemplateBtn = document.getElementById('hubOnboardingTemplateBtn');
    if (onboardingTemplateBtn) onboardingTemplateBtn.addEventListener('click', downloadCsvTemplate);

    var catFilter = document.getElementById('hubMerchantCategoryFilter');
    if (catFilter) {
      catFilter.addEventListener('change', function () {
        state.filterCategory = catFilter.value;
        populateMerchantFilter();
        renderMerchantsTable();
      });
    }

    var merchantFilter = document.getElementById('hubMerchantFilter');
    if (merchantFilter) {
      merchantFilter.addEventListener('change', function () {
        state.filterMerchantId = merchantFilter.value;
        renderMerchantsTable();
      });
    }

    var form = document.getElementById('hubMerchantForm');
    if (form) form.addEventListener('submit', saveMerchantForm);

    var settingsForm = document.getElementById('hubSettingsForm');
    if (settingsForm) settingsForm.addEventListener('submit', saveHubSettings);

    var modal = document.getElementById('hubMerchantModal');
    if (modal) {
      modal.querySelectorAll('[data-hub-modal-close]').forEach(function (btn) {
        btn.addEventListener('click', closeMerchantModal);
      });
    }
  }

  async function loadConventionsHub() {
    if (!isFiloConventionsApp()) return;
    enhanceConventionsSectionDesign();
    bindConventionsEvents();
    switchConventionsTab(getConventionsTab(), { skipLoad: true });
    await reloadConventionsData();
    if (state.tab === 'settings') await loadHubSettingsForm();
    if (typeof global.fdRbacHook === 'function') global.fdRbacHook('conventions');
  }

  function initConventionsModule() {
    if (!isFiloConventionsApp()) return;
    enhanceConventionsSectionDesign();
    if (typeof global.fdInjectSectionFlowBar === 'function') {
      global.fdInjectSectionFlowBar('conventions');
    }
  }

  global.switchConventionsTab = switchConventionsTab;
  global.loadConventionsHub = loadConventionsHub;
  global.downloadHubCsvTemplate = downloadCsvTemplate;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initConventionsModule);
  } else {
    initConventionsModule();
  }
})(typeof window !== 'undefined' ? window : global);


/* === fd-pga.js === */
/**
 * FD — PGA Catalog HR dashboard (Sprint 4).
 */
(function (global) {
  'use strict';

  var PGA_CATEGORIES = {
    career: 'Carriera',
    time: 'Tempo',
    learning: 'Formazione',
    softskill: 'Soft skill',
    purpose: 'Purpose',
    brand: 'Brand'
  };

  var BOOKING_STATUS_LABELS = {
    pending: 'In attesa',
    confirmed: 'Confermata',
    delivered: 'Erogata',
    cancelled: 'Annullata'
  };

  var state = {
    settings: null,
    experiences: [],
    bookings: [],
    coinActions: [],
    tab: 'catalog',
    bookingFilter: '',
    editingExperienceId: null,
    expFilterSearch: '',
    expFilterCategory: '',
    expFilterType: '',
    expFilterStatus: ''
  };

  function isFiloPgaApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (global.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function apiBase() {
    return typeof global.API === 'string' ? global.API : '/api/v1';
  }

  function brandId() {
    return global.brandId || null;
  }

  function authHeaders() {
    if (typeof global.getDashboardFetchHeaders === 'function') return global.getDashboardFetchHeaders();
    if (typeof global.getAuthHeaders === 'function') return global.getAuthHeaders();
    return {};
  }

  function toast(msg) {
    if (typeof global.toast === 'function') global.toast(msg);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function categoryLabel(id) {
    return PGA_CATEGORIES[id] || id;
  }

  function maskPassSerial(serial) {
    var s = String(serial || '');
    if (s.length <= 4) return '****';
    return '****' + s.slice(-4);
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('it-IT', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      });
    } catch (_) {
      return iso;
    }
  }

  function statusBadge(status) {
    var cls = 'fd-pga-status-badge fd-pga-status-badge--' + escapeHtml(status);
    return '<span class="' + cls + '">' + escapeHtml(BOOKING_STATUS_LABELS[status] || status) + '</span>';
  }

  function enhancePgaSectionDesign() {
    var section = document.getElementById('pga-catalog');
    if (!section || section.dataset.fdDsSection === '1') return;
    section.dataset.fdDsSection = '1';
    section.classList.add('pga--fd-ds');

    var title = section.querySelector('h1.page-title, h1.sec-title');
    if (title && !title.closest('.fd-page-header')) {
      var header = document.createElement('header');
      header.className = 'fd-page-header fd-pga-header';
      var copy = document.createElement('div');
      copy.className = 'fd-page-header__copy';
      copy.appendChild(title);
      title.classList.add('fd-page-header__title');
      var lead = document.createElement('p');
      lead.className = 'fd-page-header__lead fd-pga-lead';
      lead.textContent =
        'Gestisci il catalogo esperienze PGA, le prenotazioni dipendenti e le regole di assegnazione coin.';
      copy.appendChild(lead);
      header.appendChild(copy);
      section.insertBefore(header, section.firstChild);
    }

    var tabs = section.querySelector('#pgaCatalogSectionTabs');
    if (tabs) tabs.classList.add('fd-pga-tabs');
  }

  function getPgaTab() {
    var tabs = ['catalog', 'bookings', 'coins', 'settings'];
    for (var i = 0; i < tabs.length; i++) {
      var panel = document.getElementById('pgaTabPanel_' + tabs[i]);
      if (panel && !panel.hidden) return tabs[i];
    }
    return 'catalog';
  }

  function setPgaTabUi(tab) {
    ['catalog', 'bookings', 'coins', 'settings'].forEach(function (t) {
      var btn = document.getElementById('pgaTab_' + t);
      var panel = document.getElementById('pgaTabPanel_' + t);
      var on = t === tab;
      if (btn) {
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        btn.tabIndex = on ? 0 : -1;
      }
      if (panel) {
        panel.hidden = !on;
        panel.setAttribute('aria-hidden', on ? 'false' : 'true');
      }
    });
    state.tab = tab;
  }

  function switchPgaTab(tab, options) {
    options = options || {};
    tab = tab || 'catalog';
    setPgaTabUi(tab);
    if (!options.skipLoad) {
      if (tab === 'catalog') renderExperiencesTable();
      else if (tab === 'bookings') loadBookingsTable();
      else if (tab === 'coins') renderCoinActionsTable();
      else if (tab === 'settings') loadPgaSettingsForm();
    }
    if (typeof global.fdRbacHook === 'function') global.fdRbacHook('pga-catalog');
  }

  async function fetchPgaSettings() {
    var bid = brandId();
    if (!bid) return null;
    var res = await fetch(apiBase() + '/brands/' + encodeURIComponent(bid) + '/pga-settings', {
      headers: authHeaders()
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || 'Errore impostazioni PGA');
    return data;
  }

  async function fetchExperiences() {
    var bid = brandId();
    if (!bid) return [];
    var res = await fetch(apiBase() + '/experiences?brand_id=' + encodeURIComponent(bid), {
      headers: authHeaders()
    });
    var data = await res.json().catch(function () { return []; });
    if (!res.ok) throw new Error(data.error || 'Errore catalogo');
    return Array.isArray(data) ? data : [];
  }

  async function fetchBookings(status) {
    var bid = brandId();
    if (!bid) return [];
    var qs = 'brand_id=' + encodeURIComponent(bid);
    if (status) qs += '&status=' + encodeURIComponent(status);
    var res = await fetch(apiBase() + '/brands/' + encodeURIComponent(bid) + '/bookings?' + qs, {
      headers: authHeaders()
    });
    var data = await res.json().catch(function () { return []; });
    if (!res.ok) throw new Error(data.error || 'Errore prenotazioni');
    return Array.isArray(data) ? data : [];
  }

  async function fetchCoinActions() {
    var bid = brandId();
    if (!bid) return [];
    var res = await fetch(apiBase() + '/coins/actions?brand_id=' + encodeURIComponent(bid), {
      headers: authHeaders()
    });
    var data = await res.json().catch(function () { return []; });
    if (!res.ok) throw new Error(data.error || 'Errore regole coin');
    return Array.isArray(data) ? data : [];
  }

  function renderPgaEnabledToggle() {
    var host = document.getElementById('pgaEnabledToggleHost');
    if (!host) return;
    var enabled = !!(state.settings && state.settings.enabled);
    host.innerHTML =
      '<div class="fd-pga-toggle fd-rbac-write">' +
      '<label class="fd-switch" for="pgaEnabledCheckbox">' +
      '<input type="checkbox" class="fd-switch__input" id="pgaEnabledCheckbox"' +
      (enabled ? ' checked' : '') +
      ' aria-label="Attiva PGA — catalogo esperienze nel pass wallet">' +
      '<span class="fd-switch__track" aria-hidden="true"><span class="fd-switch__thumb"></span></span>' +
      '<span class="fd-pga-toggle__copy">' +
      '<strong>Attiva PGA</strong>' +
      '<span class="fd-pga-toggle__hint">— catalogo esperienze nel pass wallet</span>' +
      '</span></label></div>';
    var cb = document.getElementById('pgaEnabledCheckbox');
    if (cb) {
      cb.addEventListener('change', togglePgaEnabled);
    }
  }

  function ensurePgaCatalogFilters() {
    var toolbar = document.querySelector('#pgaTabPanel_catalog .fd-pga-toolbar');
    if (!toolbar || document.getElementById('pgaExpSearch')) return;

    var filters = document.createElement('div');
    filters.className = 'fd-pga-filters';
    filters.innerHTML =
      '<input type="search" id="pgaExpSearch" class="fd-pga-control" placeholder="Cerca esperienza…" aria-label="Cerca esperienza">' +
      '<select id="pgaExpCategoryFilter" class="fd-pga-control" aria-label="Filtra per categoria">' +
      '<option value="">Tutte le categorie</option>' +
      Object.keys(PGA_CATEGORIES).map(function (id) {
        return '<option value="' + escapeHtml(id) + '">' + escapeHtml(categoryLabel(id)) + '</option>';
      }).join('') +
      '</select>' +
      '<select id="pgaExpTypeFilter" class="fd-pga-control" aria-label="Filtra per tipo">' +
      '<option value="">Tutti i tipi</option>' +
      '<option value="internal">Interna</option>' +
      '<option value="external">Esterna</option>' +
      '</select>' +
      '<select id="pgaExpStatusFilter" class="fd-pga-control" aria-label="Filtra per stato">' +
      '<option value="">Tutti gli stati</option>' +
      '<option value="active">Attiva</option>' +
      '<option value="inactive">Disattiva</option>' +
      '</select>';

    toolbar.appendChild(filters);

    var searchEl = document.getElementById('pgaExpSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        state.expFilterSearch = searchEl.value.trim();
        renderExperiencesTable();
      });
    }
    ['pgaExpCategoryFilter', 'pgaExpTypeFilter', 'pgaExpStatusFilter'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function () {
        if (id === 'pgaExpCategoryFilter') state.expFilterCategory = el.value;
        else if (id === 'pgaExpTypeFilter') state.expFilterType = el.value;
        else state.expFilterStatus = el.value;
        renderExperiencesTable();
      });
    });
  }

  function filteredExperiences() {
    return (state.experiences || []).filter(function (exp) {
      if (state.expFilterCategory && exp.category !== state.expFilterCategory) return false;
      if (state.expFilterType === 'internal' && !exp.internal) return false;
      if (state.expFilterType === 'external' && exp.internal) return false;
      if (state.expFilterStatus === 'active' && !exp.active) return false;
      if (state.expFilterStatus === 'inactive' && exp.active) return false;
      if (state.expFilterSearch) {
        var q = state.expFilterSearch.toLowerCase();
        var hay = ((exp.name || '') + ' ' + categoryLabel(exp.category)).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  async function togglePgaEnabled() {
    var bid = brandId();
    if (!bid) return;
    var cb = document.getElementById('pgaEnabledCheckbox');
    var enabled = !!(cb && cb.checked);
    try {
      var res = await fetch(apiBase() + '/brands/' + encodeURIComponent(bid) + '/pga-settings', {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ enabled: enabled })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Salvataggio fallito');
      state.settings = data;
      toast(enabled ? 'PGA attivato' : 'PGA disattivato');
      if (enabled) {
        state.experiences = await fetchExperiences();
        renderExperiencesTable();
      }
    } catch (err) {
      toast(err.message || 'Errore attivazione PGA');
      if (cb) cb.checked = !enabled;
    }
  }

  function renderExperiencesTable() {
    var table = document.getElementById('pgaExperiencesTable');
    var tbody = table ? table.querySelector('tbody') : null;
    var thead = table ? table.querySelector('thead') : null;
    if (!tbody) return;
    var allRows = state.experiences || [];
    var rows = filteredExperiences();
    if (thead) thead.hidden = !rows.length;
    if (!allRows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text2)">Nessuna esperienza. Attiva PGA per generare il catalogo predefinito.</td></tr>';
      return;
    }
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text2);text-align:center;padding:24px">Nessuna esperienza corrisponde ai filtri.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (exp) {
      return (
        '<tr>' +
        '<td>' + escapeHtml(exp.name) + '</td>' +
        '<td>' + escapeHtml(categoryLabel(exp.category)) + '</td>' +
        '<td>' + escapeHtml(exp.coin_cost) + '</td>' +
        '<td>' + (exp.internal ? 'Interna' : 'Esterna') + '</td>' +
        '<td>' + (exp.active ? 'Attiva' : 'Disattiva') + '</td>' +
        '<td>' + (exp.max_per_user_per_year != null ? escapeHtml(exp.max_per_user_per_year) : '—') + '</td>' +
        '<td><button type="button" class="btn sec small fd-rbac-write" data-pga-edit="' + escapeHtml(exp.id) + '">Modifica</button></td>' +
        '</tr>'
      );
    }).join('');

    tbody.querySelectorAll('[data-pga-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        openExperienceModal(btn.getAttribute('data-pga-edit'));
      });
    });
  }

  function openExperienceModal(id) {
    var exp = (state.experiences || []).filter(function (e) { return e.id === id; })[0];
    if (!exp) return;
    state.editingExperienceId = id;
    var modal = document.getElementById('pgaExperienceModal');
    if (!modal) return;
    var nameEl = document.getElementById('pgaExpModalName');
    var costEl = document.getElementById('pgaExpModalCoinCost');
    var activeEl = document.getElementById('pgaExpModalActive');
    var maxEl = document.getElementById('pgaExpModalMaxYear');
    if (nameEl) nameEl.textContent = exp.name;
    if (costEl) costEl.value = exp.coin_cost;
    if (activeEl) activeEl.checked = !!exp.active;
    if (maxEl) maxEl.value = exp.max_per_user_per_year != null ? exp.max_per_user_per_year : '';
    modal.style.display = 'flex';
    modal.classList.add('active');
    document.body.classList.add('modal-open');
  }

  function closeExperienceModal() {
    var modal = document.getElementById('pgaExperienceModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('active');
    }
    if (!document.querySelector('.modal.active')) document.body.classList.remove('modal-open');
    state.editingExperienceId = null;
  }

  async function saveExperienceModal(e) {
    if (e) e.preventDefault();
    var id = state.editingExperienceId;
    var bid = brandId();
    if (!id || !bid) return;
    var costEl = document.getElementById('pgaExpModalCoinCost');
    var activeEl = document.getElementById('pgaExpModalActive');
    var maxEl = document.getElementById('pgaExpModalMaxYear');
    var payload = {
      coin_cost: parseInt((costEl || {}).value, 10),
      active: !!(activeEl && activeEl.checked)
    };
    var maxVal = (maxEl || {}).value;
    payload.max_per_user_per_year = maxVal === '' ? null : parseInt(maxVal, 10);
    try {
      var res = await fetch(apiBase() + '/experiences/' + encodeURIComponent(id), {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Salvataggio fallito');
      toast('Esperienza aggiornata');
      closeExperienceModal();
      state.experiences = await fetchExperiences();
      renderExperiencesTable();
    } catch (err) {
      toast(err.message || 'Errore salvataggio');
    }
  }

  async function loadBookingsTable() {
    var filterEl = document.getElementById('pgaBookingStatusFilter');
    var status = filterEl ? filterEl.value : '';
    state.bookingFilter = status;
    try {
      state.bookings = await fetchBookings(status || undefined);
      renderBookingsTable();
    } catch (err) {
      toast(err.message || 'Errore prenotazioni');
    }
  }

  function renderBookingsTable() {
    var tbody = document.querySelector('#pgaBookingsTable tbody');
    if (!tbody) return;
    var rows = state.bookings || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text2)">Nessuna prenotazione.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (b) {
      var actions = '';
      if (b.status === 'pending') {
        actions =
          '<button type="button" class="btn sec small fd-rbac-write" data-pga-booking="' + escapeHtml(b.id) + '" data-pga-status="confirmed">Conferma</button>' +
          '<button type="button" class="btn sec small danger fd-rbac-write" data-pga-booking="' + escapeHtml(b.id) + '" data-pga-status="cancelled">Annulla</button>';
      } else if (b.status === 'confirmed') {
        actions =
          '<button type="button" class="btn sec small fd-rbac-write" data-pga-booking="' + escapeHtml(b.id) + '" data-pga-status="delivered">Erogata</button>' +
          '<button type="button" class="btn sec small danger fd-rbac-write" data-pga-booking="' + escapeHtml(b.id) + '" data-pga-status="cancelled">Annulla</button>';
      } else {
        actions = '—';
      }
      return (
        '<tr>' +
        '<td><code>' + escapeHtml(maskPassSerial(b.pass_serial)) + '</code></td>' +
        '<td>' + escapeHtml(b.experience_name || '—') + '</td>' +
        '<td>' + formatDate(b.scheduled_at || b.created_at) + '</td>' +
        '<td>' + statusBadge(b.status) + '</td>' +
        '<td><div class="fd-pga-booking-actions">' + actions + '</div></td>' +
        '</tr>'
      );
    }).join('');

    tbody.querySelectorAll('[data-pga-booking]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        updateBookingStatus(btn.getAttribute('data-pga-booking'), btn.getAttribute('data-pga-status'));
      });
    });
  }

  async function updateBookingStatus(bookingId, status) {
    var bid = brandId();
    if (!bid || !bookingId || !status) return;
    try {
      var res = await fetch(apiBase() + '/bookings/' + encodeURIComponent(bookingId) + '/status', {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ brand_id: bid, status: status })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Aggiornamento fallito');
      toast('Prenotazione aggiornata');
      await loadBookingsTable();
    } catch (err) {
      toast(err.message || 'Errore aggiornamento prenotazione');
    }
  }

  function renderCoinActionsTable() {
    var tbody = document.querySelector('#pgaCoinActionsTable tbody');
    if (!tbody) return;
    var rows = state.coinActions || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--text2)">Nessuna regola coin. Attiva PGA per generare le regole predefinite.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map(function (a) {
      return (
        '<tr data-pga-action-id="' + escapeHtml(a.id) + '">' +
        '<td><code>' + escapeHtml(a.action_key) + '</code></td>' +
        '<td>' + escapeHtml(a.description || '—') + '</td>' +
        '<td><input type="number" class="fd-pga-coin-input fd-rbac-write" data-pga-coin-id="' + escapeHtml(a.id) + '" value="' + escapeHtml(a.coin_amount) + '" min="0" style="width:80px"></td>' +
        '<td><button type="button" class="btn sec small fd-rbac-write" data-pga-save-coin="' + escapeHtml(a.id) + '">Salva</button></td>' +
        '</tr>'
      );
    }).join('');

    tbody.querySelectorAll('[data-pga-save-coin]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        saveCoinAction(btn.getAttribute('data-pga-save-coin'));
      });
    });
  }

  async function saveCoinAction(actionId) {
    var bid = brandId();
    if (!bid || !actionId) return;
    var input = document.querySelector('[data-pga-coin-id="' + actionId + '"]');
    var amount = parseInt((input || {}).value, 10);
    if (!Number.isFinite(amount) || amount < 0) {
      toast('Importo coin non valido');
      return;
    }
    try {
      var res = await fetch(apiBase() + '/coins/actions/' + encodeURIComponent(actionId), {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ brand_id: bid, coin_amount: amount })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Salvataggio fallito');
      toast('Regola coin aggiornata');
      state.coinActions = await fetchCoinActions();
      renderCoinActionsTable();
    } catch (err) {
      toast(err.message || 'Errore salvataggio regola');
    }
  }

  async function loadPgaSettingsForm() {
    try {
      state.settings = await fetchPgaSettings();
    } catch (err) {
      toast(err.message || 'Errore impostazioni');
      return;
    }
    var s = state.settings || {};
    var welcome = document.getElementById('pgaSettingsWelcome');
    var email = document.getElementById('pgaSettingsNotifyEmail');
    var notifyBooking = document.getElementById('pgaSettingsNotifyBooking');
    var budget = document.getElementById('pgaSettingsBudget');
    if (welcome) welcome.value = s.welcome_message || '';
    if (email) email.value = s.notify_hr_email || '';
    if (notifyBooking) notifyBooking.checked = s.notify_hr_on_booking !== false;
    if (budget) budget.value = s.annual_budget_external_eur != null ? s.annual_budget_external_eur : '';
    renderOnboardingBanner();
  }

  function renderOnboardingBanner() {
    var host = document.getElementById('pgaOnboardingBanner');
    if (!host) return;
    var enabled = !!(state.settings && state.settings.enabled);
    var expCount = (state.experiences || []).length;
    if (enabled && expCount > 0) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    host.innerHTML =
      '<strong>Avvio rapido PGA</strong> — ' +
      '1) Importa merchant in <a href="#" data-pga-nav-conventions>Convenzioni</a> · ' +
      '2) <a href="#" data-pga-nav-enable>Attiva PGA</a> in Catalogo · ' +
      '3) <a href="#" data-pga-nav-experiences>Rivedi le esperienze</a> nel catalogo.';
  }

  function handleOnboardingBannerClick(e) {
    var link = e.target.closest('[data-pga-nav-conventions], [data-pga-nav-enable], [data-pga-nav-experiences]');
    if (!link) return;
    e.preventDefault();
    if (link.hasAttribute('data-pga-nav-conventions')) {
      if (typeof global.nav === 'function') global.nav('conventions');
      return;
    }
    if (typeof global.nav === 'function') global.nav('pga-catalog');
    switchPgaTab('catalog');
    if (link.hasAttribute('data-pga-nav-enable')) {
      var cb = document.getElementById('pgaEnabledCheckbox');
      if (cb) {
        cb.focus();
        cb.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      return;
    }
    if (link.hasAttribute('data-pga-nav-experiences')) {
      var table = document.getElementById('pgaExperiencesTable');
      if (table) table.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  async function savePgaSettings(e) {
    if (e) e.preventDefault();
    var bid = brandId();
    if (!bid) return;
    var payload = {
      welcome_message: (document.getElementById('pgaSettingsWelcome') || {}).value || null,
      notify_hr_email: (document.getElementById('pgaSettingsNotifyEmail') || {}).value || null,
      notify_hr_on_booking: !!(document.getElementById('pgaSettingsNotifyBooking') || {}).checked,
      annual_budget_external_eur: (function () {
        var v = (document.getElementById('pgaSettingsBudget') || {}).value;
        return v === '' ? null : parseFloat(v);
      })()
    };
    try {
      var res = await fetch(apiBase() + '/brands/' + encodeURIComponent(bid) + '/pga-settings', {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Salvataggio fallito');
      state.settings = data;
      toast('Impostazioni PGA salvate');
    } catch (err) {
      toast(err.message || 'Errore salvataggio impostazioni');
    }
  }

  async function submitManualGrant(e) {
    if (e) e.preventDefault();
    var bid = brandId();
    if (!bid) return;
    var serial = (document.getElementById('pgaManualPassSerial') || {}).value.trim();
    var amount = parseInt((document.getElementById('pgaManualCoinAmount') || {}).value, 10);
    var desc = (document.getElementById('pgaManualDescription') || {}).value.trim();
    if (!serial || !Number.isFinite(amount) || amount <= 0) {
      toast('Serial pass e importo coin obbligatori');
      return;
    }
    try {
      var res = await fetch(apiBase() + '/coins/manual-grant', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({
          brand_id: bid,
          pass_serial: serial,
          coin_amount: amount,
          description: desc || 'Assegnazione manuale HR'
        })
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(data.error || 'Assegnazione fallita');
      toast('Coin assegnati');
      var serialEl = document.getElementById('pgaManualPassSerial');
      var amtEl = document.getElementById('pgaManualCoinAmount');
      var descEl = document.getElementById('pgaManualDescription');
      if (serialEl) serialEl.value = '';
      if (amtEl) amtEl.value = '';
      if (descEl) descEl.value = '';
    } catch (err) {
      toast(err.message || 'Errore assegnazione coin');
    }
  }

  function bindPgaEvents() {
    var section = document.getElementById('pga-catalog');
    if (!section || section.dataset.fdEventsBound === '1') return;
    section.dataset.fdEventsBound = '1';

    var bookingFilter = document.getElementById('pgaBookingStatusFilter');
    if (bookingFilter) {
      bookingFilter.addEventListener('change', loadBookingsTable);
    }

    var settingsForm = document.getElementById('pgaSettingsForm');
    if (settingsForm) settingsForm.addEventListener('submit', savePgaSettings);

    var grantForm = document.getElementById('pgaManualGrantForm');
    if (grantForm) grantForm.addEventListener('submit', submitManualGrant);

    var expForm = document.getElementById('pgaExperienceForm');
    if (expForm) expForm.addEventListener('submit', saveExperienceModal);

    var modal = document.getElementById('pgaExperienceModal');
    if (modal) {
      modal.querySelectorAll('[data-pga-modal-close]').forEach(function (btn) {
        btn.addEventListener('click', closeExperienceModal);
      });
    }

    var onboardingHost = document.getElementById('pgaOnboardingBanner');
    if (onboardingHost && onboardingHost.dataset.fdBannerDelegated !== '1') {
      onboardingHost.dataset.fdBannerDelegated = '1';
      onboardingHost.addEventListener('click', handleOnboardingBannerClick);
    }
  }

  async function reloadPgaData() {
    try {
      var results = await Promise.all([
        fetchPgaSettings(),
        fetchExperiences().catch(function () { return []; }),
        fetchCoinActions().catch(function () { return []; })
      ]);
      state.settings = results[0];
      state.experiences = results[1] || [];
      state.coinActions = results[2] || [];
      renderPgaEnabledToggle();
      renderOnboardingBanner();
      if (state.tab === 'catalog') renderExperiencesTable();
      else if (state.tab === 'bookings') await loadBookingsTable();
      else if (state.tab === 'coins') renderCoinActionsTable();
      else if (state.tab === 'settings') await loadPgaSettingsForm();
    } catch (err) {
      toast(err.message || 'Errore caricamento PGA');
    }
  }

  async function loadPgaCatalog() {
    if (!isFiloPgaApp()) return;
    enhancePgaSectionDesign();
    ensurePgaCatalogFilters();
    bindPgaEvents();
    switchPgaTab(getPgaTab(), { skipLoad: true });
    await reloadPgaData();
    if (typeof global.fdRbacHook === 'function') global.fdRbacHook('pga-catalog');
  }

  function initPgaModule() {
    if (!isFiloPgaApp()) return;
    enhancePgaSectionDesign();
    ensurePgaCatalogFilters();
    if (typeof global.fdInjectSectionFlowBar === 'function') {
      global.fdInjectSectionFlowBar('pga-catalog');
    }
  }

  global.switchPgaTab = switchPgaTab;
  global.loadPgaCatalog = loadPgaCatalog;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPgaModule);
  } else {
    initPgaModule();
  }
})(typeof window !== 'undefined' ? window : global);


/* === fd-pga-engagement.js === */
/**
 * FD — PGA Engagement analytics HR dashboard (Sprint 4).
 */
(function (global) {
  'use strict';

  var WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

  var state = {
    analytics: null,
    analyticsError: false,
    days: 30
  };

  function isFiloPgaApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (global.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function apiBase() {
    return typeof global.API === 'string' ? global.API : '/api/v1';
  }

  function brandId() {
    return global.brandId || null;
  }

  function authHeaders() {
    if (typeof global.getDashboardFetchHeaders === 'function') return global.getDashboardFetchHeaders();
    if (typeof global.getAuthHeaders === 'function') return global.getAuthHeaders();
    return {};
  }

  function toast(msg) {
    if (typeof global.toast === 'function') global.toast(msg);
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function enhanceEngagementSectionDesign() {
    var section = document.getElementById('pga-engagement');
    if (!section || section.dataset.fdDsSection === '1') return;
    section.dataset.fdDsSection = '1';
    section.classList.add('pga--fd-ds');

    var title = section.querySelector('h1.page-title, h1.sec-title');
    if (title && !title.closest('.fd-page-header')) {
      var header = document.createElement('header');
      header.className = 'fd-page-header fd-pga-header';
      var copy = document.createElement('div');
      copy.className = 'fd-page-header__copy';
      copy.appendChild(title);
      title.classList.add('fd-page-header__title');
      var lead = document.createElement('p');
      lead.className = 'fd-page-header__lead fd-pga-lead';
      lead.textContent =
        'Monitora coin assegnati e riscattati, le esperienze più richieste e l\'attività per giorno della settimana.';
      copy.appendChild(lead);
      header.appendChild(copy);
      section.insertBefore(header, section.firstChild);
    }
  }

  async function fetchEngagementAnalytics(days) {
    var bid = brandId();
    if (!bid) return null;
    var res = await fetch(
      apiBase() + '/brands/' + encodeURIComponent(bid) + '/engagement-analytics?days=' + encodeURIComponent(days),
      { headers: authHeaders() }
    );
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || 'Errore analytics');
    return data;
  }

  function formatKpiNumber(value) {
    if (value == null || value === '' || Number.isNaN(Number(value))) return '0';
    return String(Number(value));
  }

  function renderKpiSkeleton() {
    var host = document.getElementById('pgaEngagementKpis');
    if (!host) return;
    var items = [
      'Coin assegnati',
      'Coin riscattati',
      'Eventi assegnazione',
      'Eventi riscatto'
    ];
    host.classList.add('fd-pga-kpi-grid--loading');
    host.innerHTML = items.map(function (label) {
      return (
        '<div class="fd-pga-kpi" aria-busy="true">' +
        '<div class="fd-pga-kpi__label">' + escapeHtml(label) + '</div>' +
        '<div class="fd-pga-kpi__value"><span class="fd-pga-kpi__value-skeleton" aria-hidden="true"></span></div>' +
        '</div>'
      );
    }).join('');
  }

  function renderKpis() {
    var host = document.getElementById('pgaEngagementKpis');
    if (!host) return;
    host.classList.remove('fd-pga-kpi-grid--loading');
    var a = state.analytics;
    var items = [
      { label: 'Coin assegnati', value: a ? formatKpiNumber(a.coins_granted) : '0', hint: 'Totale coin erogati nel periodo' },
      { label: 'Coin riscattati', value: a ? formatKpiNumber(a.coins_redeemed) : '0', hint: 'Coin spesi in prenotazioni' },
      { label: 'Eventi assegnazione', value: a ? formatKpiNumber(a.grant_events) : '0', hint: 'Azioni che hanno generato coin' },
      { label: 'Eventi riscatto', value: a ? formatKpiNumber(a.redemption_events) : '0', hint: 'Prenotazioni o riscatti confermati' }
    ];
    if (state.analyticsError && !a) {
      items.forEach(function (item) {
        item.value = '—';
        item.hint = 'Dati non disponibili';
      });
    } else if (a && !a.coins_granted && !a.coins_redeemed && !a.grant_events && !a.redemption_events) {
      items.forEach(function (item) {
        item.hint = (item.hint || '') + ' · Nessun dato nel periodo selezionato';
      });
    }
    host.innerHTML = items.map(function (item) {
      return (
        '<div class="fd-pga-kpi' + (state.analyticsError && !a ? ' fd-pga-kpi--error' : '') + '">' +
        '<div class="fd-pga-kpi__label">' + escapeHtml(item.label) + '</div>' +
        '<div class="fd-pga-kpi__value">' + escapeHtml(item.value) + '</div>' +
        (item.hint ? '<div class="fd-pga-kpi__hint">' + escapeHtml(item.hint) + '</div>' : '') +
        '</div>'
      );
    }).join('');
  }

  function renderTopExperiences() {
    var host = document.getElementById('pgaEngagementTopExp');
    if (!host) return;
    var rows = (state.analytics && state.analytics.top_experiences) || [];
    var top5 = rows.slice(0, 5);
    if (!top5.length) {
      host.innerHTML = '<p style="color:var(--text2);font-size:13px">Nessuna prenotazione nel periodo.</p>';
      return;
    }
    host.innerHTML =
      '<table class="table"><thead><tr><th>Esperienza</th><th>Prenotazioni</th></tr></thead><tbody>' +
      top5.map(function (r) {
        return '<tr><td>' + escapeHtml(r.name) + '</td><td>' + escapeHtml(r.bookings) + '</td></tr>';
      }).join('') +
      '</tbody></table>';
  }

  function renderTopActions() {
    var host = document.getElementById('pgaEngagementTopActions');
    if (!host) return;
    var rows = (state.analytics && state.analytics.top_actions) || [];
    if (!rows.length) {
      host.innerHTML = '<p style="color:var(--text2);font-size:13px">Nessuna azione coin nel periodo.</p>';
      return;
    }
    host.innerHTML =
      '<table class="table"><thead><tr><th>Azione</th><th>Eventi</th><th>Coin totali</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return (
          '<tr><td><code>' + escapeHtml(r.action_key) + '</code></td>' +
          '<td>' + escapeHtml(r.events) + '</td>' +
          '<td>' + escapeHtml(r.total_coins) + '</td></tr>'
        );
      }).join('') +
      '</tbody></table>';
  }

  function renderByWeekday() {
    var host = document.getElementById('pgaEngagementByWeekday');
    if (!host) return;
    var rows = (state.analytics && state.analytics.by_weekday) || [];
    if (!rows.length) {
      host.innerHTML = '<p style="color:var(--text2);font-size:13px">Nessun dato per giorno settimana.</p>';
      return;
    }
    host.innerHTML =
      '<table class="table"><thead><tr><th>Giorno</th><th>Eventi</th><th>Coin netti</th></tr></thead><tbody>' +
      rows.map(function (r) {
        var dow = Number(r.dow);
        return (
          '<tr><td>' + escapeHtml(WEEKDAY_LABELS[dow] || dow) + '</td>' +
          '<td>' + escapeHtml(r.events) + '</td>' +
          '<td>' + escapeHtml(r.total_coins) + '</td></tr>'
        );
      }).join('') +
      '</tbody></table>';
  }

  function exportEngagementCsv() {
    var a = state.analytics;
    if (!a) {
      toast('Nessun dato da esportare');
      return;
    }
    var lines = [
      'metrica,valore',
      'coins_granted,' + (a.coins_granted || 0),
      'coins_redeemed,' + (a.coins_redeemed || 0),
      'grant_events,' + (a.grant_events || 0),
      'redemption_events,' + (a.redemption_events || 0),
      '',
      'top_experiences,nome,prenotazioni'
    ];
    (a.top_experiences || []).slice(0, 5).forEach(function (r) {
      lines.push('experience,' + '"' + String(r.name || '').replace(/"/g, '""') + '",' + (r.bookings || 0));
    });
    lines.push('');
    lines.push('top_actions,action_key,eventi,coin');
    (a.top_actions || []).forEach(function (r) {
      lines.push('action,' + r.action_key + ',' + r.events + ',' + r.total_coins);
    });
    lines.push('');
    lines.push('by_weekday,giorno,eventi,coin');
    (a.by_weekday || []).forEach(function (r) {
      var dow = Number(r.dow);
      lines.push('weekday,' + (WEEKDAY_LABELS[dow] || dow) + ',' + r.events + ',' + r.total_coins);
    });
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'pga-engagement-' + state.days + 'd.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function bindEngagementEvents() {
    var section = document.getElementById('pga-engagement');
    if (!section || section.dataset.fdEventsBound === '1') return;
    section.dataset.fdEventsBound = '1';

    var rangeEl = document.getElementById('pgaEngagementDays');
    if (rangeEl) {
      rangeEl.addEventListener('change', function () {
        state.days = parseInt(rangeEl.value, 10) || 30;
        reloadEngagement();
      });
    }

    var exportBtn = document.getElementById('pgaEngagementExportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportEngagementCsv);
    }
  }

  async function reloadEngagement() {
    state.analyticsError = false;
    renderKpiSkeleton();
    try {
      state.analytics = await fetchEngagementAnalytics(state.days);
      renderKpis();
      renderTopExperiences();
      renderTopActions();
      renderByWeekday();
    } catch (err) {
      state.analytics = null;
      state.analyticsError = true;
      renderKpis();
      toast(err.message || 'Errore caricamento engagement');
    } finally {
      var host = document.getElementById('pgaEngagementKpis');
      if (host) host.classList.remove('fd-pga-kpi-grid--loading');
    }
  }

  async function loadPgaEngagement() {
    if (!isFiloPgaApp()) return;
    enhanceEngagementSectionDesign();
    bindEngagementEvents();
    var rangeEl = document.getElementById('pgaEngagementDays');
    if (rangeEl) state.days = parseInt(rangeEl.value, 10) || 30;
    await reloadEngagement();
    if (typeof global.fdRbacHook === 'function') global.fdRbacHook('pga-engagement');
  }

  function initEngagementModule() {
    if (!isFiloPgaApp()) return;
    enhanceEngagementSectionDesign();
    bindEngagementEvents();
    if (typeof global.fdInjectSectionFlowBar === 'function') {
      global.fdInjectSectionFlowBar('pga-engagement');
    }
    var host = document.getElementById('pgaEngagementKpis');
    if (host && !host.querySelector('.fd-pga-kpi')) {
      renderKpiSkeleton();
    }
  }

  global.loadPgaEngagement = loadPgaEngagement;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEngagementModule);
  } else {
    initEngagementModule();
  }
})(typeof window !== 'undefined' ? window : global);


/* === fd-activity-log.js === */
/**
 * FD — Log Attività: filtri, ricerca, export CSV, copia ID, dettagli leggibili.
 */
(function () {
  'use strict';

  var cache = [];
  var filters = { type: '', q: '', dateFrom: '', dateTo: '' };

  var META_LABELS = {
    source: 'Fonte',
    channel: 'Canale',
    member_id: 'Member',
    email: 'Email',
    reason: 'Motivo',
    push_id: 'Push',
    title: 'Titolo',
    message: 'Messaggio',
    campaign_id: 'Campagna',
    audience_id: 'Audience',
    serial_number: 'Serial',
    user_agent: 'User-Agent',
    ip: 'IP',
    refId: 'Rif.',
    ref_id: 'Rif.'
  };

  var EVENT_TYPE_LABELS = {
    pass_fetched: 'Pass recuperato',
    pass_downloaded: 'Pass scaricato',
    samsung_wallet_link_generated: 'Link Samsung Wallet generato',
    pass_installed: 'Pass installato',
    pass_created: 'Pass creato',
    pass_updated: 'Pass aggiornato',
    pass_deleted: 'Pass eliminato',
    push_sent: 'Push inviata',
    push_delivered: 'Push consegnata',
    push_failed: 'Push non consegnata',
    member_created: 'Membro creato',
    member_updated: 'Membro aggiornato',
    google_wallet_saved: 'Google Wallet salvato',
    apple_wallet_registered: 'Apple Wallet registrato'
  };

  function eventTypeLabel(type) {
    var key = String(type || '');
    if (!key) return '—';
    if (EVENT_TYPE_LABELS[key]) return EVENT_TYPE_LABELS[key];
    return key.replace(/_/g, ' ');
  }

  function isFilo() {
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function esc(s) {
    if (typeof window.esc === 'function') return window.esc(s);
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
  }

  function formatPassIdShort(s) {
    if (typeof window.formatPassIdShort === 'function') return window.formatPassIdShort(s);
    s = String(s || '');
    if (!s) return '—';
    if (s.length <= 14) return s;
    return s.slice(0, 8) + '…' + s.slice(-4);
  }

  function formatDeviceShort(s) {
    s = String(s || '');
    if (!s) return '—';
    if (s.length <= 24) return s;
    return s.slice(0, 20) + '…';
  }

  function normalizeMeta(meta) {
    if (meta == null) return null;
    if (typeof meta === 'string') {
      var t = meta.trim();
      if (!t || t === '{}') return null;
      try {
        var parsed = JSON.parse(t);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
      } catch (_) {}
      return { _raw: t };
    }
    if (typeof meta === 'object') {
      if (Array.isArray(meta)) return meta.length ? { items: meta.join(', ') } : null;
      if (Object.keys(meta).length === 0) return null;
      return meta;
    }
    return null;
  }

  function formatMetaParts(meta, forExport) {
    var obj = normalizeMeta(meta);
    if (!obj) return [];
    if (obj._raw) return [obj._raw];
    var parts = [];
    Object.keys(obj).forEach(function (key) {
      var val = obj[key];
      if (val == null || val === '') return;
      if (typeof val === 'object') {
        try {
          var inner = JSON.stringify(val);
          if (inner === '{}') return;
          parts.push((META_LABELS[key] || key) + ': ' + (forExport ? inner : inner.slice(0, 80)));
        } catch (_) {}
        return;
      }
      var text = String(val);
      if (!forExport && text.length > 96) text = text.slice(0, 93) + '…';
      parts.push((META_LABELS[key] || key) + ': ' + text);
    });
    return parts;
  }

  function formatActivityDetails(ev, forExport) {
    var parts = formatMetaParts(ev && ev.metadata, forExport);
    if (parts.length) return parts.join(' · ');
    return '—';
  }

  function copyValue(value, label) {
    if (!value) return;
    var text = String(value);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast(label + ' copiato');
      }).catch(function () {
        toast('Copia non riuscita');
      });
      return;
    }
    toast('Copia non disponibile');
  }

  function renderIdButton(value, shortLabel, copyLabel) {
    if (!value) return '—';
    return (
      '<button type="button" class="pass-id-copy fd-activity-id-copy" data-copy-value="' +
      esc(value) + '" data-copy-label="' + esc(copyLabel) + '" title="' +
      esc(value) + ' — clic per copiare" aria-label="Copia ' + esc(copyLabel) + ' completo">' +
      '<span class="fd-activity-id-copy__icon" aria-hidden="true">⧉</span>' +
      '<span class="fd-activity-id-copy__text">' + esc(shortLabel) + '</span>' +
      '</button>'
    );
  }

  function renderDetailsCell(ev) {
    var details = formatActivityDetails(ev, false);
    if (!details || details === '—') return '—';
    return (
      '<span class="fd-activity-log-details__text" title="' + esc(details) + '" data-event-raw="' +
      esc(ev.event_type || '') + '">' + esc(details) + '</span>'
    );
  }

  function renderEventBadge(ev) {
    var raw = ev.event_type || '';
    var label = eventTypeLabel(raw);
    return (
      '<span class="badge inactive fd-activity-event" data-event-type="' + esc(raw) + '" ' +
      'title="' + esc(raw) + '" style="text-transform:none;font-size:11px;">' +
      esc(label) + '</span>'
    );
  }

  function rowMatchesFilters(ev) {
    if (filters.type && String(ev.event_type || '') !== filters.type) return false;

    if (filters.dateFrom) {
      var from = new Date(filters.dateFrom);
      if (isNaN(from.getTime())) return false;
      var created = ev.created_at ? new Date(ev.created_at) : null;
      if (!created || created < from) return false;
    }

    if (filters.dateTo) {
      var to = new Date(filters.dateTo);
      if (isNaN(to.getTime())) return false;
      to.setHours(23, 59, 59, 999);
      var createdTo = ev.created_at ? new Date(ev.created_at) : null;
      if (!createdTo || createdTo > to) return false;
    }

    if (filters.q) {
      var q = filters.q.toLowerCase();
      var haystack = [
        ev.event_type,
        ev.pass_id,
        ev.device_id,
        formatActivityDetails(ev, true),
        ev.metadata && typeof ev.metadata === 'object' ? JSON.stringify(ev.metadata) : ev.metadata
      ].filter(Boolean).join(' ').toLowerCase();
      if (haystack.indexOf(q) === -1) return false;
    }

    return true;
  }

  function getFilteredEvents() {
    return cache.filter(rowMatchesFilters);
  }

  function populateTypeFilter() {
    var sel = document.getElementById('fdActivityLogTypeFilter');
    if (!sel) return;
    var current = filters.type || sel.value || '';
    var types = [];
    cache.forEach(function (ev) {
      if (ev.event_type && types.indexOf(ev.event_type) === -1) types.push(ev.event_type);
    });
    types.sort();
    sel.innerHTML = '<option value="">Tutti</option>' +
      types.map(function (t) {
        return '<option value="' + esc(t) + '" title="' + esc(t) + '">' + esc(eventTypeLabel(t)) + '</option>';
      }).join('');
    sel.value = types.indexOf(current) !== -1 || current === '' ? current : '';
    filters.type = sel.value;
  }

  function updateFilterHint() {
    var hint = document.getElementById('fdActivityLogFilterHint');
    if (!hint) return;
    var shown = getFilteredEvents().length;
    var total = cache.length;
    if (!total) {
      hint.textContent = '';
      return;
    }
    if (shown === total) {
      hint.textContent = total + ' eventi caricati';
    } else {
      hint.textContent = 'Mostrati ' + shown + ' di ' + total + ' eventi';
    }
  }

  function renderTableBody() {
    var body = document.getElementById('activityLogBody');
    if (!body) return;

    var events = getFilteredEvents();
    if (!cache.length) {
      body.innerHTML = '<tr><td colspan="5">' +
        (typeof window.renderEmptyState === 'function'
          ? window.renderEmptyState({
            title: 'Nessun evento',
            description: 'Le attività su pass e campagne compariranno qui.',
            icon: 'inbox'
          })
          : '<span style="color:var(--text2)">Nessun evento</span>') +
        '</td></tr>';
      updateFilterHint();
      return;
    }

    if (!events.length) {
      body.innerHTML = '<tr><td colspan="5" style="color:var(--text2);text-align:center;padding:24px;">Nessun evento corrisponde ai filtri attivi.</td></tr>';
      updateFilterHint();
      return;
    }

    body.innerHTML = events.map(function (ev) {
      var when = ev.created_at ? new Date(ev.created_at).toLocaleString('it-IT') : '—';
      return (
        '<tr data-event-type="' + esc(ev.event_type || '') + '">' +
        '<td style="font-size:12px;white-space:nowrap;">' + esc(when) + '</td>' +
        '<td>' + renderEventBadge(ev) + '</td>' +
        '<td>' + renderIdButton(ev.pass_id, formatPassIdShort(ev.pass_id), 'Pass ID') + '</td>' +
        '<td class="fd-activity-log-device">' + renderIdButton(ev.device_id, formatDeviceShort(ev.device_id), 'Device ID') + '</td>' +
        '<td class="fd-activity-log-details">' + renderDetailsCell(ev) + '</td>' +
        '</tr>'
      );
    }).join('');

    updateFilterHint();
  }

  function readFiltersFromUi() {
    filters.type = document.getElementById('fdActivityLogTypeFilter')?.value || '';
    filters.q = (document.getElementById('fdActivityLogSearch')?.value || '').trim();
    filters.dateFrom = document.getElementById('fdActivityLogDateFrom')?.value || '';
    filters.dateTo = document.getElementById('fdActivityLogDateTo')?.value || '';
  }

  function onFiltersChange() {
    readFiltersFromUi();
    renderTableBody();
  }

  function exportCsv() {
    readFiltersFromUi();
    var rows = getFilteredEvents();
    if (!rows.length) {
      toast('Nessun evento da esportare');
      return;
    }
    var header = 'Data ora,Evento,Pass ID,Device,Dettagli';
    var lines = rows.map(function (ev) {
      return [
        ev.created_at ? new Date(ev.created_at).toLocaleString('it-IT') : '',
        ev.event_type || '',
        ev.pass_id || '',
        ev.device_id || '',
        formatActivityDetails(ev, true)
      ].map(function (v) {
        return '"' + String(v).replace(/"/g, '""') + '"';
      }).join(',');
    });
    var csv = [header].concat(lines).join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'activity-log-' + (new Date().toISOString().slice(0, 10)) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV esportato (' + rows.length + ' righe)');
  }

  function wireToolbar() {
    var typeSel = document.getElementById('fdActivityLogTypeFilter');
    var search = document.getElementById('fdActivityLogSearch');
    var dateFrom = document.getElementById('fdActivityLogDateFrom');
    var dateTo = document.getElementById('fdActivityLogDateTo');
    var exportBtn = document.getElementById('fdActivityLogExportBtn');

    if (typeSel && !typeSel.dataset.fdWired) {
      typeSel.dataset.fdWired = '1';
      typeSel.addEventListener('change', onFiltersChange);
    }
    if (search && !search.dataset.fdWired) {
      search.dataset.fdWired = '1';
      search.addEventListener('input', onFiltersChange);
    }
    if (dateFrom && !dateFrom.dataset.fdWired) {
      dateFrom.dataset.fdWired = '1';
      dateFrom.addEventListener('change', onFiltersChange);
    }
    if (dateTo && !dateTo.dataset.fdWired) {
      dateTo.dataset.fdWired = '1';
      dateTo.addEventListener('change', onFiltersChange);
    }
    if (exportBtn && !exportBtn.dataset.fdWired) {
      exportBtn.dataset.fdWired = '1';
      exportBtn.addEventListener('click', exportCsv);
    }
  }

  function buildToolbar() {
    if (document.getElementById('fdActivityLogToolbar')) {
      wireToolbar();
      return;
    }
    var tableWrap = document.querySelector('#activity-log .pass-table-wrap');
    if (!tableWrap) return;

    var bar = document.createElement('div');
    bar.id = 'fdActivityLogToolbar';
    bar.className = 'fd-activity-log-toolbar fd-rbac-read-scope';
    bar.setAttribute('data-rbac-read-scope', 'true');
    bar.innerHTML =
      '<div class="fd-activity-log-toolbar__group">' +
      '<label class="fd-activity-log-toolbar__label" for="fdActivityLogTypeFilter">Tipo evento</label>' +
      '<select id="fdActivityLogTypeFilter" aria-label="Filtra per tipo evento"><option value="">Tutti</option></select>' +
      '</div>' +
      '<div class="fd-activity-log-toolbar__group fd-activity-log-toolbar__group--search">' +
      '<label class="fd-activity-log-toolbar__label" for="fdActivityLogSearch">Cerca</label>' +
      '<input type="search" id="fdActivityLogSearch" placeholder="Pass ID, device, dettagli…" autocomplete="off" aria-label="Cerca nel log attività">' +
      '</div>' +
      '<div class="fd-activity-log-toolbar__group">' +
      '<label class="fd-activity-log-toolbar__label" for="fdActivityLogDateFrom">Dal</label>' +
      '<input type="date" id="fdActivityLogDateFrom" aria-label="Filtra eventi dal">' +
      '</div>' +
      '<div class="fd-activity-log-toolbar__group">' +
      '<label class="fd-activity-log-toolbar__label" for="fdActivityLogDateTo">Al</label>' +
      '<input type="date" id="fdActivityLogDateTo" aria-label="Filtra eventi al">' +
      '</div>' +
      '<div class="fd-activity-log-toolbar__actions">' +
      '<button type="button" class="btn" id="fdActivityLogExportBtn" data-allow-readonly="true">Esporta CSV</button>' +
      '</div>' +
      '<p class="fd-activity-log-filter-hint" id="fdActivityLogFilterHint" aria-live="polite"></p>';

    tableWrap.parentNode.insertBefore(bar, tableWrap);
    wireToolbar();
  }

  function wireCopyDelegation() {
    var table = document.getElementById('activityLogTable');
    if (!table || table.dataset.fdCopyWired === '1') return;
    table.dataset.fdCopyWired = '1';
    table.addEventListener('click', function (e) {
      var btn = e.target.closest('.fd-activity-id-copy');
      if (!btn) return;
      e.preventDefault();
      var val = btn.getAttribute('data-copy-value');
      var label = btn.getAttribute('data-copy-label') || 'ID';
      copyValue(val, label);
      btn.classList.add('is-copied');
      setTimeout(function () {
        btn.classList.remove('is-copied');
      }, 1200);
    });
  }

  async function loadActivityLogEnhanced() {
    var body = document.getElementById('activityLogBody');
    if (!body) return;

    var brandId = typeof window.ensureBrandIdFromContext === 'function'
      ? window.ensureBrandIdFromContext()
      : window.brandId;
    if (!brandId) return;

    body.innerHTML = typeof window.renderTableSkeletonRows === 'function'
      ? window.renderTableSkeletonRows(8, 5)
      : '<tr><td colspan="5" style="color:var(--text2)">Caricamento…</td></tr>';

    try {
      var api = typeof window.API === 'string' && window.API ? window.API : '/api/v1';
      var headers = typeof window.getAuthHeaders === 'function' ? window.getAuthHeaders() : {};
      var res = await fetch(api + '/events/' + encodeURIComponent(brandId) + '?limit=250', {
        headers: headers
      });
      if (!res.ok) throw new Error((await res.json().catch(function () { return {}; })).error || res.status);
      var events = await res.json();
      cache = Array.isArray(events) ? events : [];
      populateTypeFilter();
      renderTableBody();
      syncActivityLogChrome();
      if (typeof window.fdRbacHook === 'function') window.fdRbacHook('activity-log');
    } catch (e) {
      body.innerHTML = typeof window.renderTableErrorRow === 'function'
        ? window.renderTableErrorRow(5, e.message || 'Errore caricamento log', 'loadActivityLog()')
        : '<tr><td colspan="5" style="color:var(--red)">Errore: ' + esc(e.message) + '</td></tr>';
    }
  }

  function patchLoader() {
    if (window.__fdActivityLogPatched) return;
    window.__fdActivityLogPatched = true;
    window.loadActivityLog = loadActivityLogEnhanced;
  }

  function syncActivityLogChrome() {
    if (typeof window.fdSyncAnalyticsHrChrome === 'function') {
      window.fdSyncAnalyticsHrChrome('activity-log');
    }
    var h1 = document.querySelector(
      '#analytics h1.page-title, #analytics h1.sec-title, #analytics h1.fd-page-header__title, #analytics .fd-page-header__title'
    );
    if (h1) h1.textContent = 'Log Attività';
  }

  function patchNav() {
    if (window.__fdActivityLogNavPatched || typeof window.nav !== 'function') return;
    window.__fdActivityLogNavPatched = true;
    var orig = window.nav;
    window.nav = function (sectionId, options) {
      var out = orig.apply(this, arguments);
      options = options || {};
      var resolved = typeof window.resolveNavTarget === 'function'
        ? window.resolveNavTarget(sectionId, options)
        : { section: sectionId, tab: options.tab || '' };
      var isActivityLog = sectionId === 'activity-log'
        || (resolved.section === 'analytics' && resolved.tab === 'activity-log');
      if (isActivityLog) {
        setTimeout(function () {
          syncActivityLogChrome();
          buildToolbar();
          wireCopyDelegation();
          if (typeof window.fdRbacHook === 'function') window.fdRbacHook('activity-log');
        }, 60);
      }
      return out;
    };
  }

  function init() {
    if (!isFilo()) return;
    var section = document.getElementById('activity-log');
    if (section) section.classList.add('activity-log--fd');
    patchLoader();
    patchNav();
    buildToolbar();
    wireCopyDelegation();
  }

  window.fdInitActivityLog = init;
  window.fdLoadActivityLog = loadActivityLogEnhanced;
  window.fdEventTypeLabel = eventTypeLabel;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


/* === fd-responsive-tables.js === */
/**
 * FD-DS FASE 3 — Responsive tables: scroll wrap + edge fade (≥768px), card rows (<768px).
 */
(function () {
  'use strict';

  var TABLE_SELECTOR = '.content .section .table:not(.import-preview-table)';
  var WRAP_SELECTOR = '.fd-table-wrap, .pass-table-wrap, .fd-users-table-wrap, .table-wrap';
  var enhanceTimer = null;
  var scrollFadeBound = false;

  function isFiloTablesApp() {
    if (document.documentElement.classList.contains('a2w-shell')) return false;
    try {
      if (window.__2WALLET_PRODUCT_LOCK__ === 'hr') return true;
    } catch (_) {}
    return document.documentElement.getAttribute('data-app') === 'filodiretto';
  }

  function headerLabel(th, index, total) {
    var text = String(th && th.textContent ? th.textContent : '').replace(/\s+/g, ' ').trim();
    if (!text && index === total - 1) return 'Azioni';
    return text || 'Campo ' + (index + 1);
  }

  function applyRowLabels(table) {
    var headers = Array.prototype.slice.call(table.querySelectorAll('thead th'));
    if (!headers.length) return;
    var labels = headers.map(function (th, i) {
      return headerLabel(th, i, headers.length);
    });
    var actionsIndex = labels.length - 1;

    table.querySelectorAll('tbody tr').forEach(function (tr) {
      if (
        tr.classList.contains('table-skeleton-row') ||
        tr.classList.contains('table-empty-row') ||
        tr.classList.contains('table-error-row')
      ) {
        tr.querySelectorAll('td').forEach(function (td) {
          td.classList.add('fd-table-card-full');
          td.removeAttribute('data-label');
        });
        return;
      }

      var cells = Array.prototype.slice.call(tr.querySelectorAll(':scope > td'));
      cells.forEach(function (td, i) {
        td.classList.remove('fd-table-card-full', 'fd-table-card-actions');
        if (td.colSpan > 1) {
          td.classList.add('fd-table-card-full');
          td.removeAttribute('data-label');
          return;
        }
        var label = labels[i] || '';
        td.setAttribute('data-label', label);
        if (i === actionsIndex || label === 'Azioni') {
          td.classList.add('fd-table-card-actions');
        }
      });
    });
  }

  function updateScrollFade(wrap) {
    if (!wrap) return;
    var scrollWidth = wrap.scrollWidth;
    var clientWidth = wrap.clientWidth;
    var scrollLeft = wrap.scrollLeft;
    var canScroll = scrollWidth > clientWidth + 2;
    wrap.classList.toggle('fd-table-wrap--scrollable', canScroll);
    wrap.classList.toggle('fd-table-wrap--at-start', !canScroll || scrollLeft <= 2);
    wrap.classList.toggle('fd-table-wrap--at-end', !canScroll || scrollLeft + clientWidth >= scrollWidth - 2);
  }

  function bindScrollFade(wrap) {
    if (!wrap || wrap.dataset.fdScrollFade === '1') return;
    wrap.dataset.fdScrollFade = '1';
    wrap.addEventListener(
      'scroll',
      function () {
        updateScrollFade(wrap);
      },
      { passive: true }
    );
    if (typeof ResizeObserver !== 'undefined') {
      var ro = new ResizeObserver(function () {
        updateScrollFade(wrap);
      });
      ro.observe(wrap);
      var table = wrap.querySelector('table');
      if (table) ro.observe(table);
    }
    requestAnimationFrame(function () {
      updateScrollFade(wrap);
    });
  }

  function normalizeWrap(wrap) {
    if (!wrap) return wrap;
    wrap.classList.add('fd-table-wrap', 'fd-table-wrap--fade');
    if (!wrap.getAttribute('role')) wrap.setAttribute('role', 'region');
    if (!wrap.getAttribute('aria-label')) wrap.setAttribute('aria-label', 'Tabella scorrevole');
    wrap.dataset.fdTableWrap = '1';
    bindScrollFade(wrap);
    return wrap;
  }

  function wrapTable(table) {
    if (!table || table.closest('.modal, dialog')) return null;
    var existing = table.closest(WRAP_SELECTOR);
    if (existing) return normalizeWrap(existing);

    var wrap = document.createElement('div');
    wrap.className = 'fd-table-wrap fd-table-wrap--fade';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
    normalizeWrap(wrap);
    return wrap;
  }

  function enhanceTable(table) {
    if (!table || table.closest('.modal, dialog')) return;
    wrapTable(table);
    table.classList.add('fd-table-cards');
    table.dataset.fdTableCards = '1';
    applyRowLabels(table);
  }

  function enhanceAllTables() {
    if (!isFiloTablesApp()) return;
    document.querySelectorAll(TABLE_SELECTOR).forEach(enhanceTable);
    document.querySelectorAll('#audiencesList .table').forEach(enhanceTable);
    document.querySelectorAll(WRAP_SELECTOR).forEach(normalizeWrap);
  }

  function scheduleEnhance() {
    if (enhanceTimer) clearTimeout(enhanceTimer);
    enhanceTimer = setTimeout(function () {
      enhanceTimer = null;
      enhanceAllTables();
    }, 40);
  }

  function bindGlobalScrollFadeRefresh() {
    if (scrollFadeBound) return;
    scrollFadeBound = true;
    window.addEventListener('resize', function () {
      document.querySelectorAll(WRAP_SELECTOR).forEach(updateScrollFade);
    });
  }

  function bindObserver() {
    var root = document.querySelector('.content');
    if (!root || root.dataset.fdTableObserver === '1') return;
    root.dataset.fdTableObserver = '1';
    var observer = new MutationObserver(scheduleEnhance);
    observer.observe(root, { childList: true, subtree: true });
  }

  function patchNav() {
    if (!isFiloTablesApp() || window.__fdTableNavPatched) return;
    if (typeof window.nav !== 'function') return;
    window.__fdTableNavPatched = true;
    var orig = window.nav;
    window.nav = function (id) {
      var out = orig.apply(this, arguments);
      scheduleEnhance();
      return out;
    };
  }

  function initFdResponsiveTables() {
    if (!isFiloTablesApp()) return;
    enhanceAllTables();
    bindObserver();
    bindGlobalScrollFadeRefresh();
    patchNav();
    window.addEventListener('resize', scheduleEnhance);
  }

  window.fdEnhanceResponsiveTables = enhanceAllTables;
  window.fdHeaderLabelForTable = headerLabel;
  window.fdWrapResponsiveTable = wrapTable;
  window.fdUpdateTableScrollFade = updateScrollFade;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFdResponsiveTables);
  } else {
    initFdResponsiveTables();
  }
})();


/* === fd-profile.js === */
/**
 * FD — FiloDiretto profile section (read-only account info + change password).
 */
(function () {
  'use strict';

  function isFiloProfileApp() {
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
    return {};
  }

  function toast(msg) {
    if (typeof window.toast === 'function') window.toast(msg);
  }

  function normalizeUserRole(role) {
    var r = String(role || 'manager').toLowerCase();
    if (r === 'viewer') return 'reporter';
    return r;
  }

  function roleLabel(role) {
    var r = normalizeUserRole(role);
    return {
      admin: 'Admin',
      manager: 'Manager',
      sender: 'Sender',
      reporter: 'Reporter'
    }[r] || role;
  }

  function resolveBrandLabel(user, brandMap) {
    if (!user) return '—';
    var role = normalizeUserRole(user.role);
    if (role === 'admin') return 'Tutti i brand';
    if (user.brand_id == null || user.brand_id === '') {
      return 'Nessun brand assegnato';
    }
    var bid = String(user.brand_id);
    if (brandMap && brandMap[bid]) return brandMap[bid];
    var sel = document.getElementById('brandSelector');
    if (sel) {
      var opt = Array.from(sel.options || []).find(function (o) { return String(o.value) === bid; });
      if (opt && opt.textContent) return String(opt.textContent).trim();
    }
    return bid.substring(0, 8) + '…';
  }

  async function loadBrandMap() {
    var map = {};
    try {
      if (window.brandsListCache && window.brandsListCache.length) {
        window.brandsListCache.forEach(function (b) {
          if (b && b.id) map[String(b.id)] = b.name || b.slug || String(b.id);
        });
      }
    } catch (_) {}
    if (Object.keys(map).length) return map;
    try {
      var res = await fetch(getApiBase() + '/brands', { headers: authHeaders() });
      if (!res.ok) return map;
      var brands = await res.json();
      (brands || []).forEach(function (b) {
        if (b && b.id) map[String(b.id)] = b.name || b.slug || String(b.id);
      });
    } catch (_) {}
    return map;
  }

  async function fetchCurrentUser() {
    try {
      var res = await fetch(getApiBase() + '/auth/me', { headers: authHeaders() });
      if (!res.ok) return window.currentUser || null;
      var data = await res.json();
      if (data && data.user) {
        if (typeof window.setCurrentUser === 'function') window.setCurrentUser(data.user);
        return data.user;
      }
    } catch (_) {}
    return window.currentUser || null;
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value || '—';
  }

  function ensureProfileChrome() {
    var section = document.getElementById('profile');
    if (!section) return;
    section.classList.add('profile--fd');
  }

  function wirePasswordForm() {
    if (document.body.dataset.fdProfilePasswordBound === '1') return;
    document.body.dataset.fdProfilePasswordBound = '1';
    var btn = document.getElementById('fdProfilePasswordBtn');
    if (!btn) return;
    btn.addEventListener('click', submitProfilePasswordChange);
  }

  function clearPasswordMessages() {
    var err = document.getElementById('fdProfilePasswordError');
    var ok = document.getElementById('fdProfilePasswordSuccess');
    if (err) { err.style.display = 'none'; err.textContent = ''; }
    if (ok) { ok.style.display = 'none'; ok.textContent = ''; }
  }

  async function submitProfilePasswordChange() {
    clearPasswordMessages();
    var currentEl = document.getElementById('fdProfileCurrentPassword');
    var nextEl = document.getElementById('fdProfileNewPassword');
    var confirmEl = document.getElementById('fdProfileConfirmPassword');
    var errEl = document.getElementById('fdProfilePasswordError');
    var okEl = document.getElementById('fdProfilePasswordSuccess');
    var btn = document.getElementById('fdProfilePasswordBtn');
    var current = currentEl ? currentEl.value : '';
    var next = nextEl ? nextEl.value : '';
    var confirm = confirmEl ? confirmEl.value : '';

    if (!current || !next) {
      if (errEl) {
        errEl.textContent = 'Inserisci la password attuale e quella nuova.';
        errEl.style.display = 'block';
      }
      return;
    }
    if (next.length < 8) {
      if (errEl) {
        errEl.textContent = 'La nuova password deve avere almeno 8 caratteri.';
        errEl.style.display = 'block';
      }
      return;
    }
    if (next !== confirm) {
      if (errEl) {
        errEl.textContent = 'La conferma non coincide con la nuova password.';
        errEl.style.display = 'block';
      }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio…'; }
    try {
      var res = await fetch(getApiBase() + '/auth/change-password', {
        method: 'PUT',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
        body: JSON.stringify({ current_password: current, new_password: next })
      });
      var data = {};
      try { data = await res.json(); } catch (_) {}
      if (!res.ok) {
        if (errEl) {
          errEl.textContent = data.error || 'Aggiornamento non riuscito';
          errEl.style.display = 'block';
        }
        return;
      }
      if (currentEl) currentEl.value = '';
      if (nextEl) nextEl.value = '';
      if (confirmEl) confirmEl.value = '';
      if (okEl) {
        okEl.textContent = 'Password aggiornata.';
        okEl.style.display = 'block';
      }
      toast('Password aggiornata');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Aggiorna password'; }
    }
  }

  async function fdLoadProfile() {
    if (!isFiloProfileApp()) return;
    ensureProfileChrome();
    wirePasswordForm();
    clearPasswordMessages();

    var user = await fetchCurrentUser();
    if (!user) return;

    var brandMap = await loadBrandMap();
    var name = String(user.name || '').trim() || '—';
    var email = String(user.email || '').trim() || '—';
    var role = roleLabel(user.role);

    setText('fdProfileName', name);
    setText('fdProfileEmail', email);
    setText('fdProfileBrand', resolveBrandLabel(user, brandMap));

    var roleEl = document.getElementById('fdProfileRole');
    if (roleEl) {
      roleEl.innerHTML = '<span class="fd-profile-role">' + esc(role) + '</span>';
    }
  }

  window.fdLoadProfile = fdLoadProfile;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (isFiloProfileApp()) ensureProfileChrome();
    });
  } else if (isFiloProfileApp()) {
    ensureProfileChrome();
  }
})();

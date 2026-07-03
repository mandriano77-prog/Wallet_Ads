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

  var WAI_HINT_KEY = 'fd-wai-hint-seen-v1';

  function maybeShowFirstUseHint(fab) {
    try { if (localStorage.getItem(WAI_HINT_KEY)) return; } catch (_) { return; }
    if (document.getElementById('fdWaiHint')) return;
    var hint = document.createElement('div');
    hint.id = 'fdWaiHint';
    hint.className = 'fd-wai-hint';
    hint.setAttribute('role', 'status');
    hint.innerHTML =
      '<button type="button" class="fd-wai-hint__close" aria-label="Chiudi">\u00d7</button>' +
      '<strong>Prova W.AI</strong>' +
      '<span>Scrive le notifiche e genera immagini per te. Es. \u201cAvvisa del cedolino di dicembre\u201d.</span>';
    document.body.appendChild(hint);
    function dismiss() {
      try { localStorage.setItem(WAI_HINT_KEY, '1'); } catch (_) {}
      hint.remove();
    }
    hint.querySelector('.fd-wai-hint__close').addEventListener('click', function (e) { e.stopPropagation(); dismiss(); });
    hint.addEventListener('click', function () {
      dismiss();
      if (typeof window.toggleWaiOverlay === 'function') window.toggleWaiOverlay();
    });
    // Auto-dismiss dopo 12s se ignorato (ma resta "visto" solo se interagito).
    setTimeout(function () { if (document.getElementById('fdWaiHint')) hint.remove(); }, 12000);
  }

  function bindWaiControls() {
    var fab = document.getElementById('waiBtn');
    if (!fab) return;
    bindWaiTrigger(fab, function (e) {
      if (typeof window.toggleWaiOverlay !== 'function') return;
      e.preventDefault();
      try { localStorage.setItem(WAI_HINT_KEY, '1'); } catch (_) {}
      var h = document.getElementById('fdWaiHint');
      if (h) h.remove();
      window.toggleWaiOverlay();
    });
    setTimeout(function () { maybeShowFirstUseHint(fab); }, 1500);
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

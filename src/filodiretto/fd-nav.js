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
      '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><circle cx="12" cy="11" r="3"/>',
    extra:
      '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>'
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

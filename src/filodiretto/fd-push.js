/**
 * FD-14 — FiloDiretto Push UI (FASE 4): preview, char limits, channel segmented, DS layout.
 */
(function () {
  'use strict';

  var TITLE_MAX = 22; // sync: src/engine/push-text-limits.js PUSH_TITLE_MAX
  var MESSAGE_MAX = 66; // sync: src/engine/push-text-limits.js PUSH_MESSAGE_MAX
  var BACK_DETAILS_MAX = 500; // sync: src/engine/push-text-limits.js PUSH_BACK_DETAILS_MAX
  var SCREEN_ALERT_MAX = 178; // sync: src/engine/push-text-limits.js PUSH_SCREEN_ALERT_MAX
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
      } else if (typeof alert === 'function') alert('Compila la notifica lock screen');
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
      } else if (typeof alert === 'function') {
        alert('Dettagli retro max ' + BACK_DETAILS_MAX + ' caratteri');
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
        } else if (typeof alert === 'function') alert('Errore: ' + errMsg);
        return;
      }
      localStorage.setItem(TEST_PASS_KEY, passId);
      var msg =
        typeof buildPushDeliveryMessage === 'function'
          ? buildPushDeliveryMessage(data)
          : 'Push di prova inviata';
      if (typeof toast === 'function') toast(msg);
      else if (typeof alert === 'function') alert(msg);
    } catch (e) {
      var failMsg = (e && e.name === 'AbortError')
        ? 'Invio non riuscito, riprova'
        : (e.message || 'Invio non riuscito, riprova');
      var failBanner = document.getElementById('pushSendError');
      if (failBanner) {
        failBanner.textContent = failMsg;
        failBanner.hidden = false;
      } else if (typeof alert === 'function') alert('Errore: ' + failMsg);
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

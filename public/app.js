(() => {
  'use strict';

  const ADMIN_KEY_STORAGE = 'uptimePulseAdminKey';

  const siteListEl = document.getElementById('site-list');
  const lastCheckedEl = document.getElementById('last-checked');
  const subscribeBtn = document.getElementById('subscribe-btn');
  const checkBtn = document.getElementById('check-btn');
  const installBtn = document.getElementById('install-btn');
  const howInstallBtn = document.getElementById('how-install-btn');
  const installSheet = document.getElementById('install-sheet');
  const sheetClose = document.getElementById('sheet-close');
  const subscribeStatusEl = document.getElementById('subscribe-status');
  const manageStatusEl = document.getElementById('manage-status');
  const statTotal = document.getElementById('stat-total');
  const statUp = document.getElementById('stat-up');
  const statDown = document.getElementById('stat-down');
  const addSiteForm = document.getElementById('add-site-form');
  const managePanel = document.querySelector('.manage-panel');
  const unlockBtn = document.getElementById('unlock-btn');
  const unlockSheet = document.getElementById('unlock-sheet');
  const unlockForm = document.getElementById('unlock-form');
  const unlockCancel = document.getElementById('unlock-cancel');
  const adminKeyInput = document.getElementById('admin-key-input');

  let deferredInstallPrompt = null;
  let adminUnlocked = Boolean(sessionStorage.getItem(ADMIN_KEY_STORAGE));

  function getAdminKey() {
    return sessionStorage.getItem(ADMIN_KEY_STORAGE) || '';
  }

  function setAdminKey(key) {
    sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    adminUnlocked = true;
    updateManageLock();
  }

  function clearAdminKey() {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    adminUnlocked = false;
    updateManageLock();
  }

  function updateManageLock() {
    if (!managePanel || !unlockBtn) return;
    managePanel.classList.toggle('locked', !adminUnlocked);
    unlockBtn.textContent = adminUnlocked ? 'Lock' : 'Unlock';
  }

  function setSubscribeMessage(message, type) {
    subscribeStatusEl.textContent = message || '';
    subscribeStatusEl.classList.remove('ok', 'err');
    if (type) subscribeStatusEl.classList.add(type);
  }

  function setManageMessage(message, type) {
    manageStatusEl.textContent = message || '';
    manageStatusEl.classList.remove('ok', 'err');
    if (type) manageStatusEl.classList.add(type);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatRelative(iso) {
    if (!iso) return 'never checked';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return 'never checked';

    const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  }

  function renderStats(sites) {
    const list = Array.isArray(sites) ? sites : [];
    statTotal.textContent = list.length;
    statUp.textContent = list.filter((site) => site.up === true).length;
    statDown.textContent = list.filter((site) => site.up === false).length;
  }

  function buildMeta(site) {
    const parts = [];

    if (site.responseTimeMs != null) {
      parts.push(`${site.responseTimeMs} ms`);
    }
    if (site.statusCode != null) {
      parts.push(`HTTP ${site.statusCode}`);
    }
    if (site.error) {
      parts.push(`<span class="fail">${escapeHtml(site.error)}</span>`);
    }
    parts.push(formatRelative(site.checkedAt));

    return parts.join('<span class="sep">•</span>');
  }

  function renderSites(sites) {
    siteListEl.classList.remove('skeleton');

    if (!Array.isArray(sites) || sites.length === 0) {
      siteListEl.innerHTML =
        '<li class="site-item"><div class="site-main"><div class="site-name">No sites yet</div><div class="site-meta">Unlock Manage URL list and add a website</div></div><span class="badge unknown">N/A</span></li>';
      return;
    }

    siteListEl.innerHTML = sites
      .map((site) => {
        const status = (site.status || 'UNKNOWN').toUpperCase();
        const badgeClass =
          status === 'UP' ? 'up' : status === 'DOWN' ? 'down' : 'unknown';
        const siteId = escapeHtml(site.id || site.url || '');

        return `
          <li class="site-item">
            <div class="site-main">
              <div class="site-name">${escapeHtml(site.name || site.domain || 'Site')}</div>
              <div class="site-url">
                <a href="${escapeHtml(site.url || '#')}" target="_blank" rel="noopener noreferrer">
                  ${escapeHtml(site.domain || site.url || '')}
                </a>
              </div>
              <div class="site-meta">${buildMeta(site)}</div>
            </div>
            <div class="site-actions">
              <span class="badge ${badgeClass}">${escapeHtml(status)}</span>
              ${
                adminUnlocked
                  ? `<button type="button" class="remove-btn" data-remove-id="${siteId}">Remove</button>`
                  : ''
              }
            </div>
          </li>
        `;
      })
      .join('');
  }

  function applyStatus(data) {
    renderSites(data.sites);
    renderStats(data.sites);
    lastCheckedEl.textContent = data.checkedAt
      ? `Last check ${formatRelative(data.checkedAt)}`
      : 'No checks recorded yet';
  }

  async function loadDashboard() {
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Status request failed (${response.status})`);
      }
      applyStatus(await response.json());
    } catch (error) {
      siteListEl.classList.remove('skeleton');
      lastCheckedEl.textContent = 'Status unavailable';
      setSubscribeMessage(error.message, 'err');
    }
  }

  async function runCheckNow() {
    checkBtn.disabled = true;
    checkBtn.textContent = 'Checking…';

    try {
      const response = await fetch('/api/run-check', { method: 'POST' });
      const data = await response.json().catch(() => ({}));

      if (response.ok || data.throttled) {
        applyStatus(data);
      }
      if (data.throttled) {
        setSubscribeMessage(data.error, 'err');
      } else if (!response.ok) {
        throw new Error(data.error || `Check failed (${response.status})`);
      }
    } catch (error) {
      setSubscribeMessage(error.message, 'err');
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = 'Check now';
    }
  }

  async function apiSites(method, body) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Admin-Key': getAdminKey(),
      Authorization: `Bearer ${getAdminKey()}`,
    };

    const response = await fetch('/api/sites', {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        clearAdminKey();
      }
      throw new Error(data.error || `Request failed (${response.status})`);
    }
    return data;
  }

  async function addSite(event) {
    event.preventDefault();

    if (!adminUnlocked) {
      openUnlockSheet();
      return;
    }

    const name = document.getElementById('site-name').value.trim();
    const url = document.getElementById('site-url').value.trim();
    const addBtn = document.getElementById('add-site-btn');

    addBtn.disabled = true;
    setManageMessage('Saving…');

    try {
      await apiSites('POST', { name, url });
      addSiteForm.reset();
      setManageMessage('Website added. Running a fresh check…', 'ok');
      await runCheckNow();
      await loadDashboard();
      setManageMessage('Website added to monitoring.', 'ok');
    } catch (error) {
      setManageMessage(error.message, 'err');
    } finally {
      addBtn.disabled = false;
    }
  }

  async function removeSite(id) {
    if (!adminUnlocked) {
      openUnlockSheet();
      return;
    }

    if (!window.confirm('Remove this website from monitoring?')) {
      return;
    }

    setManageMessage('Removing…');
    try {
      await apiSites('DELETE', { id });
      setManageMessage('Website removed.', 'ok');
      await loadDashboard();
    } catch (error) {
      setManageMessage(error.message, 'err');
    }
  }

  function openUnlockSheet() {
    unlockSheet.hidden = false;
    unlockSheet.classList.add('is-open');
    adminKeyInput.value = getAdminKey();
    setTimeout(() => adminKeyInput.focus(), 50);
  }

  function closeUnlockSheet() {
    unlockSheet.classList.remove('is-open');
    unlockSheet.hidden = true;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i += 1) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service workers are not supported in this browser.');
    }
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
    await navigator.serviceWorker.ready;
    return registration;
  }

  async function getVapidPublicKey() {
    const response = await fetch('/api/vapid-public-key', { cache: 'no-store' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Could not load VAPID public key');
    }
    const data = await response.json();
    if (!data.publicKey) {
      throw new Error('Server returned an empty VAPID public key');
    }
    return data.publicKey;
  }

  function isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }

  async function subscribeToPush() {
    if (!('Notification' in window) || !('PushManager' in window)) {
      if (isIos() && !isStandalone()) {
        throw new Error(
          'On iPhone you must add this app to your Home Screen first, then subscribe from there.'
        );
      }
      throw new Error('Push notifications are not supported in this browser.');
    }

    subscribeBtn.disabled = true;
    setSubscribeMessage('Requesting notification permission…');

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission was denied.');
    }

    setSubscribeMessage('Creating push subscription…');
    const registration = await registerServiceWorker();
    const vapidPublicKey = await getVapidPublicKey();

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    setSubscribeMessage('Saving subscription…');
    const response = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription.toJSON()),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Subscribe failed (${response.status})`);
    }

    subscribeBtn.textContent = 'Alerts Enabled';
    setSubscribeMessage(
      'This device will be notified whenever a monitored site goes down.',
      'ok'
    );
  }

  function openSheet() {
    installSheet.hidden = false;
    installSheet.classList.add('is-open');
  }

  function closeSheet() {
    installSheet.classList.remove('is-open');
    installSheet.hidden = true;
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installBtn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installBtn.hidden = true;
    setSubscribeMessage('App installed. Open it from your home screen.', 'ok');
  });

  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      openSheet();
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installBtn.hidden = true;
  });

  howInstallBtn.addEventListener('click', openSheet);
  sheetClose.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeSheet();
  });
  installSheet.addEventListener('click', (event) => {
    if (event.target === installSheet) closeSheet();
  });

  unlockBtn.addEventListener('click', () => {
    if (adminUnlocked) {
      clearAdminKey();
      setManageMessage('Management locked.', 'ok');
      loadDashboard();
      return;
    }
    openUnlockSheet();
  });

  unlockCancel.addEventListener('click', closeUnlockSheet);
  unlockSheet.addEventListener('click', (event) => {
    if (event.target === unlockSheet) closeUnlockSheet();
  });

  unlockForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const key = adminKeyInput.value.trim();
    if (!key) return;

    setAdminKey(key);

    try {
      // Validate the key without changing data: unknown id → 404 if authorized.
      const probe = await fetch('/api/sites?id=__auth_probe__', {
        method: 'DELETE',
        headers: {
          'X-Admin-Key': key,
          Authorization: `Bearer ${key}`,
        },
      });

      if (probe.status === 401) {
        clearAdminKey();
        setManageMessage('Wrong manage key.', 'err');
        return;
      }

      if (probe.status !== 404 && !probe.ok) {
        const data = await probe.json().catch(() => ({}));
        throw new Error(data.error || `Could not unlock (${probe.status})`);
      }

      closeUnlockSheet();
      setManageMessage('Unlocked. You can add or remove websites.', 'ok');
      await loadDashboard();
    } catch (error) {
      clearAdminKey();
      setManageMessage(error.message, 'err');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!installSheet.hidden) closeSheet();
    if (!unlockSheet.hidden) closeUnlockSheet();
  });

  siteListEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-id]');
    if (!button) return;
    removeSite(button.getAttribute('data-remove-id'));
  });

  addSiteForm.addEventListener('submit', addSite);
  checkBtn.addEventListener('click', runCheckNow);

  subscribeBtn.addEventListener('click', async () => {
    try {
      await subscribeToPush();
    } catch (error) {
      subscribeBtn.disabled = false;
      setSubscribeMessage(error.message, 'err');
    }
  });

  async function init() {
    updateManageLock();

    try {
      await registerServiceWorker();
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }

    await loadDashboard();

    if (isStandalone()) {
      installBtn.hidden = true;
      howInstallBtn.hidden = true;
    }

    if ('Notification' in window && Notification.permission === 'granted') {
      subscribeBtn.textContent = 'Alerts Enabled';
      setSubscribeMessage('Push permission already granted on this device.', 'ok');
    }
  }

  init();
  setInterval(loadDashboard, 60 * 1000);
})();

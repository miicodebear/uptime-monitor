(() => {
  'use strict';

  const siteListEl = document.getElementById('site-list');
  const lastCheckedEl = document.getElementById('last-checked');
  const subscribeBtn = document.getElementById('subscribe-btn');
  const checkBtn = document.getElementById('check-btn');
  const installBtn = document.getElementById('install-btn');
  const howInstallBtn = document.getElementById('how-install-btn');
  const installSheet = document.getElementById('install-sheet');
  const sheetClose = document.getElementById('sheet-close');
  const subscribeStatusEl = document.getElementById('subscribe-status');
  const statTotal = document.getElementById('stat-total');
  const statUp = document.getElementById('stat-up');
  const statDown = document.getElementById('stat-down');

  let deferredInstallPrompt = null;

  function setSubscribeMessage(message, type) {
    subscribeStatusEl.textContent = message || '';
    subscribeStatusEl.classList.remove('ok', 'err');
    if (type) subscribeStatusEl.classList.add(type);
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
        '<li class="site-item"><div class="site-main"><div class="site-name">No sites configured</div><div class="site-meta">Add URLs in lib/sites.js</div></div><span class="badge unknown">N/A</span></li>';
      return;
    }

    siteListEl.innerHTML = sites
      .map((site) => {
        const status = (site.status || 'UNKNOWN').toUpperCase();
        const badgeClass =
          status === 'UP' ? 'up' : status === 'DOWN' ? 'down' : 'unknown';

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
            <span class="badge ${badgeClass}">${escapeHtml(status)}</span>
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
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !installSheet.hidden) closeSheet();
  });

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

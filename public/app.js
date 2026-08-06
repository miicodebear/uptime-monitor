(() => {
  'use strict';

  const siteListEl = document.getElementById('site-list');
  const lastCheckedEl = document.getElementById('last-checked');
  const subscribeBtn = document.getElementById('subscribe-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const subscribeStatusEl = document.getElementById('subscribe-status');

  function setSubscribeMessage(message, type) {
    subscribeStatusEl.textContent = message || '';
    subscribeStatusEl.classList.remove('ok', 'err');
    if (type) subscribeStatusEl.classList.add(type);
  }

  function formatCheckedAt(iso) {
    if (!iso) return 'No checks yet';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'No checks yet';
    return `Last check · ${date.toLocaleString()}`;
  }

  function renderSites(sites) {
    siteListEl.classList.remove('skeleton');

    if (!Array.isArray(sites) || sites.length === 0) {
      siteListEl.innerHTML =
        '<li class="site-item"><div><div class="site-name">No sites configured</div><div class="site-url">Update lib/sites.js</div></div><span class="badge unknown">N/A</span></li>';
      return;
    }

    siteListEl.innerHTML = sites
      .map((site) => {
        const status = (site.status || 'UNKNOWN').toUpperCase();
        const badgeClass =
          status === 'UP' ? 'up' : status === 'DOWN' ? 'down' : 'unknown';
        const safeName = escapeHtml(site.name || site.domain || 'Site');
        const safeUrl = escapeHtml(site.url || '#');
        const displayUrl = escapeHtml(site.domain || site.url || '');

        return `
          <li class="site-item">
            <div>
              <div class="site-name">${safeName}</div>
              <div class="site-url"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${displayUrl}</a></div>
            </div>
            <span class="badge ${badgeClass}">${escapeHtml(status)}</span>
          </li>
        `;
      })
      .join('');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function fetchStatus() {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Status request failed (${response.status})`);
    }
    return response.json();
  }

  async function loadDashboard() {
    try {
      lastCheckedEl.textContent = 'Checking…';
      const data = await fetchStatus();
      renderSites(data.sites);
      lastCheckedEl.textContent = formatCheckedAt(data.checkedAt);
    } catch (error) {
      lastCheckedEl.textContent = 'Status unavailable';
      siteListEl.classList.remove('skeleton');
      setSubscribeMessage(error.message, 'err');
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

  async function saveSubscription(subscription) {
    const response = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `Subscribe failed (${response.status})`);
    }
    return data;
  }

  async function subscribeToPush() {
    if (!('Notification' in window) || !('PushManager' in window)) {
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

    setSubscribeMessage('Saving subscription to server…');
    await saveSubscription(subscription.toJSON());

    subscribeBtn.textContent = 'Alerts Enabled';
    setSubscribeMessage('You will receive a push when any monitored site goes down.', 'ok');
  }

  async function init() {
    try {
      await registerServiceWorker();
    } catch (error) {
      console.warn('Service worker registration failed:', error);
    }

    await loadDashboard();

    if (Notification.permission === 'granted') {
      subscribeBtn.textContent = 'Alerts Enabled';
      setSubscribeMessage('Push permission already granted on this device.', 'ok');
    }
  }

  subscribeBtn.addEventListener('click', async () => {
    try {
      await subscribeToPush();
    } catch (error) {
      subscribeBtn.disabled = false;
      setSubscribeMessage(error.message, 'err');
    }
  });

  refreshBtn.addEventListener('click', () => {
    loadDashboard();
  });

  init();
  setInterval(loadDashboard, 60 * 1000);
})();

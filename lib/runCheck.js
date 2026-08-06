const { getMonitoredSites } = require('./sitesStore');
const { checkUrl } = require('./check');
const { sendPushToAll } = require('./push');
const {
  getSubscriptions,
  removeSubscription,
  getStatus,
  saveStatus,
} = require('./storage');

function domainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Probes every configured site, persists the result, and pushes an alert for
 * each site that just transitioned from UP to DOWN.
 */
async function runCheck({ notify = true } = {}) {
  const sites = await getMonitoredSites();
  const previousStatus = (await getStatus()) || { sites: {} };
  const previousSites = previousStatus.sites || {};

  const results = [];
  const downAlerts = [];

  for (const site of sites) {
    const probe = await checkUrl(site.url);
    const domain = domainFromUrl(site.url);
    const previous = previousSites[site.url];
    const wasUp = previous ? previous.up !== false : true;

    const entry = {
      id: site.id || site.url,
      name: site.name,
      url: site.url,
      domain,
      up: probe.up,
      status: probe.up ? 'UP' : 'DOWN',
      statusCode: probe.statusCode,
      responseTimeMs: probe.responseTimeMs,
      error: probe.error,
      checkedAt: probe.checkedAt,
    };

    results.push(entry);

    if (!probe.up && wasUp) {
      downAlerts.push(entry);
    }
  }

  const statusPayload = {
    checkedAt: new Date().toISOString(),
    sites: results.reduce((acc, site) => {
      acc[site.url] = site;
      return acc;
    }, {}),
    list: results,
  };

  await saveStatus(statusPayload);

  const alertsSent = [];

  if (notify && downAlerts.length > 0) {
    const subscriptions = await getSubscriptions();

    for (const site of downAlerts) {
      const pushResult = await sendPushToAll(
        subscriptions,
        {
          title: 'Uptime Alert',
          body: `Alert: ${site.domain} is DOWN!`,
          url: site.url,
          domain: site.domain,
          name: site.name,
          statusCode: site.statusCode,
          error: site.error,
          checkedAt: site.checkedAt,
        },
        removeSubscription
      );

      alertsSent.push({ domain: site.domain, ...pushResult });
    }
  }

  return {
    checkedAt: statusPayload.checkedAt,
    sites: results,
    alertsSent,
  };
}

module.exports = { runCheck, domainFromUrl };

const sites = require('../lib/sites');
const { checkUrl } = require('../lib/check');
const { sendPushToAll } = require('../lib/push');
const {
  getSubscriptions,
  removeSubscription,
  getStatus,
  saveStatus,
} = require('../lib/storage');

/**
 * Website list is defined in lib/sites.js (single place to edit URLs).
 * Re-exported here so this function clearly owns the monitored set.
 */
const WEBSITES = sites;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed in production-like setups if secret is missing.
    return false;
  }

  const header = req.headers.authorization || '';
  if (header === `Bearer ${secret}`) {
    return true;
  }

  // Also allow ?secret= for cron providers that cannot set headers easily.
  const querySecret = req.query && req.query.secret;
  return querySecret === secret;
}

function domainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({
      error: 'Unauthorized. Provide Authorization: Bearer <CRON_SECRET> or ?secret=',
    });
  }

  try {
    const previousStatus = (await getStatus()) || { sites: {} };
    const previousSites = previousStatus.sites || {};

    const results = [];
    const downAlerts = [];

    for (const site of WEBSITES) {
      const probe = await checkUrl(site.url);
      const domain = domainFromUrl(site.url);
      const previous = previousSites[site.url] || previousSites[domain];
      const wasUp = previous ? previous.up !== false : true;

      const entry = {
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

      // Notify only on UP → DOWN transitions to avoid spamming every cron tick.
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

    const notifications = [];

    if (downAlerts.length > 0) {
      const subscriptions = await getSubscriptions();

      for (const site of downAlerts) {
        const payload = {
          title: 'Uptime Alert',
          body: `Alert: ${site.domain} is DOWN!`,
          url: site.url,
          domain: site.domain,
          name: site.name,
          statusCode: site.statusCode,
          error: site.error,
          checkedAt: site.checkedAt,
        };

        const pushResult = await sendPushToAll(
          subscriptions,
          payload,
          removeSubscription
        );

        notifications.push({
          domain: site.domain,
          ...pushResult,
        });
      }
    }

    return res.status(200).json({
      ok: true,
      checkedAt: statusPayload.checkedAt,
      sites: results,
      alertsSent: notifications,
    });
  } catch (error) {
    console.error('check-and-notify error:', error);
    return res.status(500).json({
      error: 'Check failed',
      details: error.message,
    });
  }
};

const sites = require('../lib/sites');
const { getStatus } = require('../lib/storage');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stored = await getStatus();

    const list = sites.map((site) => {
      const saved =
        (stored && stored.sites && stored.sites[site.url]) ||
        (stored &&
          stored.list &&
          stored.list.find((item) => item.url === site.url)) ||
        null;

      if (saved) {
        return {
          name: site.name,
          url: site.url,
          domain: saved.domain || domainFromUrl(site.url),
          up: saved.up,
          status: saved.up ? 'UP' : 'DOWN',
          statusCode: saved.statusCode,
          responseTimeMs: saved.responseTimeMs,
          error: saved.error || null,
          checkedAt: saved.checkedAt || null,
        };
      }

      return {
        name: site.name,
        url: site.url,
        domain: domainFromUrl(site.url),
        up: null,
        status: 'UNKNOWN',
        statusCode: null,
        responseTimeMs: null,
        error: null,
        checkedAt: null,
      };
    });

    return res.status(200).json({
      ok: true,
      checkedAt: (stored && stored.checkedAt) || null,
      sites: list,
    });
  } catch (error) {
    console.error('status error:', error);
    return res.status(500).json({
      error: 'Failed to load status',
      details: error.message,
    });
  }
};

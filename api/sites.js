const {
  getMonitoredSites,
  addSite,
  removeSite,
  MAX_SITES,
} = require('../lib/sitesStore');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key');
}

function getAdminSecret() {
  return process.env.ADMIN_SECRET || process.env.CRON_SECRET || '';
}

function isAuthorized(req) {
  const secret = getAdminSecret();
  if (!secret) return false;

  const header = req.headers.authorization || '';
  if (header === `Bearer ${secret}`) return true;

  const adminKey = req.headers['x-admin-key'];
  if (adminKey === secret) return true;

  if (req.query && req.query.secret === secret) return true;

  return false;
}

function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  try {
    if (req.method === 'GET') {
      const sites = await getMonitoredSites();
      return res.status(200).json({ ok: true, maxSites: MAX_SITES, sites });
    }

    if (!isAuthorized(req)) {
      return res.status(401).json({
        error: 'Unauthorized. Enter your manage key (same as CRON_SECRET unless ADMIN_SECRET is set).',
      });
    }

    if (req.method === 'POST') {
      const body = readBody(req);
      const result = await addSite({
        name: body.name,
        url: body.url,
      });
      return res.status(201).json({ ok: true, maxSites: MAX_SITES, ...result });
    }

    if (req.method === 'DELETE') {
      const body = readBody(req);
      const id = (req.query && (req.query.id || req.query.url)) || body.id || body.url;
      const result = await removeSite(id);
      return res.status(200).json({ ok: true, maxSites: MAX_SITES, ...result });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('sites api error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      error: error.message || 'Sites request failed',
    });
  }
};

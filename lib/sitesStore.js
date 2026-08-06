const defaultSites = require('./sites');
const { redisCommand } = require('./storage');

const SITES_KEY = 'uptime:sites';
const MAX_SITES = 10;

function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    throw new Error('URL is required');
  }

  let parsed;
  try {
    parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('URL must start with http:// or https://');
  }

  // Keep a stable string form (includes pathname/query if provided).
  return parsed.toString();
}

function normalizeName(name, url) {
  const cleaned = String(name || '').trim();
  if (cleaned) return cleaned.slice(0, 80);

  try {
    return new URL(url).hostname;
  } catch {
    return 'Website';
  }
}

function parseSites(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((item) => item && typeof item.url === 'string')
      .map((item) => ({
        id: item.id || item.url,
        name: normalizeName(item.name, item.url),
        url: item.url,
      }));
  } catch {
    return null;
  }
}

async function saveSites(sites) {
  await redisCommand(['SET', SITES_KEY, JSON.stringify(sites)]);
  return sites;
}

/**
 * Returns the editable site list. Seeds Redis from lib/sites.js on first use.
 */
async function getMonitoredSites() {
  const raw = await redisCommand(['GET', SITES_KEY]);
  const existing = parseSites(raw);

  if (existing && existing.length > 0) {
    return existing;
  }

  const seeded = (Array.isArray(defaultSites) ? defaultSites : []).map((site) => ({
    id: site.url,
    name: normalizeName(site.name, site.url),
    url: site.url,
  }));

  if (seeded.length > 0) {
    await saveSites(seeded);
  }

  return seeded;
}

async function addSite({ name, url }) {
  const normalizedUrl = normalizeUrl(url);
  const sites = await getMonitoredSites();

  if (sites.some((site) => site.url === normalizedUrl)) {
    throw Object.assign(new Error('That URL is already being monitored'), {
      statusCode: 409,
    });
  }

  if (sites.length >= MAX_SITES) {
    throw Object.assign(new Error(`You can monitor at most ${MAX_SITES} sites`), {
      statusCode: 400,
    });
  }

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: normalizeName(name, normalizedUrl),
    url: normalizedUrl,
  };

  sites.push(entry);
  await saveSites(sites);
  return { sites, added: entry };
}

async function removeSite(idOrUrl) {
  const key = String(idOrUrl || '').trim();
  if (!key) {
    throw Object.assign(new Error('Site id or url is required'), { statusCode: 400 });
  }

  const sites = await getMonitoredSites();
  const next = sites.filter((site) => site.id !== key && site.url !== key);

  if (next.length === sites.length) {
    throw Object.assign(new Error('Site not found'), { statusCode: 404 });
  }

  await saveSites(next);
  return { sites: next };
}

module.exports = {
  MAX_SITES,
  getMonitoredSites,
  addSite,
  removeSite,
  normalizeUrl,
};

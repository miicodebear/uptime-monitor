/**
 * Free persistent storage via Upstash Redis REST API (Hobby free tier).
 * Docs: https://upstash.com/docs/redis/overall/getstarted
 */

const SUBSCRIPTIONS_KEY = 'uptime:subscriptions';
const STATUS_KEY = 'uptime:status';

function getConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables'
    );
  }

  return { url, token };
}

async function redisCommand(command) {
  const { url, token } = getConfig();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstash Redis error (${response.status}): ${text}`);
  }

  const payload = await response.json();
  return payload.result;
}

async function getSubscriptions() {
  const raw = await redisCommand(['GET', SUBSCRIPTIONS_KEY]);
  if (!raw) return [];

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveSubscriptions(subscriptions) {
  await redisCommand(['SET', SUBSCRIPTIONS_KEY, JSON.stringify(subscriptions)]);
}

async function addSubscription(subscription) {
  const endpoint = subscription && subscription.endpoint;
  if (!endpoint) {
    throw new Error('Invalid subscription: missing endpoint');
  }

  const existing = await getSubscriptions();
  const withoutDuplicate = existing.filter((item) => item.endpoint !== endpoint);
  withoutDuplicate.push(subscription);
  await saveSubscriptions(withoutDuplicate);
  return withoutDuplicate.length;
}

async function removeSubscription(endpoint) {
  const existing = await getSubscriptions();
  const next = existing.filter((item) => item.endpoint !== endpoint);
  await saveSubscriptions(next);
  return next.length;
}

async function getStatus() {
  const raw = await redisCommand(['GET', STATUS_KEY]);
  if (!raw) return null;

  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

async function saveStatus(status) {
  await redisCommand(['SET', STATUS_KEY, JSON.stringify(status)]);
}

/**
 * Returns true only for the caller that wins the key within `seconds`.
 * Used to throttle the public manual-check endpoint.
 */
async function acquireCooldown(name, seconds) {
  const result = await redisCommand([
    'SET',
    `uptime:cooldown:${name}`,
    Date.now().toString(),
    'NX',
    'EX',
    String(seconds),
  ]);

  return result === 'OK';
}

module.exports = {
  getSubscriptions,
  addSubscription,
  removeSubscription,
  getStatus,
  saveStatus,
  acquireCooldown,
};

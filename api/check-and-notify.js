const { runCheck } = require('../lib/runCheck');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed if the secret was never configured.
    return false;
  }

  if ((req.headers.authorization || '') === `Bearer ${secret}`) {
    return true;
  }

  // Also allow ?secret= for cron providers that cannot set headers easily.
  return Boolean(req.query) && req.query.secret === secret;
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
    const result = await runCheck();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('check-and-notify error:', error);
    return res.status(500).json({
      error: 'Check failed',
      details: error.message,
    });
  }
};

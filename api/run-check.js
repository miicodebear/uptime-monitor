const { runCheck } = require('../lib/runCheck');
const { acquireCooldown, getStatus } = require('../lib/storage');

const COOLDOWN_SECONDS = 30;

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Public "Check now" trigger for the dashboard button.
 * Throttled so repeated clicks cannot hammer the monitored origins.
 */
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const allowed = await acquireCooldown('manual-check', COOLDOWN_SECONDS);

    if (!allowed) {
      const cached = await getStatus();
      return res.status(429).json({
        ok: false,
        throttled: true,
        error: `A check ran less than ${COOLDOWN_SECONDS}s ago. Showing the latest saved result.`,
        checkedAt: (cached && cached.checkedAt) || null,
        sites: (cached && cached.list) || [],
      });
    }

    const result = await runCheck();
    return res.status(200).json({ ok: true, ...result });
  } catch (error) {
    console.error('run-check error:', error);
    return res.status(500).json({
      error: 'Check failed',
      details: error.message,
    });
  }
};

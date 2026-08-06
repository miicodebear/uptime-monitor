const { addSubscription } = require('../lib/storage');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function isValidSubscription(subscription) {
  return Boolean(
    subscription &&
      typeof subscription.endpoint === 'string' &&
      subscription.endpoint.startsWith('https://') &&
      subscription.keys &&
      typeof subscription.keys.p256dh === 'string' &&
      typeof subscription.keys.auth === 'string'
  );
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const subscription = req.body;

    if (!isValidSubscription(subscription)) {
      return res.status(400).json({
        error: 'Invalid push subscription. Expected endpoint and keys.p256dh / keys.auth.',
      });
    }

    const count = await addSubscription({
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime || null,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });

    return res.status(201).json({
      ok: true,
      message: 'Subscription saved',
      subscriberCount: count,
    });
  } catch (error) {
    console.error('subscribe error:', error);
    return res.status(500).json({
      error: 'Failed to save subscription',
      details: error.message,
    });
  }
};

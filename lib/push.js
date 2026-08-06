const webpush = require('web-push');

function configureWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY environment variables');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return webpush;
}

/**
 * Send a push notification to every saved subscription.
 * Automatically drops expired / invalid subscriptions (410/404).
 */
async function sendPushToAll(subscriptions, payload, removeSubscription) {
  const webpushClient = configureWebPush();
  const body = JSON.stringify(payload);
  const staleEndpoints = [];

  const results = await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await webpushClient.sendNotification(subscription, body, {
          TTL: 60 * 60,
          urgency: 'high',
        });
        return { endpoint: subscription.endpoint, ok: true };
      } catch (error) {
        const statusCode = error.statusCode || error.status;
        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(subscription.endpoint);
        }
        return {
          endpoint: subscription.endpoint,
          ok: false,
          statusCode,
          message: error.message,
        };
      }
    })
  );

  if (typeof removeSubscription === 'function') {
    await Promise.all(
      staleEndpoints.map((endpoint) => removeSubscription(endpoint))
    );
  }

  return {
    sent: results.filter((r) => r.status === 'fulfilled' && r.value.ok).length,
    failed: results.filter((r) => r.status === 'fulfilled' && !r.value.ok).length,
    removed: staleEndpoints.length,
  };
}

module.exports = {
  configureWebPush,
  sendPushToAll,
};

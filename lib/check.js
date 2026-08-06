/**
 * HTTP probe tuned for Cloudflare-proxied origins.
 * Uses browser-like headers, follows redirects, and times out cleanly.
 */

const DEFAULT_TIMEOUT_MS = 12000;

async function checkUrl(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        // Cloudflare often challenges sparse / bot-like clients.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 UptimeMonitor/1.0',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });

    clearTimeout(timer);

    const responseTimeMs = Date.now() - startedAt;
    const statusCode = response.status;

    // Treat standard success codes as healthy. Cloudflare challenge pages
    // (often 403) are surfaced as DOWN so you can investigate WAF rules.
    const up = statusCode >= 200 && statusCode < 300;

    return {
      up,
      statusCode,
      responseTimeMs,
      error: up ? null : `HTTP ${statusCode}`,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    clearTimeout(timer);
    const responseTimeMs = Date.now() - startedAt;
    const aborted = error && error.name === 'AbortError';

    return {
      up: false,
      statusCode: null,
      responseTimeMs,
      error: aborted ? `Timeout after ${timeoutMs}ms` : error.message || 'Request failed',
      checkedAt: new Date().toISOString(),
    };
  }
}

module.exports = {
  checkUrl,
  DEFAULT_TIMEOUT_MS,
};

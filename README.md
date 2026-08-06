# Uptime Pulse — Free Vercel Uptime Monitor

A production-ready PWA that monitors 2–3 of your Cloudflare-backed websites and sends **Web Push** alerts naming exactly which domain went down. Everything runs on Vercel's free hobby tier, with free Upstash Redis for subscription/status storage and a free external cron (cron-job.org) to trigger checks.

---

## Project structure

```
uptime-monitor/
├── api/
│   ├── check-and-notify.js   # Ping sites + send push alerts
│   ├── status.js             # Dashboard status API
│   ├── subscribe.js          # Save push subscriptions
│   └── vapid-public-key.js   # Expose VAPID public key to the browser
├── lib/
│   ├── sites.js              # ← EDIT YOUR 3 WEBSITE URLS HERE
│   ├── check.js              # Cloudflare-friendly HTTP probe
│   ├── push.js               # web-push helpers
│   └── storage.js            # Upstash Redis persistence
├── public/
│   ├── index.html            # Dashboard UI
│   ├── styles.css
│   ├── app.js                # SW registration + subscribe + status fetch
│   ├── sw.js                 # Push + notificationclick handler
│   ├── manifest.json         # Standalone PWA manifest
│   └── icons/                # 192 / 512 PNG icons
├── package.json
├── vercel.json
└── README.md
```

---

## 1. Edit the websites to monitor

Open **`lib/sites.js`** and replace the placeholder URLs:

```js
module.exports = [
  { name: 'Website A', url: 'https://website-a.com' },
  { name: 'Website B', url: 'https://website-b.com' },
  { name: 'Website C', url: 'https://website-c.com' },
];
```

Use 2 or 3 entries. The dashboard and the checker both read from this single file.

---

## 2. Generate VAPID keys

VAPID keys authenticate your server with browser push services.

```bash
cd uptime-monitor
npm install
npx web-push generate-vapid-keys
```

You will see output like:

```
Public Key:
BNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Private Key:
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Save both. You will paste them into Vercel as environment variables.

Also pick a contact subject for VAPID, usually:

```text
mailto:you@example.com
```

---

## 3. Create a free Upstash Redis database

Serverless functions have no durable local disk, so subscriptions and latest status are stored in **Upstash Redis** (free Hobby tier).

1. Sign up at [https://upstash.com](https://upstash.com)
2. Create a **Redis** database (any free region close to you)
3. Open the database → **REST API**
4. Copy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

---

## 4. Deploy to Vercel

### Option A — Vercel CLI

```bash
npm i -g vercel
vercel login
vercel
```

### Option B — GitHub

1. Push this folder to a GitHub repository
2. Import the repo at [https://vercel.com/new](https://vercel.com/new)
3. Deploy

---

## 5. Environment variables (Vercel Dashboard)

In your Vercel project go to **Settings → Environment Variables** and add:

| Name | Value | Notes |
|------|-------|-------|
| `VAPID_PUBLIC_KEY` | *(from step 2)* | Public key from `web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | *(from step 2)* | Keep secret |
| `VAPID_SUBJECT` | `mailto:you@example.com` | Contact URI required by Web Push |
| `UPSTASH_REDIS_REST_URL` | *(from step 3)* | Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | *(from step 3)* | Upstash REST token |
| `CRON_SECRET` | long random string | Protects `/api/check-and-notify` |

Generate a strong `CRON_SECRET`, for example:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Apply the variables to **Production** (and Preview if you want), then **Redeploy** so the functions pick them up.

---

## 6. Connect a free cron timer (every 2–5 minutes)

Vercel Hobby does not include reliable built-in cron for this use case at zero cost in all plans, so use a free external ping service.

### Using [cron-job.org](https://cron-job.org)

1. Create a free account
2. Create a new cron job
3. **URL** (pick one style):

   **Header style (preferred):**
   ```text
   https://YOUR-PROJECT.vercel.app/api/check-and-notify
   ```
   Then under request headers add:
   ```text
   Authorization: Bearer YOUR_CRON_SECRET
   ```

   **Query style (if headers are awkward):**
   ```text
   https://YOUR-PROJECT.vercel.app/api/check-and-notify?secret=YOUR_CRON_SECRET
   ```

4. **Schedule:** every `2`–`5` minutes (e.g. every 5 minutes)
5. Method: `GET` or `POST`
6. Save and run once manually to verify

A successful response looks like:

```json
{
  "ok": true,
  "checkedAt": "2026-08-06T03:00:00.000Z",
  "sites": [
    { "name": "Website A", "domain": "website-a.com", "status": "UP", ... }
  ],
  "alertsSent": []
}
```

---

## 7. Enable push alerts on your phone / desktop

1. Open `https://YOUR-PROJECT.vercel.app`
2. Tap **Subscribe to Alerts**
3. Allow notifications when the browser prompts you
4. Keep the PWA installed (Add to Home Screen) for the most reliable delivery on mobile

When a site transitions from **UP → DOWN**, you get a notification such as:

```text
Alert: website-a.com is DOWN!
```

Tapping the notification opens that specific website. Alerts are sent only on the transition to DOWN so a 5-minute cron does not spam you while a site remains offline.

---

## Local development

```bash
npm install
npm i -g vercel
vercel dev
```

Copy the same environment variables into `.env.local` for local use:

```env
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
CRON_SECRET=dev-secret
```

Then hit:

```text
http://localhost:3000/api/check-and-notify?secret=dev-secret
```

---

## How Cloudflare handling works

`lib/check.js` probes each URL with:

- Browser-like `User-Agent` / `Accept` headers (reduces bot challenges)
- `GET` instead of `HEAD` (many origins block HEAD)
- 12s timeout with `AbortController`
- Redirect following
- Treats HTTP `200–399` as UP; everything else (or timeout) as DOWN

If Cloudflare returns a challenge page as `403`, the monitor marks the site DOWN so you can investigate WAF / bot-fight settings for your checker.

---

## Security notes

- `/api/check-and-notify` requires `CRON_SECRET` (header or query)
- VAPID private key and Upstash token stay server-side only
- Expired browser subscriptions (HTTP 404/410) are removed automatically
- Do not commit `.env` files

---

## Quick checklist

- [ ] Updated `lib/sites.js` with your real URLs
- [ ] Generated VAPID keys
- [ ] Created Upstash Redis + copied REST credentials
- [ ] Set all 6 environment variables on Vercel
- [ ] Deployed / redeployed
- [ ] Cron job hits `/api/check-and-notify` every 2–5 minutes with the secret
- [ ] Opened the dashboard and tapped **Subscribe to Alerts**

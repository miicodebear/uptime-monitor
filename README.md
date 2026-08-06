# Uptime Pulse — Free Vercel Uptime Monitor

A production-ready PWA that monitors 2–3 of your Cloudflare-backed websites and sends **Web Push** alerts naming exactly which domain went down. Everything runs on Vercel's free hobby tier, with free Upstash Redis for subscription/status storage and a free external cron (cron-job.org) to trigger checks.

---

## Project structure

```
uptime-monitor/
├── api/
│   ├── check-and-notify.js   # Cron entry point: ping sites + send push alerts
│   ├── run-check.js          # Public "Check now" button (30s cooldown)
│   ├── status.js             # Dashboard status API
│   ├── subscribe.js          # Save push subscriptions
│   └── vapid-public-key.js   # Expose VAPID public key to the browser
├── lib/
│   ├── sites.js              # ← EDIT YOUR WEBSITE URLS HERE
│   ├── runCheck.js           # Shared probe + persist + notify pipeline
│   ├── check.js              # Cloudflare-friendly HTTP probe
│   ├── push.js               # web-push helpers
│   └── storage.js            # Upstash Redis persistence
├── public/
│   ├── index.html            # Dashboard UI + install instructions
│   ├── styles.css
│   ├── app.js                # SW registration, subscribe, install, status
│   ├── sw.js                 # Push + notificationclick handler
│   ├── manifest.json         # Standalone PWA manifest
│   └── icons/                # 192 / 512 PNG icons
├── package.json
├── vercel.json
└── README.md
```

---

## Dashboard

The dashboard shows, for every monitored site:

- **UP / DOWN / UNKNOWN** badge
- Response time in milliseconds
- HTTP status code (or the timeout / connection error)
- How long ago the last check ran
- Summary tiles for monitored / online / offline counts

It refreshes automatically every 60 seconds. **Check now** triggers an
immediate probe through `/api/run-check`, which is throttled to one run per 30
seconds so the button cannot hammer your origins.

## Installing the app

Open the deployed URL and use **Install App** (Chrome / Edge) or
**How to install on my phone** for step-by-step instructions.

- **iPhone / iPad:** Safari → Share → Add to Home Screen. iOS only delivers web
  push to apps launched from the home screen, so install before subscribing.
- **Android:** Chrome → ⋮ → Install app.
- **Desktop:** click the install icon in the address bar.

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

## Automatic checks (no “Check now” needed)

Push alerts are sent by the server when a site transitions **UP → DOWN**.
That only happens when `/api/check-and-notify` is called on a schedule.

This repo includes a **GitHub Actions** workflow
(`.github/workflows/uptime-check.yml`) that hits that endpoint about every
**5 minutes**. Keep the page closed — monitoring still runs.

Required GitHub setup (one time):

1. Repo → **Settings → Secrets and variables → Actions**
2. Secret `CRON_SECRET` = the same value as on Vercel
3. Optional variable `CHECK_URL` =
   `https://uptime.codebear.win/api/check-and-notify`

You can also use [cron-job.org](https://cron-job.org) with the same URL and
`?secret=YOUR_CRON_SECRET` if you prefer.
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

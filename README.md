# FleetTrack

A real-time fleet-management dashboard built with Node.js, Express, Socket.IO and SQLite. It ships with a seeded fleet of 152 vehicles and drivers, 342 shipments, 90 days of analytics history, and a live telemetry simulator so every screen is populated from the first run.

The UI follows the supplied Fleet Overview / Recent Deliveries visual direction: a light slate workspace, blue accents, compact cards, data-dense tables and status chips. Analytics, Driver Scores and Alerts use the same design system.

## Features

- **Live network map** — 152 GPS vehicle markers, status colours, clickable inspector, live telemetry updates.
- **Fleet overview** — vehicle totals, utilisation, recent dispatch table, weekly fuel and driver-efficiency charts.
- **Deliveries** — search, filters, pagination, detail panel with milestones, BOL/POD documents, create-shipment flow, CSV export.
- **Analytics** — 7/30/90-day ranges, switchable performance chart, fuel efficiency, on-time performance, regional table, driver leaders, CSV export.
- **Driver Scores** — searchable roster, leaderboard, distribution tiers, driver profile modal with score history.
- **Alerts** — severity/status filters, live alert feed, detail modal, acknowledge/resolve actions, bulk acknowledge.
- **Authentication** — scrypt password hashing, HttpOnly JWT cookie, page/API guards, same-origin mutation checks, rate limiting.
- **Real time** — Socket.IO pushes telemetry, shipment progress/completion, alert creation and badge counters.
- **HTTPS ready** — self-signed local dev mode plus reverse-proxy/production TLS support.
- **Deployment ready** — Render blueprint, Dockerfile, health check, production environment template.

## Stack

| Layer | Choice |
| --- | --- |
| Runtime | Node.js 22.5+ (uses built-in `node:sqlite`) |
| Server | Express 5, Socket.IO 4 |
| Database | SQLite (no ORM, no external service) |
| Auth | JSON Web Token in a HttpOnly cookie, scrypt hashes |
| Frontend | Server-rendered HTML + vanilla ES modules |
| Styling | Tailwind CSS (compiled) |
| Maps / icons | Leaflet, Lucide (vendored locally) |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
#    Windows PowerShell
Copy-Item .env.example .env
#    macOS / Linux
cp .env.example .env

# 3. Build the CSS and vendor assets
npm run build

# 4. Start the app (seeds the database on first launch)
npm start
```

Open <http://localhost:3000>.

Demo credentials:

```text
Email:    admin@fleettrack.app
Password: Fleet123!
```

The app reseeds automatically only when the database is empty. To reset the demo data at any time:

```bash
npm run seed
```

## Local HTTPS

```bash
npm run dev:https
```

This creates a self-signed certificate in `.cert/`, starts the app on <https://localhost:3443>, and enables secure cookies. The browser will show a certificate warning for the local self-signed cert.

For a trusted certificate in production, terminate TLS at your proxy/platform and set:

```dotenv
NODE_ENV=production
COOKIE_SECURE=true
TRUST_PROXY=1
FORCE_HTTPS=true
JWT_SECRET=<a-long-random-value>
```

The Express server also reads `HTTPS_KEY` and `HTTPS_CERT` directly when you want Node to terminate TLS itself.

## Scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the production server |
| `npm run dev` | Start with Node's watch mode |
| `npm run dev:https` | Self-signed HTTPS dev server on port 3443 |
| `npm run build` | Compile Tailwind CSS and copy Leaflet/Lucide into `public/vendor` |
| `npm run seed` | Reset and reseed the demo database |
| `npm test` | Run the unit tests in `tests/` |

## Environment variables

See `.env.example` for the full list.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Enables production security defaults |
| `JWT_SECRET` | dev-only fallback | **Required in production** |
| `COOKIE_SECURE` | `NODE_ENV === production` | Send the session cookie over HTTPS only |
| `FORCE_HTTPS` | `false` | Redirect HTTP to HTTPS; rejects HTTP API calls |
| `TRUST_PROXY` | `0` (dev) / `1` (prod) | Express proxy trust for forwarded headers |
| `DB_PATH` | `./data/fleettrack.db` | SQLite file location |
| `SIMULATION` | `true` | Enable the live telemetry simulator |
| `SIMULATOR_INTERVAL_MS` | `5000` | Telemetry tick interval |
| `HTTPS_KEY` / `HTTPS_CERT` | — | Node TLS key/cert paths |

## Project structure

```text
fleettrack/
├─ server/
│  ├─ index.js            Express, Socket.IO, TLS, page routes
│  ├─ config.js           Environment configuration
│  ├─ db.js               SQLite schema + query helpers
│  ├─ auth.js             Password, JWT and cookie helpers
│  ├─ seed.js             Demo data generator
│  ├─ simulator.js        Live GPS / shipment / alert simulation
│  ├─ http.js             Error handling and origin checks
│  ├─ lib/
│  │  ├─ fleet.js         Fleet summaries, serializers, aggregates
│  │  └─ geo.js           Cities, distances, route helpers
│  └─ routes/             auth, dashboard, deliveries, vehicles,
│                         drivers, alerts, analytics
├─ views/                 HTML pages (login, overview, deliveries, …)
├─ public/
│  ├─ js/                 ES-module frontend (charts, map, realtime, pages)
│  ├─ assets/             Compiled Tailwind CSS + favicon
│  └─ vendor/             Leaflet, Lucide, marker images
├─ src/styles.css         Tailwind source + component layer
├─ tests/                 Node test-runner unit tests
├─ scripts/               Build helpers, HTTPS dev launcher
├─ Dockerfile
├─ render.yaml
└─ .env.example
```

## API overview

All API routes require a valid session cookie except `/api/health` and the auth endpoints. Mutating requests also require a same-origin `Origin` header.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Sign in and set the session cookie |
| `POST` | `/api/auth/logout` | Clear the session |
| `GET` | `/api/auth/me` | Current user |
| `GET` | `/api/dashboard` | Overview payload (summary, shipments, charts, alerts, vehicles) |
| `GET` | `/api/dashboard/summary` | Live fleet summary |
| `GET` | `/api/deliveries` | Filtered, paginated shipment list |
| `GET` | `/api/deliveries/meta` | Vehicles, cities, cargo types for creation |
| `GET` | `/api/deliveries/:id` | Shipment detail and milestone events |
| `POST` | `/api/deliveries` | Create a shipment |
| `PATCH` | `/api/deliveries/:id/status` | Update shipment status |
| `GET` | `/api/deliveries/export.csv` | CSV export |
| `GET` | `/api/vehicles/live` | Live vehicle positions |
| `GET` | `/api/drivers` | Roster, tier distribution, leaders |
| `GET` | `/api/drivers/:id` | Driver profile and score history |
| `GET` | `/api/alerts` | Alert feed and severity counts |
| `PATCH` | `/api/alerts/:id/acknowledge` | Acknowledge an alert |
| `PATCH` | `/api/alerts/:id/resolve` | Resolve an alert |
| `POST` | `/api/alerts/acknowledge-all` | Acknowledge every active alert |
| `GET` | `/api/analytics?range=7\|30\|90` | KPI series, regions, fleet mix, leaders |

### Socket.IO events

| Event | Direction | Payload |
| --- | --- | --- |
| `connected` | server → client | Session user and timestamp |
| `fleet:positions` | server → client | `{ vehicles, generatedAt }` |
| `fleet:tick` | server → client | `{ updates, completed, summary, generatedAt }` |
| `fleet:summary` | server → client | `{ summary }` |
| `shipment:created` | server → client | `{ shipment }` |
| `shipment:updated` | server → client | `{ shipment }` |
| `alert:new` | server → client | `{ alert, summary }` |
| `alert:updated` | server → client | `{ alert, summary }` |
| `alerts:bulk-updated` | server → client | `{ count }` |

## Deployment

### Render (recommended)

The included `render.yaml` is a Render Blueprint. Full account-level steps are in [DEPLOY.md](DEPLOY.md).

Short version:

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint**, connect the repo and apply.
3. Render runs `npm ci && npm run build`, starts `npm start`, generates `JWT_SECRET`, enables secure cookies and HTTPS, and health-checks `/api/health`.
4. HTTPS and WSS are provided automatically by Render.

> Render's free plan has an ephemeral filesystem. The SQLite file is recreated and reseeded after every deploy/restart. Attach a paid persistent disk and point `DB_PATH` at it if data must survive.

### Docker

```bash
docker build -t fleettrack .
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET="$(openssl rand -hex 64)" \
  -e COOKIE_SECURE=false \
  -v fleettrack-data:/app/data \
  fleettrack
```

Set `COOKIE_SECURE=true` and put the container behind an HTTPS reverse proxy before exposing it to the internet.

### Health check

```bash
curl http://localhost:3000/api/health
```

## Security notes

- Demo credentials are intentionally public for this showcase. Change the seeded admin account before using the app with real data.
- `JWT_SECRET` must be a long random value in production; the server refuses to start without it when `NODE_ENV=production`.
- Sessions are HttpOnly, `SameSite=Strict` cookies. Enable `COOKIE_SECURE` and HTTPS in production.
- The app is a demo workspace: telemetry and shipment progress are simulated, and invoices/PODs are illustrative.

## License

MIT

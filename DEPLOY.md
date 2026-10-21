# Deploying FleetTrack

This project is ready to publish from any GitHub account. Publishing under a specific person's account requires signing in as that account (or being added as a collaborator/owner of the repository). The active GitHub CLI session on this machine belongs to a different account, so the final push is intentionally left to the account owner.

## 1. Publish the repository

Sign in to GitHub as the account that should own the deployment, then from the project folder:

```bash
git init
git add .
git commit -m "FleetTrack — real-time fleet management dashboard"
git branch -M main
git remote add origin https://github.com/<ACCOUNT>/fleettrack.git
git push -u origin main
```

If the repository already exists, replace the remote URL or add a collaborator instead.

## 2. Deploy on Render

1. Open <https://dashboard.render.com/blueprints>.
2. Choose **New Blueprint Instance**.
3. Connect the GitHub repository from step 1.
4. Render detects `render.yaml`. Confirm the service and click **Apply**.

The blueprint configures:

- Build: `npm ci && npm run build`
- Start: `npm start`
- Health check: `/api/health`
- `NODE_ENV=production`
- A generated `JWT_SECRET`
- Secure cookies, HTTPS redirects and proxy trust
- Live simulation enabled

The first deploy takes a few minutes. When it finishes, Render shows a URL such as `https://fleettrack-xxxx.onrender.com` with a valid TLS certificate. Sign in with the demo credentials from the README.

## 3. Optional: persistent SQLite storage

The free plan uses an ephemeral filesystem, so the demo database is recreated on each deploy or restart. That is acceptable for a showcase because the app seeds itself.

For persistence:

1. Upgrade the service to a plan that supports disks.
2. Add a disk mounted at `/var/data`.
3. Set `DB_PATH=/var/data/fleettrack.db`.
4. Redeploy.

The app creates and seeds the database automatically when the file is empty.

## 4. Optional: custom domain

In Render: **Service → Settings → Custom Domains**. Add the domain and create the DNS records Render shows. TLS is provisioned automatically.

## Alternative hosts

### Docker anywhere (Railway, Fly.io, VPS)

```bash
docker build -t fleettrack .
docker run -d --name fleettrack -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET="$(openssl rand -hex 64)" \
  -e COOKIE_SECURE=true \
  -e TRUST_PROXY=1 \
  -e FORCE_HTTPS=true \
  -v fleettrack-data:/app/data \
  fleettrack
```

Terminate TLS at the host or a reverse proxy (Caddy, nginx, Cloudflare) and forward WebSocket upgrades for `/socket.io`.

### Plain Node process with systemd

```ini
[Unit]
Description=FleetTrack
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/fleettrack
EnvironmentFile=/opt/fleettrack/.env
ExecStart=/usr/bin/node server/index.js
Restart=always
User=fleettrack

[Install]
WantedBy=multi-user.target
```

Put nginx/Caddy in front for HTTPS and proxy both normal requests and `/socket.io` WebSockets.

## Verification checklist

After deploying, confirm:

- `GET /api/health` returns `{"status":"ok","database":"ok"}`.
- `/login` is reachable over HTTPS.
- Sign-in redirects to the fleet overview.
- The map shows vehicle markers.
- Metrics and alerts update without a page reload.
- The browser console has no CSP or WebSocket errors.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Redirect loop on Render | Keep `TRUST_PROXY=1` and `FORCE_HTTPS=true` behind the proxy. |
| Login does not persist | Set `COOKIE_SECURE=true` only when the site is served over HTTPS. |
| WebSocket errors | Ensure the proxy forwards `/socket.io` upgrades; Socket.IO uses the same origin. |
| 500 on first request | Check the deploy log for `JWT_SECRET` validation or SQLite permissions. |
| Demo data vanished | Expected on ephemeral hosts; attach a persistent disk or reseed with `npm run seed`. |

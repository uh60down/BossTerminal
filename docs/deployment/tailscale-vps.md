# Deploying to a VPS behind Tailscale Serve

Runs BossTerminal 24/7 on a small VPS with **zero public application
ports** — access is private to your tailnet, and Tailscale Serve supplies
HTTPS, so no reverse proxy, public DNS record, or public firewall rule is
needed for the app itself.

```
Mac / Android
      │  Tailscale (WireGuard, private)
      ▼
Tokyo VPS
      │  tailscale serve → 127.0.0.1:3000  (HTTPS terminates here)
      ▼
BossTerminal Docker Compose (api + web, both bound to 127.0.0.1 only)
      │
      ▼
terminal-data volume (SQLite, WAL) ──► daily backup snapshots (deploy/backup/)
```

Nothing in this topology changes BossTerminal's own defaults — `api` and
`web` stay bound to `127.0.0.1` exactly as `docker-compose.yml` already
does. Tailscale Serve is what makes that private, `127.0.0.1`-only service
reachable from your other devices, over HTTPS, without publishing it.

<br/>

## 1. Provision the VPS

Any Tokyo-region VPS works (the ones I'm aware of: Vultr Tokyo, Linode/
Akamai Tokyo, AWS Lightsail ap-northeast-1, GCP asia-northeast1, Oracle
Cloud ap-tokyo-1 — pick on price/reputation, nothing here is provider-
specific). OS: Ubuntu 22.04/24.04 LTS or Debian 12.

### Resource requirements

| | vCPU | RAM | Disk |
|---|---|---|---|
| **Minimum** (won't comfortably `docker compose up --build` in place) | 1 | 1 GB + 1 GB swap | 15 GB |
| **Recommended** (build in place, room for OS + Tailscale + backups) | 2 | 2 GB | 20–25 GB |

Why: `next build` (the `web` image's build stage) is the heaviest single
step — it can transiently need noticeably more RAM than the app uses at
runtime, and a 1 GB box without swap risks the build getting OOM-killed.
The running containers themselves are light (see the `mem_limit`s in
`docker-compose.prod.yml`: 512 MB each for `api`/`web`, 128 MB for the
backup job — call it ~1.2 GB ceiling for the whole stack), it's the build
step that wants headroom. If you're stuck on a 1 GB box, add swap:

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # log out/in for this to take effect
```

<br/>

## 2. Install Tailscale and enable Serve

```bash
curl -fsSL https://tailscale.com/install.sh | sudo sh
sudo tailscale up
```

Follow the printed link to authenticate the node to your tailnet.

**One-time tailnet setting:** in the [admin console](https://login.tailscale.com/admin/dns),
under DNS, enable **MagicDNS** and **HTTPS Certificates** — Tailscale Serve
needs the latter to issue a cert for your node's `*.ts.net` name.

Now point Serve at the web container's port:

```bash
sudo tailscale serve --bg 3000
```

`--bg` makes this persist across reboots (`tailscaled` reapplies it on
start — no separate systemd unit needed for Serve itself). This publishes
`https://<this-machine>.<your-tailnet>.ts.net/`, proxying to
`http://127.0.0.1:3000`. Confirm with:

```bash
tailscale serve status
```

Do **not** use `tailscale funnel` — that's the public-internet-facing
sibling of `serve` and is the opposite of what this topology wants.

To avoid `sudo` on every `tailscale serve` call, optionally set yourself
as the operator once: `sudo tailscale set --operator="$USER"`.

If you share this tailnet with other people and want to restrict who can
reach this node specifically, add an ACL grant in the admin console —
skip this if it's just your own devices on the tailnet.

<br/>

## 3. Lock down the public interface

The VPS's public IP should answer nothing app-related. Tailscale's own
traffic (UDP, direct or via DERP relay) doesn't need an inbound allow rule
on most cloud firewalls' default egress-open/ingress-closed posture, but
explicitly:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow in on tailscale0
sudo ufw enable
```

This also blocks port 22 from the public internet. If you need SSH,
either keep a narrowly-scoped `ufw allow from <your-ip> to any port 22`,
or better, use Tailscale for SSH too and drop port 22 entirely:

```bash
sudo tailscale up --ssh
```

Either way: **never** add `ufw allow 3000` / `4000` / `80` / `443` — the
whole point of this topology is that those never need a public rule.

<br/>

## 4. Clone, configure, and start

```bash
sudo mkdir -p /opt/bossterminal && sudo chown "$USER" /opt/bossterminal
git clone <your-fork-url> /opt/bossterminal
cd /opt/bossterminal
cp .env.production.example .env
```

Edit `.env`:

- `API_KEY` — generate with `openssl rand -hex 32`. This is a shared
  secret between the `web` and `api` containers; it never reaches the
  browser (see `web/lib/api-key.ts` / the `/api/*` proxy route) — the
  browser only ever talks to the `web` container's own origin.
- `WEB_ORIGIN` — the exact Tailscale Serve HTTPS URL from step 2, e.g.
  `https://bossterminal.your-tailnet.ts.net`. This has to match precisely:
  it's what `api`'s CORS check compares the browser's `Origin` header
  against (belt-and-suspenders here, since `api` isn't reachable outside
  `127.0.0.1` in this topology anyway, but keep it correct in case that
  ever changes).
- `ANTHROPIC_API_KEY` — optional, only if you want the AI widget.
- `TRUST_PROXY` — see the callout below before setting this.

Then:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose ps   # both services should report "healthy" within ~30s
```

Visit `https://<your-tailscale-name>.ts.net` from any device on the
tailnet.

### Should I set `TRUST_PROXY`?

`server/src/index.ts` only trusts `X-Forwarded-For` (used for the
`/api/ai` per-caller rate limit) when `TRUST_PROXY=1`, and only because
in this topology Tailscale Serve is the one process sitting in front of
`web` — the situation the code comment describes as safe ("a trusted
reverse proxy... that sets X-Forwarded-For from the real client and
doesn't let visitors set it themselves"). Before enabling it, confirm
Tailscale Serve is actually overwriting that header rather than passing
through a client-supplied one on your installed version — safest way is
a quick manual check (e.g. temporarily log `req.headers['x-forwarded-for']`
in `web/app/api/[...path]/route.ts` and compare against what a request
with a forged header produces). For a solo/couple-of-devices setup, this
barely matters either way — worst case without it, your devices share one
rate-limit bucket instead of getting one each.

<br/>

## 5. Automated SQLite backups

`deploy/backup/` builds a minimal image (`alpine` + `sqlite`) that runs
`sqlite3 <db> ".backup <snapshot>"` — the SQLite **online backup API**,
safe to run against a live WAL-mode database without stopping the app —
then prunes snapshots older than `BACKUP_RETENTION_DAYS` (default 14).

It's defined with `profiles: ["backup"]` in `docker-compose.prod.yml`, so
it never starts with `up` — only when explicitly run:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --profile backup run --rm backup
```

Schedule it with the provided systemd timer:

```bash
sudo cp deploy/systemd/*.service deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now bossterminal.service        # app stack on boot
sudo systemctl enable --now bossterminal-backup.timer    # daily backup
```

Check it worked:

```bash
systemctl list-timers bossterminal-backup.timer
sudo journalctl -u bossterminal-backup.service --since today
ls -lh /opt/bossterminal/backups/
```

Backups land in `./backups/` on the VPS (gitignored). This is
**local-to-the-VPS retention**, not off-site — if you want a copy
somewhere else too, the backup script's job ends once the snapshot file
exists in `./backups/`, so bolt on `rclone copy`/`rsync` to your own
destination as a line at the end of `deploy/backup/backup-sqlite.sh`, or
a second systemd timer that ships the latest file off-box; not included
here since it depends on where you'd want it to go.

<br/>

## 6. Restart policy and healthchecks — what's actually in place

- Both Dockerfiles define a `HEALTHCHECK` (`api` polls its own
  `/api/status`; `web` polls its own `/`, independent of `api`'s health —
  each container reports on its own concern, not its dependency's).
- `docker-compose.prod.yml` makes `web` wait for `api` to report healthy
  (`depends_on: condition: service_healthy`) before starting, instead of
  just "container exists" (the base `depends_on` semantics).
- Containers keep `restart: unless-stopped` from the base
  `docker-compose.yml` rather than `restart: always`. The difference only
  shows up around a deliberate `docker compose stop` followed by a host
  reboot: `unless-stopped` honors that you meant to stop it;`always` would
  bring it back up anyway. For a box you maintain yourself, `unless-stopped`
  is the less surprising choice — it still restarts on crash or reboot,
  it just doesn't fight you during planned maintenance.
- `bossterminal.service` (step 5) brings the stack up on boot even before
  any container has had a chance to restart itself, and gives you
  `systemctl {start,stop,restart} bossterminal` as the normal way to
  manage the whole stack instead of raw `docker compose` invocations.

<br/>

## 7. Upgrading

```bash
cd /opt/bossterminal
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

The `terminal-data` volume (and hence your portfolio data) is untouched
by this — it's only removed by `docker compose down -v`, which nothing
here does.

<br/>

## Troubleshooting

- **`tailscale serve status` shows nothing / 404 on the `.ts.net` URL** —
  re-run `sudo tailscale serve --bg 3000`; confirm the web container is
  actually listening (`docker compose ps`, `curl 127.0.0.1:3000` on the
  VPS itself).
- **Browser gets a cert warning** — HTTPS Certificates isn't enabled for
  the tailnet yet (step 2's admin console setting), or you're hitting the
  VPS's IP/hostname directly instead of the `.ts.net` name.
- **`web` never goes healthy** — check `docker compose logs api` first;
  `web`'s healthcheck only depends on `web` itself, but its `up` sequence
  waits on `api` being healthy, so a broken `api` blocks `web` from
  starting at all.
- **Backup job exits 0 but writes nothing** — normal on a brand-new
  install before any portfolio transaction has been logged; `terminal.db`
  doesn't exist until the app creates it on first write.

# HomeScan

**Lightweight self-hosted network device monitor.**

Scans your LAN with ARP, fingerprints devices, tracks uptime/latency, monitors for new or offline devices, and sends Telegram alerts. A simple alternative to piAlert, packaged in a single Docker container.

---

## Features

| Category | Details |
|----------|---------|
| **Discovery** | ARP-based scan via `arp-scan`, auto-detects new devices |
| **Fast probe** | nmap TCP scan, ping TTL (OS hint), NetBIOS, HTTP banner, SSDP, mDNS |
| **Deep probe** | nmap `-sV -O` + NSE scripts — service versions, OS fingerprint (2–5 min) |
| **CVE scan** | NVD API v2 lookup per service version, severity badges (requires deep probe) |
| **IP tracking** | Detects per-device IP changes, logs history, "IP Hopper" badge |
| **Uptime** | Per-device uptime % over 24h / 7d / 30d |
| **Ping history** | RTT latency tracking with sparkline chart |
| **Topology map** | SVG radial network map with gateway at centre |
| **Public IP** | Monitors external IP, alerts on change |
| **Groups** | Organise devices (IoT, Media, Work, etc.), bulk assign |
| **Alerts** | Telegram notifications — new devices + per-device offline alerts |
| **Real-time UI** | SSE-powered live dashboard, no polling |
| **Dark theme** | Clean React frontend |

---

## Quick Start

### Option A — Docker Compose (recommended)

```bash
git clone https://github.com/YOUR_USER/homescan.git
cd homescan

# Configure
cp .env.example .env
nano .env   # set NETWORK_INTERFACE and optionally Telegram credentials

# Build and run
cd docker
docker compose up -d --build
```

### Option B — Docker Run

```bash
# Build the image (from repo root)
docker build -f docker/Dockerfile -t homescan .

# Run it
docker run -d \
  --name homescan \
  --network host \
  --restart unless-stopped \
  --env-file .env \
  -v homescan_data:/app/data \
  homescan
```

**Dashboard:** `http://your-server:8080`

> `network_mode: host` is required on Linux for ARP scanning to reach your LAN.
> Does **not** work on Docker Desktop (macOS/Windows) without additional setup.

---

## Configuration

Copy `.env.example` to `.env` at the project root and edit:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend API port (internal, proxied by nginx on 8080) |
| `LOGLEVEL` | `info` | Log verbosity: `debug` / `info` / `warning` / `error` |
| `DB_PATH` | `/app/data/homescan.db` | SQLite database path inside container |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token — leave blank to disable alerts |
| `TELEGRAM_CHAT_ID` | — | Telegram chat/group ID to send alerts to |
| `SCAN_INTERVAL_MINUTES` | `5` | How often to auto-scan (minutes) |
| `NETWORK_INTERFACE` | `192.168.1.0/24` | Subnet passed to `arp-scan` — match your LAN |

### Finding your Telegram credentials

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token
2. Send a message to your bot, then visit:
   `https://api.telegram.org/bot<TOKEN>/getUpdates` to find your `chat_id`

---

## Local Development

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # edit as needed
python src/server.py      # runs on port 3001
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173 (proxies /api to localhost:3001)
```

> The backend must be running for the frontend dev server to function.

---

## Tech Stack

- **Backend:** Python 3.11, Flask, SQLite (stdlib), APScheduler
- **Scanner:** `arp-scan` (subprocess), `nmap`, `ping`
- **Frontend:** React 18, Vite, Recharts, Axios
- **Notifications:** Telegram Bot API
- **Deployment:** Docker — multi-stage build, nginx + supervisord in one container

---

## Requirements

- Linux host (for `network_mode: host`)
- Docker + Docker Compose v2
- ~350MB disk for the container image

---

## License

MIT

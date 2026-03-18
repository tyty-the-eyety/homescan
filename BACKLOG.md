# HomeScan — Feature Backlog

Prioritised list of next features to build.

## High Priority

- **Wake-on-LAN** — magic packet button for offline devices (~20 lines Python + one UI button)
- **Device notes** — free-text annotation field per device, editable inline in the UI
- **Alert / notification history** — log every Telegram alert sent, viewable in a new History subtab

## Medium Priority

- **Network health dashboard** — device count over time, scan duration trends, recharts graphs
- **ntfy.sh / Pushover / email** — additional notification channels alongside Telegram
- **Responsive / mobile layout** — currently desktop-only, needs breakpoints
- **PWA manifest + favicon** — installable as a home screen app

## Low Priority / Nice to Have

- **Multi-subnet support** — scan more than one CIDR range simultaneously
- **Scheduled deep probe** — auto deep-probe devices on a configurable schedule (e.g. weekly)
- **Export devices** — CSV/JSON export of device list
- **Import known devices** — seed the database from a CSV (useful for migrations)
- **SNMP basic polling** — bandwidth/uptime from managed switches
- **Dark/light theme toggle** — currently dark-only

## Completed

- [x] Phase 1 — Public IP tracking + SSE event on change
- [x] Phase 2 — IP lease tracking (`ip_history` table, "IP Hopper" badge)
- [x] Phase 3 — Enhanced fingerprinting (HTTP banner, SSDP, mDNS, smarter type inference)
- [x] Phase 4 — Network topology map (SVG radial, Topology tab, `/api/topology`)
- [x] Deep Probe — nmap `-sV -O` + NSE scripts, `os_detail` column, amber button
- [x] CVE Scan — `cve.py`, NVD API v2, severity badges, CVE table in expanded panel
- [x] Device grouping — group assignment, bulk actions, group filter
- [x] Ping RTT history — `ping_history` table, sparkline/chart in expanded panel
- [x] Uptime tracking — per-device 24h/7d/30d uptime percentages

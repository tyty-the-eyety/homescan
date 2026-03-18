#!/bin/bash
set -e

# HomeScan LXC Installer
# Installs HomeScan as a system service on Debian/Ubuntu LXC containers

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()    { echo -e "${GREEN}[homescan]${NC} $1"; }
warn()    { echo -e "${YELLOW}[homescan]${NC} $1"; }
error()   { echo -e "${RED}[homescan]${NC} $1"; exit 1; }

# Must run as root
[ "$EUID" -ne 0 ] && error "Please run as root: sudo bash install.sh"

INSTALL_DIR="/opt/homescan"
SERVICE_USER="homescan"
FRONTEND_DIR="/var/www/homescan"

info "=== HomeScan Installer ==="
echo ""

# ── Dependencies ──────────────────────────────────────────────────────────────
info "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq \
    python3 \
    python3-venv \
    python3-pip \
    arp-scan \
    nginx \
    nodejs \
    npm \
    curl

# ── App user ──────────────────────────────────────────────────────────────────
if ! id "$SERVICE_USER" &>/dev/null; then
    info "Creating system user: $SERVICE_USER"
    useradd -r -s /bin/false -d "$INSTALL_DIR" "$SERVICE_USER"
fi

# ── Install backend ───────────────────────────────────────────────────────────
info "Installing backend..."
mkdir -p "$INSTALL_DIR/data"
cp -r backend/src "$INSTALL_DIR/src"
cp backend/requirements.txt "$INSTALL_DIR/requirements.txt"

# .env setup
if [ ! -f "$INSTALL_DIR/.env" ]; then
    if [ -f backend/.env ]; then
        cp backend/.env "$INSTALL_DIR/.env"
        info "Copied backend/.env to $INSTALL_DIR/.env"
    else
        cp backend/.env.example "$INSTALL_DIR/.env"
        warn "No .env found — copied .env.example to $INSTALL_DIR/.env"
        warn "Please edit $INSTALL_DIR/.env before starting the service"
    fi
else
    info "Existing $INSTALL_DIR/.env kept (not overwritten)"
fi

# Set DB path in .env if not already set
if ! grep -q "^DB_PATH=" "$INSTALL_DIR/.env"; then
    echo "DB_PATH=$INSTALL_DIR/data/homescan.db" >> "$INSTALL_DIR/.env"
fi

# Python venv
info "Setting up Python virtual environment..."
python3 -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install -q --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install -q -r "$INSTALL_DIR/requirements.txt"

# ── Build frontend ─────────────────────────────────────────────────────────────
info "Building frontend..."
mkdir -p "$FRONTEND_DIR"
cd frontend
npm ci --silent
npm run build --silent
cp -r dist/. "$FRONTEND_DIR/"
cd ..
info "Frontend built and copied to $FRONTEND_DIR"

# ── nginx ─────────────────────────────────────────────────────────────────────
info "Configuring nginx..."

# Prompt for port
read -rp "  Frontend port [default: 8080]: " FRONTEND_PORT
FRONTEND_PORT="${FRONTEND_PORT:-8080}"

cat > /etc/nginx/sites-available/homescan <<EOF
server {
    listen ${FRONTEND_PORT};

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    location / {
        root $FRONTEND_DIR;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/homescan /etc/nginx/sites-enabled/homescan
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
info "nginx configured on port $FRONTEND_PORT"

# ── systemd service ───────────────────────────────────────────────────────────
info "Creating systemd service..."

cat > /etc/systemd/system/homescan.service <<EOF
[Unit]
Description=HomeScan Network Monitor
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$INSTALL_DIR/venv/bin/python $INSTALL_DIR/src/server.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable homescan
systemctl restart homescan

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
info "=== Installation complete! ==="
echo ""
echo "  Web UI:     http://$(hostname -I | awk '{print $1}'):${FRONTEND_PORT}"
echo "  API:        http://$(hostname -I | awk '{print $1}'):3001"
echo ""
echo "  Service management:"
echo "    systemctl status homescan"
echo "    systemctl restart homescan"
echo "    journalctl -fu homescan"
echo ""
echo "  Config:     $INSTALL_DIR/.env"
echo "  Database:   $INSTALL_DIR/data/homescan.db"
echo "  Logs:       journalctl -fu homescan"
echo ""
if grep -q "your_bot_token_here" "$INSTALL_DIR/.env" 2>/dev/null; then
    warn "Don't forget to update your Telegram credentials in $INSTALL_DIR/.env"
    warn "Then run: systemctl restart homescan"
fi

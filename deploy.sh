#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/vpn-key-panel"
REPO_URL="${1:-}"
DOMAIN="${2:-}"
EMAIL="${3:-}"

if [[ -z "${REPO_URL}" ]]; then
  echo "Usage:"
  echo "  bash deploy.sh <GIT_REPO_URL> [domain] [email]"
  exit 1
fi

echo "==> Install dependencies"
sudo apt update -y
sudo apt install -y curl git nginx

# Node.js 20 LTS (from NodeSource)
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

echo "==> Clone repo"
sudo rm -rf "$APP_DIR"
sudo git clone "$REPO_URL" "$APP_DIR"
cd "$APP_DIR"

if [[ ! -f ".env" ]]; then
  echo "==> Create .env (PLEASE EDIT after deploy)"
  cp .env.example .env
fi

echo "==> Install node modules"
sudo npm install --omit=dev

echo "==> Create systemd service"
sudo tee /etc/systemd/system/vpn-key-panel.service >/dev/null <<'SERVICE'
[Unit]
Description=VPN Key Panel
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/vpn-key-panel
ExecStart=/usr/bin/node /opt/vpn-key-panel/server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable vpn-key-panel
sudo systemctl restart vpn-key-panel

echo "==> Configure Nginx reverse proxy"
sudo tee /etc/nginx/sites-available/vpn-key-panel >/dev/null <<'NGINX'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/vpn-key-panel /etc/nginx/sites-enabled/vpn-key-panel
sudo nginx -t
sudo systemctl restart nginx

# Optional SSL
if [[ -n "${DOMAIN}" && -n "${EMAIL}" ]]; then
  echo "==> Enable SSL with Let's Encrypt"
  sudo apt install -y certbot python3-certbot-nginx
  sudo sed -i "s/server_name _;/server_name ${DOMAIN};/g" /etc/nginx/sites-available/vpn-key-panel
  sudo nginx -t && sudo systemctl reload nginx
  sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" || true
fi

echo ""
echo "✅ Done!"
echo "Open: http://<your-server-ip>/"
echo "Admin: http://<your-server-ip>/admin/login"
echo ""
echo "IMPORTANT: Edit /opt/vpn-key-panel/.env and set strong ADMIN_PASSWORD + COOKIE_SECRET then restart:"
echo "  sudo nano /opt/vpn-key-panel/.env"
echo "  sudo systemctl restart vpn-key-panel"

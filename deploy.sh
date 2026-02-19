#!/usr/bin/env bash
set -euo pipefail

###############
# 🛠 Usage:
# bash deploy.sh <GIT_REPO_URL> [domain] [email]
# Example:
# bash deploy.sh https://github.com/Nanda-N4/vpn-key-panel.git free.n4vpn.xyz admin@example.com
###############

REPO_URL="${1:-}"
DOMAIN="${2:-}"
EMAIL="${3:-}"

APP_DIR="/opt/vpn-key-panel"
SERVICE_NAME="vpn-key-panel"

if [[ -z "${REPO_URL}" ]]; then
  echo "📌 Usage: bash deploy.sh <GIT_REPO_URL> [domain] [email]"
  exit 1
fi

echo "📍 Starting deployment..."

# ---- System Prep ----
echo "📦 Installing prerequisites..."
sudo apt update -y
sudo apt install -y curl git nginx ufw

# ---- Node.js ----
if ! command -v node >/dev/null 2>&1; then
  echo "📌 Installing Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install -y nodejs
fi

# ---- Clone / Update App ----
echo "📥 Cloning repository..."
sudo rm -rf "$APP_DIR"
sudo git clone "$REPO_URL" "$APP_DIR"
sudo chown -R "$USER:$USER" "$APP_DIR"

cd "$APP_DIR"

# ---- .env ----
if [[ ! -f ".env" ]]; then
  echo "📄 Creating .env..."
  cp .env.example .env || touch .env
fi

echo "📦 Installing node modules..."
npm install --omit=dev

# ---- systemd service ----
echo "🔁 Creating systemd service..."
sudo tee /etc/systemd/system/${SERVICE_NAME}.service >/dev/null <<SERVICE
[Unit]
Description=VPN Key Panel
After=network.target

[Service]
Type=simple
User=${USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node ${APP_DIR}/server.js
Restart=always
RestartSec=2
Environment=NODE_ENV=production
EnvironmentFile=${APP_DIR}/.env

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}
sudo systemctl restart ${SERVICE_NAME}

# ---- Nginx ----
echo "🌐 Configuring Nginx..."
sudo tee /etc/nginx/sites-available/${SERVICE_NAME} >/dev/null <<NGINX
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/${SERVICE_NAME} /etc/nginx/sites-enabled/

sudo nginx -t
sudo systemctl restart nginx

# ---- Firewall ----
echo "🔓 Setting firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable

# ---- Optional: HTTPS ----
if [[ -n "$DOMAIN" && -n "$EMAIL" ]]; then
  echo "🔐 Setting up SSL cert (Let's Encrypt)..."
  sudo apt install -y certbot python3-certbot-nginx
  sudo sed -i "s/server_name _;/server_name ${DOMAIN};/g" /etc/nginx/sites-available/${SERVICE_NAME}
  sudo nginx -t && sudo systemctl reload nginx
  sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m "${EMAIL}" || true
fi

echo ""
echo "✅ Deployment successful!"
echo "Next steps:"
echo "  🛡 Edit .env for ADMIN_PASSWORD + COOKIE_SECRET"
echo "  sudo nano /opt/vpn-key-panel/.env"
echo "  sudo systemctl restart ${SERVICE_NAME}"
echo ""
echo "Visit:"
if [[ -n "$DOMAIN" ]]; then
  echo "  https://${DOMAIN}"
else
  echo "  http://<your_server_ip>"
fi

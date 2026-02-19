🚀 VPN Key Panel
Simple Node.js based VPN key management panel.
✨ Features
Admin dashboard
Key management
Nginx reverse proxy
systemd service auto-start
Optional HTTPS (Let's Encrypt)
✅ Quick Deploy
Run deploy script from GitHub (recommended)
With SSL (domain + email):
Bash
Copy code
bash <(curl -fsSL https://raw.githubusercontent.com/Nanda-N4/vpn-key-panel/main/deploy.sh) \
https://github.com/Nanda-N4/vpn-key-panel.git free.n4vpn.xyz admin@example.com
Without SSL (IP only):
Bash
Copy code
bash <(curl -fsSL https://raw.githubusercontent.com/Nanda-N4/vpn-key-panel/main/deploy.sh) \
https://github.com/Nanda-N4/vpn-key-panel.git
🧠 What deploy.sh does
Installs: nginx, nodejs, git
Clones repo to /opt/vpn-key-panel
Installs npm packages
Creates systemd service: vpn-key-panel
Configures nginx reverse proxy to 127.0.0.1:3000
(Optional) Issues SSL certificate
🔐 After install (IMPORTANT)
Edit env:
Bash
Copy code
sudo nano /opt/vpn-key-panel/.env
Set strong values:
Copy code

ADMIN_PASSWORD=yourStrongPassword
COOKIE_SECRET=randomLongSecretKey
BASE_URL=https://free.n4vpn.xyz
Restart:
Bash
Copy code
sudo systemctl restart vpn-key-panel
🌐 URLs
Site: http://SERVER_IP/ or https://DOMAIN/
Admin: /admin (or your custom adminPath in config.json)
📂 Folder layout
Copy code

vpn-key-panel/
├── server.js
├── deploy.sh
├── package.json
├── views/
├── public/
└── config.json
🛠 Useful commands
Check service:
Bash
Copy code
sudo systemctl status vpn-key-panel --no-pager
Nginx test:
Bash
Copy code
sudo nginx -t
Logs:
Bash
Copy code
sudo journalctl -u vpn-key-panel -n 200 --no-pager
📜 License
MIT

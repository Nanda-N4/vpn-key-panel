# 🚀 VPN Key Panel

![Node.js](https://img.shields.io/badge/Node.js-20.x-green)
![Nginx](https://img.shields.io/badge/Nginx-Reverse_Proxy-blue)
![Systemd](https://img.shields.io/badge/Systemd-Auto_Start-orange)
![License](https://img.shields.io/badge/License-MIT-lightgrey)
![Deploy](https://img.shields.io/badge/Deploy-One_Command-success)

Simple and lightweight **Node.js based VPN key management panel**  
Built for fast VPS deployment with optional HTTPS.

---

## ✨ Features

- 🔐 Admin dashboard
- 📦 Key management system
- ⚡ Nginx reverse proxy
- 🔁 systemd auto-start service
- 🌍 Optional HTTPS (Let's Encrypt)
- 🚀 One-command deployment

---

# ⚡ Quick Deploy (Recommended)

## 🔒 With SSL (Domain + Email)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Nanda-N4/vpn-key-panel/main/deploy.sh) \
https://github.com/Nanda-N4/vpn-key-panel.git free.n4vpn.xyz admin@example.com
```

---

## 🌐 Without SSL (IP only)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Nanda-N4/vpn-key-panel/main/deploy.sh) \
https://github.com/Nanda-N4/vpn-key-panel.git
```

---

# 🧠 What `deploy.sh` Does

1. Installs: `nginx`, `nodejs`, `git`
2. Clones repository to `/opt/vpn-key-panel`
3. Installs npm production packages
4. Creates systemd service: `vpn-key-panel`
5. Configures nginx reverse proxy → `127.0.0.1:3000`
6. (Optional) Issues Let's Encrypt SSL certificate

---

# 🔐 After Install (IMPORTANT)

Edit environment file:

```bash
sudo nano /opt/vpn-key-panel/.env
```

Set strong values:

```env
ADMIN_PASSWORD=yourStrongPassword
COOKIE_SECRET=randomLongSecretKey
BASE_URL=https://free.n4vpn.xyz
```

Restart service:

```bash
sudo systemctl restart vpn-key-panel
```

---

# 🌍 Access URLs

| Type  | URL |
|-------|------|
| Site  | `http://SERVER_IP/` or `https://DOMAIN/` |
| Admin | `/admin` |

---

# 📂 Project Structure

```
vpn-key-panel/
├── server.js
├── deploy.sh
├── package.json
├── views/
├── public/
└── config.json
```

---

# 🛠 Useful Commands

Check service status:

```bash
sudo systemctl status vpn-key-panel --no-pager
```

Test nginx config:

```bash
sudo nginx -t
```

View logs:

```bash
sudo journalctl -u vpn-key-panel -n 200 --no-pager
```

---

# 🔄 Update Project

```bash
cd /opt/vpn-key-panel
sudo git pull
sudo npm install --omit=dev
sudo systemctl restart vpn-key-panel
```

---

# 📜 License

MIT License  
Free to use and modify.

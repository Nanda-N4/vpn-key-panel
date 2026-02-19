## 🔧 Quick Deploy (one command)

Replace with your own values:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Nanda-N4/vpn-key-panel/main/deploy.sh) \
https://github.com/Nanda-N4/vpn-key-panel.git free.n4vpn.xyz admin@domain.com```
---

# 🚀 How It Works (what happens)

1. installs nginx + node  
2. clones your repo  
3. sets up systemd service  
4. configures nginx reverse proxy  
5. opens firewall  
6. optionally issues SSL cert

---

# 🧠 Usage Example

If domain only (no SSL):

```bash
bash deploy.sh https://github.com/Nanda-N4/vpn-key-panel.git

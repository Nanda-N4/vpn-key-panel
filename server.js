// server.js (CommonJS)
require("dotenv").config();

const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const Database = require("better-sqlite3");

const { marked } = require("marked");
const sanitizeHtml = require("sanitize-html");

const app = express();

// ---------- Helpers ----------
function loadConfig() {
  const p = path.join(__dirname, "config.json");
  const raw = fs.readFileSync(p, "utf8");
  return JSON.parse(raw);
}

function safeStr(v) {
  return (v ?? "").toString().trim();
}

function nowISODate() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isExpired(expireDate) {
  const e = safeStr(expireDate);
  if (!e) return false;
  return e < nowISODate();
}

function computeStatus(row) {
  if (isExpired(row.expire_date)) return "EXPIRED";
  const s = (row.status || "ACTIVE").toUpperCase();
  if (s !== "ACTIVE" && s !== "INACTIVE") return "ACTIVE";
  return s;
}

function safeJsonParse(str, fallback) {
  try {
    const v = JSON.parse(str);
    return v && typeof v === "object" ? v : fallback;
  } catch {
    return fallback;
  }
}

// Template: "ဒီ Key က {gb} GB သုံးနိုင်ပါတယ်။"
function applyTemplate(tpl, vars) {
  const s = safeStr(tpl);
  if (!s) return "";
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "").toString());
}

// "2026-03-25" -> "25/03/2026"
function formatDateHuman(iso) {
  const v = safeStr(iso);
  if (!v) return "";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return v;
  const yyyy = m[1], mm = m[2], dd = m[3];
  return `${dd}/${mm}/${yyyy}`;
}

function computeVersion(str) {
  return crypto.createHash("sha1").update(str || "").digest("hex").slice(0, 10);
}

// Small: limit input size (avoid huge payloads)
function clampText(s, max = 400) {
  const v = safeStr(s);
  if (v.length <= max) return v;
  return v.slice(0, max);
}

// ---------- ENV ----------
const PORT = Number(process.env.PORT || 3000);
const BASE_URL = safeStr(process.env.BASE_URL || "");
const ADMIN_PASSWORD = safeStr(process.env.ADMIN_PASSWORD || "");
const COOKIE_SECRET = safeStr(process.env.COOKIE_SECRET || "ChangeThisCookieSecret");

// ---------- DB ----------
const dbPath = path.join(__dirname, "data.db");
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    region_name TEXT NOT NULL,
    region_flag TEXT DEFAULT '',
    gb_limit INTEGER DEFAULT 0,
    expire_date TEXT DEFAULT '',
    key_string TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_keys_type ON keys(type);
  CREATE INDEX IF NOT EXISTS idx_keys_region ON keys(region_name);
  CREATE INDEX IF NOT EXISTS idx_keys_status ON keys(status);

  CREATE TABLE IF NOT EXISTS settings (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
  );
`);

const qGetSetting = db.prepare(`SELECT v FROM settings WHERE k = ?`);
const qSetSetting = db.prepare(`
  INSERT INTO settings (k,v) VALUES (@k,@v)
  ON CONFLICT(k) DO UPDATE SET v=excluded.v
`);

function getSetting(k, fallback = "") {
  const row = qGetSetting.get(k);
  return row ? safeStr(row.v) : fallback;
}
function setSetting(k, v) {
  qSetSetting.run({ k, v: safeStr(v) });
}

// ---------- Announcement (Markdown -> safe HTML) ----------
marked.setOptions({
  breaks: true,
  mangle: false,
  headerIds: false
});

function sanitizeAnnouncement(html) {
  return sanitizeHtml(html, {
    allowedTags: [
      "b","strong","i","em","u","s",
      "p","br","hr","blockquote",
      "ul","ol","li",
      "h1","h2","h3","h4",
      "code","pre",
      "a","img","span"
    ],
    allowedAttributes: {
      a: ["href","target","rel"],
      img: ["src","alt","title"],
      span: ["class"]
    },
    allowedSchemes: ["http","https"],
    allowedSchemesByTag: {
      img: ["http","https"]
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener" }, true),
    },
    allowedStyles: {},
    disallowedTagsMode: "discard"
  });
}

function mdToSafeHtml(md) {
  const raw = marked.parse(md || "");
  return sanitizeAnnouncement(raw);
}

// ---------- App middleware ----------
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("trust proxy", 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true, limit: "256kb" }));
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser(COOKIE_SECRET));
app.use("/public", express.static(path.join(__dirname, "public"), { etag: false, maxAge: 0 }));

// ---------- Auth ----------
function isAuthed(req) {
  const v = req.signedCookies && req.signedCookies.admin;
  if (!v) return false;

  const parts = safeStr(v).split(".");
  if (parts.length !== 2) return false;

  const ts = Number(parts[0]);
  const sig = parts[1];
  if (!Number.isFinite(ts)) return false;
  if (Date.now() - ts > 12 * 60 * 60 * 1000) return false;

  const expected = crypto
    .createHmac("sha256", COOKIE_SECRET)
    .update(`${ts}|${req.headers["user-agent"] || ""}`)
    .digest("hex")
    .slice(0, 24);

  return sig === expected;
}

function setAuth(res, req) {
  const ts = Date.now();
  const sig = crypto
    .createHmac("sha256", COOKIE_SECRET)
    .update(`${ts}|${req.headers["user-agent"] || ""}`)
    .digest("hex")
    .slice(0, 24);

  res.cookie("admin", `${ts}.${sig}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 12 * 60 * 60 * 1000,
    signed: true,
    path: "/"
  });
}

function clearAuth(res) {
  res.clearCookie("admin", { path: "/" });
}

// ---------- Queries ----------
const qListKeys = db.prepare(`
  SELECT * FROM keys
  WHERE
    (@type = '' OR type = @type)
    AND (
      @q = '' OR
      lower(region_name) LIKE '%' || lower(@q) || '%' OR
      lower(type) LIKE '%' || lower(@q) || '%'
    )
  ORDER BY
    CASE status WHEN 'ACTIVE' THEN 0 WHEN 'INACTIVE' THEN 1 ELSE 2 END,
    id DESC
`);

const qGetKey = db.prepare(`SELECT * FROM keys WHERE id = ?`);
const qAddKey = db.prepare(`
  INSERT INTO keys (type, region_name, region_flag, gb_limit, expire_date, key_string, status)
  VALUES (@type, @region_name, @region_flag, @gb_limit, @expire_date, @key_string, @status)
`);
const qDeleteKey = db.prepare(`DELETE FROM keys WHERE id = ?`);
const qUpdateStatus = db.prepare(`UPDATE keys SET status = @status WHERE id = @id`);

// ---------- Template data ----------
function buildPanelData(req) {
  const cfg = loadConfig();
  const adminPath = safeStr(cfg.adminPath || "admin");

  const announceMd = getSetting("announce_md", "");
  const announceEnabled = getSetting("announce_enabled", "0") === "1";
  const announceHtml = announceEnabled ? mdToSafeHtml(announceMd) : "";
  const announceVersion = announceEnabled ? computeVersion(announceMd) : "";

  const uiDefaults = {
    backText: "← Back",
    labels: {
      gbShort: "GB",
      expireShort: "Expire",
      keyLabel: "Key",
      copyBtn: "Copy",
      downloadTitle: "Download Apps",
    },
    templates: {
      gbInfo: "ဒီ Key က {gb} GB သုံးနိုင်ပါတယ်။",
      expireInfo: "Key သက်တမ်း ကုန်ဆုံးရက်က {date} ပါ။"
    }
  };

  const uiFromConfig = (cfg.uiText && typeof cfg.uiText === "object") ? cfg.uiText : {};
  const uiJson = getSetting("ui_text_json", "");
  const uiFromDb = uiJson ? safeJsonParse(uiJson, {}) : {};

  const uiText = {
    ...uiDefaults,
    ...uiFromConfig,
    ...uiFromDb,
    labels: {
      ...uiDefaults.labels,
      ...(uiFromConfig.labels || {}),
      ...(uiFromDb.labels || {}),
    },
    templates: {
      ...uiDefaults.templates,
      ...(uiFromConfig.templates || {}),
      ...(uiFromDb.templates || {}),
    }
  };

  const panelConfig = {
    brandName: safeStr(cfg.brandName || "VPN KEY"),
    announcement: safeStr(cfg.announcement || ""),

    telegramAdminText: safeStr(cfg.telegramAdminText || "Contact Admin"),
    telegramAdminUrl: safeStr(cfg.telegramAdminUrl || "#"),
    telegramChannelText: safeStr(cfg.telegramChannelText || "Join Channel"),
    telegramChannelUrl: safeStr(cfg.telegramChannelUrl || "#"),

    announceHtml,
    announceVersion,

    uiText
  };

  const origin = BASE_URL || `${req.protocol}://${req.get("host")}`;
  return { panelConfig, adminPath, origin, announceMd, announceEnabled };
}

// ---------- Public routes ----------
app.get("/", (req, res) => {
  const { panelConfig } = buildPanelData(req);

  const q = safeStr(req.query.q || "");
  const type = safeStr(req.query.type || "");
  const status = safeStr(req.query.status || "");

  const rows = qListKeys.all({ q, type, status: "" }).map(r => ({
    ...r,
    statusComputed: computeStatus(r),
    link: `/k/${r.id}`
  }));

  const filtered = rows.filter(r => {
    if (!status) return true;
    return r.statusComputed === status.toUpperCase();
  });

  const types = Array.from(new Set(rows.map(r => r.type))).sort();
  const statuses = ["ACTIVE", "INACTIVE", "EXPIRED"];

  res.render("index", {
    panelConfig,
    items: filtered,
    query: { q, type, status },
    types,
    statuses
  });
});

app.get("/k/:id", (req, res) => {
  const { panelConfig } = buildPanelData(req);

  const id = Number(req.params.id);
  const row = qGetKey.get(id);

  if (!row) {
    return res.status(404).render("detail", {
      panelConfig,
      item: null,
      apps: [],
      error: "Key မတွေ့ပါ။"
    });
  }

  const expireHuman = formatDateHuman(row.expire_date);

  const item = {
    ...row,
    statusComputed: computeStatus(row),
    expireHuman,
    gbInfoText: applyTemplate(panelConfig.uiText.templates.gbInfo, { gb: row.gb_limit || 0 }),
    expireInfoText: applyTemplate(panelConfig.uiText.templates.expireInfo, { date: expireHuman || (row.expire_date || "-") })
  };

  const typeUpper = safeStr(item.type).toUpperCase();
  let apps = [];

  if (typeUpper.includes("OUTLINE")) {
    apps = [
      { name: "Windows", sub: "Outline Client", icon: "windows", url: "https://getoutline.org/" },
      { name: "macOS", sub: "Outline Client", icon: "apple", url: "https://getoutline.org/" },
      { name: "Android", sub: "Outline App", icon: "android", url: "https://play.google.com/store/apps/details?id=org.outline.android.client" },
      { name: "iPhone / iPad", sub: "Outline App", icon: "apple", url: "https://apps.apple.com/app/outline-app/id1356177741" }
    ];
  } else {
    apps = [
      { name: "Windows", sub: "V2Ray Client", icon: "windows", url: "https://github.com/2dust/v2rayN" },
      { name: "macOS", sub: "V2Ray Client", icon: "apple", url: "https://github.com/2dust/v2rayN" },
      { name: "Android", sub: "v2rayNG", icon: "android", url: "https://github.com/2dust/v2rayNG" },
      { name: "iPhone / iPad", sub: "Client (iOS)", icon: "apple", url: "https://apps.apple.com/" }
    ];
  }

  res.render("detail", { panelConfig, item, apps, error: "" });
});

// ---------- Admin routes ----------
app.get("/:adminPath", (req, res) => {
  const { panelConfig, adminPath, announceMd, announceEnabled } = buildPanelData(req);
  if (safeStr(req.params.adminPath) !== adminPath) return res.status(404).send("Not found");

  if (!isAuthed(req)) {
    return res.render("admin", {
      panelConfig,
      adminPath,
      mode: "login",
      error: "",
      keys: [],
      defaults: { type: "V2RAY", gb_limit: 2048, expire_date: nowISODate(), region_name: "", region_flag: "" },
      announceMd,
      announceEnabled
    });
  }

  const keys = db.prepare(`SELECT * FROM keys ORDER BY id DESC`).all().map(r => ({
    ...r,
    statusComputed: computeStatus(r),
    link: `/k/${r.id}`
  }));

  return res.render("admin", {
    panelConfig,
    adminPath,
    mode: "dashboard",
    error: safeStr(req.query.err || ""),
    keys,
    defaults: { type: "V2RAY", gb_limit: 2048, expire_date: nowISODate(), region_name: "", region_flag: "" },
    announceMd,
    announceEnabled
  });
});

app.post("/:adminPath/login", (req, res) => {
  const { adminPath } = buildPanelData(req);
  if (safeStr(req.params.adminPath) !== adminPath) return res.status(404).send("Not found");

  const pass = safeStr(req.body.password || "");
  if (!ADMIN_PASSWORD || pass !== ADMIN_PASSWORD) {
    const { panelConfig, announceMd, announceEnabled } = buildPanelData(req);
    return res.status(401).render("admin", {
      panelConfig,
      adminPath,
      mode: "login",
      error: "Password မမှန်ပါ။",
      keys: [],
      defaults: { type: "V2RAY", gb_limit: 2048, expire_date: nowISODate(), region_name: "", region_flag: "" },
      announceMd,
      announceEnabled
    });
  }

  setAuth(res, req);
  return res.redirect(`/${adminPath}`);
});

app.post("/:adminPath/logout", (req, res) => {
  const { adminPath } = buildPanelData(req);
  if (safeStr(req.params.adminPath) !== adminPath) return res.status(404).send("Not found");
  clearAuth(res);
  return res.redirect(`/${adminPath}`);
});

app.post("/:adminPath/add", (req, res) => {
  const { adminPath } = buildPanelData(req);
  if (safeStr(req.params.adminPath) !== adminPath) return res.status(404).send("Not found");
  if (!isAuthed(req)) return res.status(403).send("Forbidden");

  const payload = {
    type: safeStr(req.body.type || "V2RAY").toUpperCase(),
    region_name: safeStr(req.body.region_name || "Unknown"),
    region_flag: safeStr(req.body.region_flag || ""),
    gb_limit: Number(req.body.gb_limit || 0) || 0,
    expire_date: safeStr(req.body.expire_date || ""),
    key_string: safeStr(req.body.key_string || ""),
    status: safeStr(req.body.status || "ACTIVE").toUpperCase()
  };

  if (!payload.key_string || payload.key_string.length < 8) {
    return res.redirect(`/${adminPath}?err=KeyStringInvalid`);
  }

  qAddKey.run(payload);
  return res.redirect(`/${adminPath}`);
});

app.post("/:adminPath/delete/:id", (req, res) => {
  const { adminPath } = buildPanelData(req);
  if (safeStr(req.params.adminPath) !== adminPath) return res.status(404).send("Not found");
  if (!isAuthed(req)) return res.status(403).send("Forbidden");

  const id = Number(req.params.id);
  qDeleteKey.run(id);
  return res.redirect(`/${adminPath}`);
});

app.post("/:adminPath/toggle/:id", (req, res) => {
  const { adminPath } = buildPanelData(req);
  if (safeStr(req.params.adminPath) !== adminPath) return res.status(404).send("Not found");
  if (!isAuthed(req)) return res.status(403).send("Forbidden");

  const id = Number(req.params.id);
  const row = qGetKey.get(id);
  if (!row) return res.redirect(`/${adminPath}`);

  const next = (row.status || "ACTIVE").toUpperCase() === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  qUpdateStatus.run({ id, status: next });
  return res.redirect(`/${adminPath}`);
});

// Save announcement (Markdown)
app.post("/:adminPath/announce", (req, res) => {
  const { adminPath } = buildPanelData(req);
  if (safeStr(req.params.adminPath) !== adminPath) return res.status(404).send("Not found");
  if (!isAuthed(req)) return res.status(403).send("Forbidden");

  const enabled = safeStr(req.body.announce_enabled || "0") === "1" ? "1" : "0";
  const md = safeStr(req.body.announce_md || "");

  setSetting("announce_enabled", enabled);
  setSetting("announce_md", md);

  return res.redirect(`/${adminPath}`);
});

// ✅ NEW: Save UI Text (User Page Labels)
app.post("/:adminPath/ui-text", (req, res) => {
  const { adminPath } = buildPanelData(req);
  if (safeStr(req.params.adminPath) !== adminPath) return res.status(404).send("Not found");
  if (!isAuthed(req)) return res.status(403).send("Forbidden");

  // Reset?
  if (safeStr(req.body.ui_reset) === "1") {
    setSetting("ui_text_json", "");
    return res.redirect(`/${adminPath}`);
  }

  const uiText = {
    backText: clampText(req.body.ui_backText, 80),
    labels: {
      gbShort: clampText(req.body.ui_label_gbShort, 20) || "GB",
      expireShort: clampText(req.body.ui_label_expireShort, 20) || "Expire",
      keyLabel: clampText(req.body.ui_label_keyLabel, 30) || "Key",
      copyBtn: clampText(req.body.ui_label_copyBtn, 30) || "Copy",
      downloadTitle: clampText(req.body.ui_label_downloadTitle, 60) || "Download Apps",
    },
    templates: {
      gbInfo: clampText(req.body.ui_tpl_gbInfo, 200) || "ဒီ Key က {gb} GB သုံးနိုင်ပါတယ်။",
      expireInfo: clampText(req.body.ui_tpl_expireInfo, 200) || "Key သက်တမ်း ကုန်ဆုံးရက်က {date} ပါ။",
    },
  };

  setSetting("ui_text_json", JSON.stringify(uiText));
  return res.redirect(`/${adminPath}`);
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`✅ running on :${PORT}`);
});

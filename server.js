require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const path = require("path");
const fs = require("fs");

const { initDB } = require("./db");

const app = express();
const db = initDB("./data.sqlite");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const COOKIE_SECRET = process.env.COOKIE_SECRET || "change_me";

const panelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));
const ADMIN_PATH = `/${panelConfig.adminPath || "secure-admin-9283"}`;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(COOKIE_SECRET));
app.use("/public", express.static(path.join(__dirname, "public")));

function isAuthed(req) {
  return req.signedCookies?.admin === "1";
}
function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.redirect(`${ADMIN_PATH}/login`);
  next();
}
function normalizeStatus(expire_date) {
  const now = new Date();
  const [y, m, d] = String(expire_date).split("-").map(Number);
  const exp = new Date(y, m - 1, d, 23, 59, 59);
  return exp < now ? "EXPIRED" : "ACTIVE";
}

const APPS = {
  OUTLINE: {
    windows: "https://getoutline.org/get-started/#download",
    mac: "https://getoutline.org/get-started/#download",
    android: "https://play.google.com/store/apps/details?id=org.outline.android.client",
    ios: "https://apps.apple.com/app/outline-app/id1356177741"
  },
  V2RAY: {
    windows: "https://github.com/2dust/v2rayN/releases",
    android: "https://github.com/2dust/v2rayNG/releases",
    mac: "https://github.com/yanue/V2rayU/releases",
    ios: "https://apps.apple.com/app/shadowrocket/id932747118"
  }
};

app.get("/", (req, res) => {
  const type = (req.query.type || "").toUpperCase();
  const region = (req.query.region || "").trim();

  const clauses = [];
  const params = [];

  if (type === "OUTLINE" || type === "V2RAY") {
    clauses.push("key_type = ?");
    params.push(type);
  }
  if (region) {
    clauses.push("region_name = ?");
    params.push(region);
  }

  const sql = clauses.length
    ? `SELECT * FROM vpn_keys WHERE ${clauses.join(" AND ")} ORDER BY id DESC`
    : `SELECT * FROM vpn_keys ORDER BY id DESC`;

  const rows = db.prepare(sql).all(...params).map(r => ({ ...r, status: normalizeStatus(r.expire_date) }));
  const regions = db.prepare("SELECT DISTINCT region_name, region_flag FROM vpn_keys ORDER BY region_name ASC").all();

  res.render("index", { rows, regions, query: { type, region }, panelConfig, ADMIN_PATH });
});

app.get("/k/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM vpn_keys WHERE id = ?").get(id);
  if (!row) return res.status(404).send("Not found");

  res.render("detail", {
    row,
    status: normalizeStatus(row.expire_date),
    apps: APPS[row.key_type],
    panelConfig,
    ADMIN_PATH
  });
});

// Admin
app.get(`${ADMIN_PATH}/login`, (req, res) => res.render("login", { error: null, panelConfig, ADMIN_PATH }));

app.post(`${ADMIN_PATH}/login`, (req, res) => {
  const pw = String(req.body.password || "");
  if (pw !== ADMIN_PASSWORD) return res.render("login", { error: "Password မမှန်ပါ", panelConfig, ADMIN_PATH });

  res.cookie("admin", "1", { signed: true, httpOnly: true, sameSite: "lax", secure: false });
  res.redirect(`${ADMIN_PATH}`);
});

app.post(`${ADMIN_PATH}/logout`, (req, res) => {
  res.clearCookie("admin");
  res.redirect("/");
});

app.get(`${ADMIN_PATH}`, requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM vpn_keys ORDER BY id DESC").all().map(r => ({ ...r, status: normalizeStatus(r.expire_date) }));
  res.render("admin", { rows, panelConfig, ADMIN_PATH });
});

app.post(`${ADMIN_PATH}/add`, requireAuth, (req, res) => {
  const key_type = String(req.body.key_type || "").toUpperCase();
  const region_name = String(req.body.region_name || "").trim();
  const region_flag = String(req.body.region_flag || "").trim();
  const gb_limit = Number(req.body.gb_limit || 0);
  const expire_date = String(req.body.expire_date || "").trim();
  const key_string = String(req.body.key_string || "").trim();

  if (!["OUTLINE", "V2RAY"].includes(key_type)) return res.status(400).send("Bad key_type");
  if (!region_name || !region_flag || !expire_date || !key_string || !gb_limit) return res.status(400).send("Missing fields");

  db.prepare(`
    INSERT INTO vpn_keys (key_type, region_name, region_flag, gb_limit, expire_date, key_string)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(key_type, region_name, region_flag, gb_limit, expire_date, key_string);

  res.redirect(`${ADMIN_PATH}`);
});

app.post(`${ADMIN_PATH}/delete/:id`, requireAuth, (req, res) => {
  db.prepare("DELETE FROM vpn_keys WHERE id = ?").run(Number(req.params.id));
  res.redirect(`${ADMIN_PATH}`);
});

app.listen(PORT, () => console.log(`✅ running on :${PORT}`));

require("dotenv").config();

const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const path = require("path");

const { initDB } = require("./db");

const app = express();
const db = initDB("./data.sqlite");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const COOKIE_SECRET = process.env.COOKIE_SECRET || "change_me";

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser(COOKIE_SECRET));
app.use("/public", express.static(path.join(__dirname, "public")));

function isAuthed(req) {
  const token = req.signedCookies?.admin;
  return token === "1";
}

function requireAuth(req, res, next) {
  if (!isAuthed(req)) return res.redirect("/admin/login");
  next();
}

function normalizeStatus(expire_date) {
  // expire_date: YYYY-MM-DD
  const today = new Date();
  const [y, m, d] = expire_date.split("-").map(Number);
  const exp = new Date(y, m - 1, d, 23, 59, 59);
  return exp < today ? "EXPIRED" : "ACTIVE";
}

// USER: home list
app.get("/", (req, res) => {
  const keyType = (req.query.type || "").toUpperCase(); // OUTLINE/V2RAY
  const region = (req.query.region || "").trim();

  let sql = "SELECT * FROM vpn_keys ORDER BY id DESC";
  const params = [];
  const clauses = [];

  if (keyType === "OUTLINE" || keyType === "V2RAY") {
    clauses.push("key_type = ?");
    params.push(keyType);
  }
  if (region) {
    clauses.push("region_name = ?");
    params.push(region);
  }
  if (clauses.length) sql = `SELECT * FROM vpn_keys WHERE ${clauses.join(" AND ")} ORDER BY id DESC`;

  const rows = db.prepare(sql).all(...params).map((r) => ({
    ...r,
    status: normalizeStatus(r.expire_date)
  }));

  // distinct regions for filter dropdown
  const regions = db.prepare("SELECT DISTINCT region_name, region_flag FROM vpn_keys ORDER BY region_name ASC").all();

  res.render("index", { rows, regions, query: { type: keyType, region } });
});

// USER: detail
app.get("/k/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM vpn_keys WHERE id = ?").get(id);
  if (!row) return res.status(404).send("Not found");

  const status = normalizeStatus(row.expire_date);

  // App links (simple hard-coded set)
  const apps = {
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

  res.render("detail", { row, status, apps: apps[row.key_type] });
});

// ADMIN login
app.get("/admin/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/admin/login", (req, res) => {
  const pw = String(req.body.password || "");
  if (pw !== ADMIN_PASSWORD) return res.render("login", { error: "Password မမှန်ပါ" });

  res.cookie("admin", "1", {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: false // set true behind HTTPS, or keep false if testing
  });
  res.redirect("/admin");
});

app.post("/admin/logout", (req, res) => {
  res.clearCookie("admin");
  res.redirect("/");
});

// ADMIN dashboard
app.get("/admin", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM vpn_keys ORDER BY id DESC").all().map((r) => ({
    ...r,
    status: normalizeStatus(r.expire_date)
  }));

  res.render("admin", { rows });
});

app.post("/admin/add", requireAuth, (req, res) => {
  const key_type = String(req.body.key_type || "").toUpperCase();
  const region_name = String(req.body.region_name || "").trim();
  const region_flag = String(req.body.region_flag || "").trim();
  const gb_limit = Number(req.body.gb_limit || 0);
  const expire_date = String(req.body.expire_date || "").trim(); // YYYY-MM-DD
  const key_string = String(req.body.key_string || "").trim();

  if (!["OUTLINE", "V2RAY"].includes(key_type)) return res.status(400).send("Bad key_type");
  if (!region_name || !region_flag || !expire_date || !key_string || !gb_limit) return res.status(400).send("Missing fields");

  db.prepare(`
    INSERT INTO vpn_keys (key_type, region_name, region_flag, gb_limit, expire_date, key_string)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(key_type, region_name, region_flag, gb_limit, expire_date, key_string);

  res.redirect("/admin");
});

app.post("/admin/delete/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  db.prepare("DELETE FROM vpn_keys WHERE id = ?").run(id);
  res.redirect("/admin");
});

app.listen(PORT, () => {
  console.log(`✅ vpn-key-panel running on http://0.0.0.0:${PORT}`);
});

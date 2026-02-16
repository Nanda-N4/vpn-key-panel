const Database = require("better-sqlite3");

function initDB(dbPath = "./data.sqlite") {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS vpn_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_type TEXT NOT NULL,               -- OUTLINE or V2RAY
      region_name TEXT NOT NULL,            -- Singapore
      region_flag TEXT NOT NULL,            -- 🇸🇬
      gb_limit INTEGER NOT NULL,            -- 2048
      expire_date TEXT NOT NULL,            -- YYYY-MM-DD
      key_string TEXT NOT NULL,             -- ss://..., vless://...
      status TEXT NOT NULL DEFAULT 'ACTIVE',-- ACTIVE/EXPIRED
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

module.exports = { initDB };

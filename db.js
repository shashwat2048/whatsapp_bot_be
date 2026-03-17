const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const DB_PATH = path.join(__dirname, "bot.db");
let db;

// ── Promise wrappers ─────────────────────────────────────────────

function open() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// ── Initialization ───────────────────────────────────────────────

const DEFAULT_CONFIG = {
  mode: "OFF",
  delay_min: "3",
  delay_max: "8",
  custom_activity: "",
};

async function initialize() {
  await open();

  await run(`
    CREATE TABLE IF NOT EXISTS allowed_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      description TEXT DEFAULT ''
    )
  `);

  const colCheck = await get(
    "SELECT COUNT(*) AS cnt FROM pragma_table_info('allowed_users') WHERE name = 'description'"
  );
  if (colCheck.cnt === 0) {
    await run("ALTER TABLE allowed_users ADD COLUMN description TEXT DEFAULT ''");
  }

  await run(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    await run(
      "INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)",
      [key, value]
    );
  }

  console.log("Database initialized");
}

// ── Config helpers ───────────────────────────────────────────────

async function getConfig(key) {
  const row = await get("SELECT value FROM config WHERE key = ?", [key]);
  return row ? row.value : null;
}

async function setConfig(key, value) {
  return run(
    "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
    [key, String(value)]
  );
}

// ── Allowed-user helpers ─────────────────────────────────────────

async function addAllowedUser(phone, description = "") {
  return run(
    `INSERT INTO allowed_users (phone, active, description) VALUES (?, 1, ?)
     ON CONFLICT(phone) DO UPDATE SET active = 1, description = ?`,
    [phone, description, description]
  );
}

async function removeAllowedUser(phone) {
  return run("UPDATE allowed_users SET active = 0 WHERE phone = ?", [phone]);
}

async function isUserAllowed(phone) {
  const row = await get(
    "SELECT active FROM allowed_users WHERE phone = ? AND active = 1",
    [phone]
  );
  return !!row;
}

async function getActiveUsers() {
  return all("SELECT phone, description FROM allowed_users WHERE active = 1");
}

async function getUserByPhone(phone) {
  const row = await get(
    "SELECT phone, description, active FROM allowed_users WHERE phone = ?",
    [phone]
  );
  return row || null;
}

async function updateUserDescription(phone, description) {
  return run(
    "UPDATE allowed_users SET description = ? WHERE phone = ?",
    [description, phone]
  );
}

// ── Cleanup ──────────────────────────────────────────────────────

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  initialize,
  getConfig,
  setConfig,
  addAllowedUser,
  removeAllowedUser,
  isUserAllowed,
  getActiveUsers,
  getUserByPhone,
  updateUserDescription,
  close,
};

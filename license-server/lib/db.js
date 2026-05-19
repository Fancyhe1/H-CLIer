const { createClient } = require('@libsql/client');
const fs = require('fs');
const path = require('path');

let db = null;

function getDb() {
  if (db) return db;

  // 自建服务器：使用本地 SQLite 文件
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  db = createClient({
    url: 'file:./data/license.db',
  });

  return db;
}

async function initDb() {
  const client = getDb();

  await client.execute(`
    CREATE TABLE IF NOT EXISTS invitation_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      tier TEXT NOT NULL DEFAULT 'pro',
      max_machines INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      used_by TEXT,
      is_active INTEGER DEFAULT 1
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS activations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      app_version TEXT,
      activated_at TEXT DEFAULT (datetime('now')),
      last_seen_at TEXT DEFAULT (datetime('now')),
      ip_address TEXT,
      UNIQUE(code, machine_id)
    )
  `);

  await client.execute(`CREATE INDEX IF NOT EXISTS idx_codes_code ON invitation_codes(code)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_activations_code ON activations(code)`);
  await client.execute(`CREATE INDEX IF NOT EXISTS idx_activations_machine ON activations(machine_id)`);

  return client;
}

module.exports = { getDb, initDb };

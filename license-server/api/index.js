const { createClient } = require('@libsql/client');
const crypto = require('crypto');

// Database client
let db = null;
function getDb() {
  if (db) return db;
  db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return db;
}

// Generate signature
function generateSignature(code, machineId, tier) {
  const secret = process.env.SIGNATURE_SECRET || 'default-secret';
  const payload = `${code}:${machineId}:${tier}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// Generate invitation code
function generateCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const segments = [];
  for (let i = 0; i < 4; i++) {
    let seg = '';
    for (let j = 0; j < 4; j++) seg += chars[crypto.randomInt(chars.length)];
    segments.push(seg);
  }
  return segments.join('-');
}

// Initialize database tables
async function initDb(client) {
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
}

// CORS headers
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url, method } = req;

  try {
    // Health check
    if (url === '/api/health' || url === '/api/') {
      return res.json({ status: 'ok', service: 'hclier-license-server', version: '2.0.0' });
    }

    // Validate invitation code
    if (url === '/api/validate' && method === 'POST') {
      const client = getDb();
      await initDb(client);
      const { invitation_code, machine_id, app_version } = req.body;

      if (!invitation_code || !machine_id) {
        return res.json({ valid: false, error_message: '缺少必要参数' });
      }

      const code = invitation_code.toUpperCase();

      // Query code
      const result = await client.execute({
        sql: 'SELECT * FROM invitation_codes WHERE code = ? AND is_active = 1',
        args: [code],
      });

      if (result.rows.length === 0) {
        return res.json({ valid: false, error_message: '邀请码无效' });
      }

      const codeInfo = result.rows[0];

      // Check expiry
      if (codeInfo.expires_at && new Date(codeInfo.expires_at) < new Date()) {
        return res.json({ valid: false, error_message: '邀请码已过期' });
      }

      // Check machine limit
      const countResult = await client.execute({
        sql: 'SELECT COUNT(*) as count FROM activations WHERE code = ?',
        args: [code],
      });

      const existing = await client.execute({
        sql: 'SELECT * FROM activations WHERE code = ? AND machine_id = ?',
        args: [code, machine_id],
      });

      const maxMachines = codeInfo.max_machines || 1;
      const currentCount = countResult.rows[0]?.count || 0;

      if (existing.rows.length === 0 && currentCount >= maxMachines) {
        return res.json({ valid: false, error_message: `已达到最大设备数（${maxMachines}台）` });
      }

      // Record activation
      if (existing.rows.length > 0) {
        await client.execute({
          sql: "UPDATE activations SET last_seen_at = datetime('now'), app_version = ? WHERE code = ? AND machine_id = ?",
          args: [app_version || null, code, machine_id],
        });
      } else {
        await client.execute({
          sql: 'INSERT INTO activations (code, machine_id, app_version, ip_address) VALUES (?, ?, ?, ?)',
          args: [code, machine_id, app_version || null, req.headers['x-forwarded-for'] || ''],
        });
      }

      const tier = codeInfo.tier || 'pro';
      const signature = generateSignature(code, machine_id, tier);

      return res.json({
        valid: true,
        tier,
        expires_at: codeInfo.expires_at || null,
        offline_grace_days: 7,
        signature,
      });
    }

    // Admin: list codes
    if (url === '/api/admin/codes' && method === 'GET') {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
        return res.status(401).json({ error: '未授权' });
      }

      const client = getDb();
      await initDb(client);
      const result = await client.execute(
        'SELECT ic.*, (SELECT COUNT(*) FROM activations a WHERE a.code = ic.code) as activation_count FROM invitation_codes ic ORDER BY ic.created_at DESC'
      );

      return res.json({ codes: result.rows, total: result.rows.length });
    }

    // Admin: generate codes
    if (url === '/api/admin/codes' && method === 'POST') {
      const authHeader = req.headers.authorization;
      if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_API_KEY}`) {
        return res.status(401).json({ error: '未授权' });
      }

      const client = getDb();
      await initDb(client);
      const { count = 10, tier = 'pro', expires_at = null } = req.body;

      if (count < 1 || count > 1000) {
        return res.status(400).json({ error: '数量范围: 1-1000' });
      }

      const results = [];
      for (let i = 0; i < count; i++) {
        const code = generateCode();
        try {
          await client.execute({
            sql: 'INSERT INTO invitation_codes (code, tier, max_machines, expires_at) VALUES (?, ?, ?, ?)',
            args: [code, tier, 1, expires_at],
          });
          results.push(code);
        } catch (err) {
          // skip duplicates
        }
      }

      return res.json({ generated: results.length, codes: results, tier, expires_at });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: '服务器内部错误', detail: error.message });
  }
};

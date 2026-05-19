const { initDb } = require('../../lib/db');
const { generateBatch } = require('../../lib/code-gen');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 验证 Admin API Key
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    return res.status(500).json({ error: 'ADMIN_API_KEY 未配置' });
  }

  if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: '未授权' });
  }

  try {
    const db = await initDb();

    // GET: 列出所有邀请码
    if (req.method === 'GET') {
      const result = await db.execute(
        'SELECT ic.*, COUNT(a.id) as activation_count FROM invitation_codes ic LEFT JOIN activations a ON ic.code = a.code GROUP BY ic.id ORDER BY ic.created_at DESC'
      );

      return res.json({
        codes: result.rows,
        total: result.rows.length,
      });
    }

    // POST: 批量生成邀请码
    if (req.method === 'POST') {
      const { count = 10, tier = 'pro', expires_at = null } = req.body;

      if (count < 1 || count > 1000) {
        return res.status(400).json({ error: '数量范围: 1-1000' });
      }

      const codes = generateBatch(count, tier, expires_at);
      const results = [];

      for (const codeInfo of codes) {
        try {
          await db.execute({
            sql: 'INSERT INTO invitation_codes (code, tier, max_machines, expires_at) VALUES (?, ?, ?, ?)',
            args: [codeInfo.code, codeInfo.tier, codeInfo.max_machines, codeInfo.expires_at],
          });
          results.push(codeInfo.code);
        } catch (err) {
          // Skip duplicate codes
          if (!err.message?.includes('UNIQUE')) {
            console.error('Failed to insert code:', err);
          }
        }
      }

      return res.json({
        generated: results.length,
        codes: results,
        tier,
        expires_at,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin codes error:', error);
    return res.status(500).json({ error: '服务器内部错误' });
  }
};

const express = require('express');
const cors = require('cors');
const { initDb } = require('./lib/db');
const { generateSignature } = require('./lib/signature');
const { generateBatch } = require('./lib/code-gen');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'hclier-license-server',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

// 验证邀请码
app.post('/api/v1/validate', async (req, res) => {
  try {
    const db = await initDb();
    const { invitation_code, machine_id, app_version } = req.body;

    if (!invitation_code || !machine_id) {
      return res.json({ valid: false, error_message: '缺少必要参数' });
    }

    const code = invitation_code.toUpperCase();

    // 查询邀请码
    const result = await db.execute({
      sql: 'SELECT * FROM invitation_codes WHERE code = ? AND is_active = 1',
      args: [code],
    });

    if (result.rows.length === 0) {
      return res.json({ valid: false, error_message: '邀请码无效' });
    }

    const codeInfo = result.rows[0];

    // 检查过期
    if (codeInfo.expires_at) {
      if (new Date(codeInfo.expires_at) < new Date()) {
        return res.json({ valid: false, error_message: '邀请码已过期' });
      }
    }

    // 检查机器绑定数
    const activationCount = await db.execute({
      sql: 'SELECT COUNT(*) as count FROM activations WHERE code = ?',
      args: [code],
    });

    const existingActivation = await db.execute({
      sql: 'SELECT * FROM activations WHERE code = ? AND machine_id = ?',
      args: [code, machine_id],
    });

    const maxMachines = codeInfo.max_machines || 1;
    const currentCount = activationCount.rows[0]?.count || 0;

    if (existingActivation.rows.length === 0 && currentCount >= maxMachines) {
      return res.json({
        valid: false,
        error_message: `已达到最大设备数（${maxMachines}台）`,
      });
    }

    // 记录/更新激活
    if (existingActivation.rows.length > 0) {
      await db.execute({
        sql: "UPDATE activations SET last_seen_at = datetime('now'), app_version = ? WHERE code = ? AND machine_id = ?",
        args: [app_version || null, code, machine_id],
      });
    } else {
      await db.execute({
        sql: 'INSERT INTO activations (code, machine_id, app_version, ip_address) VALUES (?, ?, ?, ?)',
        args: [code, machine_id, app_version || null, req.ip],
      });
    }

    // 生成签名
    const tier = codeInfo.tier || 'pro';
    const signature = generateSignature(code, machine_id, tier);

    console.log(`[Validate] ${code} -> ${tier} (machine: ${machine_id.substring(0, 12)}...)`);

    res.json({
      valid: true,
      tier,
      expires_at: codeInfo.expires_at || null,
      offline_grace_days: 7,
      signature,
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ valid: false, error_message: '服务器内部错误' });
  }
});

// Admin: 列出邀请码
app.get('/api/admin/codes', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY || 'dev-admin-key';

  if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: '未授权' });
  }

  try {
    const db = await initDb();
    const result = await db.execute(
      'SELECT ic.*, (SELECT COUNT(*) FROM activations a WHERE a.code = ic.code) as activation_count FROM invitation_codes ic ORDER BY ic.created_at DESC'
    );

    res.json({ codes: result.rows, total: result.rows.length });
  } catch (error) {
    console.error('List codes error:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// Admin: 批量生成邀请码
app.post('/api/admin/codes', async (req, res) => {
  const authHeader = req.headers.authorization;
  const adminKey = process.env.ADMIN_API_KEY || 'dev-admin-key';

  if (!authHeader || authHeader !== `Bearer ${adminKey}`) {
    return res.status(401).json({ error: '未授权' });
  }

  try {
    const db = await initDb();
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
        if (!err.message?.includes('UNIQUE')) {
          console.error('Failed to insert code:', err);
        }
      }
    }

    console.log(`[Admin] Generated ${results.length} codes (tier: ${tier})`);

    res.json({
      generated: results.length,
      codes: results,
      tier,
      expires_at,
    });
  } catch (error) {
    console.error('Generate codes error:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 启动服务器
async function start() {
  try {
    await initDb();
    console.log('Database initialized');

    app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════╗
║         H CLIer License Server v2.0.0                   ║
╠══════════════════════════════════════════════════════════╣
║  服务器运行在: http://localhost:${PORT}                     ║
║  验证端点: POST /api/v1/validate                          ║
║  管理端点: GET/POST /api/admin/codes                      ║
║  健康检查: GET /health                                    ║
╚══════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

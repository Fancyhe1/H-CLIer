const { initDb } = require('../lib/db');
const { generateSignature } = require('../lib/signature');

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ valid: false, error_message: 'Method not allowed' });
  }

  try {
    const db = await initDb();
    const { invitation_code, machine_id, app_version } = req.body;

    // 1. 参数校验
    if (!invitation_code || !machine_id) {
      return res.json({ valid: false, error_message: '缺少必要参数' });
    }

    const code = invitation_code.toUpperCase();

    // 2. 查询邀请码
    const result = await db.execute({
      sql: 'SELECT * FROM invitation_codes WHERE code = ? AND is_active = 1',
      args: [code],
    });

    if (result.rows.length === 0) {
      return res.json({ valid: false, error_message: '邀请码无效' });
    }

    const codeInfo = result.rows[0];

    // 3. 检查邀请码是否过期
    if (codeInfo.expires_at) {
      const expiresAt = new Date(codeInfo.expires_at);
      if (expiresAt < new Date()) {
        return res.json({ valid: false, error_message: '邀请码已过期' });
      }
    }

    // 4. 检查机器绑定数
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

    // 5. 记录/更新激活
    if (existingActivation.rows.length > 0) {
      await db.execute({
        sql: "UPDATE activations SET last_seen_at = datetime('now'), app_version = ? WHERE code = ? AND machine_id = ?",
        args: [app_version || null, code, machine_id],
      });
    } else {
      await db.execute({
        sql: 'INSERT INTO activations (code, machine_id, app_version, ip_address) VALUES (?, ?, ?, ?)',
        args: [code, machine_id, app_version || null, req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null],
      });
    }

    // 6. 生成签名并返回
    const tier = codeInfo.tier || 'pro';
    const signature = generateSignature(code, machine_id, tier);

    return res.json({
      valid: true,
      tier,
      expires_at: codeInfo.expires_at || null,
      offline_grace_days: 7,
      signature,
    });
  } catch (error) {
    console.error('Validation error:', error);
    return res.status(500).json({ valid: false, error_message: '服务器内部错误' });
  }
};

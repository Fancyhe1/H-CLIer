const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// 共享密钥（与客户端约定，用于生成签名）
const SECRET_KEY = 'your-super-secret-key-change-this-in-production';

// 预定义的邀请码列表（实际应存储在数据库中）
const VALID_CODES = {
  // 格式: CODE-XXXX-XXXX-XXXX
  'HCLI-ER01-PRO1-0001': { tier: 'pro', expiresInDays: 365 },
  'HCLI-ER01-PRO1-0002': { tier: 'pro', expiresInDays: 365 },
  'HCLI-ER01-PRO1-0003': { tier: 'pro', expiresInDays: 365 },
  'HCLI-ER01-STD1-0001': { tier: 'standard', expiresInDays: 30 },
  'HCLI-ER01-STD1-0002': { tier: 'standard', expiresInDays: 30 },
  // 测试用万能码
  'TEST-1234-5678-ABCD': { tier: 'pro', expiresInDays: 365 * 10 },
};

// 机器ID黑名单（已使用的机器，用于检测多设备使用）
const USED_MACHINE_IDS = new Map(); // code -> machine_id

// 生成签名
function generateSignature(code, machineId, expiresAt) {
  const payload = `${code}:${machineId}:${expiresAt}`;
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(payload)
    .digest('base64');
}

// 计算过期时间
function calculateExpiresAt(daysFromNow) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString();
}

app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 验证激活码
app.post('/api/v1/validate', (req, res) => {
  const { invitation_code, machine_id, app_version } = req.body;

  console.log(`[${new Date().toISOString()}] 验证请求:`, {
    invitation_code,
    machine_id: machine_id ? machine_id.substring(0, 12) + '...' : null,
    app_version
  });

  // 参数验证
  if (!invitation_code || !machine_id) {
    return res.status(400).json({
      valid: false,
      error_message: '缺少必要参数'
    });
  }

  // 检查邀请码是否有效
  const codeInfo = VALID_CODES[invitation_code.toUpperCase()];
  if (!codeInfo) {
    console.log(`[${new Date().toISOString()}] 邀请码无效: ${invitation_code}`);
    return res.json({
      valid: false,
      error_message: '邀请码无效'
    });
  }

  // 检查是否已在其他机器使用
  const existingMachineId = USED_MACHINE_IDS.get(invitation_code.toUpperCase());
  if (existingMachineId && existingMachineId !== machine_id) {
    console.log(`[${new Date().toISOString()}] 机器不匹配: ${invitation_code}`);
    return res.json({
      valid: false,
      error_message: '此邀请码已在其他设备上使用'
    });
  }

  // 标记机器ID已使用
  USED_MACHINE_IDS.set(invitation_code.toUpperCase(), machine_id);

  // 计算过期时间
  const expires_at = calculateExpiresAt(codeInfo.expiresInDays);

  // 生成签名
  const signature = generateSignature(
    invitation_code.toUpperCase(),
    machine_id,
    expires_at
  );

  console.log(`[${new Date().toISOString()}] 验证成功: ${invitation_code} -> ${codeInfo.tier}`);

  res.json({
    valid: true,
    tier: codeInfo.tier,
    expires_at: expires_at,
    offline_grace_days: 7,
    signature: signature
  });
});

// 获取服务端状态
app.get('/api/v1/status', (req, res) => {
  res.json({
    status: 'running',
    valid_codes_count: Object.keys(VALID_CODES).length,
    used_codes_count: USED_MACHINE_IDS.size
  });
});

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║         H CLIer 激活码验证服务器                         ║
╠══════════════════════════════════════════════════════════╣
║  服务器运行在: http://localhost:${PORT}                     ║
║  验证端点: POST /api/v1/validate                          ║
║  健康检查: GET /health                                    ║
╠══════════════════════════════════════════════════════════╣
║  测试邀请码:                                              ║
║  - TEST-1234-5678-ABCD (10年Pro)                         ║
║  - HCLI-ER01-PRO1-0001 (1年Pro)                          ║
║  - HCLI-ER01-STD1-0001 (30天标准版)                      ║
╚══════════════════════════════════════════════════════════╝
  `);
});
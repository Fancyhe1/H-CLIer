const crypto = require('crypto');

// 排除易混淆字符: 0, O, I, 1, L
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCode() {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    let segment = '';
    for (let j = 0; j < 4; j++) {
      segment += CHARS[crypto.randomInt(CHARS.length)];
    }
    segments.push(segment);
  }
  return segments.join('-');
}

function generateBatch(count, tier = 'pro', expiresAt = null) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    codes.push({
      code: generateCode(),
      tier,
      max_machines: 1,
      expires_at: expiresAt,
    });
  }
  return codes;
}

module.exports = { generateCode, generateBatch };

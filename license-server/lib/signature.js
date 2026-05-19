const crypto = require('crypto');

const SECRET_KEY = process.env.SIGNATURE_SECRET || 'hclier-default-secret-change-in-production';

function generateSignature(code, machineId, tier) {
  const payload = `${code}:${machineId}:${tier}`;
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(payload)
    .digest('hex');
}

module.exports = { generateSignature };

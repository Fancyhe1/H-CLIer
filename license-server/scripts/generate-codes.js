#!/usr/bin/env node

/**
 * 本地批量生成邀请码脚本
 * 用法: node scripts/generate-codes.js [count] [tier] [expires_at]
 * 示例: node scripts/generate-codes.js 100 pro 2027-12-31T23:59:59Z
 */

const { initDb } = require('../lib/db');
const { generateBatch } = require('../lib/code-gen');

async function main() {
  const count = parseInt(process.argv[2]) || 10;
  const tier = process.argv[3] || 'pro';
  const expiresAt = process.argv[4] || null;

  console.log(`Generating ${count} invitation codes (tier: ${tier})...`);

  try {
    const db = await initDb();
    const codes = generateBatch(count, tier, expiresAt);
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

    console.log(`\nSuccessfully generated ${results.length} codes:\n`);
    results.forEach((code, i) => {
      console.log(`  ${i + 1}. ${code}`);
    });

    console.log(`\nTier: ${tier}`);
    if (expiresAt) {
      console.log(`Expires: ${expiresAt}`);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();

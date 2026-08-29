#!/usr/bin/env node
/**
 * 发布脚本：同步版本号 → 提交 → 打 tag → 推送
 *
 * 用法：node scripts/release.js <version>
 * 示例：node scripts/release.js 0.5.3
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const version = process.argv[2]

if (!version) {
  console.error('用法: node scripts/release.js <version>')
  console.error('示例: node scripts/release.js 0.5.3')
  process.exit(1)
}

// 验证版本号格式
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`版本号格式错误: ${version}`)
  console.error('请使用语义化版本号，如 0.5.3')
  process.exit(1)
}

const root = path.resolve(__dirname, '..')
const pkgPath = path.join(root, 'package.json')
const cargoPath = path.join(root, 'src-tauri', 'Cargo.toml')

// 1. 更新 package.json
console.log(`更新 package.json → ${version}`)
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const oldPkgVersion = pkg.version
pkg.version = version
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

// 2. 更新 Cargo.toml
console.log(`更新 Cargo.toml → ${version}`)
let cargo = fs.readFileSync(cargoPath, 'utf8')
const oldCargoVersion = cargo.match(/^version = "(\d+\.\d+\.\d+)"/m)?.[1]
cargo = cargo.replace(/^version = "\d+\.\d+\.\d+"/m, `version = "${version}"`)
fs.writeFileSync(cargoPath, cargo)

console.log(`\n版本号: ${oldPkgVersion} → ${version}`)
console.log(`Cargo.toml: ${oldCargoVersion} → ${version}`)

// 3. 检查 git 状态
try {
  const status = execSync('git status --porcelain', { cwd: root, encoding: 'utf8' })
  if (status.trim()) {
    console.log('\n⚠️  有未提交的更改:')
    console.log(status)
  }
} catch (e) {
  console.error('git 状态检查失败')
}

// 4. 提交版本号更改
console.log('\n提交版本号更改...')
try {
  execSync('git add package.json src-tauri/Cargo.toml', { cwd: root, stdio: 'inherit' })
  execSync(`git commit -m "release: v${version}" --only package.json src-tauri/Cargo.toml`, { cwd: root, stdio: 'inherit' })
} catch (e) {
  console.error('提交失败:', e.message)
  process.exit(1)
}

// 5. 打 tag
console.log(`\n创建 tag: v${version}`)
try {
  execSync(`git tag v${version}`, { cwd: root, stdio: 'inherit' })
} catch (e) {
  console.error('创建 tag 失败:', e.message)
  process.exit(1)
}

// 6. 推送
console.log('\n推送到 GitHub...')
try {
  execSync('git push', { cwd: root, stdio: 'inherit' })
  execSync(`git push origin v${version}`, { cwd: root, stdio: 'inherit' })
} catch (e) {
  console.error('推送失败:', e.message)
  process.exit(1)
}

console.log(`\n✅ v${version} 发布完成！GitHub Actions 将自动构建并发布安装包。`)

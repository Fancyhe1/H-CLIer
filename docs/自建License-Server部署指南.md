# H CLIer License Server 自建部署指南

> 创建时间：2026-05-18
> 适用版本：H CLIer v0.1.9+
> 预计耗时：1-2 小时

---

## 目录

1. [总体架构](#1-总体架构)
2. [创建虚拟机](#2-创建虚拟机)
3. [系统初始化](#3-系统初始化)
4. [部署 License Server](#4-部署-license-server)
5. [配置 Nginx 反向代理](#5-配置-nginx-反向代理)
6. [配置 HTTPS（可选但推荐）](#6-配置-https)
7. [防火墙配置](#7-防火墙配置)
8. [客户端配置](#8-客户端配置)
9. [测试验证](#9-测试验证)
10. [生成邀请码](#10-生成邀请码)
11. [日常运维](#11-日常运维)
12. [故障排查](#12-故障排查)

---

## 1. 总体架构

```
用户电脑 (H CLIer)                    你的服务器
     |                                   |
     |  POST /api/v1/validate            |
     |  (邀请码 + 机器ID)                |
     |  -------------------------------->|
     |                                   |  查询 SQLite 数据库
     |                                   |  检查: 码有效？过期？设备超限？
     |  返回验证结果                      |
     |<--------------------------------  |
     |  (有效/无效 + tier + 签名)         |
     |                                   |
     |  保存激活状态到本地                 |
```

**技术栈：**
- 操作系统：Ubuntu 22.04 LTS（推荐）
- 运行时：Node.js 18 LTS
- 数据库：本地 SQLite（无需外部依赖）
- 进程管理：PM2
- 反向代理：Nginx

---

## 2. 创建虚拟机

### 2.1 虚拟机配置

| 项目 | 推荐配置 | 最低配置 |
|------|----------|----------|
| CPU | 2 核 | 1 核 |
| 内存 | 2 GB | 1 GB |
| 硬盘 | 20 GB SSD | 10 GB |
| 操作系统 | Ubuntu 22.04 LTS | Ubuntu 20.04 LTS |
| 网络 | 公网 IP | 公网 IP |

### 2.2 创建步骤（以 VMware/Proxmox 为例）

1. 下载 Ubuntu 22.04 Server ISO：
   ```
   https://ubuntu.com/download/server
   ```

2. 创建虚拟机，挂载 ISO，按向导安装

3. 安装时选择：
   - Install OpenSSH server（勾选）
   - 其他组件不选，保持最小安装

4. 记录分配的 IP 地址（后续 SSH 连接用）

### 2.3 SSH 连接到服务器

```bash
# Windows 用 PowerShell 或 Git Bash
ssh root@你的服务器IP

# 如果用密钥登录
ssh -i ~/.ssh/id_rsa root@你的服务器IP
```

---

## 3. 系统初始化

### 3.1 更新系统

```bash
apt update && apt upgrade -y
```

### 3.2 安装必要工具

```bash
apt install -y curl wget git build-essential
```

### 3.3 安装 Node.js 18 LTS

```bash
# 添加 NodeSource 仓库
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -

# 安装 Node.js
apt install -y nodejs

# 验证安装
node --version    # 应显示 v18.x.x
npm --version     # 应显示 9.x.x 或更高
```

### 3.4 安装 PM2（进程管理器）

```bash
npm install -g pm2

# 验证
pm2 --version
```

### 3.5 安装 Nginx

```bash
apt install -y nginx

# 启动并设置开机自启
systemctl start nginx
systemctl enable nginx

# 验证
systemctl status nginx
```

### 3.6 创建专用用户（安全起见）

```bash
# 创建用户
adduser hclier

# 添加 sudo 权限
usermod -aG sudo hclier

# 创建应用目录
mkdir -p /opt/license-server
chown hclier:hclier /opt/license-server
```

---

## 4. 部署 License Server

### 4.1 在本机准备文件

需要上传的文件目录结构：

```
license-server/
├── server.js          # 主程序
├── package.json       # 依赖配置
├── lib/
│   ├── db.js          # 数据库
│   ├── code-gen.js    # 邀请码生成
│   └── signature.js   # 签名验证
├── scripts/
│   └── generate-codes.js  # 批量生成脚本
└── .env               # 环境变量（需要创建）
```

### 4.2 修改 db.js 使用本地 SQLite

在本机修改 `license-server/lib/db.js`，让数据库默认使用本地文件：

```javascript
// license-server/lib/db.js
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
```

### 4.3 创建 .env 文件

在本机创建 `license-server/.env`：

```bash
# License Server 环境变量
# 管理接口密码（生成邀请码时需要）
ADMIN_API_KEY=7a98fa2a79dc7379b198901d824909a7

# 签名密钥（验证签名用，不要泄露）
SIGNATURE_SECRET=ab2251c62455b28b45a22be2759c302b7b3418866ccc2c3ea8f446b37e4b5fe1

# 服务端口
PORT=3000
```

> **注意**：密钥就是之前生成的那两个，保持一致即可。

### 4.4 上传文件到服务器

在本机执行（PowerShell 或 Git Bash）：

```bash
# 方式一：用 scp 上传整个目录
scp -r license-server/ hclier@你的服务器IP:/opt/license-server/

# 方式二：如果 scp 不好用，先打包再上传
cd license-server
tar czf license-server.tar.gz .
scp license-server.tar.gz hclier@你的服务器IP:/opt/license-server/

# 在服务器上解压
ssh hclier@你的服务器IP
cd /opt/license-server
tar xzf license-server.tar.gz
rm license-server.tar.gz
```

### 4.5 在服务器上安装依赖

```bash
# SSH 到服务器
ssh hclier@你的服务器IP

# 进入目录
cd /opt/license-server

# 安装依赖
npm install

# 创建数据目录
mkdir -p data
```

### 4.6 测试运行

```bash
# 直接运行测试
node server.js
```

应该看到：

```
Database initialized

╔══════════════════════════════════════════════════════════╗
║         H CLIer License Server v2.0.0                   ║
╠══════════════════════════════════════════════════════════╣
║  服务器运行在: http://localhost:3000                     ║
║  验证端点: POST /api/v1/validate                          ║
║  管理端点: GET/POST /api/admin/codes                      ║
║  健康检查: GET /health                                    ║
╚══════════════════════════════════════════════════════════╝
```

按 `Ctrl+C` 停止，接下来用 PM2 管理。

### 4.7 用 PM2 启动服务

```bash
cd /opt/license-server

# 用 PM2 启动
pm2 start server.js --name hclier-license

# 查看状态
pm2 status

# 保存当前进程列表
pm2 save

# 设置开机自启
pm2 startup
# 会输出一条命令，复制执行它，类似：
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u hclier --hp /home/hclier

# 查看日志
pm2 logs hclier-license
```

### 4.8 验证本地服务

```bash
# 在服务器上测试
curl http://localhost:3000/health

# 应该返回：
# {"status":"ok","service":"hclier-license-server","version":"2.0.0","timestamp":"..."}
```

---

## 5. 配置 Nginx 反向代理

### 5.1 创建 Nginx 配置文件

```bash
sudo nano /etc/nginx/sites-available/license-server
```

写入以下内容：

```nginx
server {
    listen 80;
    server_name license.你的域名.com;  # 没域名就用 IP，填 _

    # 如果用 IP 没有域名，改为：
    # server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时设置
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
}
```

### 5.2 启用配置

```bash
# 创建软链接
sudo ln -s /etc/nginx/sites-available/license-server /etc/nginx/sites-enabled/

# 删除默认配置（可选）
sudo rm /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t

# 应该输出：
# nginx: configuration file /etc/nginx/nginx.conf test is successful

# 重载 Nginx
sudo systemctl reload nginx
```

### 5.3 验证 Nginx 代理

```bash
# 在服务器上测试
curl http://localhost/health

# 从本机测试（用服务器 IP）
curl http://你的服务器IP/health
```

---

## 6. 配置 HTTPS

如果有域名，强烈建议配置 HTTPS。

### 6.1 安装 Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 6.2 申请证书

```bash
sudo certbot --nginx -d license.你的域名.com
```

按提示操作：
- 输入邮箱
- 同意条款（Y）
- 是否分享邮箱（N 或 Y 都行）

### 6.3 验证自动续期

```bash
sudo certbot renew --dry-run
```

### 6.4 测试 HTTPS

```bash
curl https://license.你的域名.com/health
```

---

## 7. 防火墙配置

### 7.1 使用 UFW

```bash
# 启用防火墙
sudo ufw enable

# 允许 SSH
sudo ufw allow ssh

# 允许 HTTP
sudo ufw allow 80/tcp

# 允许 HTTPS（如果配置了）
sudo ufw allow 443/tcp

# 查看状态
sudo ufw status
```

输出应类似：

```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
```

### 7.2 如果用云服务器（阿里云/腾讯云等）

还需要在云控制台的安全组中放行 80 和 443 端口。

---

## 8. 客户端配置

### 8.1 修改 license.rs 中的服务器地址

在本机修改 `aicoder/src-tauri/src/license.rs`，找到：

```rust
// License server URL: env var > default
// TODO: 发布时改为生产地址
let server_url = std::env::var("LICENSE_SERVER_URL")
    .unwrap_or_else(|_| "http://localhost:3000".to_string());
```

改为：

```rust
// License server URL: env var > default
let server_url = std::env::var("LICENSE_SERVER_URL")
    .unwrap_or_else(|_| "https://license.你的域名.com".to_string());
```

> 如果没有域名，用 `http://你的服务器IP`。

### 8.2 重新编译客户端

```bash
cd aicoder
npm run tauri:dev   # 开发测试
# 或
npm run tauri:build # 生产构建
```

---

## 9. 测试验证

### 9.1 测试健康检查

```bash
# 从本机测试
curl https://license.你的域名.com/health

# 预期输出：
# {"status":"ok","service":"hclier-license-server","version":"2.0.0","timestamp":"..."}
```

### 9.2 测试生成邀请码

```bash
# 生成 5 个测试码
curl -X POST https://license.你的域名.com/api/admin/codes \
  -H "Authorization: Bearer 7a98fa2a79dc7379b198901d824909a7" \
  -H "Content-Type: application/json" \
  -d '{"count": 5, "tier": "pro", "expires_at": "2027-12-31T23:59:59Z"}'

# 预期输出：
# {"generated":5,"codes":["XXXX-XXXX-XXXX-XXXX",...],"tier":"pro","expires_at":"2027-12-31T23:59:59Z"}
```

### 9.3 测试验证邀请码

```bash
# 用上一步生成的码测试
curl -X POST https://license.你的域名.com/api/v1/validate \
  -H "Content-Type: application/json" \
  -d '{"invitation_code": "上一步生成的码", "machine_id": "test-machine-123", "app_version": "0.1.9"}'

# 预期输出：
# {"valid":true,"tier":"pro","expires_at":"2027-12-31T23:59:59Z","offline_grace_days":7,"signature":"..."}
```

### 9.4 测试客户端激活

1. 启动 H CLIer（`npm run tauri:dev`）
2. 在激活界面输入上一步生成的邀请码
3. 点击"激活"
4. 应该显示"激活成功"并进入主界面
5. 打开设置 → 关于，应该能看到许可证信息

---

## 10. 生成邀请码

### 10.1 通过 API 批量生成

```bash
# 生成 100 个 beta 测试码，有效期到 2026 年底
curl -X POST https://license.你的域名.com/api/admin/codes \
  -H "Authorization: Bearer 7a98fa2a79dc7379b198901d824909a7" \
  -H "Content-Type: application/json" \
  -d '{"count": 100, "tier": "beta", "expires_at": "2026-12-31T23:59:59Z"}'
```

### 10.2 查看所有邀请码

```bash
curl https://license.你的域名.com/api/admin/codes \
  -H "Authorization: Bearer 7a98fa2a79dc7379b198901d824909a7"
```

### 10.3 邀请码分发建议

| 渠道 | 数量 | 用途 |
|------|------|------|
| GitHub Issues | 30 | 社区推广 |
| 技术论坛 | 20 | 早期用户 |
| 朋友/同事 | 10 | 内测反馈 |
| 预留 | 40 | 后续活动 |

---

## 11. 日常运维

### 11.1 常用命令

```bash
# 查看服务状态
pm2 status

# 查看实时日志
pm2 logs hclier-license

# 重启服务
pm2 restart hclier-license

# 停止服务
pm2 stop hclier-license

# 查看资源占用
pm2 monit
```

### 11.2 数据库备份

```bash
# 手动备份
cp /opt/license-server/data/license.db /opt/license-server/data/license.db.bak.$(date +%Y%m%d)

# 设置自动备份（每天凌晨 3 点）
crontab -e

# 添加以下行：
0 3 * * * cp /opt/license-server/data/license.db /opt/license-server/data/license.db.bak.$(date +\%Y\%m\%d)
```

### 11.3 查看 Nginx 日志

```bash
# 访问日志
sudo tail -f /var/log/nginx/access.log

# 错误日志
sudo tail -f /var/log/nginx/error.log
```

### 11.4 系统更新

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 更新 Node.js（如需要）
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt install -y nodejs

# 更新应用代码后重启
cd /opt/license-server
npm install
pm2 restart hclier-license
```

### 11.5 监控脚本（可选）

创建健康检查脚本：

```bash
nano /opt/license-server/scripts/health-check.sh
```

写入：

```bash
#!/bin/bash
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
if [ "$RESPONSE" != "200" ]; then
  echo "$(date): License Server is down! Restarting..." >> /var/log/license-server-monitor.log
  pm2 restart hclier-license
fi
```

设置定时执行：

```bash
chmod +x /opt/license-server/scripts/health-check.sh
crontab -e

# 添加每 5 分钟检查一次
*/5 * * * * /opt/license-server/scripts/health-check.sh
```

---

## 12. 故障排查

### 12.1 服务无法启动

```bash
# 查看 PM2 日志
pm2 logs hclier-license --lines 50

# 常见原因：
# - 端口被占用：lsof -i :3000
# - 依赖未安装：cd /opt/license-server && npm install
# - 权限问题：chown -R hclier:hclier /opt/license-server
```

### 12.2 客户端无法连接

```bash
# 1. 检查服务是否运行
pm2 status

# 2. 检查端口是否监听
ss -tlnp | grep 3000

# 3. 检查防火墙
sudo ufw status

# 4. 检查 Nginx 配置
sudo nginx -t

# 5. 从外部测试
curl http://你的服务器IP:3000/health

# 6. 检查云服务器安全组是否放行 80/443 端口
```

### 12.3 邀请码验证失败

```bash
# 查看服务日志
pm2 logs hclier-license --lines 20

# 检查数据库是否正常
cd /opt/license-server
node -e "const {initDb} = require('./lib/db'); initDb().then(db => db.execute('SELECT COUNT(*) FROM invitation_codes')).then(r => console.log('邀请码数量:', r.rows[0])).catch(console.error)"
```

### 12.4 磁盘空间不足

```bash
# 检查磁盘使用
df -h

# 清理旧日志
pm2 flush hclier-license

# 清理旧备份
find /opt/license-server/data -name "*.bak.*" -mtime +30 -delete
```

---

## 附录 A：完整部署检查清单

- [ ] 虚拟机创建完成，可 SSH 连接
- [ ] Node.js 18 安装成功（`node --version`）
- [ ] PM2 安装成功（`pm2 --version`）
- [ ] Nginx 安装并运行（`systemctl status nginx`）
- [ ] license-server 文件上传到 `/opt/license-server/`
- [ ] `npm install` 执行成功
- [ ] `.env` 文件已创建且密钥正确
- [ ] `pm2 start server.js` 运行成功
- [ ] `curl http://localhost:3000/health` 返回正常
- [ ] Nginx 配置已启用且 `nginx -t` 通过
- [ ] `curl http://服务器IP/health` 返回正常
- [ ] 防火墙已放行 80/443 端口
- [ ] 客户端 `license.rs` 中的 URL 已修改
- [ ] 客户端可正常激活
- [ ] 设置页面显示许可证信息

## 附录 B：API 接口汇总

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/health` | 健康检查 | 无 |
| POST | `/api/v1/validate` | 验证邀请码 | 无 |
| GET | `/api/admin/codes` | 列出所有邀请码 | Bearer Token |
| POST | `/api/admin/codes` | 批量生成邀请码 | Bearer Token |

**Bearer Token**：`7a98fa2a79dc7379b198901d824909a7`

---

*文档维护者：H CLIer 开发团队*
*最后更新：2026-05-18*

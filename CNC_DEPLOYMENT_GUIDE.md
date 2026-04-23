# Incubator — CNC Mainnet 全面上线部署文档

## 目录

1. [环境准备](#1-环境准备)
2. [配置参数](#2-配置参数)
3. [全新部署](#3-全新部署首次上线)
4. [升级部署](#4-升级部署迭代更新)
5. [一键部署脚本](#5-一键部署脚本)
6. [结算系统配置](#6-结算系统配置)
7. [运维与监控](#7-运维与监控)
8. [回滚方案](#8-回滚方案)
9. [安全注意事项](#9-安全注意事项)

---

## 1. 环境准备

### 1.1 服务器要求

| 项目    | 要求                  |
| ------- | --------------------- |
| OS      | Ubuntu 22.04+         |
| Node.js | v20+                  |
| npm     | v10+                  |
| Caddy   | v2.x（Web 服务器）    |
| 内存    | ≥2 GB（合约编译需要） |
| 磁盘    | ≥5 GB                 |

### 1.2 安装依赖

```bash
# Node.js (若未安装)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Caddy (若未安装)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# 创建 Web 发布目录
sudo mkdir -p /var/www/incubator/dist
sudo chown caddy:caddy /var/www/incubator
```

### 1.3 克隆项目

```bash
cd /home/ubuntu
git clone git@github.com:dappweb/Incubator.git
cd Incubator
npm install
```

---

## 2. 配置参数

### 2.1 创建 .env

```bash
cp .env.example .env
```

### 2.2 必填参数表

#### 部署者 & 网络

| 变量                   | 说明           | 示例                          |
| ---------------------- | -------------- | ----------------------------- |
| `DEPLOYER_PRIVATE_KEY` | 部署者钱包私钥 | `0x4f3b...03d2`               |
| `CNC_MAINNET_RPC_URL`  | CNC 主网 RPC   | `https://rpc.cncchainpro.com` |

#### 代币地址

| 变量                  | 说明               | 当前值                                       |
| --------------------- | ------------------ | -------------------------------------------- |
| `USDT_TOKEN_ADDRESS`  | CNC 链 USDT (18位) | `0x7EA6474c89DE99d186F6559C06A15681197ca48F` |
| `ICO_TOKEN_ADDRESS`   | ICO 代币           | `0x306d55A808E8AF520BAC5bC755af38033AeDBd40` |
| `LIGHT_TOKEN_ADDRESS` | LIGHT 代币         | `0xe426aA3fe3F7eDA4D89b79c8011a1259eB2cCf92` |

#### 合约代理地址（首次部署后自动写入）

| 变量                            | 说明           | 当前值                                       |
| ------------------------------- | -------------- | -------------------------------------------- |
| `INCUBATOR_CORE_PROXY`          | Core 合约代理  | `0xECD96148D33A8ca8F86cd701d445FB3bbe7592E2` |
| `NODE_OTC_MARKET_PROXY`         | OTC 合约代理   | `0xE25dC31Ad59159043793689e1cBF6A75CE352c5b` |
| `SWAP_POOL_MANAGER_PROXY`       | Swap 合约代理  | `0xc732FB1ee86A4B29D2d3E4b4d4c2492D01131f81` |
| `PRIMARY_SWAP_CONTROLLER_PROXY` | 一级市场控制器 | `0x1A1c0Bc17f26Cacae0dCe9b6bB1034380E4628a8` |

#### 资金池接收钱包

| 变量                       | 说明               |
| -------------------------- | ------------------ |
| `LP_POOL_ADDRESS`          | 流动性池接收地址   |
| `REFERRAL_POOL_ADDRESS`    | 推荐奖励池接收地址 |
| `SUPER_NODE_POOL_ADDRESS`  | 超级节点池接收地址 |
| `NODE_POOL_ADDRESS`        | 节点池接收地址     |
| `PLATFORM_POOL_ADDRESS`    | 平台池接收地址     |
| `LEADERBOARD_POOL_ADDRESS` | 排行榜池接收地址   |
| `OTC_FEE_RECIPIENT`        | OTC 手续费接收地址 |

> 如需链上结算，将池地址设为 `INCUBATOR_CORE_PROXY` 本身。

#### 前端变量（VITE\_ 前缀）

| 变量                                   | 说明                         |
| -------------------------------------- | ---------------------------- |
| `VITE_USDT_CONTRACT_ADDRESS`           | = `USDT_TOKEN_ADDRESS`       |
| `VITE_USDT_DECIMALS`                   | `18`（CNC 链 USDT 为 18 位） |
| `VITE_ICO_TOKEN_ADDRESS`               | = `ICO_TOKEN_ADDRESS`        |
| `VITE_LIGHT_TOKEN_ADDRESS`             | = `LIGHT_TOKEN_ADDRESS`      |
| `VITE_CORE_CONTRACT_ADDRESS`           | = `INCUBATOR_CORE_PROXY`     |
| `VITE_OTC_CONTRACT_ADDRESS`            | = `NODE_OTC_MARKET_PROXY`    |
| `VITE_SWAP_POOL_ADDRESS`               | = `SWAP_POOL_MANAGER_PROXY`  |
| `VITE_PRIMARY_SWAP_CONTROLLER_ADDRESS` | 一级市场合约                 |
| `VITE_PANCAKE_V2_ROUTER_ADDRESS`       | PancakeSwap V2 Router        |
| `VITE_PANCAKE_V2_FACTORY_ADDRESS`      | PancakeSwap V2 Factory       |
| `VITE_PANCAKE_V2_PRIMARY_FEE_PPM`      | `2500`（0.25%）              |
| `VITE_CNC_MAINNET_BLOCK_EXPLORER_URL`  | `https://cncchainpro.com`    |
| `VITE_JSONBIN_ANNOUNCEMENTS_BIN_ID`    | JSONBin 公告 ID              |
| `VITE_JSONBIN_MASTER_KEY`              | JSONBin 管理 Key（Admin 用） |

#### 结算配置

| 变量                             | 说明                        | 默认值   |
| -------------------------------- | --------------------------- | -------- |
| `ENABLE_NODE_SETTLEMENT`         | 启用节点池结算              | `true`   |
| `ENABLE_SUPER_NODE_SETTLEMENT`   | 启用超级节点结算            | `true`   |
| `ENABLE_LEADERBOARD_SETTLEMENT`  | 启用排行榜结算              | `true`   |
| `ENABLE_DAILY_REWARD_SETTLEMENT` | 启用每日奖励结算            | `true`   |
| `SETTLEMENT_WEIGHT_MODE`         | 权重模式                    | `volume` |
| `SETTLEMENT_DRY_RUN`             | 干运行模式                  | `false`  |
| `SETTLEMENT_WRITE_AUDIT`         | 写入审计日志                | `true`   |
| `NODE_REWARD_RECIPIENTS`         | 节点奖励接收者（逗号分隔）  |          |
| `NODE_REWARD_SHARES`             | 节点奖励份额（总和=10000）  |          |
| `SUPER_NODE_REWARD_RECIPIENTS`   | 超级节点奖励接收者          |          |
| `SUPER_NODE_REWARD_SHARES`       | 超级节点奖励份额            |          |
| `LEADERBOARD_DAY_ID`             | 排行榜结算日（空=自动昨天） |          |

---

## 3. 全新部署（首次上线）

```bash
cd /home/ubuntu/Incubator

# Step 1: 安装依赖 + 编译合约
npm install
npm run compile

# Step 2: 部署合约到 CNC 主网（部署所有代理合约）
npm run deploy:cncMainnet
# 输出会打印所有已部署地址，脚本会自动写入 .env

# Step 3: 初始化内部 Swap 池（添加流动性）
npm run init:swap:cncMainnet

# Step 4: 配置 LIGHT 奖励系统（Core ↔ Swap 互联）
npm run init:light:cncMainnet

# Step 5: 创建 PancakeSwap V2 USDT/ICO 交易对（可选）
npm run pancake:v2:pool:cncMainnet

# Step 6: 设置子管理员（可选）
npm run set:subadmin:cncMainnet

# Step 7: 构建前端 + 发布
npm run build:web
sudo rm -rf /var/www/incubator/dist
sudo cp -r dist /var/www/incubator/dist
sudo chown -R caddy:caddy /var/www/incubator/dist
sudo systemctl reload caddy

# Step 8: 安装结算 Cron
npm run cron:install:settle
```

---

## 4. 升级部署（迭代更新）

日常更新只需升级合约实现 + 重新构建前端。

```bash
cd /home/ubuntu/Incubator

# 拉取最新代码
git pull origin main

# 安装依赖（如有更新）
npm install

# 一键升级 (推荐)
bash deploy-cnc-full.sh

# 或分步执行:
# 1) 编译
npm run compile
# 2) 预检查
npm run precheck:upgrade:cncMainnet
# 3) 升级合约
npm run upgrade:cncMainnet
# 4) 构建前端
npm run build:web
# 5) 发布
sudo rm -rf /var/www/incubator/dist
sudo cp -r dist /var/www/incubator/dist
sudo chown -R caddy:caddy /var/www/incubator/dist
sudo systemctl reload caddy
```

---

## 5. 一键部署脚本

项目提供一键部署脚本 `deploy-cnc-full.sh`，整合合约升级 + 前端发布 + Cron 安装。

### 用法

```bash
# 全量部署（合约升级 + 前端 + Cron）
bash deploy-cnc-full.sh

# 仅升级合约
bash deploy-cnc-full.sh --chain-only

# 仅构建前端并发布
bash deploy-cnc-full.sh --web-only

# 仅安装 Cron
bash deploy-cnc-full.sh --cron-only

# 预览计划但不执行
bash deploy-cnc-full.sh --dry-run
```

### 脚本执行流程

```
check_env()     → 检查 .env、Node.js、必需变量
print_plan()    → 打印部署计划摘要
deploy_chain()  → npm compile → precheck → upgrade
deploy_web()    → npm build:web → 复制到 /var/www → reload caddy → HTTP 验证
deploy_cron()   → install-cron.sh → 显示 cron 列表
```

---

## 6. 结算系统配置

### 6.1 结算周期

合约支持通过 Admin 面板动态设置周期：

- **生产**: `cycleDuration = 0`（默认 86400 秒 = 1 天）
- **测试**: `cycleDuration = 600`（10 分钟）

Admin → 结算 Tab → 结算周期卡片 → 设置。

### 6.2 自动结算 Cron

安装命令:

```bash
npm run cron:install:settle
```

安装后的 Cron 任务:

```
0 * * * *  → LIGHT 手续费结算 (每小时)
10 0 * * * → Core 奖励池结算 (每天 00:10 UTC)
```

### 6.3 手动触发结算

```bash
# 全部结算
npm run settle:all:cncMainnet

# 仅 LIGHT 结算
npm run settle:light:cncMainnet

# 仅 Core 结算
npm run settle:core:cncMainnet
```

### 6.4 结算参数调优

在 `.env` 中配置:

```bash
# 权重模式: volume (历史购机量) 或 power (个人算力)
SETTLEMENT_WEIGHT_MODE=volume

# 干运行: 仅计算不发交易
SETTLEMENT_DRY_RUN=false

# 审计日志: 输出到 artifacts/settlement-runs/
SETTLEMENT_WRITE_AUDIT=true

# 手动指定接收者（不设置则自动按权重计算）
NODE_REWARD_RECIPIENTS=0xAddr1,0xAddr2
NODE_REWARD_SHARES=5000,5000
```

### 6.5 结算日志

审计文件自动保存在:

```
artifacts/settlement-runs/core-settlement-50716-YYYYMMDD-HHMMSSz.json
```

运行日志保存在:

```
deploy/logs/settlement-YYYYMMDD-HHMMSS.log
```

---

## 7. 运维与监控

### 7.1 Caddy 管理

```bash
# 状态
sudo systemctl status caddy

# 重载配置（不中断连接）
sudo systemctl reload caddy

# 查看日志
sudo journalctl -u caddy -f

# 配置文件
sudo nano /etc/caddy/Caddyfile
```

### 7.2 站点结构

| 站点   | 域名                 | 用途           | 发布目录                    |
| ------ | -------------------- | -------------- | --------------------------- |
| t1     | t1.test2dapp.xyz     | 反向代理 :3001 | -                           |
| t2     | t2.test2dapp.xyz     | Seer 项目      | /var/www/seer/dist          |
| **t3** | **t3.test2dapp.xyz** | **Incubator**  | **/var/www/incubator/dist** |

### 7.3 合约状态查询

```bash
# 一级市场状态
npm run primary:status:cncMainnet

# 检查用户信息
npx hardhat run scripts/_check-user.ts --network cncMainnet
```

### 7.4 常用运维命令

```bash
# 暂停/恢复合约（通过 Admin 面板或脚本）
# Admin → 总览 → Pause/Unpause

# USDT 精度迁移
npm run migrate:usdt-decimals:cncMainnet

# 上报 ICO 持有者数量（启用卖出功能前提）
npm run primary:report-holders:cncMainnet

# 启用 ICO 卖出
npm run primary:enable-sell:cncMainnet
```

---

## 8. 回滚方案

### 8.1 合约回滚

合约使用 UUPS 代理模式，回滚方法:

1. 切到旧版本分支 `git checkout <旧commit>`
2. `npm run compile`
3. `npm run upgrade:cncMainnet`

> 注意: 新增的存储变量不会被删除，但不影响旧逻辑。

### 8.2 前端回滚

```bash
# 如果保留了旧版本 dist
sudo cp -r /var/www/incubator/dist.bak /var/www/incubator/dist
sudo chown -R caddy:caddy /var/www/incubator/dist
sudo systemctl reload caddy
```

建议每次部署前备份:

```bash
sudo cp -r /var/www/incubator/dist /var/www/incubator/dist.bak.$(date +%Y%m%d)
```

---

## 9. 安全注意事项

| 项目                   | 要求                                                   |
| ---------------------- | ------------------------------------------------------ |
| `.env` 文件            | 不提交到 Git，包含私钥                                 |
| `DEPLOYER_PRIVATE_KEY` | 部署者私钥，仅在服务器使用                             |
| Caddy TLS              | 自动 HTTPS，由 Cloudflare 或 Let's Encrypt 管理        |
| 合约暂停               | 紧急情况可通过 Admin 面板一键暂停                      |
| 子管理员               | 通过 `setSubAdmin` 授权，可限制操作范围                |
| USDT 精度              | CNC 链 USDT = **18 位**，非标准 6 位                   |
| EVM 版本               | CNC 不支持 PUSH0，hardhat 必须设 `evmVersion: "paris"` |
| 结算审计               | 所有结算操作写入 JSON 审计日志                         |
| JSONBin Key            | `.env` 中的 `$` 符号需 `\$` 转义（dotenv-expand）      |

---

## 附: 快速参考

```bash
# === 一键全量部署 ===
bash deploy-cnc-full.sh

# === 仅合约升级 ===
bash deploy-cnc-full.sh --chain-only

# === 仅前端发布 ===
bash deploy-cnc-full.sh --web-only

# === 手动结算 ===
npm run settle:all:cncMainnet

# === 查看结算日志 ===
ls -lt artifacts/settlement-runs/ | head -5
ls -lt deploy/logs/ | head -5
```

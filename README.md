# Incubator

Incubator

## 快速开始

### 1) 安装依赖

```bash
npm install
```

### 2) 配置环境变量

- 在根目录创建 `.env`（前端变量需使用 `VITE_` 前缀）

### 3) 本地启动前端

```bash
npm run dev
```

### 4) 编译与部署合约（CNC Mainnet）

```bash
npm run compile
npm run deploy:cncMainnet
```

### 5) 合约升级（UUPS）

- 在 `.env` 中配置代理地址：
  - `INCUBATOR_CORE_PROXY`
  - `NODE_OTC_MARKET_PROXY`
  - `SWAP_POOL_MANAGER_PROXY`
  - `IDENTITY_NFT_PROXY`

```bash
npm run precheck:upgrade:cncMainnet
npm run upgrade:cncMainnet
```

> 注意：业务功能全部链上实现，公告默认走 JSONBin（可回退到 public/announcements.json）。

### 公告模块（JSONBin）

- 前端读取（可公开）：
  - `VITE_JSONBIN_ANNOUNCEMENTS_BIN_ID`
  - `VITE_JSONBIN_ANNOUNCEMENTS_ACCESS_KEY`（可选）
  - `VITE_JSONBIN_API_BASE_URL`（可选，默认 `https://api.jsonbin.io/v3`）
- 服务端写入（私钥，不能用 `VITE_` 前缀）：
  - `JSONBIN_API_KEY`
  - `JSONBIN_ANNOUNCEMENTS_BIN_ID`

发布公告到 JSONBin：

```bash
npm run announcements:push
```

如需指定文件：

```bash
node scripts/push-announcements-jsonbin.js public/announcements.json
```

## 部署到 Vercel

### 1) Build 配置

- Build Command: `npm run build:web`
- Output Directory: `dist`

### 2) 环境变量（Vercel 项目设置中添加）

- `VITE_USDT_CONTRACT_ADDRESS`
- `VITE_ICO_TOKEN_ADDRESS`
- `VITE_LIGHT_TOKEN_ADDRESS`
- `VITE_CORE_CONTRACT_ADDRESS`
- `VITE_OTC_CONTRACT_ADDRESS`
- `VITE_SWAP_POOL_ADDRESS`
- `VITE_PANCAKE_V3_ROUTER_ADDRESS`
- `VITE_PANCAKE_V3_QUOTER_ADDRESS`
- `VITE_PANCAKE_V3_PRIMARY_FEE_PPM`（示例：`2500`）
- `VITE_APPWRITE_ENDPOINT`
- `VITE_APPWRITE_PROJECT_ID`
- `VITE_APPWRITE_DATABASE_ID`
- `VITE_APPWRITE_ANNOUNCEMENTS_COLLECTION_ID`

### 3) 路由回退

- 项目已包含 `vercel.json`，用于 SPA 刷新回退到 `index.html`。

## 部署到本机 Caddy（同时支持 t1/t2/t3）

### 完整简洁部署步骤（生产）

#### 1) 服务器初始化

- 安装 Node.js 20+、npm、git、rsync、caddy
- 开放 80/443 端口
- 将业务域名 A 记录指向服务器公网 IP

#### 2) 拉取项目并安装依赖

```bash
cd /home/ubuntu
git clone git@github.com:dappweb/Incubator.git
cd /home/ubuntu/Incubator
npm install
```

#### 3) 配置生产环境变量

```bash
cp .env.example .env
```

至少确认以下变量已正确填写：

- `DEPLOYER_PRIVATE_KEY`
- `CNC_MAINNET_RPC_URL`
- `USDT_TOKEN_ADDRESS`
- `LP_POOL_ADDRESS`、`REFERRAL_POOL_ADDRESS`、`SUPER_NODE_POOL_ADDRESS`、`NODE_POOL_ADDRESS`、`PLATFORM_POOL_ADDRESS`、`LEADERBOARD_POOL_ADDRESS`
- `VITE_USDT_CONTRACT_ADDRESS`、`VITE_ICO_TOKEN_ADDRESS`、`VITE_LIGHT_TOKEN_ADDRESS`
- `VITE_CORE_CONTRACT_ADDRESS`、`VITE_OTC_CONTRACT_ADDRESS`、`VITE_SWAP_POOL_ADDRESS`
- `VITE_PANCAKE_V2_ROUTER_ADDRESS`、`VITE_PANCAKE_V2_FACTORY_ADDRESS`、`VITE_PANCAKE_V2_PRIMARY_FEE_PPM`

#### 4) 执行一键生产部署

```bash
npm run deploy:prod
```

该命令会自动执行：

- 校验关键环境变量
- 编译并部署 CNC 主网合约
- 回写最新地址到 `.env`
- 生成部署地址快照 `deploy/output/latest-addresses.env`
- 构建前端并通过 Caddy 发布

#### 5) 可选分步部署

```bash
# 仅发布前端（跳过链上）
npm run deploy:prod -- --skip-chain

# 仅部署链上（跳过前端）
npm run deploy:prod -- --skip-web
```

#### 6) 上线验收

```bash
curl -I https://t1.test2dapp.xyz
curl -I https://t2.test2dapp.xyz
curl -I https://t3.test2dapp.xyz
```

返回 `HTTP/2 200` 或 `HTTP/2 304` 即表示正常。

如遇证书或回源问题：

```bash
npm run diagnose:caddy
```

#### 7) 快速回滚建议

- 前端回滚：恢复上一版 `dist` 到 `/var/www/incubator/dist` 并重启 caddy
- 合约回滚：通过 UUPS 升级回上一实现版本（先执行 precheck）

### 一键生产部署（推荐）

```bash
cd /home/ubuntu/Incubator
cp .env.example .env  # 首次部署时执行
npm install
npm run deploy:prod
```

该命令会自动执行：

- 校验 `.env` 关键参数
- 编译并部署 CNC 主网合约
- 自动提取新地址并回写到 `.env`
- 同步生成 `deploy/output/latest-addresses.env`
- 构建前端并通过 Caddy 发布

可选参数：

```bash
# 仅发布前端（跳过链上部署）
npm run deploy:prod -- --skip-chain

# 仅部署合约（跳过前端发布）
npm run deploy:prod -- --skip-web
```

### 1) 服务器准备

- 确保 DNS `t1.test2dapp.xyz`、`t2.test2dapp.xyz`、`t3.test2dapp.xyz` 均已解析到当前服务器公网 IP
- 放行 80/443 端口
- 安装 Caddy（systemd 服务名为 `caddy`）

### 2) 一键部署

```bash
cd /home/ubuntu/Incubator
npm install
npm run deploy:caddy
```

该命令会自动执行：

- 构建前端 `dist/`
- 同步到 `/var/www/incubator/dist`
- 安装仓库内 `deploy/caddy/Caddyfile` 到 `/etc/caddy/Caddyfile`
- 以多域名站点块发布（默认：t1/t2/t3）
- 校验并重启 Caddy
- 若检测到 Nginx 正在占用 80/443，会自动停止并禁用 Nginx

### 3) 验证

```bash
curl -I https://t1.test2dapp.xyz
curl -I https://t2.test2dapp.xyz
curl -I https://t3.test2dapp.xyz
```

返回 `HTTP/2 200` 或 `HTTP/2 304` 即表示访问正常。

### 4) 若出现 Cloudflare 525（SSL handshake failed）

可在服务器执行一键诊断：

```bash
cd /home/ubuntu/Incubator
npm run diagnose:caddy
```

如需附带“绕过 Cloudflare 的源站直连检测”：

```bash
bash scripts/diagnose-caddy-525.sh t2.test2dapp.xyz <服务器公网IP>
```

### 5) 保持 t1/t2/t3 持续可访问（巡检 + 自恢复）

手动健康检查：

```bash
npm run check:caddy
```

安装每 5 分钟自动巡检（失败会重启 Caddy 再复检）：

```bash
npm run cron:install:caddy-watchdog
```

可通过环境变量自定义域名列表：

```bash
SITE_DOMAINS="t1.test2dapp.xyz,t2.test2dapp.xyz,t3.test2dapp.xyz" npm run check:caddy
```

## 代码结构

- `contracts/`: Hardhat 合约工程（Core + OTC + Swap + IncubatorToken）
- `src/`: React + Vite DApp 前端源码
- `docs/`: 业务与实施文档

## ICO 代币销毁

- 默认本地部署的 ICO 合约为 `IncubatorToken`，不是通用 `MockToken`
- `IncubatorToken` 支持持币人自助 `burn()`，也支持项目方对 `saleAllocationWallet` 的未售出库存执行 `burnUnsold()`
- 链上会累计记录 `totalBurned`，便于审计和前端展示

## 定时分红与燃烧（自动执行）

### 1) 配置 `.env`

至少补齐以下变量（可参考 `.env.example`）：

- `INCUBATOR_CORE_PROXY`
- `SWAP_POOL_MANAGER_PROXY`
- `LIGHT_TOKEN_ADDRESS`
- `NODE_REWARD_RECIPIENTS`
- `NODE_REWARD_SHARES`
- `SUPER_NODE_REWARD_RECIPIENTS`
- `SUPER_NODE_REWARD_SHARES`

可选变量：

- `SWAP_LIGHT_PAIR_ID`（默认 `1`）
- `LIGHT_SETTLE_MIN_AMOUNT`（小于该值跳过结算）
- `ENABLE_NODE_SETTLEMENT` / `ENABLE_SUPER_NODE_SETTLEMENT` / `ENABLE_LEADERBOARD_SETTLEMENT`
- `LEADERBOARD_DAY_ID`（留空默认结算昨天）

### 2) 手动执行一次（推荐先试跑）

```bash
# 仅 LIGHT 手续费分红/燃烧
npm run settle:light:cncMainnet

# 仅 Core 节点/超节点/榜单池结算
npm run settle:core:cncMainnet

# 一次执行全部结算
npm run settle:all:cncMainnet
```

### 3) 安装定时任务

```bash
npm run cron:install:settle
```

默认安装两条 cron：

- 每小时执行 LIGHT 结算
- 每天 00:10 执行 Core 池结算

### 4) 日志位置

- 结算日志输出到 `deploy/logs/settlement-*.log`

## Primary USDT/ICO 控制器运维（CNC Mainnet）

当已配置 `VITE_PRIMARY_SWAP_CONTROLLER_ADDRESS`（或 `PRIMARY_SWAP_CONTROLLER_PROXY`）时，可通过以下命令对主交易对卖出门控进行运维。

### 1) 先检查状态

```bash
npm run primary:status:cncMainnet
```

可选：如果你希望临时指定控制器地址，可在命令后追加参数。

```bash
npm run primary:status:cncMainnet -- 0xYourControllerAddress
```

### 2) 上报 ICO 持币地址数

方式 A：环境变量

```bash
ICO_HOLDER_COUNT=12345 npm run primary:report-holders:cncMainnet
```

方式 B：命令参数（地址 + holderCount）

```bash
npm run primary:report-holders:cncMainnet -- 0xYourControllerAddress 12345
```

### 3) 开启 ICO->USDT 卖出

```bash
npm run primary:enable-sell:cncMainnet
```

可选：指定控制器地址

```bash
npm run primary:enable-sell:cncMainnet -- 0xYourControllerAddress
```

若阈值（USDT 储备 + 持币人数）未满足，脚本会直接报错并阻止开启。

## Docs

- [DApp UI 设计方案](docs/DAPP_UI_SPEC.md)
- [Appwrite 实施蓝图](docs/APPWRITE_CNC_MAINNET_IMPLEMENTATION.md)
- [生产就绪任务清单](docs/PRODUCTION_ROADMAP.md)
- [当前实现状态（真相文档）](docs/CURRENT_IMPLEMENTATION_STATUS.md)

# Incubator

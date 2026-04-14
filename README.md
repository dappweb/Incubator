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

> 注意：业务功能全部链上实现，Appwrite 仅用于公告模块。

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

## 部署到本机 Caddy（域名保持 t2.test2dapp.xyz）

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

- 确保 DNS `t2.test2dapp.xyz` 已解析到当前服务器公网 IP
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
- 校验并重启 Caddy
- 若检测到 Nginx 正在占用 80/443，会自动停止并禁用 Nginx

### 3) 验证

```bash
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

## 代码结构

- `contracts/`: Hardhat 合约工程（Core + OTC + Swap + IncubatorToken）
- `src/`: React + Vite DApp 前端源码
- `docs/`: 业务与实施文档

## ICO 代币销毁

- 默认本地部署的 ICO 合约为 `IncubatorToken`，不是通用 `MockToken`
- `IncubatorToken` 支持持币人自助 `burn()`，也支持项目方对 `saleAllocationWallet` 的未售出库存执行 `burnUnsold()`
- 链上会累计记录 `totalBurned`，便于审计和前端展示

## Docs

- [DApp UI 设计方案](docs/DAPP_UI_SPEC.md)
- [Appwrite 实施蓝图](docs/APPWRITE_CNC_MAINNET_IMPLEMENTATION.md)
- [生产就绪任务清单](docs/PRODUCTION_ROADMAP.md)
- [当前实现状态（真相文档）](docs/CURRENT_IMPLEMENTATION_STATUS.md)

# Incubator

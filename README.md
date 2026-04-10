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

### 4) 编译与部署合约（Sepolia）

```bash
npm run compile
npm run deploy:sepolia
```

### 5) 合约升级（UUPS）

- 在 `.env` 中配置代理地址：
	- `INCUBATOR_CORE_PROXY`
	- `NODE_OTC_MARKET_PROXY`
	- `SWAP_POOL_MANAGER_PROXY`
	- `IDENTITY_NFT_PROXY`

```bash
npm run precheck:upgrade:sepolia
npm run upgrade:sepolia
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
- `VITE_APPWRITE_ENDPOINT`
- `VITE_APPWRITE_PROJECT_ID`
- `VITE_APPWRITE_DATABASE_ID`
- `VITE_APPWRITE_ANNOUNCEMENTS_COLLECTION_ID`

### 3) 路由回退

- 项目已包含 `vercel.json`，用于 SPA 刷新回退到 `index.html`。

## 部署到本机 Caddy（域名保持 t3.test2dapp.xyz）

### 1) 服务器准备

- 确保 DNS `t3.test2dapp.xyz` 已解析到当前服务器公网 IP
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
bash scripts/diagnose-caddy-525.sh t3.test2dapp.xyz <服务器公网IP>
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
- [Appwrite + Sepolia 实施蓝图](docs/APPWRITE_SEPOLIA_IMPLEMENTATION.md)
- [生产就绪任务清单](docs/PRODUCTION_ROADMAP.md)
- [当前实现状态（真相文档）](docs/CURRENT_IMPLEMENTATION_STATUS.md)

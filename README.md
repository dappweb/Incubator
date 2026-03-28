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

## 代码结构

- `contracts/`: Hardhat 合约工程（Core + OTC）
- `src/`: React + Vite DApp 前端源码
- `docs/`: 业务与实施文档

## Docs

- [DApp UI 设计方案](docs/DAPP_UI_SPEC.md)
- [Appwrite + Sepolia 实施蓝图](docs/APPWRITE_SEPOLIA_IMPLEMENTATION.md)
- [生产就绪任务清单](docs/PRODUCTION_ROADMAP.md)

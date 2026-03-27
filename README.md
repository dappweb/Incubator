# Incubator
Incubator

## 快速开始

### 1) 安装依赖

```bash
npm install
npm install -w contracts
npm install -w frontend
```

### 2) 配置环境变量

- 复制根目录 `.env.example` 为 `.env`
- 复制 `frontend/.env.example` 为 `frontend/.env`

### 3) 本地启动前端

```bash
npm run dev
```

### 4) 编译与部署合约（Sepolia）

```bash
npm run compile -w contracts
npm run deploy:sepolia -w contracts
```

> 注意：业务功能全部链上实现，Appwrite 仅用于公告模块。

## 代码结构

- `contracts/`: Hardhat 合约工程（Core + OTC）
- `frontend/`: React + Vite DApp 前端
- `docs/`: 业务与实施文档

## Docs

- [DApp UI 设计方案](docs/DAPP_UI_SPEC.md)
- [Appwrite + Sepolia 实施蓝图](docs/APPWRITE_SEPOLIA_IMPLEMENTATION.md)
- [生产就绪任务清单](docs/PRODUCTION_ROADMAP.md)

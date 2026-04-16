# Project Guidelines

## Code Style
- Follow existing TypeScript + React style in `src/` and keep strict typing in helper modules under `src/lib/`.
- For smart contracts, follow Solidity patterns already used in `contracts/` (UUPS upgradeable + pausable guards + event-driven state changes).
- Keep UI/business orchestration in `src/App.tsx`; keep chain interaction logic in `src/lib/*.ts`.
- Reuse existing error normalization via `src/lib/errorParser.ts` instead of adding ad-hoc error string parsing.

## Architecture
- Frontend: React + Vite app with wallet flow and tabbed feature areas (`Overview`, `Team`, `OTC`, `Swap`, `Mine`, `Admin`).
- On-chain core is split across:
  - `contracts/IncubatorCore.sol` (referrer binding, machine purchase, role progression, pool allocations)
  - `contracts/NodeOTCMarket.sol` (identity OTC listing/trading)
  - `contracts/SwapPoolManager.sol` (USDT/ICO + LIGHT/ICO swap pools)
- Deployment and upgrade automation lives in `scripts/*.ts` and targets Sepolia.
- Appwrite integration is for announcements only; business-critical flows are on-chain.

## Build And Test
- Install: `npm install`
- Frontend dev server: `npm run dev`
- Compile contracts: `npm run compile`
- Full build: `npm run build`
- Deploy to Sepolia: `npm run deploy:sepolia`
- Upgrade flow (Sepolia): `npm run precheck:upgrade:sepolia` then `npm run upgrade:sepolia`
- Contract validation script: `npm run test:contracts`

## Conventions
- Treat Sepolia as the default/required network (chainId `11155111`); preserve network checks and switch prompts.
- Frontend env vars must use `VITE_*`; Hardhat scripts use `.env` variables (`SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, proxy addresses).
- Referrer binding is one-time and immutable once set; do not introduce UX that implies it can be edited later.
- Machine purchase flow assumes quantity constraints from contract rules; keep client validation aligned with contract limits.
- For upgrade tasks, read proxy addresses from environment and avoid hardcoding addresses in scripts/components.

## Documentation Map
- Business logic and user journey: `docs/USER_REGISTRATION_AND_MACHINE_PURCHASE_FLOW.md`
- Visual process diagrams: `docs/BUSINESS_FLOW_VISUALIZATION.md`
- Technical API and integration reference: `docs/TECHNICAL_IMPLEMENTATION_REFERENCE.md`
- Current truth/source-of-implementation status: `docs/CURRENT_IMPLEMENTATION_STATUS.md`
- UI behavior/spec notes: `docs/DAPP_UI_SPEC.md`
- Testnet validation checklist: `docs/TESTNET_EXECUTION_CHECKLIST.md`
- Production readiness roadmap: `docs/PRODUCTION_ROADMAP.md`
- Doc index: `docs/BUSINESS_DOCUMENTATION_INDEX.md`
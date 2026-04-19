#!/usr/bin/env bash
# ============================================================
# Incubator — CNC Mainnet 一键全量部署脚本
#
# 功能: 合约编译/升级 + 前端构建 + Caddy 发布 + 结算 Cron 安装
#
# Usage:
#   bash deploy-cnc-full.sh               # 全量部署
#   bash deploy-cnc-full.sh --web-only     # 仅前端
#   bash deploy-cnc-full.sh --chain-only   # 仅合约升级
#   bash deploy-cnc-full.sh --cron-only    # 仅安装 Cron
#   bash deploy-cnc-full.sh --dry-run      # 仅打印计划，不执行
# ============================================================

set -euo pipefail

# ── 颜色输出 ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"
LOG_DIR="$PROJECT_ROOT/deploy/logs"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"

# ── 默认参数 ──
DO_CHAIN="true"
DO_WEB="true"
DO_CRON="true"
DRY_RUN="false"
CADDY_SITE_ROOT="${CADDY_SITE_ROOT:-/var/www/incubator-t3/dist}"

# ── 解析参数 ──
for arg in "$@"; do
  case "$arg" in
    --web-only)   DO_CHAIN="false"; DO_CRON="false" ;;
    --chain-only) DO_WEB="false";   DO_CRON="false" ;;
    --cron-only)  DO_CHAIN="false"; DO_WEB="false"  ;;
    --dry-run)    DRY_RUN="true" ;;
    -h|--help)
      sed -n '3,12p' "$0"
      exit 0
      ;;
    *) fail "未知参数: $arg" ;;
  esac
done

cd "$PROJECT_ROOT"

# ── 环境检查 ──
check_env() {
  info "检查环境..."
  [[ -f "$ENV_FILE" ]] || fail ".env 文件不存在，请先执行: cp .env.example .env 并填写配置"

  # 安全加载 .env（跳过含 $ 的行以避免变量展开问题）
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    key="${key%%[[:space:]]*}"
    value="${value#[[:space:]]}"
    [[ "$value" == *'$'* ]] && continue
    export "$key=$value" 2>/dev/null || true
  done < "$ENV_FILE"

  # Node.js
  command -v node >/dev/null || fail "未安装 Node.js"
  command -v npm  >/dev/null || fail "未安装 npm"
  local node_ver; node_ver="$(node -v)"
  info "Node: $node_ver  npm: $(npm -v)"

  # 必需变量
  [[ -n "${CNC_MAINNET_RPC_URL:-}" ]]  || fail "缺少 CNC_MAINNET_RPC_URL"
  [[ -n "${DEPLOYER_PRIVATE_KEY:-}" ]]  || fail "缺少 DEPLOYER_PRIVATE_KEY"

  # 合约升级需要的代理地址
  if [[ "$DO_CHAIN" == "true" ]]; then
    [[ -n "${INCUBATOR_CORE_PROXY:-}" ]]      || fail "缺少 INCUBATOR_CORE_PROXY"
    [[ -n "${SWAP_POOL_MANAGER_PROXY:-}" ]]    || warn "缺少 SWAP_POOL_MANAGER_PROXY，SwapPoolManager 不会升级"
    [[ -n "${NODE_OTC_MARKET_PROXY:-}" ]]      || warn "缺少 NODE_OTC_MARKET_PROXY，NodeOTCMarket 不会升级"
  fi

  # 前端需要的变量
  if [[ "$DO_WEB" == "true" ]]; then
    [[ -n "${VITE_CORE_CONTRACT_ADDRESS:-}" ]] || fail "缺少 VITE_CORE_CONTRACT_ADDRESS"
    [[ -n "${VITE_SWAP_POOL_ADDRESS:-}" ]]     || fail "缺少 VITE_SWAP_POOL_ADDRESS"
    [[ -n "${VITE_USDT_CONTRACT_ADDRESS:-}" ]] || fail "缺少 VITE_USDT_CONTRACT_ADDRESS"
    command -v caddy >/dev/null                 || warn "未安装 Caddy，将仅构建不发布"
  fi

  ok "环境检查通过"
}

# ── 打印部署计划 ──
print_plan() {
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║        Incubator CNC Mainnet 部署计划         ║"
  echo "╠══════════════════════════════════════════════╣"
  echo "║ 时间: $TIMESTAMP"
  echo "║ 链:   CNC Mainnet (chainId 50716)"
  echo "║ RPC:  ${CNC_MAINNET_RPC_URL:-未设置}"
  echo "║"
  [[ "$DO_CHAIN" == "true" ]] && echo "║ ✓ 合约: 编译 → 预检查 → 升级" || echo "║ ✗ 合约: 跳过"
  [[ "$DO_WEB" == "true" ]]   && echo "║ ✓ 前端: 构建 → 发布到 $CADDY_SITE_ROOT" || echo "║ ✗ 前端: 跳过"
  [[ "$DO_CRON" == "true" ]]  && echo "║ ✓ 定时: 安装结算 Cron 任务" || echo "║ ✗ 定时: 跳过"
  echo "║"
  echo "║ Core:  ${INCUBATOR_CORE_PROXY:-未设置}"
  echo "║ OTC:   ${NODE_OTC_MARKET_PROXY:-未设置}"
  echo "║ Swap:  ${SWAP_POOL_MANAGER_PROXY:-未设置}"
  echo "╚══════════════════════════════════════════════╝"
  echo ""
}

# ── Step 1: 合约编译 + 升级 ──
deploy_chain() {
  if [[ "$DO_CHAIN" != "true" ]]; then return; fi

  info "Step 1/3 — 合约编译..."
  npm run compile
  ok "合约编译完成"

  info "Step 1/3 — 预检查升级兼容性..."
  npm run precheck:upgrade:cncMainnet
  ok "预检查通过"

  info "Step 1/3 — 执行合约升级..."
  mkdir -p "$LOG_DIR"
  local log_file="$LOG_DIR/upgrade-$TIMESTAMP.log"
  npm run upgrade:cncMainnet 2>&1 | tee "$log_file"
  ok "合约升级完成 (日志: $log_file)"
}

# ── Step 2: 前端构建 + 发布 ──
deploy_web() {
  if [[ "$DO_WEB" != "true" ]]; then return; fi

  info "Step 2/3 — 前端构建..."

  # 修复可能的权限问题
  if [[ -d "$PROJECT_ROOT/dist" ]]; then
    sudo chown -R "$(whoami):$(whoami)" "$PROJECT_ROOT/dist" 2>/dev/null || true
  fi

  npm run build:web
  ok "前端构建完成"

  # 发布到 Caddy
  if [[ -d "$CADDY_SITE_ROOT" ]] || command -v caddy >/dev/null 2>&1; then
    info "Step 2/3 — 发布到 $CADDY_SITE_ROOT..."
    sudo rm -rf "$CADDY_SITE_ROOT"
    sudo cp -r "$PROJECT_ROOT/dist" "$CADDY_SITE_ROOT"
    sudo chown -R caddy:caddy "$CADDY_SITE_ROOT"
    sudo systemctl reload caddy
    ok "前端已发布，Caddy 已重载"

    # 验证
    if command -v curl >/dev/null 2>&1; then
      local status
      status="$(curl -sI -o /dev/null -w '%{http_code}' https://t3.test2dapp.xyz/ 2>/dev/null || echo "000")"
      if [[ "$status" == "200" ]]; then
        ok "站点验证通过 (HTTP $status)"
      else
        warn "站点返回 HTTP $status，请检查"
      fi
    fi
  else
    warn "Caddy 目标目录不存在且 Caddy 未安装，仅完成构建"
  fi
}

# ── Step 3: 安装结算 Cron ──
deploy_cron() {
  if [[ "$DO_CRON" != "true" ]]; then return; fi

  info "Step 3/3 — 安装结算 Cron 任务..."
  bash "$PROJECT_ROOT/scripts/install-cron.sh"
  ok "Cron 任务已安装"

  # 显示当前 cron
  echo ""
  info "当前结算 Cron 计划:"
  crontab -l 2>/dev/null | grep "incubator" || echo "  (无)"
  echo ""
}

# ── 主流程 ──
main() {
  check_env
  print_plan

  if [[ "$DRY_RUN" == "true" ]]; then
    warn "DRY-RUN 模式，不执行实际操作"
    exit 0
  fi

  deploy_chain
  deploy_web
  deploy_cron

  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║          ✅ 部署全部完成!                     ║"
  echo "╠══════════════════════════════════════════════╣"
  [[ "$DO_CHAIN" == "true" ]] && echo "║ 合约: 升级成功"
  [[ "$DO_WEB" == "true" ]]   && echo "║ 前端: https://t3.test2dapp.xyz"
  [[ "$DO_CRON" == "true" ]]  && echo "║ 定时: Cron 任务已安装"
  echo "║ 日志: deploy/logs/"
  echo "╚══════════════════════════════════════════════╝"
}

main

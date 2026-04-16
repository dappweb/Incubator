import { ethers } from "hardhat";

type PrimarySwapStatus = {
  sellUsdtEnabled: boolean;
  canEnableSellUsdt: boolean;
  reportedIcoHolderCount: bigint;
  minIcoHolderCountToEnableSell: bigint;
  usdtReserve: bigint;
  minUsdtReserveToEnableSell: bigint;
  buyFeeBps: bigint;
  sellFeeBps: bigint;
  superNodeFeeBps: bigint;
  nodePoolFeeBps: bigint;
  platformFeeBps: bigint;
  sellBurnBps: bigint;
  sellPlatformIcoBps: bigint;
  sellLiquidityIcoBps: bigint;
  superNodeFeeRecipient: string;
  nodePoolFeeRecipient: string;
  platformRecipient: string;
};

const abi = [
  "function sellUsdtEnabled() view returns (bool)",
  "function canEnableSellUsdt() view returns (bool)",
  "function reportedIcoHolderCount() view returns (uint256)",
  "function minIcoHolderCountToEnableSell() view returns (uint256)",
  "function getPairUsdtReserve() view returns (uint256)",
  "function minUsdtReserveToEnableSell() view returns (uint256)",
  "function buyFeeBps() view returns (uint16)",
  "function sellFeeBps() view returns (uint16)",
  "function superNodeFeeBps() view returns (uint16)",
  "function nodePoolFeeBps() view returns (uint16)",
  "function platformFeeBps() view returns (uint16)",
  "function sellBurnBps() view returns (uint16)",
  "function sellPlatformIcoBps() view returns (uint16)",
  "function sellLiquidityIcoBps() view returns (uint16)",
  "function superNodeFeeRecipient() view returns (address)",
  "function nodePoolFeeRecipient() view returns (address)",
  "function platformRecipient() view returns (address)",
  "function usdt() view returns (address)",
];

const erc20Abi = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

function resolveControllerAddress(): string {
  const fromProxy = process.env.PRIMARY_SWAP_CONTROLLER_PROXY?.trim();
  const fromVite = process.env.VITE_PRIMARY_SWAP_CONTROLLER_ADDRESS?.trim();
  const fromArg = process.argv[2]?.trim();
  const value = fromArg || fromProxy || fromVite;

  if (!value) {
    throw new Error("缺少 PRIMARY_SWAP_CONTROLLER_PROXY 或 VITE_PRIMARY_SWAP_CONTROLLER_ADDRESS，或命令行参数地址");
  }

  return value;
}

async function main() {
  const controllerAddress = resolveControllerAddress();
  const provider = ethers.provider;

  const controller = new ethers.Contract(controllerAddress, abi, provider);
  const status = await Promise.all([
    controller.sellUsdtEnabled(),
    controller.canEnableSellUsdt(),
    controller.reportedIcoHolderCount(),
    controller.minIcoHolderCountToEnableSell(),
    controller.getPairUsdtReserve(),
    controller.minUsdtReserveToEnableSell(),
    controller.buyFeeBps(),
    controller.sellFeeBps(),
    controller.superNodeFeeBps(),
    controller.nodePoolFeeBps(),
    controller.platformFeeBps(),
    controller.sellBurnBps(),
    controller.sellPlatformIcoBps(),
    controller.sellLiquidityIcoBps(),
    controller.superNodeFeeRecipient(),
    controller.nodePoolFeeRecipient(),
    controller.platformRecipient(),
    controller.usdt(),
  ]);

  const data: PrimarySwapStatus = {
    sellUsdtEnabled: Boolean(status[0]),
    canEnableSellUsdt: Boolean(status[1]),
    reportedIcoHolderCount: status[2],
    minIcoHolderCountToEnableSell: status[3],
    usdtReserve: status[4],
    minUsdtReserveToEnableSell: status[5],
    buyFeeBps: status[6],
    sellFeeBps: status[7],
    superNodeFeeBps: status[8],
    nodePoolFeeBps: status[9],
    platformFeeBps: status[10],
    sellBurnBps: status[11],
    sellPlatformIcoBps: status[12],
    sellLiquidityIcoBps: status[13],
    superNodeFeeRecipient: status[14],
    nodePoolFeeRecipient: status[15],
    platformRecipient: status[16],
  };

  const usdt = new ethers.Contract(status[17], erc20Abi, provider);
  const [usdtDecimals, usdtSymbol] = await Promise.all([usdt.decimals(), usdt.symbol()]);

  console.log("=== Primary Swap Controller Status ===");
  console.log("controller:", controllerAddress);
  console.log("sellUsdtEnabled:", data.sellUsdtEnabled);
  console.log("canEnableSellUsdt:", data.canEnableSellUsdt);
  console.log("reportedIcoHolderCount:", data.reportedIcoHolderCount.toString());
  console.log("minIcoHolderCountToEnableSell:", data.minIcoHolderCountToEnableSell.toString());
  console.log(
    "usdtReserve:",
    ethers.formatUnits(data.usdtReserve, usdtDecimals),
    usdtSymbol,
    "(raw:",
    data.usdtReserve.toString() + ")"
  );
  console.log(
    "minUsdtReserveToEnableSell:",
    ethers.formatUnits(data.minUsdtReserveToEnableSell, usdtDecimals),
    usdtSymbol,
    "(raw:",
    data.minUsdtReserveToEnableSell.toString() + ")"
  );

  console.log("buyFeeBps:", data.buyFeeBps.toString());
  console.log("  split(superNode/nodePool/platform):", data.superNodeFeeBps.toString(), data.nodePoolFeeBps.toString(), data.platformFeeBps.toString());
  console.log("sellFeeBps:", data.sellFeeBps.toString());
  console.log("  sell split(burn/platform/liquidity):", data.sellBurnBps.toString(), data.sellPlatformIcoBps.toString(), data.sellLiquidityIcoBps.toString());

  console.log("superNodeFeeRecipient:", data.superNodeFeeRecipient);
  console.log("nodePoolFeeRecipient:", data.nodePoolFeeRecipient);
  console.log("platformRecipient:", data.platformRecipient);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import { ethers } from "hardhat";

const abi = [
  "function sellUsdtEnabled() view returns (bool)",
  "function canEnableSellUsdt() view returns (bool)",
  "function enableSellUsdt() external",
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
  const [signer] = await ethers.getSigners();
  const controller = new ethers.Contract(controllerAddress, abi, signer);

  const [enabled, canEnable] = await Promise.all([
    controller.sellUsdtEnabled(),
    controller.canEnableSellUsdt(),
  ]);

  console.log("controller:", controllerAddress);
  console.log("sender:", await signer.getAddress());
  console.log("sellUsdtEnabled(before):", Boolean(enabled));
  console.log("canEnableSellUsdt:", Boolean(canEnable));

  if (enabled) {
    console.log("sellUsdt 已开启，无需重复执行。");
    return;
  }

  if (!canEnable) {
    throw new Error("阈值未满足，不能开启 sellUsdt。请先上报持币地址数并确认 USDT 储备达标。");
  }

  const tx = await controller.enableSellUsdt();
  await tx.wait();

  const enabledAfter = await controller.sellUsdtEnabled();
  console.log("sellUsdtEnabled(after):", Boolean(enabledAfter));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

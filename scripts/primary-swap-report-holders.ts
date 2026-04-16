import { ethers } from "hardhat";

const abi = [
  "function reportIcoHolderCount(uint256 holderCount) external",
  "function reportedIcoHolderCount() view returns (uint256)",
  "function canEnableSellUsdt() view returns (bool)",
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

function resolveHolderCount(): bigint {
  const arg = process.argv[3]?.trim();
  const env = process.env.ICO_HOLDER_COUNT?.trim();
  const raw = arg || env;
  if (!raw) {
    throw new Error("缺少 ICO_HOLDER_COUNT（环境变量）或命令行参数 holderCount");
  }

  const value = BigInt(raw);
  if (value < 0n) {
    throw new Error("ICO_HOLDER_COUNT 不能为负数");
  }

  return value;
}

async function main() {
  const controllerAddress = resolveControllerAddress();
  const holderCount = resolveHolderCount();

  const [signer] = await ethers.getSigners();
  const controller = new ethers.Contract(controllerAddress, abi, signer);

  console.log("report holder count tx sender:", await signer.getAddress());
  console.log("controller:", controllerAddress);
  console.log("holderCount:", holderCount.toString());

  const tx = await controller.reportIcoHolderCount(holderCount);
  await tx.wait();

  const [onChainCount, canEnable] = await Promise.all([
    controller.reportedIcoHolderCount(),
    controller.canEnableSellUsdt(),
  ]);

  console.log("reportedIcoHolderCount(on-chain):", onChainCount.toString());
  console.log("canEnableSellUsdt:", Boolean(canEnable));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

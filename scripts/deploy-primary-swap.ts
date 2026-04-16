import * as dotenv from "dotenv";
import { ethers, upgrades } from "hardhat";

dotenv.config({ path: ".env" });

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing required env: ${key}`);
  return value;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying PrimarySwapController with:", deployer.address);

  const usdtAddress = requireEnv("USDT_TOKEN_ADDRESS");
  const icoAddress = requireEnv("ICO_TOKEN_ADDRESS");
  const routerAddress = requireEnv("PANCAKE_V2_ROUTER_ADDRESS");
  const factoryAddress = requireEnv("PANCAKE_V2_FACTORY_ADDRESS");

  // recipients: [superNode, nodePool, platform] – use deployer as default
  const superNodeRecipient = process.env.SUPER_NODE_POOL_ADDRESS?.trim() || deployer.address;
  const nodePoolRecipient = process.env.NODE_POOL_ADDRESS?.trim() || deployer.address;
  const platformRecipient = process.env.PLATFORM_POOL_ADDRESS?.trim() || deployer.address;

  console.log("USDT:", usdtAddress);
  console.log("ICO:", icoAddress);
  console.log("Router:", routerAddress);
  console.log("Factory:", factoryAddress);
  console.log("Recipients:", [superNodeRecipient, nodePoolRecipient, platformRecipient]);

  const PrimaryFactory = await ethers.getContractFactory("PrimarySwapController");
  const controller = await upgrades.deployProxy(
    PrimaryFactory,
    [
      usdtAddress,
      icoAddress,
      routerAddress,
      factoryAddress,
      deployer.address,
      [superNodeRecipient, nodePoolRecipient, platformRecipient],
    ],
    {
      kind: "uups",
      initializer: "initialize",
      unsafeAllow: ["constructor"],
    },
  );
  await controller.waitForDeployment();

  const proxyAddress = await controller.getAddress();
  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);

  console.log("\n✅ PrimarySwapController deployed!");
  console.log("  Proxy:", proxyAddress);
  console.log("  Implementation:", implAddress);
  console.log("\nAdd to .env:");
  console.log(`PRIMARY_SWAP_CONTROLLER_PROXY=${proxyAddress}`);
  console.log(`VITE_PRIMARY_SWAP_CONTROLLER_ADDRESS=${proxyAddress}`);
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exitCode = 1;
});

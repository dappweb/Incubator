import { ethers } from "hardhat";

async function main() {
  const proxy = process.env.SWAP_POOL_MANAGER_PROXY?.trim();
  if (!proxy) throw new Error("SWAP_POOL_MANAGER_PROXY not set");

  const lightPriceE18 = (process.env.LIGHT_PRICE_USDT_E18?.trim() || "50000000000000000"); // 0.05 U
  const icoPriceE18 = (process.env.ICO_PRICE_USDT_E18?.trim() || "1000000000000000000");   // 1.0 U

  const [signer] = await ethers.getSigners();
  console.log(`Signer: ${signer.address}`);
  console.log(`SwapPoolManager: ${proxy}`);
  console.log(`lightPriceUsdtE18: ${lightPriceE18} (= ${Number(lightPriceE18) / 1e18} USDT/LIGHT)`);
  console.log(`icoPriceUsdtE18:   ${icoPriceE18} (= ${Number(icoPriceE18) / 1e18} USDT/ICO)`);

  const swap = await ethers.getContractAt("SwapPoolManager", proxy);
  const curLight: bigint = await swap.lightPriceUsdtE18();
  const curIco: bigint = await swap.icoPriceUsdtE18();
  console.log(`Current on-chain: light=${curLight.toString()} ico=${curIco.toString()}`);

  if (curLight.toString() === lightPriceE18 && curIco.toString() === icoPriceE18) {
    console.log("✓ already configured, no-op.");
    return;
  }

  const tx = await swap.setLightUsdPrice(lightPriceE18, icoPriceE18);
  console.log(`tx: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`✓ setLightUsdPrice confirmed in block ${receipt?.blockNumber}`);

  const afterLight: bigint = await swap.lightPriceUsdtE18();
  const afterIco: bigint = await swap.icoPriceUsdtE18();
  console.log(`After: light=${afterLight.toString()} ico=${afterIco.toString()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

import { ethers } from "hardhat";
async function main() {
  const proxy = process.env.SWAP_POOL_MANAGER_PROXY!.trim();
  const swap = await ethers.getContractAt("SwapPoolManager", proxy);
  console.log("SwapPoolManager:", proxy);
  console.log("lightPriceE18   :", (await swap.lightPriceUsdtE18()).toString());
  console.log("icoPriceE18     :", (await swap.icoPriceUsdtE18()).toString());
  console.log("splits (b/p/s/n):", [
    (await swap.lightBurnSplitBps()).toString(),
    (await swap.lightPoolSplitBps()).toString(),
    (await swap.lightSuperSplitBps()).toString(),
    (await swap.lightNodeSplitBps()).toString(),
  ].join("/"));
  console.log("treasury        :", await swap.lightRewardTreasury());
  console.log("realtime dist   :", await swap.lightRealtimeDistribute());
  console.log("usdt/ico pool   :", await swap.usdtIcoPoolEnabled());
  const quote = await swap.quoteLightForIcoUsdBased(ethers.parseUnits("100", 18));
  console.log("quote 100 LIGHT :", ethers.formatUnits(quote, 18), "ICO");
}
main().catch((e)=>{console.error(e);process.exit(1);});

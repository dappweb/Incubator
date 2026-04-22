import { ethers } from "ethers";

async function main() {
  const coreAddress = "0xECD96148D33A8ca8F86cd701d445FB3bbe7592E2";
  const swapAddress = "0x22a5d5FfAbCf3E66e6c0aBF8BE7B872F5aFCeFB8";
  const lightAddress = "0xe426aA3fe3F7eDA4D89b79c8011a1259eB2cCf92";

  const swapAbi = [
    "function feeVault(uint8 pairId, address token) view returns (uint256)",
    "function getPool(uint8 pairId) view returns (address token0, address token1, uint256 reserve0, uint256 reserve1, uint16 feeBps, uint16 maxPriceImpactBps, bool exists)",
  ];

  const leaderboardAbi = [
    "function getLeaderboard(uint256 dayId) view returns (address[10] topUsers, uint256[10] topVolumes, uint8 topCount, address[10] lastUsers, uint8 lastCount)",
  ];

  const provider = new ethers.JsonRpcProvider("https://rpc.cncchainpro.com");

  console.log("\n【5️⃣ Swap 池信息】");
  try {
    const swap = new ethers.Contract(swapAddress, swapAbi, provider);
    
    // LIGHT/ICO 池
    const pool1: any = await swap.getPool(1);
    console.log(`LIGHT/ICO 池:`);
    console.log(`  Token0: ${pool1.token0}`);
    console.log(`  Token1: ${pool1.token1}`);
    console.log(`  Reserve0 (LIGHT): ${ethers.formatUnits(pool1.reserve0, 18)}`);
    console.log(`  Reserve1 (ICO): ${ethers.formatUnits(pool1.reserve1, 18)}`);
    console.log(`  费率: ${Number(pool1.feeBps) / 100}%`);
    console.log(`  价格冲击限制: ${Number(pool1.maxPriceImpactBps) / 100}%`);
    
    // LIGHT 手续费
    const lightFeeVault: bigint = await swap.feeVault(1, lightAddress);
    console.log(`\nLIGHT 手续费池: ${ethers.formatUnits(lightFeeVault, 18)} LIGHT\n`);
  } catch (e) {
    console.log(`❌ Swap 信息查询失败: ${e}\n`);
  }

  console.log("【6️⃣ 排行榜数据 (当前周期)】");
  try {
    const core = new ethers.Contract(coreAddress, leaderboardAbi, provider);
    const currentDay = BigInt(20565);
    
    const leaderboard: any = await core.getLeaderboard(currentDay);
    
    console.log(`日期 ID: ${currentDay}`);
    console.log(`\n前十用户:`);
    for (let i = 0; i < Number(leaderboard.topCount); i++) {
      console.log(`  ${i + 1}. ${leaderboard.topUsers[i]} - 业绩: ${ethers.formatUnits(leaderboard.topVolumes[i], 18)} USDT`);
    }
    
    console.log(`\n后十用户 (FOMO):`);
    for (let i = 0; i < Number(leaderboard.lastCount); i++) {
      console.log(`  ${i + 1}. ${leaderboard.lastUsers[i]}`);
    }
  } catch (e) {
    console.log(`❌ 排行榜查询失败: ${e}\n`);
  }
}

main().catch(console.error);

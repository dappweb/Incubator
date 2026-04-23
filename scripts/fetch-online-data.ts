import { ethers } from "ethers";

async function main() {
  const coreAddress = "0xECD96148D33A8ca8F86cd701d445FB3bbe7592E2";
  const usdtAddress = "0x7EA6474c89DE99d186F6559C06A15681197ca48F";
  const icoAddress = "0x306d55A808E8AF520BAC5bC755af38033AeDBd40";
  const lightAddress = "0xe426aA3fe3F7eDA4D89b79c8011a1259eB2cCf92";

  const coreAbi = [
    "function machineUnitPrice() view returns (uint256)",
    "function nodePrice() view returns (uint256)",
    "function superNodePrice() view returns (uint256)",
    "function owner() view returns (address)",
    "function nodeListLength() view returns (uint256)",
    "function superNodeListLength() view returns (uint256)",
    "function rewardPoolBalance() view returns (uint256)",
    "function poolAccumulated(uint8 poolType) view returns (uint256)",
    "function getPoolConfig(uint8 poolType) view returns (address recipient, uint16 bps)",
    "function currentDay() view returns (uint256)",
  ];

  const erc20Abi = [
    "function balanceOf(address account) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
  ];

  const provider = new ethers.JsonRpcProvider("https://rpc.cncchainpro.com");

  const core = new ethers.Contract(coreAddress, coreAbi, provider);
  const usdt = new ethers.Contract(usdtAddress, erc20Abi, provider);
  const ico = new ethers.Contract(icoAddress, erc20Abi, provider);
  const light = new ethers.Contract(lightAddress, erc20Abi, provider);

  console.log("=== 📊 线上数据查询 (CNC Mainnet) ===\n");

  // 1. 核心合约信息
  console.log("【1️⃣ 核心合约数据】");
  try {
    const [machinePrice, nodePrice, superNodePrice, owner, nodeCount, superNodeCount, rewardPool, currentDay] = await Promise.all([
      core.machineUnitPrice() as Promise<bigint>,
      core.nodePrice() as Promise<bigint>,
      core.superNodePrice() as Promise<bigint>,
      core.owner() as Promise<string>,
      core.nodeListLength() as Promise<bigint>,
      core.superNodeListLength() as Promise<bigint>,
      core.rewardPoolBalance() as Promise<bigint>,
      core.currentDay() as Promise<bigint>,
    ]);

    console.log(`Core 合约地址: ${coreAddress}`);
    console.log(`Owner 地址: ${owner}`);
    console.log(`当前日期 ID: ${currentDay}`);
    console.log(`矿机单价: ${ethers.formatUnits(machinePrice, 18)} USDT`);
    console.log(`节点价格: ${ethers.formatUnits(nodePrice, 18)} USDT`);
    console.log(`超级节点价格: ${ethers.formatUnits(superNodePrice, 18)} USDT`);
    console.log(`节点数量: ${nodeCount}`);
    console.log(`超级节点数量: ${superNodeCount}`);
    console.log(`奖励池余额: ${ethers.formatUnits(rewardPool, 18)} LIGHT\n`);
  } catch (e) {
    console.log(`❌ 查询失败: ${e}\n`);
  }

  // 2. 资金池配置
  console.log("【2️⃣ 资金池配置】");
  const poolNames: Record<number, string> = {
    0: "流动性池(LP)",
    1: "推荐池(Referral)",
    2: "超级节点池(SuperNode)",
    3: "节点池(Node)",
    4: "平台池(Platform)",
    5: "排行榜池(Leaderboard)",
  };

  try {
    for (let i = 0; i < 6; i++) {
      const config = await core.getPoolConfig(i) as [string, bigint];
      const accumulated = await core.poolAccumulated(i) as bigint;
      console.log(`${poolNames[i]}: ${Number(config[1]) / 100}% → ${config[0]} (累计: ${ethers.formatUnits(accumulated, 18)} USDT)`);
    }
    console.log();
  } catch (e) {
    console.log(`❌ 查询失败: ${e}\n`);
  }

  // 3. 代币信息
  console.log("【3️⃣ 代币总体信息】");
  try {
    const [usdtSupply, icoSupply, lightSupply, usdtDecimals, icoDecimals, lightDecimals] = await Promise.all([
      usdt.totalSupply() as Promise<bigint>,
      ico.totalSupply() as Promise<bigint>,
      light.totalSupply() as Promise<bigint>,
      usdt.decimals() as Promise<number>,
      ico.decimals() as Promise<number>,
      light.decimals() as Promise<number>,
    ]);

    console.log(`USDT: 总供应量 ${ethers.formatUnits(usdtSupply, usdtDecimals)}, 小数位 ${usdtDecimals}`);
    console.log(`ICO: 总供应量 ${ethers.formatUnits(icoSupply, icoDecimals)}, 小数位 ${icoDecimals}`);
    console.log(`LIGHT: 总供应量 ${ethers.formatUnits(lightSupply, lightDecimals)}, 小数位 ${lightDecimals}\n`);
  } catch (e) {
    console.log(`❌ 查询失败: ${e}\n`);
  }

  // 4. 核心合约代币余额
  console.log("【4️⃣ Core 合约代币余额】");
  try {
    const [usdtBal, icoBal, lightBal] = await Promise.all([
      usdt.balanceOf(coreAddress) as Promise<bigint>,
      ico.balanceOf(coreAddress) as Promise<bigint>,
      light.balanceOf(coreAddress) as Promise<bigint>,
    ]);

    console.log(`USDT 余额: ${ethers.formatUnits(usdtBal, 18)}`);
    console.log(`ICO 余额: ${ethers.formatUnits(icoBal, 18)}`);
    console.log(`LIGHT 余额: ${ethers.formatUnits(lightBal, 18)}\n`);
  } catch (e) {
    console.log(`❌ 查询失败: ${e}\n`);
  }

  console.log("=== ✅ 查询完成 ===");
}

main().catch(console.error);

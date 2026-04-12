/**
 * create-pancake-pool.ts
 * ------------------------------------------------------------------
 * 在 Pancake V3 (BSC Testnet) 上为 USDT/ICO 创建并初始化交易对，
 * 然后通过 NonfungiblePositionManager 注入初始流动性。
 *
 * 初始价格: 1 USDT = 100 ICO  (ICO ≈ 0.01 USDT)
 * 如果 ICO / LIGHT 代币未部署，脚本会自动部署并更新 .env 文件。
 *
 * 用法:
 *   npx hardhat run scripts/create-pancake-pool.ts --network bscTestnet
 * ------------------------------------------------------------------
 */

import * as fs from "fs";
import { ethers } from "hardhat";
import * as path from "path";

/* ─── Pancake V3 BSC Testnet 合约地址 ─── */
const FACTORY_ADDR = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const NPM_ADDR     = "0x427bF5b37357632377eCbEC9de3626C71A5396c1"; // NonfungiblePositionManager

/* ─── 项目代币地址（从 .env 读取）─── */
const USDT_ADDR = process.env.USDT_TOKEN_ADDRESS!;
let ICO_ADDR  = process.env.ICO_TOKEN_ADDRESS  || "";
let LIGHT_ADDR = process.env.LIGHT_TOKEN_ADDRESS || "";

/* ─── 池配置 ─── */
const FEE = 2500;          // 0.25%  (Pancake V3 标准费率之一)
const TICK_SPACING = 50;   // fee=2500 对应的 tick spacing

// 添加流动性数量 — 实际精度由合约 decimals() 决定，这里先用占位值；
// 脚本在 main() 中会根据 usdtDec/icoDec 动态重算
const USDT_AMOUNT_BASE = 1000;   // 1 000 USDT (real)
const ICO_AMOUNT_BASE  = 100000; // 100 000 ICO (real)

// 全范围 tick（允许任意价格波动）
const TICK_LOWER = -887250;   // floor(-887272 / 50) * 50 + 50 = -887250
const TICK_UPPER =  887250;   // ceil( 887272 / 50) * 50 - 50  =  887250

/* ─── ABI ─── */
const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
];

const NPM_ABI = [
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external payable returns (address pool)",
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
];

const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount) external",
  "function owner() view returns (address)",
  "function symbol() view returns (string)",
];

const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
];

/* ─── 工具函数 ─── */

/**
 * 计算 sqrtPriceX96。
 *
 * Pancake V3 价格 = token1_raw / token0_raw
 * sqrtPriceX96 = sqrt(price) * 2^96
 *
 * @param price1PerToken0  1 个 token0（实际单位）对应多少 token1（实际单位）
 * @param dec0             token0 精度
 * @param dec1             token1 精度
 */
function bigPow10(exp: number | bigint): bigint {
  const n = Math.floor(Number(exp)); // 确保是 JS number
  let result = 1n;
  for (let i = 0; i < n; i++) result *= 10n;
  return result;
}

function computeSqrtPriceX96(price1PerToken0: number | bigint, dec0: number | bigint, dec1: number | bigint): bigint {
  const p = Number(price1PerToken0); // 确保 JS number
  // 将 p 表示为整数分数 numerator / FRAC
  const FRAC = 1_000_000_000; // 9 位精度
  const numF = BigInt(Math.round(p * FRAC));
  const denF = BigInt(FRAC);

  const pow10d0 = bigPow10(dec0);
  const pow10d1 = bigPow10(dec1);

  // Q96 = 2^96 (预计算避免 ts-node 降级为 Math.pow)
  const Q96 = BigInt("79228162514264337593543950336");
  // sqrtPriceX96 = sqrt(numF * pow10d1 * Q96^2 / (denF * pow10d0))
  const inside = numF * pow10d1 * Q96 * Q96 / (denF * pow10d0);
  return sqrtBigInt(inside);
}

function sqrtBigInt(n: bigint): bigint {
  if (n < 0n) throw new Error("sqrt of negative");
  if (n === 0n) return 0n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

async function tryMint(
  tokenContract: any,
  to: string,
  amount: bigint,
  symbol: string,
  deployerAddr: string,
) {
  try {
    const owner: string = await tokenContract.owner();
    if (owner.toLowerCase() !== deployerAddr.toLowerCase()) {
      console.log(`  ℹ️  ${symbol}: 非 owner，无法 mint（将使用已有余额）`);
      return;
    }
    const tx = await tokenContract.mint(to, amount);
    await tx.wait();
    console.log(`  ✔  ${symbol}: mint ${amount} raw 完成`);
  } catch {
    console.log(`  ⚠️  ${symbol}: mint 失败（可能不支持 mint，将使用已有余额）`);
  }
}

/* ─── .env 更新工具 ─── */
function updateEnvVar(envPath: string, key: string, value: string) {
  let content = fs.readFileSync(envPath, "utf8");
  const re = new RegExp(`^(${key}\\s*=).*$`, "m");
  if (re.test(content)) {
    content = content.replace(re, `$1${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  fs.writeFileSync(envPath, content, "utf8");
}

/* ─── main ─── */
async function main() {
  if (!USDT_ADDR) {
    throw new Error("请在 .env 中设置 USDT_TOKEN_ADDRESS");
  }

  const envPath = path.resolve(__dirname, "../.env");
  const [deployer] = await ethers.getSigners();
  console.log("\n=== Pancake V3 ICO/USDT 流动性池初始化 ===");
  console.log("Deployer :", deployer.address);
  console.log("USDT     :", USDT_ADDR);
  console.log("Factory  :", FACTORY_ADDR);
  console.log("NPM      :", NPM_ADDR);
  console.log("Fee      :", FEE, "ppm (0.25%)");

  /* ─── Step 0: 确保 ICO / LIGHT 已部署 ─── */
  console.log("\n─── Step 0: 检查代币合约 ───");
  const provider = deployer.provider!;

  // 检查 ICO 是否已部署
  const icoCode = ICO_ADDR ? await provider.getCode(ICO_ADDR) : "0x";
  if (icoCode.length <= 2) {
    console.log("ICO 合约未部署，正在部署 IncubatorToken...");
    const IcoFactory = await ethers.getContractFactory("IncubatorToken");
    const icoToken = await IcoFactory.deploy("Incubator ICO", "ICO", deployer.address, deployer.address);
    await icoToken.waitForDeployment();
    ICO_ADDR = await icoToken.getAddress();
    console.log("✔ ICO 部署完成:", ICO_ADDR);
    // Mint 初始供应
    const mintTx = await (icoToken as any).mint(deployer.address, ethers.parseUnits("10000000", 18));
    await mintTx.wait();
    console.log("✔ ICO mint 10,000,000 到部署者");
    // 更新 .env
    updateEnvVar(envPath, "ICO_TOKEN_ADDRESS",       ICO_ADDR);
    updateEnvVar(envPath, "VITE_ICO_TOKEN_ADDRESS",  ICO_ADDR);
    console.log("✔ .env 已更新 ICO_TOKEN_ADDRESS =", ICO_ADDR);
  } else {
    console.log("✔ ICO 已部署:", ICO_ADDR);
  }

  // 检查 LIGHT 是否已部署（仅部署，不用于本池）
  const lightCode = LIGHT_ADDR ? await provider.getCode(LIGHT_ADDR) : "0x";
  if (lightCode.length <= 2) {
    console.log("LIGHT 合约未部署，正在部署 MockToken...");
    const LightFactory = await ethers.getContractFactory("MockToken");
    const lightToken = await LightFactory.deploy("Incubator LIGHT", "LIGHT", deployer.address);
    await lightToken.waitForDeployment();
    LIGHT_ADDR = await lightToken.getAddress();
    console.log("✔ LIGHT 部署完成:", LIGHT_ADDR);
    const mintLightTx = await (lightToken as any).mint(deployer.address, ethers.parseUnits("10000000", 18));
    await mintLightTx.wait();
    console.log("✔ LIGHT mint 10,000,000 到部署者");
    updateEnvVar(envPath, "LIGHT_TOKEN_ADDRESS",       LIGHT_ADDR);
    updateEnvVar(envPath, "VITE_LIGHT_TOKEN_ADDRESS",  LIGHT_ADDR);
    console.log("✔ .env 已更新 LIGHT_TOKEN_ADDRESS =", LIGHT_ADDR);
  } else {
    console.log("✔ LIGHT 已部署:", LIGHT_ADDR);
  }

  const usdt = new ethers.Contract(USDT_ADDR, ERC20_ABI, deployer);
  const ico  = new ethers.Contract(ICO_ADDR,  ERC20_ABI, deployer);
  const factory = new ethers.Contract(FACTORY_ADDR, FACTORY_ABI, deployer);
  const npm     = new ethers.Contract(NPM_ADDR,     NPM_ABI,     deployer);

  const usdtDec = Number(await usdt.decimals());
  const icoDec  = Number(await ico.decimals());
  const usdtSym = await usdt.symbol();
  const icoSym  = await ico.symbol();
  console.log(`\nToken候选 USDT (${usdtSym}): ${usdtDec} decimals @ ${USDT_ADDR}`);
  console.log(`Token候选 ICO  (${icoSym}) : ${icoDec} decimals @ ${ICO_ADDR}`);
  // 根据实际 decimals 计算流动性金额
  const USDT_AMOUNT = ethers.parseUnits(String(USDT_AMOUNT_BASE), usdtDec);
  const ICO_AMOUNT  = ethers.parseUnits(String(ICO_AMOUNT_BASE),  icoDec);
  // 按地址排序确定 token0/token1
  const usdtLower = USDT_ADDR.toLowerCase();
  const icoLower  = ICO_ADDR.toLowerCase();
  const isUsdtToken0 = usdtLower < icoLower;
  const token0Addr    = isUsdtToken0 ? USDT_ADDR : ICO_ADDR;
  const token1Addr    = isUsdtToken0 ? ICO_ADDR  : USDT_ADDR;
  const token0Dec     = isUsdtToken0 ? usdtDec : icoDec;
  const token1Dec     = isUsdtToken0 ? icoDec  : usdtDec;
  const token0Sym     = isUsdtToken0 ? usdtSym : icoSym;
  const token1Sym     = isUsdtToken0 ? icoSym  : usdtSym;
  console.log(`\n排序后: token0=${token0Sym} (${token0Addr}) token1=${token1Sym} (${token1Addr})`);

  /* ─── Step 1: 确认/创建并初始化 Pancake V3 池子 ─── */
  console.log("\n─── Step 1: 检查 / 创建 Pool ───");
  const existingPool: string = await factory.getPool(token0Addr, token1Addr, FEE);
  const poolExists = existingPool !== ethers.ZeroAddress;
  console.log("当前 Pool 地址:", poolExists ? existingPool : "未存在");

  // 初始价格: 1 USDT = 100 ICO
  // 当 USDT=token0 时: price = ICO_raw/USDT_raw = 100 × 10^18 / 10^6 = 10^14
  // 当 USDT=token1 时: price = USDT_raw/ICO_raw = 10^6 / (100 × 10^18) = 10^-14 → price = 0.01×10^(6-18)
  const price1Per0 = isUsdtToken0
    ? 100                   // 1 USDT → 100 ICO
    : 0.01;                 // 1 ICO  → 0.01 USDT

  const sqrtPriceX96 = computeSqrtPriceX96(price1Per0, token0Dec, token1Dec);
  console.log(`初始价格: 1 ${token0Sym} = ${price1Per0} ${token1Sym}`);
  console.log("sqrtPriceX96:", sqrtPriceX96.toString());

  let poolAddress: string;
  if (poolExists) {
    poolAddress = existingPool;
    const poolContract = new ethers.Contract(poolAddress, POOL_ABI, deployer);
    try {
      const slot0 = await poolContract.slot0();
      console.log("Pool 已存在且已初始化, 当前 sqrtPriceX96:", slot0[0].toString());
    } catch {
      console.log("Pool 存在但疑似未初始化，尝试再次 createAndInitialize...");
      const tx = await (npm as any).createAndInitializePoolIfNecessary(token0Addr, token1Addr, FEE, sqrtPriceX96, { gasLimit: 5_000_000 });
      const rc = await tx.wait();
      console.log("✔ createAndInitializePoolIfNecessary tx:", rc.hash);
    }
  } else {
    console.log("Pool 不存在，正在 createAndInitialize...");
    // 先用 callStatic 捕获返回的 pool 地址，再发实际 tx
    const poolAddrFromStatic: string = await (npm as any).createAndInitializePoolIfNecessary.staticCall(
      token0Addr, token1Addr, FEE, sqrtPriceX96,
      { gasLimit: 5_000_000 },
    );
    const tx = await (npm as any).createAndInitializePoolIfNecessary(
      token0Addr, token1Addr, FEE, sqrtPriceX96,
      { gasLimit: 5_000_000 },
    );
    const rc = await tx.wait();
    console.log("✔ createAndInitializePoolIfNecessary tx:", rc.hash);
    // 优先用 staticCall 返回值，fallback 为 factory 查询
    poolAddress = (poolAddrFromStatic && poolAddrFromStatic !== ethers.ZeroAddress)
      ? poolAddrFromStatic
      : await factory.getPool(token0Addr, token1Addr, FEE);
    console.log("✔ 新 Pool 地址:", poolAddress);
    if (!poolAddress || poolAddress === ethers.ZeroAddress) {
      throw new Error("无法获取 Pool 地址，请检查 Pancake Factory 配置");
    }
  }

  /* ─── Step 2: 确保 deployer 有足够代币 ─── */
  console.log("\n─── Step 2: 检查 / mint 代币余额 ───");

  const usdtBefore = await usdt.balanceOf(deployer.address);
  const icoBefore  = await ico.balanceOf(deployer.address);
  console.log("USDT 余额:", ethers.formatUnits(usdtBefore, usdtDec));
  console.log("ICO  余额:", ethers.formatUnits(icoBefore, icoDec));

  if (usdtBefore < USDT_AMOUNT) {
    const need = USDT_AMOUNT - usdtBefore;
    console.log(`USDT 不足，尝试 mint ${ethers.formatUnits(need, usdtDec)} USDT...`);
    await tryMint(usdt, deployer.address, need + USDT_AMOUNT, usdtSym, deployer.address);
  }
  if (icoBefore < ICO_AMOUNT) {
    const need = ICO_AMOUNT - icoBefore;
    console.log(`ICO 不足，尝试 mint ${ethers.formatUnits(need, icoDec)} ICO...`);
    await tryMint(ico, deployer.address, need + ICO_AMOUNT, icoSym, deployer.address);
  }

  const usdtAfter = await usdt.balanceOf(deployer.address);
  const icoAfter  = await ico.balanceOf(deployer.address);
  console.log("USDT 余额（更新后）:", ethers.formatUnits(usdtAfter, usdtDec));
  console.log("ICO  余额（更新后）:", ethers.formatUnits(icoAfter, icoDec));

  if (usdtAfter < USDT_AMOUNT) {
    throw new Error(`USDT 余额不足（需要 ${ethers.formatUnits(USDT_AMOUNT, usdtDec)}，实有 ${ethers.formatUnits(usdtAfter, usdtDec)}）。请先向部署者地址充值 USDT。`);
  }
  if (icoAfter < ICO_AMOUNT) {
    throw new Error(`ICO 余额不足（需要 ${ethers.formatUnits(ICO_AMOUNT, icoDec)}，实有 ${ethers.formatUnits(icoAfter, icoDec)}）。`);
  }

  /* ─── Step 3: approve NPM ─── */
  console.log("\n─── Step 3: 授权 NPM ───");

  const usdtAllowance = await usdt.allowance(deployer.address, NPM_ADDR);
  const icoAllowance  = await ico.allowance(deployer.address, NPM_ADDR);

  if (usdtAllowance < USDT_AMOUNT) {
    const tx = await usdt.approve(NPM_ADDR, ethers.MaxUint256);
    await tx.wait();
    console.log("✔ USDT approved to NPM");
  } else {
    console.log("✔ USDT 已有足够授权");
  }
  if (icoAllowance < ICO_AMOUNT) {
    const tx = await ico.approve(NPM_ADDR, ethers.MaxUint256);
    await tx.wait();
    console.log("✔ ICO approved to NPM");
  } else {
    console.log("✔ ICO 已有足够授权");
  }

  /* ─── Step 4: 添加流动性 ─── */
  console.log("\n─── Step 4: 添加初始流动性 ───");
  const poolContract2 = new ethers.Contract(poolAddress, POOL_ABI, deployer);
  let existingLiquidity = 0n;
  try {
    existingLiquidity = await poolContract2.liquidity();
  } catch {
    existingLiquidity = 0n;
  }
  console.log("Pool 当前 liquidity:", existingLiquidity.toString());

  const amount0Desired = isUsdtToken0 ? USDT_AMOUNT : ICO_AMOUNT;
  const amount1Desired = isUsdtToken0 ? ICO_AMOUNT  : USDT_AMOUNT;

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600); // 10 min

  const mintParams = {
    token0: token0Addr,
    token1: token1Addr,
    fee: FEE,
    tickLower: TICK_LOWER,
    tickUpper: TICK_UPPER,
    amount0Desired,
    amount1Desired,
    amount0Min: 0n,
    amount1Min: 0n,
    recipient: deployer.address,
    deadline,
  };

  console.log(`提供 ${ethers.formatUnits(amount0Desired, token0Dec)} ${token0Sym} + ${ethers.formatUnits(amount1Desired, token1Dec)} ${token1Sym}`);

  const mintTx = await npm.mint(mintParams, { gasLimit: 8_000_000 });
  const mintRc = await mintTx.wait();
  console.log("✔ mint tx:", mintRc.hash);

  /* ─── 汇报 ─── */
  console.log("\n=== 完成 ===");
  console.log("Pool 地址     :", poolAddress);
  console.log("SmartRouter   :", "0x9a489505a00cE272eAa5e07Dba6491314CaE3796");
  console.log("QuoterV2      :", "0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2");
  console.log("Fee           :", FEE, "ppm");
  console.log("\n➡  请在 .env 中确认以下配置已填入:");
  console.log("   VITE_PANCAKE_V3_ROUTER_ADDRESS=0x9a489505a00cE272eAa5e07Dba6491314CaE3796");
  console.log("   VITE_PANCAKE_V3_QUOTER_ADDRESS=0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2");
  console.log("   VITE_PANCAKE_V3_PRIMARY_FEE_PPM=2500");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

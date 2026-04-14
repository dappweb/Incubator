import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const poolRecipients = buildPoolRecipients(deployer.address);
  const usdtAddress = await resolveUsdtAddress(ethers, deployer.address);
  const icoAddress = await resolveIcoTokenAddress(ethers, deployer.address);
  const lightAddress = await resolveNamedTokenAddress(ethers, "LIGHT", "Incubator LIGHT", "LIGHT", deployer.address);

  const CoreFactory = await ethers.getContractFactory("IncubatorCore");
  const core = await upgrades.deployProxy(CoreFactory, [usdtAddress, deployer.address, poolRecipients], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await core.waitForDeployment();

  const OtcFactory = await ethers.getContractFactory("NodeOTCMarket");
  const otc = await upgrades.deployProxy(OtcFactory, [usdtAddress, await core.getAddress(), deployer.address, deployer.address], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await otc.waitForDeployment();

  const setMarketTx = await core.setIdentityMarket(await otc.getAddress());
  await setMarketTx.wait();

  const SwapFactory = await ethers.getContractFactory("SwapPoolManager");
  const swap = await upgrades.deployProxy(SwapFactory, [usdtAddress, icoAddress, lightAddress, deployer.address], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await swap.waitForDeployment();

  await (await swap.createDefaultPools(50, 200, 3000)).wait();
  const shouldSeedSwapLiquidity = process.env.SEED_SWAP_LIQUIDITY === "true";
  if (shouldSeedSwapLiquidity) {
    await trySeedSwapLiquidity(ethers, swap, usdtAddress, icoAddress, lightAddress, deployer.address);
  }

  console.log("USDT:", usdtAddress);
  console.log("ICO:", icoAddress);
  console.log("LIGHT:", lightAddress);
  console.log("IncubatorCore:", await core.getAddress());
  console.log("NodeOTCMarket:", await otc.getAddress());
  console.log("SwapPoolManager:", await swap.getAddress());
  if (!shouldSeedSwapLiquidity) {
    console.log("Swap liquidity seeding skipped. Set SEED_SWAP_LIQUIDITY=true after funding CNC USDT if you want to add initial liquidity.");
  }
}

async function resolveUsdtAddress(
  _hardhatEthers: typeof ethers,
  _deployerAddress: string,
) {
  const usdtAddress = process.env.USDT_TOKEN_ADDRESS?.trim();
  if (!usdtAddress) {
    throw new Error("缺少 USDT_TOKEN_ADDRESS：当前部署已禁用 MockUSDT，请配置真实 USDT 地址");
  }

  return usdtAddress;
}

async function resolveNamedTokenAddress(
  hardhatEthers: typeof ethers,
  envPrefix: "LIGHT",
  name: string,
  symbol: string,
  deployerAddress: string,
) {
  const envKey = `${envPrefix}_TOKEN_ADDRESS`;
  const existingAddress = process.env[envKey as keyof NodeJS.ProcessEnv];

  if (existingAddress) {
    return existingAddress;
  }

  const MockTokenFactory = await hardhatEthers.getContractFactory("MockToken");
  const token = await MockTokenFactory.deploy(name, symbol, deployerAddress);
  await token.waitForDeployment();

  const mintAmountRaw = process.env[`${envPrefix}_MINT_AMOUNT` as keyof NodeJS.ProcessEnv] || "10000000000000000000000000";
  await (await token.mint(deployerAddress, mintAmountRaw)).wait();

  return await token.getAddress();
}

async function resolveIcoTokenAddress(
  hardhatEthers: typeof ethers,
  deployerAddress: string,
) {
  const existingAddress = process.env.ICO_TOKEN_ADDRESS;

  if (existingAddress) {
    return existingAddress;
  }

  const IcoTokenFactory = await hardhatEthers.getContractFactory("IncubatorToken");
  const token = await IcoTokenFactory.deploy("Incubator ICO", "ICO", deployerAddress, deployerAddress);
  await token.waitForDeployment();

  const mintAmountRaw = process.env.ICO_MINT_AMOUNT || "10000000000000000000000000";
  await (await token.mint(deployerAddress, mintAmountRaw)).wait();

  return await token.getAddress();
}

async function trySeedSwapLiquidity(
  hardhatEthers: typeof ethers,
  swap: any,
  usdtAddress: string,
  icoAddress: string,
  lightAddress: string,
  deployerAddress: string,
) {
  const erc20Abi = [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function mint(address,uint256)",
  ];
  const usdt = new hardhatEthers.Contract(usdtAddress, erc20Abi, await hardhatEthers.getSigner(deployerAddress));
  const ico = new hardhatEthers.Contract(icoAddress, erc20Abi, await hardhatEthers.getSigner(deployerAddress));
  const light = new hardhatEthers.Contract(lightAddress, erc20Abi, await hardhatEthers.getSigner(deployerAddress));

  const swapAddress = await swap.getAddress();

  const usdtLiquidity = process.env.SWAP_USDT_ICO_USDT_LIQ || "10000000000";
  const icoLiquidity = process.env.SWAP_USDT_ICO_ICO_LIQ || "100000000000000000000000";
  const lightLiquidity = process.env.SWAP_LIGHT_ICO_LIGHT_LIQ || "200000000000000000000000";
  const lightPairIcoLiquidity = process.env.SWAP_LIGHT_ICO_ICO_LIQ || "100000000000000000000000";
  const totalIcoApproval = (BigInt(icoLiquidity) + BigInt(lightPairIcoLiquidity)).toString();

  const usdtBalance = await usdt.balanceOf(deployerAddress);
  if (usdtBalance < BigInt(usdtLiquidity)) {
    try {
      await (await usdt.mint(deployerAddress, usdtLiquidity)).wait();
    } catch {
      throw new Error("USDT 余额不足且当前 USDT 不支持 mint，请手动准备流动性后再 addLiquidity");
    }
  }

  await (await usdt.approve(swapAddress, usdtLiquidity)).wait();
  await (await ico.approve(swapAddress, totalIcoApproval)).wait();
  await (await light.approve(swapAddress, lightLiquidity)).wait();

  await (await swap.addLiquidity(0, usdtLiquidity, icoLiquidity)).wait();
  await (await swap.addLiquidity(1, lightLiquidity, lightPairIcoLiquidity)).wait();
}

function buildPoolRecipients(fallbackRecipient: string) {
  return [
    process.env.LP_POOL_ADDRESS || fallbackRecipient,
    process.env.REFERRAL_POOL_ADDRESS || fallbackRecipient,
    process.env.SUPER_NODE_POOL_ADDRESS || fallbackRecipient,
    process.env.NODE_POOL_ADDRESS || fallbackRecipient,
    process.env.PLATFORM_POOL_ADDRESS || fallbackRecipient,
    process.env.LEADERBOARD_POOL_ADDRESS || fallbackRecipient,
  ] as [string, string, string, string, string, string];
}

function splitEnvList(value?: string) {
  if (!value) {
    return [] as string[];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

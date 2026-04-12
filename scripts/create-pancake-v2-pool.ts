import { ethers } from "hardhat";

const ROUTER = process.env.VITE_PANCAKE_V2_ROUTER_ADDRESS || "0x9Ac64Cc6e4415144C455BD8E4837Fea55603e5c3";
const FACTORY = process.env.VITE_PANCAKE_V2_FACTORY_ADDRESS || "0xB7926C0430Afb07AA7DEfDE6DA862aE0Bde767bc";

const USDT = process.env.USDT_TOKEN_ADDRESS!;
const ICO = process.env.ICO_TOKEN_ADDRESS!;

const ROUTER_ABI = [
  "function factory() external view returns (address)",
  "function addLiquidity(address tokenA,address tokenB,uint amountADesired,uint amountBDesired,uint amountAMin,uint amountBMin,address to,uint deadline) external returns (uint amountA, uint amountB, uint liquidity)",
];

const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) external view returns (address)",
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function owner() view returns (address)",
  "function mint(address to, uint256 amount) external",
];

async function tryMint(token: any, to: string, amount: bigint, symbol: string, caller: string) {
  try {
    const owner = await token.owner();
    if (String(owner).toLowerCase() !== caller.toLowerCase()) {
      console.log(`${symbol}: 非 owner，跳过 mint`);
      return;
    }
    const tx = await token.mint(to, amount);
    await tx.wait();
    console.log(`${symbol}: mint ${amount.toString()} 完成`);
  } catch {
    console.log(`${symbol}: 不支持或无权限 mint，跳过`);
  }
}

async function main() {
  if (!USDT || !ICO) {
    throw new Error("缺少 USDT_TOKEN_ADDRESS 或 ICO_TOKEN_ADDRESS");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Router  :", ROUTER);
  console.log("Factory(env):", FACTORY);
  console.log("USDT    :", USDT);
  console.log("ICO     :", ICO);

  const router = new ethers.Contract(ROUTER, ROUTER_ABI, deployer);
  const routerFactoryAddr = await router.factory();
  const factoryAddr = String(routerFactoryAddr || FACTORY);
  const factory = new ethers.Contract(factoryAddr, FACTORY_ABI, deployer);
  console.log("Factory(router):", factoryAddr);
  const usdt = new ethers.Contract(USDT, ERC20_ABI, deployer);
  const ico = new ethers.Contract(ICO, ERC20_ABI, deployer);

  const [usdtDec, icoDec, usdtSym, icoSym] = await Promise.all([
    usdt.decimals(),
    ico.decimals(),
    usdt.symbol(),
    ico.symbol(),
  ]);

  const usdtAmount = ethers.parseUnits("1000", Number(usdtDec));
  const icoAmount = ethers.parseUnits("100000", Number(icoDec));

  const [usdtBal, icoBal] = await Promise.all([
    usdt.balanceOf(deployer.address),
    ico.balanceOf(deployer.address),
  ]);

  if (usdtBal < usdtAmount) {
    await tryMint(usdt, deployer.address, usdtAmount - usdtBal + usdtAmount, usdtSym, deployer.address);
  }
  if (icoBal < icoAmount) {
    await tryMint(ico, deployer.address, icoAmount - icoBal + icoAmount, icoSym, deployer.address);
  }

  const [usdtAllowance, icoAllowance] = await Promise.all([
    usdt.allowance(deployer.address, ROUTER),
    ico.allowance(deployer.address, ROUTER),
  ]);

  if (usdtAllowance < usdtAmount) {
    const tx = await usdt.approve(ROUTER, ethers.MaxUint256);
    await tx.wait();
    console.log("USDT approve 完成");
  }
  if (icoAllowance < icoAmount) {
    const tx = await ico.approve(ROUTER, ethers.MaxUint256);
    await tx.wait();
    console.log("ICO approve 完成");
  }

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20);
  const tx = await router.addLiquidity(
    USDT,
    ICO,
    usdtAmount,
    icoAmount,
    0,
    0,
    deployer.address,
    deadline,
    { gasLimit: 8_000_000 },
  );
  const rc = await tx.wait();
  console.log("addLiquidity tx:", rc.hash);

  const pair = await factory.getPair(USDT, ICO);
  console.log("V2 Pair:", pair);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

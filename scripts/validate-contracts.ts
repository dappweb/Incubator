import * as assert from "node:assert/strict";
import { ethers, upgrades } from "hardhat";

async function main() {
  await validateIcoBurnFlow(ethers);
  await validateCoreFlow(ethers);
  await validateOtcFlow(ethers);
  await validateSwapFlow(ethers);
  console.log("Contract validation passed.");
}

async function validateIcoBurnFlow(hardhatEthers: typeof ethers) {
  const [owner, saleWallet, burnOperator, holder] = await hardhatEthers.getSigners();

  const ico = await deployIcoToken(hardhatEthers, owner.address, saleWallet.address);
  await ico.connect(owner).mint(saleWallet.address, 1_000_000_000_000_000_000_000n);
  await ico.connect(owner).mint(holder.address, 200_000_000_000_000_000_000n);
  await ico.connect(owner).setBurnExecutor(burnOperator.address, true);

  const supplyBefore = await ico.totalSupply();
  await ico.connect(burnOperator).burnUnsold(400_000_000_000_000_000_000n);
  await ico.connect(holder).burn(50_000_000_000_000_000_000n);

  assert.equal(await ico.balanceOf(saleWallet.address), 600_000_000_000_000_000_000n);
  assert.equal(await ico.totalBurned(), 450_000_000_000_000_000_000n);
  assert.equal(supplyBefore - (await ico.totalSupply()), 450_000_000_000_000_000_000n);

  await assert.rejects(ico.connect(holder).burnUnsold(1n));
}

async function validateCoreFlow(hardhatEthers: typeof ethers) {
  const [owner, buyer, lp, referral, superPool, nodePool, platform, leaderboard] = await hardhatEthers.getSigners();

  const usdt = await deployMockUsdt(hardhatEthers, owner.address);
  const core = await deployCore(
    hardhatEthers,
    await usdt.getAddress(),
    owner.address,
    [lp.address, referral.address, superPool.address, nodePool.address, platform.address, leaderboard.address],
  );

  await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
  await usdt.connect(buyer).approve(await core.getAddress(), 10_000_000_000n);
  await core.connect(buyer).bindReferrer(owner.address);

  await core.connect(buyer).purchaseMachine(2);
  const order = await core.getMachineOrder(1);
  assert.equal(order.quantity, 2n);
  assert.equal(order.amountUSDT, 200_000_000n);

  assert.equal(await usdt.balanceOf(lp.address), 120_000_000n);
  assert.equal(await usdt.balanceOf(referral.address), 0n);
  assert.equal(await usdt.balanceOf(superPool.address), 10_000_000n);
  assert.equal(await usdt.balanceOf(nodePool.address), 16_000_000n);
  assert.equal(await usdt.balanceOf(platform.address), 40_000_000n);
  assert.equal(await usdt.balanceOf(leaderboard.address), 4_000_000n);
  assert.equal(await usdt.balanceOf(buyer.address), 9_800_000_000n);

  await core.connect(buyer).buyNode();
  assert.equal(await core.roles(buyer.address), 1n);

  await core.connect(buyer).buySuperNode();
  assert.equal(await core.roles(buyer.address), 2n);

  const identityId = await core.getUserIdentityId(buyer.address);
  const identity = await core.getIdentity(identityId);
  assert.equal(identity.owner, buyer.address);
  assert.equal(identity.role, 2n);

  await core.connect(owner).pause();
  await assert.rejects(core.connect(buyer).purchaseMachine(1));
}

async function validateOtcFlow(hardhatEthers: typeof ethers) {
  const [owner, seller, buyer, feeRecipient] = await hardhatEthers.getSigners();

  const usdt = await deployMockUsdt(hardhatEthers, owner.address);
  const core = await deployCore(
    hardhatEthers,
    await usdt.getAddress(),
    owner.address,
    [owner.address, owner.address, owner.address, owner.address, owner.address, owner.address],
  );
  const otc = await deployOtc(hardhatEthers, await usdt.getAddress(), await core.getAddress(), owner.address, feeRecipient.address);
  await core.connect(owner).setIdentityMarket(await otc.getAddress());

  await usdt.connect(owner).mint(buyer.address, 10_000_000_000n);
  await usdt.connect(buyer).approve(await otc.getAddress(), 10_000_000_000n);
  await usdt.connect(owner).mint(seller.address, 10_000_000_000n);
  await usdt.connect(seller).approve(await core.getAddress(), 10_000_000_000n);

  await core.connect(seller).bindReferrer(owner.address);
  await core.connect(seller).buyNode();
  const identityId = await core.getUserIdentityId(seller.address);
  await core.connect(seller).approveIdentityOperator(identityId, await otc.getAddress(), true);

  await otc.connect(seller).createOrder(identityId, 2_000_000_000n);
  assert.deepEqual(Array.from(await otc.getActiveOrderIds()), [1n]);
  assert.equal(await otc.getIdentityActiveOrder(identityId), 1n);

  await assert.rejects(
    otc.connect(seller).createOrder(identityId, 2_100_000_000n),
  );

  await otc.connect(buyer).fillOrder(1);
  assert.equal(await core.ownerOfIdentity(identityId), buyer.address);
  assert.deepEqual(Array.from(await otc.getActiveOrderIds()), []);
  assert.equal(await otc.getIdentityActiveOrder(identityId), 0n);
}

async function validateSwapFlow(hardhatEthers: typeof ethers) {
  const [owner, trader, feeA, feeB, bootstrap, nodePool, superNodePool] = await hardhatEthers.getSigners();

  const usdt = await deployMockUsdt(hardhatEthers, owner.address);
  const ico = await deployIcoToken(hardhatEthers, owner.address, owner.address);
  const light = await deployMockToken(hardhatEthers, "Incubator LIGHT", "LIGHT", owner.address);
  const swap = await deploySwap(hardhatEthers, await usdt.getAddress(), await ico.getAddress(), await light.getAddress(), owner.address);

  await swap.connect(owner).createDefaultPools(50, 200, 3000);

  await usdt.connect(owner).mint(owner.address, 20_000_000_000n);
  await ico.connect(owner).mint(owner.address, 2_000_000_000_000_000_000_000_000n);
  await light.connect(owner).mint(owner.address, 2_000_000_000_000_000_000_000_000n);

  await usdt.connect(owner).approve(await swap.getAddress(), 10_000_000_000n);
  await ico.connect(owner).approve(await swap.getAddress(), 600_000_000_000_000_000_000_000n);
  await light.connect(owner).approve(await swap.getAddress(), 300_000_000_000_000_000_000_000n);

  await swap.connect(owner).addLiquidity(0, 10_000_000_000n, 500_000_000_000_000_000_000_000n);
  await swap.connect(owner).addLiquidity(1, 200_000_000_000_000_000_000_000n, 100_000_000_000_000_000_000_000n);

  await usdt.connect(owner).mint(trader.address, 1_000_000_000n);
  await usdt.connect(trader).approve(await swap.getAddress(), 1_000_000_000n);

  const quote = await swap.quoteExactIn(0, await usdt.getAddress(), 100_000_000n);
  const amountOut = quote[0] as bigint;
  const fee = quote[1] as bigint;
  assert.ok(amountOut > 0n);
  assert.ok(fee > 0n);

  await swap.connect(trader).swapExactIn(0, await usdt.getAddress(), 100_000_000n, amountOut - 1n, trader.address);
  const traderIco = await ico.balanceOf(trader.address);
  assert.ok(traderIco >= amountOut - 1n);

  const feeVault = await swap.feeVault(0, await usdt.getAddress());
  assert.ok(feeVault > 0n);

  await swap.connect(owner).distributeFees(0, await usdt.getAddress(), [feeA.address, feeB.address], [5000, 5000]);
  assert.ok((await usdt.balanceOf(feeA.address)) > 0n);
  assert.ok((await usdt.balanceOf(feeB.address)) > 0n);

  await light.connect(owner).mint(trader.address, 2_000_000_000_000_000_000n);
  await light.connect(trader).approve(await swap.getAddress(), 2_000_000_000_000_000_000n);
  await swap.connect(owner).updateLightFeeConfig(6000, 3000, 700, 300, bootstrap.address, nodePool.address, superNodePool.address);

  const lightSupplyBefore = await light.totalSupply();
  await swap.connect(trader).swapExactIn(1, await light.getAddress(), 1_000_000_000_000_000_000n, 1n, trader.address);
  assert.equal(await swap.feeVault(1, await light.getAddress()), 20_000_000_000_000_000n);

  await swap.connect(owner).settleLightFees();
  assert.equal(await swap.feeVault(1, await light.getAddress()), 0n);
  assert.equal(lightSupplyBefore - (await light.totalSupply()), 12_000_000_000_000_000n);
  assert.equal(await light.balanceOf(bootstrap.address), 6_000_000_000_000_000n);
  assert.equal(await light.balanceOf(nodePool.address), 1_400_000_000_000_000n);
  assert.equal(await light.balanceOf(superNodePool.address), 600_000_000_000_000n);
}

async function deployMockUsdt(
  hardhatEthers: typeof ethers,
  initialOwner: string,
) {
  const factory = await hardhatEthers.getContractFactory("MockUSDT");
  const contract = await factory.deploy(initialOwner);
  await contract.waitForDeployment();
  return contract;
}

async function deployCore(
  hardhatEthers: typeof ethers,
  usdtAddress: string,
  owner: string,
  recipients: string[],
) {
  const factory = await hardhatEthers.getContractFactory("IncubatorCore");
  const contract = await upgrades.deployProxy(factory, [usdtAddress, owner, recipients], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor", "state-variable-assignment"],
  });
  await contract.waitForDeployment();
  return contract;
}

async function deployMockToken(
  hardhatEthers: typeof ethers,
  name: string,
  symbol: string,
  initialOwner: string,
) {
  const factory = await hardhatEthers.getContractFactory("MockToken");
  const contract = await factory.deploy(name, symbol, initialOwner);
  await contract.waitForDeployment();
  return contract;
}

async function deployIcoToken(
  hardhatEthers: typeof ethers,
  initialOwner: string,
  saleWallet: string,
) {
  const factory = await hardhatEthers.getContractFactory("IncubatorToken");
  const contract = await factory.deploy("Incubator ICO", "ICO", initialOwner, saleWallet);
  await contract.waitForDeployment();
  return contract;
}

async function deploySwap(
  hardhatEthers: typeof ethers,
  usdtAddress: string,
  icoAddress: string,
  lightAddress: string,
  initialOwner: string,
) {
  const factory = await hardhatEthers.getContractFactory("SwapPoolManager");
  const contract = await upgrades.deployProxy(factory, [usdtAddress, icoAddress, lightAddress, initialOwner], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await contract.waitForDeployment();
  return contract;
}

async function deployOtc(
  hardhatEthers: typeof ethers,
  usdtAddress: string,
  coreAddress: string,
  initialOwner: string,
  feeRecipient: string,
) {
  const factory = await hardhatEthers.getContractFactory("NodeOTCMarket");
  const contract = await upgrades.deployProxy(factory, [usdtAddress, coreAddress, initialOwner, feeRecipient], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await contract.waitForDeployment();
  return contract;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
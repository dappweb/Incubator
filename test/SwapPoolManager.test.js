const assert = require("node:assert/strict");
const { ethers, upgrades } = require("hardhat");

async function expectRevert(promise) {
  await assert.rejects(promise);
}

describe("SwapPoolManager", function () {
  it("allows USDT/ICO both ways and restricts LIGHT/ICO to LIGHT->ICO", async function () {
    const [owner, trader] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const ico = await deployIcoToken(owner.address, owner.address);
    const light = await deployMockToken("Incubator Light", "LIGHT", owner.address);
    const swapPool = await deploySwapPool(
      await usdt.getAddress(),
      await ico.getAddress(),
      await light.getAddress(),
      owner.address,
    );

    await swapPool.createDefaultPools(100, 200, 2_000);
    // P6: legacy USDT/ICO internal pool is disabled by default; enable it for this legacy regression test.
    await swapPool.setUsdtIcoPoolEnabled(true);

    await usdt.connect(owner).mint(owner.address, 2_000_000_000n);
    await ico.connect(owner).mint(owner.address, 8_000_000_000_000000000n);
    await light.connect(owner).mint(owner.address, 20_000_000_000_000000000n);

    await usdt.connect(owner).approve(await swapPool.getAddress(), 2_000_000_000n);
    await ico.connect(owner).approve(await swapPool.getAddress(), 8_000_000_000_000000000n);
    await light.connect(owner).approve(await swapPool.getAddress(), 20_000_000_000_000000000n);

    await swapPool.addLiquidity(0, 1_000_000_000n, 5_000_000_000_000000000n);
    await swapPool.addLiquidity(1, 10_000_000_000_000000000n, 2_000_000_000_000000000n);

    await usdt.connect(owner).mint(trader.address, 200_000_000n);
    await ico.connect(owner).mint(trader.address, 2_000_000_000_000000000n);
    await light.connect(owner).mint(trader.address, 5_000_000_000_000000000n);

    await usdt.connect(trader).approve(await swapPool.getAddress(), 200_000_000n);
    await ico.connect(trader).approve(await swapPool.getAddress(), 2_000_000_000_000000000n);
    await light.connect(trader).approve(await swapPool.getAddress(), 5_000_000_000_000000000n);

    const usdtToIcoQuote = await swapPool.quoteExactIn(0, await usdt.getAddress(), 100_000_000n);
    assert.ok(usdtToIcoQuote[0] > 0n);
    await swapPool.connect(trader).swapExactIn(0, await usdt.getAddress(), 100_000_000n, 1n, trader.address);

    const icoToUsdtQuote = await swapPool.quoteExactIn(0, await ico.getAddress(), 100_000_000_000000000n);
    assert.ok(icoToUsdtQuote[0] > 0n);
    await swapPool.connect(trader).swapExactIn(0, await ico.getAddress(), 100_000_000_000000000n, 1n, trader.address);

    const lightToIcoQuote = await swapPool.quoteExactIn(1, await light.getAddress(), 1_000_000_000_000000000n);
    assert.ok(lightToIcoQuote[0] > 0n);
    await swapPool.connect(trader).swapExactIn(1, await light.getAddress(), 1_000_000_000_000000000n, 1n, trader.address);

    await expectRevert(swapPool.quoteExactIn(1, await ico.getAddress(), 100_000_000_000000000n));

    await expectRevert(swapPool.connect(trader).swapExactIn(1, await ico.getAddress(), 100_000_000_000000000n, 1n, trader.address));
  });

  it("burns and splits LIGHT fees with configurable settlement", async function () {
    const [owner, trader, bootstrap, nodePool, superNodePool] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const ico = await deployIcoToken(owner.address, owner.address);
    const light = await deployMockToken("Incubator Light", "LIGHT", owner.address);
    const swapPool = await deploySwapPool(
      await usdt.getAddress(),
      await ico.getAddress(),
      await light.getAddress(),
      owner.address,
    );

    await swapPool.createDefaultPools(100, 200, 2_000);
    await swapPool.updateLightFeeConfig(6000, 3000, 700, 300, bootstrap.address, nodePool.address, superNodePool.address);

    await light.connect(owner).mint(owner.address, 20_000_000_000_000000000n);
    await ico.connect(owner).mint(owner.address, 5_000_000_000_000000000n);
    await light.connect(owner).approve(await swapPool.getAddress(), 20_000_000_000_000000000n);
    await ico.connect(owner).approve(await swapPool.getAddress(), 5_000_000_000_000000000n);
    await swapPool.addLiquidity(1, 10_000_000_000_000000000n, 2_000_000_000_000000000n);

    await light.connect(owner).mint(trader.address, 2_000_000_000_000000000n);
    await light.connect(trader).approve(await swapPool.getAddress(), 2_000_000_000_000000000n);

    const totalSupplyBefore = await light.totalSupply();
    await swapPool.connect(trader).swapExactIn(1, await light.getAddress(), 1_000_000_000_000000000n, 1n, trader.address);

    const feeVaultBefore = await swapPool.feeVault(1, await light.getAddress());
    assert.equal(feeVaultBefore, 20_000_000_000_000000n);

    await swapPool.settleLightFees();

    assert.equal(await swapPool.feeVault(1, await light.getAddress()), 0n);
    assert.equal(totalSupplyBefore - (await light.totalSupply()), 12_000_000_000_000000n);
    assert.equal(await light.balanceOf(bootstrap.address), 6_000_000_000_000000n);
    assert.equal(await light.balanceOf(nodePool.address), 1_400_000_000_000000n);
    assert.equal(await light.balanceOf(superNodePool.address), 600_000_000_000000n);
  });
});

async function deployMockUsdt(initialOwner) {
  const factory = await ethers.getContractFactory("MockUSDT");
  const contract = await factory.deploy(initialOwner);
  await contract.waitForDeployment();
  return contract;
}

async function deployMockToken(name, symbol, initialOwner) {
  const factory = await ethers.getContractFactory("MockToken");
  const contract = await factory.deploy(name, symbol, initialOwner);
  await contract.waitForDeployment();
  return contract;
}

async function deployIcoToken(initialOwner, saleWallet) {
  const factory = await ethers.getContractFactory("IncubatorToken");
  const contract = await factory.deploy("Incubator ICO", "ICO", initialOwner, saleWallet);
  await contract.waitForDeployment();
  return contract;
}

async function deploySwapPool(usdtAddress, icoAddress, lightAddress, initialOwner) {
  const factory = await ethers.getContractFactory("SwapPoolManager");
  const contract = await upgrades.deployProxy(factory, [usdtAddress, icoAddress, lightAddress, initialOwner], {
    kind: "uups",
    initializer: "initialize",
    unsafeAllow: ["constructor"],
  });
  await contract.waitForDeployment();
  return contract;
}

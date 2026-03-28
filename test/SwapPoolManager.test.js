const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("SwapPoolManager", function () {
  it("allows USDT/ICO both ways and restricts LIGHT/ICO to LIGHT->ICO", async function () {
    const [owner, trader] = await ethers.getSigners();

    const usdt = await deployMockUsdt(owner.address);
    const ico = await deployMockToken("Incubator ICO", "ICO", owner.address);
    const light = await deployMockToken("Incubator Light", "LIGHT", owner.address);
    const swapPool = await deploySwapPool(
      await usdt.getAddress(),
      await ico.getAddress(),
      await light.getAddress(),
      owner.address,
    );

    await swapPool.createDefaultPools(100, 200, 2_000);

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

    await assert.rejects(
      swapPool.quoteExactIn(1, await ico.getAddress(), 100_000_000_000000000n),
      /LIGHT->ICO only/,
    );

    await assert.rejects(
      swapPool.connect(trader).swapExactIn(1, await ico.getAddress(), 100_000_000_000000000n, 1n, trader.address),
      /LIGHT->ICO only/,
    );
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

async function deploySwapPool(usdtAddress, icoAddress, lightAddress, initialOwner) {
  const factory = await ethers.getContractFactory("SwapPoolManager");
  const contract = await factory.deploy(usdtAddress, icoAddress, lightAddress, initialOwner);
  await contract.waitForDeployment();
  return contract;
}

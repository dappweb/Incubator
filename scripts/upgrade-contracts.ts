import { ethers, upgrades } from "hardhat";

type UpgradeTarget = {
  label: string;
  envKey: string;
  contractName: "IncubatorCore" | "NodeOTCMarket" | "SwapPoolManager" | "IdentityNFT" | "PrimarySwapController";
};

function resolveProxyAddress(envKey: string): string | null {
  const value = process.env[envKey]?.trim();
  if (!value || value === "0x") {
    return null;
  }
  if (!ethers.isAddress(value)) {
    throw new Error(`${envKey} is not a valid address: ${value}`);
  }
  return value;
}

async function main() {
  console.log("Starting contract upgrade...");

  const [deployer] = await ethers.getSigners();
  console.log(`Upgrading with account: ${deployer.address}`);

  const targets: UpgradeTarget[] = [
    { label: "IncubatorCore", envKey: "INCUBATOR_CORE_PROXY", contractName: "IncubatorCore" },
    { label: "NodeOTCMarket", envKey: "NODE_OTC_MARKET_PROXY", contractName: "NodeOTCMarket" },
    { label: "SwapPoolManager", envKey: "SWAP_POOL_MANAGER_PROXY", contractName: "SwapPoolManager" },
    { label: "IdentityNFT", envKey: "IDENTITY_NFT_PROXY", contractName: "IdentityNFT" },
    { label: "PrimarySwapController", envKey: "PRIMARY_SWAP_CONTROLLER_PROXY", contractName: "PrimarySwapController" },
  ];

  try {
    const summary: Array<{ label: string; proxy: string; implementation: string }> = [];

    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      const proxyAddress = resolveProxyAddress(target.envKey);
      if (!proxyAddress) {
        console.log(`- Skipping ${target.label}: ${target.envKey} not configured`);
        continue;
      }

      console.log(`\n${index + 1}. Upgrading ${target.label}...`);
      const factory = await ethers.getContractFactory(target.contractName);
      const upgraded = await upgrades.upgradeProxy(proxyAddress, factory, {
        kind: "uups",
        unsafeAllow: ["constructor"],
      });
      await upgraded.waitForDeployment();
      const implementation = await upgrades.erc1967.getImplementationAddress(proxyAddress);
      summary.push({ label: target.label, proxy: proxyAddress, implementation });
      console.log(`✓ ${target.label} upgraded`);
      console.log(`  Proxy: ${proxyAddress}`);
      console.log(`  Impl : ${implementation}`);
    }

    if (summary.length === 0) {
      console.log("\n⚠ No proxy addresses configured. Nothing upgraded.");
      return;
    }

    console.log("\n✅ Upgrade completed!");
    console.log("\nUpgrade Summary:");
    for (const item of summary) {
      console.log(`- ${item.label} proxy: ${item.proxy}`);
      console.log(`  implementation: ${item.implementation}`);
    }

    // Post-upgrade: configure on-chain settlement for Node/SuperNode/Leaderboard pools
    const coreEntry = summary.find((x) => x.label === "IncubatorCore");
    if (coreEntry) {
      console.log("\n🔧 Configuring on-chain pool settlement on IncubatorCore...");
      const core = await ethers.getContractAt("IncubatorCore", coreEntry.proxy);
      const coreAddress = coreEntry.proxy;

      // 1. Route SuperNode(2), Node(3), Leaderboard(5) pools to the contract itself
      const poolsToRoute: Array<{ id: number; name: string }> = [
        { id: 2, name: "SuperNode" },
        { id: 3, name: "Node" },
        { id: 5, name: "Leaderboard" },
      ];
      for (const pool of poolsToRoute) {
        try {
          const current: string = await core.poolRecipient(pool.id);
          if (current.toLowerCase() === coreAddress.toLowerCase()) {
            console.log(`  - pool#${pool.id} (${pool.name}) already routed to core, skipping`);
            continue;
          }
          const tx = await core.updatePoolRecipient(pool.id, coreAddress);
          await tx.wait();
          console.log(`  ✓ pool#${pool.id} (${pool.name}) recipient → core`);
        } catch (err) {
          console.warn(`  ⚠ failed routing pool#${pool.id}:`, (err as Error).message);
        }
      }

      // 2. Bootstrap role lists from existing participants (one-time, idempotent guard in contract)
      try {
        const bootstrapped: boolean = await core.roleListsBootstrapped();
        if (bootstrapped) {
          console.log("  - role lists already bootstrapped, skipping");
        } else {
          const tx = await core.bootstrapRoleLists();
          await tx.wait();
          console.log("  ✓ role lists bootstrapped from existing participants");
        }
      } catch (err) {
        console.warn("  ⚠ bootstrapRoleLists failed:", (err as Error).message);
      }

      // 3. Set minimum settle amount (1 USDT by default, using usdt decimals)
      try {
        const usdtAddress: string = await core.usdtToken();
        const usdt = await ethers.getContractAt("IERC20Metadata", usdtAddress);
        let decimals = 18n;
        try {
          decimals = BigInt(await usdt.decimals());
        } catch {
          // fallback
        }
        const minAmount = 10n ** decimals; // 1 USDT
        const current: bigint = await core.minPoolSettleAmount();
        if (current !== minAmount) {
          const tx = await core.setMinPoolSettleAmount(minAmount);
          await tx.wait();
          console.log(`  ✓ minPoolSettleAmount set to 1 USDT (${minAmount.toString()})`);
        } else {
          console.log("  - minPoolSettleAmount already configured");
        }
      } catch (err) {
        console.warn("  ⚠ setMinPoolSettleAmount failed:", (err as Error).message);
      }

      // 4. Enable public settle so operators / off-chain cron can trigger without owner key
      try {
        const enabled: boolean = await core.publicSettleEnabled();
        if (!enabled) {
          const tx = await core.setPublicSettleEnabled(true);
          await tx.wait();
          console.log("  ✓ publicSettleEnabled = true");
        } else {
          console.log("  - publicSettleEnabled already true");
        }
      } catch (err) {
        console.warn("  ⚠ setPublicSettleEnabled failed:", (err as Error).message);
      }

      console.log("🔧 On-chain settlement configuration complete.");
    }
  } catch (error) {
    console.error("❌ Upgrade failed:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

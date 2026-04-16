import { ethers } from "ethers";

const RPC = "https://rpc.cncchainpro.com";
const provider = new ethers.JsonRpcProvider(RPC);
const CORE = "0xECD96148D33A8ca8F86cd701d445FB3bbe7592E2";
const USDT = "0xC4eA24dFC165Fedb881783a84F44C2806CF7FBbD";
const USER = "0x2f0549714E63B91d07c84100f1E753d4516bb9F0";

const coreAbi = [
  "function roles(address) view returns (uint8)",
  "function referralOf(address) view returns (address)",
  "function nodePrice() view returns (uint256)",
  "function superNodePrice() view returns (uint256)",
  "function machineUnitPrice() view returns (uint256)",
  "function getUserMachineOrders(address) view returns (uint256[])",
  "function getMachineOrder(uint256) view returns (tuple(uint256 id, address user, uint256 quantity, uint256 amountUSDT, address referrer, uint256 createdAt))",
  "event NodePurchased(address indexed user, uint256 amountUSDT, uint256 identityId)",
  "event SuperNodePurchased(address indexed user, uint256 amountUSDT, uint256 identityId)",
  "event MachinePurchased(address indexed user, uint256 orderId, uint256 quantity, uint256 amountUSDT, address referrer)",
];

const usdtAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address,address) view returns (uint256)",
];

const core = new ethers.Contract(CORE, coreAbi, provider);
const usdt = new ethers.Contract(USDT, usdtAbi, provider);

async function main() {
  const [role, referrer, nodePrice, superPrice, machinePrice, usdtBal, decimals, allowance] = await Promise.all([
    core.roles(USER),
    core.referralOf(USER),
    core.nodePrice(),
    core.superNodePrice(),
    core.machineUnitPrice(),
    usdt.balanceOf(USER),
    usdt.decimals(),
    usdt.allowance(USER, CORE),
  ]);

  console.log("=== User:", USER, "===");
  console.log("Role:", Number(role), "(0=user, 1=node, 2=super)");
  console.log("Referrer:", referrer);
  console.log("USDT balance:", ethers.formatUnits(usdtBal, Number(decimals)), "USDT");
  console.log("USDT allowance to Core:", ethers.formatUnits(allowance, Number(decimals)), "USDT");
  console.log("Node price:", ethers.formatUnits(nodePrice, Number(decimals)), "USDT");
  console.log("SuperNode price:", ethers.formatUnits(superPrice, Number(decimals)), "USDT");
  console.log("Machine unit price:", ethers.formatUnits(machinePrice, Number(decimals)), "USDT");

  // Check machine orders
  const orderIds = await core.getUserMachineOrders(USER);
  console.log("\nMachine orders:", orderIds.length);
  for (const id of orderIds) {
    const order = await core.getMachineOrder(id);
    console.log(`  Order #${order.id}: qty=${order.quantity}, amount=${ethers.formatUnits(order.amountUSDT, Number(decimals))} USDT, ref=${order.referrer}`);
  }

  // Check recent events for this user
  const latest = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latest - 50000);
  
  const nodeFilter = core.filters.NodePurchased(USER);
  const superFilter = core.filters.SuperNodePurchased(USER);
  const machineFilter = core.filters.MachinePurchased(USER);
  
  const [nodeLogs, superLogs, machineLogs] = await Promise.all([
    core.queryFilter(nodeFilter, fromBlock, latest),
    core.queryFilter(superFilter, fromBlock, latest),
    core.queryFilter(machineFilter, fromBlock, latest),
  ]);
  
  console.log("\nNode purchase events:", nodeLogs.length);
  for (const log of nodeLogs) {
    const block = await provider.getBlock(log.blockNumber);
    console.log(`  Block ${log.blockNumber}, tx: ${log.transactionHash}, time: ${new Date((block?.timestamp ?? 0) * 1000).toISOString()}`);
  }
  
  console.log("SuperNode purchase events:", superLogs.length);
  for (const log of superLogs) {
    const block = await provider.getBlock(log.blockNumber);
    console.log(`  Block ${log.blockNumber}, tx: ${log.transactionHash}, time: ${new Date((block?.timestamp ?? 0) * 1000).toISOString()}`);
  }
  
  console.log("Machine purchase events:", machineLogs.length);
}

main().catch(console.error);

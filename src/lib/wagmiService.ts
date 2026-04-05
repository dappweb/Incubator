import { BrowserProvider } from "ethers";
import { getReferrer } from "./coreContract";

/**
 * 钱包连接信息
 */
export type WalletInfo = {
  address: string;
  chainId: number;
  provider: BrowserProvider;
};

/**
 * 推荐人信息
 */
export type ReferrerInfo = {
  address: string | null;
  source: "none" | "link" | "onchain" | "owner" | "manual";
};

/**
 * 钱包事件类型
 */
export type WalletEventListener = {
  onAccountsChanged: (accounts: string[]) => void;
  onChainChanged: (chainId: string) => void;
  onDisconnect: () => void;
};

/**
 * 检查用户是否已在链上绑定推荐人
 */
export async function checkReferrerOnChain(
  provider: BrowserProvider,
  userAddress: string
): Promise<string | null> {
  try {
    console.log("检查链上推荐人:", userAddress);
    const referrer = await getReferrer(provider, userAddress);
    console.log("链上推荐人查询结果:", referrer);
    
    // 检查是否为有效地址
    if (!referrer) {
      console.debug("User has no referrer (null)");
      return null;
    }

    // 转换为小写进行比较
    const lowerReferrer = referrer.toLowerCase();
    const zeroAddress = "0x0000000000000000000000000000000000000000";

    // 返回 0x0 或空地址表示未绑定
    if (lowerReferrer === zeroAddress) {
      console.debug("User has no referrer (zero address)");
      return null;
    }

    // 有效的推荐人地址
    console.debug("User has referrer on-chain:", referrer);
    return referrer;
  } catch (error) {
    console.warn("Failed to check referrer on-chain:", error);
    return null;
  }
}

/**
 * 初始化推荐人信息
 * 优先级：URL 链接 > 链上已绑定 > 合约 Owner
 */
export async function initializeReferrer(
  provider: BrowserProvider,
  userAddress: string,
  contractOwner: string
): Promise<ReferrerInfo> {
  // 1. 检查 URL 中是否有推荐人参数
  const params = new URLSearchParams(window.location.search);
  const urlRef = params.get("ref");
  if (urlRef) {
    return {
      address: urlRef,
      source: "link",
    };
  }

  // 2. 检查链上是否已绑定推荐人
  try {
    const chainReferrer = await checkReferrerOnChain(provider, userAddress);
    if (chainReferrer) {
      console.debug("Found existing referrer on-chain:", chainReferrer);
      return {
        address: chainReferrer,
        source: "onchain",
      };
    }
  } catch (error) {
    console.warn("Failed to check referrer on-chain:", error);
  }

  // 3. 使用合约 Owner 作为默认推荐人（只有非 Owner 的用户才能这样做）
  if (contractOwner && contractOwner.toLowerCase() !== userAddress.toLowerCase()) {
    return {
      address: contractOwner,
      source: "owner",
    };
  }

  // 没有有效的推荐人
  return {
    address: null,
    source: "none",
  };
}

/**
 * 验证钱包是否连接
 */
export async function verifyWalletConnected(provider: BrowserProvider): Promise<string | null> {
  try {
    const accounts = await provider.send("eth_accounts", []);
    return accounts.length > 0 ? accounts[0] : null;
  } catch {
    return null;
  }
}

/**
 * 建立钱包事件监听
 * 支持监听账户变化、链变化和断开事件
 */
export function setupWalletEventListeners(listeners: Partial<WalletEventListener>) {
  if (!window.ethereum) return () => undefined;

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      listeners.onDisconnect?.();
    } else {
      listeners.onAccountsChanged?.(accounts);
    }
  };

  const handleChainChanged = (chainId: string) => {
    listeners.onChainChanged?.(chainId);
  };

  const handleDisconnect = () => {
    listeners.onDisconnect?.();
  };

  window.ethereum.on?.("accountsChanged", handleAccountsChanged);
  window.ethereum.on?.("chainChanged", handleChainChanged);
  window.ethereum.on?.("disconnect", handleDisconnect);

  // 返回清理函数
  return () => {
    window.ethereum?.removeListener?.("accountsChanged", handleAccountsChanged);
    window.ethereum?.removeListener?.("chainChanged", handleChainChanged);
    window.ethereum?.removeListener?.("disconnect", handleDisconnect);
  };
}

/**
 * 断开钱包连接
 */
export async function disconnectWalletAsync() {
  if (!window.ethereum) {
    throw new Error("未检测到钱包插件");
  }

  try {
    // 尝试撤销权限
    if (window.ethereum.request) {
      await window.ethereum.request({
        method: "wallet_revokePermissions",
        params: [
          {
            eth_accounts: {},
          },
        ],
      });
    }
  } catch {
    // 如果钱包不支持 wallet_revokePermissions，继续处理
    // 应用层会清除本地状态
  }
}

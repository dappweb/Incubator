import { useEffect, useState, useCallback } from "react";
import { BrowserProvider, isAddress } from "ethers";
import { getContractOwner } from "./coreContract";
import { initializeReferrer, checkReferrerOnChain } from "./wagmiService";

type ReferrerSource = "none" | "link" | "onchain" | "owner" | "manual";

type ReferrerState = {
  address: string;
  source: ReferrerSource;
};

interface UseReferrerConfig {
  userAddress: string | null;
  provider: BrowserProvider | null;
}

/**
 * 管理推荐人状态的自定义 hook
 * 处理：URL 链接、链上绑定、合约 Owner 默认值、手动输入
 */
export function useReferrer({ userAddress, provider }: UseReferrerConfig) {
  const [referrer, setReferrer] = useState<ReferrerState>({
    address: "",
    source: "none",
  });
  const [contractOwner, setContractOwner] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState(true);

  // 初始化推荐人信息
  useEffect(() => {
    let disposed = false;

    const initReferrer = async () => {
      setIsInitializing(true);
      try {
        // 1. 获取合约 Owner
        let owner = "";
        if (!window.ethereum) {
          throw new Error("未检测到钱包插件");
        }
        const readProvider = new BrowserProvider(window.ethereum);
        owner = await getContractOwner(readProvider);
        if (!disposed) {
          setContractOwner(owner);
        }

        // 2. 如果用户已连接，初始化推荐人
        if (userAddress && provider) {
          console.debug("Initializing referrer for user:", userAddress);
          const referrerInfo = await initializeReferrer(provider, userAddress, owner);
          console.debug("Referrer info:", referrerInfo);
          if (!disposed) {
            setReferrer({
              address: referrerInfo.address || "",
              source: referrerInfo.source,
            });
          }
        }
      } catch (error) {
        if (!disposed) {
          console.error("Failed to initialize referrer:", error);
        }
      } finally {
        if (!disposed) {
          setIsInitializing(false);
        }
      }
    };

    // 只在用户地址或 provider 变化时重新初始化
    if (userAddress && provider) {
      initReferrer();
    } else {
      setIsInitializing(false);
    }

    return () => {
      disposed = true;
    };
  }, [userAddress, provider]);

  /**
   * 更新推荐人地址并标记为手动输入
   */
  const setMachineReferrer = useCallback((address: string) => {
    setReferrer({
      address,
      source: "manual",
    });
  }, []);

  /**
   * 验证推荐人是否有效
   */
  const isValidReferrer = useCallback((): boolean => {
    if (!referrer.address || !isAddress(referrer.address)) {
      return false;
    }
    // 如果是自邀请（用户地址与推荐人相同），只有当用户是owner时才有效
    if (
      userAddress &&
      referrer.address.toLowerCase() === userAddress.toLowerCase()
    ) {
      return userAddress.toLowerCase() === contractOwner.toLowerCase();
    }
    return true;
  }, [referrer.address, userAddress, contractOwner]);

  /**
   * 获取推荐人标签
   */
  const getSourceLabel = useCallback(
    (lang: "zh" | "en") => {
      const labels = {
        zh: {
          none: "",
          link: "来源：邀请链接",
          onchain: "来源：链上已绑定",
          owner: "来源：默认（合约 Owner）",
          manual: "来源：手动输入",
        },
        en: {
          none: "",
          link: "Source: invite link",
          onchain: "Source: on-chain bound",
          owner: "Source: default (contract owner)",
          manual: "Source: manual input",
        },
      };
      return labels[lang][referrer.source];
    },
    [referrer.source]
  );

  /**
   * 在绑定成功后更新状态
   */
  const markAsBound = useCallback(() => {
    setReferrer((prev) => ({
      ...prev,
      source: "onchain",
    }));
  }, []);

  /**
   * 检查是否已绑定推荐人
   */
  const isBound = referrer.source === "onchain";

  /**
   * 重置推荐人（通常在断开钱包时调用）
   */
  const reset = useCallback(() => {
    setReferrer({
      address: "",
      source: "none",
    });
    setContractOwner("");
  }, []);

  return {
    referrer: referrer.address,
    referrerSource: referrer.source,
    contractOwner,
    isValidReferrer: isValidReferrer(),
    isBound,
    isInitializing,
    setMachineReferrer,
    getSourceLabel,
    markAsBound,
    reset,
  };
}

/**
 * 处理推荐人绑定的流程
 */
export async function handleReferrerBinding(
  provider: BrowserProvider,
  referrerAddress: string,
  userAddress: string,
  contractOwner: string,
  lang: "zh" | "en" = "zh"
): Promise<{
  success: boolean;
  message: string;
  shouldBind?: { referrer: string; message: string };
}> {
  const referrer = referrerAddress.trim();

  // 1. 验证地址格式
  if (!isAddress(referrer)) {
    return {
      success: false,
      message: lang === "zh" ? "推荐人地址格式不正确。" : "Invalid referrer address.",
    };
  }

  // 2. 检查是否为自邀请（必须先检查这个，因为自邀请时也需要检查是否已绑定）
  if (referrer.toLowerCase() === userAddress.toLowerCase()) {
    // 如果用户是owner，允许绑定自己
    if (userAddress.toLowerCase() === contractOwner.toLowerCase()) {
      // 检查是否已绑定
      const existingReferrer = await checkReferrerOnChain(provider, userAddress);
      if (existingReferrer) {
        return {
          success: false,
          message:
            lang === "zh"
              ? "推荐人已绑定，无需重复操作。"
              : "Referrer already bound.",
        };
      }
      return {
        success: true,
        message: "",
      };
    }

    // 首先检查用户是否已经绑定过推荐人
    const existingReferrer = await checkReferrerOnChain(provider, userAddress);
    if (existingReferrer) {
      return {
        success: false,
        message:
          lang === "zh"
            ? "推荐人已绑定，无需重复操作。"
            : "Referrer already bound.",
      };
    }

    // 如果用户不是 Owner，自动使用 Owner 作为推荐人
    if (
      contractOwner &&
      isAddress(contractOwner) &&
      contractOwner.toLowerCase() !== userAddress.toLowerCase()
    ) {
      return {
        success: true,
        message: "",
        shouldBind: {
          referrer: contractOwner,
          message:
            lang === "zh"
              ? "检测到自邀请，已自动切换为合约 Owner"
              : "Self-invite detected, switched to contract owner",
        },
      };
    }

    // 否则报错
    return {
      success: false,
      message:
        lang === "zh"
          ? "推荐人不能是当前钱包地址。"
          : "Referrer cannot be your own wallet address.",
    };
  }

  // 3. 检查是否已绑定推荐人（必须先检查，否则合约会拒绝）
  const existingReferrer = await checkReferrerOnChain(provider, userAddress);
  if (existingReferrer) {
    return {
      success: false,
      message:
        lang === "zh"
          ? `推荐人已绑定为 ${existingReferrer.slice(0, 6)}...${existingReferrer.slice(-4)}，无法更改。`
          : `Referrer already bound to ${existingReferrer.slice(0, 6)}...${existingReferrer.slice(-4)}.`,
    };
  }

  return {
    success: true,
    message: "",
  };
}

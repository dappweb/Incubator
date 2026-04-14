import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain, fallback, http } from 'viem';
import {
    CNC_MAINNET_BLOCK_EXPLORER_URL,
    CNC_MAINNET_CHAIN_ID,
    CNC_MAINNET_CHAIN_NAME,
    CNC_MAINNET_NATIVE_CURRENCY,
    CNC_MAINNET_RPC_URLS,
} from './config';

const cncMainnet = defineChain({
  id: CNC_MAINNET_CHAIN_ID,
  name: CNC_MAINNET_CHAIN_NAME,
  nativeCurrency: CNC_MAINNET_NATIVE_CURRENCY,
  rpcUrls: {
    default: { http: CNC_MAINNET_RPC_URLS },
    public: { http: CNC_MAINNET_RPC_URLS },
  },
  blockExplorers: {
    default: {
      name: 'CNC Explorer',
      url: CNC_MAINNET_BLOCK_EXPLORER_URL,
    },
  },
});

const cncMainnetTransport = fallback(
  CNC_MAINNET_RPC_URLS.map((url) =>
    http(url, {
      batch: false,
      retryCount: 2,
      retryDelay: 300,
      timeout: 8_000,
    }),
  ),
  {
    retryCount: 1,
    retryDelay: 200,
  },
);

export const wagmiConfig = getDefaultConfig({
  appName: 'Incubator',
  projectId: import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || '730caccf77e6027ab577fedf9add2c25', // Use a default for testing if not provided
  chains: [cncMainnet],
  transports: {
    [cncMainnet.id]: cncMainnetTransport,
  },
  ssr: false,
});
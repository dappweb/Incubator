import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { bscTestnet } from 'viem/chains';

export const wagmiConfig = getDefaultConfig({
  appName: 'Incubator',
  projectId: import.meta.env.VITE_WALLET_CONNECT_PROJECT_ID || '730caccf77e6027ab577fedf9add2c25', // Use a default for testing if not provided
  chains: [bscTestnet],
  ssr: false,
});
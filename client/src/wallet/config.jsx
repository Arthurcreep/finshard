import { createConfig, http, createStorage } from 'wagmi';
import { bsc, mainnet, arbitrum, base, polygon } from 'wagmi/chains';
import { injected, walletConnect } from '@wagmi/connectors';
import { createWeb3Modal } from '@web3modal/wagmi/react';

const projectIdRaw = import.meta.env.VITE_WC_PROJECT_ID;
const projectId = typeof projectIdRaw === 'string' ? projectIdRaw.trim() : '';
const enableWC = projectId.length > 0;

if (!enableWC) {
  // Не валимся — просто предупреждаем. В проде тоже не падаем.
  console.error('❌ VITE_WC_PROJECT_ID не задан! WalletConnect будет отключён.');
}

const chains = [bsc, mainnet, arbitrum, base, polygon];

export const environment = {
  VITE_USDT: '0x55d398326f99059fF775485246999027B3197955',
  VITE_ECHO: '0xe67e0e2B9Ec606C0f05c4Bcca601DE5b6d33acef',
  USDT_ADDRESS: '0x55d398326f99059fF775485246999027B3197955',
  DCA_CONTRACT_ADDRESS: '0xe67e0e2B9Ec606C0f05c4Bcca601DE5b6d33acef',
  publicClientConfig: {
    [bsc.id]: http('https://bsc-dataseed1.defibit.io/'),
    [mainnet.id]: http('https://ethereum.publicnode.com'),
    [arbitrum.id]: http('https://arbitrum.publicnode.com'),
    [base.id]: http('https://base.publicnode.com'),
    [polygon.id]: http('https://polygon-bor.publicnode.com'),
  },
};

const baseConnectors = [injected({ shimDisconnect: true })];
const wcConnector = enableWC ? [walletConnect({ projectId, showQrModal: true })] : [];

export const wagmiConfig = createConfig({
  chains,
  transports: environment.publicClientConfig,
  connectors: [...baseConnectors, ...wcConnector],
  storage:
    typeof window !== 'undefined'
      ? createStorage({ storage: window.localStorage, key: 'wagmi-bsc-only' })
      : undefined,
});

export const CHAIN_ID = bsc.id;

export function initWeb3Modal() {
  if (!enableWC) {
    // Без projectId модалки WC не будет — это ок.
    return;
  }
  createWeb3Modal({
    wagmiConfig,
    projectId,
    chains: [bsc.id],
    defaultChain: bsc.id,
    enableNetworkView: true,
    allowUnsupportedChain: false,
    enableAnalytics: false,
    enableEIP6963: true,
  });
}

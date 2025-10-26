import { createConfig, http, createStorage } from 'wagmi';
import { bsc, mainnet, arbitrum, base, polygon } from 'wagmi/chains';
import { injected, walletConnect } from '@wagmi/connectors';
import { createWeb3Modal } from '@web3modal/wagmi/react';

const projectId = import.meta.env.VITE_WC_PROJECT_ID;
if (!projectId) {
  console.error('❌ VITE_WC_PROJECT_ID не задан! Проверь .env или GitHub Secrets (WC_PROJECT_ID)');
  throw new Error('Missing VITE_WC_PROJECT_ID');
}
const chains = [bsc, mainnet, arbitrum, base, polygon];

export const environment = {
    VITE_USDT: '0x55d398326f99059fF775485246999027B3197955',
    VITE_ECHO: '0xe67e0e2B9Ec606C0f05c4Bcca601DE5b6d33acef', // Новый адрес контракта
    USDT_ADDRESS: '0x55d398326f99059fF775485246999027B3197955',
    DCA_CONTRACT_ADDRESS: '0xe67e0e2B9Ec606C0f05c4Bcca601DE5b6d33acef', // Новый адрес контракта
    publicClientConfig: {
        [bsc.id]: http('https://bsc-dataseed1.defibit.io/'), // Сменил на более надёжный RPC
        [mainnet.id]: http('https://ethereum.publicnode.com'),
        [arbitrum.id]: http('https://arbitrum.publicnode.com'),
        [base.id]: http('https://base.publicnode.com'),
        [polygon.id]: http('https://polygon-bor.publicnode.com'),
    },
};

export const wagmiConfig = createConfig({
    chains,
    transports: environment.publicClientConfig,
    connectors: [
        injected({ shimDisconnect: true }),
        walletConnect({ projectId, showQrModal: true }),
    ],
    storage: typeof window !== 'undefined'
        ? createStorage({ storage: window.localStorage, key: 'wagmi-bsc-only' })
        : undefined,
});

export const CHAIN_ID = bsc.id;

export function initWeb3Modal() {
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
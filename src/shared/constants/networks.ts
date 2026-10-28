export interface NetworkConfig {
  chainId: number;
  name: string;
  symbol: string;
  rpcs: string[];
  explorer: string;
}

// Built-in networks. Each lists several public RPCs; the wallet falls back to the next one if a request fails.
// User-added networks are stored in chrome.storage.local under "customNetworks" with keys like "custom-<chainId>".
export const NETWORKS: Record<string, NetworkConfig> = {
  SEPOLIA: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    symbol: 'SepoliaETH',
    rpcs: ['https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.gateway.tenderly.co', 'https://rpc.sepolia.ethpandaops.io'],
    explorer: 'https://sepolia.etherscan.io',
  },
  MAINNET: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    symbol: 'ETH',
    rpcs: ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org', 'https://1rpc.io/eth'],
    explorer: 'https://etherscan.io',
  },
};

export const DEFAULT_NETWORK = 'SEPOLIA';
export const CHAIN_IDS = {
  MAINNET: '0x1',
  SEPOLIA: '0xaa36a7',
};

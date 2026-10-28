export interface WalletAccount {
  address: string;
  index: number;
  publicKey?: string;
}

export interface AccountInfo {
  address: string;
  name: string;
  type: 'hd' | 'imported';
}

export interface EncryptedVault {
  salt: string;
  iv: string;
  ciphertext: string;
}

export interface NetworkInfo {
  key: string;
  name: string;
  chainId: number;
  symbol: string;
  explorer: string;
  rpcUrl: string;
  custom: boolean;
}

export interface NewNetwork {
  name: string;
  rpcUrl: string;
  chainId: string | number;
  symbol: string;
  explorer?: string;
}

export type GasSpeed = 'low' | 'market' | 'aggressive';

export interface FeeEstimate {
  speed: GasSpeed;
  gasLimit: string;
  gasPriceGwei: string;
  estimatedFee: string;
  maxFee: string;
  symbol: string;
  // Set when the account can't cover value + gas (the tx would be rejected by the node)
  balanceError?: string;
}

export interface WalletState {
  hasVault: boolean;
  unlocked: boolean;
  accounts: AccountInfo[];
  selectedAddress: string | null;
  network: NetworkInfo;
  networks: NetworkInfo[];
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  name?: string;
  balance?: string;
}

export interface NftInfo {
  contract: string;
  tokenId: string;
  standard: 'ERC721' | 'ERC1155';
  name?: string;
  collection?: string;
  image?: string;
  description?: string;
  // ERC-1155 only: how many copies the account holds
  balance?: string;
}

// What the popup's Send flow is sending
export type SendAsset =
  | { type: 'native' }
  | { type: 'token'; address: string }
  | { type: 'nft'; contract: string; tokenId: string };

export interface SendRequest {
  to: string;
  asset: SendAsset;
  // Native/token amount in display units, or NFT quantity (always "1" for ERC-721)
  amount: string;
  // Native only: send the whole balance minus gas
  max?: boolean;
  speed?: GasSpeed;
}

export interface AddressInfo {
  isContract: boolean;
  isOwnAccount: boolean;
  // Set when the address is a token contract the user imported
  tokenSymbol?: string;
}

export interface ActivityItem {
  hash: string;
  to: string | null;
  amount: string;
  symbol: string;
  origin: string;
  time: number;
  // replaced = sped up (the faster copy is shown instead), dropped = another tx used its nonce
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled' | 'replaced' | 'dropped';
  // Set for NFT sends so the NFT can be dropped from the list once confirmed
  nft?: { contract: string; tokenId: string; standard: 'ERC721' | 'ERC1155' };
  // Needed to speed up or cancel the tx while it is pending
  nonce?: number;
  tx?: StoredTx;
  kind?: 'speedup' | 'cancel';
  // Hash of the pending tx this one replaces
  replaces?: string;
}

// Transaction fields as decimal strings (bigints don't survive chrome.storage)
export interface StoredTx {
  to: string | null;
  value: string;
  data: string;
  gasLimit: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
}

export interface Settings {
  // 0 = never
  autoLockMinutes: number;
}

export const DEFAULT_SETTINGS: Settings = { autoLockMinutes: 15 };

export type ApprovalType =
  | "unlock"
  | "connect"
  | "personal_sign"
  | "eth_signTypedData_v4"
  | "eth_sendTransaction"
  | "wallet_addEthereumChain";

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  origin: string;
  params: any[];
}

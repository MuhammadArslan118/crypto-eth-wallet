// EIP-1193 methods a dapp can call with provider.request({ method, params }).
// Exposed to pages as window.myWallet.supportedMethods.
export const WALLET_METHODS = [
  'eth_requestAccounts',
  'eth_accounts',
  'eth_chainId',
  'net_version',
  'personal_sign',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  'wallet_requestPermissions',
  'wallet_getPermissions',
  'wallet_revokePermissions',
];

// Read-only methods proxied straight to the RPC node
export const READ_METHODS = [
  'eth_blockNumber', 'eth_call', 'eth_estimateGas', 'eth_feeHistory', 'eth_gasPrice', 'eth_getBalance',
  'eth_getBlockByHash', 'eth_getBlockByNumber', 'eth_getCode', 'eth_getLogs', 'eth_getStorageAt',
  'eth_getTransactionByHash', 'eth_getTransactionCount', 'eth_getTransactionReceipt',
  'eth_maxPriorityFeePerGas', 'web3_clientVersion',
];

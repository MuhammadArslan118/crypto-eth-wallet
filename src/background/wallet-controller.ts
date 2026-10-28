import { HDWallet } from "./wallet/hd-wallet";
import { Keystore } from "./keystore/keystore";
import { RpcProvider } from "./rpc/provider";
import { ApprovalManager } from "./approvals/approval-manager";
import { ERR, RpcError, friendlyMessage } from "./errors";
import * as assets from "./assets";
import { DEFAULT_NETWORK, NETWORKS, NetworkConfig } from "../shared/constants/networks";
import { READ_METHODS } from "../shared/constants/methods";
import {
  AccountInfo, ActivityItem, AddressInfo, ApprovalType, FeeEstimate, NetworkInfo, NewNetwork, SendAsset, SendRequest, WalletState,
} from "../shared/types";
import { ethers } from "ethers";

const READ_METHOD_SET = new Set(READ_METHODS);

type WalletEvent = "accountsChanged" | "chainChanged";
type EventListener = (event: WalletEvent, data?: unknown) => void;

// What the encrypted vault holds. Older vaults stored the bare mnemonic string.
interface Secrets {
  mnemonic: string;
  importedKeys: string[];
}

interface Account extends AccountInfo {
  privateKey: string;
}

function parseSecrets(plain: string): Secrets {
  try {
    const data = JSON.parse(plain);
    if (typeof data?.mnemonic === "string") return { mnemonic: data.mnemonic, importedKeys: data.importedKeys ?? [] };
  } catch {}
  return { mnemonic: plain, importedKeys: [] };
}

function parseChainId(value: string | number): number {
  const id = typeof value === "number" ? value : value.trim().startsWith("0x") ? parseInt(value, 16) : parseInt(value, 10);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid chain ID");
  return id;
}

export class WalletController {
  // Decrypted secrets live in memory and in chrome.storage.session (RAM only, cleared when the
  // browser closes) so the wallet stays unlocked when Chrome restarts the MV3 service worker.
  private secrets: Secrets | null = null;
  private accounts: Account[] = [];
  private hdAccountCount = 1;
  private selected: string | null = null;
  private networkKey = DEFAULT_NETWORK;
  private customNetworks: Record<string, NetworkConfig> = {};
  private rpc = new RpcProvider(NETWORKS[DEFAULT_NETWORK].rpcs, NETWORKS[DEFAULT_NETWORK].chainId);
  private connectedOrigins = new Set<string>();
  private approvals = new ApprovalManager();
  private listeners = new Set<EventListener>();
  private loaded: Promise<void> | null = null;
  private hasVaultCached = false;

  ensureLoaded() {
    return (this.loaded ??= this.load());
  }

  private async load() {
    const local = await chrome.storage.local.get([
      "connectedOrigins", "network", "customNetworks", "hdAccountCount", "selectedAddress",
    ]);
    this.connectedOrigins = new Set(local.connectedOrigins ?? []);
    this.hdAccountCount = local.hdAccountCount ?? 1;
    this.selected = local.selectedAddress ?? null;
    this.customNetworks = local.customNetworks ?? {};
    if (local.network && this.allNetworks()[local.network]) this.useNetwork(local.network);
    const session = await chrome.storage.session.get(["secrets", "mnemonic"]);
    if (session.secrets) this.setSecrets(session.secrets);
    else if (session.mnemonic) this.setSecrets({ mnemonic: session.mnemonic, importedKeys: [] });
  }

  onEvent(listener: EventListener) {
    this.listeners.add(listener);
  }

  private emit(event: WalletEvent, data?: unknown) {
    this.listeners.forEach((l) => l(event, data));
  }

  // ---------- popup API ----------

  getState(): WalletState {
    return {
      hasVault: this.hasVaultCached,
      unlocked: this.isUnlocked(),
      accounts: this.accounts.map(({ address, name, type }) => ({ address, name, type })),
      selectedAddress: this.selectedAddress(),
      network: this.networkInfo(this.networkKey),
      networks: Object.keys(this.allNetworks()).map((k) => this.networkInfo(k)),
    };
  }

  async refreshHasVault() {
    const stored = await chrome.storage.local.get("vault");
    this.hasVaultCached = !!stored.vault;
  }

  async createWallet(password: string) {
    const mnemonic = HDWallet.generateMnemonic(128);
    await this.saveNewVault(mnemonic, password);
    // Returned once so the popup can show it for backup
    return { mnemonic };
  }

  async importWallet(rawMnemonic: string, password: string) {
    const mnemonic = rawMnemonic.trim().toLowerCase().split(/\s+/).join(" ");
    if (!HDWallet.validateMnemonic(mnemonic)) throw new Error("Invalid Secret Recovery Phrase");
    await this.saveNewVault(mnemonic, password);
  }

  private async saveNewVault(mnemonic: string, password: string) {
    if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
    // A new/imported wallet starts with one account and no connected sites
    this.connectedOrigins.clear();
    this.hdAccountCount = 1;
    this.selected = null;
    await chrome.storage.local.set({ connectedOrigins: [], hdAccountCount: 1, selectedAddress: null });
    await this.persistSecrets({ mnemonic, importedKeys: [] }, password);
    this.hasVaultCached = true;
    this.emit("accountsChanged");
  }

  private async persistSecrets(secrets: Secrets, password: string) {
    const vault = await Keystore.encrypt(JSON.stringify(secrets), password);
    await chrome.storage.local.set({ vault: JSON.stringify(vault) });
    await chrome.storage.session.set({ secrets });
    this.setSecrets(secrets);
  }

  private async decryptVault(password: string): Promise<Secrets> {
    const stored = await chrome.storage.local.get("vault");
    if (!stored.vault) throw new Error("No wallet found");
    try {
      return parseSecrets(await Keystore.decrypt(JSON.parse(stored.vault), password));
    } catch {
      throw new Error("Incorrect password");
    }
  }

  async unlock(password: string) {
    const secrets = await this.decryptVault(password);
    if (!HDWallet.validateMnemonic(secrets.mnemonic)) throw new Error("Invalid mnemonic");
    await chrome.storage.session.set({ secrets });
    this.setSecrets(secrets);
    this.emit("accountsChanged");
  }

  async lock() {
    this.secrets = null;
    this.accounts = [];
    await chrome.storage.session.remove(["secrets", "mnemonic"]);
    this.emit("accountsChanged");
  }

  private setSecrets(secrets: Secrets) {
    this.secrets = secrets;
    const hd = HDWallet.deriveAccounts(secrets.mnemonic, this.hdAccountCount).map((a, i) => ({
      address: a.address,
      privateKey: a.privateKey,
      name: `Account ${i + 1}`,
      type: "hd" as const,
    }));
    const imported = secrets.importedKeys.map((key, i) => ({
      address: new ethers.Wallet(key).address,
      privateKey: key,
      name: `Imported ${i + 1}`,
      type: "imported" as const,
    }));
    this.accounts = [...hd, ...imported];
    if (!this.accounts.some((a) => a.address === this.selected)) this.selected = this.accounts[0]?.address ?? null;
  }

  async addAccount() {
    if (!this.secrets) throw new Error("Wallet locked");
    this.hdAccountCount++;
    await chrome.storage.local.set({ hdAccountCount: this.hdAccountCount });
    this.setSecrets(this.secrets);
    await this.selectAccount(this.accounts.filter((a) => a.type === "hd").at(-1)!.address);
  }

  async importAccount(rawKey: string, password: string) {
    let key = rawKey.trim();
    if (!key.startsWith("0x")) key = "0x" + key;
    let address: string;
    try {
      address = new ethers.Wallet(key).address;
    } catch {
      throw new Error("Invalid private key");
    }
    if (this.accounts.some((a) => a.address === address)) throw new Error("This account is already in your wallet");

    // Re-encrypting the vault needs the password
    const secrets = await this.decryptVault(password);
    secrets.importedKeys.push(key);
    await this.persistSecrets(secrets, password);
    await this.selectAccount(address);
  }

  async selectAccount(address: string) {
    if (!this.accounts.some((a) => a.address === address)) throw new Error("Unknown account");
    this.selected = address;
    await chrome.storage.local.set({ selectedAddress: address });
    this.emit("accountsChanged");
  }

  async getBalance() {
    return this.rpc.getBalance(this.requireSelected());
  }

  // ---------- networks ----------

  private allNetworks(): Record<string, NetworkConfig> {
    return { ...NETWORKS, ...this.customNetworks };
  }

  private network(): NetworkConfig {
    return this.allNetworks()[this.networkKey];
  }

  private findNetworkByChainId(chainId: string | number | undefined) {
    if (chainId === undefined) return undefined;
    const id = Number(chainId);
    return Object.entries(this.allNetworks()).find(([, n]) => n.chainId === id)?.[0];
  }

  async switchNetwork(key: string) {
    if (!this.allNetworks()[key]) throw new Error("Unknown network");
    if (key === this.networkKey) return;
    this.useNetwork(key);
    await chrome.storage.local.set({ network: key });
    this.emit("chainChanged", this.chainIdHex());
  }

  private useNetwork(key: string) {
    const network = this.allNetworks()[key];
    this.networkKey = key;
    this.rpc = new RpcProvider(network.rpcs, network.chainId);
  }

  async addNetwork(input: NewNetwork) {
    const chainId = parseChainId(input.chainId);
    const name = input.name?.trim();
    const symbol = input.symbol?.trim();
    const rpcUrl = input.rpcUrl?.trim();
    if (!name) throw new Error("Network name is required");
    if (!symbol) throw new Error("Currency symbol is required");
    if (!/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(rpcUrl ?? "")) {
      throw new Error("RPC URL must start with https:// (or http://localhost for a local node)");
    }
    if (this.findNetworkByChainId(chainId)) throw new Error(`A network with chain ID ${chainId} already exists`);

    // Make sure the RPC is reachable and really serves this chain
    let remoteChainId: number;
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
        signal: AbortSignal.timeout(10000),
      });
      remoteChainId = Number((await res.json()).result);
    } catch {
      throw new Error("Could not reach the RPC URL");
    }
    if (remoteChainId !== chainId) throw new Error(`RPC returned chain ID ${remoteChainId}, not ${chainId}`);

    const key = `custom-${chainId}`;
    this.customNetworks[key] = {
      chainId,
      name,
      symbol,
      rpcs: [rpcUrl],
      explorer: (input.explorer ?? "").trim().replace(/\/+$/, ""),
    };
    await chrome.storage.local.set({ customNetworks: this.customNetworks });
    return key;
  }

  async removeNetwork(key: string) {
    if (!this.customNetworks[key]) throw new Error("Only custom networks can be removed");
    if (key === this.networkKey) await this.switchNetwork(DEFAULT_NETWORK);
    delete this.customNetworks[key];
    await chrome.storage.local.set({ customNetworks: this.customNetworks });
  }

  // ---------- sending & gas ----------

  // Validates a Send-flow request and turns it into a transaction. Throws user-facing errors.
  private async prepareSend(req: SendRequest) {
    const to = req.to?.trim();
    if (!to || !ethers.isAddress(to)) throw new Error("Invalid recipient address");
    const ctx = this.assetContext();
    const asset = req.asset;

    if (asset.type === "token") {
      const { tx, token } = await assets.buildTokenTransfer(ctx, asset.address, to, req.amount);
      return { tx, display: { to, amount: req.amount, symbol: token.symbol } };
    }

    if (asset.type === "nft") {
      const { tx, nft, quantity } = await assets.buildNftTransfer(ctx, asset.contract, asset.tokenId, to, req.amount ?? "1");
      return {
        tx,
        display: { to, amount: quantity, symbol: nft.name ?? `#${nft.tokenId}` },
        nft: { contract: nft.contract, tokenId: nft.tokenId, standard: nft.standard },
      };
    }

    const symbol = this.network().symbol;
    const value = assets.parseAmount(req.amount, 18, symbol);
    const balance = await this.rpc.run((p) => p.getBalance(ctx.owner));
    if (value > balance) throw new Error(`Insufficient funds: you have ${ethers.formatEther(balance)} ${symbol}`);
    return { tx: { to, value } as ethers.TransactionRequest, display: undefined };
  }

  // Estimates gas and checks the account can pay value + gas, like MetaMask's "Insufficient funds for gas"
  async estimateFee(tx: ethers.TransactionRequest): Promise<FeeEstimate> {
    const from = this.requireSelected();
    const symbol = this.network().symbol;
    const [gasLimit, fee, balance] = await Promise.all([
      tx.gasLimit ? Promise.resolve(BigInt(tx.gasLimit)) : this.rpc.run((p) => p.estimateGas({ ...tx, from })),
      this.rpc.run((p) => p.getFeeData()),
      this.rpc.run((p) => p.getBalance(from)),
    ]);
    const maxPerGas = fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
    const likelyPerGas = fee.gasPrice ?? maxPerGas;
    const value = tx.value ? BigInt(tx.value) : 0n;
    const needed = value + gasLimit * likelyPerGas;

    let balanceError: string | undefined;
    if (needed > balance) {
      balanceError = value > 0n
        ? `Insufficient funds: you need ${ethers.formatEther(needed)} ${symbol} (amount + gas) but have ${ethers.formatEther(balance)}.`
        : `Insufficient ${symbol} for gas: you need ${ethers.formatEther(needed)} ${symbol} but have ${ethers.formatEther(balance)}.`;
    }

    return {
      gasLimit: gasLimit.toString(),
      gasPriceGwei: ethers.formatUnits(likelyPerGas, "gwei"),
      estimatedFee: ethers.formatEther(gasLimit * likelyPerGas),
      maxFee: ethers.formatEther(gasLimit * maxPerGas),
      symbol,
      balanceError,
    };
  }

  async estimateSend(req: SendRequest) {
    if (req.max && req.asset.type === "native") {
      const { value, gasLimit } = await this.maxNative(req.to);
      if (value === 0n) throw new Error(`Insufficient ${this.network().symbol} to cover the gas fee`);
      return this.estimateFee({ to: req.to, value, gasLimit });
    }
    const { tx } = await this.prepareSend(req);
    return this.estimateFee(tx);
  }

  async estimateApprovalTx(id: string) {
    const approval = this.approvals.get(id);
    const tx = approval?.params[0];
    if (!tx) throw new Error("Request not found");
    return this.estimateFee({ to: tx.to, value: tx.value, data: tx.data ?? tx.input, gasLimit: tx.gas ?? tx.gasLimit });
  }

  // Native max = balance minus the worst-case gas fee, so the tx can't fail for lack of gas money
  private async maxNative(to?: string) {
    const from = this.requireSelected();
    const target = to && ethers.isAddress(to) ? to : from;
    const [balance, gasLimit, fee] = await Promise.all([
      this.rpc.run((p) => p.getBalance(from)),
      this.rpc.run((p) => p.estimateGas({ from, to: target, value: 0n })),
      this.rpc.run((p) => p.getFeeData()),
    ]);
    const feeFields: ethers.TransactionRequest =
      fee.maxFeePerGas != null
        ? { maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 0n }
        : { gasPrice: fee.gasPrice ?? 0n };
    const value = balance - gasLimit * (fee.maxFeePerGas ?? fee.gasPrice ?? 0n);
    return { value: value > 0n ? value : 0n, gasLimit, feeFields };
  }

  async getMaxAmount(asset: SendAsset, to?: string) {
    if (asset.type === "token") {
      const token = (await assets.getTokens(this.assetContext())).find((t) => t.address === asset.address);
      return token?.balance ?? "0";
    }
    if (asset.type === "nft") {
      const nft = (await assets.getNfts(this.assetContext())).find((n) => n.contract === asset.contract && n.tokenId === asset.tokenId);
      return nft?.balance ?? "1";
    }
    return ethers.formatEther((await this.maxNative(to)).value);
  }

  async sendFromPopup(req: SendRequest) {
    if (req.max && req.asset.type === "native") {
      if (!ethers.isAddress(req.to)) throw new Error("Invalid recipient address");
      // Recompute at send time and pin the gas fields so the whole balance minus fee goes out
      const { value, gasLimit, feeFields } = await this.maxNative(req.to);
      if (value === 0n) throw new Error(`Insufficient ${this.network().symbol} to cover the gas fee`);
      return this.sendAndRecord({ to: req.to, value, gasLimit, ...feeFields }, "wallet");
    }
    const { tx, display, nft } = await this.prepareSend(req);
    // Fail early with a clear message instead of a raw node error
    const fee = await this.estimateFee(tx);
    if (fee.balanceError) throw new Error(fee.balanceError);
    return this.sendAndRecord(tx, "wallet", display, nft);
  }

  async getAddressInfo(address: string): Promise<AddressInfo> {
    if (!ethers.isAddress(address)) throw new Error("Invalid address");
    const checksum = ethers.getAddress(address);
    const [code, tokens] = await Promise.all([
      this.rpc.run((p) => p.getCode(checksum)),
      assets.getTokens(this.assetContext()),
    ]);
    return {
      isContract: code !== "0x",
      isOwnAccount: this.accounts.some((a) => a.address === checksum),
      tokenSymbol: tokens.find((t) => t.address === checksum)?.symbol,
    };
  }

  // Signs + broadcasts, then records the tx in the Activity tab
  private async sendAndRecord(
    tx: ethers.TransactionRequest,
    origin: string,
    display?: { to: string; amount: string; symbol: string },
    nft?: ActivityItem["nft"]
  ) {
    const wallet = this.signer();
    let response: ethers.TransactionResponse;
    try {
      response = await this.rpc.run((p) => wallet.connect(p).sendTransaction(tx));
    } catch (e) {
      throw new Error(friendlyMessage(e));
    }
    await assets.addActivity(this.assetContext(), {
      hash: response.hash,
      to: display?.to ?? response.to,
      amount: display?.amount ?? ethers.formatEther(response.value),
      symbol: display?.symbol ?? this.network().symbol,
      origin,
      time: Date.now(),
      status: "pending",
      nft,
    });
    return response.hash;
  }

  assetContext(): assets.AssetContext {
    return { rpc: this.rpc, chainId: this.network().chainId, owner: this.requireSelected() };
  }

  getApproval(id: string) {
    return this.approvals.get(id);
  }

  resolveApproval(id: string, approved: boolean) {
    this.approvals.resolve(id, approved);
  }

  getConnectedOrigins() {
    return Array.from(this.connectedOrigins);
  }

  async disconnect(origin: string) {
    this.connectedOrigins.delete(origin);
    await chrome.storage.local.set({ connectedOrigins: this.getConnectedOrigins() });
    this.emit("accountsChanged");
  }

  // ---------- dapp (EIP-1193) API ----------

  async handleRequest(method: string, params: any[], origin: string) {
    switch (method) {
      case "eth_chainId":
        return this.chainIdHex();

      case "net_version":
        return String(this.network().chainId);

      case "eth_accounts":
        return this.permittedAccounts(origin);

      case "eth_requestAccounts":
        return this.requestAccounts(origin);

      case "wallet_requestPermissions":
        await this.requestAccounts(origin);
        return this.permissions(origin);

      case "wallet_getPermissions":
        return this.permissions(origin);

      case "wallet_revokePermissions":
        await this.disconnect(origin);
        return null;

      case "wallet_switchEthereumChain": {
        const key = this.findNetworkByChainId(params[0]?.chainId);
        if (!key) throw new RpcError(ERR.UNRECOGNIZED_CHAIN, `Unrecognized chain ID ${params[0]?.chainId}. Try wallet_addEthereumChain.`);
        await this.switchNetwork(key);
        return null;
      }

      case "wallet_addEthereumChain": {
        const chain = params[0] ?? {};
        // Already known: nothing to add
        if (this.findNetworkByChainId(chain.chainId)) return null;
        await this.requireApproval("wallet_addEthereumChain", origin, [chain]);
        await this.addNetwork({
          name: chain.chainName,
          rpcUrl: chain.rpcUrls?.[0],
          chainId: chain.chainId,
          symbol: chain.nativeCurrency?.symbol,
          explorer: chain.blockExplorerUrls?.[0],
        }).catch((e) => {
          throw new RpcError(ERR.INVALID_PARAMS, e.message);
        });
        return null;
      }

      case "personal_sign": {
        let [message, address] = params;
        // Some dapps send [address, message]
        if (ethers.isAddress(message) && !ethers.isAddress(address)) [message, address] = [address, message];
        this.assertAuthorized(origin, address);
        await this.requireApproval("personal_sign", origin, [message, address]);
        const bytes = ethers.isHexString(message) ? ethers.getBytes(message) : message;
        return this.signer().signMessage(bytes);
      }

      case "eth_signTypedData_v4": {
        const [address, json] = params;
        this.assertAuthorized(origin, address);
        const typedData = typeof json === "string" ? JSON.parse(json) : json;
        await this.requireApproval("eth_signTypedData_v4", origin, [address, typedData]);
        const { EIP712Domain, ...types } = typedData.types;
        return this.signer().signTypedData(typedData.domain, types, typedData.message);
      }

      case "eth_sendTransaction": {
        const tx = params[0] ?? {};
        this.assertAuthorized(origin, tx.from);
        await this.requireApproval("eth_sendTransaction", origin, [tx]);
        return this.sendAndRecord(
          {
            to: tx.to,
            value: tx.value,
            data: tx.data ?? tx.input,
            gasLimit: tx.gas ?? tx.gasLimit,
            gasPrice: tx.gasPrice,
            maxFeePerGas: tx.maxFeePerGas,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
            nonce: tx.nonce !== undefined ? Number(tx.nonce) : undefined,
          },
          origin
        );
      }

      default:
        if (READ_METHOD_SET.has(method)) return this.rpc.send(method, params);
        throw new RpcError(ERR.UNSUPPORTED_METHOD, `Method ${method} not supported`);
    }
  }

  permittedAccounts(origin: string): string[] {
    const address = this.selectedAddress();
    return address && this.connectedOrigins.has(origin) ? [address] : [];
  }

  private async requestAccounts(origin: string) {
    if (this.connectedOrigins.has(origin)) {
      // Already connected: only need the user to unlock
      if (!this.isUnlocked()) await this.requireApproval("unlock", origin);
    } else {
      await this.requireApproval("connect", origin);
      this.connectedOrigins.add(origin);
      await chrome.storage.local.set({ connectedOrigins: this.getConnectedOrigins() });
      this.emit("accountsChanged");
    }
    return this.permittedAccounts(origin);
  }

  private permissions(origin: string) {
    return this.connectedOrigins.has(origin)
      ? [{ parentCapability: "eth_accounts", invoker: origin, caveats: [] }]
      : [];
  }

  private async requireApproval(type: ApprovalType, origin: string, params: any[] = []) {
    const approved = await this.approvals.request(type, origin, params);
    if (!approved) throw new RpcError(ERR.USER_REJECTED, "User rejected the request.");
    if (!this.isUnlocked()) throw new RpcError(ERR.UNAUTHORIZED, "Wallet is locked");
  }

  private assertAuthorized(origin: string, address?: string) {
    if (!this.connectedOrigins.has(origin)) {
      throw new RpcError(ERR.UNAUTHORIZED, "Site is not connected. Call eth_requestAccounts first.");
    }
    const selected = this.selectedAddress();
    if (address && selected && address.toLowerCase() !== selected.toLowerCase()) {
      throw new RpcError(ERR.UNAUTHORIZED, "Requested account is not the selected account");
    }
  }

  private signer() {
    const account = this.accounts.find((a) => a.address === this.selected);
    if (!this.secrets || !account) throw new RpcError(ERR.UNAUTHORIZED, "Wallet is locked");
    return new ethers.Wallet(account.privateKey, this.rpc.provider);
  }

  private selectedAddress() {
    return this.isUnlocked() ? this.selected : null;
  }

  private requireSelected() {
    const address = this.selectedAddress();
    if (!address) throw new Error("Wallet locked");
    return address;
  }

  private chainIdHex() {
    return "0x" + this.network().chainId.toString(16);
  }

  private networkInfo(key: string): NetworkInfo {
    const { name, chainId, symbol, explorer, rpcs } = this.allNetworks()[key];
    return { key, name, chainId, symbol, explorer, rpcUrl: rpcs[0], custom: key in this.customNetworks };
  }

  isUnlocked() {
    return this.secrets !== null;
  }

  getAccounts() {
    return this.accounts;
  }
}

export const walletController = new WalletController();

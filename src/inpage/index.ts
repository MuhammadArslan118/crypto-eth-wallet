// Runs in the page's MAIN world. Exposes an EIP-1193 provider as window.ethereum
// and announces it via EIP-6963 so dapps can discover it alongside other wallets.

import { READ_METHODS, WALLET_METHODS } from "../shared/constants/methods";

const TO_CONTENT = "mywallet-content";
const TO_INPAGE = "mywallet-inpage";

const ICON =
  "data:image/svg+xml;base64," +
  btoa(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6c5ce7"/><stop offset="1" stop-color="#00b894"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><path d="M18 24h28v20H18z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><circle cx="40" cy="34" r="3" fill="#fff"/></svg>'
  );

type Handler = (...args: any[]) => void;

interface RequestArguments {
  method: string;
  params?: unknown[] | Record<string, unknown>;
}

class ProviderRpcError extends Error {
  constructor(public code: number, message: string, public data?: unknown) {
    super(message);
  }
}

class MyWalletProvider {
  readonly isMyWallet = true;
  readonly supportedMethods = [...WALLET_METHODS, ...READ_METHODS];
  chainId: string | null = null;
  selectedAddress: string | null = null;

  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private handlers = new Map<string, Set<Handler>>();

  constructor() {
    window.addEventListener("message", (event) => {
      if (event.source !== window || event.data?.target !== TO_INPAGE) return;
      const msg = event.data;
      if (msg.event) {
        this.handleEvent(msg.event, msg.data);
        return;
      }
      const req = this.pending.get(msg.id);
      if (!req) return;
      this.pending.delete(msg.id);
      if (msg.error) req.reject(new ProviderRpcError(msg.error.code, msg.error.message));
      else req.resolve(msg.result);
    });

    this.request({ method: "eth_chainId" })
      .then((chainId) => {
        this.chainId = chainId;
        this.emit("connect", { chainId });
      })
      .catch(() => {});
    this.request({ method: "eth_accounts" })
      .then((accounts: string[]) => (this.selectedAddress = accounts[0] ?? null))
      .catch(() => {});
  }

  request({ method, params }: RequestArguments): Promise<any> {
    if (typeof method !== "string") {
      return Promise.reject(new ProviderRpcError(-32602, "Invalid request: method must be a string"));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      window.postMessage({ target: TO_CONTENT, id, method, params: params ?? [] }, window.location.origin === "null" ? "*" : window.location.origin);
    }).then((result) => {
      if (method === "eth_requestAccounts") this.handleAccounts(result as string[]);
      return result;
    });
  }

  private handleEvent(event: string, data: any) {
    if (event === "accountsChanged") this.handleAccounts(data);
    else if (event === "chainChanged" && data !== this.chainId) {
      this.chainId = data;
      this.emit("chainChanged", data);
    }
  }

  private handleAccounts(accounts: string[]) {
    const next = accounts[0] ?? null;
    if (next === this.selectedAddress) return;
    this.selectedAddress = next;
    this.emit("accountsChanged", accounts);
  }

  isConnected() {
    return true;
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return this;
  }

  once(event: string, handler: Handler) {
    const wrapped: Handler = (...args) => {
      this.removeListener(event, wrapped);
      handler(...args);
    };
    return this.on(event, wrapped);
  }

  removeListener(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
    return this;
  }

  off(event: string, handler: Handler) {
    return this.removeListener(event, handler);
  }

  removeAllListeners(event?: string) {
    if (event) this.handlers.delete(event);
    else this.handlers.clear();
    return this;
  }

  private emit(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.forEach((h) => {
      try {
        h(...args);
      } catch (e) {
        console.error(e);
      }
    });
  }

  // Legacy APIs still used by some older dapps
  enable() {
    return this.request({ method: "eth_requestAccounts" });
  }

  sendAsync(payload: { id?: number; method: string; params?: unknown[] }, callback: (err: any, res?: any) => void) {
    this.request(payload).then(
      (result) => callback(null, { id: payload.id, jsonrpc: "2.0", result }),
      (error) => callback(error)
    );
  }

  send(methodOrPayload: any, paramsOrCallback?: any) {
    if (typeof methodOrPayload === "string") return this.request({ method: methodOrPayload, params: paramsOrCallback });
    return this.sendAsync(methodOrPayload, paramsOrCallback);
  }
}

function uuid() {
  // crypto.randomUUID is only available on secure (https) pages
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

(() => {
  const provider = new MyWalletProvider();
  const info = Object.freeze({ uuid: uuid(), name: "My Wallet", icon: ICON, rdns: "com.example.mywallet" });

  const announce = () =>
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();

  // Always reachable as window.myWallet, even when another wallet owns window.ethereum.
  // Don't overwrite another wallet's window.ethereum; EIP-6963 still makes us discoverable
  const w = window as any;
  w.myWallet = provider;
  if (!w.ethereum) {
    w.ethereum = provider;
    window.dispatchEvent(new Event("ethereum#initialized"));
  }
})();

export {};

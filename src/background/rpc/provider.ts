import { ethers } from "ethers";

// Errors that mean "this endpoint is down / refusing us", as opposed to a real JSON-RPC error
// like a revert or invalid params, which would fail the same way on every endpoint.
function isEndpointError(e: any) {
  return ["SERVER_ERROR", "TIMEOUT", "NETWORK_ERROR"].includes(e?.code);
}

export class RpcProvider {
  private providers: ethers.JsonRpcProvider[];
  private active = 0;

  constructor(rpcUrls: string[], chainId: number) {
    // staticNetwork skips the eth_chainId probe on every request; batchMaxCount 1 because free RPCs often reject batches
    const network = ethers.Network.from(chainId);
    this.providers = rpcUrls.map(
      (url) => new ethers.JsonRpcProvider(url, network, { staticNetwork: network, batchMaxCount: 1 })
    );
  }

  get provider(): ethers.JsonRpcProvider {
    return this.providers[this.active];
  }

  // Runs fn against the last healthy endpoint, falling back to the others on endpoint failures
  async run<T>(fn: (provider: ethers.JsonRpcProvider) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < this.providers.length; i++) {
      const idx = (this.active + i) % this.providers.length;
      try {
        const result = await fn(this.providers[idx]);
        this.active = idx;
        return result;
      } catch (e) {
        if (!isEndpointError(e)) throw e;
        console.warn("RPC endpoint failed, trying next", e);
        lastError = e;
      }
    }
    throw lastError;
  }

  async getBalance(address: string): Promise<string> {
    const balance = await this.run((p) => p.getBalance(address));
    return ethers.formatEther(balance);
  }

  getTransactionReceipt(hash: string) {
    return this.run((p) => p.getTransactionReceipt(hash));
  }

  // Forward a raw read-only JSON-RPC call to the node
  send(method: string, params: any[]): Promise<any> {
    return this.run((p) => p.send(method, params));
  }
}

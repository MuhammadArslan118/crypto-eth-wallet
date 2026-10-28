// EIP-1193 / JSON-RPC error codes
export const ERR = {
  USER_REJECTED: 4001,
  UNAUTHORIZED: 4100,
  UNSUPPORTED_METHOD: 4200,
  UNRECOGNIZED_CHAIN: 4902,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
};

export class RpcError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

// Turns raw ethers / node errors into messages a user can act on.
export function friendlyMessage(e: any): string {
  if (e instanceof RpcError) return e.message;
  const code = e?.code;
  const raw = String(e?.shortMessage ?? e?.message ?? e ?? "");
  const text = raw.toLowerCase();

  if (code === "INSUFFICIENT_FUNDS" || text.includes("insufficient funds")) {
    return "Insufficient funds: you don't have enough to cover the amount plus the gas fee.";
  }
  if (code === "NONCE_EXPIRED" || text.includes("nonce too low")) {
    return "Nonce too low: a transaction with this nonce was already sent. Wait a moment and try again.";
  }
  if (code === "REPLACEMENT_UNDERPRICED" || text.includes("replacement transaction underpriced")) {
    return "A pending transaction is blocking this one. Wait for it to confirm, then try again.";
  }
  if (code === "CALL_EXCEPTION" || text.includes("execution reverted")) {
    const reason = e?.reason ?? e?.revert?.args?.[0];
    return `This transaction is expected to fail${reason ? `: ${reason}` : "."} Check the amount, recipient and your balance.`;
  }
  if (text.includes("intrinsic gas too low") || text.includes("gas required exceeds allowance")) {
    return "The gas limit is too low for this transaction.";
  }
  if (["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT"].includes(code)) {
    return "Can't reach the network right now. Check your connection or switch networks and try again.";
  }
  if (code === "INVALID_ARGUMENT" || code === "NUMERIC_FAULT") {
    return `Invalid input: ${e?.argument ? `${e.argument} ` : ""}${e?.shortMessage ?? raw}`;
  }
  return raw || "Something went wrong.";
}

export function toRpcError(e: any): { code: number; message: string } {
  if (e instanceof RpcError) return { code: e.code, message: e.message };
  return { code: ERR.INTERNAL, message: friendlyMessage(e) };
}

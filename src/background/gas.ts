import { GasSpeed } from "../shared/types";

// Pure fee maths, kept free of chrome/ethers providers so it can be unit tested.

export interface MarketFees {
  // Null on chains without EIP-1559 (legacy gasPrice only)
  baseFee: bigint | null;
  priorityFee: bigint;
  gasPrice: bigint;
}

export interface FeeFields {
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
}

export interface SpeedFees {
  fields: FeeFields;
  // What the tx will most likely pay per gas, and the most it can pay
  likelyPerGas: bigint;
  maxPerGas: bigint;
}

// Percentages applied to the network's suggestion, like MetaMask's Low / Market / Aggressive
const SPEEDS: Record<GasSpeed, { base: bigint; priority: bigint; legacy: bigint }> = {
  low: { base: 110n, priority: 80n, legacy: 90n },
  market: { base: 200n, priority: 100n, legacy: 100n },
  aggressive: { base: 250n, priority: 150n, legacy: 125n },
};

const pct = (value: bigint, percent: bigint) => (value * percent) / 100n;

// ethers' getFeeData returns maxFeePerGas = 2 * baseFee + priorityFee, so the base fee can be recovered from it
export function marketFromFeeData(fee: { maxFeePerGas: bigint | null; maxPriorityFeePerGas: bigint | null; gasPrice: bigint | null }): MarketFees {
  const gasPrice = fee.gasPrice ?? fee.maxFeePerGas ?? 0n;
  if (fee.maxFeePerGas == null) return { baseFee: null, priorityFee: 0n, gasPrice };
  const priorityFee = fee.maxPriorityFeePerGas ?? 0n;
  const doubled = fee.maxFeePerGas - priorityFee;
  return { baseFee: doubled > 0n ? doubled / 2n : 0n, priorityFee, gasPrice };
}

export function feesForSpeed(market: MarketFees, speed: GasSpeed): SpeedFees {
  const s = SPEEDS[speed];
  if (market.baseFee === null) {
    const gasPrice = pct(market.gasPrice, s.legacy);
    return { fields: { gasPrice }, likelyPerGas: gasPrice, maxPerGas: gasPrice };
  }
  const maxPriorityFeePerGas = pct(market.priorityFee, s.priority);
  const maxFeePerGas = pct(market.baseFee, s.base) + maxPriorityFeePerGas;
  const likely = market.baseFee + maxPriorityFeePerGas;
  return {
    fields: { maxFeePerGas, maxPriorityFeePerGas },
    likelyPerGas: likely < maxFeePerGas ? likely : maxFeePerGas,
    maxPerGas: maxFeePerGas,
  };
}

const max = (a: bigint, b: bigint) => (a > b ? a : b);
// Nodes reject a replacement unless every fee field is at least 10% higher than the pending tx
const bump = (value: bigint) => (value * 110n) / 100n + 1n;

// Fees for a speed-up / cancel: at least +10% over the stuck tx, or today's market fee if that's higher
export function replacementFees(old: FeeFields, market: MarketFees): SpeedFees {
  const current = feesForSpeed(market, "market");
  if (old.maxFeePerGas != null && market.baseFee !== null) {
    const maxPriorityFeePerGas = max(bump(old.maxPriorityFeePerGas ?? 0n), current.fields.maxPriorityFeePerGas!);
    const maxFeePerGas = max(max(bump(old.maxFeePerGas), current.fields.maxFeePerGas!), maxPriorityFeePerGas);
    const likely = market.baseFee + maxPriorityFeePerGas;
    return {
      fields: { maxFeePerGas, maxPriorityFeePerGas },
      likelyPerGas: likely < maxFeePerGas ? likely : maxFeePerGas,
      maxPerGas: maxFeePerGas,
    };
  }
  const gasPrice = max(bump(old.gasPrice ?? old.maxFeePerGas ?? 0n), market.gasPrice);
  return { fields: { gasPrice }, likelyPerGas: gasPrice, maxPerGas: gasPrice };
}

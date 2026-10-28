import { describe, it, expect } from 'vitest';
import { feesForSpeed, marketFromFeeData, replacementFees } from '../src/background/gas';

const gwei = (n: number) => BigInt(n * 1e9);

describe('marketFromFeeData', () => {
  it('recovers the base fee from ethers fee data (maxFee = 2 * base + priority)', () => {
    const market = marketFromFeeData({ maxFeePerGas: gwei(21), maxPriorityFeePerGas: gwei(1), gasPrice: gwei(11) });
    expect(market).toEqual({ baseFee: gwei(10), priorityFee: gwei(1), gasPrice: gwei(11) });
  });

  it('treats chains without EIP-1559 as legacy', () => {
    expect(marketFromFeeData({ maxFeePerGas: null, maxPriorityFeePerGas: null, gasPrice: gwei(5) }).baseFee).toBeNull();
  });
});

describe('feesForSpeed', () => {
  const market = { baseFee: gwei(10), priorityFee: gwei(2), gasPrice: gwei(12) };

  it('market matches the usual 2x base fee + tip', () => {
    const f = feesForSpeed(market, 'market');
    expect(f.fields).toEqual({ maxFeePerGas: gwei(22), maxPriorityFeePerGas: gwei(2) });
    expect(f.likelyPerGas).toBe(gwei(12));
  });

  it('low < market < aggressive', () => {
    const [low, mid, high] = (['low', 'market', 'aggressive'] as const).map((s) => feesForSpeed(market, s));
    expect(low.maxPerGas < mid.maxPerGas && mid.maxPerGas < high.maxPerGas).toBe(true);
    expect(low.likelyPerGas < mid.likelyPerGas && mid.likelyPerGas < high.likelyPerGas).toBe(true);
  });

  it('scales gasPrice on legacy chains', () => {
    const f = feesForSpeed({ baseFee: null, priorityFee: 0n, gasPrice: gwei(10) }, 'aggressive');
    expect(f.fields).toEqual({ gasPrice: 12500000000n });
  });
});

describe('replacementFees', () => {
  it('bumps a stuck tx by more than 10% even when the market is cheaper', () => {
    const cheap = { baseFee: gwei(1), priorityFee: gwei(1), gasPrice: gwei(2) };
    const f = replacementFees({ maxFeePerGas: gwei(50), maxPriorityFeePerGas: gwei(3) }, cheap);
    expect(f.fields.maxFeePerGas! * 100n >= gwei(50) * 110n).toBe(true);
    expect(f.fields.maxPriorityFeePerGas! * 100n >= gwei(3) * 110n).toBe(true);
  });

  it("uses today's market fee when it is higher than the bump", () => {
    const busy = { baseFee: gwei(100), priorityFee: gwei(5), gasPrice: gwei(105) };
    const f = replacementFees({ maxFeePerGas: gwei(10), maxPriorityFeePerGas: gwei(1) }, busy);
    expect(f.fields).toEqual({ maxFeePerGas: gwei(205), maxPriorityFeePerGas: gwei(5) });
  });

  it('bumps legacy gasPrice', () => {
    const f = replacementFees({ gasPrice: gwei(10) }, { baseFee: null, priorityFee: 0n, gasPrice: gwei(1) });
    expect(f.fields).toEqual({ gasPrice: gwei(11) + 1n });
  });
});

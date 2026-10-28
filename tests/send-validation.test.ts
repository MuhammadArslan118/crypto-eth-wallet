import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { friendlyMessage, RpcError } from '../src/background/errors';
import { parseAmount } from '../src/background/assets';

describe('parseAmount', () => {
  it('parses amounts in token units', () => {
    expect(parseAmount('1.5', 18, 'ETH')).toBe(1500000000000000000n);
    expect(parseAmount('2', 6, 'USDC')).toBe(2000000n);
  });

  it('rejects too many decimals with a clear message', () => {
    expect(() => parseAmount('0.0000001', 6, 'USDC')).toThrow('USDC supports at most 6 decimal places');
  });

  it('rejects zero and garbage', () => {
    expect(() => parseAmount('0', 18, 'ETH')).toThrow('Amount must be greater than 0');
    expect(() => parseAmount('abc', 18, 'ETH')).toThrow('Enter a valid amount');
  });
});

describe('friendlyMessage', () => {
  it('explains insufficient funds', () => {
    expect(friendlyMessage({ code: 'INSUFFICIENT_FUNDS', message: 'insufficient funds for gas * price + value' }))
      .toMatch(/^Insufficient funds/);
  });

  it('explains reverts with the reason', () => {
    expect(friendlyMessage({ code: 'CALL_EXCEPTION', reason: 'ERC20: transfer amount exceeds balance' }))
      .toBe('This transaction is expected to fail: ERC20: transfer amount exceeds balance Check the amount, recipient and your balance.');
  });

  it('explains network failures', () => {
    expect(friendlyMessage({ code: 'SERVER_ERROR' })).toMatch(/Can't reach the network/);
  });

  it('passes RpcError messages through', () => {
    expect(friendlyMessage(new RpcError(4001, 'User rejected the request.'))).toBe('User rejected the request.');
  });
});

describe('NFT transfer encoding', () => {
  const from = '0x1111111111111111111111111111111111111111';
  const to = '0x2222222222222222222222222222222222222222';

  it('uses the 3-arg ERC-721 safeTransferFrom selector', () => {
    const iface = new ethers.Interface(['function safeTransferFrom(address from, address to, uint256 tokenId)']);
    expect(iface.encodeFunctionData('safeTransferFrom', [from, to, 7n]).slice(0, 10)).toBe('0x42842e0e');
  });

  it('uses the ERC-1155 safeTransferFrom selector', () => {
    const iface = new ethers.Interface(['function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)']);
    expect(iface.encodeFunctionData('safeTransferFrom', [from, to, 7n, 2n, '0x']).slice(0, 10)).toBe('0xf242432a');
  });
});

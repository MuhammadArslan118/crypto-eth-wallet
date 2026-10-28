import { describe, it, expect } from 'vitest';
import { HDWallet } from '../src/background/wallet/hd-wallet';

describe('HDWallet', () => {
  it('generates valid mnemonic', () => {
    const mnemonic = HDWallet.generateMnemonic(128);
    expect(HDWallet.validateMnemonic(mnemonic)).toBe(true);
    expect(mnemonic.split(' ').length).toBe(12);
  });

  it('derives accounts from mnemonic', () => {
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    const { accounts } = HDWallet.fromMnemonic(mnemonic);
    expect(accounts.length).toBe(10);
    expect(accounts[0].address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });
});
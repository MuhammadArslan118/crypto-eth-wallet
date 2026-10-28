import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { ethers } from "ethers";

const BIP44_PATH = "m/44'/60'/0'/0";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export class HDWallet {
  static generateMnemonic(strength = 128): string {
    return bip39.generateMnemonic(wordlist, strength);
  }

  static validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic, wordlist);
  }

  static fromMnemonic(mnemonic: string) {
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = HDKey.fromMasterSeed(seed);
    const accounts = [];
    
    for (let i = 0; i < 10; i++) {
      const hdKey = root.derive(`${BIP44_PATH}/${i}`);
      const privateKey = hdKey.privateKey;
      if (!privateKey) throw new Error("No private key");
      const pkHex = "0x" + bytesToHex(privateKey);
      const wallet = new ethers.Wallet(pkHex);
      accounts.push({
        address: wallet.address,
        index: i,
        privateKey: pkHex,
      });
    }
    
    return { accounts, root };
  }

  // Derives the first `count` accounts, computing the (slow) seed only once
  static deriveAccounts(mnemonic: string, count: number) {
    const root = HDKey.fromMasterSeed(bip39.mnemonicToSeedSync(mnemonic));
    return Array.from({ length: count }, (_, index) => {
      const privateKey = root.derive(`${BIP44_PATH}/${index}`).privateKey;
      if (!privateKey) throw new Error("No private key");
      const pkHex = "0x" + bytesToHex(privateKey);
      return { address: new ethers.Wallet(pkHex).address, index, privateKey: pkHex };
    });
  }

  static deriveAccount(mnemonic: string, index: number) {
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = HDKey.fromMasterSeed(seed);
    const hdKey = root.derive(`${BIP44_PATH}/${index}`);
    const privateKey = hdKey.privateKey;
    if (!privateKey) throw new Error("No private key");
    const pkHex = "0x" + bytesToHex(privateKey);
    const wallet = new ethers.Wallet(pkHex);
    return {
      address: wallet.address,
      index,
      privateKey: pkHex,
    };
  }
}

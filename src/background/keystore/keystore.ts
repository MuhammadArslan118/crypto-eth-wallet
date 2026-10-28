import { EncryptedVault } from "../../shared/types";

export class Keystore {
  private static async getKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password).buffer as ArrayBuffer,
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt.buffer as ArrayBuffer,
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  static async encrypt(data: string, password: string): Promise<EncryptedVault> {
    const salt = new Uint8Array(crypto.getRandomValues(new Uint8Array(16)));
    const iv = new Uint8Array(crypto.getRandomValues(new Uint8Array(12)));
    const key = await this.getKey(password, salt);
    
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(data)
    );
    
    return {
      salt: Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join(''),
      iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
      ciphertext: Array.from(new Uint8Array(ciphertext)).map(b => b.toString(16).padStart(2, '0')).join(''),
    };
  }

  static async decrypt(vault: EncryptedVault, password: string): Promise<string> {
    const salt = new Uint8Array(vault.salt.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    const iv = new Uint8Array(vault.iv.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    const ciphertext = new Uint8Array(vault.ciphertext.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    
    const key = await this.getKey(password, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
      key,
      ciphertext.buffer as ArrayBuffer
    );
    
    return new TextDecoder().decode(decrypted);
  }
}

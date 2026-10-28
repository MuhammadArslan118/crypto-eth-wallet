import React, { createContext, useContext, useState, useEffect } from 'react';

interface WalletContextType {
  unlocked: boolean;
  accounts: string[];
  currentAccount: string | null;
  chainId: string;
  setUnlocked: (unlocked: boolean) => void;
  setAccounts: (accounts: string[]) => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [chainId, setChainId] = useState('0xaa36a7'); // Sepolia
  const currentAccount = accounts.length > 0 ? accounts[0] : null;

  const port = chrome.runtime.connect({ name: 'popup' });

  useEffect(() => {
    // Try to get chainId
    port.postMessage({ type: 'GET_CHAIN_ID' });
    const listener = (msg: any) => {
      if (msg.type === 'CHAIN_ID') {
        setChainId(msg.chainId);
      }
    };
    port.onMessage.addListener(listener);
    return () => port.onMessage.removeListener(listener);
  }, []);

  return (
    <WalletContext.Provider value={{ unlocked, accounts, currentAccount, chainId, setUnlocked, setAccounts }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

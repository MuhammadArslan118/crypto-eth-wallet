import React, { useState } from 'react';
import { colors, shortAddress } from '../styles';

interface AccountOverviewProps {
  name: string;
  address: string;
  balance: string | null;
  symbol: string;
  onOpenAccounts: () => void;
}

export function formatAmount(value: string | null | undefined) {
  if (value === null || value === undefined) return '…';
  const n = Number(value);
  // Tiny amounts (e.g. testnet gas fees) would round to "0" with 4 decimals; show significant digits instead
  if (n > 0 && n < 0.0001) return n.toLocaleString(undefined, { maximumSignificantDigits: 3, maximumFractionDigits: 20 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function AccountOverview({ name, address, balance, symbol, onOpenAccounts }: AccountOverviewProps) {
  const [copied, setCopied] = useState(false);
  const [hidden, setHidden] = useState(() => localStorage.getItem('hideBalance') === '1');

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleHidden = () => {
    setHidden(!hidden);
    localStorage.setItem('hideBalance', hidden ? '0' : '1');
  };

  return (
    <div style={{
      padding: '20px 16px',
      textAlign: 'center',
      background: `linear-gradient(180deg, ${colors.bg} 0%, ${colors.surface} 100%)`
    }}>
      <button
        onClick={onOpenAccounts}
        style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '15px', fontWeight: 600, cursor: 'pointer', marginBottom: '6px' }}
      >
        {name} ▾
      </button>
      <div>
        <button
          onClick={copy}
          title="Copy address"
          style={{
            padding: '4px 12px',
            background: colors.border,
            border: 'none',
            color: '#fff',
            borderRadius: '16px',
            fontSize: '12px',
            cursor: 'pointer',
            marginBottom: '12px',
          }}
        >
          {copied ? 'Copied!' : `${shortAddress(address)} 📋`}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
        <div style={{ fontSize: '30px', fontWeight: 'bold', wordBreak: 'break-all' }}>
          {hidden ? '••••••' : formatAmount(balance)} <span style={{ fontSize: '18px', color: colors.muted }}>{symbol}</span>
        </div>
        <button
          onClick={toggleHidden}
          title={hidden ? 'Show balance' : 'Hide balance'}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', color: colors.muted }}
        >
          {hidden ? '🙈' : '👁'}
        </button>
      </div>
    </div>
  );
}

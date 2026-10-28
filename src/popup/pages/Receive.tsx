import React, { useState } from 'react';
import { NetworkInfo } from '../../shared/types';
import { PageHeader } from '../components/PageHeader';
import { QrCode } from '../components/QrCode';
import { colors, primaryButton } from '../styles';

export function Receive({ address, accountName, network, onDone }: { address: string; accountName?: string; network: NetworkInfo; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <PageHeader title="Receive" subtitle={accountName} onBack={onDone} />
      <QrCode value={address} size={200} />
      <code style={{ padding: '12px', background: colors.surface, borderRadius: '8px', fontSize: '13px', wordBreak: 'break-all', textAlign: 'center' }}>{address}</code>
      <p style={{ fontSize: '12px', color: colors.muted, margin: 0, textAlign: 'center' }}>
        Only send {network.symbol} and tokens on <b>{network.name}</b> (chain ID {network.chainId}) to this address.
      </p>
      <button onClick={copy} style={primaryButton}>{copied ? 'Copied!' : 'Copy address'}</button>
    </div>
  );
}

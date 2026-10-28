import React, { useState } from 'react';
import { colors, linkButton, primaryButton } from '../styles';

export function Receive({ address, onDone }: { address: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h3 style={{ margin: 0 }}>Receive</h3>
      <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>Share this address to receive funds on this network.</p>
      <code style={{ padding: '12px', background: colors.surface, borderRadius: '8px', fontSize: '13px', wordBreak: 'break-all' }}>{address}</code>
      <button onClick={copy} style={primaryButton}>{copied ? 'Copied!' : 'Copy address'}</button>
      <button onClick={onDone} style={linkButton}>Back</button>
    </div>
  );
}

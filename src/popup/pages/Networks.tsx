import React, { useState } from 'react';
import { send } from '../api';
import { WalletState } from '../../shared/types';
import { colors, errorText, input, label, linkButton, primaryButton, secondaryButton } from '../styles';

interface NetworksProps {
  state: WalletState;
  onChange: () => void;
  onDone: () => void;
}

const emptyForm = { name: '', rpcUrl: '', chainId: '', symbol: '', explorer: '' };

export function Networks({ state, onChange, onDone }: NetworksProps) {
  const [mode, setMode] = useState<'list' | 'add'>('list');
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const field = (key: keyof typeof emptyForm, text: string, placeholder: string) => (
    <div>
      <label style={label}>{text}</label>
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder} spellCheck={false} style={input} />
    </div>
  );

  const run = async (fn: () => Promise<unknown>, done = false) => {
    setError('');
    setBusy(true);
    try {
      await fn();
      onChange();
      if (done) onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'add') {
    return (
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ margin: 0 }}>Add network</h3>
        <p style={{ fontSize: '12px', color: colors.muted, margin: 0 }}>
          Only add networks you trust. A malicious RPC can lie about balances and transaction status.
        </p>
        {field('name', 'Network name', 'e.g. Polygon Amoy')}
        {field('rpcUrl', 'RPC URL', 'https://…')}
        {field('chainId', 'Chain ID', 'e.g. 80002 or 0x13882')}
        {field('symbol', 'Currency symbol', 'e.g. POL')}
        {field('explorer', 'Block explorer URL (optional)', 'https://…')}
        {error && <p style={errorText}>{error}</p>}
        <button
          onClick={() => run(() => send('ADD_NETWORK', { network: form }), true)}
          disabled={busy || !form.name || !form.rpcUrl || !form.chainId || !form.symbol}
          style={primaryButton}
        >
          {busy ? 'Checking RPC…' : 'Save & switch'}
        </button>
        <button onClick={() => setMode('list')} style={linkButton}>Back</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <h3 style={{ margin: '0 0 4px' }}>Networks</h3>
      {state.networks.map((n) => {
        const selected = n.key === state.network.key;
        return (
          <div
            key={n.key}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
              padding: '12px', background: colors.surface, borderRadius: '8px',
              border: `1px solid ${selected ? colors.primary : colors.border}`,
            }}
          >
            <button
              onClick={() => run(() => send('SWITCH_NETWORK', { network: n.key }), true)}
              style={{ background: 'transparent', border: 'none', color: '#fff', textAlign: 'left', cursor: 'pointer', padding: 0, minWidth: 0, flex: 1 }}
            >
              <div style={{ fontSize: '14px', fontWeight: 600 }}>{n.name} {selected && <span style={{ color: colors.primary }}>✓</span>}</div>
              <div style={{ fontSize: '11px', color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Chain {n.chainId} · {n.symbol} · {n.rpcUrl}
              </div>
            </button>
            {n.custom && (
              <button onClick={() => run(() => send('REMOVE_NETWORK', { key: n.key }))} title="Remove network" style={{ ...linkButton, color: colors.danger }}>
                Remove
              </button>
            )}
          </div>
        );
      })}
      {error && <p style={errorText}>{error}</p>}
      <button onClick={() => { setForm(emptyForm); setMode('add'); }} style={{ ...secondaryButton, marginTop: '8px' }}>+ Add network</button>
      <button onClick={onDone} style={linkButton}>Back</button>
    </div>
  );
}

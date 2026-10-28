import React, { useState } from 'react';
import { send } from '../api';
import { WalletState } from '../../shared/types';
import { colors, errorText, input, label, linkButton, primaryButton, secondaryButton, shortAddress } from '../styles';

interface AccountsProps {
  state: WalletState;
  onChange: () => void;
  onDone: () => void;
}

export function Accounts({ state, onChange, onDone }: AccountsProps) {
  const [mode, setMode] = useState<'list' | 'import'>('list');
  const [privateKey, setPrivateKey] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
      onChange();
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'import') {
    return (
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <h3 style={{ margin: 0 }}>Import account</h3>
        <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>
          Imported accounts are not part of your Secret Recovery Phrase. Back up their private keys separately.
        </p>
        <div>
          <label style={label}>Private key</label>
          <input type="password" value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} spellCheck={false} autoComplete="off" style={input} placeholder="0x…" />
        </div>
        <div>
          <label style={label}>Wallet password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={input} />
        </div>
        {error && <p style={errorText}>{error}</p>}
        <button
          onClick={() => run(() => send('IMPORT_ACCOUNT', { privateKey, password }))}
          disabled={busy || !privateKey || !password}
          style={primaryButton}
        >
          {busy ? 'Importing…' : 'Import'}
        </button>
        <button onClick={() => setMode('list')} style={linkButton}>Back</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <h3 style={{ margin: '0 0 4px' }}>Accounts</h3>
      {state.accounts.map((a) => {
        const selected = a.address === state.selectedAddress;
        return (
          <button
            key={a.address}
            onClick={() => run(() => send('SELECT_ACCOUNT', { address: a.address }))}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px',
              background: colors.surface,
              border: `1px solid ${selected ? colors.primary : colors.border}`,
              borderRadius: '8px',
              color: '#fff',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span>
              <div style={{ fontSize: '14px', fontWeight: 600 }}>
                {a.name}
                {a.type === 'imported' && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '2px 6px', borderRadius: '8px', background: colors.border }}>IMPORTED</span>}
              </div>
              <div style={{ fontSize: '12px', color: colors.muted }}>{shortAddress(a.address)}</div>
            </span>
            {selected && <span style={{ color: colors.primary }}>✓</span>}
          </button>
        );
      })}
      {error && <p style={errorText}>{error}</p>}
      <button onClick={() => run(() => send('ADD_ACCOUNT'))} disabled={busy} style={{ ...primaryButton, marginTop: '8px' }}>
        + Add account
      </button>
      <button onClick={() => setMode('import')} style={secondaryButton}>Import account</button>
      <button onClick={onDone} style={linkButton}>Back</button>
    </div>
  );
}

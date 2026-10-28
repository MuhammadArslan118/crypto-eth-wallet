import React, { useState } from 'react';
import { send } from '../api';
import { WalletState } from '../../shared/types';
import { Alert } from '../components/Alert';
import { PageHeader } from '../components/PageHeader';
import { QrCode } from '../components/QrCode';
import { RevealSecret } from '../components/RevealSecret';
import { colors, input, label, linkButton, primaryButton, secondaryButton } from '../styles';

interface AccountDetailsProps {
  state: WalletState;
  address: string;
  onChange: () => void;
  onDone: () => void;
}

type Mode = 'details' | 'privateKey' | 'remove';

export function AccountDetails({ state, address, onChange, onDone }: AccountDetailsProps) {
  const account = state.accounts.find((a) => a.address === address);
  const [mode, setMode] = useState<Mode>('details');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(account?.name ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!account) return null;
  const explorer = state.network.explorer;

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await send('RENAME_ACCOUNT', { address, name });
      setEditing(false);
      onChange();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const remove = async () => {
    setError('');
    setBusy(true);
    try {
      await send('REMOVE_ACCOUNT', { address, password });
      onChange();
      onDone();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (mode === 'privateKey') {
    return (
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <PageHeader title="Show private key" subtitle={account.name} onBack={() => setMode('details')} />
        <RevealSecret what="private key" reveal={(pw) => send<string>('EXPORT_PRIVATE_KEY', { address, password: pw })} />
      </div>
    );
  }

  if (mode === 'remove') {
    return (
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <PageHeader title="Remove account" subtitle={account.name} onBack={() => setMode('details')} />
        <Alert severity="warning" title="Make sure you have a backup">
          This imported account isn't part of your Secret Recovery Phrase. Once it's removed, you can only get it back with its private key.
        </Alert>
        <div>
          <label style={label}>Wallet password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus style={input} />
        </div>
        {error && <Alert severity="danger">{error}</Alert>}
        <button onClick={remove} disabled={busy || !password} style={{ ...primaryButton, background: colors.danger }}>
          {busy ? 'Removing…' : 'Remove account'}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <PageHeader title="Account details" onBack={onDone} />

      {editing ? (
        <form onSubmit={rename} style={{ display: 'flex', gap: '8px' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoFocus style={input} />
          <button type="submit" disabled={!name.trim()} style={{ ...primaryButton, width: 'auto', padding: '8px 16px' }}>Save</button>
        </form>
      ) : (
        <div style={{ textAlign: 'center', fontSize: '18px', fontWeight: 600 }}>
          {account.name}
          <button onClick={() => { setName(account.name); setEditing(true); }} title="Rename account" style={{ ...linkButton, marginLeft: '8px', fontSize: '14px' }}>✏️</button>
          {account.type === 'imported' && (
            <div><span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', background: colors.border, fontWeight: 400 }}>IMPORTED</span></div>
          )}
        </div>
      )}
      {error && <Alert severity="danger">{error}</Alert>}

      <QrCode value={address} />
      <code style={{ padding: '10px', background: colors.surface, borderRadius: '8px', fontSize: '12px', wordBreak: 'break-all', textAlign: 'center' }}>{address}</code>
      <button onClick={copy} style={secondaryButton}>{copied ? 'Copied!' : 'Copy address'}</button>
      {explorer && (
        <a href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer" style={{ ...secondaryButton, textAlign: 'center', textDecoration: 'none' }}>
          View on explorer ↗
        </a>
      )}
      <button onClick={() => { setError(''); setMode('privateKey'); }} style={secondaryButton}>Show private key</button>
      {account.type === 'imported' && (
        <button onClick={() => { setError(''); setPassword(''); setMode('remove'); }} style={{ ...linkButton, color: colors.danger }}>
          Remove account
        </button>
      )}
    </div>
  );
}

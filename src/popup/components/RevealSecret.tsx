import React, { useState } from 'react';
import { Alert } from './Alert';
import { colors, input, label, primaryButton, secondaryButton } from '../styles';

interface RevealSecretProps {
  // Shown in the warning, e.g. "Secret Recovery Phrase"
  what: string;
  reveal: (password: string) => Promise<string>;
  // Show a recovery phrase as a numbered word grid instead of one block of text
  asWords?: boolean;
}

// Password check → secret, with MetaMask-style warnings. The secret only lives in this component's state.
export function RevealSecret({ what, reveal, asWords }: RevealSecretProps) {
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      setSecret(await reveal(password));
      setPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <Alert severity="danger" title={`Never share your ${what}`}>
        Anyone with it can steal everything in this wallet. Support staff, websites and apps will never ask for it.
      </Alert>

      {!secret ? (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={label}>Enter your password to continue</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus style={input} />
          </div>
          {error && <Alert severity="danger">{error}</Alert>}
          <button type="submit" disabled={busy || !password} style={primaryButton}>{busy ? 'Checking…' : 'Reveal'}</button>
        </form>
      ) : (
        <>
          {asWords ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              {secret.split(' ').map((word, i) => (
                <div key={i} style={{ padding: '8px', background: colors.surface, borderRadius: '6px', fontSize: '13px' }}>
                  <span style={{ color: colors.muted, marginRight: '4px' }}>{i + 1}.</span>{word}
                </div>
              ))}
            </div>
          ) : (
            <code style={{ padding: '12px', background: colors.surface, borderRadius: '8px', fontSize: '12px', wordBreak: 'break-all' }}>{secret}</code>
          )}
          <button onClick={copy} style={secondaryButton}>{copied ? 'Copied!' : 'Copy to clipboard'}</button>
          <div style={{ fontSize: '11px', color: colors.muted, textAlign: 'center' }}>
            Clear your clipboard after pasting it somewhere safe.
          </div>
        </>
      )}
    </div>
  );
}

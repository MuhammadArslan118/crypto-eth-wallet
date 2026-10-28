import React, { useState } from 'react';
import { send } from '../api';
import { Logo } from '../components/Logo';
import { errorText, input, linkButton, primaryButton } from '../styles';

interface UnlockProps {
  onUnlock: () => void;
  onRestore: () => void;
}

export function Unlock({ onUnlock, onRestore }: UnlockProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleUnlock = async () => {
    setError('');
    setBusy(true);
    try {
      await send('UNLOCK', { password });
      onUnlock();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '600px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ marginBottom: '24px' }}>
        <Logo size={80} />
      </div>
      <h2 style={{ margin: '0 0 32px 0', fontSize: '24px' }}>Welcome Back!</h2>

      <input
        type="password"
        placeholder="Enter password"
        value={password}
        autoFocus
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
        style={{ ...input, padding: '12px', marginBottom: '16px' }}
      />

      <button onClick={handleUnlock} disabled={busy || !password} style={{ ...primaryButton, marginBottom: '12px' }}>
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>

      {error && <p style={errorText}>{error}</p>}

      <button onClick={onRestore} style={{ ...linkButton, marginTop: '24px' }}>
        Restore from Secret Recovery Phrase
      </button>
    </div>
  );
}

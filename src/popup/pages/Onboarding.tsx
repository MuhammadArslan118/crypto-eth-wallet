import React, { useState } from 'react';
import { send } from '../api';
import { Logo } from '../components/Logo';
import { colors, errorText, input, label, linkButton, primaryButton, secondaryButton } from '../styles';

interface OnboardingProps {
  onComplete: () => void;
  initialMode?: 'create' | 'import';
  onCancel?: () => void;
}

type Step = 'welcome' | 'password' | 'phrase' | 'confirm' | 'import';

export function Onboarding({ onComplete, initialMode, onCancel }: OnboardingProps) {
  const [step, setStep] = useState<Step>(initialMode === 'import' ? 'import' : 'welcome');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [importPhrase, setImportPhrase] = useState('');
  const [savedPhrase, setSavedPhrase] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const titles: Record<Step, [string, string]> = {
    welcome: ['Welcome to My Wallet', 'The crypto wallet & gateway to blockchain apps'],
    password: ['Create Password', 'This password will unlock your wallet on this device'],
    phrase: ['Secret Recovery Phrase', 'Write down these 12 words in order and keep them safe'],
    confirm: ['Confirm backup', 'Anyone with this phrase can take your funds'],
    import: ['Import wallet', 'Enter your Secret Recovery Phrase and a new password'],
  };

  const checkPassword = () => {
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (password !== confirmPassword) return 'Passwords do not match';
    return '';
  };

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () => {
    const err = checkPassword();
    if (err) return setError(err);
    run(async () => {
      const result = await send<{ mnemonic: string }>('CREATE_WALLET', { password });
      setMnemonic(result.mnemonic);
      setStep('phrase');
    });
  };

  const handleImport = () => {
    const words = importPhrase.trim().split(/\s+/).filter(Boolean);
    if (![12, 15, 18, 21, 24].includes(words.length)) return setError('Phrase must be 12, 15, 18, 21 or 24 words');
    const err = checkPassword();
    if (err) return setError(err);
    run(async () => {
      await send('IMPORT_WALLET', { mnemonic: words.join(' '), password });
      onComplete();
    });
  };

  const passwordFields = (
    <>
      <div>
        <label style={label}>New password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={input} placeholder="At least 8 characters" />
      </div>
      <div>
        <label style={label}>Confirm password</label>
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={input} />
      </div>
    </>
  );

  return (
    <div style={{ minHeight: '600px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <Logo size={60} />
        </div>
        <h2 style={{ margin: 0, fontSize: '22px' }}>{titles[step][0]}</h2>
        <p style={{ color: colors.muted, fontSize: '14px', marginTop: '8px', marginBottom: 0 }}>{titles[step][1]}</p>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {step === 'welcome' && (
          <>
            <div style={{ flex: 1 }} />
            <button onClick={() => setStep('password')} style={primaryButton}>Create a new wallet</button>
            <button onClick={() => setStep('import')} style={secondaryButton}>Import an existing wallet</button>
          </>
        )}

        {step === 'password' && (
          <>
            {passwordFields}
            <div style={{ flex: 1 }} />
            <button onClick={handleCreate} disabled={busy} style={primaryButton}>{busy ? 'Creating…' : 'Create'}</button>
            <button onClick={() => setStep('welcome')} style={linkButton}>Back</button>
          </>
        )}

        {step === 'phrase' && (
          <>
            <div style={{ padding: '12px', background: colors.surface, border: `1px solid ${colors.warning}`, borderRadius: '8px', fontSize: '13px', color: colors.warning }}>
              ⚠️ Never share this phrase. Anyone who has it can take your funds.
            </div>
            <div style={{ padding: '12px', background: colors.surface, borderRadius: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              {mnemonic.split(' ').map((word, i) => (
                <div key={i} style={{ padding: '8px 4px', background: colors.bg, borderRadius: '6px', fontSize: '13px', textAlign: 'center' }}>
                  <span style={{ color: colors.muted }}>{i + 1}.</span> {word}
                </div>
              ))}
            </div>
            <button onClick={() => navigator.clipboard.writeText(mnemonic)} style={linkButton}>Copy to clipboard</button>
            <div style={{ flex: 1 }} />
            <button onClick={() => setStep('confirm')} style={primaryButton}>Next</button>
          </>
        )}

        {step === 'confirm' && (
          <>
            <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '14px', cursor: 'pointer' }}>
              <input type="checkbox" checked={savedPhrase} onChange={(e) => setSavedPhrase(e.target.checked)} style={{ marginTop: '3px' }} />
              I have written down my Secret Recovery Phrase and stored it somewhere safe.
            </label>
            <div style={{ flex: 1 }} />
            <button onClick={onComplete} disabled={!savedPhrase} style={primaryButton}>Done</button>
            <button onClick={() => setStep('phrase')} style={linkButton}>Show phrase again</button>
          </>
        )}

        {step === 'import' && (
          <>
            <div>
              <label style={label}>Secret Recovery Phrase</label>
              <textarea
                value={importPhrase}
                onChange={(e) => setImportPhrase(e.target.value)}
                rows={3}
                spellCheck={false}
                autoComplete="off"
                placeholder="Paste or type your 12-24 words separated by spaces"
                style={{ ...input, resize: 'none' }}
              />
            </div>
            {passwordFields}
            <div style={{ flex: 1 }} />
            <button onClick={handleImport} disabled={busy} style={primaryButton}>{busy ? 'Importing…' : 'Import'}</button>
            <button onClick={() => (onCancel ? onCancel() : setStep('welcome'))} style={linkButton}>Back</button>
          </>
        )}

        {error && <p style={{ ...errorText, textAlign: 'center' }}>{error}</p>}
      </div>
    </div>
  );
}

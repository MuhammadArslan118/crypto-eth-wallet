import React, { useEffect, useState } from 'react';
import { send } from '../api';
import { Settings as WalletSettings, WalletState } from '../../shared/types';
import { Alert } from '../components/Alert';
import { PageHeader } from '../components/PageHeader';
import { RevealSecret } from '../components/RevealSecret';
import { colors, input, label, primaryButton, secondaryButton } from '../styles';

export type SettingsSection = 'main' | 'general' | 'security' | 'srp' | 'password' | 'connections' | 'advanced' | 'about';

interface SettingsProps {
  state: WalletState;
  initialSection?: SettingsSection;
  // Origin of the site in the current tab, if any
  currentOrigin?: string;
  onOpenNetworks: () => void;
  onLock: () => void;
  onDone: () => void;
}

const REPO_URL = 'https://github.com/MuhammadArslan118/crypto-eth-wallet';

const AUTO_LOCK_OPTIONS = [
  { minutes: 1, label: '1 minute' },
  { minutes: 5, label: '5 minutes' },
  { minutes: 15, label: '15 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 240, label: '4 hours' },
  { minutes: 0, label: 'Never' },
];

const page: React.CSSProperties = { padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' };

const rowButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
  padding: '14px 4px',
  background: 'transparent',
  border: 'none',
  borderBottom: `1px solid ${colors.border}`,
  color: '#fff',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: '14px',
};

function Row({ icon, title, subtitle, onClick }: { icon: string; title: string; subtitle?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={rowButton}>
      <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {subtitle && <div style={{ fontSize: '12px', color: colors.muted, marginTop: '2px' }}>{subtitle}</div>}
      </span>
      <span style={{ color: colors.muted }}>›</span>
    </button>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
        background: checked ? colors.primary : colors.border,
      }}
    >
      <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
    </button>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const mismatch = confirm !== '' && next !== confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await send('CHANGE_PASSWORD', { currentPassword: current, newPassword: next });
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <>
        <Alert severity="success" title="Password changed">Use your new password the next time you unlock the wallet.</Alert>
        <button onClick={onDone} style={primaryButton}>Done</button>
      </>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <label style={label}>Current password</label>
        <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus style={input} />
      </div>
      <div>
        <label style={label}>New password (min 8 characters)</label>
        <input type="password" value={next} onChange={(e) => setNext(e.target.value)} style={input} />
      </div>
      <div>
        <label style={label}>Confirm new password</label>
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ ...input, borderColor: mismatch ? colors.danger : colors.border }} />
      </div>
      {mismatch && <Alert severity="danger">Passwords don't match</Alert>}
      {error && <Alert severity="danger">{error}</Alert>}
      <button type="submit" disabled={busy || !current || next.length < 8 || next !== confirm} style={primaryButton}>
        {busy ? 'Saving…' : 'Change password'}
      </button>
    </form>
  );
}

function ConnectedSites({ currentOrigin }: { currentOrigin?: string }) {
  const [sites, setSites] = useState<string[] | null>(null);
  const [error, setError] = useState('');

  const load = () => send<string[]>('GET_CONNECTED_SITES').then(setSites).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const disconnect = async (origins: string[]) => {
    setError('');
    try {
      for (const origin of origins) await send('DISCONNECT_SITE', { origin });
    } catch (e: any) {
      setError(e.message);
    }
    load();
  };

  return (
    <>
      <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>
        Connected sites can see your selected account address and ask you to sign or send transactions.
      </p>
      {error && <Alert severity="danger">{error}</Alert>}
      {sites?.length === 0 && <div style={{ textAlign: 'center', color: colors.muted, padding: '20px', fontSize: '14px' }}>No connected sites</div>}
      {sites?.map((origin) => (
        <div key={origin} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: colors.surface, borderRadius: '8px' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {origin}
            {origin === currentOrigin && <div style={{ fontSize: '11px', color: '#28a745' }}>● Current site</div>}
          </span>
          <button onClick={() => disconnect([origin])} style={{ ...secondaryButton, width: 'auto', padding: '6px 12px', fontSize: '12px' }}>
            Disconnect
          </button>
        </div>
      ))}
      {sites && sites.length > 1 && (
        <button onClick={() => disconnect(sites)} style={{ ...secondaryButton, color: colors.danger, borderColor: colors.danger }}>Disconnect all</button>
      )}
    </>
  );
}

export function Settings({ state, initialSection = 'main', currentOrigin, onOpenNetworks, onLock, onDone }: SettingsProps) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [settings, setSettings] = useState<WalletSettings | null>(null);
  const [hideBalance, setHideBalance] = useState(() => localStorage.getItem('hideBalance') === '1');
  const [confirmClear, setConfirmClear] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    send<WalletSettings>('GET_SETTINGS').then(setSettings).catch((e) => setError(e.message));
  }, []);

  const go = (s: SettingsSection) => {
    setError('');
    setMessage('');
    setConfirmClear(false);
    setSection(s);
  };

  const update = async (patch: Partial<WalletSettings>) => {
    setError('');
    try {
      setSettings(await send<WalletSettings>('UPDATE_SETTINGS', { settings: patch }));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const clearActivity = async () => {
    try {
      await send('CLEAR_ACTIVITY');
      setMessage(`Activity for this account on ${state.network.name} was cleared.`);
    } catch (e: any) {
      setError(e.message);
    }
    setConfirmClear(false);
  };

  // Where the back arrow goes from each section
  const parent: Record<SettingsSection, SettingsSection | null> = {
    main: null, general: 'main', security: 'main', connections: 'main', advanced: 'main', about: 'main', srp: 'security', password: 'security',
  };
  const back = () => (parent[section] && initialSection !== section ? go(parent[section]!) : onDone());

  const titles: Record<SettingsSection, string> = {
    main: 'Settings', general: 'General', security: 'Security & privacy', srp: 'Secret Recovery Phrase', password: 'Change password',
    connections: 'Connected sites', advanced: 'Advanced', about: 'About',
  };

  return (
    <div style={page}>
      <PageHeader title={titles[section]} onBack={back} />
      {error && <Alert severity="danger">{error}</Alert>}

      {section === 'main' && (
        <div>
          <Row icon="⚙️" title="General" subtitle="Auto-lock timer, balance display" onClick={() => go('general')} />
          <Row icon="🔐" title="Security & privacy" subtitle="Recovery phrase, password" onClick={() => go('security')} />
          <Row icon="🔗" title="Connected sites" subtitle="Manage sites that can see your account" onClick={() => go('connections')} />
          <Row icon="🌐" title="Networks" subtitle="Add, view and remove networks" onClick={onOpenNetworks} />
          <Row icon="🧪" title="Advanced" subtitle="Clear activity data" onClick={() => go('advanced')} />
          <Row icon="ℹ️" title="About" subtitle={`Version ${chrome.runtime.getManifest().version}`} onClick={() => go('about')} />
          <button onClick={onLock} style={{ ...secondaryButton, marginTop: '20px' }}>🔒 Lock wallet</button>
        </div>
      )}

      {section === 'general' && (
        <>
          <div>
            <label style={label}>Auto-lock timer</label>
            <p style={{ fontSize: '12px', color: colors.muted, margin: '0 0 8px' }}>
              Lock the wallet after this long without using it. It also locks when you close the browser.
            </p>
            <select
              value={settings?.autoLockMinutes ?? ''}
              onChange={(e) => update({ autoLockMinutes: Number(e.target.value) })}
              disabled={!settings}
              style={{ ...input, cursor: 'pointer' }}
            >
              {AUTO_LOCK_OPTIONS.map((o) => <option key={o.minutes} value={o.minutes}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '6px' }}>
            <span style={{ flex: 1 }}>
              <div style={{ fontSize: '14px' }}>Hide balances</div>
              <div style={{ fontSize: '12px', color: colors.muted }}>Show •••••• instead of your balance on the home screen</div>
            </span>
            <Toggle
              checked={hideBalance}
              onChange={(v) => {
                setHideBalance(v);
                localStorage.setItem('hideBalance', v ? '1' : '0');
              }}
            />
          </div>
        </>
      )}

      {section === 'security' && (
        <div>
          <Row icon="🔑" title="Reveal Secret Recovery Phrase" subtitle="Back up the 12 words that restore every account" onClick={() => go('srp')} />
          <Row icon="🔒" title="Change password" subtitle="Used to unlock this wallet on this device" onClick={() => go('password')} />
          <Row icon="⏱️" title="Auto-lock timer" subtitle={AUTO_LOCK_OPTIONS.find((o) => o.minutes === settings?.autoLockMinutes)?.label} onClick={() => go('general')} />
          <p style={{ fontSize: '12px', color: colors.muted, marginTop: '14px' }}>
            Private keys for single accounts are under Account details.
          </p>
        </div>
      )}

      {section === 'srp' && <RevealSecret what="Secret Recovery Phrase" asWords reveal={(password) => send<string>('REVEAL_SRP', { password })} />}

      {section === 'password' && <ChangePassword onDone={() => go('security')} />}

      {section === 'connections' && <ConnectedSites currentOrigin={currentOrigin} />}

      {section === 'advanced' && (
        <>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Clear activity tab data</div>
            <p style={{ fontSize: '12px', color: colors.muted, margin: '4px 0 10px' }}>
              Removes the transaction history shown for {state.accounts.find((a) => a.address === state.selectedAddress)?.name} on {state.network.name}.
              It doesn't touch your balances or anything on-chain.
            </p>
            {confirmClear ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setConfirmClear(false)} style={secondaryButton}>Cancel</button>
                <button onClick={clearActivity} style={{ ...primaryButton, background: colors.danger }}>Clear</button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} style={{ ...secondaryButton, color: colors.danger, borderColor: colors.danger }}>Clear activity data</button>
            )}
          </div>
          {message && <Alert severity="success">{message}</Alert>}
        </>
      )}

      {section === 'about' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>My Wallet</div>
          <div style={{ color: colors.muted }}>Version {chrome.runtime.getManifest().version}</div>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            An educational Ethereum wallet extension: HD accounts, ERC-20 tokens, NFTs, dapp connections (EIP-1193 / EIP-6963) and custom networks.
          </p>
          <Alert severity="warning">This wallet hasn't been security audited. Use it with testnet funds only.</Alert>
          <a href={REPO_URL} target="_blank" rel="noreferrer" style={{ color: colors.primary }}>Source code on GitHub ↗</a>
          <a href={`${REPO_URL}/blob/main/docs/ARCHITECTURE.md`} target="_blank" rel="noreferrer" style={{ color: colors.primary }}>Developer guide ↗</a>
        </div>
      )}
    </div>
  );
}

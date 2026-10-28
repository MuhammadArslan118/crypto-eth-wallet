import React, { useEffect, useRef, useState } from 'react';
import { NetworkInfo } from '../../shared/types';
import { Logo } from './Logo';
import { colors } from '../styles';

export interface MenuItem {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface HeaderProps {
  network: NetworkInfo;
  networks: NetworkInfo[];
  onSwitchNetwork: (key: string) => void;
  onManageNetworks: () => void;
  // Whether the site in the current tab is connected; undefined when the tab isn't a website
  siteConnected?: boolean;
  onOpenConnections: () => void;
  menu: MenuItem[];
}

const TESTNET_IDS = new Set([5, 17000, 11155111, 80002, 84532, 421614, 11155420, 97, 1337, 31337]);

const isTestnet = (n: NetworkInfo) => TESTNET_IDS.has(n.chainId) || /test|sepolia|goerli|holesky/i.test(n.name);

// Stable colour per chain so each network is recognisable at a glance
function networkColor(n: NetworkInfo) {
  if (n.chainId === 1) return '#29b6af';
  if (n.chainId === 11155111) return '#cfb5f0';
  return `hsl(${(n.chainId * 47) % 360}, 60%, 62%)`;
}

function NetworkAvatar({ network, size = 22 }: { network: NetworkInfo; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: networkColor(network), color: '#141618',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, fontWeight: 700,
    }}>
      {network.name.charAt(0).toUpperCase()}
    </span>
  );
}

// Open state that closes on outside click or Escape
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const chevron = (open: boolean) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={colors.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

function NetworkPicker({ network, networks, onSwitchNetwork, onManageNetworks }: Pick<HeaderProps, 'network' | 'networks' | 'onSwitchNetwork' | 'onManageNetworks'>) {
  const { open, setOpen, ref } = useDropdown();
  const mainnets = networks.filter((n) => !isTestnet(n));
  const testnets = networks.filter(isTestnet);

  const pick = (key: string) => {
    setOpen(false);
    if (key !== network.key) onSwitchNetwork(key);
  };

  const item = (n: NetworkInfo) => (
    <button key={n.key} role="option" aria-selected={n.key === network.key} onClick={() => pick(n.key)}
      className={`dropdown-item${n.key === network.key ? ' selected' : ''}`}>
      <NetworkAvatar network={n} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</div>
        <div style={{ fontSize: '11px', color: colors.muted }}>
          Chain {n.chainId} · {n.symbol}{n.custom ? ' · custom' : ''}
        </div>
      </span>
      {n.key === network.key && <span style={{ color: colors.primary, fontWeight: 700 }}>✓</span>}
    </button>
  );

  return (
    <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Switch network"
        className="dropdown-trigger"
        style={{
          display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '100%',
          padding: '5px 10px 5px 6px', background: colors.bg, color: '#fff',
          border: `1px solid ${colors.border}`, borderRadius: '999px', fontSize: '13px', cursor: 'pointer',
        }}
      >
        <NetworkAvatar network={network} size={20} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{network.name}</span>
        {chevron(open)}
      </button>

      {open && (
        <div role="listbox" className="dropdown-panel" style={{ left: '50%', marginLeft: '-130px', width: '260px', maxHeight: '420px', overflowY: 'auto' }}>
          {mainnets.length > 0 && <div className="dropdown-heading">Networks</div>}
          {mainnets.map(item)}
          {testnets.length > 0 && <div className="dropdown-heading" style={{ marginTop: mainnets.length ? '4px' : 0 }}>Test networks</div>}
          {testnets.map(item)}
          <div className="dropdown-divider" />
          <button onClick={() => { setOpen(false); onManageNetworks(); }} className="dropdown-item" style={{ color: colors.primary, justifyContent: 'center', fontWeight: 600 }}>
            + Add / manage networks
          </button>
        </div>
      )}
    </div>
  );
}

function Menu({ items }: { items: MenuItem[] }) {
  const { open, setOpen, ref } = useDropdown();
  const normal = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);

  const render = (item: MenuItem) => (
    <button key={item.label} role="menuitem" onClick={() => { setOpen(false); item.onClick(); }}
      className={`dropdown-item${item.danger ? ' danger' : ''}`}>
      <span style={{
        width: 28, height: 28, borderRadius: '8px', flexShrink: 0, fontSize: '14px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: item.danger ? 'rgba(215, 58, 73, 0.15)' : colors.surface,
      }}>
        {item.icon}
      </span>
      {item.label}
    </button>
  );

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        title="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="dropdown-trigger"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '32px', height: '32px', padding: 0, background: 'transparent',
          border: `1px solid ${colors.border}`, borderRadius: '50%', cursor: 'pointer',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="dropdown-panel" style={{ right: 0, minWidth: '230px' }}>
          {normal.map(render)}
          {danger.length > 0 && <div className="dropdown-divider" />}
          {danger.map(render)}
        </div>
      )}
    </div>
  );
}

export function Header({ network, networks, onSwitchNetwork, onManageNetworks, siteConnected, onOpenConnections, menu }: HeaderProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '12px 16px',
      background: colors.surface,
      borderBottom: `1px solid ${colors.border}`,
      position: 'relative',
      zIndex: 5,
    }}>
      <Logo size={32} />
      {siteConnected !== undefined && (
        <button
          onClick={onOpenConnections}
          title={siteConnected ? 'Connected to this site' : 'Not connected to this site'}
          style={{ background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', display: 'flex' }}
        >
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: siteConnected ? '#28a745' : 'transparent',
            border: `2px solid ${siteConnected ? '#28a745' : colors.muted}`,
            boxShadow: siteConnected ? '0 0 0 3px rgba(40, 167, 69, 0.2)' : 'none',
          }} />
        </button>
      )}
      <NetworkPicker network={network} networks={networks} onSwitchNetwork={onSwitchNetwork} onManageNetworks={onManageNetworks} />
      <Menu items={menu} />
    </div>
  );
}

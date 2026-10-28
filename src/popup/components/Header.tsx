import React from 'react';
import { NetworkInfo } from '../../shared/types';
import { Logo } from './Logo';
import { colors } from '../styles';

interface HeaderProps {
  network: NetworkInfo;
  networks: NetworkInfo[];
  onSwitchNetwork: (key: string) => void;
  onManageNetworks: () => void;
  onLock: () => void;
}

const MANAGE = '__manage__';

export function Header({ network, networks, onSwitchNetwork, onManageNetworks, onLock }: HeaderProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
      padding: '12px 16px',
      background: colors.surface,
      borderBottom: `1px solid ${colors.border}`
    }}>
      <Logo size={32} />
      <select
        value={network.key}
        onChange={(e) => (e.target.value === MANAGE ? onManageNetworks() : onSwitchNetwork(e.target.value))}
        style={{
          flex: 1,
          minWidth: 0,
          padding: '6px 10px',
          background: colors.bg,
          color: '#fff',
          border: `1px solid ${colors.border}`,
          borderRadius: '16px',
          fontSize: '12px',
          cursor: 'pointer',
        }}
      >
        {networks.map((n) => (
          <option key={n.key} value={n.key}>{n.name}</option>
        ))}
        <option value={MANAGE}>+ Add / manage networks</option>
      </select>
      <button
        onClick={onLock}
        title="Lock wallet"
        style={{
          background: 'transparent',
          border: `1px solid ${colors.border}`,
          borderRadius: '16px',
          color: colors.muted,
          padding: '6px 10px',
          fontSize: '12px',
          cursor: 'pointer',
        }}
      >
        🔒 Lock
      </button>
    </div>
  );
}

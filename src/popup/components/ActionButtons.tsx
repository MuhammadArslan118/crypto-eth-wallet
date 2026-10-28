import React from 'react';
import { colors } from '../styles';

interface ActionButtonsProps {
  onSend: () => void;
  onReceive: () => void;
}

export function ActionButtons({ onSend, onReceive }: ActionButtonsProps) {
  const actions = [
    { label: 'Send', icon: '↗', onClick: onSend },
    { label: 'Receive', icon: '↙', onClick: onReceive },
    { label: 'Swap', icon: '⇄' },
    { label: 'Bridge', icon: '🌉' },
  ];

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-around',
      padding: '12px 16px 16px',
      background: colors.surface,
      borderBottom: `1px solid ${colors.border}`
    }}>
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.onClick}
          disabled={!action.onClick}
          title={action.onClick ? action.label : 'Coming soon'}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            padding: '4px'
          }}
        >
          <div style={{
            width: '40px',
            height: '40px',
            background: colors.primary,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px'
          }}>
            {action.icon}
          </div>
          {action.label}
        </button>
      ))}
    </div>
  );
}

import React from 'react';
import { colors } from '../styles';

type Severity = 'danger' | 'warning' | 'info' | 'success';

const tones: Record<Severity, { color: string; icon: string }> = {
  danger: { color: colors.danger, icon: '⛔' },
  warning: { color: colors.warning, icon: '⚠️' },
  info: { color: colors.primary, icon: 'ℹ️' },
  success: { color: '#28a745', icon: '✅' },
};

// Banner used for every error/warning in the popup so they all look the same
export function Alert({ severity, title, children }: { severity: Severity; title?: string; children?: React.ReactNode }) {
  const tone = tones[severity];
  return (
    <div
      role={severity === 'danger' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: '8px',
        border: `1px solid ${tone.color}`,
        borderLeftWidth: '4px',
        background: `${tone.color}1a`,
        fontSize: '13px',
        lineHeight: 1.4,
        wordBreak: 'break-word',
      }}
    >
      <span aria-hidden>{tone.icon}</span>
      <div style={{ minWidth: 0 }}>
        {title && <div style={{ fontWeight: 600, marginBottom: children ? '2px' : 0 }}>{title}</div>}
        {children}
      </div>
    </div>
  );
}

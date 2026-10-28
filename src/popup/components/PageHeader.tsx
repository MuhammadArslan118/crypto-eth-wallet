import React from 'react';
import { colors, linkButton } from '../styles';

// Back arrow + centred title used at the top of sub-pages
export function PageHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <button onClick={onBack} title="Back" style={{ ...linkButton, fontSize: '18px', width: '28px' }}>←</button>
      <div style={{ flex: 1, textAlign: 'center' }}>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {subtitle && <div style={{ fontSize: '11px', color: colors.muted }}>{subtitle}</div>}
      </div>
      <span style={{ width: '28px' }} />
    </div>
  );
}

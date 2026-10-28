import type { CSSProperties } from 'react';

export const colors = {
  bg: '#141618',
  surface: '#24272a',
  border: '#3b4046',
  muted: '#9fa6ae',
  primary: '#037dd6',
  danger: '#d73a49',
  warning: '#f0b429',
  brand: 'linear-gradient(135deg, #6c5ce7 0%, #00b894 100%)',
};

export const primaryButton: CSSProperties = {
  width: '100%',
  padding: '12px',
  background: colors.primary,
  color: '#fff',
  border: 'none',
  borderRadius: '999px',
  fontSize: '15px',
  fontWeight: 600,
  cursor: 'pointer',
};

export const secondaryButton: CSSProperties = {
  ...primaryButton,
  background: 'transparent',
  color: colors.primary,
  border: `1px solid ${colors.primary}`,
};

export const linkButton: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: colors.primary,
  cursor: 'pointer',
  fontSize: '14px',
  padding: 0,
};

export const input: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
  color: '#fff',
};

export const label: CSSProperties = { display: 'block', marginBottom: '6px', fontSize: '14px' };

export const errorText: CSSProperties = { color: colors.danger, fontSize: '13px', margin: 0 };

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

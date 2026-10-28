import React from 'react';
import { colors } from '../styles';

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div style={{
      width: size,
      height: size,
      background: colors.brand,
      borderRadius: size / 4,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.55,
      flexShrink: 0,
    }}>👛</div>
  );
}

import React from 'react';
import { FeeEstimate, GasSpeed } from '../../shared/types';
import { formatAmount } from './AccountOverview';
import { colors } from '../styles';

// Sepolia gas can be a few wei, which would show as "0.00 gwei"
function formatGasPrice(gwei: string) {
  const n = Number(gwei);
  if (n > 0 && n < 0.01) return `${Math.round(n * 1e9).toLocaleString()} wei`;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} gwei`;
}

const SPEEDS: { key: GasSpeed; icon: string; label: string; hint: string }[] = [
  { key: 'low', icon: '🐢', label: 'Low', hint: 'Cheaper, but may take a while to confirm' },
  { key: 'market', icon: '🚗', label: 'Market', hint: 'Recommended for most transactions' },
  { key: 'aggressive', icon: '🚀', label: 'Aggressive', hint: 'Pays more to confirm as fast as possible' },
];

interface GasSummaryProps {
  fee: FeeEstimate | null;
  // Shown as "Total" (amount + fee) when the amount is in the native currency
  nativeAmount?: string;
  // Pass both to show the Low / Market / Aggressive picker
  speed?: GasSpeed;
  onSpeedChange?: (speed: GasSpeed) => void;
}

export function GasSummary({ fee, nativeAmount, speed, onSpeedChange }: GasSummaryProps) {
  const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '8px' };
  return (
    <div style={{ padding: '12px', background: colors.surface, borderRadius: '8px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {speed && onSpeedChange && (
        <>
          <div style={{ display: 'flex', gap: '4px', padding: '3px', background: colors.bg, borderRadius: '8px' }}>
            {SPEEDS.map((s) => (
              <button
                key={s.key}
                onClick={() => onSpeedChange(s.key)}
                style={{
                  flex: 1, padding: '6px 4px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                  background: speed === s.key ? colors.primary : 'transparent', color: '#fff',
                }}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: colors.muted }}>{SPEEDS.find((s) => s.key === speed)?.hint}</div>
        </>
      )}
      {!fee ? (
        <span style={{ color: colors.muted }}>Estimating gas…</span>
      ) : (
        <>
          <div style={rowStyle}>
            <span style={{ color: colors.muted }}>Estimated network fee</span>
            <b>{formatAmount(fee.estimatedFee)} {fee.symbol}</b>
          </div>
          <div style={{ ...rowStyle, fontSize: '12px', color: colors.muted }}>
            <span>Max fee</span>
            <span>{formatAmount(fee.maxFee)} {fee.symbol}</span>
          </div>
          <div style={{ ...rowStyle, fontSize: '12px', color: colors.muted }}>
            <span>Gas limit · price</span>
            <span>{Number(fee.gasLimit).toLocaleString()} · {formatGasPrice(fee.gasPriceGwei)}</span>
          </div>
          {nativeAmount !== undefined && (
            <div style={{ ...rowStyle, borderTop: `1px solid ${colors.border}`, paddingTop: '6px' }}>
              <span>Total (amount + fee)</span>
              <b>{formatAmount(String(Number(nativeAmount || 0) + Number(fee.estimatedFee)))} {fee.symbol}</b>
            </div>
          )}
        </>
      )}
    </div>
  );
}

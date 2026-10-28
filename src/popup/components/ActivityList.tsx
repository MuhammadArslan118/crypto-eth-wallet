import React, { useEffect, useState } from 'react';
import { send } from '../api';
import { ActivityItem, FeeEstimate, NetworkInfo } from '../../shared/types';
import { Alert } from './Alert';
import { GasSummary } from './GasSummary';
import { formatAmount } from './AccountOverview';
import { colors, primaryButton, secondaryButton, shortAddress } from '../styles';

type ReplaceKind = 'speedup' | 'cancel';

const statusColor: Record<ActivityItem['status'], string> = {
  pending: colors.warning,
  confirmed: '#28a745',
  failed: colors.danger,
  cancelled: colors.muted,
  replaced: colors.muted,
  dropped: colors.muted,
};

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  width: '100%',
  padding: '10px 0',
  color: '#fff',
  fontSize: '14px',
  textDecoration: 'none',
};

const smallButton: React.CSSProperties = { ...secondaryButton, width: 'auto', padding: '4px 12px', fontSize: '12px' };

function title(a: ActivityItem) {
  if (a.kind === 'cancel') return 'Cancel transaction';
  if (a.nft) return 'Send NFT';
  return a.origin === 'wallet' ? `Send ${a.symbol}` : 'Contract interaction';
}

// Confirms a speed-up / cancel after showing what the replacement will cost
function ReplacePanel({ item, kind, onClose, onDone }: { item: ActivityItem; kind: ReplaceKind; onClose: () => void; onDone: () => void }) {
  const [fee, setFee] = useState<FeeEstimate | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    send<FeeEstimate>('ESTIMATE_REPLACEMENT', { hash: item.hash, kind }).then(setFee).catch((e) => setError(e.message));
  }, [item.hash, kind]);

  const confirm = async () => {
    setError('');
    setBusy(true);
    try {
      await send('REPLACE_TX', { hash: item.hash, kind });
      onDone();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', marginBottom: '10px', border: `1px solid ${colors.border}`, borderRadius: '8px' }}>
      <div style={{ fontWeight: 600 }}>{kind === 'speedup' ? '🚀 Speed up transaction' : '✖ Cancel transaction'}</div>
      <div style={{ fontSize: '12px', color: colors.muted }}>
        {kind === 'speedup'
          ? 'Sends the same transaction again with a higher fee, so miners pick it up sooner.'
          : 'Sends 0 to yourself with a higher fee using the same nonce. If it confirms first, the original can never go through.'}
      </div>
      {!error && <GasSummary fee={fee} />}
      {fee?.balanceError && <Alert severity="danger" title="Insufficient funds">{fee.balanceError}</Alert>}
      {error && <Alert severity="danger">{error}</Alert>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onClose} style={secondaryButton}>Back</button>
        <button onClick={confirm} disabled={busy || !fee || !!fee.balanceError} style={primaryButton}>{busy ? 'Submitting…' : 'Submit'}</button>
      </div>
    </div>
  );
}

export function ActivityList({ items, network, onChanged }: { items: ActivityItem[]; network: NetworkInfo; onChanged: () => void }) {
  const [replacing, setReplacing] = useState<{ hash: string; kind: ReplaceKind } | null>(null);

  // One row per action, like MetaMask: only the newest pending tx per nonce (items are newest first),
  // and no sped-up originals, finished cancel txs or replacements that lost the race
  const seenNonces = new Set<number>();
  const visible = items.filter((i) => {
    if (i.status === 'pending' && i.nonce !== undefined) {
      if (seenNonces.has(i.nonce)) return false;
      seenNonces.add(i.nonce);
    }
    return i.status !== 'replaced' && !(i.kind === 'cancel' && i.status === 'confirmed') && !(i.replaces && i.status === 'dropped');
  });

  if (visible.length === 0) {
    return <div style={{ textAlign: 'center', color: colors.muted, padding: '24px 20px', fontSize: '14px' }}>📊<br />No activity yet</div>;
  }

  return (
    <>
      {visible.map((a) => {
        const canReplace = a.status === 'pending' && a.nonce !== undefined && !!a.tx;
        const panel = replacing?.hash === a.hash ? replacing : null;
        return (
          <div key={a.hash} style={{ borderBottom: `1px solid ${colors.border}` }}>
            <a href={network.explorer ? `${network.explorer}/tx/${a.hash}` : undefined} target="_blank" rel="noreferrer" style={row}>
              <span style={{ minWidth: 0 }}>
                <div>{title(a)}</div>
                <div style={{ fontSize: '12px', color: statusColor[a.status], textTransform: 'capitalize' }}>
                  {a.status}{a.kind === 'speedup' && a.status === 'pending' ? ' · sped up' : ''} · <span style={{ color: colors.muted }}>{new Date(a.time).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: '11px', color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.to ? `to ${shortAddress(a.to)}` : 'contract deploy'}{a.origin !== 'wallet' ? ` · ${a.origin}` : ''}{a.nonce !== undefined ? ` · nonce ${a.nonce}` : ''}
                </div>
              </span>
              <span style={{ whiteSpace: 'nowrap', fontSize: '13px', color: a.status === 'cancelled' || a.status === 'dropped' ? colors.muted : '#fff', textDecoration: a.status === 'cancelled' ? 'line-through' : 'none' }}>
                {a.kind === 'cancel' ? '' : a.nft ? `${a.symbol}${a.amount !== '1' ? ` ×${a.amount}` : ''}` : `-${formatAmount(a.amount)} ${a.symbol}`}
              </span>
            </a>
            {canReplace && !panel && (
              <div style={{ display: 'flex', gap: '8px', paddingBottom: '10px' }}>
                <button onClick={() => setReplacing({ hash: a.hash, kind: 'speedup' })} style={smallButton}>
                  {a.kind === 'cancel' ? 'Speed up cancellation' : 'Speed up'}
                </button>
                {a.kind !== 'cancel' && (
                  <button onClick={() => setReplacing({ hash: a.hash, kind: 'cancel' })} style={{ ...smallButton, color: colors.danger, borderColor: colors.danger }}>
                    Cancel
                  </button>
                )}
              </div>
            )}
            {panel && (
              <ReplacePanel
                item={a}
                kind={panel.kind}
                onClose={() => setReplacing(null)}
                onDone={() => { setReplacing(null); onChanged(); }}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

import React, { useEffect, useState } from 'react';
import { send } from '../api';
import { ActivityItem, NftInfo, SendAsset, TokenInfo, WalletState } from '../../shared/types';
import { formatAmount } from '../components/AccountOverview';
import { Alert } from '../components/Alert';
import { ActivityList } from '../components/ActivityList';
import { colors, linkButton, shortAddress } from '../styles';

export type Tab = 'tokens' | 'nfts' | 'activity';

interface HomeProps {
  state: WalletState;
  nativeBalance: string | null;
  tab: Tab;
  onTabChange: (tab: Tab) => void;
  onSendAsset: (asset: SendAsset) => void;
  onOpenNft: (nft: NftInfo) => void;
  onImportToken: () => void;
  onImportNft: () => void;
}

const row: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  width: '100%',
  padding: '10px 0',
  background: 'transparent',
  border: 'none',
  borderBottom: `1px solid ${colors.border}`,
  color: '#fff',
  fontSize: '14px',
  textAlign: 'left',
  textDecoration: 'none',
  cursor: 'pointer',
};

const empty: React.CSSProperties = { textAlign: 'center', color: colors.muted, padding: '24px 20px', fontSize: '14px' };

function TokenIcon({ symbol }: { symbol: string }) {
  return (
    <div style={{ width: 32, height: 32, borderRadius: '50%', background: colors.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, flexShrink: 0 }}>
      {symbol.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function Home({ state, nativeBalance, tab, onTabChange, onSendAsset, onOpenNft, onImportToken, onImportNft }: HomeProps) {
  const [tokens, setTokens] = useState<TokenInfo[] | null>(null);
  const [nfts, setNfts] = useState<NftInfo[] | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setError('');
    const fail = (e: Error) => setError(e.message);
    if (tab === 'tokens') send<TokenInfo[]>('GET_TOKENS').then(setTokens).catch(fail);
    if (tab === 'nfts') send<NftInfo[]>('GET_NFTS').then(setNfts).catch(fail);
    if (tab === 'activity') send<ActivityItem[]>('GET_ACTIVITY').then(setActivity).catch(fail);
  }, [tab, state.selectedAddress, state.network.key, reload]);

  // Poll while transactions are pending so their status updates live
  useEffect(() => {
    if (tab !== 'activity' || !activity?.some((a) => a.status === 'pending')) return;
    const timer = setTimeout(() => setReload((n) => n + 1), 4000);
    return () => clearTimeout(timer);
  }, [tab, activity]);

  const hideToken = (e: React.MouseEvent, address: string) => {
    e.stopPropagation();
    send('REMOVE_TOKEN', { address }).then(() => setReload((n) => n + 1)).catch((err) => setError(err.message));
  };

  return (
    <div>
      <div style={{ display: 'flex', borderBottom: `1px solid ${colors.border}` }}>
        {(['tokens', 'nfts', 'activity'] as const).map((t) => (
          <button
            key={t}
            onClick={() => onTabChange(t)}
            style={{
              flex: 1,
              padding: '12px',
              background: 'transparent',
              border: 'none',
              color: tab === t ? colors.primary : colors.muted,
              borderBottom: tab === t ? `2px solid ${colors.primary}` : '2px solid transparent',
              cursor: 'pointer',
              fontSize: '14px',
              textTransform: t === 'nfts' ? 'uppercase' : 'capitalize'
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: '4px 16px 16px' }}>
        {error && <div style={{ paddingTop: '8px' }}><Alert severity="danger">{error}</Alert></div>}

        {tab === 'tokens' && (
          <>
            <button onClick={() => onSendAsset({ type: 'native' })} title={`Send ${state.network.symbol}`} style={row}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <TokenIcon symbol="ETH" />
                {state.network.symbol}
              </span>
              <span>{formatAmount(nativeBalance)}</span>
            </button>
            {tokens?.map((t) => (
              <button key={t.address} onClick={() => onSendAsset({ type: 'token', address: t.address })} title={`Send ${t.symbol}`} style={row}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <TokenIcon symbol={t.symbol} />
                  <span style={{ minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.symbol}</div>
                    {t.name && <div style={{ fontSize: '11px', color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {t.balance === undefined ? <span style={{ color: colors.danger, fontSize: '12px' }}>unavailable</span> : formatAmount(t.balance)}
                  <span onClick={(e) => hideToken(e, t.address)} title="Hide token" style={{ color: colors.muted, padding: '0 4px' }}>✕</span>
                </span>
              </button>
            ))}
            <div style={{ textAlign: 'center', paddingTop: '16px' }}>
              <button onClick={onImportToken} style={linkButton}>+ Import tokens</button>
            </div>
          </>
        )}

        {tab === 'nfts' && (
          <>
            {nfts?.length === 0 && <div style={empty}>🖼️<br />No NFTs yet</div>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', paddingTop: '12px' }}>
              {nfts?.map((n) => (
                <button
                  key={`${n.contract}:${n.tokenId}`}
                  onClick={() => onOpenNft(n)}
                  style={{ background: colors.surface, borderRadius: '8px', overflow: 'hidden', border: 'none', padding: 0, color: '#fff', textAlign: 'left', cursor: 'pointer' }}
                >
                  {n.image
                    ? <img src={n.image} alt={n.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                    : <div style={{ width: '100%', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>🖼️</div>}
                  <div style={{ padding: '8px', fontSize: '12px' }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}{n.balance && Number(n.balance) > 1 ? ` ×${n.balance}` : ''}</div>
                    <div style={{ color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.collection ?? shortAddress(n.contract)}</div>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ textAlign: 'center', paddingTop: '16px' }}>
              <button onClick={onImportNft} style={linkButton}>+ Import NFT</button>
            </div>
          </>
        )}

        {tab === 'activity' && activity && (
          <ActivityList items={activity} network={state.network} onChanged={() => setReload((n) => n + 1)} />
        )}
      </div>
    </div>
  );
}

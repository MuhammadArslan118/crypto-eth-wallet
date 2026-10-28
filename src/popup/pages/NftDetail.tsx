import React, { useState } from 'react';
import { send } from '../api';
import { NetworkInfo, NftInfo } from '../../shared/types';
import { Alert } from '../components/Alert';
import { colors, linkButton, primaryButton, secondaryButton, shortAddress } from '../styles';

interface NftDetailProps {
  nft: NftInfo;
  network: NetworkInfo;
  onSend: () => void;
  onDone: () => void;
}

export function NftDetail({ nft, network, onSend, onDone }: NftDetailProps) {
  const [error, setError] = useState('');

  const hide = async () => {
    try {
      await send('REMOVE_NFT', { contract: nft.contract, tokenId: nft.tokenId });
      onDone();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const row = (name: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px' }}>
      <span style={{ color: colors.muted }}>{name}</span>
      <span style={{ textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <button onClick={onDone} style={{ ...linkButton, alignSelf: 'flex-start' }}>← Back</button>
      {nft.image
        ? <img src={nft.image} alt={nft.name} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '12px', background: colors.surface }} />
        : <div style={{ width: '100%', aspectRatio: '1', borderRadius: '12px', background: colors.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px' }}>🖼️</div>}
      <div>
        <div style={{ fontSize: '12px', color: colors.muted }}>{nft.collection ?? 'Unknown collection'}</div>
        <h3 style={{ margin: '2px 0 0' }}>{nft.name}</h3>
      </div>
      {nft.description && <p style={{ fontSize: '13px', color: colors.muted, margin: 0, whiteSpace: 'pre-wrap' }}>{nft.description}</p>}
      <div style={{ padding: '12px', background: colors.surface, borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {row('Token ID', nft.tokenId)}
        {row('Standard', nft.standard)}
        {nft.balance && row('You own', nft.balance)}
        {row('Contract', network.explorer
          ? <a href={`${network.explorer}/address/${nft.contract}`} target="_blank" rel="noreferrer" style={{ color: colors.primary }}>{shortAddress(nft.contract)} ↗</a>
          : shortAddress(nft.contract))}
        {row('Network', network.name)}
      </div>
      {error && <Alert severity="danger">{error}</Alert>}
      <button onClick={onSend} style={primaryButton}>Send</button>
      <button onClick={hide} style={secondaryButton}>Hide NFT</button>
    </div>
  );
}

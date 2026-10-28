import React, { useState } from 'react';
import { send } from '../api';
import { colors, errorText, input, label, linkButton, primaryButton } from '../styles';

interface ImportAssetProps {
  kind: 'token' | 'nft';
  networkName: string;
  onDone: () => void;
}

export function ImportAsset({ kind, networkName, onDone }: ImportAssetProps) {
  const [address, setAddress] = useState('');
  const [tokenId, setTokenId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleImport = async () => {
    setError('');
    setBusy(true);
    try {
      if (kind === 'token') await send('IMPORT_TOKEN', { address: address.trim() });
      else await send('IMPORT_NFT', { contract: address.trim(), tokenId: tokenId.trim() });
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h3 style={{ margin: 0 }}>{kind === 'token' ? 'Import token' : 'Import NFT'}</h3>
      <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>
        {kind === 'token'
          ? `Enter an ERC-20 contract address on ${networkName}. Symbol and decimals are read from the contract.`
          : `Enter an ERC-721 or ERC-1155 contract on ${networkName} and a token ID owned by this account.`}
      </p>
      <div>
        <label style={label}>{kind === 'token' ? 'Token contract address' : 'NFT contract address'}</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" spellCheck={false} style={input} />
      </div>
      {kind === 'nft' && (
        <div>
          <label style={label}>Token ID</label>
          <input value={tokenId} onChange={(e) => setTokenId(e.target.value)} inputMode="numeric" style={input} />
        </div>
      )}
      {error && <p style={errorText}>{error}</p>}
      <button onClick={handleImport} disabled={busy || !address || (kind === 'nft' && !tokenId)} style={primaryButton}>
        {busy ? 'Importing…' : 'Import'}
      </button>
      <button onClick={onDone} style={linkButton}>Cancel</button>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { send } from '../api';
import { ApprovalRequest, FeeEstimate, GasSpeed, WalletState } from '../../shared/types';
import { GasSummary } from '../components/GasSummary';
import { Alert } from '../components/Alert';
import { colors, primaryButton, secondaryButton, shortAddress } from '../styles';

function decodeMessage(message: string) {
  if (!ethers.isHexString(message)) return message;
  try {
    return ethers.toUtf8String(message);
  } catch {
    return message;
  }
}

// Recognise the most common calls so the user sees what a dapp is really asking for
const KNOWN_CALLS = new ethers.Interface([
  'function transfer(address to, uint256 amount)',
  'function approve(address spender, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
  'function setApprovalForAll(address operator, bool approved)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
]);

function describeCall(data?: string): { name: string; args: ethers.Result } | null {
  if (!data || data === '0x') return null;
  try {
    const parsed = KNOWN_CALLS.parseTransaction({ data });
    return parsed ? { name: parsed.name, args: parsed.args } : null;
  } catch {
    return null;
  }
}

const box: React.CSSProperties = {
  padding: '12px',
  background: colors.surface,
  borderRadius: '8px',
  fontSize: '13px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  maxHeight: '220px',
  overflowY: 'auto',
};

const label = (text: string) => <span style={{ color: colors.muted }}>{text}: </span>;

export function Approval({ id, state }: { id: string; state: WalletState }) {
  const [req, setReq] = useState<ApprovalRequest | null | undefined>(undefined);
  const [fee, setFee] = useState<FeeEstimate | null>(null);
  const [feeError, setFeeError] = useState('');
  const [speed, setSpeed] = useState<GasSpeed>('market');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    send<ApprovalRequest | null>('GET_APPROVAL', { id }).then(setReq).catch(() => setReq(null));
  }, [id]);

  useEffect(() => {
    if (req?.type !== 'eth_sendTransaction') return;
    setFee(null);
    setFeeError('');
    send<FeeEstimate>('ESTIMATE_APPROVAL_TX', { id, speed }).then(setFee).catch((e) => setFeeError(e.message));
  }, [req, speed]);

  const resolve = async (approved: boolean) => {
    setBusy(true);
    const extra = req?.type === 'eth_sendTransaction' ? { speed } : {};
    await send('RESOLVE_APPROVAL', { id, approved, ...extra }).catch(() => {});
    window.close();
  };

  // "unlock" only needed the user to unlock, which already happened to get here
  useEffect(() => {
    if (req?.type === 'unlock') resolve(true);
  }, [req]);

  if (req === undefined || req?.type === 'unlock') return <div style={{ padding: '24px', color: colors.muted }}>Loading…</div>;
  if (req === null) {
    return (
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Alert severity="warning" title="Request expired">The site cancelled this request or it was already handled.</Alert>
        <button onClick={() => window.close()} style={primaryButton}>Close</button>
      </div>
    );
  }

  const symbol = state.network.symbol;
  const account = state.accounts.find((a) => a.address === state.selectedAddress);
  let title = '';
  let body: React.ReactNode = null;
  let blocked = false;

  switch (req.type) {
    case 'connect':
      title = 'Connect with My Wallet';
      body = (
        <>
          <div style={box}>
            This site is requesting to:
            {'\n'}• See your address <b>{account?.name} ({shortAddress(state.selectedAddress ?? '')})</b>
            {'\n'}• Request approval for transactions
          </div>
          <Alert severity="info">Only connect to sites you trust. Connecting never moves funds by itself.</Alert>
        </>
      );
      break;

    case 'personal_sign':
      title = 'Signature request';
      body = (
        <>
          <div style={box}>{decodeMessage(req.params[0])}</div>
          <Alert severity="info">Only sign messages from sites you trust. Signing doesn't cost gas.</Alert>
        </>
      );
      break;

    case 'eth_signTypedData_v4': {
      const typed = req.params[1] ?? {};
      title = 'Signature request';
      body = (
        <>
          <div style={{ ...box, fontSize: '12px' }}>
            {typed.domain?.name && <div>{label('Domain')}{typed.domain.name}</div>}
            {typed.primaryType && <div>{label('Type')}{typed.primaryType}</div>}
            {JSON.stringify(typed.message ?? typed, null, 2)}
          </div>
          {/permit/i.test(typed.primaryType ?? '') && (
            <Alert severity="warning" title="Token spending permit">This signature can let the site spend your tokens without another approval.</Alert>
          )}
        </>
      );
      break;
    }

    case 'eth_sendTransaction': {
      const tx = req.params[0] ?? {};
      const value = BigInt(tx.value ?? 0);
      const call = describeCall(tx.data ?? tx.input);
      const unlimited = call?.name === 'approve' && call.args[1] >= ethers.MaxUint256 / 2n;
      title = call ? { transfer: 'Transfer request', transferFrom: 'Transfer request', safeTransferFrom: 'Transfer NFT', approve: 'Spending cap request', setApprovalForAll: 'Approve all NFTs' }[call.name] ?? 'Confirm transaction' : value > 0n ? `Send ${symbol}` : 'Contract interaction';
      blocked = !!fee?.balanceError || !!feeError;
      body = (
        <>
          <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div>{label('From')}{account?.name} ({shortAddress(state.selectedAddress ?? '')})</div>
            <div>{label(call ? 'Contract' : 'To')}{tx.to ?? 'New contract deployment'}</div>
            {value > 0n && <div>{label('Amount')}<b>{ethers.formatEther(value)} {symbol}</b></div>}
            {call?.name === 'transfer' && <div>{label('Token recipient')}{call.args[0]}</div>}
            {call?.name === 'approve' && <div>{label('Spender')}{call.args[0]}{'\n'}{label('Amount')}{unlimited ? 'Unlimited' : call.args[1].toString()}</div>}
            {call?.name === 'setApprovalForAll' && <div>{label('Operator')}{call.args[0]}</div>}
            <div>{label('Network')}{state.network.name}</div>
            {!call && tx.data && tx.data !== '0x' && <div style={{ fontSize: '11px', color: colors.muted }}>{label('Data')}{tx.data}</div>}
          </div>
          {unlimited && <Alert severity="warning" title="Unlimited spending cap">The site will be able to spend all of this token, now and in the future.</Alert>}
          {call?.name === 'setApprovalForAll' && call.args[1] && (
            <Alert severity="danger" title="Access to all your NFTs">The operator will be able to transfer every NFT you own from this collection.</Alert>
          )}
          <GasSummary fee={fee} nativeAmount={value > 0n ? ethers.formatEther(value) : undefined} speed={speed} onSpeedChange={setSpeed} />
          {fee?.balanceError && <Alert severity="danger" title="Insufficient funds">{fee.balanceError}</Alert>}
          {feeError && <Alert severity="danger" title="This transaction is likely to fail">{feeError}</Alert>}
        </>
      );
      break;
    }

    case 'wallet_addEthereumChain': {
      const chain = req.params[0] ?? {};
      title = 'Add a network?';
      body = (
        <>
          <div style={{ ...box, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div>{label('Name')}{chain.chainName}</div>
            <div>{label('Chain ID')}{Number(chain.chainId)}</div>
            <div>{label('Currency')}{chain.nativeCurrency?.symbol}</div>
            <div>{label('RPC URL')}{chain.rpcUrls?.[0]}</div>
            {chain.blockExplorerUrls?.[0] && <div>{label('Explorer')}{chain.blockExplorerUrls[0]}</div>}
          </div>
          <Alert severity="warning">A malicious network can lie about balances and transactions. Only add networks you trust.</Alert>
        </>
      );
      break;
    }
  }

  const confirmLabel = { connect: 'Connect', eth_sendTransaction: 'Confirm', wallet_addEthereumChain: 'Approve' }[req.type as string] ?? 'Sign';

  return (
    <div style={{ minHeight: '600px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: colors.muted }}>
        <span>{state.network.name}</span>
        <span>{account?.name}</span>
      </div>
      <div style={{ textAlign: 'center', padding: '8px 12px', border: `1px solid ${colors.border}`, borderRadius: '999px', fontSize: '13px', alignSelf: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {req.origin}
      </div>
      <h2 style={{ margin: 0, fontSize: '20px', textAlign: 'center' }}>{title}</h2>
      {body}
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: '12px' }}>
        <button onClick={() => resolve(false)} disabled={busy} style={secondaryButton}>{req.type === 'connect' ? 'Cancel' : 'Reject'}</button>
        <button onClick={() => resolve(true)} disabled={busy || blocked || (req.type === 'eth_sendTransaction' && !fee)} style={primaryButton}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

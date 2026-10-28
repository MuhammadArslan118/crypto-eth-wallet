import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { send } from '../api';
import { AddressInfo, FeeEstimate, NftInfo, SendAsset, SendRequest, TokenInfo, WalletState } from '../../shared/types';
import { Alert } from '../components/Alert';
import { GasSummary } from '../components/GasSummary';
import { formatAmount } from '../components/AccountOverview';
import { colors, input, label, linkButton, primaryButton, secondaryButton, shortAddress } from '../styles';

interface SendFlowProps {
  state: WalletState;
  nativeBalance: string | null;
  initialAsset?: SendAsset;
  onDone: () => void;
  onViewActivity: () => void;
}

// recipient → amount → review → done, like MetaMask's send flow
type Step = 'recipient' | 'amount' | 'review' | 'done';

interface AssetOption {
  key: string;
  asset: SendAsset;
  title: string;
  subtitle: string;
  // Display balance; undefined for NFTs
  balance?: string;
  decimals?: number;
  nft?: NftInfo;
}

const assetKey = (a: SendAsset) =>
  a.type === 'native' ? 'native' : a.type === 'token' ? `token:${a.address}` : `nft:${a.contract}:${a.tokenId}`;

function decimalsOf(value: string) {
  return value.includes('.') ? value.split('.')[1].length : 0;
}

const card: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  padding: '10px 12px',
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: '8px',
  color: '#fff',
  textAlign: 'left',
  cursor: 'pointer',
};

function AssetIcon({ option, size = 32 }: { option: AssetOption; size?: number }) {
  if (option.nft?.image) {
    return <img src={option.nft.image} alt="" style={{ width: size, height: size, borderRadius: '6px', objectFit: 'cover', flexShrink: 0 }} />;
  }
  return (
    <div style={{ width: size, height: size, borderRadius: option.nft ? '6px' : '50%', background: colors.border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, flexShrink: 0 }}>
      {option.nft ? '🖼️' : option.title.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function SendFlow({ state, nativeBalance, initialAsset, onDone, onViewActivity }: SendFlowProps) {
  const [step, setStep] = useState<Step>('recipient');
  const [to, setTo] = useState('');
  const [info, setInfo] = useState<AddressInfo | null>(null);
  const [ackContract, setAckContract] = useState(false);

  const [tokens, setTokens] = useState<TokenInfo[]>([]);
  const [nfts, setNfts] = useState<NftInfo[]>([]);
  const [assetKeySelected, setAssetKeySelected] = useState(assetKey(initialAsset ?? { type: 'native' }));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [isMax, setIsMax] = useState(false);

  const [fee, setFee] = useState<FeeEstimate | null>(null);
  const [feeError, setFeeError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState('');

  const { network } = state;
  const fromAccount = state.accounts.find((a) => a.address === state.selectedAddress);

  useEffect(() => {
    send<TokenInfo[]>('GET_TOKENS').then(setTokens).catch(() => {});
    send<NftInfo[]>('GET_NFTS').then(setNfts).catch(() => {});
  }, []);

  const options: AssetOption[] = [
    { key: 'native', asset: { type: 'native' }, title: network.symbol, subtitle: 'Native currency', balance: nativeBalance ?? undefined, decimals: 18 },
    ...tokens.map((t) => ({
      key: `token:${t.address}`,
      asset: { type: 'token' as const, address: t.address },
      title: t.symbol,
      subtitle: t.name ?? shortAddress(t.address),
      balance: t.balance,
      decimals: t.decimals,
    })),
    ...nfts.map((n) => ({
      key: `nft:${n.contract}:${n.tokenId}`,
      asset: { type: 'nft' as const, contract: n.contract, tokenId: n.tokenId },
      title: n.name ?? `#${n.tokenId}`,
      subtitle: `${n.collection ?? shortAddress(n.contract)} · ${n.standard}${n.balance ? ` · ×${n.balance}` : ''}`,
      nft: n,
    })),
  ];
  const selected = options.find((o) => o.key === assetKeySelected) ?? options[0];
  const isErc721 = selected.nft?.standard === 'ERC721';
  const isErc1155 = selected.nft?.standard === 'ERC1155';
  const isNative = selected.asset.type === 'native';
  const unit = selected.nft ? 'copies' : selected.title;

  // ---------- recipient checks ----------
  const trimmedTo = to.trim();
  const validTo = ethers.isAddress(trimmedTo);
  const looksFinished = trimmedTo.length >= 42 || /[^0-9a-fA-Fx]/.test(trimmedTo);

  useEffect(() => {
    setInfo(null);
    setAckContract(false);
    if (!validTo) return;
    const timer = setTimeout(() => {
      send<AddressInfo>('GET_ADDRESS_INFO', { address: trimmedTo }).then(setInfo).catch(() => setInfo({ isContract: false, isOwnAccount: false }));
    }, 300);
    return () => clearTimeout(timer);
  }, [trimmedTo]);

  const sendingToSelf = validTo && trimmedTo.toLowerCase() === state.selectedAddress?.toLowerCase();
  const recipientReady = validTo && info !== null && (!info.tokenSymbol || ackContract);

  // ---------- amount checks ----------
  const quantity = isErc721 ? '1' : amount;
  let amountError = '';
  if (!isErc721 && amount !== '') {
    const n = Number(amount);
    if (!(n > 0)) amountError = 'Amount must be greater than 0';
    else if (isErc1155 && !/^\d+$/.test(amount)) amountError = 'Quantity must be a whole number';
    else if (selected.decimals !== undefined && decimalsOf(amount) > selected.decimals) amountError = `${selected.title} supports at most ${selected.decimals} decimal places`;
    else if (isErc1155 && selected.nft?.balance && BigInt(amount) > BigInt(selected.nft.balance)) amountError = `You only own ${selected.nft.balance}`;
    else if (!isMax && selected.balance !== undefined && n > Number(selected.balance)) amountError = `Insufficient funds. You have ${formatAmount(selected.balance)} ${selected.title}.`;
  }
  const amountReady = isErc721 || (amount !== '' && !amountError);

  const request: SendRequest = { to: trimmedTo, asset: selected.asset, amount: quantity, max: isMax && isNative };

  const chooseAsset = (key: string) => {
    setAssetKeySelected(key);
    setPickerOpen(false);
    setAmount('');
    setIsMax(false);
  };

  const handleMax = async () => {
    try {
      setAmount(await send<string>('GET_MAX_AMOUNT', { asset: selected.asset, to: trimmedTo }));
      setIsMax(true);
    } catch (e: any) {
      setSubmitError(e.message);
    }
  };

  // ---------- review: estimate gas ----------
  useEffect(() => {
    if (step !== 'review') return;
    setFee(null);
    setFeeError('');
    setSubmitError('');
    send<FeeEstimate>('ESTIMATE_SEND', { request })
      .then(setFee)
      .catch((e) => setFeeError(e.message));
  }, [step]);

  const confirm = async () => {
    setSubmitError('');
    setBusy(true);
    try {
      setHash(await send<string>('SEND_TX', { request }));
      setStep('done');
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const back = { amount: 'recipient', review: 'amount' } as Partial<Record<Step, Step>>;
  const titles: Record<Step, string> = { recipient: 'Send to', amount: 'Select asset', review: 'Review', done: 'Submitted' };
  const ownName = (address: string) => state.accounts.find((a) => a.address.toLowerCase() === address.toLowerCase())?.name;

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px', minHeight: '520px' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={() => back[step] && setStep(back[step]!)} style={{ ...linkButton, visibility: back[step] ? 'visible' : 'hidden', fontSize: '18px' }}>←</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 600 }}>{titles[step]}</div>
          {step !== 'done' && (
            <div style={{ fontSize: '11px', color: colors.muted }}>Step {['recipient', 'amount', 'review'].indexOf(step) + 1} of 3 · {network.name}</div>
          )}
        </div>
        <button onClick={onDone} style={{ ...linkButton, visibility: step === 'done' ? 'hidden' : 'visible' }}>Cancel</button>
      </div>

      {step === 'recipient' && (
        <>
          <div>
            <label style={label}>Recipient address</label>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Public address (0x…)" spellCheck={false} autoFocus style={input} />
          </div>

          {trimmedTo && !validTo && looksFinished && <Alert severity="danger" title="Invalid address">Check the address and try again. Mixed-case addresses must have a valid checksum.</Alert>}
          {info?.tokenSymbol && (
            <Alert severity="danger" title="This is a token contract address">
              You are about to send to the {info.tokenSymbol} contract itself. Assets sent to a token contract are usually lost forever.
              <label style={{ display: 'flex', gap: '6px', marginTop: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={ackContract} onChange={(e) => setAckContract(e.target.checked)} />
                I understand the risk
              </label>
            </Alert>
          )}
          {info?.isContract && !info.tokenSymbol && <Alert severity="warning" title="Smart contract address">Make sure this contract can receive the asset you are sending, or it may be lost.</Alert>}
          {sendingToSelf && <Alert severity="warning">You are sending to the same account you are sending from.</Alert>}
          {info?.isOwnAccount && !sendingToSelf && <Alert severity="info">This is one of your accounts ({ownName(trimmedTo)}).</Alert>}

          {state.accounts.length > 1 && (
            <div>
              <div style={{ ...label, color: colors.muted }}>Your accounts</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {state.accounts.filter((a) => a.address !== state.selectedAddress).map((a) => (
                  <button key={a.address} onClick={() => setTo(a.address)} style={card}>
                    <span style={{ fontWeight: 600 }}>{a.name}</span>
                    <span style={{ color: colors.muted, fontSize: '12px', marginLeft: 'auto' }}>{shortAddress(a.address)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ flex: 1 }} />
          <button onClick={() => setStep('amount')} disabled={!recipientReady} style={primaryButton}>Continue</button>
        </>
      )}

      {step === 'amount' && (
        <>
          <div style={{ fontSize: '12px', color: colors.muted }}>To: {ownName(trimmedTo) ?? ''} {shortAddress(trimmedTo)}</div>
          <div>
            <label style={label}>Asset</label>
            <button onClick={() => setPickerOpen(!pickerOpen)} style={card}>
              <AssetIcon option={selected} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.title}</div>
                <div style={{ fontSize: '12px', color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selected.balance !== undefined ? `Balance: ${formatAmount(selected.balance)}` : selected.subtitle}
                </div>
              </span>
              <span>{pickerOpen ? '▴' : '▾'}</span>
            </button>
            {pickerOpen && (
              <div style={{ marginTop: '6px', maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {options.map((o) => (
                  <button key={o.key} onClick={() => chooseAsset(o.key)} style={{ ...card, borderColor: o.key === selected.key ? colors.primary : colors.border }}>
                    <AssetIcon option={o} size={28} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.title}</div>
                      <div style={{ fontSize: '11px', color: colors.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.subtitle}</div>
                    </span>
                    {o.balance !== undefined && <span style={{ fontSize: '12px' }}>{formatAmount(o.balance)}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {isErc721 ? (
            <Alert severity="info">ERC-721 NFTs are unique, so the whole NFT will be sent.</Alert>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label style={label}>{isErc1155 ? 'Quantity' : 'Amount'}</label>
                {isErc1155 && <span style={{ fontSize: '12px', color: colors.muted }}>You own {selected.nft?.balance ?? '?'}</span>}
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  type="number"
                  min="0"
                  step={isErc1155 ? '1' : 'any'}
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setIsMax(false); }}
                  placeholder={isErc1155 ? '1' : '0'}
                  style={{ ...input, paddingRight: '64px', borderColor: amountError ? colors.danger : colors.border }}
                />
                <button
                  onClick={handleMax}
                  style={{
                    position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
                    background: isMax ? colors.primary : colors.border, color: '#fff', border: 'none',
                    borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  MAX
                </button>
              </div>
              {isMax && isNative && <div style={{ fontSize: '11px', color: colors.muted, marginTop: '4px' }}>The network fee will be deducted from this amount.</div>}
            </div>
          )}
          {amountError && <Alert severity="danger">{amountError}</Alert>}
          {submitError && <Alert severity="danger">{submitError}</Alert>}
          {!isNative && nativeBalance !== null && Number(nativeBalance) === 0 && (
            <Alert severity="warning" title={`No ${network.symbol} for gas`}>
              Sending tokens or NFTs still costs a network fee paid in {network.symbol}.
            </Alert>
          )}

          <div style={{ flex: 1 }} />
          <button onClick={() => setStep('review')} disabled={!amountReady} style={primaryButton}>Continue</button>
        </>
      )}

      {step === 'review' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <div style={{ ...card, cursor: 'default', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', flex: 1, minWidth: 0 }}>
              <span style={{ color: colors.muted, fontSize: '11px' }}>From</span>
              <span style={{ fontWeight: 600 }}>{fromAccount?.name}</span>
              <span style={{ fontSize: '11px', color: colors.muted }}>{shortAddress(state.selectedAddress ?? '')}</span>
            </div>
            <span>→</span>
            <div style={{ ...card, cursor: 'default', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', flex: 1, minWidth: 0 }}>
              <span style={{ color: colors.muted, fontSize: '11px' }}>To</span>
              <span style={{ fontWeight: 600 }}>{ownName(trimmedTo) ?? 'Recipient'}</span>
              <span style={{ fontSize: '11px', color: colors.muted }}>{shortAddress(trimmedTo)}</span>
            </div>
          </div>

          <div style={{ ...card, cursor: 'default', justifyContent: 'center', flexDirection: 'column', padding: '16px' }}>
            {selected.nft ? (
              <>
                <AssetIcon option={selected} size={72} />
                <div style={{ fontWeight: 600 }}>{selected.title}</div>
                <div style={{ fontSize: '12px', color: colors.muted }}>{isErc1155 ? `Quantity: ${quantity}` : selected.subtitle}</div>
              </>
            ) : (
              <div style={{ fontSize: '24px', fontWeight: 700, wordBreak: 'break-all', textAlign: 'center' }}>
                {isMax && isNative ? `Max ${network.symbol}` : `${formatAmount(amount)} ${selected.title}`}
              </div>
            )}
          </div>

          <GasSummary fee={fee} nativeAmount={isNative && !isMax ? amount : undefined} />
          {fee?.balanceError && <Alert severity="danger" title="Insufficient funds">{fee.balanceError}</Alert>}
          {feeError && (
            <Alert severity="danger" title="Unable to send">{feeError}</Alert>
          )}
          {submitError && <Alert severity="danger" title="Transaction failed">{submitError}</Alert>}

          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onDone} style={secondaryButton}>Reject</button>
            <button onClick={confirm} disabled={busy || !fee || !!fee.balanceError || !!feeError} style={primaryButton}>
              {busy ? 'Sending…' : 'Confirm'}
            </button>
          </div>
        </>
      )}

      {step === 'done' && (
        <>
          <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
            <div style={{ fontSize: '48px' }}>🚀</div>
            <h3 style={{ margin: '8px 0 4px' }}>Transaction submitted</h3>
            <p style={{ fontSize: '13px', color: colors.muted, margin: 0 }}>
              It usually confirms within a few seconds. You can follow it in Activity.
            </p>
          </div>
          {network.explorer && (
            <a href={`${network.explorer}/tx/${hash}`} target="_blank" rel="noreferrer" style={{ fontSize: '13px', textAlign: 'center', color: colors.primary }}>
              View on block explorer ↗
            </a>
          )}
          <code style={{ fontSize: '11px', wordBreak: 'break-all', color: colors.muted, textAlign: 'center' }}>{hash}</code>
          <div style={{ flex: 1 }} />
          <button onClick={onViewActivity} style={primaryButton}>View activity</button>
          <button onClick={onDone} style={secondaryButton}>Close</button>
        </>
      )}
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Header } from './components/Header';
import { AccountOverview } from './components/AccountOverview';
import { ActionButtons } from './components/ActionButtons';
import { Home, Tab } from './pages/Home';
import { Onboarding } from './pages/Onboarding';
import { Unlock } from './pages/Unlock';
import { SendFlow } from './pages/SendFlow';
import { NftDetail } from './pages/NftDetail';
import { Alert } from './components/Alert';
import { Receive } from './pages/Receive';
import { Approval } from './pages/Approval';
import { Accounts } from './pages/Accounts';
import { ImportAsset } from './pages/ImportAsset';
import { Networks } from './pages/Networks';
import { send } from './api';
import { NftInfo, SendAsset, WalletState } from '../shared/types';
import { colors, errorText } from './styles';

// Approval windows are opened by the background as popup.html#approval=<id>
const approvalId = new URLSearchParams(location.hash.slice(1)).get('approval');

type View = 'home' | 'send' | 'receive' | 'accounts' | 'networks' | 'importToken' | 'importNft' | 'nft';

function Wallet({ state, refresh }: { state: WalletState; refresh: () => void }) {
  const [view, setView] = useState<View>('home');
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('homeTab') as Tab) || 'tokens');
  const [sendAsset, setSendAsset] = useState<SendAsset | undefined>();
  const [nft, setNft] = useState<NftInfo | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState('');

  useEffect(() => {
    setBalance(null);
    setBalanceError('');
    send<string>('GET_BALANCE').then(setBalance).catch((e) => setBalanceError(e.message));
  }, [state.selectedAddress, state.network.key, view]);

  const address = state.selectedAddress!;
  const account = state.accounts.find((a) => a.address === address);
  const home = () => setView('home');
  const changeTab = (t: Tab) => {
    setTab(t);
    localStorage.setItem('homeTab', t);
  };
  const startSend = (asset?: SendAsset) => {
    setSendAsset(asset);
    setView('send');
  };

  return (
    <>
      <Header
        network={state.network}
        networks={state.networks}
        onSwitchNetwork={(key) => send('SWITCH_NETWORK', { network: key }).then(refresh)}
        onManageNetworks={() => setView('networks')}
        onLock={() => send('LOCK').then(refresh)}
      />
      {view === 'home' && (
        <>
          <AccountOverview
            name={account?.name ?? 'Account'}
            address={address}
            balance={balance}
            symbol={state.network.symbol}
            onOpenAccounts={() => setView('accounts')}
          />
          {balanceError && <div style={{ padding: '0 16px 8px' }}><Alert severity="danger" title="Couldn't load balance">{balanceError}</Alert></div>}
          <ActionButtons onSend={() => startSend()} onReceive={() => setView('receive')} />
          <Home
            state={state}
            nativeBalance={balance}
            tab={tab}
            onTabChange={changeTab}
            onSendAsset={startSend}
            onOpenNft={(n) => { setNft(n); setView('nft'); }}
            onImportToken={() => setView('importToken')}
            onImportNft={() => setView('importNft')}
          />
        </>
      )}
      {view === 'send' && (
        <SendFlow
          state={state}
          nativeBalance={balance}
          initialAsset={sendAsset}
          onDone={home}
          onViewActivity={() => { changeTab('activity'); home(); }}
        />
      )}
      {view === 'nft' && nft && (
        <NftDetail
          nft={nft}
          network={state.network}
          onSend={() => startSend({ type: 'nft', contract: nft.contract, tokenId: nft.tokenId })}
          onDone={() => { changeTab('nfts'); home(); }}
        />
      )}
      {view === 'networks' && <Networks state={state} onChange={refresh} onDone={home} />}
      {view === 'receive' && <Receive address={address} onDone={home} />}
      {view === 'accounts' && <Accounts state={state} onChange={refresh} onDone={home} />}
      {view === 'importToken' && <ImportAsset kind="token" networkName={state.network.name} onDone={home} />}
      {view === 'importNft' && <ImportAsset kind="nft" networkName={state.network.name} onDone={home} />}
    </>
  );
}

function App() {
  const [state, setState] = useState<WalletState | null>(null);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);

  const refresh = useCallback(() => {
    send<WalletState>('GET_STATE')
      .then((s) => {
        setState(s);
        setRestoring(false);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(refresh, [refresh]);

  // Approval windows can stay open a while; pinging keeps the MV3 service worker (and the pending request) alive
  useEffect(() => {
    if (!approvalId) return;
    const timer = setInterval(() => send('PING').catch(() => {}), 20000);
    return () => clearInterval(timer);
  }, []);

  let content: React.ReactNode;
  if (error) content = <p style={{ ...errorText, padding: '24px' }}>{error}</p>;
  else if (!state) content = <div style={{ padding: '24px', color: colors.muted }}>Loading…</div>;
  else if (!state.hasVault || restoring) {
    content = (
      <Onboarding
        onComplete={refresh}
        initialMode={restoring ? 'import' : undefined}
        onCancel={restoring ? () => setRestoring(false) : undefined}
      />
    );
  } else if (!state.unlocked) content = <Unlock onUnlock={refresh} onRestore={() => setRestoring(true)} />;
  else if (approvalId) content = <Approval id={approvalId} state={state} />;
  else content = <Wallet state={state} refresh={refresh} />;

  return (
    <div style={{ width: 360, minHeight: 600, background: colors.bg, display: 'flex', flexDirection: 'column' }}>
      {content}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

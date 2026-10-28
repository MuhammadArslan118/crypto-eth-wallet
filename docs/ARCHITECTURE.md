# My Wallet: developer guide

This guide explains how the extension is put together: where code runs, how the pieces talk to each other, and which file or method to open for a given job. Read sections 1–3 first. After that, use the rest as a reference.

---

## 1. Run it

```powershell
npm install
npm run dev          # rebuilds dist/ on every save   (or: npm run build for a one-off build)
npm test             # unit tests (vitest)
npm run typecheck    # tsc --noEmit
npm run dapp         # serves test-dapp/ at http://localhost:5173
```

1. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the `dist/` folder.
2. After changing code, click **↻** on the extension, then refresh any dapp tabs.
   - The popup reloads by itself every time it opens.
   - The **background service worker does not**. If it gets a message type it doesn't know, the popup calls `chrome.runtime.reload()` for you (see [api.ts](../src/popup/api.ts)).
3. Background logs: on the extension card, click **"service worker"**. Popup logs: right-click the popup, then **Inspect**.

---

## 2. The big picture: four runtimes

A browser extension is four separate JavaScript programs. They share no memory and communicate only by sending messages.

```
┌──────────── web page (dapp) ────────────┐
│  inpage.js  (MAIN world)                │   window.ethereum / window.myWallet
│     ▲  window.postMessage               │
│     ▼                                   │
│  content.js (isolated world)            │   relay only
└─────┼───────────────────────────────────┘
      │ chrome.runtime.connect (Port "mywallet-contentscript")
      ▼
┌──────────── background.js (service worker) ────────────┐
│  index.ts ─► WalletController ─► RpcProvider ─► RPC     │   holds keys, signs, talks to chain
│               │    └─► assets.ts (tokens/NFTs/activity) │
│               └─► ApprovalManager ── opens window ──┐   │
└──────────▲──────────────────────────────────────────┼───┘
           │ chrome.runtime.sendMessage({type})       │
┌──────────┴──────────── popup.js (React) ────────────▼───┐
│  main.tsx ─► pages/* ─► api.ts send()                    │   toolbar popup AND approval windows
└──────────────────────────────────────────────────────────┘
```

| Runtime | Entry file | Built to | What it can do |
|---|---|---|---|
| **Background** (service worker) | [src/background/index.ts](../src/background/index.ts) | `dist/background.js` (ES module) | The only place that holds decrypted keys, signs, and calls RPCs. Chrome stops it after ~30 s idle. |
| **Popup** (React UI) | [src/popup/main.tsx](../src/popup/main.tsx) | `dist/popup.js` | The wallet UI. Also used for dapp approval windows (`popup.html#approval=<id>`). |
| **Content script** | [src/content/index.ts](../src/content/index.ts) | `dist/content.js` (IIFE) | Runs inside every page but isolated from the page's JS. Relays messages only. |
| **Inpage provider** | [src/inpage/index.ts](../src/inpage/index.ts) | `dist/inpage.js` (IIFE) | Runs in the page's own JS world. Exposes `window.ethereum` and `window.myWallet` and announces itself via EIP-6963. |

**Rule of thumb:** UI work goes in `src/popup`, wallet and chain logic goes in `src/background`. The popup never touches keys or RPCs directly. It always calls `send('SOME_TYPE', payload)` and the background does the work.

### Build

[scripts/build.mjs](../scripts/build.mjs) runs Vite three times:
- background + popup use [vite.config.ts](../vite.config.ts) and are emitted as ES modules;
- content and inpage are each built as a single **IIFE** with no imports, because Chrome can't load content scripts as modules.

[public/manifest.json](../public/manifest.json) and [public/popup.html](../public/popup.html) are copied as-is. `inpage.js` is injected through the manifest with `"world": "MAIN"`, so it runs before the page's own scripts.

---

## 3. Where to start reading

Read in this order. Each step builds on the previous one.

1. [src/shared/types.ts](../src/shared/types.ts): every data shape that crosses a message boundary (`WalletState`, `SendRequest`, `FeeEstimate`, `ApprovalRequest`, …).
2. [src/background/index.ts](../src/background/index.ts): the message router. One `switch` maps each popup message `type` to a controller method. A second listener handles dapp requests from content-script ports.
3. [src/background/wallet-controller.ts](../src/background/wallet-controller.ts): the core class. Sections are marked with `// ---------- … ----------` comments.
4. [src/popup/main.tsx](../src/popup/main.tsx): decides which screen to show (onboarding → unlock → approval → wallet) and switches between views.
5. [src/popup/pages/SendFlow.tsx](../src/popup/pages/SendFlow.tsx): the best example of a full feature, going from UI to validation to background to chain.

---

## 4. Background in detail

### 4.1 `index.ts`: the router
- `chrome.runtime.onConnect` accepts a Port from each page's content script. The **origin comes from `port.sender`, never from the message**, so a page can't pretend to be another site. Each request goes to `walletController.handleRequest(method, params, origin)`, and the reply is `{ id, result }` or `{ id, error: { code, message } }`.
- `walletController.onEvent` broadcasts `accountsChanged` / `chainChanged` to every connected page. Each page receives only the accounts it is allowed to see.
- `chrome.runtime.onMessage` handles popup messages. It rejects anything that doesn't come from our own extension pages. Errors pass through `friendlyMessage()` before reaching the UI. After each message it calls `scheduleAutoLock()`.
- `chrome.alarms.onAlarm` locks the wallet when the auto-lock alarm fires. `chrome.runtime.onInstalled` opens onboarding in a full tab on first install.

### 4.2 `WalletController`: methods by section

| Section | Method | What it does |
|---|---|---|
| **Lifecycle** | `ensureLoaded()` / `load()` | Loads persisted settings from `chrome.storage.local` and, if the wallet was unlocked, secrets from `chrome.storage.session`. Called before every request because the worker may have just restarted. |
| | `getState()` | Snapshot for the popup: vault exists?, unlocked?, accounts, selected account, current network, network list. |
| **Vault** | `createWallet(pw)` | Generates a 12-word phrase and stores it encrypted. Returns the phrase **once** so it can be backed up. |
| | `importWallet(phrase, pw)` | Normalises and validates the phrase, then replaces the vault. |
| | `unlock(pw)` / `lock()` | Decrypts the vault into memory + session storage, or wipes both. |
| | `persistSecrets()` / `decryptVault()` | The only code that encrypts or decrypts. Uses [keystore.ts](../src/background/keystore/keystore.ts) (PBKDF2 → AES-GCM). |
| **Accounts** | `setSecrets()` | Derives the HD accounts (`m/44'/60'/0'/0/i`) and the imported-key accounts. Keeps their private keys in memory only. |
| | `addAccount()` / `importAccount(key, pw)` / `selectAccount(addr)` | Manage accounts. Importing a key re-encrypts the vault, so it needs the password. |
| | `renameAccount(addr, name)` / `removeAccount(addr, pw)` | Custom names are saved in `accountNames`. Only imported accounts can be removed (HD accounts always come back from the phrase). |
| **Settings & security** | `getSettings()` / `updateSettings(patch)` | Wallet settings (currently the auto-lock timer). |
| | `scheduleAutoLock()` | Called after **every** popup message. It (re)starts a `chrome.alarms` alarm; when it fires, `index.ts` calls `lock()`. An alarm survives worker restarts, unlike `setTimeout`. |
| | `revealSecretPhrase(pw)` / `exportPrivateKey(addr, pw)` / `changePassword(old, new)` | Each one decrypts the vault first, so a wrong password always fails with "Incorrect password". |
| **Networks** | `allNetworks()` / `network()` | Built-in [NETWORKS](../src/shared/constants/networks.ts) merged with user-added ones. |
| | `switchNetwork(key)` | Swaps the `RpcProvider` and emits `chainChanged`. |
| | `addNetwork(input)` / `removeNetwork(key)` | Validates input, checks the RPC really returns that chain ID, then saves. |
| **Send & gas** | `prepareSend(req)` | Turns a popup `SendRequest` into a transaction (ETH, ERC-20 `transfer`, or NFT `safeTransferFrom`). Checks address, decimals, balance and NFT ownership, and **throws user-facing errors**. |
| | `quoteFee(tx, speed)` | Estimates gas and fees at a **speed** (`low` / `market` / `aggressive`, maths in [gas.ts](../src/background/gas.ts)). Returns the `FeeEstimate` for the UI plus the fee fields to send with. Sets `balanceError` when the account can't pay amount + gas. Shared by the Send flow and dapp approvals. |
| | `getMaxAmount(asset)` / `maxNative()` | Value for the MAX button. For ETH it's the balance minus the worst-case gas fee. |
| | `sendFromPopup(req)` | Runs `prepareSend` → `quoteFee` (refuses if `balanceError`) → `sendAndRecord` with the chosen speed's fees. |
| | `sendAndRecord(tx, origin, …)` | Signs and broadcasts through the fallback RPCs, then writes an Activity entry including the **nonce and fee fields** (needed for speed up / cancel). |
| **Speed up / cancel** | `prepareReplacement(hash, kind)` | Builds a tx with the **same nonce** and fees from `replacementFees()` (at least +10%, or today's market fee). Cancel = 0 to yourself. |
| | `estimateReplacement()` / `replaceTransaction()` | Fee preview, then send. Each replacement stores `replaces: <original hash>` and `kind`. |
| | `getAddressInfo(addr)` | Tells the recipient step whether an address is a contract, one of your accounts, or a known token contract. |
| **Dapp API** | `handleRequest(method, params, origin)` | The EIP-1193 implementation (see §6). |
| | `requireApproval(type, origin, params)` | Opens an approval window and waits. Throws code `4001` if the user rejects. |
| | `assertAuthorized(origin, address)` | Site must be connected, and the address must be the selected account. |

### 4.3 Supporting modules

| File | Purpose |
|---|---|
| [rpc/provider.ts](../src/background/rpc/provider.ts) | `RpcProvider.run(fn)` tries each RPC URL in turn. It moves to the next one only on *endpoint* failures (HTTP errors, timeouts), never on real errors such as reverts. Public RPCs disappear or start charging without notice, which is why this exists. |
| [assets.ts](../src/background/assets.ts) | Tokens, NFTs and activity. `importToken`, `importNft` (detects ERC-721 vs ERC-1155 via `supportsInterface` and fetches metadata, rewriting `ipfs://` to a gateway), `buildTokenTransfer`, `buildNftTransfer`, `parseAmount`, `addActivity`, `clearActivity`, `getActivity` (checks receipts for pending transactions, marks a tx `dropped` once its nonce is used by another tx, marks originals `replaced` / `cancelled` when their replacement confirms, and drops sent NFTs once confirmed). |
| [gas.ts](../src/background/gas.ts) | Pure fee maths, unit tested: `marketFromFeeData`, `feesForSpeed` (Low 1.1× base + 0.8× tip, Market 2× + 1×, Aggressive 2.5× + 1.5×; legacy chains scale `gasPrice`), `replacementFees`. |
| [approvals/approval-manager.ts](../src/background/approvals/approval-manager.ts) | `request()` opens `popup.html#approval=<id>` in a window and returns a `Promise<ApprovalResult>` (`{ approved, speed? }`). Closing the window counts as reject. |
| [errors.ts](../src/background/errors.ts) | `RpcError` (EIP-1193 codes) and `friendlyMessage(e)`, which maps ethers/node errors to plain English. **Add new error wording here.** |
| [wallet/hd-wallet.ts](../src/background/wallet/hd-wallet.ts) | BIP-39 phrase generation/validation and BIP-44 key derivation. |
| [keystore/keystore.ts](../src/background/keystore/keystore.ts) | `encrypt` / `decrypt` with WebCrypto (PBKDF2-SHA256, 100k iterations → AES-256-GCM). |

---

## 5. Popup in detail

### 5.1 Screen selection ([main.tsx](../src/popup/main.tsx))
`App` loads `GET_STATE` and then picks a screen:

```
no vault ─────────► Onboarding (create or import; opens in a tab on first install)
locked ───────────► Unlock   (or "Restore" → Onboarding in import mode)
#approval=<id> ───► Approval (dapp request window)
otherwise ────────► Wallet   (Header + one of the views below)
```

`Wallet` keeps a `view` state: `home | send | receive | accounts | accountDetails | networks | settings | importToken | importNft | nft`.

**Expand view.** The same `popup.html` also runs in a full browser tab as `popup.html#expanded` (menu → *Expand view*, `openExpanded()` in `api.ts`). `isExpanded` adds `body.expanded` (CSS in `public/popup.html`) and renders the app in a centred 640 px column instead of the 360 px popup.

**Auto-lock while open.** `App` listens to `chrome.storage.onChanged` and refreshes when the session `secrets` are removed, so an open popup or tab drops to the Unlock screen as soon as the wallet locks.

### 5.2 Pages and components

| File | What it shows / does |
|---|---|
| [pages/Onboarding.tsx](../src/popup/pages/Onboarding.tsx) | Welcome → password → show phrase → confirm backup, or the import-phrase form. |
| [pages/Unlock.tsx](../src/popup/pages/Unlock.tsx) | Password screen. |
| [pages/Home.tsx](../src/popup/pages/Home.tsx) | Tokens / NFTs / Activity tabs. Clicking a token starts Send with it selected; clicking an NFT opens its details. Activity refreshes every 4 s while anything is pending. |
| [pages/SendFlow.tsx](../src/popup/pages/SendFlow.tsx) | 4 steps (see §7.1). |
| [pages/NftDetail.tsx](../src/popup/pages/NftDetail.tsx) | NFT image, metadata, and Send / Hide buttons. |
| [pages/Approval.tsx](../src/popup/pages/Approval.tsx) | Dapp request screen. Decodes `transfer` / `approve` / `setApprovalForAll`, warns on unlimited approvals, shows gas, and disables Confirm when the transaction would fail. |
| [pages/Accounts.tsx](../src/popup/pages/Accounts.tsx) | Switch, add, or import (private key) accounts. `⋯` on a row opens Account details. |
| [pages/AccountDetails.tsx](../src/popup/pages/AccountDetails.tsx) | Rename, QR code, copy, view on explorer, show private key (password), remove an imported account. |
| [pages/Settings.tsx](../src/popup/pages/Settings.tsx) | Sections: General (auto-lock, hide balances), Security & privacy (reveal recovery phrase, change password), Connected sites (disconnect one or all), Networks, Advanced (clear activity), About. `initialSection` opens a section directly. |
| [pages/Networks.tsx](../src/popup/pages/Networks.tsx) | Network list, add form, remove custom networks. |
| [pages/ImportAsset.tsx](../src/popup/pages/ImportAsset.tsx) | Import-token and import-NFT forms (one component, `kind` prop). |
| [pages/Receive.tsx](../src/popup/pages/Receive.tsx) | QR code, address, copy, and which network to send on. |
| [components/ActivityList.tsx](../src/popup/components/ActivityList.tsx) | Activity rows. Shows one row per nonce, plus **Speed up / Cancel** buttons and a fee preview for pending transactions. |
| [components/RevealSecret.tsx](../src/popup/components/RevealSecret.tsx) | Password → secret, with warnings and copy. Used for the recovery phrase and private keys. |
| [components/QrCode.tsx](../src/popup/components/QrCode.tsx), [PageHeader.tsx](../src/popup/components/PageHeader.tsx) | QR image (`qrcode` package); back arrow + title for sub-pages. |
| [components/Alert.tsx](../src/popup/components/Alert.tsx) | **The only way to show errors and warnings.** `severity`: danger / warning / info / success. |
| [components/GasSummary.tsx](../src/popup/components/GasSummary.tsx) | Estimated fee, max fee, gas limit and price, total. Formats tiny testnet fees correctly. Pass `speed` + `onSpeedChange` to show the 🐢 Low / 🚗 Market / 🚀 Aggressive picker. |
| [components/Header.tsx](../src/popup/components/Header.tsx), [AccountOverview.tsx](../src/popup/components/AccountOverview.tsx), [ActionButtons.tsx](../src/popup/components/ActionButtons.tsx) | Top bar (connected-site dot, network picker, ⋮ menu: account details, explorer, expand view, connected sites, settings, lock), balance card (`formatAmount` lives here), Send/Receive buttons. |
| [api.ts](../src/popup/api.ts) | `send(type, payload)`, the one function the UI uses to talk to the background. Also `isExpanded` / `openExpanded()`. |
| [styles.ts](../src/popup/styles.ts) | Colours and shared button/input styles. Change the look here. |

Unused leftovers from the original scaffold: `popup/contexts/WalletContext.tsx`, `shared/constants/routes.ts`, `readable-stream.d.ts`. Nothing imports them, so they are safe to delete.

---

## 6. Dapp connection (EIP-1193)

### 6.1 Request path
```
dapp: provider.request({ method, params })
  → inpage.js   window.postMessage({ target: "mywallet-content", id, method, params })
  → content.js  port.postMessage({ id, method, params })           (reconnects if the worker restarted)
  → index.ts    walletController.handleRequest(method, params, origin)
                  └─ may open an approval window and wait
  ← content.js  { id, result } | { id, error: { code, message } }
  ← inpage.js   resolves/rejects the dapp's promise (error has .code)
```

### 6.2 Supported methods (from [methods.ts](../src/shared/constants/methods.ts), also exposed to pages as `window.myWallet.supportedMethods`)

| Method | Approval? | Notes |
|---|---|---|
| `eth_requestAccounts`, `wallet_requestPermissions` | Connect (first time per site) | Adds the origin to `connectedOrigins`. |
| `eth_accounts`, `wallet_getPermissions` | no | Empty until the site is connected and the wallet is unlocked. |
| `wallet_revokePermissions` | no | Disconnects the site. |
| `eth_chainId`, `net_version` | no | Answered locally. |
| `wallet_switchEthereumChain` | no | Error `4902` if the chain isn't known. |
| `wallet_addEthereumChain` | Add network | RPC must answer with the same chain ID. |
| `personal_sign`, `eth_signTypedData_v4` | Signature | Accepts both parameter orders for `personal_sign`. |
| `eth_sendTransaction` | Confirm | Gas and balance are checked in the approval window, where the user also picks the fee speed (it replaces the site's suggested fees). Recorded in Activity. |
| `eth_call`, `eth_getBalance`, `eth_estimateGas`, … (`READ_METHODS`) | no | Forwarded to the RPC. |

Error codes follow EIP-1193: `4001` user rejected, `4100` unauthorised / locked, `4200` unsupported method, `4902` unknown chain, `-32603` internal (message passed through `friendlyMessage`).

### 6.3 Using it from a page
```js
const [account] = await window.myWallet.request({ method: 'eth_requestAccounts' });
window.myWallet.on('accountsChanged', (accounts) => { /* … */ });

// Recommended discovery (works even when another wallet owns window.ethereum):
window.addEventListener('eip6963:announceProvider', (e) => {
  if (e.detail.info.rdns === 'com.example.mywallet') provider = e.detail.provider;
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
```
`test-dapp/index.html` has a button for each method.

---

## 7. Walkthroughs

### 7.1 Sending from the popup (ETH, token or NFT)
1. **Recipient** (`SendFlow` step `recipient`): the address is checked with `ethers.isAddress`, then `GET_ADDRESS_INFO` → `getAddressInfo()`.
   - Warns if the recipient is a contract or is the same account.
   - **Blocks** if it's a token contract, until the user ticks "I understand".
2. **Asset & amount**: the picker lists ETH, imported tokens and NFTs.
   - Checks decimals, balance and ERC-1155 quantity before you can continue.
   - ERC-721 has no amount field.
   - MAX calls `GET_MAX_AMOUNT`.
3. **Review**: `ESTIMATE_SEND` → `estimateSend()` → `prepareSend()` + `quoteFee()`.
   - Shows `GasSummary` with the speed picker. Changing speed re-estimates.
   - Confirm is disabled while estimating, on any error, or when `balanceError` is set (for example *"Insufficient SepoliaETH for gas"*).
4. **Confirm**: `SEND_TX` → `sendFromPopup()`, which repeats every check, then calls `sendAndRecord()`. The screen then shows the hash and a "View activity" button.
5. **Activity** checks receipts until the transaction confirms. A sent ERC-721 then disappears from the NFTs tab.

### 7.1b Speed up / cancel
A pending row in Activity shows **Speed up** and **Cancel**. Clicking one calls `ESTIMATE_REPLACEMENT` to show the new fee, then `REPLACE_TX`. The replacement reuses the nonce, so only one of the two can ever be mined. `getActivity()` then marks the loser:
- speed-up mined → original becomes `replaced` (hidden; the faster copy is the visible row)
- cancel mined → original becomes `cancelled` (the 0-value cancel tx is hidden)
- original mined first → the replacement becomes `dropped` (hidden)

### 7.2 A dapp sends a transaction
`eth_sendTransaction` → `assertAuthorized` → `requireApproval('eth_sendTransaction')` opens `Approval.tsx`. That screen calls `ESTIMATE_APPROVAL_TX` (same `estimateFee`, so the same insufficient-funds and revert messages). On **Confirm**, `RESOLVE_APPROVAL` resolves the promise and the window closes. The background then calls `sendAndRecord`, and the hash goes back to the dapp.

### 7.3 Unlock state across worker restarts
Chrome stops the service worker when it is idle. Decrypted secrets are kept in `chrome.storage.session`, which lives in memory only and is cleared when the browser closes. `ensureLoaded()` restores them, so the wallet stays unlocked until **Lock**, the **auto-lock timer** (default 15 min without using the wallet UI; Settings → General), or a browser restart. Approval windows `PING` every 20 s to keep the worker alive while you decide.

---

## 8. Storage

| Key | Area | Contents |
|---|---|---|
| `vault` | local | AES-GCM encrypted JSON `{ mnemonic, importedKeys[] }` (older vaults: bare phrase string) |
| `secrets` | **session** | Decrypted copy of the vault while unlocked |
| `hdAccountCount`, `selectedAddress`, `accountNames` | local | Account list state; `{ [address]: name }` for renamed accounts |
| `settings` | local | `{ autoLockMinutes }` (0 = never) |
| `network`, `customNetworks` | local | Selected network key; user-added networks (`custom-<chainId>`) |
| `connectedOrigins` | local | Sites allowed to see your address |
| `tokens` | local | `{ [chainId]: TokenInfo[] }` |
| `nfts`, `activity` | local | `{ "<chainId>:<address>": NftInfo[] / ActivityItem[] }` |

Popup-only preferences (selected tab, hide-balance) are kept in the popup's `localStorage`.

---

## 9. How to add things

**A new popup action** (for example "rename account"):
1. Add a method to `WalletController` (or `assets.ts`).
2. Add a `case "MY_ACTION":` in `handlePopupMessage` in `background/index.ts`.
3. Call `send('MY_ACTION', {...})` from a page. Show failures with `<Alert severity="danger">`.
4. Reload the extension, because the background changed.

**A new dapp method:** add a `case` in `handleRequest`, use `requireApproval` if it needs user consent, and list it in `WALLET_METHODS` in `methods.ts`. For a read-only method, just add it to `READ_METHODS`.

**A new built-in network:** add an entry to `NETWORKS` in `networks.ts` with **at least two** RPC URLs. Check them with `curl` first, because free public RPCs often reject real requests even when `eth_chainId` works.

**A new error message:** add a branch to `friendlyMessage()` in `errors.ts` and a test in `tests/send-validation.test.ts`.

---

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Unknown message type X` | The background is the old build. Reload the extension (the popup tries this automatically). |
| HTTP 400 / "Can't reach the network" | An RPC endpoint died or went paid-only. Check the URLs in `networks.ts` with `curl`. |
| `window.myWallet` is undefined | Refresh the tab after reloading the extension. Doesn't run on `chrome://` pages. `file://` pages need "Allow access to file URLs". |
| Dapp gets "Wallet extension was reloaded" | The tab still talks to the old extension instance. Refresh the page. |
| Gas shows tiny numbers on Sepolia | Correct: Sepolia gas is often a few wei. |

---

## 11. Known gaps compared with MetaMask
Not implemented yet: automatic token/NFT detection (assets are imported manually, since detection needs an indexer API), fiat prices (needs a price API), a contacts/address book, swaps and bridges, custom gas limit / advanced gas editing (only the three speed presets), multiple vaults, and hardware wallets.

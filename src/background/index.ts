import { AUTO_LOCK_ALARM, walletController } from "./wallet-controller";
import { friendlyMessage, toRpcError } from "./errors";
import * as assets from "./assets";

const CONTENT_SCRIPT = "mywallet-contentscript";

// ---------- dapp connections (content script ports) ----------

const dappPorts = new Map<chrome.runtime.Port, string>();

function safePost(port: chrome.runtime.Port, msg: unknown) {
  try {
    port.postMessage(msg);
  } catch {
    dappPorts.delete(port);
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== CONTENT_SCRIPT) return;
  // Trust the browser-provided origin, never one sent in the message
  const origin = port.sender?.origin ?? (port.sender?.url ? new URL(port.sender.url).origin : "");
  dappPorts.set(port, origin);
  port.onDisconnect.addListener(() => dappPorts.delete(port));

  port.onMessage.addListener(async (msg: any) => {
    if (typeof msg?.method !== "string") return;
    try {
      await walletController.ensureLoaded();
      const params = Array.isArray(msg.params) ? msg.params : [];
      const result = await walletController.handleRequest(msg.method, params, origin);
      safePost(port, { id: msg.id, result });
    } catch (error) {
      safePost(port, { id: msg.id, error: toRpcError(error) });
    }
  });
});

walletController.onEvent((event, data) => {
  for (const [port, origin] of dappPorts) {
    const payload = event === "accountsChanged" ? walletController.permittedAccounts(origin) : data;
    safePost(port, { event, data: payload });
  }
});

// ---------- popup messages ----------

async function handlePopupMessage(msg: any) {
  await walletController.ensureLoaded();
  await walletController.refreshHasVault();
  switch (msg.type) {
    case "GET_STATE":
    case "PING":
      return walletController.getState();
    case "CREATE_WALLET":
      return walletController.createWallet(msg.password);
    case "IMPORT_WALLET":
      return walletController.importWallet(msg.mnemonic, msg.password);
    case "UNLOCK":
      return walletController.unlock(msg.password);
    case "LOCK":
      return walletController.lock();
    case "GET_BALANCE":
      return walletController.getBalance();
    case "SWITCH_NETWORK":
      return walletController.switchNetwork(msg.network);
    case "ADD_NETWORK": {
      const key = await walletController.addNetwork(msg.network);
      await walletController.switchNetwork(key);
      return key;
    }
    case "REMOVE_NETWORK":
      return walletController.removeNetwork(msg.key);
    case "SEND_TX":
      return walletController.sendFromPopup(msg.request);
    case "ESTIMATE_SEND":
      return walletController.estimateSend(msg.request);
    case "ESTIMATE_APPROVAL_TX":
      return walletController.estimateApprovalTx(msg.id, msg.speed);
    case "GET_MAX_AMOUNT":
      return walletController.getMaxAmount(msg.asset, msg.to, msg.speed);
    case "ESTIMATE_REPLACEMENT":
      return walletController.estimateReplacement(msg.hash, msg.kind);
    case "REPLACE_TX":
      return walletController.replaceTransaction(msg.hash, msg.kind);
    case "CLEAR_ACTIVITY":
      return walletController.clearActivity();
    case "GET_ADDRESS_INFO":
      return walletController.getAddressInfo(msg.address);
    case "ADD_ACCOUNT":
      return walletController.addAccount();
    case "IMPORT_ACCOUNT":
      return walletController.importAccount(msg.privateKey, msg.password);
    case "SELECT_ACCOUNT":
      return walletController.selectAccount(msg.address);
    case "RENAME_ACCOUNT":
      return walletController.renameAccount(msg.address, msg.name);
    case "REMOVE_ACCOUNT":
      return walletController.removeAccount(msg.address, msg.password);
    case "EXPORT_PRIVATE_KEY":
      return walletController.exportPrivateKey(msg.address, msg.password);
    case "REVEAL_SRP":
      return walletController.revealSecretPhrase(msg.password);
    case "CHANGE_PASSWORD":
      return walletController.changePassword(msg.currentPassword, msg.newPassword);
    case "GET_SETTINGS":
      return walletController.getSettings();
    case "UPDATE_SETTINGS":
      return walletController.updateSettings(msg.settings);
    case "GET_TOKENS":
      return assets.getTokens(walletController.assetContext());
    case "IMPORT_TOKEN":
      return assets.importToken(walletController.assetContext(), msg.address);
    case "REMOVE_TOKEN":
      return assets.removeToken(walletController.assetContext(), msg.address);
    case "GET_NFTS":
      return assets.getNfts(walletController.assetContext());
    case "IMPORT_NFT":
      return assets.importNft(walletController.assetContext(), msg.contract, msg.tokenId);
    case "REMOVE_NFT":
      return assets.removeNft(walletController.assetContext(), msg.contract, msg.tokenId);
    case "GET_ACTIVITY":
      return assets.getActivity(walletController.assetContext());
    case "GET_APPROVAL":
      return walletController.getApproval(msg.id);
    case "RESOLVE_APPROVAL":
      return walletController.resolveApproval(msg.id, !!msg.approved, msg.speed);
    case "GET_CONNECTED_SITES":
      return walletController.getConnectedOrigins();
    case "DISCONNECT_SITE":
      return walletController.disconnect(msg.origin);
    default:
      // Usually means the popup was rebuilt but the service worker is still the old code
      throw new Error(`Unknown message type ${msg.type}. Reload the extension in chrome://extensions.`);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only accept messages from our own extension pages (popup / approval window), not content scripts
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) return;
  handlePopupMessage(msg)
    .then((data) => sendResponse({ data: data ?? null }))
    .catch((e) => sendResponse({ error: friendlyMessage(e) }))
    // Any wallet UI activity restarts the auto-lock timer
    .finally(() => walletController.scheduleAutoLock());
  return true;
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== AUTO_LOCK_ALARM) return;
  await walletController.ensureLoaded();
  await walletController.lock();
});

// Like MetaMask, onboarding opens in a full tab on first install
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: chrome.runtime.getURL("popup.html#expanded") });
  }
});

console.log("MyWallet background started with wallet controller");

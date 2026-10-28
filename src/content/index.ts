// Relays JSON-RPC requests between the page (inpage.js, MAIN world) and the background service worker.

const CONTENT_SCRIPT = "mywallet-contentscript";
const TO_CONTENT = "mywallet-content";
const TO_INPAGE = "mywallet-inpage";

const targetOrigin = window.location.origin === "null" ? "*" : window.location.origin;
const pendingIds = new Set<number>();
let port: chrome.runtime.Port | null = null;

function toPage(msg: object) {
  window.postMessage({ target: TO_INPAGE, ...msg }, targetOrigin);
}

// The service worker can be restarted at any time, which disconnects the port,
// so connect lazily and reconnect on the next request.
function getPort(): chrome.runtime.Port {
  if (port) return port;
  const p = chrome.runtime.connect({ name: CONTENT_SCRIPT });
  p.onMessage.addListener((msg: any) => {
    if (msg.id !== undefined) pendingIds.delete(msg.id);
    toPage(msg);
  });
  p.onDisconnect.addListener(() => {
    port = null;
    for (const id of pendingIds) {
      toPage({ id, error: { code: -32603, message: "Wallet connection lost, please retry" } });
    }
    pendingIds.clear();
  });
  port = p;
  return p;
}

window.addEventListener("message", (event) => {
  if (event.source !== window || event.data?.target !== TO_CONTENT) return;
  const { id, method, params } = event.data;
  try {
    pendingIds.add(id);
    getPort().postMessage({ id, method, params });
  } catch {
    // Happens after the extension is reloaded: this content script is orphaned until the page reloads
    pendingIds.delete(id);
    toPage({ id, error: { code: -32603, message: "Wallet extension was reloaded, please refresh the page" } });
  }
});

// Connect up front so the page receives accountsChanged / chainChanged events
try {
  getPort();
} catch {}

export {};

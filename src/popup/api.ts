// One request/response helper for talking to the background service worker.
// (Replaces the long-lived ports that were opened on every render.)
export async function send<T = any>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await chrome.runtime.sendMessage({ type, ...payload });
  if (!res) throw new Error('No response from wallet background');
  if (res.error) {
    // The popup is loaded fresh from disk on every open, but the service worker keeps running old code
    // after a rebuild until the extension is reloaded. Reload it automatically (this closes the popup).
    if (String(res.error).startsWith('Unknown message type')) {
      chrome.runtime.reload();
      throw new Error('Wallet was updated. Reloading — reopen the popup.');
    }
    throw new Error(res.error);
  }
  return res.data as T;
}

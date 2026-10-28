import { ApprovalRequest, ApprovalType, GasSpeed } from "../../shared/types";

// What the user chose on the approval screen
export interface ApprovalResult {
  approved: boolean;
  // eth_sendTransaction only: the fee speed picked on the screen
  speed?: GasSpeed;
}

interface PendingRequest extends ApprovalRequest {
  windowId?: number;
  resolve: (result: ApprovalResult) => void;
}

// Each request opens its own popup window (popup.html#approval=<id>).
// The popup resolves it via RESOLVE_APPROVAL; closing the window counts as a rejection.
export class ApprovalManager {
  private pending: Map<string, PendingRequest> = new Map();

  constructor() {
    chrome.windows.onRemoved.addListener((windowId) => {
      for (const req of this.pending.values()) {
        if (req.windowId === windowId) this.resolve(req.id, { approved: false });
      }
    });
  }

  request(type: ApprovalType, origin: string, params: any[] = []): Promise<ApprovalResult> {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      const req: PendingRequest = { id, type, origin, params, resolve };
      this.pending.set(id, req);
      chrome.windows
        .create({
          url: chrome.runtime.getURL(`popup.html#approval=${id}`),
          type: "popup",
          width: 376,
          height: 640,
          focused: true,
        })
        .then((win) => {
          req.windowId = win?.id;
        })
        .catch(() => this.resolve(id, { approved: false }));
    });
  }

  get(id: string): ApprovalRequest | null {
    const req = this.pending.get(id);
    if (!req) return null;
    const { resolve, windowId, ...data } = req;
    return data;
  }

  resolve(id: string, result: ApprovalResult) {
    const req = this.pending.get(id);
    if (req) {
      this.pending.delete(id);
      req.resolve(result);
    }
  }
}

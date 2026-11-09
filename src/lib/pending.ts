/**
 * The one thing a guest tried to do before signing in (a typed or spoken message to the assistant).
 * Kept in memory and in sessionStorage, so it survives a same-tab Google redirect, and is sent
 * automatically once the owner's khata is ready. Never stored beyond this browser tab.
 */
export type PendingTurn = {
  body: { text?: string; audioBase64?: string; mimeType?: string };
  shown: string;
  voice: boolean;
};
const KEY = "udhaar.pendingTurn";
let memory: PendingTurn | null = null;

export function savePending(turn: PendingTurn) {
  memory = turn;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(turn));
  } catch {
    // Too large (long voice note) or storage off: the in-memory copy still covers popup sign-in.
  }
}

export function takePending(): PendingTurn | null {
  let turn = memory;
  memory = null;
  try {
    const stored = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!turn && stored) turn = JSON.parse(stored) as PendingTurn;
  } catch {
    /* ignore */
  }
  return turn;
}

export function hasPending() {
  if (memory) return true;
  try {
    return sessionStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}

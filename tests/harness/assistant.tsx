// Test-only page: renders the real <Assistant/> with a scripted fake server (window.__replies)
// and a fake signed-in user, so browser tests can exercise it without Firebase.
import ReactDOM from "react-dom/client";
import "../../src/index.css";
import "../../src/workspace.css";
import { auth } from "../../src/lib/firebase";
import { Assistant } from "../../src/components/Assistant";

declare global {
  interface Window {
    __replies: { status?: number; body: Record<string, unknown> }[];
    __requests: Record<string, unknown>[];
    __changed: number;
  }
}
window.__replies = [];
window.__requests = [];
window.__changed = 0;
Object.defineProperty(auth, "currentUser", { get: () => ({ getIdToken: async () => "test-token" }) });
window.fetch = (async (_url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  window.__requests.push(body);
  await new Promise((r) => setTimeout(r, 150));
  const next = window.__replies.shift() ?? { body: { reply: "Theek hai.", kind: "info", options: [] } };
  const payload = next.status && next.status >= 400 ? next.body : { turnId: body.turnId, heard: body.text ?? "Sunita ko 340", replyId: `web.r.${body.turnId}`, entryId: null, options: [], ...next.body };
  return new Response(JSON.stringify(payload), { status: next.status ?? 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <div style={{ padding: 16, maxWidth: 640, margin: "0 auto" }}>
    <Assistant onChanged={() => { window.__changed++; }} />
  </div>,
);

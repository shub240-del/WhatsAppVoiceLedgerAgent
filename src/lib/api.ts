import { auth } from "./firebase";

type Method = "GET" | "POST" | "PATCH" | "PUT";
export async function api<T>(path: string, body?: unknown, key?: string, method?: Method): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in as a shop owner.");
  // Same-origin by default: on Vercel the API runs at /api on the site's own domain.
  const base = import.meta.env.VITE_API_BASE_URL || "";
  const token = await user.getIdToken();
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error("Could not reach the ledger API. Nothing was changed; check your connection and retry.");
  }
  const result = await response.json().catch(() => ({}));
  if (response.status === 404 && !result.error)
    throw new Error("The Udhaar server isn’t deployed yet, so nothing can be saved. Nothing was changed.");
  if (!response.ok) throw new Error(result.error?.message || "The request could not be completed.");
  return result as T;
}

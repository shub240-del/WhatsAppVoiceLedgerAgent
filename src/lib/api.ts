import { auth } from "./firebase";

type Method = "GET" | "POST" | "PATCH" | "PUT";
export async function api<T>(path: string, body?: unknown, key?: string, method?: Method): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in as a shop owner.");
  const base = import.meta.env.VITE_API_BASE_URL;
  if (!base) throw new Error("The secure ledger API is not configured. See docs/DEPLOYMENT_GUIDE.md.");
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
  if (!response.ok) throw new Error(result.error?.message || "The request could not be completed.");
  return result as T;
}

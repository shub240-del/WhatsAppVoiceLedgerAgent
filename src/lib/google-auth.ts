import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  type UserCredential,
} from "firebase/auth";
import { auth } from "./firebase";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });
provider.addScope("email");
provider.addScope("profile");

let redirectResult: Promise<UserCredential | null> | undefined;

// Popup is the primary flow. signInWithRedirect only works reliably when the app is served
// from the same domain as `authDomain` (Firebase Hosting). On any other host (Vercel, custom
// domains) modern browsers partition third-party storage, so the redirect returns to the app
// with no signed-in user. Redirect is kept only as a fallback when a popup cannot open.
const POPUP_UNAVAILABLE = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
]);

/** Resolves with the credential when sign-in finished in a popup, or never when it redirected. */
export async function beginGoogleSignIn(): Promise<UserCredential> {
  await setPersistence(auth, browserLocalPersistence);
  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    if (!POPUP_UNAVAILABLE.has(code)) throw error;
    await signInWithRedirect(auth, provider);
    return new Promise<never>(() => {});
  }
}

export function resolveGoogleRedirectResult() {
  redirectResult ??= getRedirectResult(auth);
  return redirectResult;
}

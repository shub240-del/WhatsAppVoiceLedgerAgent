import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updateProfile,
  type UserCredential,
} from "firebase/auth";
import { auth, sameSiteAuth } from "./firebase";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });
provider.addScope("email");
provider.addScope("profile");

let redirectResult: Promise<UserCredential | null> | undefined;

// Phones open sign-in "popups" as a new tab. When the auth handler is served from our own domain
// (sameSiteAuth), phones use a same-tab redirect instead, which then works reliably. Otherwise the
// popup is used: a redirect via another domain loses the session in modern browsers.
const POPUP_UNAVAILABLE = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
]);
const isPhone = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** Resolves with the credential when sign-in finished in a popup, or never when it redirected. */
export async function beginGoogleSignIn(): Promise<UserCredential> {
  // Keep the owner signed in on this device until they sign out.
  await setPersistence(auth, browserLocalPersistence);
  if (sameSiteAuth && isPhone()) {
    await signInWithRedirect(auth, provider);
    return new Promise<never>(() => {});
  }
  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    if (!POPUP_UNAVAILABLE.has(code)) throw error;
    await signInWithRedirect(auth, provider);
    return new Promise<never>(() => {});
  }
}

export async function signUpWithEmail(email: string, password: string, name: string) {
  await setPersistence(auth, browserLocalPersistence);
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() });
  return credential;
}

export async function logInWithEmail(email: string, password: string) {
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export function resetPassword(email: string) {
  return sendPasswordResetEmail(auth, email.trim());
}

export function resolveGoogleRedirectResult() {
  redirectResult ??= getRedirectResult(auth);
  return redirectResult;
}

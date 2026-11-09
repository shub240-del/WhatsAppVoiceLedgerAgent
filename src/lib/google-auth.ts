import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  signInWithRedirect,
  type UserCredential,
} from "firebase/auth";
import { auth } from "./firebase";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });
provider.addScope("email");
provider.addScope("profile");

let redirectResult: Promise<UserCredential | null> | undefined;

export async function beginGoogleSignIn() {
  await setPersistence(auth, browserLocalPersistence);
  await signInWithRedirect(auth, provider);
}

export function resolveGoogleRedirectResult() {
  redirectResult ??= getRedirectResult(auth);
  return redirectResult;
}

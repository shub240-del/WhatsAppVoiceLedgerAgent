import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// Firebase web configuration is public; access is enforced by rules and verified ID tokens.
// Same-tab Google sign-in: when VITE_AUTH_SAME_SITE=true the auth handler is served from this site
// (vercel.json proxies /__/auth to Firebase), so the redirect never leaves the app's own domain.
export const sameSiteAuth =
  import.meta.env.VITE_AUTH_SAME_SITE === "true" && typeof window !== "undefined" && window.location.protocol === "https:";
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyD-LNFDk4SWg8Qpuy0YDvv5GooiwBH6PmA",
  authDomain: sameSiteAuth
    ? window.location.host
    : import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "udhar-khata-f41fb.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "udhar-khata-f41fb",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:224661631158:web:31071e4838506c10bdf617",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(config);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const projectId = config.projectId;

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFirestoreEmulator(db, "127.0.0.1", 8181);
}

if (
  import.meta.env.MODE === "test" &&
  import.meta.env.VITE_AUTH_TEST_HELPER === "true" &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" &&
  projectId.startsWith("demo-")
) {
  // Test-only sign-in supports emulator-backed browser journeys; production builds omit this branch.
  window.__udhaarE2ESignIn = async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  };
}

// Analytics is deliberately not initialized: it is unnecessary for private financial records.

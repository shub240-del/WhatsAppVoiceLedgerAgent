import { useState } from "react";
import {
  ArrowRight,
  Check,
  ShieldCheck,
} from "lucide-react";
import { authErrorMessage } from "../lib/auth-errors";
import { beginGoogleSignIn } from "../lib/google-auth";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { Modal } from "./Modal";

export function AuthDialog({
  mode,
  onModeChange,
  close,
}: {
  mode: "login" | "signup";
  onModeChange(mode: "login" | "signup"): void;
  close(): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signup = mode === "signup";
  async function continueWithGoogle() {
    setError("");
    setBusy(true);
    try {
      await beginGoogleSignIn();
      setBusy(false);
      close();
      window.location.hash = "/workspace";
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
    }
  }
  function switchMode() {
    setError("");
    onModeChange(signup ? "login" : "signup");
  }
  return (
    <Modal
      title={signup ? "A fresh start for your shop." : "Welcome back to your khata."}
      eyebrow={signup ? "GET STARTED WITH UDHAAR" : "OWNER SIGN-IN"}
      close={() => !busy && close()}
    >
      <p className="modal-description">
        {signup
          ? "Continue with your Google account, then name your shop. That’s it."
          : "Continue with the Google account linked to your shop. Your records stay in your private workspace."}
      </p>
      <div className="form auth-form">
        {signup ? (
          <p className="form-note">
            <Check size={15} />
            Free during the pilot. Only you can see your khata.{" "}
            <a href="#privacy" onClick={() => !busy && close()}>
              Privacy
            </a>
          </p>
        ) : (
          <p className="form-note">
            <Check size={15} />
            Use the same Google account you signed up with.
          </p>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <GoogleSignInButton
          busy={busy}
          onClick={() => void continueWithGoogle()}
        />
        <p className="auth-switch">
          {signup ? "Already have an account?" : "New to Udhaar?"}{" "}
          <button type="button" onClick={switchMode} disabled={busy}>
            {signup ? "Log in" : "Create an account"}
            <ArrowRight size={13} />
          </button>
        </p>
        <div className="form-note">
          <ShieldCheck size={16} />
          <span>
            Secure Google sign-in. No password to remember.
          </span>
        </div>
      </div>
    </Modal>
  );
}

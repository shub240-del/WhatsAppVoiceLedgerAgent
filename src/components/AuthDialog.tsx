import { useState } from "react";
import { getAdditionalUserInfo } from "firebase/auth";
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
  const [acknowledged, setAcknowledged] = useState(false);
  const signup = mode === "signup";
  async function continueWithGoogle() {
    setError("");
    setBusy(true);
    try {
      const credential = await beginGoogleSignIn();
      const newUser = getAdditionalUserInfo(credential)?.isNewUser;
      setBusy(false);
      close();
      window.location.hash = newUser ? "/workspace?setup=1" : "/workspace";
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
    }
  }
  function switchMode() {
    setError("");
    setAcknowledged(false);
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
          ? "Continue with your Google account. An administrator will securely link your shop before any records are available."
          : "Continue with the Google account linked to your shop. Your records stay in your private workspace."}
      </p>
      <div className="form auth-form">
        {signup ? (
          <label className="auth-ack">
            <input
              name="acknowledge"
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.currentTarget.checked)}
            />
            <span>
              I understand this is a pilot. An administrator must link my shop before I can access
              ledger data.{" "}
              <a href="#privacy" onClick={() => !busy && close()}>
                Privacy details
              </a>
            </span>
          </label>
        ) : (
          <p className="form-note">
            <Check size={15} />
            Your account must already be linked to an active shop to view its records.
          </p>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <GoogleSignInButton
          busy={busy}
          disabled={signup && !acknowledged}
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
            Secure Google sign-in. Authentication alone never grants access to a shop.
          </span>
        </div>
      </div>
    </Modal>
  );
}

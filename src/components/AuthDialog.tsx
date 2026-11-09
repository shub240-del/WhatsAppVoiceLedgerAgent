import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { authErrorMessage } from "../lib/auth-errors";
import { beginGoogleSignIn, logInWithEmail, resetPassword, signUpWithEmail } from "../lib/google-auth";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { Modal } from "./Modal";

/**
 * Sign up or log in, with Google or email + password. Shown when a visitor first does something
 * that needs an account (save an entry, send to the assistant), or from "Log in".
 */
export function AuthDialog({
  mode,
  onModeChange,
  close,
  reason,
  onSignedIn,
}: {
  mode: "login" | "signup";
  onModeChange(mode: "login" | "signup"): void;
  close(): void;
  /** Why we're asking now, e.g. "Sign in to save this entry". */
  reason?: string;
  /** Default: close and open the workspace. */
  onSignedIn?(): void;
}) {
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const signup = mode === "signup";

  function done() {
    setBusy(null);
    if (onSignedIn) onSignedIn();
    else {
      close();
      window.location.hash = "/workspace";
    }
  }
  async function google() {
    setError("");
    setNotice("");
    setBusy("google");
    try {
      await beginGoogleSignIn();
      done();
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(null);
    }
  }
  async function withEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password") ?? "");
    setError("");
    setNotice("");
    setBusy("email");
    try {
      if (signup) await signUpWithEmail(email, password, String(data.get("name") ?? ""));
      else await logInWithEmail(email, password);
      done();
    } catch (err) {
      setError(authErrorMessage(err, "email"));
      setBusy(null);
    }
  }
  async function forgot() {
    setError("");
    setNotice("");
    if (!email.includes("@")) {
      setError("Type your email above first, then tap “Forgot password?”.");
      return;
    }
    try {
      await resetPassword(email);
    } catch {
      // Same answer whether or not the account exists, so emails can't be probed.
    }
    setNotice(`If ${email.trim()} has an account, a reset link is on its way. Check your inbox.`);
  }
  function switchMode() {
    setError("");
    setNotice("");
    onModeChange(signup ? "login" : "signup");
  }

  return (
    <Modal title={signup ? "Create your free account" : "Welcome back"} close={() => !busy && close()}>
      <div className="form auth-form">
        <p className="modal-description">
          {reason ?? (signup ? "Your khata stays on this device’s account until you sign out." : "Log in to open your khata.")}
        </p>
        <GoogleSignInButton busy={busy === "google"} disabled={Boolean(busy)} onClick={() => void google()} />
        <div className="auth-divider" role="separator">
          <span>or with email</span>
        </div>
        <form className="form" onSubmit={withEmail}>
          {signup && (
            <label>
              Your name (optional)
              <input name="name" autoComplete="name" maxLength={80} placeholder="e.g. Ramesh Sharma" />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              placeholder="you@example.com"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={6}
              placeholder={signup ? "At least 6 characters" : "Your password"}
            />
          </label>
          {!signup && (
            <button type="button" className="text-button auth-forgot" onClick={() => void forgot()} disabled={Boolean(busy)}>
              Forgot password?
            </button>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="form-success" role="status">{notice}</p>}
          <button className="button primary full" disabled={Boolean(busy)}>
            {busy === "email" && <LoaderCircle size={16} className="spin" />}
            {signup ? "Create account" : "Log in"}
          </button>
        </form>
        <p className="auth-switch">
          {signup ? "Already have an account?" : "New to Udhaar?"}{" "}
          <button type="button" onClick={switchMode} disabled={Boolean(busy)}>
            {signup ? "Log in" : "Create an account"}
            <ArrowRight size={13} />
          </button>
        </p>
        <p className="form-note">
          <ShieldCheck size={15} />
          Free. Only you can see your khata. You stay signed in on this device.
        </p>
      </div>
    </Modal>
  );
}

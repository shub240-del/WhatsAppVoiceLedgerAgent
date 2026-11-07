import { useRef, useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import {
  ArrowRight,
  AudioLines,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { auth } from "../lib/firebase";
import { authErrorMessage } from "../lib/auth-errors";
import { Modal } from "./Modal";

export function AuthDialog({
  mode,
  onModeChange,
  close,
  done,
}: {
  mode: "login" | "signup";
  onModeChange(mode: "login" | "signup"): void;
  close(): void;
  done(isNew: boolean): void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [visible, setVisible] = useState(false);
  const email = useRef<HTMLInputElement>(null);
  const signup = mode === "signup";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const address = String(data.get("email")).trim();
    const password = String(data.get("password"));
    try {
      if (signup) {
        if (password !== String(data.get("confirm"))) {
          setError("The passwords don’t match. Please check both fields.");
          return;
        }
        if (!data.get("acknowledge")) {
          setError("Please acknowledge the pilot setup requirements to continue.");
          return;
        }
        const credential = await createUserWithEmailAndPassword(auth, address, password);
        // Account creation succeeds independently of this optional profile update.
        try {
          await updateProfile(credential.user, { displayName: String(data.get("name")).trim() });
        } catch {
          /* Setup can continue without a display name. */
        }
        done(true);
      } else {
        await signInWithEmailAndPassword(auth, address, password);
        done(false);
      }
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    const address = email.current?.value.trim() || "";
    if (!address || !email.current?.checkValidity()) {
      setError("Enter your valid email address above first.");
      email.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await sendPasswordResetEmail(auth, address);
      setNotice("If this account exists, a password-reset email will be sent. Check your inbox.");
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function switchMode() {
    setError("");
    setNotice("");
    setVisible(false);
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
          ? "Create your owner account. Then we’ll guide you through securely linking your shop."
          : "Your customers. Your records. Your private workspace."}
      </p>
      <form className="form auth-form" onSubmit={submit} key={mode}>
        {signup && (
          <label>
            Your name
            <input
              name="name"
              autoComplete="name"
              placeholder="How should we address you?"
              maxLength={80}
              required
            />
          </label>
        )}
        <label>
          Email address
          <input
            ref={email}
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@yourshop.com"
            required
          />
        </label>
        <label>
          Password
          <span className="password-field">
            <input
              name="password"
              type={visible ? "text" : "password"}
              autoComplete={signup ? "new-password" : "current-password"}
              placeholder={signup ? "At least 8 characters" : "Your password"}
              minLength={signup ? 8 : undefined}
              required
            />
            <button
              type="button"
              aria-label={visible ? "Hide password" : "Show password"}
              aria-pressed={visible}
              onClick={() => setVisible(!visible)}
            >
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </span>
        </label>
        {signup ? (
          <>
            <label>
              Confirm password
              <input
                name="confirm"
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Enter your password again"
                minLength={8}
                required
              />
            </label>
            <label className="auth-ack">
              <input name="acknowledge" type="checkbox" required />
              <span>
                I understand this is a pilot. An administrator must link my shop before I can access
                ledger data.{" "}
                <a href="#privacy" onClick={() => !busy && close()}>
                  Privacy details
                </a>
              </span>
            </label>
          </>
        ) : (
          <button
            type="button"
            className="text-button reset-password"
            disabled={busy}
            onClick={reset}
          >
            Forgot password?
          </button>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="form-success" role="status">
            <Check size={15} />
            {notice}
          </p>
        )}
        <button className="button primary full" disabled={busy}>
          {busy ? (
            <LoaderCircle size={17} className="spin" />
          ) : signup ? (
            <ArrowRight size={16} />
          ) : (
            <LockKeyhole size={15} />
          )}
          {busy ? "Please wait…" : signup ? "Create owner account" : "Sign in securely"}
        </button>
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
            Protected by Firebase Authentication. Account creation does not grant access to any
            shop.
          </span>
        </div>
      </form>
    </Modal>
  );
}

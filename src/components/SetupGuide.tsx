import { useState } from "react";
import { sendEmailVerification, type User } from "firebase/auth";
import {
  ArrowRight,
  Check,
  Copy,
  LoaderCircle,
  Mail,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Modal } from "./Modal";
import { authErrorMessage } from "../lib/auth-errors";

export function SetupGuide({
  user,
  shopName,
  hasCustomers,
  close,
  refresh,
  addCustomer,
}: {
  user: User;
  shopName?: string;
  hasCustomers: boolean;
  close(): void;
  refresh(): void;
  addCustomer(): void;
}) {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(
        `Udhaar owner setup\nEmail: ${user.email}\nOwner UID: ${user.uid}\nPlease provision and link my shop using the trusted administrator process.`,
      );
      setNotice("Setup details copied. Share them privately with your onboarding administrator.");
    } catch {
      setError("Clipboard isn’t available. You can select and copy the owner ID below.");
    }
  }
  async function verifyEmail() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await sendEmailVerification(user);
      setNotice("Verification email sent. Check your inbox.");
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={shopName ? "Your shop, ready for a clearer day." : "Let’s open your khata."}
      eyebrow="YOUR FIRST STEPS"
      close={close}
      wide
    >
      <p className="modal-description">
        One account. One private shop. A guided start, with no sample records added to your ledger.
      </p>
      <ol className="onboarding-steps">
        <li className="complete">
          <span className="onboard-number">
            <Check size={17} />
          </span>
          <div>
            <h3>Your owner account</h3>
            <p>{user.email}</p>
            <span className="onboarding-badge">
              <ShieldCheck size={12} />
              Account created
            </span>
            {!user.emailVerified && (
              <button className="text-button" disabled={busy} onClick={verifyEmail}>
                {busy ? <LoaderCircle size={14} className="spin" /> : <Mail size={14} />}Send
                verification email
              </button>
            )}
          </div>
        </li>
        <li className={shopName ? "complete" : ""}>
          <span className="onboard-number">{shopName ? <Check size={17} /> : "2"}</span>
          <div>
            <h3>{shopName ? `${shopName} is linked` : "Securely link your shop"}</h3>
            <p>
              {shopName
                ? "Your owner account has access to this shop only."
                : "During the pilot, your onboarding administrator verifies your details and links your shop. You cannot join a shop by entering someone else’s ID."}
            </p>
            {!shopName && (
              <>
                <label className="owner-id">
                  Your owner ID
                  <input readOnly value={user.uid} onFocus={(e) => e.currentTarget.select()} />
                </label>
                <div className="button-row">
                  <button className="button secondary small" onClick={copyDetails}>
                    <Copy size={14} />
                    Copy setup details
                  </button>
                  <button
                    className="button secondary small"
                    onClick={() => {
                      refresh();
                      setNotice(
                        "Checking your shop access. Close this guide to see the latest status.",
                      );
                    }}
                  >
                    <RefreshCw size={14} />
                    Check shop access
                  </button>
                </div>
                <p className="form-note">
                  No shop has been created or linked yet. This step requires the existing trusted
                  provisioning process.
                </p>
              </>
            )}
          </div>
        </li>
        <li className={hasCustomers ? "complete" : !shopName ? "step-locked" : ""}>
          <span className="onboard-number">{hasCustomers ? <Check size={17} /> : "3"}</span>
          <div>
            <h3>Add your first customer</h3>
            <p>A name and a familiar landmark are enough to start. Phone numbers are optional.</p>
            {shopName && !hasCustomers && (
              <button className="button primary small" onClick={addCustomer}>
                <UsersRound size={14} />
                Add a customer
                <ArrowRight size={14} />
              </button>
            )}
            {hasCustomers && (
              <span className="onboarding-badge">
                <Check size={12} />
                Your khata has its first customer
              </span>
            )}
          </div>
        </li>
      </ol>
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button className="button secondary full" onClick={close}>
        {shopName ? "Continue to workspace" : "Continue to setup workspace"}
        <ArrowRight size={15} />
      </button>
    </Modal>
  );
}

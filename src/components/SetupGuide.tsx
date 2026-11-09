import { type User } from "firebase/auth";
import { ArrowRight, Check, ShieldCheck, UsersRound } from "lucide-react";
import { Modal } from "./Modal";
import { CreateShop } from "./CreateShop";

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
  return (
    <Modal
      title={shopName ? `${shopName} is ready.` : "Let’s open your khata."}
      eyebrow="3 QUICK STEPS"
      close={close}
      wide
    >
      <ol className="onboarding-steps">
        <li className="complete">
          <span className="onboard-number">
            <Check size={17} />
          </span>
          <div>
            <h3>Signed in</h3>
            <p>{user.email}</p>
            <span className="onboarding-badge">
              <ShieldCheck size={12} />
              Only you can see your khata
            </span>
          </div>
        </li>
        <li className={shopName ? "complete" : ""}>
          <span className="onboard-number">{shopName ? <Check size={17} /> : "2"}</span>
          <div>
            <h3>{shopName ? `${shopName}` : "Name your shop"}</h3>
            {shopName ? (
              <p>Your shop is created.</p>
            ) : (
              <CreateShop compact onCreated={refresh} />
            )}
          </div>
        </li>
        <li className={hasCustomers ? "complete" : !shopName ? "step-locked" : ""}>
          <span className="onboard-number">{hasCustomers ? <Check size={17} /> : "3"}</span>
          <div>
            <h3>Add your first customer</h3>
            <p>A name is enough. Add a landmark if two people share a name.</p>
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
                Done
              </span>
            )}
          </div>
        </li>
      </ol>
      <button className="button secondary full" onClick={close}>
        {shopName ? "Go to my khata" : "I’ll do this later"}
        <ArrowRight size={15} />
      </button>
    </Modal>
  );
}

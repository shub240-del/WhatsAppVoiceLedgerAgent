import { test } from "node:test";
import assert from "node:assert/strict";
import { authErrorMessage } from "../../src/lib/auth-errors";

test("Google authentication errors are actionable without requiring Email/Password", () => {
  assert.match(
    authErrorMessage({ code: "auth/unauthorized-domain" }),
    /add its domain in Firebase Authentication/,
  );
  assert.match(
    authErrorMessage({ code: "auth/operation-not-allowed" }),
    /Google sign-in isn’t enabled/,
  );
  assert.doesNotMatch(
    authErrorMessage({ code: "auth/invalid-credential" }),
    /email or password/i,
  );
});

test("email sign-in errors say what to do, without revealing whether an account exists", () => {
  const wrong = authErrorMessage({ code: "auth/invalid-credential" }, "email");
  assert.equal(wrong, authErrorMessage({ code: "auth/user-not-found" }, "email"));
  assert.match(wrong, /don’t match/);
  assert.match(authErrorMessage({ code: "auth/email-already-in-use" }, "email"), /Log in instead/);
  assert.match(authErrorMessage({ code: "auth/weak-password" }, "email"), /6 characters/);
  assert.match(authErrorMessage({ code: "auth/operation-not-allowed" }, "email"), /continue with Google/);
});

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

export function authErrorMessage(error: unknown, method: "google" | "email" = "google") {
  const code = (error as { code?: string })?.code;
  if (method === "email") {
    switch (code) {
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "That email and password don’t match. Check them, or tap “Forgot password?”.";
      case "auth/invalid-email":
        return "That doesn’t look like an email address. Check it and try again.";
      case "auth/email-already-in-use":
        return "An account with this email already exists. Log in instead.";
      case "auth/weak-password":
      case "auth/missing-password":
        return "Use a password with at least 6 characters.";
      case "auth/operation-not-allowed":
        return "Email sign-up isn’t switched on yet. Please continue with Google for now.";
    }
  }
  switch (code) {
    case "auth/invalid-credential":
      return "Google couldn’t verify this sign-in. Choose the Google account linked to your shop and try again.";
    case "auth/invalid-email":
      return "Google didn’t return a valid email address. Check the account you selected and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/unauthorized-domain":
      return "This website isn’t authorized for sign-in. Ask your administrator to add its domain in Firebase Authentication.";
    case "auth/operation-not-allowed":
      return "Google sign-in isn’t enabled for this project. Please contact your onboarding administrator.";
    case "auth/account-exists-with-different-credential":
      return "This email already uses another sign-in method. Try “Continue with Google” or log in with your email and password.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return "Google sign-in was closed before it finished. You can try again whenever you’re ready.";
    case "auth/redirect-cancelled-by-user":
      return "Google sign-in was cancelled. You can try again whenever you’re ready.";
    case "auth/redirect-operation-pending":
      return "A Google sign-in is already in progress. Finish it in the open window or try again.";
    case "auth/web-storage-unsupported":
      return "This browser can’t save a sign-in session. Enable site storage and try again.";
    case "auth/network-request-failed":
      return "We couldn’t reach the sign-in service. Check your connection and try again.";
    case "auth/user-disabled":
      return "This account is disabled. Please contact your onboarding administrator.";
    default:
      return "We couldn’t complete that request. Please try again, or contact your onboarding administrator.";
  }
}

export function authErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
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
      return "An account already exists with this email using another sign-in method. Contact your onboarding administrator.";
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

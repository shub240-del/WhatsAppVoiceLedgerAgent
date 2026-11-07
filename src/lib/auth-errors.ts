export function authErrorMessage(error: unknown) {
  const code = (error as { code?: string })?.code;
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "The email or password doesn’t match. Please try again or reset your password.";
    case "auth/email-already-in-use":
      return "An account already uses this email. Choose Log in, or reset your password.";
    case "auth/weak-password":
      return "Please choose a stronger password with at least 8 characters.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "We couldn’t reach the sign-in service. Check your connection and try again.";
    case "auth/operation-not-allowed":
      return "Email sign-in hasn’t been enabled for this project. Please contact your onboarding administrator.";
    case "auth/user-disabled":
      return "This account is disabled. Please contact your onboarding administrator.";
    default:
      return "We couldn’t complete that request. Please try again, or contact your onboarding administrator.";
  }
}

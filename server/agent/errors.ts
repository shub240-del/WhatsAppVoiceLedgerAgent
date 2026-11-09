/** Transient failure at an external boundary; safe to retry the whole job. */
export class ProviderUnavailable extends Error {
  constructor(public provider: string, message: string) {
    super(message);
    this.name = "ProviderUnavailable";
  }
}
/** Provider rejected our setup (bad key, unknown model, quota exhausted). Retrying will not help. */
export class ProviderSetupError extends Error {
  constructor(public provider: string, public reason: "invalid_key" | "unknown_model" | "quota", message: string) {
    super(message);
    this.name = "ProviderSetupError";
  }
}
/** The model answered but not with one schema-valid action, even after one repair. */
export class InvalidModelOutput extends Error {
  constructor(message = "Model output failed validation.") {
    super(message);
    this.name = "InvalidModelOutput";
  }
}
/** Audio that can never become a valid transcript (empty, corrupt, too long, unsupported). */
export class UnusableAudio extends Error {
  constructor(public reason: string) {
    super(`Unusable audio: ${reason}`);
    this.name = "UnusableAudio";
  }
}

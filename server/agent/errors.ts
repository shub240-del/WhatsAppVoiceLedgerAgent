/** Transient failure at an external boundary; safe to retry the whole job. */
export class ProviderUnavailable extends Error {
  constructor(public provider: string, message: string) {
    super(message);
    this.name = "ProviderUnavailable";
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

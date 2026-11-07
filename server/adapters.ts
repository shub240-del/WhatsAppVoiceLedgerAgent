// Contracts for external voice providers. No endpoints, auth schemes or capabilities
// are assumed; an implementation is injected only after verified documentation.
export type Transcript = { text: string; language: string | null; confidence: number | null; durationMs: number | null };
export interface SpeechToText {
  transcribe(audio: Uint8Array, languageHints: string[], mimeType: string): Promise<Transcript>;
}
export interface TextToSpeech {
  synthesize(text: string, language: string): Promise<{ audio: Uint8Array; mime: string; durationMs: number | null }>;
}

// No reminder sender is wired in production. Changing a Firestore field or env var
// cannot enable it; a reviewed code change recording Meta/BSP approval is required.
export const reminderPolicy = Object.freeze({ enabled: false, gate: "NOT_APPROVED" as const });

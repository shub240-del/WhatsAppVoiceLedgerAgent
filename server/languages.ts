// Shop language setting -> speech-to-text language hints (Gnani accepts 1–4 codes on prisma-v3.0).
// Hindi and English stay in every list because shop talk is code-mixed ("Ramesh ne 2 Surf liya").
export const SHOP_LANGUAGES = ["hinglish", "mr", "gu"] as const;
export type ShopLanguage = (typeof SHOP_LANGUAGES)[number];

export function sttLanguages(language: unknown): string[] {
  switch (language) {
    case "mr":
      return ["mr-IN", "hi-IN", "en-IN"];
    case "gu":
      return ["gu-IN", "hi-IN", "en-IN"];
    default:
      return ["hi-IN", "en-IN"];
  }
}

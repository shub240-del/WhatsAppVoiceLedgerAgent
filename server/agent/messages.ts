import { formatRupees } from "../money-words.js";

// Fixed, code-rendered replies. Amounts and balances always come from committed DB values.
export const UNDO_HINT = "Galat ho to 'GALAT' likhein (10 minute ke andar).";
export const SUPPORT = () => process.env.SUPPORT_CONTACT?.trim() || "apne shop administrator";
export const msg = {
  unusableAudio: "Awaaz saaf nahi aayi. Aise bolein: 'Ramesh ko 500 ka udhaar likh do'.",
  tooLong: "Voice note 30 second se lamba hai. Chhota voice note bhejein, ek entry ek baar.",
  invalidModel: "Samajh nahi aaya, kuch save nahi hua. Dobara bhejein.",
  systemError: "Abhi save nahi ho paya. Thodi der baad dobara bhejein.",
  busy: "Abhi samajh nahi paya, thodi der baad dobara bhejein. Kuch save nahi hua.",
  unsupportedType: "Kripya voice note ya text bhejein.",
  multiple: "Ek message mein ek hi entry bhejein. Kuch save nahi hua — har customer ke liye alag bhejein.",
  unsupported: "Yeh kaam main nahi kar sakta. Udhaar, payment, baaki ya GALAT ke liye bolein. Kuch save nahi hua.",
  askAmount: "Kitne rupaye likhne hain?",
  askCustomerNone: "Kaun sa customer? Naam dobara bolein. Naya customer dashboard se jodein.",
  expired: "Woh sawal purana ho gaya. Poori entry dobara bolein.",
  alreadyDone: "Yeh entry ho chuka hai.",
  cancelled: "Theek hai, kuch save nahi kiya.",
  pendingReask: (q: string) => `Pehle wala entry pura karein ya 'nahi rehne do' bhejein.\n${q}`,
  alreadyReversed: "Yeh entry pehle hi hata di gayi hai.",
  undoTooOld: "10 minute se purani entry hai. Bolein kaunsi entry hatani hai, jaise 'Ramesh ka 200 wala hata do'.",
  noEntries: "Aisi koi entry nahi mili. Kuch nahi badla.",
  unknownSender: "Yeh number kisi dukaan se juda nahi hai. Kripya apne administrator se sampark karein.",
  stopped: "Theek hai, ab bot messages band. Dobara shuru karne ke liye START bhejein.",
  started: "Bot messages dobara shuru.",
  help: () =>
    `Aise bolein:\n- 'Ramesh ko 340 ka udhaar likh do'\n- 'Sunita ne 200 diye'\n- 'Ramesh ka kitna baaki hai'\nGalti ho to confirmation ko reply karke GALAT likhein (10 minute ke andar).\nMadad: ${SUPPORT()}`,
  // At-a-glance format from the spec: "Ramesh: +₹340 (2kg chawal, 1 Surf). Total baaki: ₹1,260."
  // Amount and balance always come from the committed entry, never from the model.
  credit: (name: string, amount: number, balance: number, items = "") =>
    `${name}: +${formatRupees(amount)}${items.trim() ? ` (${items.trim()})` : ""}. Total baaki: ${formatRupees(balance)}. ${UNDO_HINT}`,
  payment: (name: string, amount: number, balance: number) =>
    `${name}: ${formatRupees(amount)} mile. Total baaki: ${formatRupees(balance)}. ${UNDO_HINT}`,
  undone: (amount: number, name: string, balance: number) =>
    `${formatRupees(amount)} ka entry hata diya (reversal darj hua). ${name} ji ka baaki ab ${formatRupees(balance)} hai.`,
  advance: (amount: number, balance: number) =>
    `${formatRupees(amount)} baaki (${formatRupees(balance)}) se zyada hai. Advance maanein?\n1) Haan\n2) Nahi`,
  large: (amount: number) => `${formatRupees(amount)} bahut bada amount hai. Pakka likhna hai?\n1) Haan\n2) Nahi`,
};

/**
 * Scene-by-scene narration for the walkthrough video (public/video/udhaar-walkthrough.mp4, 85.6 s).
 * Scene times are when each caption appeared while filming (logged, not estimated).
 * Words are sized for a relaxed pace (~2.6 words per second). If a take runs long, the video holds
 * that scene's last frame; the voice is never sped up.
 */
export type Scene = {
  n: number;
  start: number;
  end: number;
  visual: string;
  say: string;
  /** Pronunciation and delivery notes. */
  tips: string[];
};

export const VIDEO_SECONDS = 85.6;

export const SCENES: Scene[] = [
  {
    n: 1, start: 0, end: 3.9,
    visual: "Title card: “Bolo. Udhaar likh gaya.”",
    say: "Har kirana dukaan mein ek udhaar diary hoti hai.",
    tips: ["Calm start, like telling a friend.", "Lean on “udhaar diary”."],
  },
  {
    n: 2, start: 3.9, end: 7.3,
    visual: "The website: headline, Try it free, Demo button.",
    say: "Isliye humne banaya… Udhaar. Ek voice khaata.",
    tips: ["Short pause after “banaya”.", "Udhaar = oo-DHAAR (soft dh).", "khaata = KHAA-taa."],
  },
  {
    n: 3, start: 7.3, end: 16.8,
    visual: "Khata demo: a spoken entry is written into the ruled khata page.",
    say: "Aap bas boliye… aur yeh seedha customer ke khaate mein likh deta hai. Na diary, na typing.",
    tips: ["Pause after “boliye”.", "Say “Na diary, na typing” slowly, a little smile in it."],
  },
  {
    n: 4, start: 16.8, end: 23.8,
    visual: "WhatsApp demo: the owner sends a voice note.",
    say: "Dukaandaar WhatsApp pe voice note bhejta hai: Ramesh ne do kilo chawal aur ek Surf liya, udhaar mein.",
    tips: ["Read the voice note part as if you’re the shopkeeper speaking.", "Surf like the English word.", "dukaandaar = doo-KAAN-daar."],
  },
  {
    n: 5, start: 23.8, end: 29.4,
    visual: "The bot asks “Kitne rupaye likhne hain?”",
    say: "Price nahi bola, toh Udhaar guess nahi karta — seedha poochta hai, kitne rupaye?",
    tips: ["Stress “guess nahi karta” — the key point.", "Ask “kitne rupaye?” like a real question."],
  },
  {
    n: 6, start: 29.4, end: 33.1,
    visual: "Saved: Ramesh +₹230, new balance ₹1,130.",
    say: "Do sau tees — entry save, naya total ready.",
    tips: ["“Do sau tees” = 230.", "Upbeat, it worked."],
  },
  {
    n: 7, start: 33.1, end: 38.7,
    visual: "Payment voice note: “Sunita ne 200 diye”.",
    say: "Payment bhi bilkul aise hi — Sunita ne do sau diye.",
    tips: ["Natural pace; quote the shopkeeper again."],
  },
  {
    n: 8, start: 38.7, end: 43.5,
    visual: "Another udhaar for Priya.",
    say: "Aur ek aur udhaar, Priya ke naam.",
    tips: ["Short and easy."],
  },
  {
    n: 9, start: 43.5, end: 47.3,
    visual: "Three entries done; the live khata updates.",
    say: "Aur khaata — turant update.",
    tips: ["Tiny pause after “khaata”."],
  },
  {
    n: 10, start: 47.3, end: 51.6,
    visual: "“It’s Sunday — send reminders”.",
    say: "Ab asli kamaal — har Sunday, reminder apne aap jaata hai.",
    tips: ["A little energy on “asli kamaal”.", "“apne aap” = automatically."],
  },
  {
    n: 11, start: 51.6, end: 57.5,
    visual: "Ramesh’s phone: a Hindi voice note, the amount and a UPI link.",
    say: "Ramesh ko Hindi mein voice note milta hai — kitna baaki, aur UPI link.",
    tips: ["UPI = say the letters: U-P-I.", "baaki = BAA-kee."],
  },
  {
    n: 12, start: 57.5, end: 61.6,
    visual: "Pay page: shop, amount and “Pay with any UPI app”.",
    say: "Ek tap — UPI app khulta hai, amount pehle se bhara.",
    tips: ["Pause after “Ek tap”."],
  },
  {
    n: 13, start: 61.6, end: 65.1,
    visual: "Sunita’s phone: the same reminder in Marathi.",
    say: "Sunita ko yahi message Marathi mein…",
    tips: ["Marathi = ma-RAA-thee.", "Leave it open, the next scene finishes the sentence."],
  },
  {
    n: 14, start: 65.1, end: 69.7,
    visual: "Priya’s phone: the reminder in Gujarati.",
    say: "aur Priya ko Gujarati mein. Har customer, apni bhasha mein.",
    tips: ["Gujarati = gu-ja-RAA-tee.", "Stress “apni bhasha”."],
  },
  {
    n: 15, start: 69.7, end: 81.5,
    visual: "The owner’s web khata: total due, customers, entries with Fix and Cancel.",
    say: "Aur dukaandaar ka poora khaata web pe bhi hai — kisko kitna dena hai, har entry, aur poori history. Galti ho jaaye, toh fix ya cancel — history hamesha safe.",
    tips: ["Two breaths: one after “poori history”.", "Relaxed, you’re showing your own shop."],
  },
  {
    n: 16, start: 81.5, end: 85.6,
    visual: "End card: “Speak. Save. Get paid.”",
    say: "Udhaar. Bas boliye — aur hisaab ho gaya.",
    tips: ["Pause after “Udhaar”.", "Warm, final."],
  },
];

/** Expected spoken length at a relaxed ~2.6 words per second, plus a breath. */
export const expectedSeconds = (s: Scene) => +(s.say.split(/\s+/).filter(Boolean).length / 2.6 + 0.4).toFixed(1);

export const sceneFile = (n: number) => `scene_${String(n).padStart(2, "0")}.wav`;

export const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;

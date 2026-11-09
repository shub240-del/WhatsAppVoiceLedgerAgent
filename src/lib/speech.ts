/** Text for the phone's Hindi voice: "₹1,240" becomes "1240 rupaye", lines become pauses. */
export function spokenText(reply: string) {
  return reply
    .replace(/[−-]?₹\s?([\d,]+(?:\.\d+)?)/g, (_m, n: string) => `${n.replace(/,/g, "")} rupaye`)
    .replace(/\+(?=\d)/g, "")
    .replace(/\s*\n\s*/g, ". ")
    .trim();
}

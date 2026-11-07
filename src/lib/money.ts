export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);

export function rupeesToPaise(text: string) {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text))
    throw new Error("Enter an amount with at most two decimal places.");
  const [whole, fraction = ""] = text.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Amount must be positive.");
  return value;
}

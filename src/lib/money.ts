export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);

/** Accepts how shop owners type money: "340", "1,200", "₹ 500", "Rs. 50.50". */
export function rupeesToPaise(input: string) {
  const text = input
    .trim()
    .replace(/^(₹|rs\.?|inr)\s*/i, "")
    .replace(/[,\s]/g, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(text))
    throw new Error("Enter the amount in rupees, like 340 or 1,200.");
  const [whole, fraction = ""] = text.split(".");
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Amount must be more than ₹0.");
  return value;
}

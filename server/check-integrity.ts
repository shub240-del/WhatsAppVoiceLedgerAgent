import { store } from "./admin";
import { verifyShopBalances } from "./integrity";

let failures = 0;
const shops = await store.collection("shops").get();
for (const shop of shops.docs) {
  const r = await verifyShopBalances(store, shop.id);
  if (r.mismatches.length) failures += r.mismatches.length;
  console.info(JSON.stringify({ shopId: shop.id, customers: r.checked, entries: r.entries, mismatches: r.mismatches.length }));
}
if (failures) process.exitCode = 1;

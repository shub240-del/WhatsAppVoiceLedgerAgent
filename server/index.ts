import { adminAuth, store } from "./admin";
import { createApi } from "./app";
import { integrationStatuses } from "./config";
import { log } from "./log";

for (const s of integrationStatuses()) log("info", "integration_status", { provider: s.provider, state: s.state });
const app = createApi(store, adminAuth, process.env.ALLOWED_ORIGIN || "");
app.listen(Number(process.env.API_PORT || 3001), "127.0.0.1", () => log("info", "api_ready"));

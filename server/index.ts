import { adminAuth, store } from "./admin.js";
import { createApi } from "./app.js";
import { integrationStatuses } from "./config.js";
import { log } from "./log.js";

for (const s of integrationStatuses()) log("info", "integration_status", { provider: s.provider, state: s.state });
const app = createApi(store, adminAuth, process.env.ALLOWED_ORIGIN || "");
app.listen(Number(process.env.API_PORT || 3001), "127.0.0.1", () => log("info", "api_ready"));

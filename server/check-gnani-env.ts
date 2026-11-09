import { gnaniEnvironmentStatus, gnaniSttConfig } from "./gnani-config.js";
import { verifyGnaniKey } from "./gnani-stt.js";

// Prints readiness without the key, its length or any masked part.
// `pnpm check:gnani-env --live` also sends 1 s of silence to Gnani to prove the key works.
const status = gnaniEnvironmentStatus();
console.info(JSON.stringify({ provider: "gnani", ...status }));
if (status.state !== "configured") process.exitCode = 1;
else if (process.argv.includes("--live")) {
  const { config } = gnaniSttConfig();
  const result = await verifyGnaniKey(config!);
  console.info(JSON.stringify({ provider: "gnani", live: result }));
  if (!result.ok) process.exitCode = 1;
}

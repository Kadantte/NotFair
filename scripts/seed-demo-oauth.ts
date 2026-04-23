import { loadEnvLocal } from "./_load-env";
loadEnvLocal();

import { ensureDemoOAuthClient } from "@/lib/demo/seed";

async function main() {
  const result = await ensureDemoOAuthClient();
  console.log(
    result.created
      ? "Created demo OAuth client + session."
      : "Demo OAuth client + session already existed — no changes needed.",
  );
  console.log(`  client_id:     ${result.clientId}`);
  console.log(`  client_secret: ${result.clientSecret}`);
  console.log(`  session_id:    ${result.sessionId}`);
  console.log(`  server_url:    https://adsagent.org/api/mcp`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

import { loadEnvLocal } from "./_load-env";

loadEnvLocal();

import { sendXConversion } from "@/lib/x-capi";

async function main() {
  const email = process.argv[2] ?? "tongchen92@gmail.com";

  // Use the same fetch path as production via sendXConversion. We patch fetch
  // briefly to capture the response details for diagnostic output.
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const res = await originalFetch(...args);
    const cloned = res.clone();
    const text = await cloned.text().catch(() => "");
    console.log(`HTTP ${res.status} ${res.statusText}`);
    console.log("response body:");
    console.log(text || "(empty)");
    return res;
  }) as typeof fetch;

  console.log(`Sending diagnostic event with email=${email}`);
  await sendXConversion({
    conversionId: `diag-${Date.now()}`,
    email,
    valueDecimal: 1.0,
    currency: "USD",
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

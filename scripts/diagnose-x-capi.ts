import { loadEnvLocal } from "./_load-env";

loadEnvLocal();

import { buildXConversionRequest } from "@/lib/x-capi";

function redactAuthorization(auth: string): {
  scheme: string;
  hasConsumerKey: boolean;
  hasToken: boolean;
  hasSignature: boolean;
  hasNonce: boolean;
  hasTimestamp: boolean;
} {
  return {
    scheme: auth.split(" ", 1)[0] ?? "",
    hasConsumerKey: auth.includes("oauth_consumer_key="),
    hasToken: auth.includes("oauth_token="),
    hasSignature: auth.includes("oauth_signature="),
    hasNonce: auth.includes("oauth_nonce="),
    hasTimestamp: auth.includes("oauth_timestamp="),
  };
}

async function main() {
  const live = process.argv.includes("--live");
  const emailArg = process.argv.find((arg) => arg.startsWith("--email="));
  const email = emailArg?.slice("--email=".length) || "diagnostic@example.com";
  const conversionId = `diag-${Date.now()}`;
  const request = buildXConversionRequest({
    conversionId,
    email,
    valueDecimal: 1.0,
    currency: "USD",
  });

  if (!request) {
    console.error("X CAPI request could not be built. Check OAuth env vars and email input.");
    process.exit(1);
  }

  const body = JSON.parse(request.init.body);
  const conversion = body.conversions[0];
  console.log("X CAPI request built");
  console.log(JSON.stringify({
    mode: live ? "live" : "dry-run",
    method: request.init.method,
    url: request.url,
    authorization: redactAuthorization(request.init.headers.Authorization),
    eventId: conversion.event_id,
    conversionId: conversion.conversion_id,
    identifierKeys: conversion.identifiers.flatMap((id: Record<string, string>) => Object.keys(id)),
  }, null, 2));

  if (!live) {
    console.log("Dry-run only. Re-run with --live to POST a real diagnostic conversion.");
    return;
  }

  const response = await fetch(request.url, request.init);
  const text = await response.text().catch(() => "");
  console.log(`HTTP ${response.status} ${response.statusText}`);
  console.log(text || "(empty)");
  if (!response.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

export function getAppOrigin(): string {
  const envOrigin = process.env.NEXT_PUBLIC_APP_URL;

  if (envOrigin) {
    return envOrigin.replace(/\/$/, "");
  }

  throw new Error("Missing NEXT_PUBLIC_APP_URL");
}

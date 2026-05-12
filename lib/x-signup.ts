import "server-only";
import crypto from "node:crypto";

export const X_SIGNUP_ID_COOKIE = "x_signup_id";

export function buildXSignupConversionId(userId: string): string {
  const digest = crypto
    .createHash("sha256")
    .update(`x-signup:${userId}`)
    .digest("hex")
    .slice(0, 32);
  return `signup-${digest}`;
}

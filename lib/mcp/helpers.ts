import type { AuthContext } from "@/lib/google-ads";
import { resolveAccountId, authForAccount } from "@/lib/google-ads";

/**
 * Common auth setup for tool handlers.
 * Resolves the target account and returns both auth objects needed by tool implementations.
 */
export function resolveToolAuth(
  currentAuth: () => AuthContext,
  accountId?: string,
): { auth: AuthContext; targetId: string; targetAuth: AuthContext } {
  const auth = currentAuth();
  const targetId = resolveAccountId(auth, accountId);
  const targetAuth = authForAccount(auth, accountId);
  return { auth, targetId, targetAuth };
}

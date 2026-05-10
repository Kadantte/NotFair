import { z } from "zod";
import { authForAccount, resolveAccountId } from "@/lib/google-ads";
import { logChange, getUndoableChange, markRolledBack } from "@/lib/db/tracking";
import { typedResult, safeHandler, accountIdParam } from "../types";
import type { WriteToolDeps } from "./_deps";
import { executeUndoForChange } from "../write-tools";

export function registerUndoTools(deps: WriteToolDeps) {
  const { server, currentAuth } = deps;

  // ─── Undo ───────────────────────────────────────────────────────

  server.registerTool("undoChange", {
    description: "Undo a previous write operation by changeId. Only works within 7 days AND only if the entity hasn't been modified since the original change. Returns error if either condition is not met.",
    inputSchema: {
      accountId: accountIdParam,
      changeId: z.number().int().positive().describe("changeId returned by the original write operation"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  }, safeHandler(async ({ accountId, changeId }) => {
    const auth = currentAuth();
    const targetId = resolveAccountId(auth, accountId);

    const check = await getUndoableChange(targetId, changeId);
    if ("error" in check) {
      return typedResult({ success: false, error: check.error });
    }

    const { change } = check;
    const targetAuth = authForAccount(auth, accountId);

    const undoResult = await executeUndoForChange(targetAuth, change);

    if (undoResult.success) {
      await markRolledBack(changeId);
      await logChange({
        accountId: targetId,
        userId: auth.userId,
        campaignId: change.campaignId ?? null,
        writeResult: undoResult,
        reasoning: `Undo of change #${changeId} (${change.toolName})`,
        clientSource: auth.clientName,
      });
    }

    return typedResult({
      ...undoResult,
      undoneChangeId: changeId,
      originalAction: change.toolName,
    });
  }));
}

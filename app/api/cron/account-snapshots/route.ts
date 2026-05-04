import { NextResponse } from "next/server";
import { refreshStaleAccountSnapshots } from "@/lib/google-ads/account-snapshot-refresh";

function sanitizeResult(result: Awaited<ReturnType<typeof refreshStaleAccountSnapshots>>) {
  return {
    ...result,
    candidates: result.candidates.map((candidate) => ({
      accountId: candidate.accountId,
      currentDailyBudget: candidate.currentDailyBudget,
      currentActiveCampaigns: candidate.currentActiveCampaigns,
      lastSyncedAt: candidate.lastSyncedAt,
      operations: candidate.operations,
      writes: candidate.writes,
      lastOperationAt: candidate.lastOperationAt,
      lastSnapshotWriteAt: candidate.lastSnapshotWriteAt,
      googleEmail: candidate.googleEmail,
      sessionLoginCustomerId: candidate.sessionLoginCustomerId,
      entryLoginCustomerId: candidate.entryLoginCustomerId,
      hasEntryLoginCustomerId: candidate.hasEntryLoginCustomerId,
      reason: candidate.reason,
    })),
  };
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get("limit") ?? 75);
  const minOps = Number(searchParams.get("minOps") ?? 20);
  const dryRun = searchParams.get("dryRun") === "1";

  try {
    const result = await refreshStaleAccountSnapshots({ limit, minOps, dryRun });
    return NextResponse.json({ success: true, ...sanitizeResult(result) });
  } catch (error) {
    console.error("[cron/account-snapshots] Fatal error:", error);
    return NextResponse.json(
      { error: "Account snapshot refresh failed" },
      { status: 500 },
    );
  }
}

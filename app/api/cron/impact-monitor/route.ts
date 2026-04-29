import { NextResponse } from "next/server";
import { evaluateWatchingChangeInterventions, isMissingImpactMonitorSchemaError } from "@/lib/db/interventions";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await evaluateWatchingChangeInterventions();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[cron/impact-monitor] Fatal error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impact monitor cron failed" },
      { status: isMissingImpactMonitorSchemaError(error) ? 503 : 500 },
    );
  }
}

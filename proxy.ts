import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Run on all routes except static assets and API routes.
    // API routes use their own auth (MCP Bearer tokens, Google Ads OAuth).
    "/((?!_next/static|_next/image|favicon.ico|icon\\.svg|api/).*)",
  ],
};

import { NextResponse } from "next/server";
import { getSessionAuth } from "@/lib/session";
import {
  getToolPermissions,
  setToolPermissions,
  isToolPermissionMode,
} from "@/lib/tool-permissions";

export async function GET() {
  const session = await getSessionAuth().catch(() => null);
  if (!session?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const permissions = await getToolPermissions(session.userId);
  return NextResponse.json({ permissions });
}

export async function PUT(request: Request) {
  const session = await getSessionAuth().catch(() => null);
  if (!session?.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const updates: Array<{ toolName: string; mode: "always_allow" | "needs_approval" | "blocked" }> = [];

  if (Array.isArray(body.updates)) {
    for (const u of body.updates) {
      if (typeof u?.toolName === "string" && isToolPermissionMode(u?.mode)) {
        updates.push({ toolName: u.toolName, mode: u.mode });
      }
    }
  } else if (typeof body.toolName === "string" && isToolPermissionMode(body.mode)) {
    updates.push({ toolName: body.toolName, mode: body.mode });
  } else if (Array.isArray(body.toolNames) && isToolPermissionMode(body.mode)) {
    for (const name of body.toolNames) {
      if (typeof name === "string") {
        updates.push({ toolName: name, mode: body.mode });
      }
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "no valid updates" }, { status: 400 });
  }

  await setToolPermissions(session.userId, updates);
  const permissions = await getToolPermissions(session.userId);
  return NextResponse.json({ permissions });
}

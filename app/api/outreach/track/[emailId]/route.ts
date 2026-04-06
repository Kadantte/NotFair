import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { verifyToken } from "@/lib/outreach-tokens";

// 1x1 transparent PNG
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQAAFiUBSVIk8AAAAA0lEQVQI12P4z8BQDwAEgAF/QualzQAAAABJRU5ErkJggg==",
  "base64"
);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ emailId: string }> }
) {
  const { emailId } = await params;
  const id = verifyToken(emailId, "track");

  if (id !== null) {
    // Only update if currently "sent" (don't overwrite "failed")
    await db()
      .update(schema.outreachEmails)
      .set({ status: "opened", openedAt: new Date() })
      .where(
        and(
          eq(schema.outreachEmails.id, id),
          eq(schema.outreachEmails.status, "sent")
        )
      );
  }

  return new NextResponse(PIXEL, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

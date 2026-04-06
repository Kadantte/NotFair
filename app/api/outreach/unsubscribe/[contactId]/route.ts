import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ contactId: string }> }
) {
  const { contactId } = await params;
  const id = Number(contactId);

  if (!isNaN(id)) {
    await db()
      .update(schema.contacts)
      .set({ unsubscribed: true })
      .where(eq(schema.contacts.id, id));
  }

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Unsubscribed</title></head>
<body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1A1917;color:#E8E4DD;">
  <div style="text-align:center;max-width:400px;padding:24px;">
    <h1 style="font-size:24px;margin-bottom:8px;">Unsubscribed</h1>
    <p style="color:#9B9689;font-size:14px;">You have been removed from our mailing list and will no longer receive emails from us.</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}

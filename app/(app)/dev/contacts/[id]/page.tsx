import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Mail, AlertCircle, ExternalLink, Sparkles } from "lucide-react";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { STATUS_CONFIG } from "@/lib/outreach-metrics";
import { isGmailConfigured, listThreadsForEmail, type GmailThreadSummary } from "@/lib/gmail";
import { reconcileContactFromThreads } from "@/lib/outreach-reconcile";
import { ContactDraftEditor } from "./contact-draft-editor";
import { ThreadCard, formatDateTime } from "@/components/outreach/thread-card";
import { formatCompactNumber } from "@/app/(app)/dev/_components/dev-utils";

export const dynamic = "force-dynamic";

export default async function ContactProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contactId = Number(id);
  if (!Number.isFinite(contactId)) notFound();

  const session = await getSession();
  if (!session.connected) redirect("/connect");
  if (!session.isDev) redirect("/connect");

  const [initial] = await db()
    .select()
    .from(schema.contacts)
    .where(eq(schema.contacts.id, contactId))
    .limit(1);
  if (!initial) notFound();

  let threads: GmailThreadSummary[] = [];
  let gmailError: string | null = null;
  let contact = initial;
  const gmailOn = isGmailConfigured();
  if (gmailOn) {
    try {
      threads = await listThreadsForEmail(contact.email, 15);
      contact = (await reconcileContactFromThreads(contact.email, threads, contact)) ?? contact;
    } catch (err) {
      gmailError = err instanceof Error ? err.message : String(err);
    }
  }

  const sc = STATUS_CONFIG.find((s) => s.key === contact.status);
  const badgeStyle = sc
    ? { backgroundColor: `${sc.color}26`, color: sc.color }
    : { backgroundColor: "#C4C0B626", color: "#C4C0B6" };

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || null;

  return (
    <section className="min-h-screen bg-[#1A1917] text-[#E8E4DD]">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <Link
          href="/dev"
          prefetch
          className="inline-flex items-center gap-1.5 text-[12px] text-[#C4C0B6] hover:text-[#E8E4DD] mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to dev
        </Link>

        <div className="rounded-xl border border-[#3D3C36] bg-[#24231F] p-5 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {fullName && (
                <div className="text-[20px] font-semibold text-[#E8E4DD] mb-1">{fullName}</div>
              )}
              <div className="text-[14px] text-[#E8E4DD] font-mono">{contact.email}</div>
              {contact.company && (
                <div className="text-[13px] text-[#C4C0B6] mt-1">{contact.company}</div>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-2">
              <span
                className="rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                style={badgeStyle}
              >
                {contact.status}
              </span>
              {contact.lastContactedAt && (
                <span className="text-[11px] text-[#C4C0B6]/70">
                  last contact {formatDateTime(new Date(contact.lastContactedAt))}
                </span>
              )}
              {contact.unsubscribed && (
                <span className="text-[11px] text-[#C45D4A]">unsubscribed</span>
              )}
              {contact.bounceCount > 0 && (
                <span className="text-[11px] text-[#D4882A]">
                  {contact.bounceCount} bounce{contact.bounceCount === 1 ? "" : "s"}
                </span>
              )}
            </div>
          </div>
        </div>

        {contact.kind === "influencer" && (
          <div className="rounded-xl border border-[#3D3C36] bg-[#24231F] p-5 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-[#9BC4FF]" />
              <h2 className="text-[11px] text-[#C4C0B6] uppercase tracking-wider">Influencer profile</h2>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
              {contact.platform && (
                <Field label="Platform" value={contact.platform} capitalize />
              )}
              {contact.handle && (
                <Field label="Handle" value={`@${contact.handle}`} mono />
              )}
              {contact.followerCount != null && (
                <Field label="Followers" value={formatCompactNumber(contact.followerCount)} mono />
              )}
              {contact.niche && <Field label="Niche" value={contact.niche} />}
              {contact.discoveredBy && (
                <Field label="Discovered by" value={contact.discoveredBy} />
              )}
              {contact.discoveredAt && (
                <Field label="Discovered" value={formatDateTime(new Date(contact.discoveredAt))} />
              )}
            </dl>
            {contact.profileUrl && (
              <a
                href={contact.profileUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-[#6B8AED] hover:text-[#9BC4FF]"
              >
                Open profile <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {contact.notes && (
              <div className="mt-4 rounded-lg border border-[#3D3C36] bg-[#1A1917] p-3 text-[13px] text-[#C4C0B6] whitespace-pre-wrap">
                {contact.notes}
              </div>
            )}
          </div>
        )}

        <div className="mb-5">
          <h2 className="text-[11px] text-[#C4C0B6] uppercase tracking-wider mb-2">Draft</h2>
          <ContactDraftEditor
            contactId={contact.id}
            initialSubject={contact.draftSubject ?? ""}
            initialBody={contact.draftBody ?? ""}
            hasGmailDraftId={!!contact.gmailDraftId}
            canSend={!contact.unsubscribed && contact.status !== "bounced"}
          />
        </div>

        <div>
          <h2 className="text-[11px] text-[#C4C0B6] uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Mail className="w-3 h-3" />
            Email thread
          </h2>
          {!gmailOn && (
            <div className="rounded-lg border border-[#D4882A]/40 bg-[#D4882A]/10 px-4 py-3 text-[13px] text-[#D4882A] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                Gmail not configured. Run <code className="font-mono text-[12px]">npx tsx scripts/gmail-auth.ts</code> and set{" "}
                <code className="font-mono text-[12px]">GMAIL_REFRESH_TOKEN</code> to enable thread history.
              </div>
            </div>
          )}
          {gmailError && (
            <div className="rounded-lg border border-[#C45D4A]/40 bg-[#C45D4A]/10 px-4 py-3 text-[13px] text-[#C45D4A] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>Failed to load Gmail threads: {gmailError}</div>
            </div>
          )}
          {gmailOn && !gmailError && threads.length === 0 && (
            <div className="rounded-lg border border-[#3D3C36] bg-[#1A1917] px-4 py-6 text-[13px] text-[#C4C0B6] text-center">
              No Gmail threads with this address yet.
            </div>
          )}
          {threads.length > 0 && (
            <div className="space-y-3">
              {threads.map((t) => (
                <ThreadCard key={t.id} thread={t} />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  mono,
  capitalize,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] font-semibold text-[#C4C0B6] uppercase tracking-widest mb-0.5">
        {label}
      </dt>
      <dd
        className={`text-[13px] text-[#E8E4DD] ${mono ? "font-mono" : ""} ${capitalize ? "capitalize" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}


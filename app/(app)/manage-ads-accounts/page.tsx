import Image from "next/image";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { db, schema } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasJoinedWaitlist, isWaitlistApproved } from "@/lib/waitlist";
import { BrandLockup } from "@/components/brand-lockup";
import { OnboardingSignOut } from "@/components/onboarding-sign-out";
import { MetaWaitlistCard } from "@/components/meta-waitlist";

type CandidateAccount = {
  id: string;
  name: string;
  loginCustomerId?: string | null;
  loginCustomerName?: string | null;
};

type Props = {
  searchParams: Promise<{ next?: string }>;
};

/**
 * Platform-picker hub. Three states:
 *
 *   1. **First-time** — signed in but neither a Google customer nor a Meta
 *      ad account is connected yet. Render a focused full-screen onboarding
 *      that covers the app chrome: brand, title, two platform cards, and an
 *      "Exit and sign out" escape hatch. The user MUST connect a platform
 *      to proceed into the app.
 *
 *   2. **Pending Google with candidate accounts** — Google card forwards
 *      straight to the picker so the user can commit a selection.
 *
 *   3. **Already-connected** (Google, Meta, or both) — the regular embedded
 *      hub UI inside the app layout. Cards link to the platform manage
 *      pages.
 */
export default async function ManageAdsAccountsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") ? sp.next : null;

  const session = await getSession();

  // Pull the candidate accounts list when this is a pending Google session.
  let pendingGoogleAccounts: CandidateAccount[] = [];
  let pendingToken: string | null = null;
  if (session.connected && session.pendingSetup) {
    const [row] = await db()
      .select({ customerIds: schema.mcpSessions.customerIds })
      .from(schema.mcpSessions)
      .where(eq(schema.mcpSessions.accessToken, session.token))
      .limit(1);
    if (row) {
      try {
        const parsed = JSON.parse(row.customerIds) as CandidateAccount[];
        if (Array.isArray(parsed)) pendingGoogleAccounts = parsed;
      } catch {
        // Malformed candidate list — fall through to the empty-state link.
      }
      pendingToken = session.token;
    }
  }

  const googleEmail = session.connected ? session.googleEmail : null;
  const hasGoogle = session.connected && !session.pendingSetup;
  const hasMeta = session.connected && session.metaAccounts.length > 0;
  const isFirstTime = session.connected && !hasGoogle && !hasMeta;
  const isAdsLess = session.connected && session.pendingSetup && pendingGoogleAccounts.length === 0;

  const googleHref = buildGoogleHref({
    pendingToken,
    pendingAccounts: pendingGoogleAccounts,
    next,
  });
  const switchGoogleHref =
    `/api/auth/signin?prompt=select_account+consent&next=${encodeURIComponent(next ?? "/manage-ads-accounts")}`;

  const googleCard = isAdsLess ? (
    <AdsLessGoogleEntry switchHref={switchGoogleHref} googleEmail={googleEmail} />
  ) : (
    <PlatformCard
      href={googleHref}
      title="Add Google Ads account"
      description="Connect a Google Ads customer or MCC."
      iconSrc="/google-ads-icon.svg"
    />
  );
  // Meta App Review is still pending — gate the entry behind a join-waitlist
  // card. Approved users (granted from /dev/waitlist) bypass the wall and
  // see the regular connect card. The gate also fires when the user has
  // already joined, so the card shows "You're on the list" instead of CTA.
  const metaWallEnabled = !(await isWaitlistApproved("meta_ads"));
  const metaWaitlistJoined = metaWallEnabled ? await hasJoinedWaitlist("meta_ads") : false;

  const metaHref = hasMeta
    ? "/manage-ads-accounts/meta-ads"
    : `/api/oauth/meta/start?next=${encodeURIComponent(next ?? "/manage-ads-accounts/meta-ads")}`;
  const metaCard = metaWallEnabled && !hasMeta ? (
    <MetaWaitlistCard initialJoined={metaWaitlistJoined} source="hub" />
  ) : (
    <PlatformCard
      href={metaHref}
      title={hasMeta ? "Manage Meta Ads accounts" : "Add Meta Ads account"}
      description="Connect a Facebook + Instagram ad account."
      iconSrc="/meta-icon.svg"
    />
  );

  if (isFirstTime) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-[#1A1917]">
        <header className="flex shrink-0 items-center justify-between px-6 py-5">
          <BrandLockup size="md" />
          <OnboardingSignOut />
        </header>
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 pb-12">
          <div className="w-full max-w-xl">
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold text-[#E8E4DD]">
                Connect your first ad account
              </h1>
              <p className="mt-3 text-base leading-relaxed text-[#C4C0B6]">
                NotFair needs at least one ad account to get to work.
                Pick a platform below to continue.
              </p>
            </div>
            <div className="space-y-3">
              {googleCard}
              {metaCard}
            </div>
            <p className="mt-6 text-center text-xs text-[#C4C0B6]/70">
              You can add more platforms later from the navbar account menu.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-2xl">
          <header className="mb-8">
            <h1 className="text-2xl font-semibold text-[#E8E4DD]">Add ad account</h1>
            <p className="mt-1.5 text-sm text-[#C4C0B6]">
              Pick the platform you want to connect to NotFair.
            </p>
          </header>
          <div className="space-y-3">
            {googleCard}
            {metaCard}
          </div>
        </div>
      </div>
    </section>
  );
}

function AdsLessGoogleEntry({
  switchHref,
  googleEmail,
}: {
  switchHref: string;
  googleEmail: string | null;
}) {
  return (
    <div className="rounded-xl border border-[#D4882A]/40 bg-[#D4882A]/[0.04] px-5 py-4">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#1A1917]">
          <Image
            src="/google-ads-icon.svg"
            alt=""
            width={28}
            height={28}
            className="shrink-0"
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-[#E8E4DD]">Add Google Ads account</p>
          <p className="mt-1 inline-flex items-start gap-1.5 text-sm text-[#D4882A]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              No Google Ads account under{" "}
              {googleEmail ? (
                <span className="font-medium text-[#E8E4DD]">{googleEmail}</span>
              ) : (
                "this Google account"
              )}
              . Switch to a Google account that has Ads access.
            </span>
          </p>
          <Link
            href={switchHref}
            className="mt-3 inline-flex h-9 items-center rounded-lg bg-[#4CAF6E] px-4 text-sm font-semibold text-[#1A1917] hover:bg-[#3D9A5C]"
          >
            Switch Google account
          </Link>
        </div>
      </div>
    </div>
  );
}

function buildGoogleHref(opts: {
  pendingToken: string | null;
  pendingAccounts: CandidateAccount[];
  next: string | null;
}): string {
  if (opts.pendingToken && opts.pendingAccounts.length > 0) {
    const accountsParam = encodeURIComponent(JSON.stringify(opts.pendingAccounts));
    const nextParam = opts.next ? `&next=${encodeURIComponent(opts.next)}` : "";
    return `/manage-ads-accounts/google-ads/select?pending=${opts.pendingToken}&accounts=${accountsParam}${nextParam}`;
  }
  return "/manage-ads-accounts/google-ads";
}

function PlatformCard({
  href,
  title,
  description,
  iconSrc,
}: {
  href: string;
  title: string;
  description: string;
  iconSrc: string;
}) {
  return (
    <Link
      href={href}
      prefetch
      className="group flex items-center gap-4 rounded-xl border border-[#3D3C36] bg-[#24231F] px-5 py-4 transition hover:border-[#C4C0B6]/40 hover:bg-[#2E2D28]"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#1A1917]">
        <Image src={iconSrc} alt="" width={28} height={28} className="shrink-0" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-[#E8E4DD]">{title}</p>
        <p className="mt-0.5 text-sm text-[#C4C0B6]">{description}</p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-[#C4C0B6] transition group-hover:translate-x-0.5 group-hover:text-[#E8E4DD]" />
    </Link>
  );
}

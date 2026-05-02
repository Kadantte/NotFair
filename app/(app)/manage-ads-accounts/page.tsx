import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function ManageAdsAccountsPage() {
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
            <PlatformCard
              href="/manage-ads-accounts/google-ads"
              title="Add Google Ads account"
              description="Connect a Google Ads customer or MCC."
              icon={
                <Image
                  src="/google-ads-icon.svg"
                  alt=""
                  width={28}
                  height={28}
                  className="shrink-0"
                  aria-hidden="true"
                />
              }
            />
            <PlatformCard
              href="/manage-ads-accounts/meta-ads"
              title="Add Meta Ads account"
              description="Connect a Facebook + Instagram ad account."
              icon={
                <Image
                  src="/meta-icon.svg"
                  alt=""
                  width={28}
                  height={28}
                  className="shrink-0"
                  aria-hidden="true"
                />
              }
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function PlatformCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      prefetch
      className="group flex items-center gap-4 rounded-xl border border-[#3D3C36] bg-[#24231F] px-5 py-4 transition hover:border-[#C4C0B6]/40 hover:bg-[#2E2D28]"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#1A1917]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-[#E8E4DD]">{title}</p>
        <p className="mt-0.5 text-sm text-[#C4C0B6]">{description}</p>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-[#C4C0B6] transition group-hover:translate-x-0.5 group-hover:text-[#E8E4DD]" />
    </Link>
  );
}

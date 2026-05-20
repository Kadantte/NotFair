import { GoogleAdsAuditPage } from "./google-ads-audit-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Free Google Ads Audit — Find Wasted Spend in 5 Minutes | NotFair",
  description:
    "Run a free Google Ads audit with NotFair. Connect your account, find wasted spend, conversion tracking gaps, negative keyword issues, and the next approved fix.",
  path: "/google-ads-audit",
  keywords: [
    "free Google Ads audit",
    "Google Ads audit tool",
    "Google Ads wasted spend audit",
    "Google Ads account audit",
  ],
});

export default function Page() {
  return <GoogleAdsAuditPage />;
}

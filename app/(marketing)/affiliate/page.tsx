import { AffiliatePage } from "@/components/marketing/affiliate-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "NotFair Affiliate Program — 50% Revenue Share",
  description:
    "Refer customers to NotFair and earn 50% of their first 12 months of revenue. Monthly payouts via Stripe or Wise. Onboarding happens in Discord.",
  path: "/affiliate",
  keywords: [
    "NotFair affiliate program",
    "Google Ads MCP affiliate",
    "AI ads partner program",
    "NotFair revenue share",
  ],
});

export default function Affiliate() {
  return <AffiliatePage />;
}

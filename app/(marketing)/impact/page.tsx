import { ImpactPage } from "@/components/marketing/impact-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Impact Tracker for Google Ads Changes",
  description:
    "Review AdsAgent change history, before and after context, and attribution notes for Google Ads optimization work.",
  path: "/impact",
  keywords: [
    "Google Ads impact tracking",
    "Google Ads change history",
    "AI Google Ads audit trail",
    "Google Ads optimization tracking",
  ],
});

export default function Impact() {
  return <ImpactPage />;
}

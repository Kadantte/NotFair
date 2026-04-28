import { buildMetadata, buildFaqJsonLd } from "@/lib/seo";
import { GoogleAdsAuditPage } from "./google-ads-audit-page";

export const metadata = buildMetadata({
  title: "Free Google Ads Audit — Results in 5 Minutes | NotFair",
  description:
    "Get a free Google Ads audit instantly. AI finds wasted spend, missed opportunities, and structural issues — then gives you a prioritized 3-step fix list. No credit card. No agency.",
  path: "/google-ads-audit",
  keywords: [
    "Google Ads audit",
    "free Google Ads audit",
    "Google Ads account audit",
    "Google Ads health check",
    "Google Ads wasted spend",
    "Google Ads score",
    "Google Ads optimization audit",
  ],
});

const faqSchema = buildFaqJsonLd([
  {
    question: "What does a Google Ads audit check?",
    answer:
      "NotFair's Google Ads audit checks conversion tracking, keyword health, search term quality, campaign structure, ad copy, impression share, and spend efficiency. Results are organized into 3 action passes (Stop Wasting, Capture More, Fix Fundamentals) with 3 pulse metrics you can track over time: waste rate, demand captured, and CPA.",
  },
  {
    question: "Is the Google Ads audit really free?",
    answer:
      "Yes. The audit is completely free. You connect your Google Ads account via Google OAuth (read-only — we can't make changes) and the AI runs the full analysis automatically. No credit card, no forms to fill out.",
  },
  {
    question: "How long does the Google Ads audit take?",
    answer:
      "The audit runs in under 5 minutes after you connect your Google Ads account. Results include your pulse metrics (waste rate, demand captured, CPA), a wasted spend breakdown, and a prioritized 3-pass action plan.",
  },
  {
    question: "Will the audit make changes to my Google Ads account?",
    answer:
      "No. The audit is read-only. We analyze your account data but make zero changes. Any optimizations require your explicit approval.",
  },
]);

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <GoogleAdsAuditPage />
    </>
  );
}

import { buildMetadata, buildFaqJsonLd } from "@/lib/seo";
import { GoogleAdsAuditPage } from "./google-ads-audit-page";

export const metadata = buildMetadata({
  title: "Free Google Ads Audit — Score Your Account in 5 Minutes | AdsAgent",
  description:
    "Get a free Google Ads audit instantly. AI scores 7 dimensions — conversion tracking, keyword health, search term waste, ad copy, and more. No credit card. No agency.",
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
      "AdsAgent's Google Ads audit analyzes 7 dimensions: conversion tracking setup, keyword health, search term quality, campaign structure, ad copy strength, impression share, and spend efficiency. Each is scored 0–5 and weighted into an overall account score out of 100.",
  },
  {
    question: "Is the Google Ads audit really free?",
    answer:
      "Yes. The audit is completely free. You connect your Google Ads account via Google OAuth (read-only — we can't make changes) and the AI runs the full analysis automatically. No credit card, no forms to fill out.",
  },
  {
    question: "How long does the Google Ads audit take?",
    answer:
      "The audit runs in under 5 minutes after you connect your Google Ads account. Results include your overall score, dimension-by-dimension breakdown, wasted spend estimate, and a prioritized list of fixes.",
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

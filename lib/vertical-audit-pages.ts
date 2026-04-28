import type { FaqItem } from "@/lib/seo";

export type VerticalSlug =
  | "ecommerce"
  | "legal"
  | "home-services"
  | "healthcare"
  | "insurance"
  | "saas";

export type VerticalPainPoint = {
  title: string;
  body: string;
};

export type VerticalFinding = {
  label: string;
  finding: string;
  impact: string;
  color: string; // hex
};

export type VerticalAuditPage = {
  slug: VerticalSlug;
  industry: string; // display name — "Ecommerce Stores"
  industryShort: string; // short form — "Ecommerce"
  title: string; // SEO title (includes "Google Ads Audit" + industry)
  description: string; // meta description ~150-160 chars
  keywords: string[];
  heroEyebrow: string;
  heroTitle: string; // plain text H1
  heroDescription: string; // 2-3 sentences
  spendRange: string; // e.g. "$1K–$20K/mo"
  cpcRange: string; // e.g. "$0.50–$5"
  typicalWaste: string; // e.g. "$800–$4,200/mo"
  industryPainPoints: VerticalPainPoint[]; // 3 items
  auditFindings: VerticalFinding[]; // 4 items, industry-specific $ amounts
  exampleSavings: string; // narrative block ~60 words
  industrySpecificChecks: string[]; // 3-5 checks
  faq: FaqItem[]; // 4 items
};

const RED = "#C45D4A";
const AMBER = "#D4882A";

export const verticalAuditPages: Record<VerticalSlug, VerticalAuditPage> = {
  ecommerce: {
    slug: "ecommerce",
    industry: "Ecommerce Stores",
    industryShort: "Ecommerce",
    title: "Google Ads Audit for Ecommerce Stores — Free in 5 Minutes | NotFair",
    description:
      "Free Google Ads audit for ecommerce. AI reviews Shopping, PMAX, product feed health, ROAS by SKU, and wasted spend — with a 3-step fix list. No credit card.",
    keywords: [
      "Google Ads audit ecommerce",
      "ecommerce Google Ads audit",
      "Shopping ads audit",
      "PMAX audit",
      "product feed audit",
      "ecommerce ROAS audit",
      "Google Ads audit Shopify",
    ],
    heroEyebrow: "For ecommerce stores · Free · 5 minutes",
    heroTitle: "Google Ads audit for ecommerce — fix Shopping, PMAX, and product feed leaks.",
    heroDescription:
      "Most Shopify, WooCommerce, and BigCommerce stores leak 15–30% of their paid-search budget through disapproved feed items, PMAX cannibalizing brand traffic, and Shopping campaigns bidding on unprofitable SKUs. This free audit pulls live account data and tells you exactly where the money is going.",
    spendRange: "$1K–$20K/mo",
    cpcRange: "$0.50–$5",
    typicalWaste: "$300–$4,500/mo",
    industryPainPoints: [
      {
        title: "PMAX eats your brand traffic",
        body: "Performance Max campaigns love to absorb branded search queries you would have won organically. Without a brand-exclusion list, Google will happily charge you $2–$5 per click for traffic that was already yours. The audit quantifies the brand spend bleeding into PMAX and shows the exact campaigns doing it.",
      },
      {
        title: "Product feed disapprovals silently kill ROAS",
        body: "A single Merchant Center suspension or 200+ disapproved items can wipe 40% of your impressions overnight — and the dashboard rarely screams loudly enough. The audit reads your feed health, flags disapproval reasons, and highlights SKUs that never ship an impression because of policy or GTIN issues.",
      },
      {
        title: "Shopping spends on zero-margin SKUs",
        body: "Target ROAS bidding only sees revenue, not contribution margin. Most stores end up funneling spend into high-ticket but low-margin products while starving the real winners. The audit surfaces your top spending products, pairs them with conversion data, and flags the SKUs that should be excluded or bid down.",
      },
    ],
    auditFindings: [
      { label: "Feed Health", finding: "42 disapproved products in Shopping", impact: "28% of catalog dark", color: RED },
      { label: "PMAX Brand Bleed", finding: "PMAX absorbing branded queries", impact: "$1,840/mo reclaimable", color: RED },
      { label: "SKU-Level ROAS", finding: "8 SKUs spending with ROAS < 1.0", impact: "$960/mo wasted", color: AMBER },
      { label: "Search Term Waste", finding: "63 irrelevant queries on broad match", impact: "$1,220/mo wasted", color: AMBER },
    ],
    exampleSavings:
      "A typical ecommerce account spending $8K/mo on Google Ads sees around $1,200–$2,000 of that lost to PMAX brand cannibalization, Shopping spend on unprofitable SKUs, and broad-match search terms that never convert. Fixing the top three findings usually reclaims 18–25% of monthly spend without reducing volume — and often improves blended ROAS by 0.4–0.8x within a month.",
    industrySpecificChecks: [
      "Merchant Center feed health — disapproved items, GTIN errors, policy suspensions",
      "PMAX brand-query exclusion and campaign-level negative keyword lists",
      "Shopping spend by product, with contribution margin overlay",
      "Target ROAS vs actual ROAS drift across Shopping and PMAX campaigns",
      "Search-partner and Display placements inside Search campaigns",
    ],
    faq: [
      {
        question: "Does this audit work for Shopify and WooCommerce stores?",
        answer:
          "Yes. The audit reads directly from your Google Ads account via OAuth, so it works the same whether your store runs on Shopify, WooCommerce, BigCommerce, Magento, or a custom stack. If you have a Merchant Center feed and a Google Ads account, the audit will analyze it.",
      },
      {
        question: "Will the audit see my product feed in Merchant Center?",
        answer:
          "The audit checks Shopping campaign performance and flags when impressions have dropped sharply, which is often the signal that feed disapprovals are happening. For deeper feed diagnostics, we point you to the exact Merchant Center report to open — and we surface the product IDs that are spending without converting.",
      },
      {
        question: "My store uses PMAX — is that a problem?",
        answer:
          "PMAX is not a problem by itself. The common issue is that PMAX absorbs branded search queries you would have won anyway, and it mixes Display, YouTube, and Shopping placements with no transparency. The audit flags when PMAX is cannibalizing brand spend and recommends brand-exclusion lists.",
      },
      {
        question: "How is this different from the Google Ads recommendations tab?",
        answer:
          "The recommendations tab is optimized for Google's revenue, not yours. It will often suggest auto-applied bid increases, broad match expansions, and budget lifts that raise spend before they raise profit. Our audit ranks findings by dollar impact to your account, not by Optimization Score.",
      },
    ],
  },

  legal: {
    slug: "legal",
    industry: "Law Firms",
    industryShort: "Legal",
    title: "Google Ads Audit for Law Firms — Free in 5 Minutes | NotFair",
    description:
      "Free Google Ads audit for law firms. AI reviews PI, criminal, family, and practice-area campaigns for jurisdiction waste, negative keyword gaps, and lead quality.",
    keywords: [
      "Google Ads audit law firm",
      "law firm Google Ads audit",
      "attorney Google Ads audit",
      "personal injury Google Ads audit",
      "legal PPC audit",
      "lawyer PPC audit",
      "Google Ads audit attorneys",
    ],
    heroEyebrow: "For law firms · Free · 5 minutes",
    heroTitle: "Google Ads audit for law firms — stop paying $150 for the wrong clicks.",
    heroDescription:
      "Legal CPCs are the most expensive on the internet. A single wasted click on \"personal injury lawyer\" can cost $150–$400, and most law firms are quietly paying for clicks from outside their licensed jurisdictions, from job seekers, or from pro-bono queries. This free Google Ads audit finds those leaks in under 5 minutes — with real dollar amounts, not vanity scores.",
    spendRange: "$5K–$30K/mo",
    cpcRange: "$50–$200+",
    typicalWaste: "$2,000–$9,000/mo",
    industryPainPoints: [
      {
        title: "Out-of-jurisdiction clicks you can never convert",
        body: "If you are a Georgia firm bidding on \"car accident lawyer\" without tight geo-targets and radius rules, you are paying for clicks from Florida and Alabama that your intake team has to reject. A single day of loose targeting can burn $400–$800 on leads you cannot legally represent. The audit flags geo-target coverage and recommends the exclusions most law firms miss.",
      },
      {
        title: "Job-seeker and pro-bono queries you never negatived",
        body: "Search terms like \"personal injury lawyer salary,\" \"how to become a lawyer,\" and \"free legal aid\" show up in every unfiltered account. At $80+ CPCs, even a handful of these per day is a real line-item cost. The audit pulls your 90-day search term report and shows the top waste queries ranked by dollar burn.",
      },
      {
        title: "Intake not wired back to Google Ads",
        body: "Most firms optimize toward \"form submissions\" or \"phone calls\" — but Google cannot see which of those became signed cases. That means bidding is tuned for form-fills, not clients, and the algorithm keeps optimizing toward the wrong outcome. The audit checks whether your intake CRM is feeding qualified-lead and signed-case conversions back into Google Ads.",
      },
    ],
    auditFindings: [
      { label: "Geo-Target Waste", finding: "47 clicks from outside licensed states", impact: "$4,800/mo wasted", color: RED },
      { label: "Negative Keywords", finding: "Missing job-seeker / pro-bono negatives", impact: "$1,950/mo wasted", color: RED },
      { label: "Conversion Signal", finding: "Signed-case conversion not imported", impact: "Bidding is flying blind", color: RED },
      { label: "Ad Schedule", finding: "After-hours spend with no call coverage", impact: "$620/mo wasted", color: AMBER },
    ],
    exampleSavings:
      "A typical personal-injury firm spending $18K/mo on Google Ads is usually wasting $3,500–$6,500 on out-of-jurisdiction clicks, job-seeker queries, and after-hours spend with no intake coverage. Even a modest cleanup — tighter geo rules, a shared negative keyword list, and importing signed-case conversions — typically cuts cost-per-qualified-lead by 25–40% within 60 days, which is 1–3 additional cases per month at zero extra spend.",
    industrySpecificChecks: [
      "Geo-target coverage vs licensed jurisdictions, including radius targets",
      "Negative keyword hygiene for job, salary, free, and DIY legal queries",
      "Call-tracking integrity and conversion import from intake CRM (Lead Docket, Clio Grow, Litify, etc.)",
      "Ad scheduling vs actual intake / answering-service coverage",
      "Practice-area ad group separation (PI vs criminal vs family) with distinct copy and bids",
    ],
    faq: [
      {
        question: "Does the audit understand practice-area nuances (PI vs criminal vs family)?",
        answer:
          "The audit reads your campaign and ad group structure, so it sees when practice areas are mixed together or when copy and keywords do not match the intent of a specific practice. It flags over-broad campaigns and suggests splitting when mixing is hurting match-type quality and CPC efficiency.",
      },
      {
        question: "We get a lot of junk leads — can the audit help?",
        answer:
          "Yes. Most legal junk leads come from three sources: broad-match keywords catching informational queries, missing negative keyword lists, and conversion tracking that counts form-fills instead of qualified leads. The audit surfaces all three and ranks them by dollar impact on your account.",
      },
      {
        question: "Will this replace our marketing agency?",
        answer:
          "No. The audit is a diagnostic, not a replacement for ongoing management. Most firms use the audit to verify that their current agency or in-house team is catching the obvious waste, and to push for fixes on anything that slipped through. If you run campaigns yourself, the 3-pass fix list is something you can execute solo.",
      },
      {
        question: "Is the audit safe for a law firm account — does it make changes?",
        answer:
          "The audit is strictly read-only. We connect via Google OAuth with analysis-only scope and cannot pause, edit, or bid on anything inside your account. You see the findings and decide what (if anything) to change.",
      },
    ],
  },

  "home-services": {
    slug: "home-services",
    industry: "Home Services",
    industryShort: "Home Services",
    title: "Google Ads Audit for Home Services — Free in 5 Minutes | NotFair",
    description:
      "Free Google Ads audit for HVAC, plumbing, roofing, and electricians. AI checks geo-targeting, call tracking, emergency-query coverage, and wasted spend.",
    keywords: [
      "Google Ads audit HVAC",
      "plumbing Google Ads audit",
      "roofing Google Ads audit",
      "home services PPC audit",
      "Google Ads audit contractor",
      "electrician Google Ads audit",
      "service business PPC audit",
    ],
    heroEyebrow: "For home services · Free · 5 minutes",
    heroTitle: "Google Ads audit for home services — HVAC, plumbing, roofing, electricians.",
    heroDescription:
      "Home-services CPCs run $15–$80, and most owners run ads between jobs with no time to babysit a campaign. That means loose service-area radius, no call tracking, no LSA integration, and emergency queries mixed with informational ones. This free Google Ads audit reads your account in 5 minutes and shows exactly where your phone-lead dollars are being wasted.",
    spendRange: "$1K–$10K/mo",
    cpcRange: "$15–$80",
    typicalWaste: "$400–$2,800/mo",
    industryPainPoints: [
      {
        title: "Service-area radius is too wide",
        body: "Most HVAC and plumbing accounts are set to a 30- or 50-mile radius around the shop — which sounds reasonable until you realize you are paying $45 per click from a town your van will not drive to. The audit compares your geo targets to the service areas where your jobs actually close, and flags the miles that are bleeding budget.",
      },
      {
        title: "Emergency vs informational queries are mixed",
        body: "\"Water heater leaking\" is a high-intent emergency query worth $60. \"How does a water heater work\" is a DIY query worth nothing. Most home-services accounts bid on both at the same rate because they are sitting in the same ad group on broad match. The audit separates the intent tiers and shows you which clicks are actually phone-ready.",
      },
      {
        title: "Phone calls are not tracked as conversions",
        body: "In home services the phone is the conversion — but most accounts still optimize toward form submissions or website clicks. Without Google call tracking (or a tool like CallRail) wired back as an imported conversion, Google is bidding blind and your cost-per-call looks fine only because the denominator is wrong. The audit checks whether calls are actually feeding the bidding algorithm.",
      },
    ],
    auditFindings: [
      { label: "Geo-Target Waste", finding: "Radius includes non-service ZIPs", impact: "$1,380/mo wasted", color: RED },
      { label: "Call Tracking", finding: "Phone calls not imported as conversions", impact: "Bidding is flying blind", color: RED },
      { label: "Negative Keywords", finding: "Missing DIY / informational negatives", impact: "$540/mo wasted", color: AMBER },
      { label: "Ad Schedule", finding: "Ads running when shop is closed", impact: "$290/mo wasted", color: AMBER },
    ],
    exampleSavings:
      "A typical HVAC or plumbing account spending $4K/mo on Google Ads is usually wasting $600–$1,400 on out-of-service-area clicks, DIY queries, and after-hours spend with no one to answer the phone. Tightening the service radius, adding a 40-term negative keyword list, and importing CallRail conversions typically drops cost-per-call by 30–45% within 30 days — which is 10–20 more booked jobs per month on the same budget.",
    industrySpecificChecks: [
      "Service-area geo-targets cross-referenced with ZIPs where jobs actually close",
      "Call-tracking setup (Google forwarding numbers or CallRail) and conversion import",
      "Negative keyword list for DIY, \"how to,\" parts, and warranty queries",
      "Ad scheduling against business hours and answering-service coverage",
      "LSA (Local Services Ads) vs Search overlap and budget allocation",
    ],
    faq: [
      {
        question: "Does this audit help if I run Local Services Ads (LSAs) too?",
        answer:
          "Yes. The audit focuses on your Google Ads Search campaigns, but it flags when Search and LSA are likely competing for the same queries — which is common for HVAC and plumbing. When both are running, tightening Search keywords around non-LSA queries is usually the biggest efficiency win.",
      },
      {
        question: "I run ads myself between jobs — can I act on the findings?",
        answer:
          "Yes — the output is a 3-step prioritized fix list with exact keywords, geo rules, and negative keyword recommendations. Most owners can apply the top fixes in 20–30 minutes inside Google Ads. If you want help, the same recommendations can be executed through NotFair's approval-based workflow.",
      },
      {
        question: "What if my call tracking is through a different tool?",
        answer:
          "Whether you use CallRail, WhatConverts, Invoca, or Google's built-in call tracking, the audit checks whether calls are flowing back into Google Ads as conversions. The fix is usually a conversion-import setup (CallRail → Google Ads offline conversion), which we walk you through.",
      },
      {
        question: "My ads run on nights and weekends — is that wasted spend?",
        answer:
          "Not always. Emergency plumbing, water damage, and HVAC failures peak at nights and weekends. The audit checks whether your after-hours spend correlates with actual after-hours bookings — if you have a 24/7 answering service, keep it on. If voicemails go unanswered, pause.",
      },
    ],
  },

  healthcare: {
    slug: "healthcare",
    industry: "Healthcare & Dental Practices",
    industryShort: "Healthcare",
    title: "Google Ads Audit for Healthcare & Dental Practices — Free | NotFair",
    description:
      "Free Google Ads audit for dental, medical, and healthcare practices. HIPAA-aware review of conversion tracking, new-patient lead cost, and practice-area waste.",
    keywords: [
      "Google Ads audit dental",
      "dental Google Ads audit",
      "healthcare Google Ads audit",
      "medical practice PPC audit",
      "HIPAA Google Ads audit",
      "dentist PPC audit",
      "healthcare PPC audit",
    ],
    heroEyebrow: "For healthcare & dental · Free · 5 minutes",
    heroTitle: "Google Ads audit for healthcare and dental practices — built HIPAA-aware.",
    heroDescription:
      "A new patient at a dental or medical practice is worth $5K–$15K in lifetime value, which means small CPA improvements produce outsized ROI. But most practices are run by office managers with no PPC training, relying on form fills that never made it back to Google as a conversion. This free audit reviews your account with HIPAA-aware handling, flags the tracking gaps, and shows the 3 biggest wins.",
    spendRange: "$2K–$15K/mo",
    cpcRange: "$20–$60",
    typicalWaste: "$600–$3,500/mo",
    industryPainPoints: [
      {
        title: "Conversion tracking is missing patient-quality signal",
        body: "Most practices optimize toward \"contact form submission\" — but not every form becomes a booked appointment, and the ones that do often represent a wide range of lifetime value. The audit checks whether appointment-booking software (Dentrix, Eaglesoft, Weave, NexHealth) is feeding booked-appointment conversions back to Google Ads. Without that signal, bidding optimizes for the cheapest clicks, not the best patients.",
      },
      {
        title: "Procedure-level ROI is invisible",
        body: "A cleaning is worth $120. Invisalign is worth $5,500. If they share a campaign and a bid strategy, the algorithm will happily starve the high-value procedure in favor of cheaper-to-convert cleanings. The audit flags campaigns where high-LTV procedures are lumped in with low-LTV services, which almost always suppresses profitable growth.",
      },
      {
        title: "HIPAA-sensitive terms and copy compliance",
        body: "Healthcare advertisers face tighter scrutiny on personalized ads, audience targeting, and tracking. Many practices accidentally set up remarketing audiences or upload customer lists that conflict with Google's healthcare policies. The audit reviews which audience and targeting configurations are HIPAA-risky and flags them before they become a compliance issue.",
      },
    ],
    auditFindings: [
      { label: "Conversion Tracking", finding: "Booked-appointment not imported", impact: "Bidding on wrong signal", color: RED },
      { label: "High-LTV Procedures", finding: "Invisalign mixed with cleanings", impact: "$1,420/mo suppressed demand", color: RED },
      { label: "Negative Keywords", finding: "DIY and symptom-research queries", impact: "$680/mo wasted", color: AMBER },
      { label: "Audience Compliance", finding: "Remarketing lists from condition pages", impact: "HIPAA policy risk", color: AMBER },
    ],
    exampleSavings:
      "A typical dental or medical practice spending $6K/mo on Google Ads is usually wasting $900–$2,000 on low-intent symptom queries, broad campaigns that starve high-LTV procedures, and conversion tracking that cannot tell the difference between a form-fill and a booked appointment. Importing booked-appointment conversions and splitting high-LTV procedures into their own campaigns typically cuts cost-per-new-patient by 25–40% and unlocks demand that was previously hidden by bad signal.",
    industrySpecificChecks: [
      "Booked-appointment conversion import from practice management / scheduling software",
      "Campaign split between high-LTV procedures (implants, Invisalign, cosmetic) and general services",
      "HIPAA-compliant audience and remarketing configuration",
      "Call tracking and new-patient vs existing-patient call routing",
      "Negative keyword coverage for DIY, symptom, and insurance-only queries",
    ],
    faq: [
      {
        question: "Is the audit HIPAA-compliant?",
        answer:
          "The audit is read-only and analyzes campaign-level Google Ads data (keywords, spend, clicks, impressions), which does not contain protected health information. We flag any audience or targeting setup in your account that could create HIPAA risk, but the audit itself does not touch patient data.",
      },
      {
        question: "Will this audit help for specialty practices (orthodontics, dermatology, cosmetic)?",
        answer:
          "Yes — in fact, specialty practices see the biggest wins from this audit. Specialty procedures have the highest patient LTV, which means small CPA improvements produce outsized impact. The audit is especially useful for Invisalign, implants, LASIK, cosmetic derm, and cosmetic surgery accounts.",
      },
      {
        question: "We use Weave / Dentrix / NexHealth for scheduling — does the audit see those?",
        answer:
          "The audit checks whether your scheduling software is feeding booked-appointment conversions back to Google Ads. Most practice management platforms support this through offline conversion import or a Zapier integration — if it is not wired up, that is almost always the single highest-impact fix.",
      },
      {
        question: "What if we don't do much Google Ads — is the audit still useful?",
        answer:
          "Yes. Even at $1,500–$3,000/mo of spend, a single missing conversion import or an untargeted ad group can cost $500+/mo. The audit scales to the size of your account and ranks findings by dollar impact, so small accounts see small-but-meaningful fixes.",
      },
    ],
  },

  insurance: {
    slug: "insurance",
    industry: "Insurance Agents",
    industryShort: "Insurance",
    title: "Google Ads Audit for Insurance Agents — Free in 5 Minutes | NotFair",
    description:
      "Free Google Ads audit for independent insurance agents. AI reviews auto, home, life, and commercial campaigns for lead farms, brand defense, and CPC waste.",
    keywords: [
      "Google Ads audit insurance",
      "insurance agent Google Ads audit",
      "insurance PPC audit",
      "Google Ads audit insurance agent",
      "independent agent PPC audit",
      "life insurance Google Ads audit",
      "auto insurance PPC audit",
    ],
    heroEyebrow: "For insurance agents · Free · 5 minutes",
    heroTitle: "Google Ads audit for insurance agents — fight lead farms, win brand defense.",
    heroDescription:
      "Insurance has some of the most brutal auction dynamics on Google. Lead-gen farms, national brands, and aggregators push CPCs to $30–$100+ — and an independent agent running \"auto insurance near me\" without a strong negative keyword list and a brand-defense strategy loses money every single day. This free audit diagnoses exactly where your budget is going.",
    spendRange: "$3K–$20K/mo",
    cpcRange: "$30–$100",
    typicalWaste: "$1,200–$5,500/mo",
    industryPainPoints: [
      {
        title: "Broad match is a lead-farm magnet",
        body: "Terms like \"auto insurance,\" \"cheap car insurance,\" and \"compare insurance quotes\" attract comparison-shoppers, bots, and lead aggregators reselling the same prospect to 8 other agencies. On broad match, a single unmanaged ad group will burn $300+/day on queries that never turn into a bound policy. The audit shows your broad-match exposure and the top waste queries ranked by dollar burn.",
          },
      {
        title: "No brand defense against national carriers",
        body: "Geico, Progressive, and State Farm bid on your agency name to intercept high-intent prospects. If you are not running a brand campaign with exact match on your own name, you are paying organic traffic to competitors in the SERP. The audit checks whether your brand is defended and estimates the impression share you are currently ceding.",
      },
      {
        title: "Conversion tracking counts quote-forms, not bound policies",
        body: "Every insurance account counts form-submissions as the conversion — but only 20–35% of those become quoted accounts, and only a fraction become bound policies. If your AMS (Applied, EZLynx, HawkSoft) is not feeding bound-policy events back to Google Ads, bidding is optimizing for the cheapest quote-request, not for policies that actually close.",
      },
    ],
    auditFindings: [
      { label: "Broad Match Waste", finding: "94 irrelevant quote-shop queries", impact: "$2,850/mo wasted", color: RED },
      { label: "Brand Defense", finding: "No exact-match brand campaign", impact: "~22% brand IS lost", color: RED },
      { label: "Conversion Quality", finding: "Bound-policy not imported from AMS", impact: "Bidding on wrong signal", color: RED },
      { label: "Geo-Target Hygiene", finding: "Licensed-state targeting too loose", impact: "$1,100/mo wasted", color: AMBER },
    ],
    exampleSavings:
      "A typical independent agency spending $12K/mo on Google Ads is usually wasting $2,500–$5,000 on broad-match comparison shoppers, missing brand defense, and quote-form optimization that never makes it to bound policies. Tightening match types, adding a 200+ term negative keyword list, running a brand campaign, and importing bound-policy conversions typically cuts cost-per-bound-policy by 35–55% within 60–90 days.",
    industrySpecificChecks: [
      "Broad-match exposure and negative keyword list depth (target: 150+ terms)",
      "Brand campaign presence and exact-match coverage on agency name",
      "Bound-policy conversion import from agency management system (AMS)",
      "Licensed-state geo-targets with exclusion of unlicensed states",
      "Lead-quality segmentation: auto vs home vs life vs commercial in separate campaigns",
    ],
    faq: [
      {
        question: "Will this help for captive agents (State Farm, Allstate, Farmers)?",
        answer:
          "Yes — with a caveat. Captive agents usually run inside a corporate-approved program with constrained keyword, copy, and landing-page options. The audit still surfaces waste and geo-targeting issues, but some fixes require coordination with corporate marketing. Independent agents have more flexibility to act on findings directly.",
      },
      {
        question: "I sell across auto, home, life, and commercial — does the audit split these?",
        answer:
          "Yes. The audit reads your campaign structure and flags when multiple product lines are mixed into one campaign or ad group, which is one of the most common reasons CPA looks fine in aggregate but is actually losing money on specific lines. We break down waste by product line where your structure allows it.",
      },
      {
        question: "What about lead aggregator traffic — can the audit detect it?",
        answer:
          "Lead aggregator and comparison-shop traffic shows up in the search term report as queries containing \"compare,\" \"quotes,\" \"cheap,\" \"free quote,\" and aggregator brand names. The audit pulls these queries, quantifies the spend, and recommends a negative keyword list you can paste directly into Google Ads.",
      },
      {
        question: "Do you work with EZLynx or Applied AMS conversion import?",
        answer:
          "Yes. The audit checks whether your AMS is exporting bound-policy events back to Google Ads. Most AMS platforms support offline conversion import (directly or through a Zapier/PieSync bridge), and wiring this up is almost always the single highest-impact fix for an insurance account.",
      },
    ],
  },

  saas: {
    slug: "saas",
    industry: "B2B SaaS",
    industryShort: "B2B SaaS",
    title: "Google Ads Audit for B2B SaaS — Free in 5 Minutes | NotFair",
    description:
      "Free Google Ads audit for B2B SaaS. AI reviews MQL/SQL tracking, LTV-based bidding, competitor campaigns, and pipeline waste — with a 3-step fix list.",
    keywords: [
      "Google Ads audit SaaS",
      "B2B SaaS Google Ads audit",
      "SaaS PPC audit",
      "B2B Google Ads audit",
      "SaaS MQL PPC audit",
      "SaaS pipeline PPC audit",
      "B2B PPC audit",
    ],
    heroEyebrow: "For B2B SaaS · Free · 5 minutes",
    heroTitle: "Google Ads audit for B2B SaaS — stop optimizing for demos that never close.",
    heroDescription:
      "B2B SaaS has a long sales cycle, a noisy top-of-funnel, and a Google Ads algorithm that will happily optimize toward \"demo request\" even when 85% of demos are unqualified. Most accounts are bidding on MQLs that will never become SQLs, paying to educate students and competitors, and running competitor campaigns with zero landing-page fit. This audit reads your account and ranks the leaks by dollar impact on pipeline.",
    spendRange: "$5K–$50K/mo",
    cpcRange: "$10–$80",
    typicalWaste: "$1,500–$12,000/mo",
    industryPainPoints: [
      {
        title: "Demo requests are not a real conversion",
        body: "Google will optimize toward whatever you tell it is a \"conversion\" — and for most SaaS accounts that is a raw demo request. But 60–90% of demo requests are students, competitors, partners, or out-of-ICP prospects who will never become a customer. Bidding optimizes for the cheapest demo-request, not for pipeline. The audit checks whether qualified-pipeline events are being fed back from your CRM (HubSpot, Salesforce) into Google Ads.",
      },
      {
        title: "Competitor campaigns with generic landing pages",
        body: "Almost every SaaS account bids on competitor brand terms like \"Monday alternative\" or \"Notion vs X.\" The problem is most of them send that traffic to the homepage, which has a 1.1% conversion rate against competitor-intent traffic that needed a real comparison page. The audit flags competitor campaigns pointed at generic URLs and estimates the demand you are leaving on the table.",
      },
      {
        title: "Broad match on category keywords spends on students and job seekers",
        body: "Terms like \"project management software,\" \"CRM software,\" or \"analytics platform\" attract students writing term papers, job seekers researching companies, and consultants building decks. On broad match with auto-bidding, these queries can eat 30% of your category-keyword budget. The audit surfaces your top wasted queries and gives you a ready-to-paste negative keyword list.",
      },
    ],
    auditFindings: [
      { label: "Conversion Signal", finding: "SQL/Opportunity not imported from CRM", impact: "Bidding on unqualified demos", color: RED },
      { label: "Competitor Campaign", finding: "Generic LP on competitor traffic", impact: "$3,200/mo weak CVR", color: RED },
      { label: "Broad Match Leak", finding: "Students, jobs, research queries", impact: "$2,400/mo wasted", color: RED },
      { label: "Impression Share", finding: "Brand IS lost to competitor bidding", impact: "~18% brand demand leaking", color: AMBER },
    ],
    exampleSavings:
      "A typical B2B SaaS account spending $25K/mo on Google Ads is usually wasting $4,000–$9,000 on raw demo-request optimization, competitor campaigns pointed at the homepage, and category keywords bleeding into student and job-seeker queries. Importing SQL/Opportunity conversions, building real competitor comparison pages, and tightening match types typically cuts cost-per-qualified-pipeline by 30–50% and lets the algorithm actually pull the right prospects.",
    industrySpecificChecks: [
      "CRM conversion import (HubSpot, Salesforce) — SQL, Opportunity, Closed-Won as separate events",
      "Value-based bidding configured against deal value or tier (not raw demo count)",
      "Competitor-keyword campaigns with dedicated comparison landing pages",
      "Negative keyword list for \"jobs,\" \"salary,\" \"students,\" \"review,\" \"alternatives free\" queries",
      "Brand defense campaign against competitor bidding on your name",
    ],
    faq: [
      {
        question: "We use HubSpot for lifecycle stages — can the audit tie into that?",
        answer:
          "Yes. The audit checks whether HubSpot lifecycle stages (MQL → SQL → Opportunity → Customer) are being fed back to Google Ads as separate conversion events with appropriate values. Most SaaS accounts only send \"form submission\" back — which is why bidding optimizes for the wrong thing. The top fix is almost always wiring HubSpot → Google Ads conversion import with stage-weighted values.",
      },
      {
        question: "Our sales cycle is 3–6 months — does Google Ads still work?",
        answer:
          "Yes, but only if you send Google the right signal. With a 3–6 month cycle, optimizing toward \"demo request\" will always misfire because Google cannot wait 6 months to learn. The fix is a two-layer conversion model: a short-cycle signal (SQL in 14 days) for bidding, and a long-cycle signal (Closed-Won) for revenue attribution and value-based bidding once you have enough data.",
      },
      {
        question: "Should we run competitor campaigns at all?",
        answer:
          "Usually yes, but they need dedicated landing pages. Competitor-intent traffic has already decided they want software in your category — they just have not decided on you. A real \"Us vs [Competitor]\" page with a feature comparison converts 3–5x better than sending that traffic to your homepage. The audit flags every competitor campaign pointed at a generic URL.",
      },
      {
        question: "What about PMAX for B2B SaaS?",
        answer:
          "PMAX can work for SaaS but only with customer match audiences (ICP signal) and value-based bidding tied to CRM-stage values. Running PMAX with raw demo-request as the conversion event is one of the fastest ways to burn a SaaS budget. The audit flags when PMAX is mis-signaled and recommends whether to pause, restructure, or feed it better audience data.",
      },
    ],
  },
};

export const allVerticalAuditPages = Object.values(verticalAuditPages);

export function getVerticalAuditPage(slug: string): VerticalAuditPage | null {
  return verticalAuditPages[slug as VerticalSlug] ?? null;
}

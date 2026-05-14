import type { FaqItem } from "@/lib/seo";

export const SHARED_FAQ: Record<"trust" | "cost" | "official" | "scope", FaqItem> = {
  trust: {
    question: "Is NotFair safe to use on a real Google Ads account?",
    answer:
      "Yes. NotFair separates read tools from write tools. Diagnostic queries run freely, but every write — bid change, negative keyword, ad copy, campaign state — is approval-gated and logged with full provenance so you can audit exactly what the agent did.",
  },
  cost: {
    question: "How much does NotFair cost?",
    answer:
      "Free during open beta. NotFair plans to keep a generous free tier for solo operators and a usage-priced plan for teams managing multiple accounts. See /pricing for current limits.",
  },
  official: {
    question: "Is NotFair an official Google or Anthropic product?",
    answer:
      "No. NotFair is an independent product built on the Model Context Protocol (MCP) standard and the Google Ads API. MCP is Anthropic's open protocol for connecting AI clients to external tools; NotFair is one focused entirely on Google Ads.",
  },
  scope: {
    question: "Does NotFair support more than Google Ads?",
    answer:
      "Meta Ads is in beta and GoHighLevel is shipping. Roadmap covers the rest of the SMB ad stack. The principle is the same on every platform: typed primitives, freshness metadata, approval-gated writes.",
  },
};

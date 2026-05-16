import { notFound } from "next/navigation";
import { McpPage } from "@/components/marketing/mcp-page";
import { buildMetadata } from "@/lib/seo";

const MCP_CLIENTS = ["claude", "openclaw", "codex", "cursor", "hermes"] as const;

type McpClient = (typeof MCP_CLIENTS)[number];

const CLIENT_LABELS: Record<McpClient, string> = {
  claude: "Claude",
  openclaw: "OpenClaw",
  codex: "Codex",
  cursor: "Cursor",
  hermes: "Hermes",
};

function isMcpClient(value: string): value is McpClient {
  return (MCP_CLIENTS as readonly string[]).includes(value);
}

type Props = {
  params: Promise<{ client: string }>;
};

export function generateStaticParams() {
  return MCP_CLIENTS.map((client) => ({ client }));
}

export async function generateMetadata({ params }: Props) {
  const { client } = await params;
  if (!isMcpClient(client)) return {};

  const label = CLIENT_LABELS[client];

  return buildMetadata({
    title: `NotFair MCP for ${label} — Google Ads & Meta Ads MCP Setup`,
    description:
      `Set up NotFair's hosted Google Ads and Meta Ads MCP servers in ${label}. Connect once, then let your AI agent diagnose, fix, and operate ad accounts with approval-gated writes.`,
    path: `/mcp/${client}`,
    keywords: [
      `${label.toLowerCase()} mcp`,
      `${label.toLowerCase()} google ads mcp`,
      `${label.toLowerCase()} meta ads mcp`,
      "notfair mcp",
      "ads mcp server",
    ],
  });
}

export default async function McpClientPage({ params }: Props) {
  const { client } = await params;
  if (!isMcpClient(client)) notFound();

  return <McpPage initialPlatformId={client} />;
}

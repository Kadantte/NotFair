'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Copy, Check, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CLIENTS = [
    {
        id: 'claude',
        name: 'Claude',
        hint: 'Paste into Claude Code. It will add AdsAgent to your Claude Desktop config so Coworker can use it.',
        prompt: (mcpUrl: string, token: string, _accountName: string) =>
            `Add this MCP server to my claude_desktop_config.json (find it — macOS: ~/Library/Application Support/Claude/, Windows: %APPDATA%/Claude/, Linux: ~/.config/Claude/) under mcpServers:

"adsagent": {
  "command": "npx",
  "args": [
    "-y",
    "mcp-remote",
    "${mcpUrl}",
    "--transport",
    "streamable-http",
    "--header",
    "Authorization: Bearer ${token}"
  ]
}

Read the existing file, merge this into mcpServers, and write it back. Then tell me to restart Claude Desktop.`,
    },
    {
        id: 'codex',
        name: 'Codex',
        hint: 'Paste into Codex CLI. It will add AdsAgent as an MCP server and start analyzing your ads.',
        prompt: (mcpUrl: string, token: string, accountName: string) =>
            `Set up this MCP server in Codex so I can manage my ads with AI:

1. Run this command to add the server:

codex mcp add adsagent --url ${mcpUrl} -- --header "Authorization: Bearer ${token}"

2. Verify it was added:

codex mcp list

3. Restart Codex or reopen the IDE panel to load the server.

Once connected, show me how my campaigns are performing — top spenders, wasted budget, and quick wins.`,
    },
    {
        id: 'openclaw',
        name: 'OpenClaw',
        hint: 'Paste into OpenClaw. It will use MCPorter to set up AdsAgent as a skill and start optimizing your ads.',
        prompt: (mcpUrl: string, token: string, accountName: string) =>
            `## Step 1: Add the MCP server

Add this MCP server to your config (openclaw.json or equivalent):

"adsagent": {
  "command": "npx",
  "args": [
    "-y",
    "mcp-remote",
    "${mcpUrl}",
    "--transport",
    "streamable-http",
    "--header",
    "Authorization: Bearer ${token}"
  ]
}

## Step 2: Use MCPorter to discover and verify the tools

Run these commands to confirm the server is reachable and see all available tools:

npx mcporter list adsagent --schema

This should show 12 tools: getAccountInfo, listCampaigns, getCampaignPerformance, getKeywords, getSearchTermReport, pauseKeyword, enableKeyword, updateBid, addNegativeKeyword, updateCampaignBudget, pauseCampaign, enableCampaign.

## Step 3: Generate a typed client for the skill

npx mcporter emit-ts adsagent --mode client --out ~/.openclaw/skills/adsagent/adsagent-client.ts

## Step 4: Create the AdsAgent skill

Create the file ~/.openclaw/skills/adsagent/SKILL.md with this content:

---
name: adsagent
description: Manage Google Ads campaigns — read performance, optimize keywords, adjust bids and budgets, add negatives, pause/enable campaigns.
version: 1.0.0
mcp_servers:
  - adsagent
triggers:
  - google ads
  - campaigns
  - keywords
  - ad spend
  - CPA
  - ROAS
  - search terms
  - negative keywords
  - bid
  - budget
  - pause campaign
  - ads performance
---

# AdsAgent — Google Ads Management

You have access to 12 Google Ads tools via the \`adsagent\` MCP server. Use them to help the user monitor and optimize their ad campaigns.

## Available Tools

### Read (safe, no side effects)
- **getAccountInfo** — Account name, currency, timezone, test status
- **listCampaigns** — All campaigns with impressions, clicks, cost, conversions. Params: \`limit\` (1-100, default 20), \`includeRemoved\` (bool, default false)
- **getCampaignPerformance** — Daily metrics over a date range. Params: \`campaignId\`, \`days\` (1-365, default 30)
- **getKeywords** — Top keywords with quality scores. Params: \`campaignId\`, \`days\`, \`limit\`
- **getSearchTermReport** — Actual search queries triggering ads. Params: \`campaignId\`, \`days\`, \`limit\`

### Write (mutates the account — always confirm with user first)
- **pauseKeyword** — Stop a keyword. Params: \`campaignId\`, \`adGroupId\`, \`criterionId\`
- **enableKeyword** — Re-enable a paused keyword. Params: \`adGroupId\`, \`criterionId\`
- **updateBid** — Change CPC bid (manual/enhanced CPC only, max 25% change). Params: \`campaignId\`, \`adGroupId\`, \`criterionId\`, \`newBidDollars\`
- **addNegativeKeyword** — Block irrelevant search terms (phrase match). Params: \`campaignId\`, \`keywordText\`
- **updateCampaignBudget** — Change daily budget (max 50% change, min $1/day). Params: \`campaignId\`, \`newDailyBudgetDollars\`
- **pauseCampaign** — Pause all ads in a campaign. Params: \`campaignId\`
- **enableCampaign** — Re-enable a paused campaign. Params: \`campaignId\`

## Rules

1. **Never make write changes without explicit user confirmation.** Always show what you plan to change, the current value, and the new value before executing.
2. **Start with reads.** When the user asks about their ads, begin with listCampaigns and getAccountInfo to build context.
3. **Show numbers clearly.** Format cost as dollars, show CTR as percentages, include date ranges.
4. **Recommend before acting.** When you spot waste (high-spend zero-conversion keywords, irrelevant search terms), recommend the action and wait for approval.
5. **Guardrails are server-side.** Bid changes >25% and budget changes >50% will be rejected by the server. Don't try to circumvent this.

## Common Workflows

### "How are my ads doing?"
1. getAccountInfo → listCampaigns → summarize top spenders, best/worst performers, total spend

### "Find wasted spend"
1. listCampaigns → pick top-spend campaigns
2. getKeywords for each → find high-spend, zero-conversion keywords
3. getSearchTermReport → find irrelevant search terms
4. Recommend: pause wasteful keywords + add negative keywords

### "Optimize bids"
1. getKeywords → find keywords with good conversion rates but low impression share
2. Recommend bid increases (within 25% limit) for high-performers
3. Recommend bid decreases for underperformers

---

## Step 5: Verify it works

Now use the skill. Call getAccountInfo to verify the connection, then listCampaigns to show me how my campaigns are performing — top spenders, wasted budget, and quick wins I should act on.`,
    },
] as const;

export default function ConnectPage() {
    return (
        <Suspense fallback={
            <div className="pt-24 pb-16 px-4 flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-700 border-t-blue-400" />
            </div>
        }>
            <ConnectContent />
        </Suspense>
    );
}

function ConnectContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams.get('token');
    const customerName = searchParams.get('customer_name');
    const error = searchParams.get('error');
    const pendingToken = searchParams.get('pending');
    const accountsParam = searchParams.get('accounts');

    const [mcpUrl, setMcpUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [selecting, setSelecting] = useState(false);
    const [activeClient, setActiveClient] = useState<string>('claude');

    let accounts: { id: string; name: string }[] = [];
    if (accountsParam) {
        try {
            accounts = JSON.parse(accountsParam);
        } catch {
            // malformed accounts param — fall through to empty
        }
    }

    useEffect(() => {
        setMcpUrl(`${window.location.origin}/api/mcp`);
    }, []);

    const client = CLIENTS.find((c) => c.id === activeClient)!;
    const prompt = token && mcpUrl
        ? client.prompt(mcpUrl, token, customerName || 'My Account')
        : '';

    function beginGoogleSignIn() {
        window.location.assign('/api/auth/signin');
    }

    function copyPrompt() {
        navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    async function selectAccount(account: { id: string; name: string }) {
        setSelecting(true);
        try {
            const res = await fetch('/api/auth/select-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pendingToken,
                    customerId: account.id,
                    customerName: account.name,
                }),
            });
            const data = await res.json();
            if (data.redirectUrl) {
                router.push(data.redirectUrl.replace(window.location.origin, ''));
            }
        } catch {
            setSelecting(false);
        }
    }

    return (
        <div className="pt-24 pb-16 px-4">
            <div className="container mx-auto max-w-2xl">

                {error && (
                    <div className="mb-8 p-4 rounded-xl border border-red-900/50 bg-red-950/30 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-red-300 text-sm">{error}</p>
                    </div>
                )}

                {pendingToken && accounts.length > 0 ? (
                    /* Account selection */
                    <div className="flex flex-col items-center text-center space-y-6">
                        <div className="flex items-center gap-2 text-green-400">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="text-sm font-medium">Google connected</span>
                        </div>
                        <h1 className="text-3xl md:text-5xl font-bold text-white">Pick an account</h1>
                        <p className="text-zinc-400 text-lg max-w-md">
                            Which Google Ads account do you want to manage?
                        </p>
                        <div className="w-full space-y-3 max-w-md">
                            {accounts.map((account) => (
                                <button
                                    key={account.id}
                                    onClick={() => selectAccount(account)}
                                    disabled={selecting}
                                    className="w-full p-4 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800/80 transition-all text-left disabled:opacity-50"
                                >
                                    <p className="text-white font-medium">{account.name}</p>
                                    <p className="text-zinc-500 text-sm mt-0.5">{account.id}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : !token ? (
                    /* Step 1: Connect Google Ads */
                    <div className="flex flex-col items-center text-center space-y-6">
                        <h1 className="text-3xl md:text-5xl font-bold text-white">Connect Google Ads</h1>
                        <p className="text-zinc-400 text-lg max-w-md">
                            Sign in with your Google Ads account. You'll get a prompt to paste into your AI — that's it.
                        </p>
                        <Button
                            size="lg"
                            onClick={beginGoogleSignIn}
                            className="h-14 px-10 text-lg font-semibold bg-white text-black hover:bg-zinc-200 rounded-full transition-all hover:scale-105"
                        >
                            Sign in with Google <ExternalLink className="w-5 h-5 ml-2" />
                        </Button>
                        <p className="text-zinc-600 text-xs">OAuth 2.0 — we never see your password.</p>
                    </div>
                ) : (
                    /* Step 3: Copy prompt */
                    <div className="flex flex-col items-center text-center space-y-8">
                        <div className="flex items-center gap-2 text-green-400">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="text-sm font-medium">Connected to {customerName || 'Google Ads'}</span>
                        </div>

                        <h1 className="text-3xl md:text-5xl font-bold text-white">Paste this into your AI</h1>

                        {/* Client tabs */}
                        <div className="flex items-center gap-1 p-1 rounded-full bg-zinc-900 border border-zinc-800">
                            {CLIENTS.map((c) => (
                                <button
                                    key={c.id}
                                    onClick={() => { setActiveClient(c.id); setCopied(false); }}
                                    className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                                        activeClient === c.id
                                            ? 'bg-white text-black'
                                            : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                        <p className="text-zinc-400 text-sm max-w-md">
                            {client.hint}
                        </p>

                        <div className="w-full text-left">
                            <div className="relative bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
                                <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed pr-16">
                                    {prompt}
                                </pre>
                                <button
                                    onClick={copyPrompt}
                                    className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-4 h-4 text-green-400" />
                                            <span className="text-green-400">Copied</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-4 h-4 text-zinc-400" />
                                            <span className="text-zinc-400">Copy</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        <Button
                            size="lg"
                            onClick={copyPrompt}
                            className="h-14 px-10 text-lg font-semibold bg-white text-black hover:bg-zinc-200 rounded-full transition-all hover:scale-105"
                        >
                            {copied ? 'Copied!' : 'Copy Prompt'} {copied ? <Check className="w-5 h-5 ml-2" /> : <Copy className="w-5 h-5 ml-2" />}
                        </Button>

                        <p className="text-zinc-600 text-xs max-w-sm">
                            This prompt contains your personal access token. Don't share it publicly.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

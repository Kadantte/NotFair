'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Copy, Check, ExternalLink, AlertCircle, CheckCircle2, Plus, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Session } from '@/lib/session';
import { startGoogleConnect } from '@/lib/google-oauth';

const CLIENTS = [
    {
        id: 'claude',
        name: 'Claude',
        hint: 'Paste into Claude Code. It will set up AdsAgent for both Claude Code and Claude Desktop.',
        prompt: (mcpUrl: string, token: string) =>
            `Set up the AdsAgent MCP server for both Claude Code and Claude Desktop.

Before you start:
1. Check if Node.js is installed (run \`node --version\`). If not, tell me to install it first (https://nodejs.org) and stop — npx won't work without it.
2. Check if npx is available (run \`npx --version\`). If missing but node exists, run \`npm install -g npx\`.

## Part 1: Claude Code

Run this command to add the MCP server to Claude Code:

claude mcp add adsagent -s user -- npx -y mcp-remote ${mcpUrl} --transport streamable-http --header "Authorization: Bearer ${token}"

Verify it was added:

claude mcp list

## Part 2: Claude Desktop

Detect my OS and find my Claude Desktop config file:
- macOS: ~/Library/Application Support/Claude/claude_desktop_config.json
- Windows: %APPDATA%\\Claude\\claude_desktop_config.json
- Linux: ~/.config/Claude/claude_desktop_config.json

Add this entry under mcpServers in the config file:

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

Read the existing file first. If the file doesn't exist, create it with \`{"mcpServers": {}}\`. Merge this entry into mcpServers (don't overwrite other servers). Write it back, then tell me to restart Claude Desktop.`,
    },
    {
        id: 'codex',
        name: 'Codex',
        hint: 'Paste into Codex CLI. It will add AdsAgent as an MCP server and start analyzing your ads.',
        prompt: (mcpUrl: string, token: string) =>
            `Set up this MCP server in Codex so I can manage my ads with AI.

Before you start:
1. Check if the Codex CLI is installed by running \`codex --version\`. If not found, tell me how to install it and stop.
2. Check if Node.js is available by running \`node --version\`. If it is not found, tell me how to install it and stop.

Once prerequisites are confirmed:

1. Set an environment variable for the bearer token:

export ADSAGENT_MCP_BEARER_TOKEN="${token}"

If needed, also add that export to my shell profile so it persists across restarts.

2. Add the MCP server in Codex using the bearer token env var:

codex mcp add adsagent --url ${mcpUrl} --bearer-token-env-var ADSAGENT_MCP_BEARER_TOKEN

3. Verify it was added:

codex mcp list

4. Restart Codex or reopen the IDE panel so the new MCP server is loaded with the environment variable.

Once connected, show me how my campaigns are performing:
- top spenders
- wasted budget
- quick wins`,
    },
    {
        id: 'openclaw',
        name: 'OpenClaw',
        hint: 'Paste into OpenClaw. It will configure the MCP server correctly, create an MCPorter config, generate the client, and install the AdsAgent skill.',
        prompt: (mcpUrl: string, token: string) =>
            `## Step 0: Check prerequisites

Before doing anything, verify:
1. **Node.js** — run \`node --version\`. If missing, tell me to install it from https://nodejs.org and stop.
2. **npx** — run \`npx --version\`. If missing, run \`npm install -g npx\`.
3. **OpenClaw config location** — detect where OpenClaw stores its config on this system:
   - Check \`~/.openclaw/openclaw.json\`
   - Check \`~/.config/openclaw/openclaw.json\`
   - If none exist, ask me where my OpenClaw config lives before proceeding.
4. **OpenClaw skills directory** — detect the skills directory:
   - Check \`~/.openclaw/skills/\`, \`~/.config/openclaw/skills/\`, or any path referenced in the OpenClaw config.
   - If not found, ask me before creating one.
5. **MCPorter config location** — detect whether MCPorter already has a config:
   - Check \`./config/mcporter.json\` in the current working directory
   - Check \`~/.mcporter/mcporter.json\`
   - If neither exists, create \`./config/mcporter.json\` in the current working directory.

## Step 1: Add the MCP server to OpenClaw

Read the existing OpenClaw config first and merge this server definition under \`mcp.servers.adsagent\` — do not overwrite other servers:

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

Important: OpenClaw's config schema is not MCPorter's schema. OpenClaw stores MCP servers under \`mcp.servers\`.

## Step 2: Add the same MCP server to MCPorter config

MCPorter does not automatically read OpenClaw's \`openclaw.json\`. To let \`mcporter\` commands work, ensure there is an MCPorter config file with this shape:

{
  "mcpServers": {
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
  }
}

If \`./config/mcporter.json\` exists, merge into \`mcpServers\`. Otherwise create it.

## Step 3: Verify the MCP server with MCPorter

Run:

npx mcporter list adsagent --schema

If verification fails, also test the endpoint directly with curl using the required Accept header for streamable HTTP MCP:

curl -i -sS -X POST '${mcpUrl}' \\
  -H 'Authorization: Bearer ${token}' \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0"}}}'

A \`200 OK\` means the token and endpoint are working. A \`406\` usually means the Accept header was wrong, not that auth failed.

## Step 4: Generate a typed client for the skill

Use the skills directory you found in Step 0:

npx mcporter emit-ts adsagent --mode client --out <skills-dir>/adsagent/adsagent-client.ts

## Step 5: Create the AdsAgent skill

Create the file <skills-dir>/adsagent/SKILL.md with this content:

---
name: adsagent
description: Manage Google Ads campaigns — read performance, optimize keywords, adjust bids and budgets, add negatives, pause/enable campaigns, manage ads/ad groups, tracking templates, and undo changes.
version: 1.2.0
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

You have access to Google Ads tools via the \`adsagent\` MCP server. Use them to help the user monitor and optimize ad campaigns.

## Available Tools

### Read (safe, no side effects)
- **getAccountInfo** — Account name, currency, timezone, test status
- **listCampaigns** — All campaigns with impressions, clicks, cost, conversions
- **getCampaignPerformance** — Daily metrics over a date range
- **getKeywords** — Top keywords with quality scores
- **getSearchTermReport** — Actual search queries triggering ads
- **runGaqlQuery** — Run a custom read-only GAQL SELECT query (max 50 rows)
- **getChanges** — Recent AdsAgent changes with \`changeId\`s for undo
- **listConnectedAccounts** — All connected Google Ads accounts
- **getTrackingTemplate** — Current tracking template at account/campaign/ad-group/ad level
- **listAdGroups** — Ad groups in a campaign with metrics
- **listAds** — Ads in a campaign/ad group with copy, URLs, status, metrics
- **getImpressionShare** — Search/top/abs-top IS and budget/rank-lost IS
- **getConversionActions** — Conversion actions and settings
- **getAccountSettings** — Auto-tagging, tracking template, conversion tracking IDs
- **getCampaignSettings** — Bidding, network, locations, schedule
- **getRecommendations** — Google optimization recommendations

### Write (mutates the account — always confirm with user first)
All write tools return a \`changeId\` on success. Use this with \`undoChange\` to reverse the operation within 7 days.
- **pauseKeyword** — Stop a keyword
- **enableKeyword** — Re-enable a paused keyword
- **addKeyword** — Add a new keyword to an ad group
- **updateBid** — Change CPC bid (manual/enhanced CPC only, max 25% change)
- **bulkUpdateBids** — Update multiple CPC bids in one call
- **addNegativeKeyword** — Block irrelevant search terms (phrase match)
- **removeNegativeKeyword** — Remove a negative keyword
- **updateCampaignBudget** — Change daily budget (max 50% change)
- **createCampaign** — Create a full paused search campaign
- **pauseCampaign** — Pause all ads in a campaign
- **enableCampaign** — Re-enable a paused campaign
- **setTrackingTemplate** — Set/clear tracking template
- **createAdGroup** — Create a new ad group
- **createAd** — Create a new Responsive Search Ad
- **pauseAd** — Pause an ad
- **enableAd** — Re-enable an ad
- **updateAdFinalUrl** — Change an ad’s landing page URL
- **updateAdAssets** — Replace an RSA’s headlines/descriptions
- **undoChange** — Reverse a previous write by \`changeId\`

## Rules

1. **Never make write changes without explicit user confirmation.** Always show what you plan to change, the current value, and the new value before executing.
2. **Start with reads.** When the user asks about ads, begin with \`getAccountInfo\` and \`listCampaigns\` to build context.
3. **Show numbers clearly.** Format cost as dollars, show CTR as percentages, include date ranges.
4. **Recommend before acting.** When you spot waste (high-spend zero-conversion keywords, irrelevant search terms), recommend the action and wait for approval.
5. **Guardrails are server-side.** Bid changes >25% and budget changes >50% will be rejected by the server. Don’t try to circumvent this.
6. **After every write, note the \`changeId\`.** Tell the user they can undo the change within 7 days. Use \`getChanges\` to review recent operations.

## Common Workflows

### "How are my ads doing?"
1. \`getAccountInfo\` → \`listCampaigns\` → summarize top spenders, best/worst performers, total spend

### "Find wasted spend"
1. \`listCampaigns\` → pick top-spend campaigns
2. \`getKeywords\` for each → find high-spend, zero-conversion keywords
3. \`getSearchTermReport\` → find irrelevant search terms
4. Recommend: pause wasteful keywords + add negative keywords

### "Optimize bids"
1. \`getKeywords\` → find keywords with good conversion rates but low impression share
2. \`getImpressionShare\` / \`getCampaignSettings\` as needed for context
3. Recommend bid increases (within 25% limit) for high-performers
4. Recommend bid decreases for underperformers

## Step 6: Verify it works

Now use the skill. Call \`getAccountInfo\` to verify the connection, then \`listCampaigns\` to show me how my campaigns are performing — top spenders, wasted budget, and quick wins I should act on.

When summarizing verification, do not claim a fixed number of tools unless you just checked the current schema output.`,
    },
] as const;

const emptySession: Session = { connected: false };

async function readServerSession(): Promise<Session> {
    const response = await fetch('/api/auth/session', {
        credentials: 'include',
        cache: 'no-store',
    });

    if (!response.ok) return emptySession;
    return response.json();
}

type ConnectPageProps = {
    initialSession?: Session;
};

export function ConnectPage({ initialSession = emptySession }: ConnectPageProps) {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3D3C36] border-t-[#4CAF6E]" />
                </div>
            }
        >
            <ConnectContent initialSession={initialSession} />
        </Suspense>
    );
}

function ConnectContent({ initialSession }: { initialSession: Session }) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const urlToken = searchParams.get('token');
    const urlCustomerName = searchParams.get('customer_name');
    const urlError = searchParams.get('error');
    const pendingToken = searchParams.get('pending');
    const selectionMode = searchParams.get('mode');
    const accountsParam = searchParams.get('accounts');
    const selectedParam = searchParams.get('selected');

    const [session, setSession] = useState<Session>(initialSession);
    const [mcpUrl, setMcpUrl] = useState('');
    const [error, setError] = useState<string | null>(urlError);
    const [copied, setCopied] = useState(false);
    const [selecting, setSelecting] = useState(false);
    const [rotating, setRotating] = useState(false);
    const [activeClient, setActiveClient] = useState<string>('claude');
    const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

    const token = urlToken || (session.connected ? session.token : null);
    const customerName = urlCustomerName || (session.connected ? session.customerName : null);
    const actionBtnClass = 'flex items-center gap-2 rounded-lg border border-[#3D3C36] bg-[#24231F] px-4 py-2 text-sm text-[#9B9689] transition-all hover:border-[#9B9689]/40 hover:text-[#E8E4DD]';

    const accounts = useMemo(() => {
        if (!accountsParam) return [] as { id: string; name: string }[];
        try {
            return JSON.parse(accountsParam);
        } catch {
            return [] as { id: string; name: string }[];
        }
    }, [accountsParam]);

    const preselectedAccountIds = useMemo(() => {
        if (!selectedParam) return [] as string[];
        try {
            const parsed = JSON.parse(selectedParam);
            if (!Array.isArray(parsed)) return [] as string[];
            return parsed.filter((value): value is string => typeof value === 'string');
        } catch {
            return [] as string[];
        }
    }, [selectedParam]);

    useEffect(() => {
        setMcpUrl(`${window.location.origin}/api/mcp`);

        if (urlToken) {
            window.history.replaceState({}, '', '/connect');
            return;
        }

        let cancelled = false;
        readServerSession().then(nextSession => {
            if (!cancelled) setSession(nextSession);
        }).catch(() => {
            if (!cancelled) setSession(emptySession);
        });

        return () => {
            cancelled = true;
        };
    }, [urlToken]);

    useEffect(() => {
        if ((!pendingToken && selectionMode !== 'update') || accounts.length === 0) {
            setSelectedAccounts([]);
            return;
        }

        const accessiblePreselected = preselectedAccountIds.filter(id =>
            accounts.some(account => account.id === id),
        );
        setSelectedAccounts(accessiblePreselected);
    }, [pendingToken, selectionMode, accounts, preselectedAccountIds]);

    const client = CLIENTS.find(c => c.id === activeClient)!;
    const prompt = token && mcpUrl ? client.prompt(mcpUrl, token) : '';

    async function beginGoogleSignIn() {
        setError(null);
        try {
            await startGoogleConnect('/connect');
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Authentication failed. Please try again.');
        }
    }

    function beginAddAccount() {
        setError(null);
        window.location.assign('/api/auth/add-account');
    }

    function openAgenticAi() {
        window.location.assign('/chat');
    }

    function copyPrompt() {
        navigator.clipboard.writeText(prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    function toggleAccount(accountId: string) {
        setSelectedAccounts(prev => {
            if (prev.includes(accountId)) {
                return prev.filter(id => id !== accountId);
            }
            return [...prev, accountId];
        });
    }

    async function submitSelectedAccounts() {
        setSelecting(true);
        const selected = accounts.filter(account => selectedAccounts.includes(account.id));
        try {
            const res = await fetch('/api/auth/select-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pendingToken,
                    accounts: selected,
                }),
            });
            const data = await res.json();
            if (data.redirectUrl) {
                window.location.assign(data.redirectUrl);
            } else if (data.error) {
                router.push(`/connect?error=${encodeURIComponent(data.error)}`);
            }
        } finally {
            setSelecting(false);
        }
    }

    async function rotateToken() {
        setRotating(true);
        try {
            const res = await fetch('/api/auth/rotate-token', { method: 'POST' });
            const data = await res.json();
            if (!res.ok || data.error) {
                setError(data.error || 'Failed to rotate token');
                return;
            }
            setCopied(false);
            const nextSession = await readServerSession();
            setSession(nextSession);
            router.refresh();
        } catch {
            setError('Failed to rotate token');
        } finally {
            setRotating(false);
        }
    }

    return (
        <section className="flex h-full min-h-0 flex-col overflow-hidden">
            <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
                <div className="flex w-full items-center justify-between gap-4 px-6 py-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-[#E8E4DD]">Connect</h1>
                        <p className="mt-0.5 text-sm text-[#9B9689]">Connect Google Ads and generate the MCP setup prompt for your AI client.</p>
                    </div>
                    {token ? (
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            <button onClick={beginAddAccount} className={actionBtnClass}>
                                <Plus className="h-4 w-4" />
                                Add Account
                            </button>
                            <button
                                onClick={rotateToken}
                                disabled={rotating}
                                className={`${actionBtnClass} disabled:opacity-50`}
                            >
                                <RotateCw className={`h-4 w-4 ${rotating ? 'animate-spin' : ''}`} />
                                {rotating ? 'Rotating...' : 'Rotate Token'}
                            </button>
                        </div>
                    ) : null}
                </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
                <div className="mx-auto max-w-2xl">
                    {error && (
                        <div className="mb-8 flex items-start gap-3 rounded-lg border border-[#C45D4A]/30 bg-[#C45D4A]/10 p-4">
                            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#C45D4A]" />
                            <p className="text-sm text-[#C45D4A]">{error}</p>
                        </div>
                    )}

                    {(pendingToken || selectionMode === 'update') && accounts.length > 0 ? (
                        <div className="flex flex-col items-center space-y-6 text-center">
                            <div className="flex items-center gap-2 text-[#4CAF6E]">
                                <CheckCircle2 className="h-5 w-5" />
                                <span className="text-sm font-medium">Google connected</span>
                            </div>
                            <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">Select accounts</h2>
                            <p className="max-w-md text-lg text-[#9B9689]">
                                Which Google Ads accounts do you want to manage?
                            </p>
                            <div className="w-full max-w-md space-y-3">
                                {accounts.map(account => {
                                    const isSelected = selectedAccounts.includes(account.id);
                                    return (
                                        <button
                                            key={account.id}
                                            onClick={() => toggleAccount(account.id)}
                                            disabled={selecting}
                                            className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-all disabled:opacity-50 ${
                                                isSelected
                                                    ? 'border-[#4CAF6E]/30 bg-[#4CAF6E]/10'
                                                    : 'border-[#3D3C36] bg-[#24231F] hover:border-[#9B9689]/40 hover:bg-[#2E2D28]'
                                            }`}
                                        >
                                            <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors ${
                                                isSelected ? 'border-[#4CAF6E] bg-[#4CAF6E]' : 'border-[#9B9689]/40'
                                            }`}>
                                                {isSelected && <Check className="h-3 w-3 text-[#1A1917]" />}
                                            </div>
                                            <div>
                                                <p className="font-medium text-[#E8E4DD]">{account.name}</p>
                                                <p className="mt-0.5 text-sm text-[#9B9689]">{account.id}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                            {selectedAccounts.length > 0 && (
                                <p className="text-sm text-[#9B9689]">
                                    {selectedAccounts.length} of {accounts.length} account{accounts.length > 1 ? 's' : ''} selected.
                                </p>
                            )}
                            <Button
                                size="lg"
                                onClick={submitSelectedAccounts}
                                disabled={selectedAccounts.length === 0 || selecting}
                                className="h-14 rounded-full bg-[#4CAF6E] px-10 text-lg font-semibold text-[#1A1917] transition-all hover:scale-105 hover:bg-[#3D9A5C] disabled:opacity-50 disabled:hover:scale-100"
                            >
                                {selecting ? 'Connecting...' : `Connect ${selectedAccounts.length || ''} account${selectedAccounts.length !== 1 ? 's' : ''}`}
                            </Button>
                        </div>
                    ) : !token ? (
                        <div className="flex flex-col items-center space-y-6 pt-12 text-center">
                            <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">Connect Google Ads</h2>
                            <p className="max-w-md text-lg text-[#9B9689]">
                                Sign in with your Google Ads account. You&apos;ll get a prompt to paste into your AI.
                            </p>
                            <Button
                                size="lg"
                                onClick={beginGoogleSignIn}
                                className="h-14 rounded-full bg-[#4CAF6E] px-10 text-lg font-semibold text-[#1A1917] transition-all hover:scale-105 hover:bg-[#3D9A5C]"
                            >
                                Sign in with Google <ExternalLink className="ml-2 h-5 w-5" />
                            </Button>
                            <p className="text-xs text-[#9B9689]/60">OAuth 2.0 — we never see your password.</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center space-y-8 text-center">
                            <div className="flex items-center gap-2 text-[#4CAF6E]">
                                <CheckCircle2 className="h-5 w-5" />
                                <span className="text-sm font-medium">Connected to {customerName || 'Google Ads'}</span>
                            </div>

                            <h2 className="text-3xl font-bold text-[#E8E4DD] md:text-5xl">Paste this into your AI</h2>

                            <div className="flex items-center gap-1 rounded-full border border-[#3D3C36] bg-[#24231F] p-1">
                                {CLIENTS.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => {
                                            setActiveClient(c.id);
                                            setCopied(false);
                                        }}
                                        className={`rounded-full px-5 py-2 text-sm font-medium transition-all ${
                                            activeClient === c.id
                                                ? 'bg-[#4CAF6E] text-[#1A1917]'
                                                : 'text-[#9B9689] hover:text-[#E8E4DD]'
                                        }`}
                                    >
                                        {c.name}
                                    </button>
                                ))}
                            </div>
                            <p className="max-w-md text-sm text-[#9B9689]">{client.hint}</p>

                            <div className="w-full text-left">
                                <div className="relative rounded-lg border border-[#3D3C36] bg-[#24231F] p-6">
                                    <pre className="max-h-[280px] overflow-y-auto whitespace-pre-wrap pr-16 font-mono text-sm leading-relaxed text-[#E8E4DD]/80">
                                        {prompt}
                                    </pre>
                                    <button
                                        onClick={copyPrompt}
                                        className="absolute right-4 top-4 flex items-center gap-2 rounded-md bg-[#4CAF6E] px-3 py-1.5 text-sm font-medium text-[#1A1917] transition-colors hover:bg-[#3D9A5C]"
                                    >
                                        {copied ? (
                                            <>
                                                <Check className="h-4 w-4 text-[#1A1917]" />
                                                <span className="text-[#1A1917]">Copied</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-4 w-4 text-[#1A1917]" />
                                                <span className="text-[#1A1917]">Copy</span>
                                            </>
                                        )}
                                    </button>
                                    <p className="mt-4 pr-24 text-xs text-[#9B9689]/60">
                                        This prompt contains your personal access token. Don&apos;t share it publicly.
                                    </p>
                                </div>
                            </div>

                            <div className="flex w-full items-center gap-4">
                                <div className="h-px flex-1 bg-[#3D3C36]" />
                                <span className="text-xs font-medium uppercase tracking-[0.18em] text-[#9B9689]">or</span>
                                <div className="h-px flex-1 bg-[#3D3C36]" />
                            </div>

                            <div className="w-full rounded-lg border border-[#3D3C36] bg-[#24231F] p-5 text-left">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-[#E8E4DD]">Don&apos;t want to set up MCP yourself?</p>
                                        <p className="text-sm text-[#9B9689]">
                                            Try our agentic AI instead. AdsAgent Chat is already wired up and ready to use out of the box.
                                        </p>
                                    </div>
                                    <Button
                                        onClick={openAgenticAi}
                                        className="h-11 shrink-0 rounded-full bg-[#4CAF6E] px-6 text-sm font-semibold text-[#1A1917] transition-all hover:bg-[#3D9A5C]"
                                    >
                                        Open AdsAgent Chat
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

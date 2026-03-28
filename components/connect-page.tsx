'use client';

import { useState, useEffect, Suspense } from 'react';
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
        hint: 'Paste into OpenClaw. It will use MCPorter to set up AdsAgent as a skill and start optimizing your ads.',
        prompt: (mcpUrl: string, token: string) =>
            `## Step 0: Check prerequisites

Before doing anything, verify:
1. **Node.js** — run \`node --version\`. If missing, tell me to install it from https://nodejs.org and stop.
2. **npx** — run \`npx --version\`. If missing, run \`npm install -g npx\`.
3. **OpenClaw config location** — detect where OpenClaw stores its config on this system:
   - Check for \`openclaw.json\` in the current directory
   - Check \`~/.openclaw/config.json\` or \`~/.config/openclaw/config.json\`
   - If none exist, ask me where my OpenClaw config lives before proceeding.
4. **OpenClaw skills directory** — detect the skills directory:
   - Check \`~/.openclaw/skills/\`, \`~/.config/openclaw/skills/\`, or any path referenced in the OpenClaw config.
   - If not found, ask me before creating one.

## Step 1: Add the MCP server

Add this entry to the OpenClaw config file you found above:

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

Read the existing config first and merge — don't overwrite other servers.

## Step 2: Use MCPorter to discover and verify the tools

Run these commands to confirm the server is reachable and see all available tools:

npx mcporter list adsagent --schema

This should show 17 tools: getAccountInfo, listCampaigns, getCampaignPerformance, getKeywords, getSearchTermReport, runGaqlQuery, getChanges, listConnectedAccounts, pauseKeyword, enableKeyword, updateBid, addNegativeKeyword, removeNegativeKeyword, updateCampaignBudget, pauseCampaign, enableCampaign, undoChange.

## Step 3: Generate a typed client for the skill

Use the skills directory you found in Step 0:

npx mcporter emit-ts adsagent --mode client --out <skills-dir>/adsagent/adsagent-client.ts

## Step 4: Create the AdsAgent skill

Create the file <skills-dir>/adsagent/SKILL.md with this content:

---
name: adsagent
description: Manage Google Ads campaigns — read performance, optimize keywords, adjust bids and budgets, add negatives, pause/enable campaigns, and undo changes.
version: 1.1.0
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

You have access to 17 Google Ads tools via the \`adsagent\` MCP server. Use them to help the user monitor and optimize their ad campaigns.

## Available Tools

### Read (safe, no side effects)
- **getAccountInfo** — Account name, currency, timezone, test status
- **listCampaigns** — All campaigns with impressions, clicks, cost, conversions. Params: \`limit\` (1-100, default 20), \`includeRemoved\` (bool, default false)
- **getCampaignPerformance** — Daily metrics over a date range. Params: \`campaignId\`, \`days\` (1-365, default 30)
- **getKeywords** — Top keywords with quality scores. Params: \`campaignId\`, \`days\`, \`limit\`
- **getSearchTermReport** — Actual search queries triggering ads. Params: \`campaignId\`, \`days\`, \`limit\`
- **runGaqlQuery** — Run a custom read-only GAQL SELECT query (max 50 rows). Params: \`query\`
- **getChanges** — Get recent changes made via AdsAgent with changeIds for undo. Params: \`campaignId\` (optional), \`limit\` (1-100, default 20)
- **listConnectedAccounts** — List all Google Ads accounts connected to this session

### Write (mutates the account — always confirm with user first)
All write tools return a \`changeId\` on success. Use this with \`undoChange\` to reverse the operation within 7 days.
- **pauseKeyword** — Stop a keyword. Params: \`campaignId\`, \`adGroupId\`, \`criterionId\`
- **enableKeyword** — Re-enable a paused keyword. Params: \`adGroupId\`, \`criterionId\`
- **updateBid** — Change CPC bid (manual/enhanced CPC only, max 25% change). Params: \`campaignId\`, \`adGroupId\`, \`criterionId\`, \`newBidDollars\`
- **addNegativeKeyword** — Block irrelevant search terms (phrase match). Params: \`campaignId\`, \`keywordText\`
- **removeNegativeKeyword** — Remove a negative keyword so those terms can trigger ads again. Params: \`campaignId\`, \`keywordText\`
- **updateCampaignBudget** — Change daily budget (max 50% change, min $1/day). Params: \`campaignId\`, \`newDailyBudgetDollars\`
- **pauseCampaign** — Pause all ads in a campaign. Params: \`campaignId\`
- **enableCampaign** — Re-enable a paused campaign. Params: \`campaignId\`
- **undoChange** — Reverse a previous write by changeId. Works within 7 days if entity hasn't been modified since. Params: \`changeId\`

## Rules

1. **Never make write changes without explicit user confirmation.** Always show what you plan to change, the current value, and the new value before executing.
2. **Start with reads.** When the user asks about their ads, begin with listCampaigns and getAccountInfo to build context.
3. **Show numbers clearly.** Format cost as dollars, show CTR as percentages, include date ranges.
4. **Recommend before acting.** When you spot waste (high-spend zero-conversion keywords, irrelevant search terms), recommend the action and wait for approval.
5. **Guardrails are server-side.** Bid changes >25% and budget changes >50% will be rejected by the server. Don't try to circumvent this.
6. **After every write, note the changeId.** Tell the user they can undo the change within 7 days. Use getChanges to review recent operations.

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

const emptySession: Session = { connected: false };

async function readServerSession(): Promise<Session> {
    const response = await fetch('/api/auth/session', {
        credentials: 'include',
        cache: 'no-store',
    });

    if (!response.ok) return emptySession;
    return response.json();
}

export function ConnectPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#3D3C36] border-t-[#4CAF6E]" />
                </div>
            }
        >
            <ConnectContent />
        </Suspense>
    );
}

function ConnectContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const urlToken = searchParams.get('token');
    const urlCustomerName = searchParams.get('customer_name');
    const urlError = searchParams.get('error');
    const pendingToken = searchParams.get('pending');
    const accountsParam = searchParams.get('accounts');

    const [session, setSession] = useState<Session>(emptySession);
    const [mcpUrl, setMcpUrl] = useState('');
    const [error, setError] = useState<string | null>(urlError);
    const [copied, setCopied] = useState(false);
    const [selecting, setSelecting] = useState(false);
    const [rotating, setRotating] = useState(false);
    const [activeClient, setActiveClient] = useState<string>('claude');
    const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(new Set());

    const token = urlToken || (session.connected ? session.token : null);
    const customerName = urlCustomerName || (session.connected ? session.customerName : null);
    const actionBtnClass = 'flex items-center gap-2 rounded-lg border border-[#3D3C36] bg-[#24231F] px-4 py-2 text-sm text-[#9B9689] transition-all hover:border-[#9B9689]/40 hover:text-[#E8E4DD]';

    let accounts: { id: string; name: string }[] = [];
    if (accountsParam) {
        try {
            accounts = JSON.parse(accountsParam);
        } catch {
            accounts = [];
        }
    }

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
            const next = new Set(prev);
            if (next.has(accountId)) next.delete(accountId);
            else next.add(accountId);
            return next;
        });
    }

    async function submitSelectedAccounts() {
        setSelecting(true);
        const selected = accounts.filter(a => selectedAccounts.has(a.id));
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
                            <button onClick={beginGoogleSignIn} className={actionBtnClass}>
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

                    {pendingToken && accounts.length > 0 ? (
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
                                    const isSelected = selectedAccounts.has(account.id);
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
                            {selectedAccounts.size > 0 && (
                                <p className="text-sm text-[#9B9689]">
                                    {selectedAccounts.size} of {accounts.length} account{accounts.length > 1 ? 's' : ''} selected
                                </p>
                            )}
                            <Button
                                size="lg"
                                onClick={submitSelectedAccounts}
                                disabled={selectedAccounts.size === 0 || selecting}
                                className="h-14 rounded-full bg-[#4CAF6E] px-10 text-lg font-semibold text-[#1A1917] transition-all hover:scale-105 hover:bg-[#3D9A5C] disabled:opacity-50 disabled:hover:scale-100"
                            >
                                {selecting ? 'Connecting...' : `Connect ${selectedAccounts.size || ''} account${selectedAccounts.size !== 1 ? 's' : ''}`}
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

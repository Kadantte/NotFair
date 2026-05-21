# NotFair OpenClaw Plugin

OpenClaw plugin for NotFair's hosted Google Ads MCP server.

## Install

    openclaw plugins install clawhub:openclaw-notfair
    openclaw plugins enable openclaw-notfair
    openclaw notfair setup

The plugin defaults to:

    https://notfair.co/api/mcp/google_ads

## What It Adds

- notfair_list_connected_accounts - list connected Google Ads accounts.
- notfair_run_script - run read-only Google Ads analysis scripts through NotFair.
- notfair_google_ads_tool - call any NotFair Google Ads MCP tool by exact name.
- notfair_connect - shown before authentication with setup instructions.

## CLI

    openclaw notfair login
    openclaw notfair login --token <bearer-token>
    openclaw notfair setup
    openclaw notfair logout
    openclaw notfair status
    openclaw notfair accounts
    openclaw notfair connect
    openclaw notfair tool listConnectedAccounts '{}'

## Safety

NotFair is read-friendly and write-gated. Read operations can run directly. Any operation that changes Google Ads state must be presented for user approval before execution by the agent/client workflow.

This package should not be published until:

1. OAuth login has been tested against production https://notfair.co.
2. openclaw notfair status succeeds for a real connected account.
3. A read-only notfair_run_script smoke test succeeds.
4. ClawHub listing copy and screenshots are reviewed.

## Publish Checklist

    cd plugins/openclaw-notfair
    npm pack --dry-run
    npm publish --access public

Then submit the ClawHub listing using clawhub/listing.md.

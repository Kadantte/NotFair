# ClawHub Listing Draft: NotFair Google Ads Agent

## Slug

nowork-studio/notfair-google-ads-agent

## Install

    openclaw plugins install openclaw-notfair
    openclaw notfair login
    openclaw notfair connect

## Title

NotFair Google Ads Agent

## Short Description

Diagnose and manage Google Ads from OpenClaw through NotFair's approval-gated MCP server.

## Long Description

NotFair connects OpenClaw to live Google Ads account data through a hosted MCP server. Use it to audit campaigns, find wasted spend, inspect search terms, draft negative keywords, understand policy errors, and propose campaign fixes in natural language.

Read operations run directly. Writes are approval-gated so budget changes, bid updates, campaign state changes, and keyword/ad mutations are reviewed before they reach Google Ads.

## Category

Advertising / Google Ads / MCP

## Keywords

google ads, ppc, sem, mcp, openclaw, notfair, campaign management, wasted spend, search terms, negative keywords, ad policy errors

## Safety Notes

- OAuth login via NotFair.
- No local Google Ads credentials.
- Read-only diagnostics by default.
- Money-affecting Google Ads writes require explicit user approval.
- Credentials are stored in ~/.openclaw/openclaw.json by OpenClaw plugin config.

## Verification Before Submission

- npm pack --dry-run
- openclaw plugins install ./plugins/openclaw-notfair
- openclaw notfair login
- openclaw notfair status
- Run one read-only notfair_run_script

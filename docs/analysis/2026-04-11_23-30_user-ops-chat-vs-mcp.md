---
question: "What operations did users from Apr 10-11 perform, broken down by chat (adsagent-chat) vs MCP clients? Did anyone return?"
date: 2026-04-11 23:30 PDT
data_sources: Supabase (operations.client_source, mcp_sessions, chat_threads, chat_messages). Apr 10-11 2026. 13 external active users.
html: docs/analysis/2026-04-11_23-30_user-ops-chat-vs-mcp.html
supersedes: docs/analysis/2026-04-11_23-00_user-operations-retention.md
---

**Verdict:** Of 556 external operations, only 16% (87) came from internal chat — and chat writes were nearly zero (20 writes, 17 from one user). MCP clients drove 84% of operations and 92% of all writes. Chat is a discovery tool; MCP is where action happens. Both returning users were MCP-only.

**Channel breakdown:**
- **MCP clients:** 469 ops (232 reads, 237 writes) — 12 users
- **Chat (adsagent-chat):** 87 ops (67 reads, 20 writes) — 4 users
- **3 users used both** — explored via chat, then shifted to MCP for bulk work
- **2 users were chat-only** — both stayed read-only (never wrote)

**Key insight: Chat is an onboarding funnel, not an action tool**
- Chat write rate: 23% vs MCP write rate: 51%
- add_negative_keyword (94 ops) and add_keyword (71 ops) are 100% MCP — zero via chat
- Chat-only users (webrakes, alexandr partially) never crossed the write threshold
- Both returning users (tim, m.sanchez) were MCP-only — no returner used chat

**So what:**
1. Nudge chat users toward first write — suggest actions after 3+ reads
2. Smooth chat-to-MCP handoff — offer "continue in Claude Desktop" CTA
3. Make chat proactive about negative keywords after showing search terms
4. Focus retention on MCP writers — they're the core that comes back

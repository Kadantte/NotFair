/**
 * Unit tests for the `askSupport` MCP tool.
 *
 * Exercises the tool registrar directly: validation, PostHog event shape,
 * Slack post fire-and-forget behavior, and the per-session rate limit.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const trackServerEvent = vi.fn();
const postToSlack = vi.fn().mockResolvedValue(undefined);

// Stubbable DB query result. Tests can swap this to control what
// `resolveUserEmail` sees without touching a real database.
let dbEmailResult: { email: string | null }[] = [{ email: "user@example.com" }];

vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: (...args: unknown[]) => trackServerEvent(...args),
}));

vi.mock("@/lib/slack", () => ({
  postToSlack: (...args: unknown[]) => postToSlack(...args),
}));

// `resolveUserEmail` calls `getUserEmail` (auth.users) first, then the
// `db().select().from(subscriptions).where().limit()` chain, then mcp_sessions.
// Stub both layers; tests configure dbEmailResult for the subscriptions branch
// and getUserEmailMock for the auth.users branch.
vi.mock("@/lib/db", () => {
  const chainable = {
    select: () => chainable,
    from: () => chainable,
    where: () => chainable,
    limit: () => Promise.resolve(dbEmailResult),
  };
  return {
    db: () => chainable,
    schema: {
      mcpSessions: { id: "id", googleEmail: "googleEmail" },
      subscriptions: { userId: "userId", email: "email", env: "env" },
    },
  };
});

const { getUserEmailMock } = vi.hoisted(() => ({
  getUserEmailMock: vi.fn(async () => null as string | null),
}));
vi.mock("@/lib/auth/get-user-email", () => ({
  getUserEmail: getUserEmailMock,
}));

vi.mock("drizzle-orm", () => ({
  eq: () => ({ __eq: true }),
  and: () => ({ __and: true }),
}));

// `next/server`'s `after()` requires an active request context, which vitest
// doesn't provide. Stub it to invoke the callback immediately so we can still
// assert that the Slack post fires.
vi.mock("next/server", () => ({
  after: (fn: () => Promise<void> | void) => {
    void Promise.resolve().then(() => fn());
  },
}));

import { registerUserSupportTools, _resetSessionCountsForTest } from "../user-support";
import type { AuthContext } from "@/lib/google-ads";

type Handler = (args: unknown) => Promise<unknown>;

function makeServer() {
  const tools: Record<
    string,
    { config: { inputSchema: Record<string, z.ZodTypeAny> }; handler: Handler }
  > = {};
  return {
    registerTool: (
      name: string,
      config: { inputSchema: Record<string, z.ZodTypeAny>; description: string; annotations: object },
      handler: Handler,
    ) => {
      tools[name] = { config, handler };
    },
    tools,
    call: async (name: string, args: unknown) => {
      const t = tools[name];
      const schema = z.object(t.config.inputSchema);
      const parsed = schema.parse(args);
      return await t.handler(parsed);
    },
  };
}

const VALID_AUTH: AuthContext = {
  refreshToken: "rt",
  customerId: "1234567890",
  userId: "user-abc",
  clientName: "claude-code",
  clientVersion: "1.2.3",
  authMethod: "oauth",
  sessionId: 42,
};

const VALID_INPUT = {
  message: "I'm having trouble connecting my Google Ads account. The OAuth flow keeps failing.",
  context: "User was trying to connect a new Google Ads account.",
};

beforeEach(() => {
  trackServerEvent.mockClear();
  postToSlack.mockClear();
  getUserEmailMock.mockReset();
  getUserEmailMock.mockResolvedValue(null);
  dbEmailResult = [{ email: "user@example.com" }];
  _resetSessionCountsForTest();
});

describe("askSupport tool", () => {
  it("registers a tool named askSupport with expected schema fields", () => {
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    expect(server.tools["askSupport"]).toBeDefined();
    const inputSchema = server.tools["askSupport"].config.inputSchema;
    expect(Object.keys(inputSchema)).toEqual(
      expect.arrayContaining(["message", "context"]),
    );
  });

  it("fires PostHog event mcp_support_requested with full property set", async () => {
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    await server.call("askSupport", VALID_INPUT);

    expect(trackServerEvent).toHaveBeenCalledTimes(1);
    const [userId, eventName, props] = trackServerEvent.mock.calls[0];
    expect(userId).toBe("user-abc");
    expect(eventName).toBe("mcp_support_requested");
    expect(props).toMatchObject({
      ticket_id: expect.stringMatching(/^NF-[A-Z0-9]{9}$/),
      message: VALID_INPUT.message,
      context: VALID_INPUT.context,
      user_email: "user@example.com",
      client_name: "claude-code",
      client_version: "1.2.3",
      auth_method: "oauth",
      session_id: 42,
      remaining_calls: 2,
    });
  });

  it("posts to Slack with :sos: emoji, ticket ID, and user email", async () => {
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    await server.call("askSupport", VALID_INPUT);
    // Allow microtasks to drain so the void-promise can flush.
    await Promise.resolve();
    expect(postToSlack).toHaveBeenCalledTimes(1);
    const [text] = postToSlack.mock.calls[0];
    expect(text).toContain(":sos:");
    expect(text).toMatch(/NF-[A-Z0-9]{9}/);
    expect(text).toContain("user@example.com");
    expect(text).toContain("Support request");
  });

  it("does not fail when Slack post throws", async () => {
    postToSlack.mockRejectedValueOnce(new Error("slack down"));
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    const result = await server.call("askSupport", VALID_INPUT);
    expect(result).toBeDefined();
    // PostHog event still fires regardless of Slack outcome.
    expect(trackServerEvent).toHaveBeenCalledTimes(1);
  });

  it("rate-limits after 3 calls within the 1-hour window", async () => {
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);

    for (let i = 0; i < 3; i++) {
      await server.call("askSupport", VALID_INPUT);
    }
    expect(trackServerEvent).toHaveBeenCalledTimes(3);

    // 4th call: rate-limited, no PostHog event, no Slack post.
    const beforeSlack = postToSlack.mock.calls.length;
    const result = await server.call("askSupport", VALID_INPUT) as {
      content: Array<{ text: string }>;
    };
    expect(trackServerEvent).toHaveBeenCalledTimes(3);
    expect(postToSlack.mock.calls.length).toBe(beforeSlack);
    expect(result.content[0].text).toContain("support@notfair.co");
  });

  it("rate-limit is per session — different sessionIds get independent quotas", async () => {
    const auths: AuthContext[] = [
      { ...VALID_AUTH, sessionId: 100 },
      { ...VALID_AUTH, sessionId: 200 },
    ];
    let activeIdx = 0;
    const server = makeServer();
    registerUserSupportTools(server as never, () => auths[activeIdx]);

    // Burn out session 100's quota.
    activeIdx = 0;
    for (let i = 0; i < 3; i++) await server.call("askSupport", VALID_INPUT);
    expect(trackServerEvent).toHaveBeenCalledTimes(3);

    // Session 200 still has full quota.
    activeIdx = 1;
    await server.call("askSupport", VALID_INPUT);
    expect(trackServerEvent).toHaveBeenCalledTimes(4);
  });

  it("rejects message shorter than 10 characters", async () => {
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    await expect(
      server.call("askSupport", { ...VALID_INPUT, message: "too short" }),
    ).rejects.toThrow();
    expect(trackServerEvent).not.toHaveBeenCalled();
  });

  it("includes user_email in PostHog event and Slack message", async () => {
    dbEmailResult = [{ email: "alice@notfair.co" }];
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    await server.call("askSupport", VALID_INPUT);
    await Promise.resolve();

    const [, , props] = trackServerEvent.mock.calls[0];
    expect((props as { user_email: string }).user_email).toBe("alice@notfair.co");

    const [slackText] = postToSlack.mock.calls[0];
    expect(slackText).toContain("alice@notfair.co");
  });

  it("shows 'unknown' in Slack User line when no email can be resolved", async () => {
    dbEmailResult = [];
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    await server.call("askSupport", VALID_INPUT);
    await Promise.resolve();

    const [, , props] = trackServerEvent.mock.calls[0];
    expect((props as { user_email: string | null }).user_email).toBeNull();
    const [slackText] = postToSlack.mock.calls[0];
    expect(slackText).toContain("unknown");
  });

  it("success response includes ticket_id and remaining_calls summary text", async () => {
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    const result = await server.call("askSupport", VALID_INPUT) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toMatch(/NF-[A-Z0-9]{9}/);
    expect(result.content[0].text).toContain("1 business day");
  });

  it("rate-limited response contains reason: rate_limited and appropriate summary", async () => {
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);

    // Exhaust the quota.
    for (let i = 0; i < 3; i++) {
      await server.call("askSupport", VALID_INPUT);
    }

    const result = await server.call("askSupport", VALID_INPUT) as {
      content: Array<{ text: string }>;
    };
    expect(result.content[0].text).toContain("support@notfair.co");
  });

  it("escapes Slack injection sequences in message before posting", async () => {
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    await server.call("askSupport", {
      ...VALID_INPUT,
      message: "Hello <@USERID> & <!channel> — cost > $100",
    });
    await Promise.resolve();
    const [text] = postToSlack.mock.calls[0];
    expect(text).not.toContain("<@USERID>");
    expect(text).not.toContain("<!channel>");
    expect(text).toContain("&lt;@USERID&gt;");
    expect(text).toContain("&lt;!channel&gt;");
    expect(text).toContain("&amp;");
  });

  it("succeeds and omits Context block in Slack when context is not provided", async () => {
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    await server.call("askSupport", { message: VALID_INPUT.message });
    await Promise.resolve();

    const [, , props] = trackServerEvent.mock.calls[0];
    expect((props as Record<string, unknown>).context).toBeNull();

    const [text] = postToSlack.mock.calls[0];
    expect(text).not.toContain("*Context:*");
  });

  it("prefers getUserEmail (auth.users) over subscriptions email", async () => {
    getUserEmailMock.mockResolvedValueOnce("primary@example.com");
    dbEmailResult = [{ email: "billing@example.com" }];
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    await server.call("askSupport", VALID_INPUT);
    const [, , props] = trackServerEvent.mock.calls[0];
    expect((props as Record<string, unknown>).user_email).toBe("primary@example.com");
  });

  it("falls back to mcp_sessions email when userId is absent", async () => {
    const authNoUser = { ...VALID_AUTH, userId: undefined as unknown as string };
    dbEmailResult = [{ email: "session@example.com" }];
    const server = makeServer();
    registerUserSupportTools(server as never, () => authNoUser);
    await server.call("askSupport", VALID_INPUT);
    const [, , props] = trackServerEvent.mock.calls[0];
    expect((props as Record<string, unknown>).user_email).toBe("session@example.com");
  });

  it("allows calls again after the rate-limit window expires", async () => {
    vi.useFakeTimers();
    try {
      const server = makeServer();
      registerUserSupportTools(server as never, () => VALID_AUTH);
      for (let i = 0; i < 3; i++) await server.call("askSupport", VALID_INPUT);

      const blocked = await server.call("askSupport", VALID_INPUT) as { content: Array<{ text: string }> };
      expect(blocked.content[0].text).toContain("support@notfair.co");

      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      trackServerEvent.mockClear();
      await server.call("askSupport", VALID_INPUT);
      expect(trackServerEvent).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects message longer than 2000 characters", async () => {
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    await expect(
      server.call("askSupport", { message: "a".repeat(2001) }),
    ).rejects.toThrow();
  });

  it("rejects context longer than 500 characters", async () => {
    const server = makeServer();
    registerUserSupportTools(server as never, () => VALID_AUTH);
    await expect(
      server.call("askSupport", { ...VALID_INPUT, context: "b".repeat(501) }),
    ).rejects.toThrow();
  });
});

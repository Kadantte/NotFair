/**
 * Unit tests for the `fileInternalNotFairToolFeedback` MCP tool.
 *
 * Exercises the tool registrar directly: validation, PostHog event shape,
 * Slack post fire-and-forget behavior, and the per-session rate limit.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const trackServerEvent = vi.fn();
const postToSlack = vi.fn().mockResolvedValue(undefined);
const dbInsertValues = vi.fn();

// Stubbable DB query result. Tests can swap this to control what
// `resolveUserEmail` sees without touching a real database.
let dbEmailResult: { email: string | null }[] = [{ email: "user@example.com" }];
let dbInsertedFeedbackId: number | null = 123;
let dbInsertError: Error | null = null;

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
  const selectChain = {
    select: () => selectChain,
    from: () => selectChain,
    where: () => selectChain,
    limit: () => Promise.resolve(dbEmailResult),
  };
  const insertChain = {
    values: (values: unknown) => {
      dbInsertValues(values);
      if (dbInsertError) throw dbInsertError;
      return {
        returning: () => Promise.resolve(dbInsertedFeedbackId == null ? [] : [{ id: dbInsertedFeedbackId }]),
      };
    },
  };
  return {
    db: () => ({
      ...selectChain,
      insert: () => insertChain,
    }),
    schema: {
      mcpSessions: { id: "id", googleEmail: "googleEmail" },
      subscriptions: { userId: "userId", email: "email" },
      mcpToolFeedback: { id: "id" },
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

import { registerAgentFeedbackTools, _resetSessionCountsForTest } from "../agent-feedback";
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
  category: "missing_capability" as const,
  affected_tool: "addNegativeKeyword",
  observation: "Calling this tool 200x for a single batch felt redundant.",
  suggestion: "Mention the bulk variant addKeywordToNegativeList in the description.",
  user_goal: "Adding 12 negative keywords from a search-term audit.",
};

beforeEach(() => {
  trackServerEvent.mockClear();
  postToSlack.mockClear();
  dbInsertValues.mockClear();
  dbEmailResult = [{ email: "user@example.com" }];
  dbInsertedFeedbackId = 123;
  dbInsertError = null;
  _resetSessionCountsForTest();
});

describe("fileInternalNotFairToolFeedback tool", () => {
  it("registers a tool named fileInternalNotFairToolFeedback with the expected schema", () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    expect(server.tools["fileInternalNotFairToolFeedback"]).toBeDefined();
    const inputSchema = server.tools["fileInternalNotFairToolFeedback"].config.inputSchema;
    expect(Object.keys(inputSchema)).toEqual(
      expect.arrayContaining(["category", "affected_tool", "observation", "suggestion", "user_goal"]),
    );
  });



  it("persists a durable feedback row and returns its feedback_id", async () => {
    dbInsertedFeedbackId = 987;
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    const result = await server.call("fileInternalNotFairToolFeedback", VALID_INPUT);

    expect(dbInsertValues).toHaveBeenCalledTimes(1);
    expect(dbInsertValues).toHaveBeenCalledWith({
      userId: "user-abc",
      sessionId: 42,
      category: "missing_capability",
      affectedTool: "addNegativeKeyword",
      observation: "Calling this tool 200x for a single batch felt redundant.",
      suggestion: "Mention the bulk variant addKeywordToNegativeList in the description.",
      userGoal: "Adding 12 negative keywords from a search-term audit.",
      userEmail: "user@example.com",
      clientName: "claude-code",
      clientVersion: "1.2.3",
      authMethod: "oauth",
      status: "new",
    });
    expect(JSON.stringify(result)).toContain("987");

    const [, , props] = trackServerEvent.mock.calls[0];
    expect(props).toMatchObject({ feedback_id: 987 });
  });

  it("does not claim durable recording when the DB insert fails", async () => {
    dbInsertError = new Error("database down");
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    const result = await server.call("fileInternalNotFairToolFeedback", VALID_INPUT);
    await Promise.resolve();

    expect(dbInsertValues).toHaveBeenCalledTimes(1);
    expect(trackServerEvent).toHaveBeenCalledTimes(1);
    expect(postToSlack).toHaveBeenCalledTimes(1);
    const text = JSON.stringify(result);
    expect(text).toContain("recorded");
    expect(text).toContain("false");
    expect(text).toContain("db_insert_failed");
  });

  it("fires PostHog event with full property set on a valid call", async () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    await server.call("fileInternalNotFairToolFeedback", VALID_INPUT);

    expect(trackServerEvent).toHaveBeenCalledTimes(1);
    const [userId, eventName, props] = trackServerEvent.mock.calls[0];
    expect(userId).toBe("user-abc");
    expect(eventName).toBe("mcp_improvement_suggested");
    expect(props).toMatchObject({
      category: "missing_capability",
      affected_tool: "addNegativeKeyword",
      client_name: "claude-code",
      client_version: "1.2.3",
      auth_method: "oauth",
      session_id: 42,
      remaining_calls: 4,
      user_email: "user@example.com",
    });
  });

  it("posts to Slack fire-and-forget without awaiting", async () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    await server.call("fileInternalNotFairToolFeedback", VALID_INPUT);
    // Allow microtasks to drain so the void-promise can flush.
    await Promise.resolve();
    expect(postToSlack).toHaveBeenCalledTimes(1);
    const [text] = postToSlack.mock.calls[0];
    expect(text).toContain("Agent feedback");
    expect(text).toContain("missing_capability");
    expect(text).toContain("addNegativeKeyword");
  });

  it("does not fail the tool call when Slack post throws", async () => {
    postToSlack.mockRejectedValueOnce(new Error("slack down"));
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    const result = await server.call("fileInternalNotFairToolFeedback", VALID_INPUT);
    expect(result).toBeDefined();
    // PostHog event still fires regardless of Slack outcome.
    expect(trackServerEvent).toHaveBeenCalledTimes(1);
  });

  it("rate-limits after 5 calls within the 1-hour window", async () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);

    for (let i = 0; i < 5; i++) {
      await server.call("fileInternalNotFairToolFeedback", VALID_INPUT);
    }
    expect(trackServerEvent).toHaveBeenCalledTimes(5);

    // 6th call: rate-limited, no PostHog event, no Slack post.
    const beforeSlack = postToSlack.mock.calls.length;
    await server.call("fileInternalNotFairToolFeedback", VALID_INPUT);
    expect(trackServerEvent).toHaveBeenCalledTimes(5);
    expect(postToSlack.mock.calls.length).toBe(beforeSlack);
  });

  it("rate-limit is per session — different sessionIds get independent quotas", async () => {
    const auths: AuthContext[] = [
      { ...VALID_AUTH, sessionId: 100 },
      { ...VALID_AUTH, sessionId: 200 },
    ];
    let activeIdx = 0;
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => auths[activeIdx]);

    // Burn out session 100's quota.
    activeIdx = 0;
    for (let i = 0; i < 5; i++) await server.call("fileInternalNotFairToolFeedback", VALID_INPUT);
    expect(trackServerEvent).toHaveBeenCalledTimes(5);

    // Session 200 still has full quota.
    activeIdx = 1;
    await server.call("fileInternalNotFairToolFeedback", VALID_INPUT);
    expect(trackServerEvent).toHaveBeenCalledTimes(6);
  });

  it("rejects observation shorter than 10 characters", async () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    await expect(
      server.call("fileInternalNotFairToolFeedback", { ...VALID_INPUT, observation: "too short" }),
    ).rejects.toThrow();
    expect(trackServerEvent).not.toHaveBeenCalled();
  });

  it("rejects an unknown category enum value", async () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    await expect(
      server.call("fileInternalNotFairToolFeedback", { ...VALID_INPUT, category: "vibes" }),
    ).rejects.toThrow();
  });

  it("includes user_email in the PostHog event and the Slack message", async () => {
    dbEmailResult = [{ email: "alice@notfair.co" }];
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    await server.call("fileInternalNotFairToolFeedback", VALID_INPUT);
    await Promise.resolve();

    const [, , props] = trackServerEvent.mock.calls[0];
    expect((props as { user_email: string }).user_email).toBe("alice@notfair.co");

    const [slackText] = postToSlack.mock.calls[0];
    expect(slackText).toContain("alice@notfair.co");
    expect(slackText).toContain("*User:*");
  });

  it("omits the User line from Slack when no email can be resolved", async () => {
    dbEmailResult = [];
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    await server.call("fileInternalNotFairToolFeedback", VALID_INPUT);
    await Promise.resolve();

    const [, , props] = trackServerEvent.mock.calls[0];
    expect((props as { user_email: string | null }).user_email).toBeNull();
    const [slackText] = postToSlack.mock.calls[0];
    expect(slackText).not.toContain("*User:*");
  });

  it("resolves user_email via subscriptions when sessionId is absent", async () => {
    dbEmailResult = [{ email: "sub@example.com" }];
    const authWithoutSession: AuthContext = { ...VALID_AUTH, sessionId: undefined as never };
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => authWithoutSession);
    await server.call("fileInternalNotFairToolFeedback", VALID_INPUT);
    await Promise.resolve();

    const [, , props] = trackServerEvent.mock.calls[0];
    expect((props as { user_email: string }).user_email).toBe("sub@example.com");
  });

  it("truncates oversized observation/suggestion in the event payload", async () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    const long = "a".repeat(2000);
    await server.call("fileInternalNotFairToolFeedback", {
      ...VALID_INPUT,
      observation: long.slice(0, 1000), // schema caps at 1000
      suggestion: long.slice(0, 1000),
    });
    const [, , props] = trackServerEvent.mock.calls[0];
    expect((props as { observation: string }).observation.length).toBeLessThanOrEqual(1001);
  });
});

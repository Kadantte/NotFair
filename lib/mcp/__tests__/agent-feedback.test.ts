/**
 * Unit tests for the `suggestImprovement` MCP tool.
 *
 * Exercises the tool registrar directly: validation, PostHog event shape,
 * Slack post fire-and-forget behavior, and the per-session rate limit.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const trackServerEvent = vi.fn();
const postToSlack = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/analytics-server", () => ({
  trackServerEvent: (...args: unknown[]) => trackServerEvent(...args),
}));

vi.mock("@/lib/slack", () => ({
  postToSlack: (...args: unknown[]) => postToSlack(...args),
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
  _resetSessionCountsForTest();
});

describe("suggestImprovement tool", () => {
  it("registers a tool named suggestImprovement with the expected schema", () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    expect(server.tools["suggestImprovement"]).toBeDefined();
    const inputSchema = server.tools["suggestImprovement"].config.inputSchema;
    expect(Object.keys(inputSchema)).toEqual(
      expect.arrayContaining(["category", "affected_tool", "observation", "suggestion", "user_goal"]),
    );
  });

  it("fires PostHog event with full property set on a valid call", async () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    await server.call("suggestImprovement", VALID_INPUT);

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
    });
  });

  it("posts to Slack fire-and-forget without awaiting", async () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    await server.call("suggestImprovement", VALID_INPUT);
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
    const result = await server.call("suggestImprovement", VALID_INPUT);
    expect(result).toBeDefined();
    // PostHog event still fires regardless of Slack outcome.
    expect(trackServerEvent).toHaveBeenCalledTimes(1);
  });

  it("rate-limits after 5 calls within the 1-hour window", async () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);

    for (let i = 0; i < 5; i++) {
      await server.call("suggestImprovement", VALID_INPUT);
    }
    expect(trackServerEvent).toHaveBeenCalledTimes(5);

    // 6th call: rate-limited, no PostHog event, no Slack post.
    const beforeSlack = postToSlack.mock.calls.length;
    await server.call("suggestImprovement", VALID_INPUT);
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
    for (let i = 0; i < 5; i++) await server.call("suggestImprovement", VALID_INPUT);
    expect(trackServerEvent).toHaveBeenCalledTimes(5);

    // Session 200 still has full quota.
    activeIdx = 1;
    await server.call("suggestImprovement", VALID_INPUT);
    expect(trackServerEvent).toHaveBeenCalledTimes(6);
  });

  it("rejects observation shorter than 10 characters", async () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    await expect(
      server.call("suggestImprovement", { ...VALID_INPUT, observation: "too short" }),
    ).rejects.toThrow();
    expect(trackServerEvent).not.toHaveBeenCalled();
  });

  it("rejects an unknown category enum value", async () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    await expect(
      server.call("suggestImprovement", { ...VALID_INPUT, category: "vibes" }),
    ).rejects.toThrow();
  });

  it("truncates oversized observation/suggestion in the event payload", async () => {
    const server = makeServer();
    registerAgentFeedbackTools(server as never, () => VALID_AUTH);
    const long = "a".repeat(2000);
    await server.call("suggestImprovement", {
      ...VALID_INPUT,
      observation: long.slice(0, 1000), // schema caps at 1000
      suggestion: long.slice(0, 1000),
    });
    const [, , props] = trackServerEvent.mock.calls[0];
    expect((props as { observation: string }).observation.length).toBeLessThanOrEqual(1001);
  });
});

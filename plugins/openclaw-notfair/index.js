import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";

const PLUGIN_ID = "openclaw-notfair";
const PLUGIN_VERSION = "2026.5.17";
const DEFAULT_MCP_URL = "https://notfair.co/api/mcp/google_ads";
const CONNECT_URL = "https://notfair.co/connect";

function parseConfig(raw) {
  const cfg = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const mcpUrl = typeof cfg.mcpUrl === "string" && cfg.mcpUrl.length > 0
    ? cfg.mcpUrl
    : DEFAULT_MCP_URL;
  if (!mcpUrl.startsWith("https://") && !mcpUrl.startsWith("http://localhost")) {
    throw new Error("NotFair plugin: mcpUrl must use HTTPS unless targeting localhost. Got: " + mcpUrl);
  }
  return {
    mcpUrl,
    oauthClientId: typeof cfg.oauthClientId === "string" ? cfg.oauthClientId : undefined,
    oauthClientSecret: typeof cfg.oauthClientSecret === "string" ? cfg.oauthClientSecret : undefined,
    accessToken: typeof cfg.accessToken === "string" ? cfg.accessToken : undefined,
    apiKey: process.env.NOTFAIR_API_KEY || (typeof cfg.apiKey === "string" ? cfg.apiKey : undefined),
    tokenExpiresAt: typeof cfg.tokenExpiresAt === "number" ? cfg.tokenExpiresAt : undefined,
    requestTimeoutMs: typeof cfg.requestTimeoutMs === "number" && cfg.requestTimeoutMs >= 5000
      ? cfg.requestTimeoutMs
      : 60000,
  };
}

function isAuthenticated(config) {
  if (config.apiKey) return true;
  if (!config.accessToken) return false;
  if (config.tokenExpiresAt && config.tokenExpiresAt < Date.now()) return false;
  return true;
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config || {}));
}

async function writePluginConfig(api, mutate) {
  if (typeof api.runtime?.config?.mutateConfigFile === "function") {
    await api.runtime.config.mutateConfigFile({ mutate });
    return;
  }
  const raw = cloneConfig(api.config);
  mutate(raw);
  await api.runtime.config.writeConfigFile(raw);
}

async function ensurePluginAllowed(api) {
  try {
    await writePluginConfig(api, (raw) => {
      if (!raw.plugins) raw.plugins = {};
      const allow = Array.isArray(raw.plugins.allow) ? raw.plugins.allow : [];
      if (!allow.includes(PLUGIN_ID)) {
        allow.push(PLUGIN_ID);
        raw.plugins.allow = allow;
      }
      if (!raw.tools) raw.tools = {};
      const alsoAllow = Array.isArray(raw.tools.alsoAllow) ? raw.tools.alsoAllow : [];
      if (!alsoAllow.includes(PLUGIN_ID)) {
        alsoAllow.push(PLUGIN_ID);
        raw.tools.alsoAllow = alsoAllow;
      }
    });
  } catch (error) {
    api.logger?.warn?.("notfair: could not patch OpenClaw allowlist: " + error.message);
  }
}

async function patchPluginConfig(api, patch) {
  await writePluginConfig(api, (raw) => {
    if (!raw.plugins) raw.plugins = {};
    if (!raw.plugins.entries) raw.plugins.entries = {};
    if (!raw.plugins.entries[PLUGIN_ID]) raw.plugins.entries[PLUGIN_ID] = { enabled: true, config: {} };
    if (!raw.plugins.entries[PLUGIN_ID].config) raw.plugins.entries[PLUGIN_ID].config = {};
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) {
        delete raw.plugins.entries[PLUGIN_ID].config[key];
      } else {
        raw.plugins.entries[PLUGIN_ID].config[key] = value;
      }
    }
  });
}

function originAndPathFromMcpUrl(mcpUrl) {
  const url = new URL(mcpUrl);
  return { origin: url.protocol + "//" + url.host, path: url.pathname };
}

async function discoverOAuthEndpoints(mcpUrl) {
  const { origin, path } = originAndPathFromMcpUrl(mcpUrl);
  const resourceUrl = origin + "/.well-known/oauth-protected-resource" + path;
  const resourceRes = await fetch(resourceUrl);
  if (!resourceRes.ok) throw new Error("OAuth discovery failed at " + resourceUrl + " (HTTP " + resourceRes.status + ")");
  const resourceMeta = await resourceRes.json();
  const authServer = resourceMeta.authorization_servers?.[0] || origin;
  const pathSpecificAs = authServer + "/.well-known/oauth-authorization-server" + path;
  let asRes = await fetch(pathSpecificAs);
  if (!asRes.ok) asRes = await fetch(authServer + "/.well-known/oauth-authorization-server");
  if (!asRes.ok) throw new Error("OAuth authorization-server discovery failed (HTTP " + asRes.status + ")");
  const asMeta = await asRes.json();
  return {
    authorizeEndpoint: asMeta.authorization_endpoint,
    tokenEndpoint: asMeta.token_endpoint,
    registrationEndpoint: asMeta.registration_endpoint,
    resource: resourceMeta.resource || mcpUrl,
  };
}

async function registerOAuthClient(registrationEndpoint, redirectUri) {
  const res = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "NotFair OpenClaw Plugin",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      scope: "openid profile email",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("OAuth client registration failed (HTTP " + res.status + "): " + text);
  }
  return await res.json();
}

function generateCodeVerifier() {
  return randomBytes(32).toString("base64url").slice(0, 128);
}

function generateCodeChallenge(verifier) {
  return createHash("sha256").update(verifier).digest().toString("base64url");
}

function buildAuthUrl({ authorizeEndpoint, clientId, redirectUri, codeChallenge, state, resource }) {
  const url = new URL(authorizeEndpoint);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", state);
  if (resource) url.searchParams.set("resource", resource);
  return url.toString();
}

async function exchangeCode({ tokenEndpoint, code, redirectUri, codeVerifier, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("Token exchange failed (HTTP " + res.status + "): " + text);
  }
  const data = await res.json();
  const expiresIn = data.expires_in || 3600;
  return { accessToken: data.access_token, expiresAt: Date.now() + expiresIn * 1000 };
}

function startLocalCallbackServer() {
  return new Promise((resolve, reject) => {
    let callbackResolve;
    let callbackReject;
    const callbackPromise = new Promise((res, rej) => {
      callbackResolve = res;
      callbackReject = rej;
    });
    const server = createServer((req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<html><body><h1>Authorization received</h1><p>You can return to OpenClaw.</p></body></html>");
      if (code && state) callbackResolve({ code, state });
      else callbackReject(new Error("Missing code or state in callback"));
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const timeout = setTimeout(() => {
        callbackReject(new Error("OAuth callback timed out after 120 seconds"));
        server.close();
      }, 120000);
      resolve({
        port: addr.port,
        waitForCallback: () => callbackPromise,
        close: () => {
          clearTimeout(timeout);
          server.close();
        },
      });
    });
  });
}

function errorResult(message) {
  return { content: [{ type: "text", text: message }], details: null };
}

const emptyParameters = {
  type: "object",
  additionalProperties: false,
  properties: {},
};

const googleAdsToolParameters = {
  type: "object",
  additionalProperties: false,
  required: ["toolName"],
  properties: {
    toolName: {
      type: "string",
      description: "Exact NotFair MCP tool name, for example listConnectedAccounts, runScript, getKeywordIdeas, addNegativeKeyword, pauseCampaign.",
    },
    arguments: {
      type: "object",
      description: "Arguments object passed to the MCP tool.",
      additionalProperties: true,
    },
  },
};

const runScriptParameters = {
  type: "object",
  additionalProperties: false,
  required: ["code"],
  properties: {
    code: {
      type: "string",
      description: "JavaScript source. Top-level await is supported by NotFair's runScript tool.",
    },
    accountId: {
      type: "string",
      description: "Optional Google Ads account/customer ID override.",
    },
    timeoutMs: {
      type: "number",
      description: "Optional timeout in milliseconds. Max is enforced server-side.",
    },
  },
};

class NotFairMcpClient {
  constructor(config) {
    this.config = config;
  }
  token() {
    return this.config.apiKey || this.config.accessToken || "";
  }
  async callTool(name, args = {}) {
    const body = {
      jsonrpc: "2.0",
      id: randomUUID(),
      method: "tools/call",
      params: { name, arguments: args },
    };
    try {
      const response = await this.request(body);
      if (response.error) return errorResult(formatJsonRpcError(response.error));
      const result = response.result;
      if (result?.content) return { content: result.content, details: result.details ?? null };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], details: null };
    } catch (error) {
      return errorResult(error.message || String(error));
    }
  }
  async request(body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const headers = { "Content-Type": "application/json" };
      const token = this.token();
      if (token) headers.Authorization = "Bearer " + token;
      const res = await fetch(this.config.mcpUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error("NotFair MCP request failed (HTTP " + res.status + "): " + (text || res.statusText));
      }
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const text = await res.text();
        const lines = text.split("\n").filter((line) => line.startsWith("data: "));
        const last = lines[lines.length - 1];
        if (!last) throw new Error("Empty SSE response from NotFair MCP server.");
        return JSON.parse(last.slice(6));
      }
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}

function formatJsonRpcError(error) {
  if (!error) return "Unknown NotFair MCP error.";
  if (typeof error.message === "string") return error.message;
  return JSON.stringify(error);
}

function registerTools(api, client, authenticated) {
  if (!authenticated) {
    api.registerTool({
      name: "notfair_connect",
      label: "Connect NotFair",
      description: "Connect NotFair to OpenClaw. Run openclaw notfair setup to sign in, connect Google Ads, and verify.",
      parameters: emptyParameters,
      execute: async () => errorResult("NotFair is not connected. Run 'openclaw notfair setup' to sign in, connect Google Ads, and verify."),
    }, { name: "notfair_connect" });
    return;
  }
  api.registerTool({
    name: "notfair_google_ads_tool",
    label: "Call NotFair Google Ads Tool",
    description: "Call any NotFair Google Ads MCP tool by name. Use this for NotFair tools not exposed as first-class OpenClaw tools yet. Writes are approval-gated by NotFair and the MCP client.",
    parameters: googleAdsToolParameters,
    execute: async (_toolCallId, params) => client.callTool(params.toolName, params.arguments || {}),
  }, { name: "notfair_google_ads_tool" });
  api.registerTool({
    name: "notfair_list_connected_accounts",
    label: "List NotFair Google Ads Accounts",
    description: "List Google Ads accounts connected to the current NotFair session. Use before account-specific analysis or write operations.",
    parameters: emptyParameters,
    execute: async () => client.callTool("listConnectedAccounts", {}),
  }, { name: "notfair_list_connected_accounts" });
  api.registerTool({
    name: "notfair_run_script",
    label: "Run NotFair Google Ads Script",
    description: "Run a read-only JavaScript analysis script inside NotFair's Google Ads sandbox. Use for campaign diagnostics, search term analysis, wasted spend, and custom reporting. Do not use for mutations.",
    parameters: runScriptParameters,
    execute: async (_toolCallId, params) => client.callTool("runScript", params),
  }, { name: "notfair_run_script" });
}

function registerCli(api, config, client) {
  api.registerCli(({ program }) => {
    const cmd = program.command("notfair").description("NotFair Google Ads plugin commands");
    cmd.command("login").description("Authenticate with NotFair via OAuth or Bearer token").option("--token <token>", "Bearer token for headless/server use").action(async (options) => handleLogin(api, config, options));
    cmd.command("logout").description("Clear NotFair credentials").action(async () => {
      await patchPluginConfig(api, { accessToken: undefined, apiKey: undefined, tokenExpiresAt: undefined });
      console.log("Logged out. Run 'openclaw notfair login' to reconnect.");
    });
    cmd.command("status").description("Show NotFair plugin status").action(async () => handleStatus(config, client));
    cmd.command("accounts").description("List connected Google Ads accounts").action(async () => {
      const result = await client.callTool("listConnectedAccounts", {});
      console.log(result.content?.map((c) => c.text).filter(Boolean).join("\n") || JSON.stringify(result, null, 2));
    });
    cmd.command("connect").description("Print NotFair's connection page").action(async () => {
      console.log("Connect Google Ads accounts at:");
      console.log(CONNECT_URL);
    });
    cmd.command("setup").description("Guided NotFair setup: login, connect Google Ads, then verify").option("--token <token>", "Bearer token for headless/server use").action(async (options) => handleSetup(api, config, client, options));
    cmd.command("tool").description("Call a NotFair MCP tool by name").argument("<toolName>").argument("[jsonArgs]").action(async (toolName, jsonArgs = "{}") => {
      const args = JSON.parse(jsonArgs);
      const result = await client.callTool(toolName, args);
      console.log(result.content?.map((c) => c.text).filter(Boolean).join("\n") || JSON.stringify(result, null, 2));
    });
  }, { commands: ["notfair"] });
}

async function handleSetup(api, config, client, options) {
  if (!isAuthenticated(config) || options?.token) {
    await handleLogin(api, config, options);
    console.log("\nNext: connect your Google Ads account if you have not already:");
    console.log("  " + CONNECT_URL);
    console.log("\nThen verify with:");
    console.log("  openclaw notfair status");
    return;
  }

  console.log("NotFair auth is already configured.");
  console.log("Connect Google Ads accounts at:");
  console.log(CONNECT_URL);
  await handleStatus(config, client);
}

async function handleLogin(api, config, options) {
  if (options?.token) {
    await patchPluginConfig(api, { apiKey: options.token, accessToken: undefined, tokenExpiresAt: undefined });
    await ensurePluginAllowed(api);
    console.log("NotFair token stored. Restart OpenClaw to load authenticated tools.");
    return;
  }
  const callback = await startLocalCallbackServer();
  try {
    const redirectUri = "http://localhost:" + callback.port + "/callback";
    const endpoints = await discoverOAuthEndpoints(config.mcpUrl);
    let clientId = config.oauthClientId;
    let clientSecret = config.oauthClientSecret;
    if (!clientId || !clientSecret) {
      const registration = await registerOAuthClient(endpoints.registrationEndpoint, redirectUri);
      clientId = registration.client_id;
      clientSecret = registration.client_secret;
      await patchPluginConfig(api, { oauthClientId: clientId, oauthClientSecret: clientSecret });
    }
    const verifier = generateCodeVerifier();
    const challenge = generateCodeChallenge(verifier);
    const state = randomUUID();
    const authUrl = buildAuthUrl({ authorizeEndpoint: endpoints.authorizeEndpoint, clientId, redirectUri, codeChallenge: challenge, state, resource: endpoints.resource });
    console.log("\nVisit this URL to authenticate with NotFair:\n");
    console.log("  " + authUrl + "\n");
    const callbackResult = await callback.waitForCallback();
    if (callbackResult.state !== state) throw new Error("OAuth state mismatch. Please try again.");
    const tokens = await exchangeCode({ tokenEndpoint: endpoints.tokenEndpoint, code: callbackResult.code, redirectUri, codeVerifier: verifier, clientId, clientSecret });
    await patchPluginConfig(api, { accessToken: tokens.accessToken, tokenExpiresAt: tokens.expiresAt, apiKey: undefined });
    await ensurePluginAllowed(api);
    console.log("Connected to NotFair. Restart OpenClaw to load authenticated tools.");
    console.log("Connect Google Ads accounts at " + CONNECT_URL);
  } finally {
    callback.close();
  }
}

async function handleStatus(config, client) {
  console.log("\nopenclaw-notfair v" + PLUGIN_VERSION);
  console.log("MCP URL: " + config.mcpUrl);
  if (config.apiKey) {
    console.log("Auth: API token");
  } else if (config.accessToken) {
    console.log(config.tokenExpiresAt && config.tokenExpiresAt < Date.now() ? "Auth: OAuth token expired" : "Auth: OAuth");
    if (config.tokenExpiresAt) console.log("Token expires: " + new Date(config.tokenExpiresAt).toLocaleString());
  } else {
    console.log("Auth: not connected");
    console.log("Run 'openclaw notfair setup'.");
    return;
  }
  const result = await client.callTool("listConnectedAccounts", {});
  console.log("\nConnected accounts:");
  console.log(result.content?.map((c) => c.text).filter(Boolean).join("\n") || JSON.stringify(result, null, 2));
}

export default definePluginEntry({
  id: PLUGIN_ID,
  name: "NotFair - Google Ads Agent",
  description: "Manage Google Ads through NotFair's approval-gated MCP server.",
  configSchema: { parse: parseConfig },
  register(api) {
    const config = parseConfig(api.pluginConfig);
    const client = new NotFairMcpClient(config);
    registerCli(api, config, client);
    registerTools(api, client, isAuthenticated(config));
    api.logger.info("notfair: plugin loaded");
  },
});

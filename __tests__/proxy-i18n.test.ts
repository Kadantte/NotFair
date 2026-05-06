import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

vi.mock("next-intl/middleware", () => ({
  default: () => (request: NextRequest) => {
    const url = request.nextUrl.clone();
    url.pathname = "/fr";
    return Response.redirect(url, 307);
  },
}));

function makeRequest(pathname: string, headers?: Record<string, string>) {
  return new NextRequest(new URL(`http://localhost:3000${pathname}`), {
    headers,
  });
}

describe("proxy i18n routing", () => {
  it("keeps public pages on canonical routes when localized pages do not exist", async () => {
    const response = await proxy(makeRequest("/pricing", { "accept-language": "fr-FR,fr;q=0.9" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("fr");
  });

  it.each([
    ["de-DE,de;q=0.9", "de"],
    ["es-MX,es;q=0.9", "es"],
    ["th-TH,th;q=0.9", "th"],
    ["pt-BR,pt;q=0.9", "pt-BR"],
    ["pt-PT,pt;q=0.9", "pt-BR"],
    ["ru-RU,ru;q=0.9", "ru"],
    ["be-BY,be;q=0.9", "ru"],
    ["pl-PL,pl;q=0.9", "ru"],
    ["kk-KZ,kk;q=0.9", "ru"],
    ["en-US,en;q=0.9", "en"],
  ])("detects %s for canonical public routes", async (acceptLanguage, expectedLocale) => {
    const response = await proxy(makeRequest("/mcp", { "accept-language": acceptLanguage }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe(expectedLocale);
  });

  it("prefers the locale cookie over Accept-Language", async () => {
    const response = await proxy(
      makeRequest("/pricing", {
        "accept-language": "fr-FR,fr;q=0.9",
        cookie: "NEXT_LOCALE=de",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("de");
  });

  it("falls back to English for unsupported browser languages", async () => {
    const response = await proxy(makeRequest("/pricing", { "accept-language": "ja-JP,ja;q=0.9" }));

    expect(response.status).toBe(200);
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("en");
  });

  it("does not locale-prefix OAuth callback routes", async () => {
    const response = await proxy(makeRequest("/auth/callback?code=x&state=y", { "accept-language": "fr-FR,fr;q=0.9" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("fr");
  });

  it("redirects unsupported locale-prefixed routes back to their canonical path", async () => {
    const response = await proxy(makeRequest("/fr/pricing?utm=test"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/pricing?utm=test");
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("fr");
  });

  it("redirects locale-prefixed app routes back to app routes while preserving query params", async () => {
    const response = await proxy(makeRequest("/de/connect/google-ads/claude-code?source=hero"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/connect/google-ads/claude-code?source=hero");
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("de");
  });

  it("preserves auth callback query params when stripping unsupported locale prefixes", async () => {
    const response = await proxy(makeRequest("/fr/auth/callback?code=x&state=y"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/auth/callback?code=x&state=y");
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("fr");
  });

  it("still applies auth protection to protected app routes after setting a locale cookie", async () => {
    const response = await proxy(makeRequest("/campaigns", { "accept-language": "es-ES,es;q=0.9" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/connect");
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("es");
  });

  it("still routes browser-language home visits to localized home pages", async () => {
    const response = await proxy(makeRequest("/", { "accept-language": "fr-FR,fr;q=0.9" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/fr");
  });

  it("routes Russian-related browser regions to the Russian home page", async () => {
    const response = await proxy(makeRequest("/", { "accept-language": "pl-PL,pl;q=0.9" }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/ru");
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("ru");
  });

  it("keeps English home visits on the canonical root route", async () => {
    const response = await proxy(makeRequest("/", { "accept-language": "en-US,en;q=0.9" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("en");
  });

  it("treats trailing-slash locale home paths as localized home pages", async () => {
    const response = await proxy(makeRequest("/fr/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toMatch(/^http:\/\/localhost:3000\/fr\/?$/);
  });
});

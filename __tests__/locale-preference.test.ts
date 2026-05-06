import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  getLocalePreferenceBootstrapScript,
  getSupportedLocale,
} from "@/i18n/locale-preference";

function runBootstrap({
  storedLocale,
  cookie = "",
  lang = "en",
  pathname = "/",
  search = "",
  hash = "",
  blockCookieWrites = false,
}: {
  storedLocale: string | null;
  cookie?: string;
  lang?: string;
  pathname?: string;
  search?: string;
  hash?: string;
  blockCookieWrites?: boolean;
}) {
  let documentCookie = cookie;
  const replace = vi.fn();
  const reload = vi.fn();

  const context = {
    window: {
      localStorage: {
        getItem: vi.fn((key: string) => (key === LOCALE_STORAGE_KEY ? storedLocale : null)),
      },
    },
    document: {
      get cookie() {
        return documentCookie;
      },
      set cookie(value: string) {
        if (blockCookieWrites) return;
        documentCookie = value;
      },
      documentElement: {
        getAttribute: vi.fn((name: string) => (name === "lang" ? lang : null)),
      },
    },
    location: {
      pathname,
      search,
      hash,
      replace,
      reload,
    },
  };

  vm.runInNewContext(getLocalePreferenceBootstrapScript(), context);

  return { documentCookie, replace, reload };
}

describe("locale preference persistence", () => {
  it("validates supported locale values", () => {
    expect(getSupportedLocale("pt-BR")).toBe("pt-BR");
    expect(getSupportedLocale("ru")).toBe("ru");
    expect(getSupportedLocale("ja")).toBeNull();
    expect(getSupportedLocale(null)).toBeNull();
  });

  it("uses localStorage to override browser-detected home routing", () => {
    const result = runBootstrap({
      storedLocale: "de",
      lang: "fr",
      pathname: "/",
      search: "?utm=test",
      hash: "#top",
    });

    expect(result.documentCookie).toContain(`${LOCALE_COOKIE}=de`);
    expect(result.replace).toHaveBeenCalledWith("/de?utm=test#top");
    expect(result.reload).not.toHaveBeenCalled();
  });

  it("reloads canonical app routes once when server render used the wrong locale", () => {
    const result = runBootstrap({
      storedLocale: "es",
      lang: "en",
      pathname: "/campaigns",
    });

    expect(result.documentCookie).toContain(`${LOCALE_COOKIE}=es`);
    expect(result.replace).not.toHaveBeenCalled();
    expect(result.reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload canonical app routes when the locale cookie cannot be written", () => {
    const result = runBootstrap({
      storedLocale: "es",
      lang: "en",
      pathname: "/campaigns",
      blockCookieWrites: true,
    });

    expect(result.documentCookie).toBe("");
    expect(result.replace).not.toHaveBeenCalled();
    expect(result.reload).not.toHaveBeenCalled();
  });

  it("ignores unsupported stored values", () => {
    const result = runBootstrap({
      storedLocale: "ja",
      lang: "en",
      pathname: "/",
    });

    expect(result.documentCookie).toBe("");
    expect(result.replace).not.toHaveBeenCalled();
    expect(result.reload).not.toHaveBeenCalled();
  });
});

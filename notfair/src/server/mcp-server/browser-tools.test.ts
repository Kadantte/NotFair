import { beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  back: vi.fn(),
  click: vi.fn(),
  navigate: vi.fn(),
  press: vi.fn(),
  scroll: vi.fn(),
  snapshot: vi.fn(),
  type: vi.fn(),
}));
const session = vi.hoisted(() => ({
  getOrLaunchBrowser: vi.fn(),
  getSessionStatus: vi.fn(),
}));
const tabs = vi.hoisted(() => ({
  closeTab: vi.fn(),
  getTab: vi.fn(),
  listTabs: vi.fn(),
  openTab: vi.fn(),
}));

vi.mock("@/server/browser/actions", () => actions);
vi.mock("@/server/browser/session", () => session);
vi.mock("@/server/browser/tabs", () => tabs);

import { BROWSER_TOOLS } from "./browser-tools";
import type { ToolResult } from "./tools";

const PAGE = { fake: "page" };
const BASE = { project_slug: "proj", target_id: "agent-1" };

async function call(name: string, input: unknown): Promise<ToolResult> {
  const tool = BROWSER_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.handler(input, {});
}

function text(result: ToolResult): string {
  if (!result.ok) throw new Error(`expected ok result, got: ${result.error}`);
  return result.content.map((c) => c.text).join("\n");
}

function errorOf(result: ToolResult): string {
  if (result.ok) throw new Error("expected error result");
  return result.error;
}

beforeEach(() => {
  for (const group of [actions, session, tabs]) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  tabs.getTab.mockResolvedValue(PAGE);
});

describe("registry", () => {
  it("exposes the full browser surface and no shutdown primitive", () => {
    expect(BROWSER_TOOLS.map((t) => t.name)).toEqual([
      "browser_status",
      "browser_tabs",
      "browser_open",
      "browser_close",
      "browser_navigate",
      "browser_snapshot",
      "browser_click",
      "browser_type",
      "browser_press",
      "browser_scroll",
      "browser_back",
    ]);
    expect(BROWSER_TOOLS.some((t) => t.name.includes("shutdown"))).toBe(false);
  });

  it("every tool rejects malformed args", async () => {
    for (const tool of BROWSER_TOOLS) {
      const r = await tool.handler({}, {});
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/^Invalid arguments:/);
    }
  });
});

describe("browser_status", () => {
  it("reports a running session", async () => {
    session.getSessionStatus.mockReturnValue({
      projectSlug: "proj",
      running: true,
      cdpPort: 19042,
      userDataDir: "/tmp/x/user-data",
      uptimeMs: 1234,
      idleTimeoutMs: 300_000,
    });
    const r = await call("browser_status", { project_slug: "proj" });
    const parsed = JSON.parse(text(r));
    expect(parsed).toMatchObject({ running: true, cdpPort: 19042, uptimeMs: 1234 });
    expect(parsed.note).toContain("is running");
    expect(session.getSessionStatus).toHaveBeenCalledWith("proj");
  });

  it("reports a stopped session with launch guidance", async () => {
    session.getSessionStatus.mockReturnValue({
      projectSlug: "proj",
      running: false,
      cdpPort: 19042,
      userDataDir: "/tmp/x/user-data",
      idleTimeoutMs: 300_000,
    });
    const r = await call("browser_status", { project_slug: "proj" });
    expect(JSON.parse(text(r)).note).toContain("not running");
  });
});

describe("browser_tabs", () => {
  it("lists tabs as JSON", async () => {
    tabs.listTabs.mockResolvedValue([{ id: "agent-1", label: "agent-1", url: "https://x", title: "X" }]);
    const r = await call("browser_tabs", { project_slug: "proj" });
    expect(JSON.parse(text(r))).toEqual([
      { id: "agent-1", label: "agent-1", url: "https://x", title: "X" },
    ]);
  });

  it("wraps listing failures", async () => {
    tabs.listTabs.mockRejectedValue(new Error("chrome died"));
    const r = await call("browser_tabs", { project_slug: "proj" });
    expect(errorOf(r)).toBe("browser_tabs failed: chrome died");
  });
});

describe("browser_open", () => {
  it("launches the session then opens the labeled tab", async () => {
    session.getOrLaunchBrowser.mockResolvedValue({});
    tabs.openTab.mockResolvedValue({ id: "agent-1", label: "agent-1", url: "https://x", title: "" });
    const r = await call("browser_open", {
      project_slug: "proj",
      url: "https://x",
      label: "agent-1",
    });
    expect(session.getOrLaunchBrowser).toHaveBeenCalledWith("proj");
    expect(tabs.openTab).toHaveBeenCalledWith("proj", { label: "agent-1", url: "https://x" });
    expect(JSON.parse(text(r)).id).toBe("agent-1");
  });

  it("rejects a non-URL url and a malformed label", async () => {
    expect((await call("browser_open", { project_slug: "proj", url: "not a url" })).ok).toBe(false);
    expect(
      (await call("browser_open", { project_slug: "proj", label: "-starts-with-dash" })).ok,
    ).toBe(false);
    expect(session.getOrLaunchBrowser).not.toHaveBeenCalled();
  });

  it("wraps launch failures", async () => {
    session.getOrLaunchBrowser.mockRejectedValue(new Error("no chrome binary"));
    const r = await call("browser_open", { project_slug: "proj" });
    expect(errorOf(r)).toBe("browser_open failed: no chrome binary");
  });
});

describe("browser_close", () => {
  it("reports both the closed and the not-found outcome", async () => {
    tabs.closeTab.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(text(await call("browser_close", BASE))).toBe('Closed tab "agent-1".');
    expect(text(await call("browser_close", BASE))).toBe('No tab "agent-1" to close.');
    expect(tabs.closeTab).toHaveBeenCalledWith("proj", "agent-1");
  });

  it("wraps close failures", async () => {
    tabs.closeTab.mockRejectedValue(new Error("boom"));
    expect(errorOf(await call("browser_close", BASE))).toBe("browser_close failed: boom");
  });
});

describe("browser_navigate", () => {
  it("navigates the resolved tab and returns url + title", async () => {
    actions.navigate.mockResolvedValue({ url: "https://x/after", title: "After" });
    const r = await call("browser_navigate", {
      ...BASE,
      url: "https://x/after",
      wait_until: "domcontentloaded",
      timeout_ms: 5000,
    });
    expect(tabs.getTab).toHaveBeenCalledWith("proj", "agent-1");
    expect(actions.navigate).toHaveBeenCalledWith(PAGE, {
      url: "https://x/after",
      waitUntil: "domcontentloaded",
      timeoutMs: 5000,
    });
    expect(JSON.parse(text(r))).toEqual({ url: "https://x/after", title: "After" });
  });

  it("fails with guidance when the tab is unknown", async () => {
    tabs.getTab.mockResolvedValue(null);
    const r = await call("browser_navigate", { ...BASE, url: "https://x" });
    expect(errorOf(r)).toContain('No tab "agent-1" in workspace "proj"');
    expect(actions.navigate).not.toHaveBeenCalled();
  });

  it("caps timeout_ms at 120s", async () => {
    const r = await call("browser_navigate", { ...BASE, url: "https://x", timeout_ms: 500_000 });
    expect(r.ok).toBe(false);
  });
});

describe("browser_snapshot", () => {
  const SNAP = {
    url: "https://x",
    title: "X",
    elements: [
      { ref: "e1", role: "button", name: "Save" },
      { ref: "e2", role: "a", name: "Docs", href: "https://x/docs" },
    ],
    text: "page text",
  };

  it("returns the full snapshot", async () => {
    actions.snapshot.mockResolvedValue(SNAP);
    const r = await call("browser_snapshot", BASE);
    expect(JSON.parse(text(r))).toEqual(SNAP);
  });

  it("truncates the element list to max_elements", async () => {
    actions.snapshot.mockResolvedValue(SNAP);
    const r = await call("browser_snapshot", { ...BASE, max_elements: 1 });
    const parsed = JSON.parse(text(r));
    expect(parsed.elements).toEqual([SNAP.elements[0]]);
    expect(parsed.text).toBe("page text");
  });

  it("fails when the tab is unknown", async () => {
    tabs.getTab.mockResolvedValue(null);
    expect(errorOf(await call("browser_snapshot", BASE))).toContain('No tab "agent-1"');
  });
});

describe("browser_click", () => {
  it("clicks the ref with the mapped options", async () => {
    actions.click.mockResolvedValue(undefined);
    const r = await call("browser_click", {
      ...BASE,
      ref: "e3",
      button: "right",
      modifiers: ["Meta"],
      double_click: true,
      timeout_ms: 2000,
    });
    expect(actions.click).toHaveBeenCalledWith(PAGE, {
      ref: "e3",
      button: "right",
      modifiers: ["Meta"],
      doubleClick: true,
      timeoutMs: 2000,
    });
    expect(text(r)).toBe('Clicked e3 on tab "agent-1".');
  });

  it("rejects refs that do not look like snapshot refs", async () => {
    const r = await call("browser_click", { ...BASE, ref: "button#save" });
    expect(r.ok).toBe(false);
    expect(actions.click).not.toHaveBeenCalled();
  });
});

describe("browser_type", () => {
  it("types with mapped options and reports the char count", async () => {
    actions.type.mockResolvedValue(undefined);
    const r = await call("browser_type", {
      ...BASE,
      ref: "e2",
      text: "hello",
      submit: true,
      clear_first: false,
    });
    expect(actions.type).toHaveBeenCalledWith(PAGE, {
      ref: "e2",
      text: "hello",
      submit: true,
      clearFirst: false,
      timeoutMs: undefined,
    });
    expect(text(r)).toBe("Typed 5 chars into e2 and submitted.");
  });

  it("omits the submit suffix by default", async () => {
    actions.type.mockResolvedValue(undefined);
    const r = await call("browser_type", { ...BASE, ref: "e2", text: "hi" });
    expect(text(r)).toBe("Typed 2 chars into e2.");
  });
});

describe("browser_press", () => {
  it("presses at the page level without a ref", async () => {
    actions.press.mockResolvedValue(undefined);
    const r = await call("browser_press", { ...BASE, key: "Escape" });
    expect(actions.press).toHaveBeenCalledWith(PAGE, { key: "Escape", ref: undefined });
    expect(text(r)).toBe("Pressed Escape.");
  });

  it("focuses the ref first when given", async () => {
    actions.press.mockResolvedValue(undefined);
    const r = await call("browser_press", { ...BASE, key: "Enter", ref: "e4" });
    expect(actions.press).toHaveBeenCalledWith(PAGE, { key: "Enter", ref: "e4" });
    expect(text(r)).toBe("Pressed Enter on e4.");
  });
});

describe("browser_scroll", () => {
  it("scrolls with an explicit amount", async () => {
    actions.scroll.mockResolvedValue(undefined);
    const r = await call("browser_scroll", { ...BASE, direction: "down", amount: 900 });
    expect(actions.scroll).toHaveBeenCalledWith(PAGE, { direction: "down", amount: 900 });
    expect(text(r)).toBe("Scrolled down by 900px.");
  });

  it("omits the pixel clause when using the default amount", async () => {
    actions.scroll.mockResolvedValue(undefined);
    const r = await call("browser_scroll", { ...BASE, direction: "up" });
    expect(text(r)).toBe("Scrolled up.");
  });
});

describe("browser_back", () => {
  it("navigates back on the tab", async () => {
    actions.back.mockResolvedValue(undefined);
    const r = await call("browser_back", BASE);
    expect(actions.back).toHaveBeenCalledWith(PAGE);
    expect(text(r)).toBe('Navigated back on tab "agent-1".');
  });

  it("fails when the tab is unknown", async () => {
    tabs.getTab.mockResolvedValue(null);
    expect(errorOf(await call("browser_back", BASE))).toContain('No tab "agent-1"');
  });
});

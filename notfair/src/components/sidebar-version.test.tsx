// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { SidebarVersion } from "@/components/sidebar-version";

const toastSuccess = vi.hoisted(() => vi.fn());
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe("SidebarVersion", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("only downloads an available update before asking the user to apply it", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ current: "0.9.13", latest: "0.9.14", has_update: true }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, can_restart: true }));

    render(<SidebarVersion />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/upgrade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "prepare" }),
      });
    });
    expect(
      await screen.findByRole("button", { name: /update to v0\.9\.14/i }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /restart now/i })).toBeNull();
  });

  it("installs and restarts only after the user clicks Update", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ current: "0.9.13", latest: "0.9.14", has_update: true }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, can_restart: true }))
      // Keep the restart request pending so the component remains in its
      // visible updating state without beginning the version poll.
      .mockReturnValueOnce(new Promise<Response>(() => {}));

    render(<SidebarVersion />);
    fireEvent.click(
      await screen.findByRole("button", { name: /update to v0\.9\.14/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/upgrade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply" }),
      });
      expect(fetchMock).toHaveBeenCalledWith("/api/restart", { method: "POST" });
    });
    expect(screen.queryByRole("button", { name: /restart now/i })).toBeNull();
    expect(
      screen.getByRole("button", { name: /updating/i }),
    ).toBeDisabled();
  });

  it("keeps the manual restart fallback for foreground and dev servers", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ current: "0.9.13", latest: "0.9.14", has_update: true }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ok: true }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          can_restart: false,
          note: "Restart NotFair from your terminal.",
        }),
      );

    render(<SidebarVersion />);

    fireEvent.click(
      await screen.findByRole("button", { name: /update to v0\.9\.14/i }),
    );
    expect(await screen.findByText("Restart to apply")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(toastSuccess).toHaveBeenCalledWith(
      "Restart NotFair from your terminal.",
      { duration: 15_000 },
    );
  });

  it("offers a retry without repeatedly downloading after a failure", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ current: "0.9.13", latest: "0.9.14", has_update: true }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ ok: false, error: "registry unavailable" }, false),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    render(<SidebarVersion />);
    const retry = await screen.findByRole("button", { name: /retry update/i });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.click(retry);
    expect(
      await screen.findByRole("button", { name: /update to v0\.9\.14/i }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

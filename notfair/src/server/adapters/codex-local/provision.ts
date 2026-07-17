import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentProvisionSpec } from "../types";

/**
 * Provision a workspace for Codex CLI.
 *
 * Layout under `<workspaceDir>/`:
 *   IDENTITY.md   — NotFair source of truth (also written so humans see it)
 *   AGENTS.md     — same content; codex auto-loads AGENTS.md from cwd
 *   PROJECT.md    — project brief if available
 *
 * The skill text lives INSIDE the identity — never as a SKILL.md sidecar,
 * which would be the same content twice (once auto-loaded, once whenever
 * the agent reads the file).
 */
export async function provisionCodexAgent(spec: AgentProvisionSpec): Promise<void> {
  await mkdir(spec.workspaceDir, { recursive: true });
  await Promise.all([
    writeFile(join(spec.workspaceDir, "IDENTITY.md"), spec.identityMd, "utf8"),
    writeFile(join(spec.workspaceDir, "AGENTS.md"), spec.identityMd, "utf8"),
    spec.projectMd
      ? writeFile(join(spec.workspaceDir, "PROJECT.md"), spec.projectMd, "utf8")
      : Promise.resolve(),
    // Remove the sidecar older provisions wrote.
    rm(join(spec.workspaceDir, "SKILL.md"), { force: true }),
  ]);
}

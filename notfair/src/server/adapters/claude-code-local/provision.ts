import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentProvisionSpec } from "../types";

/**
 * Provision a workspace for Claude Code.
 *
 * Layout under `<workspaceDir>/`:
 *   IDENTITY.md   — system prompt (NotFair's source of truth)
 *   CLAUDE.md     — a one-paragraph pointer, NOT a mirror. NotFair passes
 *                   IDENTITY.md via --append-system-prompt on every turn;
 *                   mirroring the full identity here would load the same
 *                   ~18KB into context TWICE (system prompt + auto-load).
 *   PROJECT.md    — project brief if available (sidecar for humans)
 *
 * The skill text lives INSIDE the identity — never as a SKILL.md sidecar.
 * No subprocess calls. Claude Code discovers the workspace lazily on first
 * invocation; there's no "register agent" step.
 */
const CLAUDE_MD_POINTER = `# NotFair agent workspace

This agent's full instructions live in IDENTITY.md — NotFair injects them
as the system prompt on every turn, so they are not mirrored here. If you
are a human (or a manually launched session) exploring this workspace,
read IDENTITY.md.
`;

export async function provisionClaudeCodeAgent(spec: AgentProvisionSpec): Promise<void> {
  await mkdir(spec.workspaceDir, { recursive: true });
  await Promise.all([
    writeFile(join(spec.workspaceDir, "IDENTITY.md"), spec.identityMd, "utf8"),
    writeFile(join(spec.workspaceDir, "CLAUDE.md"), CLAUDE_MD_POINTER, "utf8"),
    spec.projectMd
      ? writeFile(join(spec.workspaceDir, "PROJECT.md"), spec.projectMd, "utf8")
      : Promise.resolve(),
    // Remove the sidecar older provisions wrote.
    rm(join(spec.workspaceDir, "SKILL.md"), { force: true }),
  ]);
}

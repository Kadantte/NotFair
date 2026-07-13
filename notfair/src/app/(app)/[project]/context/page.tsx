import { notFound } from "next/navigation";
import { getProject } from "@/server/db/projects";
import { readProjectBrief, projectBriefPath } from "@/server/onboarding/project-brief";
import { listProjectAgents } from "@/server/agent-meta";
import { SharedContextEditor } from "@/components/shared-context-editor";

export const dynamic = "force-dynamic";

/**
 * The shared workspace context (PROJECT.md): one brief every goal agent
 * inherits. Agents keep it current via `set_shared_context`; this page is
 * the user's direct line to the same document.
 */
export default async function SharedContextPage({
  params,
}: {
  params: Promise<{ project: string }>;
}) {
  const { project: slug } = await params;
  const project = getProject(slug);
  if (!project || project.archived_at) notFound();

  const brief = await readProjectBrief(slug);
  const agents = await listProjectAgents(slug);

  return (
    <div className="ns-app-narrow">
      <header className="ns-page-head">
        <div className="ns-page-head-stack">
          <h1 className="ns-page-title">Shared context</h1>
          <p className="ns-page-sub">
            What every goal agent knows about {project.display_name} — who you
            are, what you sell, what matters. Shared with{" "}
            {agents.length === 0
              ? "every future goal agent"
              : `all ${agents.length} goal agent${agents.length === 1 ? "" : "s"}`}
            ; agents update it too when they learn something workspace-wide.
          </p>
        </div>
      </header>

      <SharedContextEditor projectSlug={slug} initialContent={brief ?? ""} />

      <p className="mt-4 text-[11.5px] text-[hsl(var(--notfair-ink-4))]">
        Stored at <span className="font-mono">{projectBriefPath(slug)}</span>
      </p>
    </div>
  );
}

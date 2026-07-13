import { notFound } from "next/navigation";
import { getProject } from "@/server/db/projects";
import { getMcpCatalog } from "@/server/mcp-catalog";
import { getMcpStatus } from "@/server/mcp/state";
import { summarizeBuiltinTools } from "@/server/mcp-server/tool-summaries";
import { McpCard } from "@/components/mcp-card";
import { BuiltinMcpCard } from "@/components/builtin-mcp-card";
import { McpFlashBanner } from "@/components/mcp-flash-banner";
import { AddMcpServerMenu } from "@/components/add-mcp-server-card";
import { normalizeResourceUrl } from "@/server/mcp/discovery-url";
import { projectHref } from "@/lib/project-href";
import { accountPickerFor } from "@/lib/mcp-account-pickers";
import { prefetchAccountChoice } from "@/server/mcp/account-selection";

type Search = {
  mcp_connected?: string;
  mcp_error?: string;
  mcp_analyzing?: string;
  /** Catalog key of the MCP that just finished OAuth — drives the
   *  post-connect account/property picker on the matching card. */
  mcp_key?: string;
};

export default async function ConnectionsPage({
  searchParams,
  params,
}: {
  searchParams: Promise<Search>;
  params: Promise<{ project: string }>;
}) {
  const { project: slug } = await params;
  const project = getProject(slug);
  const { mcp_connected, mcp_error, mcp_analyzing, mcp_key } =
    await searchParams;
  if (!project || project.archived_at) notFound();

  const catalog = getMcpCatalog(project.slug);
  const statuses = await Promise.all(
    catalog.map((s) => getMcpStatus(project.slug, s.key)),
  );

  // Post-OAuth account/property picker: when the callback flagged a
  // multi-account MCP (`?mcp_key=`), prefetch its list here on the server
  // and hand it to the card, which auto-opens the picker dialog with it.
  const pendingChoice = mcp_key
    ? await prefetchAccountChoice(project, mcp_key)
    : null;
  const autoOpenPickerKey = pendingChoice ? mcp_key : null;

  const builtinTools = summarizeBuiltinTools();
  const connectedCount = statuses.filter((s) => s.state === "connected").length;
  const connectedSpecs = catalog.filter(
    (_, i) => statuses[i].state === "connected",
  );
  const connectedKeys = connectedSpecs.map((s) => s.key);
  const connectedResourceUrls = connectedSpecs.map((s) =>
    normalizeResourceUrl(s.resource_url),
  );

  return (
    <div className="ns-app-narrow">
      <header className="ns-page-head">
        <div className="ns-page-head-stack">
          <h1 className="ns-page-title">Connections</h1>
          <p className="ns-page-sub">
            MCP servers are the tools your agents call. Browse the curated list
            or paste any <b>OAuth&nbsp;2.0</b> URL.
          </p>
        </div>
        <div className="ns-page-actions">
          <AddMcpServerMenu
            connectedKeys={connectedKeys}
            connectedResourceUrls={connectedResourceUrls}
          />
        </div>
      </header>

      <McpFlashBanner
        connected={mcp_connected}
        error={mcp_error}
        analyzing={mcp_analyzing === "1"}
        goalsHref={projectHref(project.slug, "")}
      />

      <section>
        <h2 className="ns-h2">
          <span>Built-in</span>
          <span className="ns-h2-meta">Ships with NotFair</span>
        </h2>
        <div className="ns-group">
          <BuiltinMcpCard
            name="Goals"
            description="Built-in tools each goal agent runs its loop with: read the goal, verify metrics, log actions and learnings, and keep the shared context current."
            tools={builtinTools}
          />
        </div>
      </section>

      <section>
        <h2 className="ns-h2">
          <span>Servers</span>
          <span className="ns-h2-meta">
            {catalog.length === 0
              ? "None yet"
              : `${connectedCount} of ${catalog.length} connected`}
          </span>
        </h2>
        {catalog.length === 0 ? (
          <div className="ns-empty">
            <p className="ns-empty-title">No MCP servers yet.</p>
            <p className="ns-empty-sub">
              Use <span className="font-medium text-foreground">Add server</span>{" "}
              above to browse trusted connectors or paste a URL.
            </p>
          </div>
        ) : (
          <ol className="ns-group">
            {catalog.map((spec, i) => (
              <li key={spec.key}>
                <McpCard
                  spec={spec}
                  status={statuses[i]}
                  projectSlug={project.slug}
                  selectedAccountId={
                    accountPickerFor(spec.key)?.selectedId(project) ?? null
                  }
                  pickerPrefetch={
                    spec.key === autoOpenPickerKey
                      ? (pendingChoice?.prefetch ?? null)
                      : null
                  }
                />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

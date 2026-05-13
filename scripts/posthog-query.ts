import { loadEnvLocal } from "./_load-env";

loadEnvLocal();

type PostHogQueryResponse = {
  columns?: string[];
  results?: unknown[][];
  error?: string | null;
};

function appHost(): string {
  const raw = process.env.POSTHOG_HOST ?? process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.posthog.com";
  return raw
    .replace("https://us.i.posthog.com", "https://us.posthog.com")
    .replace("https://eu.i.posthog.com", "https://eu.posthog.com")
    .replace(/\/$/, "");
}

function personalKey(): string {
  const key = process.env.POSTHOG_PERSONAL_API_KEY;
  if (!key) throw new Error("Missing POSTHOG_PERSONAL_API_KEY");
  if (!key.startsWith("phx_")) {
    throw new Error("POSTHOG_PERSONAL_API_KEY should be a PostHog personal key starting with phx_");
  }
  return key;
}

async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { detail?: string; code?: string; type?: string };
      detail = [parsed.type, parsed.code, parsed.detail].filter(Boolean).join(": ");
    } catch {
      // Keep raw response text.
    }
    throw new Error(`PostHog API ${res.status}: ${detail}`);
  }
  return JSON.parse(text) as T;
}

async function projectId(): Promise<string> {
  if (process.env.POSTHOG_PROJECT_ID) return process.env.POSTHOG_PROJECT_ID;

  const token = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!token) throw new Error("Missing POSTHOG_PROJECT_ID and NEXT_PUBLIC_POSTHOG_KEY fallback");

  const current = await requestJson<{ id: number }>(
    `${appHost()}/api/projects/@current/?token=${encodeURIComponent(token)}`,
    { headers: { Authorization: `Bearer ${personalKey()}` } },
  );
  if (!current.id) throw new Error("Could not resolve PostHog project ID from /api/projects/@current/");
  return String(current.id);
}

async function runQuery(sql: string): Promise<PostHogQueryResponse> {
  const id = await projectId();
  return requestJson<PostHogQueryResponse>(`${appHost()}/api/projects/${id}/query/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${personalKey()}`,
    },
    body: JSON.stringify({
      query: {
        kind: "HogQLQuery",
        query: sql,
      },
      name: "notfair local posthog query",
    }),
  });
}

function parseArgs(): string {
  const sqlFlag = process.argv.indexOf("--sql");
  if (sqlFlag !== -1) {
    const sql = process.argv.slice(sqlFlag + 1).join(" ").trim();
    if (!sql) throw new Error("Usage: pnpm exec tsx scripts/posthog-query.ts --sql \"select ...\"");
    return sql;
  }

  return `
    select
      event,
      count() as events
    from events
    where timestamp >= now() - interval 24 hour
    group by event
    order by events desc
    limit 10
  `;
}

async function main() {
  const response = await runQuery(parseArgs());
  if (response.error) throw new Error(response.error);
  console.log(JSON.stringify({ columns: response.columns, results: response.results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

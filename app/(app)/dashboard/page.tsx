import { getDashboardData } from "./actions";
import { DashboardContent } from "./dashboard-content";

export default async function DashboardPage() {
  let data;
  let error: string | null = null;

  try {
    data = await getDashboardData();
  } catch (err) {
    // If redirect to /connect, Next.js handles it
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    error = err instanceof Error ? err.message : "Failed to load dashboard data";
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-[#1A1917]">
        <div className="text-center">
          <div className="text-[14px] text-[#C45D4A]">{error ?? "Unable to load dashboard"}</div>
          <a
            href="/dashboard"
            className="mt-3 inline-block text-[13px] text-[#4CAF6E] hover:underline"
          >
            Retry
          </a>
        </div>
      </div>
    );
  }

  return <DashboardContent data={data} />;
}

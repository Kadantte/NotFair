import { UsageView } from './usage-view';

// The page renders the shell immediately; each section fetches itself in
// parallel via /api/dev/usage?section=…, so the fast queries paint while the
// slow per-interaction CTEs are still resolving. See usage-view.tsx.
export default function DevUsagePage() {
    return <UsageView />;
}

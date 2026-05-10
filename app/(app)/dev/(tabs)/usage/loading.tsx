import { UsageSkeleton } from './usage-skeleton';

// Rendered instantly during route transitions while the server prepares the
// page. Layout (DevNav) stays mounted; only this fills the body.
export default function UsageLoading() {
    return <UsageSkeleton />;
}

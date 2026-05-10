import { DevNav } from '../_components/dev-nav';

// DevNav lives in the route-group layout so it stays mounted across tab
// switches — only {children} swaps when navigating between /dev/customers,
// /dev/usage, etc. This is what makes tab navigation feel instant.
export default function DevTabsLayout({ children }: { children: React.ReactNode }) {
    return (
        <section className="flex min-h-0 h-full flex-col overflow-hidden">
            <DevNav />
            {children}
        </section>
    );
}

// Low-fidelity placeholder used during route transitions (loading.tsx) and
// while the server-side data fetch streams in (Suspense fallback).
// Mirrors the real layout so the layout shift on swap-in stays minimal.
export function UsageSkeleton() {
    return (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-6 space-y-5 sm:space-y-8">
            <div className="flex items-center justify-end">
                <div className="h-8 w-20 rounded-md bg-[#24231F] border border-[#3D3C36] animate-pulse" />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-7 w-24 rounded-full bg-[#24231F] border border-[#3D3C36] animate-pulse" />
                ))}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="border border-[#3D3C36] rounded-lg bg-[#24231F] px-4 py-3 animate-pulse">
                        <div className="h-3 w-20 bg-[#3D3C36]/60 rounded mb-2" />
                        <div className="h-7 w-24 bg-[#3D3C36]/80 rounded mb-1.5" />
                        <div className="h-3 w-16 bg-[#3D3C36]/40 rounded" />
                    </div>
                ))}
            </div>

            <div className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 h-72 animate-pulse" />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {[...Array(2)].map((_, i) => (
                    <div key={i} className="border border-[#3D3C36] rounded-xl bg-[#24231F]/40 h-96 animate-pulse" />
                ))}
            </div>
        </div>
    );
}

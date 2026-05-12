'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TAB_ORDER, tabFromPathname } from './dev-utils';

export function DevNav() {
    const pathname = usePathname();
    const activeTab = tabFromPathname(pathname);

    return (
        <header className="shrink-0 border-b border-[#3D3C36] bg-[#24231F]/80 backdrop-blur-xl">
            <div className="flex gap-0 px-2 sm:px-6 border-t border-[#3D3C36]/50">
                {TAB_ORDER.map((tab) => (
                    <Link
                        key={tab}
                        href={`/dev/${tab}`}
                        prefetch
                        className={`flex-1 px-2 py-2 text-[12px] font-medium capitalize transition-colors border-b-2 -mb-px text-center sm:flex-none sm:px-4 sm:py-2.5 sm:text-[13px] ${
                            activeTab === tab
                                ? 'border-[#4CAF6E] text-[#E8E4DD]'
                                : 'border-transparent text-[#C4C0B6] hover:text-[#E8E4DD]'
                        }`}
                    >
                        {tab === 'developer' ? <><span className="sm:hidden">Options</span><span className="hidden sm:inline">Developer Options</span></> : tab}
                    </Link>
                ))}
            </div>
        </header>
    );
}

'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/sign-out-button';

export default function ToolsPage() {
    return (
        <main className="min-h-screen bg-[#1A1917] text-[#E8E4DD] font-sans selection:bg-[#4CAF6E]/30">
            <div className="container mx-auto px-4 py-8 max-w-5xl">
                <header className="flex items-center justify-between mb-12">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <Button variant="ghost" size="icon" className="hover:bg-[#2E2D28] text-[#9B9689] hover:text-[#E8E4DD] rounded-md">
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Tools</h1>
                        </div>
                    </div>
                    <SignOutButton />
                </header>
            </div>
        </main>
    );
}

"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export function SignOutButton({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const router = useRouter();

  async function handleSignOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Sign-out failed — still redirect to clear client state
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      onClick={handleSignOut}
      title="Sign out"
      className={`h-12 rounded-lg px-3 text-[#9B9689] transition-all duration-300 ease-out hover:bg-[#E8E4DD]/6 hover:text-[#E8E4DD] ${
        isCollapsed
          ? "w-12 justify-center gap-0 px-0"
          : "w-full justify-start"
      }`}
    >
      <LogOut className="h-5 w-5" />
      <span
        className={`overflow-hidden whitespace-nowrap text-[15px] transition-all duration-300 ease-out ${
          isCollapsed ? "max-w-0 opacity-0" : "ml-4 max-w-32 opacity-100"
        }`}
      >
        Sign out
      </span>
    </Button>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ChatRedirect() {
  const router = useRouter();

  useEffect(() => {
    const newId = crypto.randomUUID();
    router.replace(`/chat/${newId}`);
  }, [router]);

  return null;
}

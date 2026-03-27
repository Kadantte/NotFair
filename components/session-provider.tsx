"use client";

import { createContext, useContext } from "react";
import type { Session } from "@/lib/session";

const SessionContext = createContext<Session>({ connected: false });

export function SessionProvider({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

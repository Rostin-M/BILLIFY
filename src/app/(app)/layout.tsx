import { type ReactNode } from "react";

import { auth } from "~/server/auth";
import { loadActiveUser } from "~/server/auth/currentUser";
import { AppHeader } from "~/app/_components/AppHeader";
import { NavShell } from "~/app/_components/NavShell";
import { BottomNav } from "~/app/_components/BottomNav";
import { SessionExpiryGuard } from "~/app/_components/SessionExpiryGuard";
import { hasOpenCashRegister } from "~/app/_components/sessionExpiryActions";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Revalida contra la BD: rol fresco, usuario activo y sesión vigente (24 h).
  const user = await loadActiveUser(await auth());

  if (!user) {
    return (
      <>
        <AppHeader />
        {children}
      </>
    );
  }

  const hasOpenRegister = await hasOpenCashRegister();

  return (
    <>
      <AppHeader />
      <SessionExpiryGuard
        key={user.sessionExpiresAt}
        expiresAt={user.sessionExpiresAt}
        serverNow={Date.now()}
        initialHasOpenRegister={hasOpenRegister}
      />
      <NavShell role={user.role}>
        {children}
      </NavShell>
      <BottomNav role={user.role} />
    </>
  );
}

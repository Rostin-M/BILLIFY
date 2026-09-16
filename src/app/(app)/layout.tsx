import { type ReactNode } from "react";

import { auth } from "~/server/auth";
import { AppHeader } from "~/app/_components/AppHeader";
import { NavShell } from "~/app/_components/NavShell";
import { BottomNav } from "~/app/_components/BottomNav";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await auth();
  const role = session?.user?.role;

  if (role !== "OWNER" && role !== "CASHIER") {
    return (
      <>
        <AppHeader />
        {children}
      </>
    );
  }

  return (
    <>
      <AppHeader />
      <NavShell role={role}>
        {children}
      </NavShell>
      <BottomNav role={role} />
    </>
  );
}

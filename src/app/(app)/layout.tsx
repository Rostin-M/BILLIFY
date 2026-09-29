import { type ReactNode } from "react";

import { auth } from "~/server/auth";
import { loadActiveUser } from "~/server/auth/currentUser";
import { AppHeader } from "~/app/_components/AppHeader";
import { NavShell } from "~/app/_components/NavShell";
import { BottomNav } from "~/app/_components/BottomNav";
import { SessionExpiryGuard } from "~/app/_components/SessionExpiryGuard";
import { SubscriptionBanner } from "~/app/_components/subscription/SubscriptionBanner";
import { hasOpenCashRegister } from "~/app/_components/sessionExpiryActions";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Revalida contra la BD: rol fresco, usuario activo y sesión vigente (24 h).
  const user = await loadActiveUser(await auth());

  // Sin sesión el middleware solo deja pasar "/" dentro de este grupo, que ahora
  // es la landing pública: trae su propio header (anclas, CTA, menú móvil), así
  // que aquí no se monta el AppHeader de la app para no duplicar cabeceras.
  if (!user) return <>{children}</>;

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
        {/* Aviso de prueba, vencimiento o solo lectura (propietario y cajero). */}
        {user.businessId && !user.mustChangePassword && <SubscriptionBanner />}
        {children}
      </NavShell>
      <BottomNav role={user.role} />
    </>
  );
}

import { type ReactNode } from "react";

import { auth } from "~/server/auth";
import { loadActiveUser } from "~/server/auth/currentUser";
import { ActivityBar } from "~/app/_components/ActivityBar";
import { AppHeader } from "~/app/_components/AppHeader";
import { ConnectionBanner } from "~/app/_components/ConnectionBanner";
import { NavShell } from "~/app/_components/NavShell";
import { BottomNav } from "~/app/_components/BottomNav";
import { SessionExpiryGuard } from "~/app/_components/SessionExpiryGuard";
import { SubscriptionBanner } from "~/app/_components/subscription/SubscriptionBanner";
import { hasOpenCashRegister } from "~/app/_components/sessionExpiryActions";

export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Revalida contra la BD: rol fresco, usuario activo y sesión vigente (24 h).
  const user = await loadActiveUser(await auth());

  // Sin sesión el middleware solo deja pasar "/" dentro de este grupo, que es
  // la landing pública: trae su propio header (anclas, CTA, menú móvil), así
  // que aquí no se monta el AppHeader de la app para no duplicar cabeceras.
  if (!user) return <>{children}</>;

  // El administrador de la plataforma no usa la app de negocio: no se monta su
  // shell (menú, caja, aviso de suscripción); las páginas lo envían a /admin.
  if (user.role === "SUPERADMIN") return <>{children}</>;

  const hasOpenRegister = await hasOpenCashRegister();

  return (
    <>
      {/* Primer elemento enfocable: con teclado se salta el menú y se va directo al contenido. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-violet-700 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Saltar al contenido
      </a>
      <AppHeader />
      <ActivityBar />
      <SessionExpiryGuard
        key={user.sessionExpiresAt}
        expiresAt={user.sessionExpiresAt}
        serverNow={Date.now()}
        initialHasOpenRegister={hasOpenRegister}
      />
      <NavShell role={user.role}>
        {/* Aviso de prueba, vencimiento o solo lectura (propietario y cajero). */}
        {user.businessId && !user.mustChangePassword && <SubscriptionBanner />}
        <ConnectionBanner />
        {children}
      </NavShell>
      <BottomNav role={user.role} />
    </>
  );
}

import "./admin.css";

import { type Metadata } from "next";
import { type ReactNode } from "react";

import { requirePlatformAdminPage } from "~/server/auth/platformAdmin";

import { AdminChrome } from "./_screens/AdminChrome";

export const metadata: Metadata = {
  title: "Plataforma | BILLIFY",
  robots: { index: false, follow: false },
};

/**
 * Panel de administración de la plataforma. Grupo de rutas propio: no monta el
 * armazón de la app de negocio (cabecera violeta, menú, banner de suscripción).
 */
export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Solo el dueño de la plataforma (rol SUPERADMIN); redirige si no lo es.
  const admin = await requirePlatformAdminPage();

  return (
    <AdminChrome adminName={admin.name ?? admin.email} sessionExpiresAt={admin.sessionExpiresAt} serverNow={Date.now()}>
      {children}
    </AdminChrome>
  );
}

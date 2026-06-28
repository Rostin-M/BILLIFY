import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { BusinessSettings } from "./_components/BusinessSettings";
import { PageLayout } from "~/app/_components/PageLayout";

export const metadata = { title: "Configuración — BILLIFY" };

export default async function ConfiguracionPage() {
  const session = await auth();

  if (!session?.user) redirect("/auth/login");
  if (session.user.role !== "OWNER") redirect("/");

  void api.business.getSettings.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto max-w-2xl">
          <PageLayout
            title="Configuración del negocio"
            subtitle="Datos generales e impuestos aplicables en tus ventas."
          />
          <BusinessSettings />
        </div>
      </main>
    </HydrateClient>
  );
}

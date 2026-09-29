import { requirePageUser } from "~/server/auth/requirePageUser";
import { api, HydrateClient } from "~/trpc/server";
import { BusinessSettings } from "./_components/BusinessSettings";
import { PageLayout } from "~/app/_components/PageLayout";

export const metadata = { title: "Configuración — BILLIFY" };

export default async function ConfiguracionPage() {
  await requirePageUser({ roles: ["OWNER"] });

  void api.business.getSettings.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto max-w-5xl">
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

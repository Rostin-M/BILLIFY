import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { TrazabilidadClient } from "./_components/TrazabilidadClient";
import { PageLayout } from "~/app/_components/PageLayout";

export default async function TrazabilidadPage() {
  const session = await auth();

  if (!session?.user) redirect("/auth/login");
  if (!session.user.businessId) redirect("/");
  if (session.user.role !== "OWNER") redirect("/");

  void api.auditLog.list.prefetch({ limit: 100 });

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
          <PageLayout title="Trazabilidad" subtitle="Exportar datos y auditoría de operaciones" />
          <TrazabilidadClient />
        </div>
      </main>
    </HydrateClient>
  );
}

import { redirect } from "next/navigation";

import { requirePageUser } from "~/server/auth/requirePageUser";
import { db } from "~/server/db";
import { requireSubscription } from "~/server/subscription/service";
import { planHasFeature } from "~/lib/subscription/catalog";
import { api, HydrateClient } from "~/trpc/server";
import { TrazabilidadClient } from "./_components/TrazabilidadClient";
import { PageLayout } from "~/app/_components/PageLayout";

export default async function TrazabilidadPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ tab?: string | string[] }> }>) {
  const user = await requirePageUser({ roles: ["OWNER"] });
  if (!user.businessId) redirect("/");

  const [{ tab }, subscription] = await Promise.all([searchParams, requireSubscription(db, user.businessId)]);
  const plan = subscription.billing.plan;
  const canAudit = planHasFeature(plan, "audit");
  const canExport = planHasFeature(plan, "exports");

  // Sin la función en el plan el servidor responde FORBIDDEN: no se consulta.
  if (canAudit) void api.auditLog.list.prefetch({ limit: 100 });

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
          <PageLayout title="Trazabilidad" subtitle="Exportar datos y auditoría de operaciones" />
          <TrazabilidadClient
            canAudit={canAudit}
            canExport={canExport}
            initialTab={tab === "exportar" ? "exportar" : "registro"}
          />
        </div>
      </main>
    </HydrateClient>
  );
}

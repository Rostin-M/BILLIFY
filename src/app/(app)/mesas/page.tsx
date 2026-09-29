import { redirect } from "next/navigation";

import { requirePageUser } from "~/server/auth/requirePageUser";
import { db } from "~/server/db";
import { api, HydrateClient } from "~/trpc/server";
import { MesasClient } from "./_components/MesasClient";
import { MesasReadOnly } from "./_components/MesasReadOnly";
import { requireSubscription } from "~/server/subscription/service";
import { PageLayout } from "~/app/_components/PageLayout";

export default async function MesasPage() {
  const user = await requirePageUser();
  if (!user.businessId) redirect("/");

  const [business, subscription] = await Promise.all([
    db.business.findUnique({
      where: { id: user.businessId },
      select: { name: true, document: true, logoUrl: true },
    }),
    requireSubscription(db, user.businessId),
  ]);
  const businessInfo = {
    name: business?.name ?? "",
    document: business?.document ?? "",
    logoUrl: business?.logoUrl ?? null,
  };

  void api.tableSession.listActive.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <PageLayout title="Mesas" subtitle="Gestión de consumo en sitio por mesa" />
          {subscription.access.mode === "READ_ONLY" ? (
            <MesasReadOnly
              business={businessInfo}
              isOwner={user.role === "OWNER"}
              plan={subscription.billing.plan}
            />
          ) : (
            <MesasClient business={businessInfo} />
          )}
        </div>
      </main>
    </HydrateClient>
  );
}

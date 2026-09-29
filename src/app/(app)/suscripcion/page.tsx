import { redirect } from "next/navigation";

import { requirePageUser } from "~/server/auth/requirePageUser";
import { api, HydrateClient } from "~/trpc/server";
import { PageLayout } from "~/app/_components/PageLayout";
import { SubscriptionClient } from "./_components/SubscriptionClient";

export const metadata = { title: "Suscripción — BILLIFY" };

export default async function SuscripcionPage() {
  // Cajeros también entran: ven el estado y el aviso para el propietario.
  const user = await requirePageUser();
  if (!user.businessId) redirect("/");

  const isOwner = user.role === "OWNER";
  void api.billing.status.prefetch();
  if (isOwner) void api.billing.payments.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto max-w-5xl">
          <PageLayout
            title="Suscripción"
            subtitle={isOwner ? "Tu plan, lo que llevas usado y tus pagos." : "Estado del plan de tu negocio."}
          />
          <SubscriptionClient />
        </div>
      </main>
    </HydrateClient>
  );
}

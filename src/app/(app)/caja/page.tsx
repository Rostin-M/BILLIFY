import { redirect } from "next/navigation";

import { requirePageUser } from "~/server/auth/requirePageUser";
import { db } from "~/server/db";
import { api, HydrateClient } from "~/trpc/server";
import { CashRegisterView } from "./_components/CashRegisterView";
import { CashHistory } from "./_components/CashHistory";
import { PageLayout } from "~/app/_components/PageLayout";

export default async function CajaPage() {
  const user = await requirePageUser();
  if (!user.businessId) redirect("/");

  const isOwner = user.role === "OWNER";

  const business = await db.business.findUnique({
    where: { id: user.businessId },
    select: { name: true, document: true, logoUrl: true },
  });

  // Se espera la precarga: así el HTML del servidor ya trae los datos y coincide con el del
  // cliente (con `void`, a veces llegaban antes de hidratar y React marcaba error de hidratación).
  await Promise.all([
    api.cashRegister.getActive.prefetch(),
    isOwner ? api.cashRegister.listHistory.prefetch() : null,
  ]);

  const businessInfo = {
    name: business?.name ?? "",
    document: business?.document ?? "",
    logoUrl: business?.logoUrl ?? null,
  };

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 lg:max-w-6xl">
          <PageLayout title="Caja" subtitle="Apertura, cierre y movimientos de caja" />
          <CashRegisterView isOwner={isOwner} business={businessInfo} />
          {isOwner && <CashHistory business={businessInfo} />}
        </div>
      </main>
    </HydrateClient>
  );
}

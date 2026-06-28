import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { HydrateClient } from "~/trpc/server";
import { api } from "~/trpc/server";
import { VentasClient } from "./_components/VentasClient";
import { PageLayout } from "~/app/_components/PageLayout";

export default async function VentasPage() {
  const session = await auth();

  if (!session?.user) redirect("/auth/login");
  if (!session.user.businessId) redirect("/");

  const [business, activeRegister] = await Promise.all([
    db.business.findUnique({
      where: { id: session.user.businessId },
      select: { name: true, document: true, address: true, phone: true, taxes: true, autoTax: true, logoUrl: true },
    }),
    db.cashRegister.findFirst({
      where: { businessId: session.user.businessId, status: "OPEN" },
      select: { id: true },
    }),
  ]);

  void api.product.search.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <PageLayout title="Punto de venta" />

          {!activeRegister ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-10 text-center dark:border-amber-500/30 dark:bg-amber-900/10">
              <p className="text-5xl">🔒</p>
              <p className="mt-4 text-xl font-bold text-amber-800 dark:text-amber-300">
                Caja cerrada
              </p>
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                Debes abrir la caja antes de registrar ventas.
              </p>
              <Link
                href="/caja"
                className="mt-6 inline-block rounded-xl bg-amber-600 px-8 py-3 text-sm font-bold text-white transition hover:bg-amber-500"
              >
                Ir a caja y abrir
              </Link>
            </div>
          ) : (
            <VentasClient
              taxes={(business?.taxes as { name: string; rate: number; enabled: boolean }[]) ?? []}
              autoTax={business?.autoTax ?? false}
              isOwner={session.user.role === "OWNER"}
              userName={session.user.name ?? null}
              business={{
                name: business?.name ?? "",
                document: business?.document ?? "",
                address: business?.address ?? null,
                phone: business?.phone ?? null,
                logoUrl: business?.logoUrl ?? null,
              }}
            />
          )}
        </div>
      </main>
    </HydrateClient>
  );
}

import { requirePageUser } from "~/server/auth/requirePageUser";
import { api, HydrateClient } from "~/trpc/server";
import { CustomerManager } from "./_components/CustomerManager";
import { PageLayout } from "~/app/_components/PageLayout";

export default async function ClientesPage() {
  await requirePageUser({ roles: ["OWNER"] });

  // Se espera la precarga: así el HTML del servidor ya trae los datos y coincide con el del
  // cliente (con `void`, a veces llegaban antes de hidratar y React marcaba error de hidratación).
  await api.customer.list.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <PageLayout title="Clientes" subtitle="Registros e historial de compras" />
          <CustomerManager />
        </div>
      </main>
    </HydrateClient>
  );
}

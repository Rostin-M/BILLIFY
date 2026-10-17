import { requirePageUser } from "~/server/auth/requirePageUser";
import { api, HydrateClient } from "~/trpc/server";
import { EmployeeManager } from "./_components/EmployeeManager";
import { PageLayout } from "~/app/_components/PageLayout";

export const metadata = { title: "Empleados — BILLIFY" };

export default async function EmpleadosPage() {
  await requirePageUser({ roles: ["OWNER"] });

  // Se espera la precarga: así el HTML del servidor ya trae los datos y coincide con el del
  // cliente (con `void`, a veces llegaban antes de hidratar y React marcaba error de hidratación).
  await api.user.list.prefetch();

  return (
    <HydrateClient>
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="mx-auto max-w-2xl">
          <PageLayout
            title="Gestión de empleados"
            subtitle="Administra las cuentas de cajeros de tu negocio."
          />
          <EmployeeManager />
        </div>
      </main>
    </HydrateClient>
  );
}

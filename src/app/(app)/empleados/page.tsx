import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";
import { EmployeeManager } from "./_components/EmployeeManager";
import { PageLayout } from "~/app/_components/PageLayout";

export const metadata = { title: "Empleados — BILLIFY" };

export default async function EmpleadosPage() {
  const session = await auth();

  if (!session?.user) redirect("/auth/login");
  if (session.user.role !== "OWNER") redirect("/");

  void api.user.list.prefetch();

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

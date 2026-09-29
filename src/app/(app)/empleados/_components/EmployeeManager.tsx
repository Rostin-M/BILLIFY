"use client";

import { type ChangeEvent, useState } from "react";
import { toast } from "sonner";
import { Check, UserCog } from "lucide-react";

import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import { SkeletonListRows } from "~/app/_components/Skeletons";

type CreateForm = {
  name: string;
  document: string;
  email: string;
  password: string;
};

const emptyForm: CreateForm = { name: "", document: "", email: "", password: "" };

type TempCredential = { name: string; email: string; password: string };

export function EmployeeManager() {
  const utils = api.useUtils();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  // Contraseña temporal generada por el servidor: se muestra una sola vez
  const [tempCredential, setTempCredential] = useState<TempCredential | null>(null);

  const { data: employees, isPending: loadingList } = api.user.list.useQuery();

  const createEmployee = api.user.createEmployee.useMutation({
    onSuccess: async (data, variables) => {
      toast.success(data.message);
      setTempCredential(
        data.temporaryPassword
          ? { name: variables.name, email: variables.email, password: data.temporaryPassword }
          : null,
      );
      setForm(emptyForm);
      setShowForm(false);
      await utils.user.list.invalidate();
    },
  });

  const resetPassword = api.user.resetEmployeePassword.useMutation({
    onSuccess: async (data, variables) => {
      toast.success(data.message);
      const emp = employees?.find((e) => e.id === variables.employeeId);
      setTempCredential({
        name: emp?.name ?? "Empleado",
        email: emp?.email ?? "",
        password: data.temporaryPassword,
      });
      await utils.user.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const setActive = api.user.setActive.useMutation({
    onSuccess: async () => {
      await utils.user.list.invalidate();
    },
  });

  const setCashManagement = api.user.setCashManagement.useMutation({
    onSuccess: async () => {
      await utils.user.list.invalidate();
    },
  });

  const handleChange =
    (field: keyof CreateForm) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTempCredential(null);
    createEmployee.mutate(form);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Cajeros registrados</h2>
          <button
            onClick={() => {
              setShowForm((v) => !v);
              createEmployee.reset();
            }}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-500"
          >
            {showForm ? "Cancelar" : "+ Nuevo empleado"}
          </button>
        </div>

        {tempCredential && (
          <div className="mb-5 space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <p className="font-semibold">Contraseña temporal de {tempCredential.name}</p>
            {tempCredential.email && (
              <p className="text-xs text-amber-800 dark:text-amber-200">{tempCredential.email}</p>
            )}
            <p className="select-all rounded-lg bg-white px-3 py-2 text-center font-mono text-lg font-bold tracking-wider text-slate-900 dark:bg-slate-900 dark:text-white">
              {tempCredential.password}
            </p>
            <p className="text-xs">
              Entrégala al empleado en persona. Solo se muestra esta vez y no se envía por correo;
              deberá cambiarla al ingresar.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(tempCredential.password)
                    .then(() => toast.success("Contraseña copiada"))
                    .catch(() => null);
                }}
                className="rounded-lg border border-amber-400 px-3 py-1 text-xs font-medium hover:bg-amber-100 dark:border-amber-500/50 dark:hover:bg-amber-500/20"
              >
                Copiar
              </button>
              <button
                type="button"
                onClick={() => setTempCredential(null)}
                className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500"
              >
                Listo, ya la entregué
              </button>
            </div>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mb-5 space-y-3 border-b border-slate-200 pb-5 dark:border-white/10"
          >
            <h3 className="text-sm font-medium text-slate-600 dark:text-slate-300">
              Crear nuevo cajero
            </h3>

            <label className="block space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">Nombre completo</span>
              <input
                required
                value={form.name}
                onChange={handleChange("name")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                placeholder="Nombre y apellido"
              />
            </label>

            <label className="block space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">Cédula</span>
              <input
                required
                value={form.document}
                onChange={handleChange("document")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                placeholder="Número de cédula"
              />
            </label>

            <label className="block space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">Correo electrónico</span>
              <input
                required
                type="email"
                value={form.email}
                onChange={handleChange("email")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                placeholder="cajero@negocio.com"
              />
            </label>

            <label className="block space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-300">
                Contraseña temporal <span className="text-slate-400">(opcional)</span>
              </span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                value={form.password}
                onChange={handleChange("password")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                placeholder="Déjala vacía para generar una segura"
              />
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Mínimo 10 caracteres con letras y números. No se envía por correo: el empleado
                deberá cambiarla al ingresar.
              </span>
            </label>

            {createEmployee.error && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                {createEmployee.error.message}
              </p>
            )}

            <button
              type="submit"
              disabled={createEmployee.isPending}
              className="w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createEmployee.isPending ? "Creando..." : "Crear cajero"}
            </button>
          </form>
        )}

        {loadingList && <SkeletonListRows count={3} />}
        {!loadingList && employees?.length === 0 && (
          <EmptyState
            icon={UserCog}
            title="Sin cajeros registrados"
            description="Crea una cuenta de cajero para tu equipo de trabajo."
            onAction={{ label: "+ Nuevo empleado", onClick: () => setShowForm(true) }}
          />
        )}
        {!loadingList && employees && employees.length > 0 && (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {employees?.map((emp) => (
              <li
                key={emp.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{emp.name}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{emp.email}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end items-center gap-2">
                  <button
                    onClick={() => {
                      if (
                        window.confirm(
                          `¿Restablecer la contraseña de ${emp.name ?? "este empleado"}? Se cerrarán sus sesiones y deberá cambiarla al ingresar.`,
                        )
                      ) {
                        resetPassword.mutate({ employeeId: emp.id });
                      }
                    }}
                    disabled={resetPassword.isPending}
                    title="Generar una contraseña temporal nueva"
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-amber-100 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white/10 dark:text-slate-300 dark:hover:bg-amber-500/20 dark:hover:text-amber-300"
                  >
                    {emp.mustChangePassword ? "Clave temporal" : "Restablecer clave"}
                  </button>
                  <button
                    onClick={() =>
                      setCashManagement.mutate({
                        employeeId: emp.id,
                        canManageCash: !emp.canManageCash,
                      })
                    }
                    disabled={setCashManagement.isPending}
                    title={emp.canManageCash ? "Puede gestionar caja — clic para revocar" : "Sin acceso a caja — clic para permitir"}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      emp.canManageCash
                        ? "bg-violet-100 text-violet-700 hover:bg-slate-100 hover:text-slate-600 dark:bg-violet-500/20 dark:text-violet-300 dark:hover:bg-white/10 dark:hover:text-slate-300"
                        : "bg-slate-100 text-slate-500 hover:bg-violet-100 hover:text-violet-700 dark:bg-white/10 dark:text-slate-400 dark:hover:bg-violet-500/20 dark:hover:text-violet-300"
                    }`}
                  >
                    {emp.canManageCash ? (
                      <>
                        <Check className="h-3 w-3" /> Caja
                      </>
                    ) : (
                      "Sin caja"
                    )}
                  </button>
                  <button
                    onClick={() =>
                      setActive.mutate({
                        employeeId: emp.id,
                        isActive: !emp.isActive,
                      })
                    }
                    disabled={setActive.isPending}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      emp.isActive
                        ? "bg-emerald-100 text-emerald-700 hover:bg-red-100 hover:text-red-700 dark:bg-emerald-500/20 dark:text-emerald-300 dark:hover:bg-red-500/20 dark:hover:text-red-300"
                        : "bg-red-100 text-red-700 hover:bg-emerald-100 hover:text-emerald-700 dark:bg-red-500/20 dark:text-red-300 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-300"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {emp.isActive ? "Activo" : "Inactivo"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

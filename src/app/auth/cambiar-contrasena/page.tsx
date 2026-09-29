"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";

import { Logo } from "~/app/_components/Logo";
import { ThemeToggle } from "~/app/_components/ThemeToggle";
import { signOutAndClear } from "~/lib/clientSignOut";
import { api } from "~/trpc/react";

import { friendlyError } from "../_lib/errors";

const inputClassName =
  "w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 transition placeholder:text-slate-600 focus:ring-2";

// Cambio de contraseña obligatorio (contraseña temporal) o voluntario.
// Al terminar, el servidor invalida todas las sesiones: se cierra la sesión
// y el usuario vuelve a ingresar con la nueva contraseña.
export default function CambiarContrasenaPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const changePassword = api.auth.changePassword.useMutation({
    onSuccess: async () => {
      setSigningOut(true);
      await signOutAndClear("/auth/login?pwchanged=1");
    },
    onError: (err) => setClientError(friendlyError(err)),
  });

  const busy = changePassword.isPending || signingOut;

  let submitLabel = "Actualizar contraseña";
  if (signingOut) submitLabel = "Cerrando sesión...";
  else if (changePassword.isPending) submitLabel = "Actualizando...";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size="lg" className="logo-glow" />
        <h1 className="mt-3 text-[2rem] font-bold tracking-[0.25em] text-white">BILLIFY</h1>
      </div>

      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-sm">
        <header className="mb-5 space-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <KeyRound className="h-5 w-5 text-blue-400" />
            Cambiar contraseña
          </h2>
          <p className="text-sm text-slate-400">
            Por seguridad debes definir una contraseña nueva antes de continuar. Si te dieron una
            contraseña temporal, ingrésala como contraseña actual.
          </p>
        </header>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setClientError(null);
            if (newPassword !== confirmPassword) {
              setClientError("Las contraseñas no coinciden.");
              return;
            }
            if (newPassword === currentPassword) {
              setClientError("La nueva contraseña debe ser diferente a la actual.");
              return;
            }
            changePassword.mutate({ currentPassword, newPassword });
          }}
        >
          <label className="block space-y-1 text-sm">
            <span className="text-slate-300">Contraseña actual (o temporal)</span>
            <input
              required
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputClassName}
              placeholder="Tu contraseña actual"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-slate-300">Nueva contraseña</span>
            <input
              required
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClassName}
              placeholder="Mínimo 10 caracteres con letras y números"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-slate-300">Confirmar nueva contraseña</span>
            <input
              required
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClassName}
              placeholder="Repite la nueva contraseña"
            />
          </label>

          {clientError && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {clientError}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitLabel}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-slate-500">
          <button
            type="button"
            disabled={busy}
            onClick={() => void signOutAndClear("/auth/login")}
            className="underline underline-offset-4 hover:text-slate-300 disabled:opacity-60"
          >
            Cerrar sesión
          </button>
        </div>
      </section>
    </main>
  );
}

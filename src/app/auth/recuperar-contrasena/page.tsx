"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";

import { Logo } from "~/app/_components/Logo";
import { ThemeToggle } from "~/app/_components/ThemeToggle";
import { api } from "~/trpc/react";

import { friendlyError } from "../_lib/errors";

type Step = "form" | "code" | "done";

export default function RecuperarContrasenaPage() {
  const [step, setStep] = useState<Step>("form");
  const [email, setEmail] = useState("");
  const [document, setDocument] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const forgotPassword = api.auth.forgotPassword.useMutation({
    onSuccess: () => setStep("code"),
  });

  const resetPassword = api.auth.resetPassword.useMutation({
    onSuccess: () => setStep("done"),
    onError: (err) => setClientError(friendlyError(err)),
  });

  if (step === "done") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
        <div className="space-y-3 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-400" />
          <p className="text-lg font-semibold text-emerald-400">
            Contraseña actualizada correctamente
          </p>
          <Link
            href="/auth/login"
            className="block text-sm text-blue-400 underline underline-offset-4 hover:text-blue-300"
          >
            Iniciar sesión
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size="lg" className="logo-glow" />
        <h1 className="mt-3 text-[2rem] font-bold tracking-[0.25em] text-white">
          BILLIFY
        </h1>
      </div>

      <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-sm">
        {step === "form" && (
          <>
            <header className="mb-5 space-y-1">
              <h2 className="text-lg font-semibold text-white">Recuperar contraseña</h2>
              <p className="text-sm text-slate-400">
                Ingresa tu correo y cédula para verificar tu identidad.
              </p>
            </header>

            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                forgotPassword.mutate({ email, document });
              }}
            >
              <label className="block space-y-1 text-sm">
                <span className="text-slate-300">Correo electrónico</span>
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 transition placeholder:text-slate-600 focus:ring-2"
                  placeholder="tu@negocio.com"
                />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="text-slate-300">Cédula</span>
                <input
                  required
                  value={document}
                  onChange={(e) => setDocument(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 transition placeholder:text-slate-600 focus:ring-2"
                  placeholder="Número de cédula"
                />
              </label>

              {forgotPassword.error && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {friendlyError(forgotPassword.error)}
                </p>
              )}

              <button
                type="submit"
                disabled={forgotPassword.isPending}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {forgotPassword.isPending ? "Verificando..." : "Continuar"}
              </button>
            </form>
          </>
        )}

        {step === "code" && (
          <>
            <header className="mb-5 space-y-1">
              <h2 className="text-lg font-semibold text-white">Nueva contraseña</h2>
              <p className="text-sm text-slate-400">
                Si los datos son correctos, enviamos un código a{" "}
                <span className="font-semibold text-slate-200">{email}</span>. Ingrésalo junto con tu
                nueva contraseña.
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
                resetPassword.mutate({ email, token: code, newPassword });
              }}
            >
              <label className="block space-y-1 text-sm">
                <span className="text-slate-300">Código de verificación</span>
                <input
                  required
                  maxLength={6}
                  minLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-3 text-center text-2xl font-bold tracking-[0.4em] text-white outline-none ring-blue-500 transition focus:ring-2"
                  placeholder="000000"
                />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="text-slate-300">Nueva contraseña</span>
                <input
                  required
                  type="password"
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 transition placeholder:text-slate-600 focus:ring-2"
                  placeholder="Mínimo 10 caracteres con letras y números"
                />
              </label>

              <label className="block space-y-1 text-sm">
                <span className="text-slate-300">Confirmar contraseña</span>
                <input
                  required
                  type="password"
                  minLength={10}
                  maxLength={128}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 transition placeholder:text-slate-600 focus:ring-2"
                  placeholder="Repite la contraseña"
                />
              </label>

              {clientError && (
                <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  {clientError}
                </p>
              )}

              <button
                type="submit"
                disabled={resetPassword.isPending || code.length !== 6}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resetPassword.isPending ? "Actualizando..." : "Actualizar contraseña"}
              </button>
            </form>
          </>
        )}

        <div className="mt-4 text-center text-sm text-slate-500">
          <Link
            href="/auth/login"
            className="underline underline-offset-4 hover:text-slate-300"
          >
            Volver al inicio de sesión
          </Link>
        </div>
      </section>
    </main>
  );
}

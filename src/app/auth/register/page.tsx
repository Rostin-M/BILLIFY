"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useState } from "react";

import { Logo } from "~/app/_components/Logo";
import { ThemeToggle } from "~/app/_components/ThemeToggle";
import { api } from "~/trpc/react";

type RegisterFormState = {
  businessName: string;
  businessDocument: string;
  ownerName: string;
  ownerDocument: string;
  ownerEmail: string;
  ownerPassword: string;
};

const initialFormState: RegisterFormState = {
  businessName: "",
  businessDocument: "",
  ownerName: "",
  ownerDocument: "",
  ownerEmail: "",
  ownerPassword: "",
};

function parseErrorMessage(rawMessage: string): string {
  try {
    const parsed = JSON.parse(rawMessage) as Array<{ message?: string }>;
    if (Array.isArray(parsed)) {
      const first = parsed.find((e) => e.message)?.message;
      if (first) return first;
    }
  } catch {
    // mensaje plano
  }
  return rawMessage;
}

type Step = "form" | "verify";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState<RegisterFormState>(initialFormState);
  const [step, setStep] = useState<Step>("form");
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [code, setCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const registerOwner = api.auth.registerOwner.useMutation({
    onSuccess: () => {
      setRegisteredEmail(form.ownerEmail);
      setStep("verify");
    },
  });

  const verifyEmail = api.auth.verifyEmail.useMutation({
    onSuccess: () => {
      setVerified(true);
      setTimeout(() => router.push("/auth/login?registered=true"), 2500);
    },
    onError: (err) => setVerifyError(parseErrorMessage(err.message)),
  });

  const resendCode = api.auth.resendVerificationCode.useMutation();

  const handleChange =
    (field: keyof RegisterFormState) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  if (verified) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="space-y-3 text-center">
          <div className="text-4xl">✓</div>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            ¡Cuenta verificada con éxito!
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Te redirigiremos al inicio de sesión...
          </p>
        </div>
      </main>
    );
  }

  if (step === "verify") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-900 dark:bg-slate-950 dark:text-white">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="mb-6 flex flex-col items-center gap-2">
          <Logo size="md" className="logo-glow" />
          <span className="text-sm font-bold tracking-[0.2em] text-slate-700 dark:text-slate-200">
            BILLIFY
          </span>
        </div>

        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-white/5">
          <header className="mb-6 space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Verifica tu correo</h1>
            <p className="text-sm text-slate-500 dark:text-slate-300">
              Te enviamos un código de 6 dígitos a{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {registeredEmail}
              </span>
              . Ingresa el código para activar tu cuenta.
            </p>
          </header>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setVerifyError(null);
              verifyEmail.mutate({ email: registeredEmail, code });
            }}
          >
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-200">Código de verificación</span>
              <input
                required
                maxLength={6}
                minLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-center text-2xl font-bold tracking-[0.4em] outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                placeholder="000000"
              />
            </label>

            {verifyError && (
              <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                {verifyError}
              </p>
            )}

            <button
              type="submit"
              disabled={verifyEmail.isPending || code.length !== 6}
              className="w-full rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verifyEmail.isPending ? "Verificando..." : "Verificar cuenta"}
            </button>
          </form>

          <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
            <p>
              ¿No llegó el correo?{" "}
              <button
                disabled={resendCode.isPending}
                onClick={() => resendCode.mutate({ email: registeredEmail })}
                className="font-medium text-violet-600 underline underline-offset-4 hover:text-violet-500 disabled:opacity-60 dark:text-violet-400"
              >
                {resendCode.isPending ? "Enviando..." : "Reenviar código"}
              </button>
            </p>
            {resendCode.isSuccess && (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                Código reenviado. Revisa tu bandeja de entrada.
              </p>
            )}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="mb-6 flex flex-col items-center gap-2">
        <Logo size="md" className="logo-glow" />
        <span className="text-sm font-bold tracking-[0.2em] text-slate-700 dark:text-slate-200">
          BILLIFY
        </span>
      </div>

      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-white/5">
        <header className="mb-6 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">
            Registro inicial de negocio
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Crea tu negocio y la cuenta propietaria para empezar a operar BILLIFY.
          </p>
        </header>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            registerOwner.mutate(form);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-200">Nombre del negocio</span>
              <input
                required
                value={form.businessName}
                onChange={handleChange("businessName")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                placeholder="Ej: Tienda La Esquina"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-200">Documento del negocio</span>
              <input
                required
                value={form.businessDocument}
                onChange={handleChange("businessDocument")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                placeholder="NIT / RUT / ID"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-200">Nombre del propietario</span>
              <input
                required
                value={form.ownerName}
                onChange={handleChange("ownerName")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                placeholder="Nombre y apellido"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-200">Cédula del propietario</span>
              <input
                required
                value={form.ownerDocument}
                onChange={handleChange("ownerDocument")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                placeholder="Número de cédula"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-200">Correo electrónico</span>
              <input
                required
                type="email"
                value={form.ownerEmail}
                onChange={handleChange("ownerEmail")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                placeholder="owner@negocio.com"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-700 dark:text-slate-200">Contraseña</span>
              <input
                required
                type="password"
                minLength={8}
                value={form.ownerPassword}
                onChange={handleChange("ownerPassword")}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-900"
                placeholder="Mínimo 8 caracteres con letras y números"
              />
            </label>
          </div>

          {registerOwner.error && (
            <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
              {parseErrorMessage(registerOwner.error.message)}
            </p>
          )}

          <button
            type="submit"
            disabled={registerOwner.isPending}
            className="w-full rounded-lg bg-violet-600 px-4 py-2 font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {registerOwner.isPending ? "Registrando..." : "Registrar negocio"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-slate-500 dark:text-slate-300">
          <Link href="/" className="underline underline-offset-4 hover:text-slate-900 dark:hover:text-white">
            Volver al inicio
          </Link>
        </div>
      </section>
    </main>
  );
}

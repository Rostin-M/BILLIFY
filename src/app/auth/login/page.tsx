"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { type ChangeEvent, Suspense, useState } from "react";

import { Logo } from "~/app/_components/Logo";
import { ThemeToggle } from "~/app/_components/ThemeToggle";

type LoginFormState = {
  email: string;
  password: string;
};

const initialFormState: LoginFormState = { email: "", password: "" };

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justRegistered = searchParams.get("registered") === "true";
  const sessionExpired = searchParams.get("expired") === "1";
  const passwordChanged = searchParams.get("pwchanged") === "1";

  const [form, setForm] = useState<LoginFormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleChange =
    (field: keyof LoginFormState) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      // Mensaje genérico: no distingue credenciales inválidas de cuenta bloqueada
      setError(
        "Correo o contraseña incorrectos, o cuenta bloqueada temporalmente por intentos fallidos. Si acabas de registrarte, verifica tu correo primero.",
      );
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      {/* ── Animación de entrada: águila + marca ── */}
      <div className="mb-8 flex flex-col items-center text-center">
        {/* Águila */}
        <div className="animate-eagle-in">
          <Logo size="lg" className="logo-glow" />
        </div>

        {/* Nombre */}
        <h1 className="animate-text-in mt-3 text-[2rem] font-bold tracking-[0.25em] text-white">
          BILLIFY
        </h1>

        {/* Copyright */}
        <p className="animate-copy-in mt-1 text-xs tracking-[0.05em] text-slate-500">
          © {new Date().getFullYear()} BILLIFY · Todos los derechos reservados
        </p>
        <p className="animate-copy-in mt-1 text-xs text-slate-500">
          <Link href="/legal/privacidad" className="underline underline-offset-2 hover:text-slate-300">
            Privacidad
          </Link>
          {" · "}
          <Link href="/legal/terminos" className="underline underline-offset-2 hover:text-slate-300">
            Términos
          </Link>
          {" · "}
          <Link href="/legal/cookies" className="underline underline-offset-2 hover:text-slate-300">
            Cookies
          </Link>
        </p>
      </div>

      {/* ── Formulario de login ── */}
      <section className="animate-form-in w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-sm">
        <header className="mb-5 space-y-1">
          <h2 className="text-lg font-semibold text-white">Iniciar sesión</h2>
          <p className="text-sm text-slate-400">
            Ingresa con tu cuenta para operar BILLIFY.
          </p>
        </header>

        {justRegistered && (
          <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            ¡Negocio registrado! Inicia sesión para comenzar.
          </p>
        )}

        {passwordChanged && (
          <p className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            Contraseña actualizada. Inicia sesión con tu nueva contraseña.
          </p>
        )}

        {sessionExpired && (
          <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            Tu sesión expiró por seguridad (24 h). Inicia sesión nuevamente.
          </p>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1 text-sm">
            <span className="text-slate-300">Correo electrónico</span>
            <input
              required
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange("email")}
              className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 transition placeholder:text-slate-600 focus:ring-2"
              placeholder="tu@negocio.com"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-slate-300">Contraseña</span>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={handleChange("password")}
              className="w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none ring-blue-500 transition placeholder:text-slate-600 focus:ring-2"
              placeholder="Tu contraseña"
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        <div className="mt-4 space-y-2 text-center text-sm text-slate-500">
          <p>
            <Link
              href="/auth/recuperar-contrasena"
              className="text-blue-400 underline underline-offset-4 hover:text-blue-300"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </p>
          <p>
            ¿No tienes cuenta?{" "}
            <Link
              href="/auth/register"
              className="text-blue-400 underline underline-offset-4 hover:text-blue-300"
            >
              Registrar negocio
            </Link>
          </p>
          <Link
            href="/"
            className="block underline underline-offset-4 hover:text-slate-300"
          >
            Volver al inicio
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

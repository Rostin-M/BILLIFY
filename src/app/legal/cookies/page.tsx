import type { Metadata } from "next";
import { Placeholder } from "../_components/Placeholder";

export const metadata: Metadata = { title: "Política de Cookies — BILLIFY" };

export default function CookiePolicyPage() {
  return (
    <>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Política de Cookies</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Última actualización: <Placeholder>[fecha de publicación]</Placeholder>
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">1. Qué son las cookies</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Las cookies son pequeños archivos que un sitio web guarda en tu navegador para recordar
          información entre visitas. También usamos <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-white/10">localStorage</code> del
          navegador, una tecnología similar que guarda datos únicamente en tu dispositivo.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. Qué usamos en BILLIFY</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Usamos exclusivamente cookies y almacenamiento{" "}
          <span className="font-medium text-slate-800 dark:text-slate-100">estrictamente necesarios</span>{" "}
          para que la plataforma funcione:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <li>
            <span className="font-medium text-slate-800 dark:text-slate-100">Cookie de sesión</span>{" "}
            (gestionada por NextAuth): te mantiene autenticado mientras usas BILLIFY. Se elimina al
            cerrar sesión o expirar.
          </li>
          <li>
            <span className="font-medium text-slate-800 dark:text-slate-100">localStorage funcional</span>:
            guarda en tu propio dispositivo un borrador de la venta en curso (carrito, método de
            pago) para que no lo pierdas si recargas la página. Nunca sale de tu navegador ni se
            comparte con terceros.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. Qué NO usamos</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          No usamos cookies de analítica, publicidad, redes sociales ni rastreo de terceros. No
          compartimos tu actividad en BILLIFY con ninguna plataforma de publicidad.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">4. Por qué no pedimos tu consentimiento</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Las cookies y el almacenamiento que usamos son estrictamente necesarios para que la
          plataforma funcione (mantener tu sesión iniciada) — no requieren autorización previa,
          solo esta divulgación. Si en el futuro incorporamos cookies de analítica o similares, te
          lo informaremos y solicitaremos tu consentimiento antes de activarlas.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">5. Cómo controlarlas</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Puedes eliminar las cookies y el localStorage desde la configuración de tu navegador en
          cualquier momento. Ten en cuenta que, al eliminar la cookie de sesión, se cerrará tu
          sesión en BILLIFY.
        </p>
      </section>
    </>
  );
}

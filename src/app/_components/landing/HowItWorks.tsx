import Link from "next/link";

import { REGISTER_HREF } from "./nav-links";

const STEPS = [
  {
    title: "Registra tu negocio",
    text: "Nombre, NIT y correo. Confirmas con un código y tu prueba de 7 días empieza.",
  },
  {
    title: "Carga tus productos",
    text: "Precio, categoría e impuesto. Si tienen código de barras, lo escaneas con la cámara.",
  },
  {
    title: "Abre la caja y vende",
    text: "Crea el usuario de cada cajero y empieza a cobrar desde el primer día.",
  },
] as const;

export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="como-title"
      className="border-y border-slate-200 bg-white py-20 lg:py-28 dark:border-white/10 dark:bg-slate-950/60"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2
          id="como-title"
          className="max-w-2xl text-3xl leading-tight font-extrabold tracking-[-0.025em] text-slate-950 sm:text-[2.5rem] dark:text-white"
        >
          Empiezas a vender hoy mismo.
        </h2>

        <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span
                aria-hidden="true"
                className="from-ala-violet to-ala-cyan block bg-gradient-to-br bg-clip-text pb-1 text-6xl leading-none font-extrabold tracking-tighter text-transparent"
              >
                {i + 1}
              </span>
              <h3 className="mt-4 text-xl font-bold tracking-tight text-slate-950 dark:text-white">
                {step.title}
              </h3>
              <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
                {step.text}
              </p>
            </li>
          ))}
        </ol>

        <Link
          href={REGISTER_HREF}
          className="bg-ala-violet mt-12 inline-block rounded-xl px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-violet-600"
        >
          Registrar mi negocio
        </Link>
      </div>
    </section>
  );
}

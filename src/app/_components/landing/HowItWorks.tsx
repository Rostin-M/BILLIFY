import Link from "next/link";

import { REGISTER_HREF } from "./nav-links";
import { cssVars } from "./style";

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
      className="py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2
          id="como-title"
          className="font-display max-w-2xl text-4xl leading-[1.02] font-extrabold tracking-[-0.035em] text-slate-950 sm:text-5xl dark:text-white"
        >
          Empiezas a vender hoy mismo.
        </h2>

        <div data-reveal className="relative mt-16">
          {/* Línea que une los pasos y se dibuja al aparecer */}
          <span
            aria-hidden="true"
            className="absolute top-7 bottom-7 left-7 w-0.5 bg-slate-200 md:top-7 md:right-[calc((100%-4rem)/3-1.75rem)] md:bottom-auto md:left-7 md:h-0.5 md:w-auto dark:bg-white/10"
          >
            <span className="step-line from-ala-violet via-ala-blue to-ala-cyan block h-full w-full bg-gradient-to-b md:bg-gradient-to-r" />
          </span>

          <ol className="relative grid gap-12 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative pl-20 md:pl-0">
                <span
                  aria-hidden="true"
                  style={cssVars({ "--i": i })}
                  className="step-dot font-display ring-ala-mist dark:ring-ala-night bg-ala-violet shadow-ala-violet/40 absolute top-0 left-0 inline-flex h-14 w-14 items-center justify-center rounded-2xl text-2xl font-extrabold text-white shadow-xl ring-8 md:relative"
                >
                  {i + 1}
                </span>
                <h3 className="font-display mt-0 text-2xl font-bold tracking-tight text-slate-950 md:mt-6 dark:text-white">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </div>

        <Link
          href={REGISTER_HREF}
          className="btn-shine bg-ala-violet hover:bg-ala-violet-hover mt-14 inline-block rounded-2xl px-7 py-4 text-base font-semibold text-white transition-colors"
        >
          Registrar mi negocio
        </Link>
      </div>
    </section>
  );
}

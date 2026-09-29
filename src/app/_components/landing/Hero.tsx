import Link from "next/link";

import { AppPreview } from "./AppPreview";
import { Facets } from "./Facets";
import { REGISTER_HREF } from "./nav-links";

export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <Facets className="pointer-events-none absolute -top-10 -right-24 h-[26rem] w-[40rem] [mask-image:linear-gradient(to_bottom_left,black_30%,transparent_75%)] opacity-[0.18] dark:opacity-40" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-12 pb-20 sm:px-6 sm:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-10 lg:pt-24 lg:pb-28">
        <div className="max-w-xl">
          <h1
            id="hero-title"
            className="text-[2.6rem] leading-[1.02] font-extrabold tracking-[-0.035em] text-slate-950 sm:text-6xl lg:text-[3.6rem] xl:text-[4.25rem] dark:text-white"
          >
            Deja el cuaderno.
            <br />
            Cobra en segundos.
          </h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-slate-600 dark:text-slate-300">
            BILLIFY es el punto de venta para cafeterías y negocios de comida en
            Colombia. Vendes por mesa, divides la cuenta, cierras la caja y
            llevas los fiados, aunque se caiga el internet.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href={REGISTER_HREF}
              className="bg-ala-violet rounded-xl px-6 py-3.5 text-center text-base font-semibold text-white shadow-lg shadow-violet-900/25 transition-colors hover:bg-violet-600"
            >
              Prueba gratis 7 días
            </Link>
            <a
              href="#funciones"
              className="rounded-xl border border-slate-300 px-6 py-3.5 text-center text-base font-semibold text-slate-800 transition-colors hover:border-slate-400 hover:bg-white dark:border-white/20 dark:text-white dark:hover:bg-white/5"
            >
              Ver qué hace
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            No necesitas equipos nuevos: funciona en tu celular, tablet o
            computador.
          </p>
        </div>

        <AppPreview />
      </div>
    </section>
  );
}

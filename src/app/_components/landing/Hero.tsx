import Link from "next/link";
import { CreditCard, Smartphone, WifiOff } from "lucide-react";

import { AppPreview } from "./AppPreview";
import { Facets } from "./Facets";
import { REGISTER_HREF } from "./nav-links";
import { cssVars } from "./style";

const PROMISES = [
  { icon: CreditCard, text: "Sin tarjeta" },
  { icon: WifiOff, text: "Vende sin internet" },
  { icon: Smartphone, text: "En tu celular, tablet o PC" },
] as const;

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      data-tilt
      className="relative overflow-hidden"
    >
      <div aria-hidden="true" className="aurora">
        <span />
        <span />
        <span />
      </div>
      <div
        aria-hidden="true"
        className="dot-grid pointer-events-none absolute inset-0"
      />
      <Facets className="pointer-events-none absolute -top-10 -right-24 h-[26rem] w-[40rem] [mask-image:linear-gradient(to_bottom_left,black_30%,transparent_75%)] opacity-[0.14] dark:opacity-30" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-16 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pt-20 lg:pb-24">
        <div className="max-w-xl">
          <h1
            id="hero-title"
            className="font-display text-[3rem] leading-[0.95] font-extrabold tracking-[-0.045em] text-slate-950 sm:text-7xl lg:text-[4.6rem] xl:text-[5.4rem] dark:text-white"
          >
            <span className="block overflow-hidden pb-[0.06em]">
              <span className="hero-line" style={cssVars({ "--i": 0 })}>
                Deja el{" "}
                <span className="relative inline-block">
                  cuaderno.
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 300 40"
                    preserveAspectRatio="none"
                    className="pointer-events-none absolute top-[48%] -left-[3%] h-[0.32em] w-[106%] overflow-visible"
                  >
                    <path
                      d="M4 26 C 60 14, 120 30, 180 18 S 270 12, 296 20"
                      pathLength={1}
                      fill="none"
                      stroke="var(--ala-pen)"
                      strokeWidth="7"
                      strokeLinecap="round"
                      className="pen-stroke"
                      style={cssVars({ "--delay": "1.05s" })}
                    />
                  </svg>
                </span>
              </span>
            </span>
            <span className="block overflow-hidden pb-[0.1em]">
              <span
                className="hero-line ala-gradient-text"
                style={cssVars({ "--i": 1 })}
              >
                Cobra en segundos.
              </span>
            </span>
          </h1>

          <p
            className="hero-fade mt-6 max-w-[34rem] text-lg leading-relaxed text-slate-600 sm:text-xl dark:text-slate-300"
            style={cssVars({ "--delay": "0.45s" })}
          >
            BILLIFY es el punto de venta para cafeterías y negocios de comida en
            Colombia. Vendes por mesa, divides la cuenta, cierras la caja y
            llevas los fiados, aunque se caiga el internet.
          </p>

          <div
            className="hero-fade mt-9 flex flex-col gap-3 sm:flex-row"
            style={cssVars({ "--delay": "0.6s" })}
          >
            <Link
              href={REGISTER_HREF}
              className="btn-shine bg-ala-violet hover:bg-ala-violet-hover shadow-ala-violet/30 rounded-2xl px-7 py-4 text-center text-base font-semibold text-white shadow-xl transition-colors"
            >
              Prueba gratis 7 días
            </Link>
            <a
              href="#funciones"
              className="rounded-2xl border border-slate-300 bg-white/60 px-7 py-4 text-center text-base font-semibold text-slate-800 backdrop-blur transition-colors hover:border-slate-400 hover:bg-white dark:border-white/20 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
            >
              Ver qué hace
            </a>
          </div>

          <ul
            className="hero-fade mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-slate-600 dark:text-slate-300"
            style={cssVars({ "--delay": "0.75s" })}
          >
            {PROMISES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2">
                <Icon
                  aria-hidden="true"
                  className="text-ala-blue dark:text-ala-cyan h-4 w-4"
                />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <AppPreview />
      </div>
    </section>
  );
}

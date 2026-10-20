import { ArrowDown, ArrowRight, Check } from "lucide-react";

import { cssVars } from "./style";

const PAIRS = [
  {
    before:
      "Sumas la cuenta de la mesa a mano y alguien se va sin pagar su parte.",
    after:
      "Cada comensal tiene su pedido y la cuenta se divide en un toque, cada grupo con su forma de pago.",
  },
  {
    before: "Al cierre la caja no cuadra y no sabes dónde se fue la plata.",
    after:
      "Abres el turno con saldo inicial, anotas entradas y salidas, y el cierre te muestra la diferencia.",
  },
  {
    before:
      "Los fiados están en una hoja que se pierde, se moja o nadie entiende.",
    after:
      "Cada cliente tiene su saldo y sus abonos, y el mismo abono no se registra dos veces.",
  },
  {
    before:
      "Te enteras de que se acabó el pandebono cuando el cliente lo pide.",
    after:
      "El inventario baja con cada venta y te avisa cuando un producto va quedando poco.",
  },
  {
    before: "Se cae el internet y la app que pagas te deja sin poder vender.",
    after:
      "Sigues vendiendo sin conexión; las ventas se envían solas cuando vuelve la señal.",
  },
] as const;

export function ProblemSolution() {
  return (
    <section
      aria-labelledby="problema-title"
      className="relative py-20 lg:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
          <h2
            id="problema-title"
            className="font-display max-w-2xl text-4xl leading-[1.02] font-extrabold tracking-[-0.035em] text-slate-950 sm:text-5xl dark:text-white"
          >
            Lo que hoy anotas a mano, BILLIFY lo lleva solo.
          </h2>
          <p className="max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
            El cuaderno y el Excel sirven hasta que el negocio se llena. Las
            apps grandes traen cien cosas que no usas. BILLIFY hace lo que una
            cafetería necesita, y lo hace rápido.
          </p>
        </div>

        <ul className="mt-14 space-y-5 lg:space-y-6">
          {PAIRS.map((pair, i) => (
            <li
              key={pair.before}
              data-reveal
              className="grid items-center gap-3 md:grid-cols-[1fr_auto_1fr] md:gap-5"
            >
              {/* Antes: papelito del cuaderno, que se tacha al aparecer */}
              <div
                className={`notebook-paper rounded-lg py-4 pr-5 pl-12 shadow-md shadow-slate-900/10 dark:shadow-black/40 ${i % 2 ? "md:rotate-[0.8deg]" : "md:-rotate-[0.8deg]"}`}
              >
                <p className="font-hand text-ala-ink text-[17px] leading-7">
                  <span className="sr-only">Con el cuaderno: </span>
                  <span className="strike-text">{pair.before}</span>
                </p>
              </div>

              <span
                aria-hidden="true"
                data-reveal
                style={cssVars({ "--delay": "500ms" })}
                className="bg-ala-violet shadow-ala-violet/30 mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg"
              >
                <ArrowDown className="h-4 w-4 md:hidden" />
                <ArrowRight className="hidden h-4 w-4 md:block" />
              </span>

              {/* Después: tarjeta de la app */}
              <div
                data-reveal
                style={cssVars({ "--delay": "750ms" })}
                className="flex gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-lg shadow-indigo-950/[0.06] dark:border-white/10 dark:bg-white/[0.05] dark:shadow-none"
              >
                <span
                  aria-hidden="true"
                  className="from-ala-violet via-ala-blue to-ala-cyan mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
                <p className="text-[15px] leading-relaxed font-medium text-slate-900 dark:text-slate-100">
                  <span className="sr-only">Con BILLIFY: </span>
                  {pair.after}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

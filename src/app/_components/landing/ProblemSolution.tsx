import { Check } from "lucide-react";

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
      className="border-y border-slate-200 bg-white py-20 lg:py-28 dark:border-white/10 dark:bg-slate-950/60"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2
          id="problema-title"
          className="max-w-2xl text-3xl leading-tight font-extrabold tracking-[-0.025em] text-slate-950 sm:text-[2.5rem] dark:text-white"
        >
          Lo que hoy anotas a mano, BILLIFY lo lleva solo.
        </h2>
        <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600 dark:text-slate-300">
          El cuaderno y el Excel sirven hasta que el negocio se llena. Las apps
          grandes traen cien cosas que no usas. BILLIFY hace lo que una
          cafetería necesita, y lo hace rápido.
        </p>

        <div className="mt-12 overflow-hidden rounded-3xl border border-slate-200 dark:border-white/10">
          <div
            aria-hidden="true"
            className="hidden grid-cols-2 border-b border-slate-200 text-sm font-semibold md:grid dark:border-white/10"
          >
            <p className="bg-[#fbfaf5] px-6 py-4 text-slate-600 dark:bg-white/[0.03] dark:text-slate-400">
              Con el cuaderno
            </p>
            <p className="bg-ala-mist text-ala-navy px-6 py-4 dark:bg-indigo-500/10 dark:text-cyan-200">
              Con BILLIFY
            </p>
          </div>
          <ul>
            {PAIRS.map((pair) => (
              <li
                key={pair.before}
                className="grid border-b border-slate-200 last:border-b-0 md:grid-cols-2 dark:border-white/10"
              >
                <div className="relative bg-[#fbfaf5] py-5 pr-6 pl-11 dark:bg-white/[0.03]">
                  {/* Margen rojo de cuaderno */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 left-7 w-px bg-rose-300/80 dark:bg-rose-400/30"
                  />
                  <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
                    <span className="sr-only">Con el cuaderno: </span>
                    {pair.before}
                  </p>
                </div>
                <div className="bg-ala-mist flex gap-3 px-6 py-5 dark:bg-indigo-500/10">
                  <Check
                    aria-hidden="true"
                    className="text-ala-blue mt-0.5 h-5 w-5 shrink-0 dark:text-cyan-300"
                  />
                  <p className="text-[15px] leading-relaxed font-medium text-slate-900 dark:text-slate-100">
                    <span className="sr-only">Con BILLIFY: </span>
                    {pair.after}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

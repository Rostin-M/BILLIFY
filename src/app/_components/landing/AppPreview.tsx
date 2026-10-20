import { Banknote, Check, Landmark, Users, WifiOff } from "lucide-react";

import { cssVars } from "./style";

/**
 * Escenario del hero, hecho con HTML/CSS (sin imágenes): la cuenta de la mesa 4
 * pasa del cuaderno a BILLIFY, se cobra y sale el recibo. Es ilustrativo; para
 * lectores de pantalla se resume en el aria-label. Cada capa tiene su
 * profundidad (--depth) para el parallax con el puntero.
 */

const DINERS = [
  {
    name: "Laura",
    items: "Capuchino, pandebono ×2",
    total: "$ 9.800",
    group: 1,
  },
  { name: "Andrés", items: "Tinto, buñuelo", total: "$ 4.500", group: 1 },
  { name: "Camila", items: "Chocolate con queso", total: "$ 8.500", group: 2 },
] as const;

const NOTEBOOK = [
  "Laura capu + 2 pandeb.",
  "Andrés tinto, buñ.",
  "Camila chocol. c/queso",
] as const;

const RECEIPT = [
  ["Capuchino", "4.500"],
  ["Pandebono ×2", "5.300"],
  ["Tinto", "2.000"],
  ["Buñuelo", "2.500"],
] as const;

export function AppPreview() {
  return (
    <div
      role="img"
      aria-label="Vista de BILLIFY: la cuenta de la mesa 4 pasa del cuaderno a la app, con tres comensales y el cobro dividido en efectivo y transferencia. Al cobrar sale el recibo. Aviso: sin conexión, las ventas se guardan y se sincronizan solas."
      className="hero-stage relative mx-auto h-[42rem] w-full max-w-[25rem] sm:h-[40rem] sm:max-w-[34rem] lg:mx-0 lg:ml-auto"
    >
      {/* Capa 1: la hoja del cuaderno, detrás */}
      <div
        aria-hidden="true"
        data-depth
        style={cssVars({ "--depth": -10 })}
        className="absolute top-8 left-0 w-[66%] sm:w-[58%] lg:-left-20"
      >
        <div className="stage-paper notebook-paper -rotate-[7deg] rounded-md px-4 pt-3 pb-5 pl-11 shadow-xl shadow-slate-900/15 dark:shadow-black/40">
          <p className="font-hand text-ala-ink text-2xl leading-7 font-bold underline decoration-2 underline-offset-4">
            Mesa 4
          </p>
          <ul className="font-hand text-ala-ink mt-1 text-[15px] leading-7">
            {NOTEBOOK.map((line) => (
              <li key={line} className="truncate">
                {line}
              </li>
            ))}
            <li className="flex items-baseline gap-2">
              <span>Total</span>
              <span className="relative">
                22.300
                <svg
                  viewBox="0 0 100 20"
                  preserveAspectRatio="none"
                  className="absolute inset-x-0 top-1/2 h-3 w-full -translate-y-1/2 overflow-visible"
                >
                  <path
                    d="M2 14 L98 6"
                    pathLength={1}
                    fill="none"
                    stroke="var(--ala-pen)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    className="pen-stroke"
                    style={cssVars({ "--delay": "0.95s" })}
                  />
                </svg>
              </span>
              <span className="text-ala-pen font-bold">22.800 ??</span>
            </li>
            <li className="text-ala-pen -rotate-2 font-bold">
              ¿quién pagó qué?
            </li>
          </ul>
        </div>
      </div>

      {/* Capa 2: la app */}
      <div
        data-depth
        style={cssVars({ "--depth": 14 })}
        className="absolute top-0 right-0 z-10 w-[86%] sm:w-[68%]"
      >
        <div className="stage-card rounded-[1.75rem] border border-slate-300/70 bg-white/95 p-2 shadow-2xl shadow-indigo-950/25 backdrop-blur dark:border-white/10 dark:bg-slate-900/95 dark:shadow-black/60">
          <div
            aria-hidden="true"
            className="overflow-hidden rounded-[1.35rem] bg-slate-50 dark:bg-slate-950"
          >
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-slate-900">
              <div>
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Mesas
                </p>
                <p className="text-base font-bold text-slate-900 dark:text-white">
                  Mesa 4
                </p>
              </div>
              <span className="bg-ala-violet/10 text-ala-violet dark:bg-ala-violet/25 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold dark:text-white">
                <Users className="h-3 w-3" /> 3 comensales
              </span>
            </div>

            <ul className="space-y-2 p-3">
              {DINERS.map((d, i) => (
                <li
                  key={d.name}
                  style={cssVars({ "--i": i })}
                  className="stage-row flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/5"
                >
                  <span
                    className={`h-8 w-1 shrink-0 rounded-full ${d.group === 1 ? "bg-ala-violet" : "bg-ala-cyan"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {d.name}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {d.items}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 tabular-nums dark:text-slate-100">
                    {d.total}
                  </p>
                </li>
              ))}
            </ul>

            <div className="border-t border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900">
              <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                Cobro dividido
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-ala-violet/[0.07] dark:bg-ala-violet/20 rounded-xl px-3 py-2">
                  <p className="text-ala-violet flex items-center gap-1 text-[11px] dark:text-white">
                    <Banknote className="h-3 w-3" /> Efectivo
                  </p>
                  <p className="text-sm font-bold text-slate-900 tabular-nums dark:text-white">
                    $ 14.300
                  </p>
                </div>
                <div className="bg-ala-cyan/10 rounded-xl px-3 py-2">
                  <p className="flex items-center gap-1 text-[11px] text-cyan-900 dark:text-cyan-200">
                    <Landmark className="h-3 w-3" /> Transferencia
                  </p>
                  <p className="text-sm font-bold text-slate-900 tabular-nums dark:text-white">
                    $ 8.500
                  </p>
                </div>
              </div>
              <div className="stage-pay bg-ala-violet relative mt-3 h-10 overflow-hidden rounded-xl text-sm font-semibold text-white">
                <span className="stage-pay-before absolute inset-0 flex items-center justify-center">
                  Cobrar $ 22.800
                </span>
                <span className="stage-pay-after absolute inset-0 flex items-center justify-center gap-1.5">
                  <Check className="h-4 w-4" strokeWidth={3} /> Cobrado
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Capa 3: el recibo que se imprime */}
      <div
        aria-hidden="true"
        data-depth
        style={cssVars({ "--depth": 24 })}
        className="absolute bottom-0 left-[2%] z-20 w-[50%] sm:-left-6 sm:w-[40%] lg:-left-14"
      >
        <div className="rotate-[4deg]">
          <div className="stage-receipt receipt-edge bg-ala-paper px-4 pt-4 pb-6 font-mono text-[11px] leading-[1.55] text-slate-700 shadow-2xl shadow-slate-900/25 dark:shadow-black/60">
            <p className="text-center font-bold tracking-wide text-slate-900">
              CAFÉ LA ESQUINA
            </p>
            <p className="text-center text-slate-500">Mesa 4 — cobro 1 de 2</p>
            <p className="my-1.5 border-t border-dashed border-slate-300" />
            {RECEIPT.map(([item, price]) => (
              <p key={item} className="flex justify-between gap-2">
                <span className="truncate">{item}</span>
                <span className="tabular-nums">{price}</span>
              </p>
            ))}
            <p className="my-1.5 border-t border-dashed border-slate-300" />
            <p className="flex justify-between font-bold text-slate-900">
              <span>EFECTIVO</span>
              <span className="tabular-nums">$ 14.300</span>
            </p>
            <p className="mt-2 text-center text-slate-500">
              ¡Gracias por su compra!
            </p>
          </div>
        </div>
      </div>

      {/* Capa 4: aviso sin conexión */}
      <div
        aria-hidden="true"
        data-depth
        style={cssVars({ "--depth": 30 })}
        className="absolute right-0 bottom-16 z-30 sm:-right-4 sm:bottom-20"
      >
        <div className="stage-chip flex max-w-[12rem] items-start gap-2 rounded-2xl border border-amber-300/70 bg-amber-50 px-3 py-2 shadow-lg shadow-amber-900/15 sm:max-w-[13.5rem] dark:border-amber-400/30 dark:bg-slate-900">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <p className="text-xs leading-snug text-amber-950 dark:text-amber-100">
            <span className="font-semibold">Sin internet.</span> 2 ventas
            guardadas; se envían solas al volver la señal.
          </p>
        </div>
      </div>
    </div>
  );
}

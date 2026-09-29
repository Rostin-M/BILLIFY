"use client";

import Link from "next/link";
import { Info } from "lucide-react";

import type { SectionProps } from "./types";
import { CheckboxRow, dividerClass, SubHeading } from "./ui";

export function PermisosSection({ form, update }: SectionProps) {
  return (
    <>
      <div>
        <SubHeading>Precios</SubHeading>
        <CheckboxRow
          checked={form.cashiersCanEditPrices}
          onChange={(checked) => update({ cashiersCanEditPrices: checked })}
          title="Permitir que los cajeros cambien precios"
          description={
            <>
              Útil cuando llega un pedido y el precio del proveedor cambió. Cada cambio queda
              registrado en{" "}
              <Link href="/trazabilidad" className="font-medium text-violet-600 hover:underline dark:text-violet-400">
                trazabilidad
              </Link>
              .
            </>
          }
        />
      </div>

      <div className={dividerClass} />

      <div>
        <SubHeading>Inventario</SubHeading>
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Los cajeros <span className="font-medium">siempre pueden ajustar el stock</span> (por
            ejemplo al recibir mercancía). Este permiso no se puede desactivar y cada ajuste
            también queda en trazabilidad.
          </p>
        </div>
      </div>

      <div className={dividerClass} />

      <div>
        <SubHeading>Caja</SubHeading>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          Quién puede abrir y gestionar la caja se define por cada cajero en{" "}
          <Link href="/empleados" className="font-medium text-violet-600 hover:underline dark:text-violet-400">
            Empleados
          </Link>
          .
        </p>
      </div>
    </>
  );
}

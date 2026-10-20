import { type BackupFileInput } from "./format";
import { type Cell, type Sheet } from "./xlsx";

/**
 * Versión para leer del respaldo: tres hojas (Productos, Clientes, Fiados).
 * Solo para mirar o editar a mano; lo que se vuelve a cargar es el JSON.
 */

const yesNo = (value: boolean | undefined) => (value === false ? "No" : "Sí");

const dateTime = (value: string | Date | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Bogota",
      }).format(new Date(value))
    : "";

const date = (value: string | Date | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("es-CO", {
        dateStyle: "short",
        timeZone: "America/Bogota",
      }).format(new Date(value))
    : "";

const METHOD_LABELS = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
} as const;

export function backupToSheets(file: BackupFileInput): Sheet[] {
  const products: Sheet = {
    name: "Productos",
    header: [
      "Nombre",
      "Código de barras",
      "Categoría",
      "Precio",
      "Costo",
      "Unidad",
      "Stock",
      "Controla stock",
      "Activo",
      "Marca",
      "Presentación",
      "Lote",
      "Vence",
      "Precio abierto",
      "Se vende por peso",
      "Impuestos (casillas)",
    ],
    rows: file.products.map((p) => [
      p.name,
      p.barcode,
      p.category,
      p.price,
      p.cost,
      p.unit,
      p.stock,
      yesNo(p.trackStock),
      yesNo(p.isActive),
      p.brand,
      p.presentation,
      p.lotNumber,
      date(p.expiresAt),
      p.openPrice ? "Sí" : "No",
      p.soldByWeight ? "Sí" : "No",
      (p.taxSlots ?? []).map((slot) => slot + 1).join(", "),
    ]),
  };

  const customers: Sheet = {
    name: "Clientes",
    header: [
      "Nombre",
      "Alias",
      "Documento",
      "Correo",
      "Teléfono",
      "Activo",
      "Saldo fiado",
      "Fiado pendiente desde",
    ],
    rows: file.customers.map((c) => [
      c.name,
      c.alias,
      c.document,
      c.email,
      c.phone,
      yesNo(c.isActive),
      c.credit?.balance ?? 0,
      date(c.credit?.pendingSince),
    ]),
  };

  const credit: Sheet = {
    name: "Fiados",
    header: [
      "Cliente",
      "Documento",
      "Fecha",
      "Movimiento",
      "Detalle",
      "Forma de pago",
      "Fiado",
      "Abono",
      "Saldo",
    ],
    rows: file.customers.flatMap((c) => {
      if (!c.credit) return [];
      const events = [
        ...c.credit.sales.map((s) => ({
          at: new Date(s.date),
          row: (balance: number): Cell[] => [
            c.name,
            c.document,
            dateTime(s.date),
            "Fiado",
            s.items.map((i) => `${i.quantity}× ${i.name}`).join(", "),
            "",
            s.total,
            null,
            balance,
          ],
          delta: s.total,
        })),
        ...c.credit.payments.map((p) => ({
          at: new Date(p.date),
          row: (balance: number): Cell[] => [
            c.name,
            c.document,
            dateTime(p.date),
            "Abono",
            p.note ?? "",
            METHOD_LABELS[p.method ?? "CASH"],
            null,
            p.amount,
            balance,
          ],
          delta: -p.amount,
        })),
      ].sort((a, b) => a.at.getTime() - b.at.getTime());

      let balance = 0;
      return events.map((event) => {
        balance = Math.round((balance + event.delta) * 100) / 100;
        return event.row(balance);
      });
    }),
  };

  return [products, customers, credit];
}

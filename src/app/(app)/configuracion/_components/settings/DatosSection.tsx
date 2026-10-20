"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileJson, FileSpreadsheet, Upload } from "lucide-react";

import {
  BACKUP_LIMITS,
  backupFileSchema,
  firstBackupIssue,
  type BackupFile,
  type BackupFileInput,
  type BackupImportSummary,
} from "~/lib/backup/format";
import { backupToSheets } from "~/lib/backup/workbook";
import { buildXlsx } from "~/lib/backup/xlsx";
import { formatCOP } from "~/lib/format/money";
import { api } from "~/trpc/react";
import { cardClass, Notice } from "./ui";

const primaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60";
const secondaryButton =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5";

function download(content: BlobPart, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** "billify-respaldo-cafe-la-14-2026-10-19" */
function baseName(businessName: string) {
  const slug = businessName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `billify-respaldo-${slug || "negocio"}-${new Date().toISOString().slice(0, 10)}`;
}

type Preview = { raw: unknown; file: BackupFile; fileName: string };

/** "1 producto", "3 productos". */
const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("es-CO")} ${n === 1 ? one : many}`;

function ExportCard() {
  const utils = api.useUtils();
  const [busy, setBusy] = useState<"json" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "json" | "xlsx") {
    setBusy(kind);
    setError(null);
    try {
      const backup: BackupFileInput = await utils.backup.export.fetch(
        undefined,
        { staleTime: 0 },
      );
      const name = baseName(backup.business.name);
      if (kind === "json") {
        download(
          JSON.stringify(backup, null, 2),
          "application/json",
          `${name}.json`,
        );
      } else {
        download(
          // slice(): copia con su propio ArrayBuffer (lo que acepta Blob).
          buildXlsx(backupToSheets(backup)).slice(),
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          `${name}.xlsx`,
        );
      }
    } catch {
      setError(
        "No se pudo generar el archivo. Revisa tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={cardClass}>
      <h2 className="font-semibold">Exportar productos y clientes</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Descarga todos tus productos con su último precio y stock, y tus
        clientes. Si un cliente tiene fiado pendiente, va con cada fiado y cada
        abono, con sus fechas.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          className={primaryButton}
          onClick={() => void run("json")}
          disabled={busy !== null}
          aria-busy={busy === "json"}
        >
          <FileJson className="h-4 w-4" aria-hidden />
          Descargar JSON
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => void run("xlsx")}
          disabled={busy !== null}
          aria-busy={busy === "xlsx"}
        >
          <FileSpreadsheet className="h-4 w-4" aria-hidden />
          Descargar Excel
        </button>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        El JSON es el que puedes volver a cargar aquí. El Excel es para mirar o
        compartir.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}

function ImportCard() {
  const utils = api.useUtils();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BackupImportSummary | null>(null);

  const importBackup = api.backup.import.useMutation({
    onSuccess: async (summary) => {
      setResult(summary);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      await Promise.all([
        utils.product.invalidate(),
        utils.customer.invalidate(),
      ]);
    },
    onError: (e) => setError(e.message),
  });

  async function onFile(file: File | undefined) {
    setError(null);
    setResult(null);
    setPreview(null);
    if (!file) return;
    if (file.size > BACKUP_LIMITS.fileBytes) {
      setError("El archivo pesa más de 4 MB.");
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setError(
        "El archivo no es un JSON válido. Usa el que descargas con «Descargar JSON».",
      );
      return;
    }
    const parsed = backupFileSchema.safeParse(raw);
    if (!parsed.success) {
      setError(firstBackupIssue(parsed.error));
      return;
    }
    setPreview({ raw, file: parsed.data, fileName: file.name });
  }

  const withCredit = preview?.file.customers.filter((c) => c.credit) ?? [];
  const pendingTotal = withCredit.reduce(
    (sum, c) => sum + (c.credit?.balance ?? 0),
    0,
  );

  return (
    <section className={cardClass}>
      <h2 className="font-semibold">Cargar un respaldo</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Sube un JSON exportado de BILLIFY (de este negocio o de otro) y se
        agrega a tu negocio.
      </p>

      <label className={`${secondaryButton} mt-4 cursor-pointer`}>
        <Upload className="h-4 w-4" aria-hidden />
        Elegir archivo JSON
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </label>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300"
        >
          {error}
        </p>
      )}

      {preview && (
        <div className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <p className="text-sm font-semibold">
            {preview.fileName}
            <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
              de «{preview.file.business.name}», exportado el{" "}
              {preview.file.exportedAt.toLocaleDateString("es-CO")}
            </span>
          </p>
          <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
            <li>
              {count(preview.file.products.length, "producto", "productos")}
            </li>
            <li>
              {count(preview.file.customers.length, "cliente", "clientes")}
            </li>
            <li>
              {count(withCredit.length, "cliente", "clientes")} con fiado
              pendiente
              {withCredit.length > 0 &&
                ` (${formatCOP(pendingTotal)} en total)`}
            </li>
          </ul>
          <Notice>
            Los productos y clientes que ya tengas (mismo código de barras o
            documento, o el mismo nombre) se actualizan con los datos del
            archivo, incluido el stock. Los fiados y abonos se agregan con sus
            fechas originales; si alguno ya estaba, no se repite.
          </Notice>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className={primaryButton}
              disabled={importBackup.isPending}
              aria-busy={importBackup.isPending}
              onClick={() => importBackup.mutate({ file: preview.raw })}
            >
              Cargar en mi negocio
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={importBackup.isPending}
              onClick={() => {
                setPreview(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {result && (
        <div
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-900/20 dark:text-emerald-200"
        >
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Respaldo cargado
          </p>
          <ul className="mt-2 space-y-0.5">
            <li>
              Productos: {count(result.products.created, "nuevo", "nuevos")},{" "}
              {count(result.products.updated, "actualizado", "actualizados")}
            </li>
            <li>
              Clientes: {count(result.customers.created, "nuevo", "nuevos")},{" "}
              {count(result.customers.updated, "actualizado", "actualizados")}
            </li>
            <li>
              Fiados agregados:{" "}
              {count(result.credit.sales, "venta fiada", "ventas fiadas")} y{" "}
              {count(result.credit.payments, "abono", "abonos")}
              {result.credit.skipped > 0 &&
                ` (${count(result.credit.skipped, "ya estaba y no se repitió", "ya estaban y no se repitieron")})`}
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}

/** Exportar e importar productos y clientes (solo propietario). */
export function DatosSection() {
  return (
    <div className="space-y-6">
      <ExportCard />
      <ImportCard />
    </div>
  );
}

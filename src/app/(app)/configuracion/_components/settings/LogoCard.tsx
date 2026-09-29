"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { cardClass } from "./ui";

// El logo se sube/elimina al instante: no forma parte del formulario de la sección
export function LogoCard({
  logoUrl,
  onLogoChange,
}: Readonly<{ logoUrl: string | null; onLogoChange: () => void }>) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/logo", { method: "POST", body: formData });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Error al subir el logo");
      } else {
        router.refresh();
        onLogoChange();
      }
    } catch {
      setError("Error de conexión al subir el logo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch("/api/upload/logo", { method: "DELETE" });
      if (!res.ok) {
        setError("Error al eliminar el logo");
      } else {
        router.refresh();
        onLogoChange();
      }
    } catch {
      setError("Error de conexión al eliminar el logo");
    } finally {
      setUploading(false);
    }
  };

  const uploadButtonLabel = logoUrl ? "Cambiar logo" : "Subir logo";

  return (
    <section className={cardClass}>
      <h2 className="mb-1 font-semibold">Logo del negocio</h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Se muestra en la parte superior de todos los PDFs generados.{" "}
        <span className="font-medium text-slate-600 dark:text-slate-300">
          Se recomienda PNG con fondo transparente
        </span>{" "}
        (máx. 2 MB). Se guarda al instante.
      </p>

      <div className="flex flex-wrap items-start gap-4">
        {/* Vista previa */}
        {logoUrl ? (
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-white/10"
            style={{
              backgroundImage:
                "repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%) 0 0/16px 16px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt="Logo del negocio"
              className="h-full w-full rounded-xl object-contain"
            />
          </div>
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-600">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}

        {/* Acciones */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100 disabled:opacity-50 dark:border-violet-500/30 dark:bg-violet-900/20 dark:text-violet-300 dark:hover:bg-violet-900/30"
          >
            {uploading ? "Subiendo..." : uploadButtonLabel}
          </button>
          {logoUrl && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={uploading}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
            >
              Eliminar logo
            </button>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-500">PNG · JPG · WebP · máx. 2 MB</p>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}

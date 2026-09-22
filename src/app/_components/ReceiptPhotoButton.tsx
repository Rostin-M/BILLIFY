"use client";

import { Camera, CheckCircle2, X } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
  value: string | null;
  onChange: (path: string | null) => void;
};

export function ReceiptPhotoButton({ value, onChange }: Readonly<Props>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/receipt", { method: "POST", body: formData });
      const data = (await res.json()) as { path?: string; error?: string };
      if (!res.ok || !data.path) {
        setError(data.error ?? "No se pudo subir la foto.");
        return;
      }
      onChange(data.path);
    } catch {
      setError("No se pudo subir la foto. Revisa tu conexión.");
    } finally {
      setUploading(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-900/10 dark:text-emerald-300">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Comprobante adjunto
        <button type="button" onClick={() => onChange(null)} className="ml-1 text-emerald-500 hover:text-red-500" title="Quitar comprobante" aria-label="Quitar comprobante">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-violet-300 bg-violet-50/50 px-2.5 py-1.5 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-50 dark:border-violet-500/30 dark:bg-violet-900/10 dark:text-violet-300 dark:hover:bg-violet-900/20"
      >
        <Camera className="h-3.5 w-3.5" />
        {uploading ? "Subiendo..." : "Tomar foto del comprobante"}
      </button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

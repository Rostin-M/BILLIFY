"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { BarcodeScanner } from "./BarcodeScanner";

export type ScanResult =
  | { ok: true; name: string }
  | { ok: false; code: string };

type FeedEntry = ScanResult & { id: string };

const MAX_FEED_ENTRIES = 5;

type Props = {
  onScan: (code: string) => ScanResult;
  onClose: () => void;
};

export function ContinuousScanPanel({ onScan, onClose }: Readonly<Props>) {
  const [feed, setFeed] = useState<FeedEntry[]>([]);

  function handleDetected(code: string) {
    const result = onScan(code);
    setFeed((prev) => [{ ...result, id: `${code}-${Date.now()}` }, ...prev].slice(0, MAX_FEED_ENTRIES));
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-white p-3 shadow-sm dark:border-violet-500/30 dark:bg-white/5">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-700 dark:text-violet-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
          </span>{" "}
          Escaneo continuo
        </p>
        <button
          type="button"
          onClick={onClose}
          className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-500 transition hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
        >
          Detener
        </button>
      </div>

      <BarcodeScanner onDetected={handleDetected} onClose={onClose} continuous variant="inline" />

      {feed.length > 0 && (
        <ul className="mt-3 space-y-1">
          {feed.map((entry) => (
            <li
              key={entry.id}
              className={`animate-fade-in flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                entry.ok
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
              }`}
            >
              <span className="shrink-0">
                {entry.ok ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
              </span>
              <span className="truncate">
                {entry.ok ? entry.name : `Código ${entry.code} no encontrado`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

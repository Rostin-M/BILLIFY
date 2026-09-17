"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, ChecksumException, DecodeHintType, FormatException, NotFoundException } from "@zxing/library";

// Chrome on Android ships a native BarcodeDetector backed by the OS's own barcode
// engine (Google Play Services vision APIs) — it is far more accurate than a
// software decoder reading raw canvas frames, and doesn't suffer from the frame
// rotation/orientation mismatches that caused ZXing to misread or miss codes on
// mobile. We use it whenever the browser exposes it and only fall back to ZXing
// (software decoding) on browsers that don't implement it (e.g. desktop Safari/Firefox).

const ZXING_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
];

const NATIVE_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "codabar",
];

interface NativeDetectedBarcode {
  rawValue: string;
}

interface NativeBarcodeDetector {
  detect: (source: HTMLVideoElement) => Promise<NativeDetectedBarcode[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options: { formats: string[] }) => NativeBarcodeDetector;
  }
}

// Tiempo mínimo antes de aceptar el MISMO código dos veces seguidas en modo
// continuo — evita que un producto se agregue decenas de veces mientras el
// código sigue frente a la cámara. Pasado ese tiempo, volver a mostrar el
// mismo código sí se acepta (permite escanear dos unidades del mismo producto
// a propósito).
const CONTINUOUS_SAME_CODE_COOLDOWN_MS = 1200;

// Un solo frame puede decodificar mal (desenfoque, reflejo, ángulo) y algunos
// formatos (CODE_39, ITF, Codabar) no tienen dígito de verificación, así que
// una lectura errónea puede "parecer" válida. Exigir el mismo valor en 2
// lecturas seguidas antes de aceptarlo filtra casi todos esos falsos positivos
// a costa de un par de frames extra (imperceptible, corre a ~30-60 fps).
const REQUIRED_CONSECUTIVE_READS = 2;

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
  /** false (por defecto): detecta un código y cierra. true: sigue escaneando. */
  continuous?: boolean;
  /** "modal" (por defecto): overlay de pantalla completa. "inline": panel que ocupa el espacio de su contenedor. */
  variant?: "modal" | "inline";
};

export function BarcodeScanner({
  onDetected,
  onClose,
  continuous = false,
  variant = "modal",
}: Readonly<Props>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [justScanned, setJustScanned] = useState(false);

  useEffect(() => {
    // React Strict Mode mounts effects twice in dev (mount → cleanup → mount).
    // getUserMedia is always async, so `cancelled` is guaranteed to reflect the
    // final state before any of its own async continuations run — every await
    // below re-checks it before touching the shared <video> element, so a
    // superseded instance never attaches its stream or tears down the survivor's.
    let cancelled = false;
    let stream: MediaStream | undefined;
    let zxingControls: { stop: () => void } | undefined;
    let rafId: number | undefined;
    let lastCode: string | undefined;
    let lastAcceptedAt = 0;
    let pendingCode: string | undefined;
    let pendingCount = 0;

    function stopStream() {
      stream?.getTracks().forEach((track) => track.stop());
    }

    function teardown() {
      cancelled = true;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      zxingControls?.stop();
      stopStream();
    }

    function finish(code: string) {
      if (cancelled) return;

      if (!continuous) {
        teardown();
        onDetected(code);
        return;
      }

      // Modo continuo: ignora el mismo código repetido dentro del cooldown,
      // pero deja la cámara y el loop de detección corriendo.
      const now = Date.now();
      if (code === lastCode && now - lastAcceptedAt < CONTINUOUS_SAME_CODE_COOLDOWN_MS) {
        return;
      }
      lastCode = code;
      lastAcceptedAt = now;
      setJustScanned(true);
      setTimeout(() => setJustScanned(false), 400);
      onDetected(code);
    }

    // Solo llega a `finish` cuando el mismo valor se lee en lecturas
    // consecutivas — ver comentario de REQUIRED_CONSECUTIVE_READS.
    function confirmAndFinish(code: string) {
      if (code === pendingCode) {
        pendingCount += 1;
      } else {
        pendingCode = code;
        pendingCount = 1;
      }
      if (pendingCount >= REQUIRED_CONSECUTIVE_READS) {
        pendingCode = undefined;
        pendingCount = 0;
        finish(code);
      }
    }

    function runNativeDetector(detector: NativeBarcodeDetector) {
      const video = videoRef.current;
      if (!video) return;

      async function tick() {
        if (cancelled) return;
        if (video && video.readyState >= 2) {
          try {
            const results = await detector.detect(video);
            const value = results[0]?.rawValue;
            if (value) confirmAndFinish(value);
          } catch {
            // Transient per-frame detection failure — keep polling.
          }
        }
        if (!cancelled) rafId = requestAnimationFrame(() => void tick());
      }

      rafId = requestAnimationFrame(() => void tick());
    }

    function runZxingFallback(s: MediaStream) {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS);
      const reader = new BrowserMultiFormatReader(hints);
      reader
        .decodeFromStream(s, videoRef.current ?? undefined, (result, err) => {
          if (cancelled) return;
          if (result) {
            confirmAndFinish(result.getText());
            return;
          }
          // NotFoundException/ChecksumException/FormatException fire on every frame
          // that doesn't contain a fully readable code yet — normal while aiming the
          // camera, not an error. The underlying scan loop keeps retrying on its own.
          const isRetryable =
            err instanceof NotFoundException ||
            err instanceof ChecksumException ||
            err instanceof FormatException;
          if (err && !isRetryable) {
            setError("Error leyendo la cámara. Intenta de nuevo.");
          }
        })
        .then((c) => {
          if (cancelled) {
            c.stop();
            return;
          }
          zxingControls = c;
        })
        .catch(() => {
          if (!cancelled) setError("Error leyendo la cámara. Intenta de nuevo.");
        });
    }

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then((s) => {
        stream = s;
        if (cancelled) {
          stopStream();
          return;
        }

        // Best-effort: ask for continuous autofocus so close-up barcodes stay sharp.
        // Not all browsers/devices support this — failures are silently ignored.
        const [track] = s.getVideoTracks();
        if (track && "applyConstraints" in track) {
          track
            .applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
            .catch(() => null);
        }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        void video.play().catch(() => null);

        if (typeof window.BarcodeDetector !== "undefined") {
          const detector = new window.BarcodeDetector({ formats: NATIVE_FORMATS });
          runNativeDetector(detector);
        } else {
          runZxingFallback(s);
        }
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
      });

    return teardown;
  }, [onDetected, continuous]);

  const videoBox = (
    <div
      className={`relative w-full max-w-md overflow-hidden rounded-2xl bg-black transition-shadow ${
        justScanned ? "ring-4 ring-emerald-400" : ""
      }`}
    >
      <video
        ref={videoRef}
        muted
        playsInline
        className="h-56 w-full object-cover sm:h-64"
      />
      {/* Marco de encuadre — delimita solo la zona donde debe quedar el código */}
      <div className="pointer-events-none absolute inset-x-8 inset-y-6 rounded-xl border-2 border-white/70">
        <span className="absolute -left-0.5 -top-0.5 h-5 w-5 rounded-tl-lg border-l-2 border-t-2 border-emerald-400" />
        <span className="absolute -right-0.5 -top-0.5 h-5 w-5 rounded-tr-lg border-r-2 border-t-2 border-emerald-400" />
        <span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 rounded-bl-lg border-b-2 border-l-2 border-emerald-400" />
        <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-br-lg border-b-2 border-r-2 border-emerald-400" />
        <div className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
      </div>
    </div>
  );

  if (variant === "inline") {
    return (
      <div className="flex flex-col items-center rounded-2xl border border-violet-200 bg-slate-950 p-3 dark:border-violet-500/30">
        {videoBox}
        {error ? (
          <p className="mt-3 max-w-xs text-center text-sm text-red-400">{error}</p>
        ) : (
          <p className="mt-3 text-xs text-white/70">
            {continuous ? "Escaneo continuo activo — apunta al siguiente código" : "Apunta la cámara al código de barras"}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="mt-3 min-h-11 w-full rounded-xl bg-white px-5 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
        >
          {continuous ? "Detener escaneo" : "Cancelar"}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
      {videoBox}
      {error ? (
        <p className="mt-4 max-w-xs text-center text-sm text-red-400">{error}</p>
      ) : (
        <p className="mt-4 text-sm text-white/70">Apunta la cámara al código de barras</p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="mt-6 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
      >
        Cancelar
      </button>
    </div>
  );
}

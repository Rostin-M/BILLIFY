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

export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

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

    function stopStream() {
      stream?.getTracks().forEach((track) => track.stop());
    }

    function finish(code: string) {
      if (cancelled) return;
      cancelled = true;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      zxingControls?.stop();
      stopStream();
      onDetected(code);
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
            if (value) {
              finish(value);
              return;
            }
          } catch {
            // Transient per-frame detection failure — keep polling.
          }
        }
        rafId = requestAnimationFrame(() => void tick());
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
            finish(result.getText());
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

    return () => {
      cancelled = true;
      if (rafId !== undefined) cancelAnimationFrame(rafId);
      zxingControls?.stop();
      stopStream();
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
      <div className="relative w-full max-w-md">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full rounded-2xl bg-black"
        />
        <div className="pointer-events-none absolute inset-x-10 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
      </div>
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

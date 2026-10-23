"use client";

import { Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Props = {
  /** PNG en data URL con la firma, o null si está vacía. */
  onChange: (dataUrl: string | null) => void;
};

const HEIGHT = 180;

/** Recuadro para firmar con el dedo, el lápiz o el mouse. */
export function SignaturePad({ onChange }: Readonly<Props>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Tamaño real según el ancho disponible y la densidad de la pantalla (trazo nítido).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.parentElement?.clientWidth ?? 320;
    canvas.width = width * ratio;
    canvas.height = HEIGHT * ratio;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${HEIGHT}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = "#0f172a";
      ctx.fill();
    }
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    onChange(canvasRef.current?.toDataURL("image/png") ?? null);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setEmpty(true);
    onChange(null);
  }

  return (
    <div className="space-y-1.5">
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white dark:border-white/20">
        <canvas
          ref={canvasRef}
          aria-label="Recuadro para firmar"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          className="block touch-none"
          style={{ height: HEIGHT }}
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            Firma aquí con el dedo
          </span>
        )}
        <span aria-hidden className="pointer-events-none absolute bottom-8 left-6 right-6 border-b border-slate-300" />
      </div>
      <button
        type="button"
        onClick={clear}
        disabled={empty}
        className="inline-flex min-h-9 items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-40 dark:text-slate-400"
      >
        <Eraser className="h-4 w-4" aria-hidden /> Borrar y firmar de nuevo
      </button>
    </div>
  );
}

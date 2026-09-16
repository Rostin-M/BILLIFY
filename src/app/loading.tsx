export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950">

      {/* Gradiente de fondo sutil para profundidad */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 90% 90%, rgba(29,78,216,0.07) 0%, transparent 70%)",
        }}
      />

      {/* Logo + indicador — esquina inferior derecha */}
      <div className="absolute bottom-8 right-8 flex flex-col items-end gap-2">

        {/* Contenedor del logo con órbita */}
        <div className="relative h-24 w-24">

          {/* Estela (cola de cometa) */}
          <span className="orbit-trail-2" aria-hidden="true" />
          <span className="orbit-trail-1" aria-hidden="true" />

          {/* Punto de luz principal */}
          <span className="orbit-dot" aria-hidden="true" />

          {/* Logo del águila con pulso suave */}
          <img
            src="/logo.png"
            alt="BILLIFY"
            className="animate-eagle-pulse relative z-10 h-full w-full object-contain"
          />
        </div>

        {/* Texto de marca */}
        <div className="flex flex-col items-end gap-0.5 pr-0.5">
          <p className="text-[0.7rem] font-bold tracking-[0.3em] text-slate-300">
            BILLIFY
          </p>
          <p className="animate-loading-text text-[0.58rem] tracking-[0.2em] text-slate-600">
            Cargando...
          </p>
        </div>
      </div>
    </div>
  );
}

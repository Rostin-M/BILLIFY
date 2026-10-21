import Image from "next/image";

export default function Loading() {
  return (
    <div role="status" aria-label="Cargando" className="fixed inset-0 z-50 bg-slate-950">

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 90% 90%, rgba(29,78,216,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="absolute bottom-[max(2rem,env(safe-area-inset-bottom))] right-8 flex flex-col items-end gap-2">

        <div className="relative h-24 w-24">

          <span className="orbit-trail-2" aria-hidden="true" />
          <span className="orbit-trail-1" aria-hidden="true" />

          <span className="orbit-dot" aria-hidden="true" />

          {/* next/image sirve una versión de 96 px en vez del PNG original de 1,4 MB */}
          <Image
            src="/logo.png"
            alt=""
            width={96}
            height={96}
            priority
            className="animate-eagle-pulse relative z-10 h-full w-full object-contain"
          />
        </div>

        <div className="flex flex-col items-end gap-0.5 pr-0.5">
          <p className="text-[0.7rem] font-bold tracking-[0.3em] text-slate-300">
            BILLIFY
          </p>
          <p className="animate-loading-text text-[0.7rem] tracking-[0.2em] text-slate-400">
            Cargando...
          </p>
        </div>
      </div>
    </div>
  );
}

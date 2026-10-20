import Image from "next/image";
import Link from "next/link";

import { Facets } from "./Facets";
import { LOGIN_HREF, REGISTER_HREF } from "./nav-links";

export function FinalCta() {
  return (
    <section
      aria-labelledby="cta-title"
      className="px-4 py-20 sm:px-6 lg:py-28"
    >
      <div
        data-reveal
        className="bg-ala-night shadow-ala-navy/30 relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] px-6 py-16 text-white shadow-2xl sm:px-12 lg:py-24"
      >
        <div aria-hidden="true" className="aurora aurora-night">
          <span />
          <span />
          <span />
        </div>
        <Facets className="pointer-events-none absolute inset-0 h-full w-full opacity-60" />
        <div
          aria-hidden="true"
          className="dot-grid dot-grid-night pointer-events-none absolute inset-0"
        />

        <div className="relative flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            alt=""
            width={88}
            height={88}
            className="animate-eagle-pulse logo-eagle mb-8 object-contain"
          />
          <h2
            id="cta-title"
            className="font-display max-w-3xl text-4xl leading-[1] font-extrabold tracking-[-0.04em] sm:text-6xl lg:text-7xl"
          >
            Mañana abres con el cuaderno o con BILLIFY.
          </h2>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-blue-100">
            Registra tu negocio en un par de minutos y pruébalo 7 días gratis.
          </p>
          <div className="mt-10 flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
            <Link
              href={REGISTER_HREF}
              className="btn-shine text-ala-navy rounded-2xl bg-white px-8 py-4 text-center text-base font-bold shadow-xl shadow-black/30 transition-colors hover:bg-cyan-50"
            >
              Prueba gratis 7 días
            </Link>
            <Link
              href={LOGIN_HREF}
              className="rounded-2xl border border-white/30 px-8 py-4 text-center text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/10"
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

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
      <div className="bg-ala-navy relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 py-14 text-white sm:px-12 lg:py-20">
        <Facets className="pointer-events-none absolute inset-0 h-full w-full opacity-90" />
        <div className="relative flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <Image
              src="/logo.png"
              alt=""
              width={64}
              height={64}
              className="animate-eagle-pulse mb-6 object-contain"
            />
            <h2
              id="cta-title"
              className="text-3xl leading-tight font-extrabold tracking-[-0.025em] sm:text-[2.75rem]"
            >
              Mañana abres con el cuaderno o con BILLIFY.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-blue-100">
              Registra tu negocio en un par de minutos y pruébalo 7 días gratis.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row lg:flex-col">
            <Link
              href={REGISTER_HREF}
              className="text-ala-navy rounded-xl bg-white px-7 py-4 text-center text-base font-bold transition-colors hover:bg-cyan-50"
            >
              Prueba gratis 7 días
            </Link>
            <Link
              href={LOGIN_HREF}
              className="rounded-xl border border-white/40 px-7 py-4 text-center text-base font-semibold text-white transition-colors hover:bg-white/10"
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

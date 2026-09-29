import Image from "next/image";
import Link from "next/link";

import { LANDING_LINKS, LOGIN_HREF, REGISTER_HREF } from "./nav-links";

const LEGAL_LINKS = [
  { href: "/legal/terminos", label: "Términos y condiciones" },
  { href: "/legal/privacidad", label: "Privacidad" },
  { href: "/legal/cookies", label: "Cookies" },
] as const;

const linkClass =
  "text-sm text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white";

export function LandingFooter() {
  return (
    <footer className="border-t border-slate-200 dark:border-white/10">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-2.5"
            aria-label="BILLIFY, inicio"
          >
            <Image
              src="/logo.png"
              alt=""
              width={32}
              height={32}
              className="logo-eagle object-contain"
            />
            <span className="text-[15px] font-extrabold tracking-[0.18em] text-slate-900 dark:text-white">
              BILLIFY
            </span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Punto de venta para cafeterías y negocios de comida en Colombia.
          </p>
        </div>

        <nav aria-label="Producto">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
            Producto
          </h2>
          <ul className="mt-4 space-y-3">
            {LANDING_LINKS.map((link) => (
              <li key={link.href}>
                <a href={link.href} className={linkClass}>
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Cuenta">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
            Cuenta
          </h2>
          <ul className="mt-4 space-y-3">
            <li>
              <Link href={REGISTER_HREF} className={linkClass}>
                Registrar mi negocio
              </Link>
            </li>
            <li>
              <Link href={LOGIN_HREF} className={linkClass}>
                Iniciar sesión
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Legal">
          <h2 className="text-sm font-semibold text-slate-950 dark:text-white">
            Legal
          </h2>
          <ul className="mt-4 space-y-3">
            {LEGAL_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={linkClass}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="ala-stripe h-1 w-full" aria-hidden="true" />
      <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500 sm:px-6 dark:text-slate-400">
        © {new Date().getFullYear()} BILLIFY. Hecho en Colombia.
      </p>
    </footer>
  );
}

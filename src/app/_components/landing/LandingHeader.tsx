import Image from "next/image";
import Link from "next/link";

import { ThemeToggle } from "~/app/_components/ThemeToggle";
import { MobileMenu } from "./MobileMenu";
import { LANDING_LINKS, LOGIN_HREF, REGISTER_HREF } from "./nav-links";

export function LandingHeader() {
  return (
    <header className="bg-ala-mist/90 dark:bg-ala-night/85 sticky top-0 z-40 border-b border-slate-200/80 backdrop-blur-md dark:border-white/10">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="BILLIFY, inicio"
        >
          <Image
            src="/logo.png"
            alt=""
            width={34}
            height={34}
            priority
            className="logo-eagle object-contain"
          />
          <span className="text-[15px] font-extrabold tracking-[0.18em] text-slate-900 dark:text-white">
            BILLIFY
          </span>
        </Link>

        <nav aria-label="Secciones" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {LANDING_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-slate-600 transition-colors hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href={LOGIN_HREF}
            className="hidden rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap text-slate-700 hover:text-slate-950 sm:inline-block dark:text-slate-200 dark:hover:text-white"
          >
            Iniciar sesión
          </Link>
          <Link
            href={REGISTER_HREF}
            className="bg-ala-violet hidden rounded-xl px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-sm shadow-violet-900/20 transition-colors hover:bg-violet-600 lg:inline-block"
          >
            Prueba gratis 7 días
          </Link>
          <MobileMenu />
        </div>
      </div>
      <div className="ala-stripe h-0.5 w-full opacity-80" aria-hidden="true" />
    </header>
  );
}

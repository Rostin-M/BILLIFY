"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/legal/terminos", label: "Términos y condiciones" },
  { href: "/legal/privacidad", label: "Datos personales" },
  { href: "/legal/cookies", label: "Cookies" },
];

export function LegalTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Documentos legales"
      className="mb-8 flex flex-wrap gap-2 border-b border-slate-200 pb-4 dark:border-white/10"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "border-violet-600 bg-violet-600 text-white dark:border-violet-500 dark:bg-violet-500/90"
                : "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-white/10 dark:text-slate-300 dark:hover:border-violet-500/40 dark:hover:text-violet-300"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

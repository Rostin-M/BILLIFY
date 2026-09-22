import Link from "next/link";
import { Logo } from "~/app/_components/Logo";

const TABS = [
  { href: "/legal/privacidad", label: "Privacidad" },
  { href: "/legal/terminos", label: "Términos y condiciones" },
  { href: "/legal/cookies", label: "Cookies" },
];

export default function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="text-sm font-bold tracking-[0.2em] text-slate-700 dark:text-slate-200">
              BILLIFY
            </span>
          </Link>
        </div>

        <nav aria-label="Documentos legales" className="mb-8 flex flex-wrap gap-2 border-b border-slate-200 pb-4 dark:border-white/10">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-700 dark:border-white/10 dark:text-slate-300 dark:hover:border-violet-500/40 dark:hover:text-violet-300"
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <article className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-8">
          {children}
        </article>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-500">
          <Link href="/" className="underline underline-offset-4 hover:text-slate-600 dark:hover:text-slate-300">
            Volver al inicio
          </Link>
        </p>
      </div>
    </main>
  );
}

import Link from "next/link";
import { Logo } from "~/app/_components/Logo";
import { copyrightNotice } from "~/lib/legal";
import { LegalTabs } from "./_components/LegalTabs";

export default function LegalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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

        <LegalTabs />

        <article className="space-y-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-white/10 dark:bg-white/5">
          {children}
        </article>

        <p className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400">
          <Link
            href="/"
            className="underline underline-offset-4 hover:text-slate-600 dark:hover:text-slate-300"
          >
            Volver al inicio
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          {copyrightNotice()} Prohibida su reproducción o distribución sin autorización.
        </p>
      </div>
    </main>
  );
}

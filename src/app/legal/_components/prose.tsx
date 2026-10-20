import Link from "next/link";

import { Info } from "./legalInfo";

/** Piezas de texto compartidas por los documentos legales (mismo estilo en los tres). */

export function DocHeader({
  title,
  intro,
}: Readonly<{ title: string; intro?: React.ReactNode }>) {
  return (
    <header className="border-b border-slate-200 pb-5 dark:border-white/10">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Última actualización: <Info field="updatedAt" />
      </p>
      {intro && (
        <p className="mt-4 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
          {intro}
        </p>
      )}
    </header>
  );
}

export function Section({
  id,
  title,
  children,
}: Readonly<{ id: string; title: string; children: React.ReactNode }>) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-t`}
      className="scroll-mt-6 space-y-3"
    >
      <h2
        id={`${id}-t`}
        className="text-lg font-semibold text-slate-900 dark:text-white"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export function P({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
      {children}
    </p>
  );
}

export function List({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-slate-600 marker:text-slate-400 dark:text-slate-300">
      {children}
    </ul>
  );
}

export function B({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <span className="font-semibold text-slate-800 dark:text-slate-100">
      {children}
    </span>
  );
}

export function DocLink({
  href,
  children,
}: Readonly<{ href: string; children: React.ReactNode }>) {
  return (
    <Link
      href={href}
      className="text-violet-700 underline underline-offset-2 hover:text-violet-800 dark:text-violet-300 dark:hover:text-violet-200"
    >
      {children}
    </Link>
  );
}

/** Índice al inicio del documento: los textos legales son largos y se consultan por partes. */
export function Toc({
  items,
}: Readonly<{ items: readonly (readonly [id: string, title: string])[] }>) {
  return (
    <nav
      aria-label="Contenido"
      className="rounded-xl bg-slate-50 p-4 dark:bg-white/[0.04]"
    >
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        Contenido
      </p>
      <ol className="mt-2 list-decimal gap-x-10 space-y-1 pl-5 text-sm text-slate-600 sm:columns-2 dark:text-slate-300">
        {items.map(([id, title]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="hover:text-violet-700 hover:underline dark:hover:text-violet-300"
            >
              {title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Título numerado de una sección según su posición en el índice. */
export function numbered(
  items: readonly (readonly [id: string, title: string])[],
  id: string,
): string {
  const i = items.findIndex(([itemId]) => itemId === id);
  return `${i + 1}. ${items[i]?.[1] ?? id}`;
}

export function Placeholder({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <mark className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[0.85em] text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
      {children}
    </mark>
  );
}

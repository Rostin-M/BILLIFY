type Props = {
  title: string;
  subtitle?: string;
};

export function PageLayout({ title, subtitle }: Readonly<Props>) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      )}
    </div>
  );
}

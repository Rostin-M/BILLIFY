import { type LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  description?: string;
  onAction?: { label: string; onClick: () => void };
};

export function EmptyState({ icon: Icon, title, description, onAction }: Readonly<Props>) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/5">
        <Icon size={28} className="text-slate-500 dark:text-slate-500" />
      </div>
      <div>
        <p className="font-medium text-slate-700 dark:text-slate-300">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">{description}</p>
        )}
      </div>
      {onAction && (
        <button
          onClick={onAction.onClick}
          className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-500"
        >
          {onAction.label}
        </button>
      )}
    </div>
  );
}

import { Search, X } from "lucide-react";

/** Campo de búsqueda con botón para borrar. `size="lg"` es el del resumen. */
export function SearchField({
  id,
  label,
  placeholder,
  value,
  onChange,
  size = "md",
}: Readonly<{
  id: string;
  /** Etiqueta para lectores de pantalla (el campo no lleva etiqueta visible). */
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  size?: "md" | "lg";
}>) {
  const large = size === "lg";
  return (
    <div className="relative">
      <Search
        aria-hidden
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 ${
          large ? "left-4 h-5 w-5" : "left-3 h-4 w-4"
        }`}
      />
      <input
        id={id}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 dark:border-white/15 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-400 [&::-webkit-search-cancel-button]:hidden ${
          large ? "h-14 pl-12 pr-12 text-base" : "h-11 pl-10 pr-10 text-base sm:text-sm"
        }`}
      />
      {value !== "" && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Borrar la búsqueda"
          className={`absolute top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white ${
            large ? "right-2.5" : "right-1"
          }`}
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

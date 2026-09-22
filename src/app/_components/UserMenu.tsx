"use client";

import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, LogOut } from "lucide-react";
import { api } from "~/trpc/react";

type Props = { name: string | null; role: string };

export function UserMenu({ name, role }: Readonly<Props>) {
  const [open, setOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [success, setSuccess] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const changePassword = api.auth.changePassword.useMutation({
    onSuccess: () => {
      setSuccess(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    },
  });

  const initials = name
    ? name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "?";

  const mismatch = next.length > 0 && confirm.length > 0 && next !== confirm;

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function openModal() {
    setOpen(false);
    setShowModal(true);
    setSuccess(false);
    changePassword.reset();
  }

  function closeModal() {
    setShowModal(false);
    setCurrent("");
    setNext("");
    setConfirm("");
    setSuccess(false);
    changePassword.reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch) return;
    changePassword.mutate({ currentPassword: current, newPassword: next });
  }

  return (
    <>
      {/* Botón del menú */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-slate-100 dark:hover:bg-white/10"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
            {initials}
          </span>
          <span className="hidden max-w-[120px] truncate text-sm font-medium text-slate-700 dark:text-slate-200 sm:block">
            {name ?? "Usuario"}
          </span>
          <svg className="h-3.5 w-3.5 text-slate-500" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-30" aria-hidden="true" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-40 mt-1.5 w-52 rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-3 py-2 dark:border-white/10">
                <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  {role === "OWNER" ? "Propietario" : "Cajero"}
                </p>
              </div>

              <button
                onClick={openModal}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
              >
                <KeyRound size={15} /> Cambiar contraseña
              </button>

              <button
                onClick={() => void signOut({ callbackUrl: "/auth/login" })}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500 transition hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <LogOut size={15} /> Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modal cambio de contraseña — portal para evitar el containing block del backdrop-blur del header */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900">
            <h2 className="mb-1 text-lg font-bold text-slate-800 dark:text-white">
              Cambiar contraseña
            </h2>
            <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
              Elige una contraseña nueva segura para tu cuenta.
            </p>

            {success ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center dark:border-emerald-500/30 dark:bg-emerald-900/20">
                  <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                    Contraseña actualizada correctamente.
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
                >
                  Listo
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Contraseña actual</span>
                  <input
                    type="password"
                    required
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                </label>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Nueva contraseña</span>
                  <input
                    type="password"
                    required
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:border-white/15 dark:bg-slate-800 dark:text-white"
                  />
                  <span className="text-xs text-slate-500">Mínimo 8 caracteres, una letra y un número</span>
                </label>

                <label className="block space-y-1 text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Confirmar nueva contraseña</span>
                  <input
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ring-violet-400 transition focus:ring-2 dark:bg-slate-800 dark:text-white ${
                      mismatch
                        ? "border-red-300 dark:border-red-500/50"
                        : "border-slate-300 dark:border-white/15"
                    }`}
                  />
                  {mismatch && (
                    <span className="text-xs text-red-500">Las contraseñas no coinciden</span>
                  )}
                </label>

                {changePassword.error && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-400">
                    {changePassword.error.message}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={mismatch || changePassword.isPending}
                    className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
                  >
                    {changePassword.isPending ? "Actualizando..." : "Actualizar contraseña"}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

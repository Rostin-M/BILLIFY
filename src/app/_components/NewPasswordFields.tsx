"use client";

import { Check, Circle, Eye, EyeOff, X } from "lucide-react";
import { useId, useState } from "react";

import {
  meetsPasswordPolicy,
  PASSWORD_MAX_LENGTH,
  PASSWORD_RULES,
  passwordStrength,
} from "~/lib/passwordPolicy";

/** Lista para enviar: cumple la política y la confirmación coincide. */
export function newPasswordReady(password: string, confirm: string): boolean {
  return meetsPasswordPolicy(password) && password === confirm;
}

const SEGMENT_COLORS = ["", "bg-red-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"] as const;
const LABEL_COLORS = {
  adaptive: ["", "text-red-600 dark:text-red-400", "text-amber-600 dark:text-amber-400", "text-lime-700 dark:text-lime-400", "text-emerald-600 dark:text-emerald-400"],
  dark: ["", "text-red-400", "text-amber-400", "text-lime-400", "text-emerald-400"],
} as const;

const TONES = {
  adaptive: {
    track: "bg-slate-200 dark:bg-white/10",
    muted: "text-slate-500 dark:text-slate-400",
    met: "text-emerald-600 dark:text-emerald-400",
    bad: "text-red-600 dark:text-red-400",
    eye: "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
    badBorder: "!border-red-400 dark:!border-red-500/60",
  },
  dark: {
    track: "bg-white/10",
    muted: "text-slate-400",
    met: "text-emerald-400",
    bad: "text-red-400",
    eye: "text-slate-400 hover:text-slate-200",
    badBorder: "!border-red-500/60",
  },
} as const;

type Props = {
  password: string;
  onPasswordChange: (value: string) => void;
  confirm: string;
  onConfirmChange: (value: string) => void;
  label?: string;
  confirmLabel?: string;
  placeholder?: string;
  /** Clases del input, iguales a las del resto del formulario. */
  inputClassName: string;
  /** Clases del texto de cada etiqueta. */
  labelClassName: string;
  /** "dark" para las pantallas de acceso, que siempre son oscuras. */
  tone?: keyof typeof TONES;
  /** Campo opcional: la guía y la confirmación aparecen solo cuando se escribe algo. */
  optional?: boolean;
};

/**
 * Contraseña nueva + confirmación, con medidor de fuerza y la lista de
 * requisitos de ~/lib/passwordPolicy (los mismos que valida el servidor).
 */
export function NewPasswordFields({
  password,
  onPasswordChange,
  confirm,
  onConfirmChange,
  label = "Contraseña",
  confirmLabel = "Confirmar contraseña",
  placeholder = "Crea una contraseña segura",
  inputClassName,
  labelClassName,
  tone = "adaptive",
  optional = false,
}: Readonly<Props>) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const colors = TONES[tone];
  const strength = passwordStrength(password);
  const showGuide = !optional || password.length > 0;
  const mismatch = confirm.length > 0 && confirm !== password;
  const matches = confirm.length > 0 && confirm === password;
  const inputType = visible ? "text" : "password";

  const eyeButton = (
    <button
      type="button"
      onClick={() => setVisible((v) => !v)}
      aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      aria-pressed={visible}
      className={`absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg transition ${colors.eye}`}
    >
      {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="space-y-1 text-sm">
        <label htmlFor={`${id}-pw`} className={`block ${labelClassName}`}>{label}</label>
        <div className="relative">
          <input
            id={`${id}-pw`}
            required={!optional}
            type={inputType}
            autoComplete="new-password"
            maxLength={PASSWORD_MAX_LENGTH}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            aria-describedby={showGuide ? `${id}-guide` : undefined}
            className={`${inputClassName} pr-10`}
            placeholder={placeholder}
          />
          {eyeButton}
        </div>
      </div>

      {showGuide && (
        <div id={`${id}-guide`} className="@container space-y-2">
          <div className="flex items-center gap-3">
            <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden="true">
              {[1, 2, 3, 4].map((step) => (
                <span
                  key={step}
                  className={`h-1.5 rounded-full transition-colors duration-300 ${
                    strength.score >= step ? SEGMENT_COLORS[strength.score] : colors.track
                  }`}
                />
              ))}
            </div>
            <span aria-live="polite" className={`min-w-[8.5rem] shrink-0 text-right text-xs font-semibold ${strength.score ? LABEL_COLORS[tone][strength.score] : colors.muted}`}>
              {strength.score ? `Seguridad: ${strength.label}` : "Seguridad"}
            </span>
          </div>
          <ul className="grid gap-1 text-xs @md:grid-cols-2">
            {PASSWORD_RULES.map((rule) => {
              const met = rule.test(password);
              return (
                <li key={rule.id} className={`flex items-center gap-1.5 transition-colors ${met ? colors.met : colors.muted}`}>
                  {met ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3 w-3 shrink-0" />}
                  <span>{rule.label}</span>
                  <span className="sr-only">{met ? "(cumplido)" : "(pendiente)"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showGuide && (
        <div className="space-y-1 text-sm">
          <label htmlFor={`${id}-confirm`} className={`block ${labelClassName}`}>{confirmLabel}</label>
          <div className="relative">
            <input
              id={`${id}-confirm`}
              required={!optional || password.length > 0}
              type={inputType}
              autoComplete="new-password"
              maxLength={PASSWORD_MAX_LENGTH}
              value={confirm}
              onChange={(e) => onConfirmChange(e.target.value)}
              aria-invalid={mismatch}
              aria-describedby={confirm.length > 0 ? `${id}-match` : undefined}
              className={`${inputClassName} pr-10 ${mismatch ? colors.badBorder : ""}`}
              placeholder="Repite la contraseña"
            />
            {eyeButton}
          </div>
          {confirm.length > 0 && (
            <p id={`${id}-match`} aria-live="polite" className={`flex items-center gap-1.5 text-xs ${matches ? colors.met : colors.bad}`}>
              {matches ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {matches ? "Las contraseñas coinciden" : "Las contraseñas no coinciden"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}


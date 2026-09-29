import { Plus } from "lucide-react";

import { cheapestPlanWith, PLAN_CODES, PLANS } from "~/lib/subscription/catalog";

const LIMITS_TEXT = PLAN_CODES.map((c) => {
  const { name, limits } = PLANS[c];
  return `${name}: ${limits.cashRegisters} ${limits.cashRegisters === 1 ? "caja" : "cajas"} y ${limits.users} usuarios`;
}).join("; ");

const EXPORTS_FROM = cheapestPlanWith("exports")?.name ?? "Negocio";

const QUESTIONS = [
  {
    q: "¿Necesito internet para usar BILLIFY?",
    a: "Para entrar la primera vez, sí. Después, si se cae la conexión, puedes seguir vendiendo: las ventas quedan guardadas en el dispositivo y se envían solas cuando vuelve la señal, sin duplicarse.",
  },
  {
    q: "¿Sirve en celular y en tablet?",
    a: "Sí. Funciona en el navegador del celular, la tablet o el computador, y la puedes instalar en la pantalla de inicio como si fuera una app.",
  },
  {
    q: "¿Necesito comprar equipos?",
    a: "No. El lector de código de barras usa la cámara del celular o del computador.",
  },
  {
    q: "¿Qué pasa cuando termina la prueba de 7 días?",
    a: "Eliges un plan y lo pagas desde la app para seguir vendiendo. Si no pagas, la cuenta pasa directo a solo lectura (la prueba no tiene días de gracia): ves tu historial, pero no registras ventas. Todo lo que registraste durante la prueba se queda contigo.",
  },
  {
    q: "¿Cómo pago?",
    a: "Desde la app, con Nequi, PSE, tarjeta o Bancolombia (los pagos en línea se activan muy pronto). Puedes pagar mes a mes o el año completo (pagas 10 meses y recibes 12). Antes de cada vencimiento te llega un recordatorio por correo.",
  },
  {
    q: "¿Qué pasa si no pago a tiempo?",
    a: "Tienes 3 días de gracia con acceso completo. Si pasan sin pago, la cuenta queda en solo lectura: puedes ver tu historial, pero no registrar ventas. Tus datos no se borran, y al pagar todo vuelve a funcionar de inmediato.",
  },
  {
    q: "¿Emite factura electrónica de la DIAN?",
    a: "Todavía no. Hoy BILLIFY genera facturas en PDF para tu control interno y para entregarle al cliente. La facturación electrónica viene próximamente.",
  },
  {
    q: "¿Mis datos están seguros?",
    a: "Cada negocio tiene sus datos separados: nadie más puede verlos. Las contraseñas se guardan cifradas, hay límite de intentos al iniciar sesión y la sesión se cierra sola a las 24 horas.",
  },
  {
    q: "¿Cuántos empleados y cajas puedo tener?",
    a: `Puedes crear usuarios para tus cajeros, cada uno con sus permisos. Las cajas abiertas al mismo tiempo y los usuarios dependen del plan (${LIMITS_TEXT}; los usuarios te incluyen a ti).`,
  },
  {
    q: "¿Puedo cambiar de plan?",
    a: "Sí. Si subes de plan, pagas solo la diferencia por los días que le quedan a tu período y el cambio aplica de inmediato. Si bajas de plan o cambias entre mensual y anual, el cambio aplica en la siguiente renovación.",
  },
  {
    q: "¿Puedo exportar mis datos?",
    a: `Sí, desde el plan ${EXPORTS_FROM}. Descargas tus ventas y movimientos de caja en CSV, que abre en Excel o Google Sheets.`,
  },
  {
    q: "¿Puedo cancelar cuando quiera?",
    a: "Sí. No hay permanencia: si cancelas, no se te cobra nada más y conservas el acceso hasta el final del período que pagaste. Antes de irte puedes exportar tu información.",
  },
  {
    q: "¿Me devuelven el dinero si no me sirve?",
    a: "Sí, en tu primer pago: puedes pedir el reembolso dentro de los 5 días hábiles siguientes. Los pagos de renovación no tienen reembolso.",
  },
] as const;

export function Faq() {
  return (
    <section
      id="preguntas"
      aria-labelledby="preguntas-title"
      className="border-y border-slate-200 bg-white py-20 lg:py-28 dark:border-white/10 dark:bg-slate-950/60"
    >
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.7fr] lg:gap-16">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <h2
            id="preguntas-title"
            className="text-3xl leading-tight font-extrabold tracking-[-0.025em] text-slate-950 sm:text-[2.5rem] dark:text-white"
          >
            Preguntas frecuentes
          </h2>
          <p className="mt-4 max-w-sm text-lg leading-relaxed text-slate-600 dark:text-slate-300">
            Lo que más nos preguntan dueños de cafeterías antes de empezar.
          </p>
        </div>

        <div className="divide-y divide-slate-200 border-y border-slate-200 dark:divide-white/10 dark:border-white/10">
          {QUESTIONS.map(({ q, a }) => (
            <details key={q} className="faq-item group">
              <summary className="flex cursor-pointer items-start justify-between gap-4 py-5 text-left text-[17px] font-semibold text-slate-950 dark:text-white">
                {q}
                <Plus
                  aria-hidden="true"
                  className="faq-icon text-ala-blue mt-0.5 h-5 w-5 shrink-0 transition-transform duration-200 motion-reduce:transition-none dark:text-cyan-300"
                />
              </summary>
              <p className="max-w-2xl pr-9 pb-6 text-[15px] leading-relaxed text-slate-600 dark:text-slate-400">
                {a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

import type { Metadata } from "next";

import { SESSION_MAX_AGE_SEC } from "~/server/auth/sessionPolicy";
import { ContactBlock } from "../_components/legalInfo";
import {
  B,
  DocHeader,
  DocLink,
  numbered,
  P,
  Section,
  Toc,
} from "../_components/prose";

export const metadata: Metadata = { title: "Política de Cookies — BILLIFY" };

const SESSION_HOURS = SESSION_MAX_AGE_SEC / 3600;

const TOC = [
  ["que-son", "Qué son"],
  ["cookies", "Cookies que usamos"],
  ["dispositivo", "Lo que guardamos en tu dispositivo"],
  ["no-usamos", "Lo que no usamos"],
  ["consentimiento", "Por qué no mostramos un aviso de cookies"],
  ["control", "Cómo borrarlas"],
  ["contacto", "Contacto"],
] as const;

const h = (id: (typeof TOC)[number][0]) => numbered(TOC, id);

function Row({
  name,
  purpose,
  lasts,
}: Readonly<{ name: string; purpose: string; lasts: string }>) {
  return (
    <tr className="border-t border-slate-200 align-top dark:border-white/10">
      <td className="py-2.5 pr-4 font-medium text-slate-800 dark:text-slate-100">
        {name}
      </td>
      <td className="py-2.5 pr-4">{purpose}</td>
      <td className="py-2.5 whitespace-nowrap">{lasts}</td>
    </tr>
  );
}

function StorageTable({
  caption,
  children,
}: Readonly<{ caption: string; children: React.ReactNode }>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-xs text-slate-500 dark:text-slate-400">
            <th scope="col" className="pr-4 pb-2 font-semibold">
              Qué
            </th>
            <th scope="col" className="pr-4 pb-2 font-semibold">
              Para qué
            </th>
            <th scope="col" className="pb-2 font-semibold">
              Cuánto dura
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default function CookiePolicyPage() {
  return (
    <>
      <DocHeader
        title="Política de Cookies"
        intro="BILLIFY solo usa cookies y almacenamiento del navegador que son necesarios para funcionar. No usamos cookies de publicidad ni de analítica."
      />
      <Toc items={TOC} />

      <Section id="que-son" title={h("que-son")}>
        <P>
          Las cookies son pequeños archivos que un sitio guarda en tu navegador
          para recordar información entre visitas. BILLIFY también usa el
          almacenamiento local del navegador (localStorage e IndexedDB), que
          guarda datos solo en tu dispositivo y no se envía con cada visita.
        </P>
      </Section>

      <Section id="cookies" title={h("cookies")}>
        <P>
          Solo usamos cookies propias, todas necesarias para iniciar sesión de
          forma segura:
        </P>
        <StorageTable caption="Cookies que usa BILLIFY">
          <Row
            name="Sesión (authjs.session-token)"
            purpose="Mantenerte con la sesión iniciada mientras usas la app."
            lasts={`${SESSION_HOURS} horas o hasta cerrar sesión`}
          />
          <Row
            name="Seguridad (authjs.csrf-token)"
            purpose="Evitar que otro sitio envíe formularios en tu nombre."
            lasts="Hasta cerrar el navegador"
          />
          <Row
            name="Redirección (authjs.callback-url)"
            purpose="Llevarte a la página que querías ver después de iniciar sesión."
            lasts="Hasta cerrar el navegador"
          />
        </StorageTable>
      </Section>

      <Section id="dispositivo" title={h("dispositivo")}>
        <StorageTable caption="Datos que BILLIFY guarda en tu dispositivo">
          <Row
            name="Tema claro u oscuro"
            purpose="Recordar el modo que elegiste, también en la página pública."
            lasts="Hasta que lo cambies o borres los datos del navegador"
          />
          <Row
            name="Menú lateral"
            purpose="Recordar si lo dejaste abierto o cerrado."
            lasts="Hasta que lo cambies"
          />
          <Row
            name="Borradores de venta y factura"
            purpose="Que no pierdas el carrito, el cliente, la forma de pago o la nota si recargas la página."
            lasts="Hasta completar la venta o cerrar sesión"
          />
          <Row
            name="Ventas sin conexión"
            purpose="Guardar las ventas hechas sin internet hasta enviarlas al servidor."
            lasts="Hasta que se sincronizan"
          />
          <Row
            name="Archivos de la app"
            purpose="Abrir BILLIFY más rápido y aunque no haya conexión."
            lasts="Hasta cerrar sesión o actualizar la app"
          />
        </StorageTable>
        <P>
          Estos datos no salen de tu dispositivo, salvo las ventas sin conexión,
          que se envían a tu cuenta al sincronizar.
        </P>
      </Section>

      <Section id="no-usamos" title={h("no-usamos")}>
        <P>
          No usamos cookies de analítica, publicidad, redes sociales ni rastreo
          de terceros, y no compartimos tu actividad con plataformas de
          publicidad. Cuando pagues la suscripción, la pasarela de pagos puede
          usar sus propias cookies en su página; se rigen por la política de esa
          empresa.
        </P>
      </Section>

      <Section id="consentimiento" title={h("consentimiento")}>
        <P>
          Como todo lo que usamos es necesario para que la plataforma funcione,
          no te pedimos aceptar cookies: basta con informarte. Si algún día
          agregamos cookies de analítica o similares, te pediremos permiso antes
          de activarlas y actualizaremos esta política.
        </P>
      </Section>

      <Section id="control" title={h("control")}>
        <P>
          Puedes borrar las cookies y los datos del sitio desde la configuración
          de tu navegador. Si lo haces, se cerrará tu sesión y{" "}
          <B>se perderán las ventas sin conexión que aún no se hayan enviado</B>
          . Más detalles sobre tus datos en la{" "}
          <DocLink href="/legal/privacidad">
            Política de Tratamiento de Datos
          </DocLink>
          .
        </P>
      </Section>

      <Section id="contacto" title={h("contacto")}>
        <ContactBlock />
      </Section>
    </>
  );
}

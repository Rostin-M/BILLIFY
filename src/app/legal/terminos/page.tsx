import type { Metadata } from "next";

import {
  cheapestPlanWith,
  GRACE_DAYS,
  PLANS,
  TRIAL_DAYS,
  TRIAL_PLAN,
} from "~/lib/subscription/catalog";
import {
  ContactBlock,
  courts,
  domicile,
  Info,
  Provider,
} from "../_components/legalInfo";
import {
  B,
  DocHeader,
  DocLink,
  List,
  numbered,
  P,
  Section,
  Toc,
} from "../_components/prose";

export const metadata: Metadata = { title: "Términos y Condiciones — BILLIFY" };

const EXPORTS_FROM = cheapestPlanWith("exports")?.name ?? "Negocio";

const TOC = [
  ["aceptacion", "Aceptación"],
  ["quien", "Quién presta el servicio"],
  ["servicio", "Qué es y qué no es BILLIFY"],
  ["cuenta", "Tu cuenta y tus usuarios"],
  ["datos", "Los datos de tu negocio"],
  ["uso", "Uso permitido"],
  ["prueba", "Prueba gratis"],
  ["pagos", "Planes, precios y pagos"],
  ["vencimiento", "Pagos vencidos y modo solo lectura"],
  ["cambios-plan", "Cambios de plan"],
  ["cancelacion", "Cancelación y reembolsos"],
  ["sin-internet", "Uso sin conexión"],
  ["fin", "Tus datos al terminar"],
  ["propiedad", "Propiedad intelectual"],
  ["disponibilidad", "Disponibilidad del servicio"],
  ["responsabilidad", "Limitación de responsabilidad"],
  ["suspension", "Suspensión de cuentas"],
  ["modificaciones", "Cambios a estos términos"],
  ["ley", "Ley aplicable y quejas"],
  ["contacto", "Contacto"],
] as const;

const h = (id: (typeof TOC)[number][0]) => numbered(TOC, id);

export default function TermsPage() {
  return (
    <>
      <DocHeader
        title="Términos y Condiciones"
        intro="Estas son las reglas para usar BILLIFY. Las escribimos en lenguaje sencillo; si algo no queda claro, escríbenos antes de aceptar."
      />
      <Toc items={TOC} />

      <Section id="aceptacion" title={h("aceptacion")}>
        <P>
          Al marcar la casilla de aceptación en el registro, o al usar BILLIFY,
          aceptas estos Términos y la{" "}
          <DocLink href="/legal/privacidad">
            Política de Tratamiento de Datos Personales
          </DocLink>
          . Esa aceptación electrónica tiene la misma validez que una firma (Ley
          527 de 1999). Guardamos la fecha, la hora y la versión que aceptaste,
          y te enviamos una constancia por correo. Si no estás de acuerdo, no
          uses la plataforma.
        </P>
      </Section>

      <Section id="quien" title={h("quien")}>
        <P>
          BILLIFY es prestado por <Provider />, con domicilio en {domicile()}{" "}
          (en adelante, &quot;BILLIFY&quot; o &quot;nosotros&quot;).
        </P>
      </Section>

      <Section id="servicio" title={h("servicio")}>
        <P>
          BILLIFY es un software en línea (SaaS) de punto de venta para
          cafeterías y negocios de comida: ventas, mesas, caja, fiados,
          inventario, reportes y usuarios para tu equipo.
        </P>
        <List>
          <li>
            <B>No es facturación electrónica de la DIAN.</B> Las facturas y
            recibos en PDF que genera BILLIFY son documentos de control interno
            y soporte para tus clientes. Si tu negocio está obligado a facturar
            electrónicamente, debes hacerlo con un proveedor autorizado.
          </li>
          <li>
            <B>No reemplaza a tu contador.</B> Eres responsable de tus
            obligaciones tributarias y contables. La configuración de impuestos
            (por ejemplo, IVA o impuesto al consumo) la defines tú; valídala con
            tu contador.
          </li>
        </List>
      </Section>

      <Section id="cuenta" title={h("cuenta")}>
        <List>
          <li>
            Debes ser mayor de edad y estar autorizado para representar al
            negocio que registras.
          </li>
          <li>
            La información del registro debe ser verdadera y mantenerse
            actualizada.
          </li>
          <li>
            Eres responsable de guardar tu contraseña y de lo que se haga con tu
            cuenta. Si sospechas un acceso no autorizado, cambia la contraseña y
            avísanos.
          </li>
          <li>
            Como propietario, puedes crear usuarios para tus empleados y darles
            permisos. Respondes por la actividad que ellos realicen en tu
            negocio y por desactivar su acceso cuando dejen de trabajar contigo.
          </li>
        </List>
      </Section>

      <Section id="datos" title={h("datos")}>
        <P>
          Los productos, ventas, clientes, empleados y movimientos que registras
          son de tu negocio. Eres responsable de que sean correctos y de tener
          la autorización de tus clientes y empleados para registrar sus datos
          personales. BILLIFY los trata solo por tu cuenta y para prestarte el
          servicio, como explica la{" "}
          <DocLink href="/legal/privacidad">
            Política de Tratamiento de Datos
          </DocLink>
          .
        </P>
      </Section>

      <Section id="uso" title={h("uso")}>
        <P>
          Usa BILLIFY para la operación legítima de tu negocio. No está
          permitido:
        </P>
        <List>
          <li>Usarlo para actividades ilegales o fraudulentas.</li>
          <li>
            Intentar vulnerar la seguridad de la plataforma o acceder a datos de
            otros negocios.
          </li>
          <li>
            Revender, sublicenciar o compartir el acceso con negocios distintos
            al tuyo.
          </li>
          <li>
            Introducir código malicioso o sobrecargar el servicio a propósito.
          </li>
        </List>
      </Section>

      <Section id="prueba" title={h("prueba")}>
        <P>
          Al registrarte tienes {TRIAL_DAYS} días gratis del plan{" "}
          {PLANS[TRIAL_PLAN].name} completo, sin dar datos de tarjeta. Te
          avisamos por correo antes de que termine. Si al terminar no eliges y
          pagas un plan, la cuenta pasa directamente a <B>solo lectura</B> (la
          prueba no tiene días de gracia). Lo que registraste durante la prueba
          se conserva.
        </P>
      </Section>

      <Section id="pagos" title={h("pagos")}>
        <List>
          <li>
            Los planes, sus precios y sus límites (cajas abiertas a la vez,
            usuarios, productos y demás) son los publicados en la{" "}
            <DocLink href="/#planes">página de planes</DocLink> al momento de
            pagar. Los precios están en pesos colombianos e incluyen o suman los
            impuestos que correspondan, según se indique al pagar.
          </li>
          <li>
            Puedes pagar mes a mes o un año completo (en el pago anual pagas 10
            meses y recibes 12).
          </li>
          <li>
            Pagas por adelantado desde la app, con los medios que ofrezca la
            pasarela de pagos (por ejemplo Nequi, PSE, tarjeta o Bancolombia).
            Los datos de tu tarjeta o cuenta los procesa la pasarela; BILLIFY no
            los recibe ni los guarda.
          </li>
          <li>
            No hay renovación automática con cargo a tu tarjeta: antes de cada
            vencimiento te recordamos pagar.
          </li>
          <li>
            Si cambiamos los precios, te avisaremos con anticipación y el nuevo
            precio aplicará desde tu siguiente período, no al que ya pagaste.
          </li>
        </List>
      </Section>

      <Section id="vencimiento" title={h("vencimiento")}>
        <P>
          Si tu período pagado vence, tienes {GRACE_DAYS} días de gracia con
          acceso completo. Si pasan sin pago, la cuenta queda en{" "}
          <B>solo lectura</B>: puedes consultar tu historial, reportes y datos,
          pero no registrar ventas ni movimientos nuevos. Tus datos no se borran
          por esto, y al pagar todo vuelve a funcionar de inmediato.
        </P>
      </Section>

      <Section id="cambios-plan" title={h("cambios-plan")}>
        <List>
          <li>
            <B>Subir de plan:</B> pagas solo la diferencia por los días que le
            quedan a tu período y el cambio aplica de inmediato.
          </li>
          <li>
            <B>Bajar de plan o cambiar entre mensual y anual:</B> el cambio
            aplica en tu siguiente renovación. Si el plan nuevo tiene límites
            menores, debes ajustar tu uso (por ejemplo, desactivar usuarios)
            para usarlo.
          </li>
        </List>
      </Section>

      <Section id="cancelacion" title={h("cancelacion")}>
        <List>
          <li>
            No hay permanencia mínima. Puedes cancelar cuando quieras desde la
            app; no se te cobra nada más y conservas el acceso hasta el final
            del período que ya pagaste.
          </li>
          <li>
            <B>Derecho de retracto:</B> en tu primer pago puedes pedir la
            devolución del dinero dentro de los 5 días hábiles siguientes,
            escribiendo a <Info field="contactEmail" />. Te devolvemos el valor
            pagado a más tardar dentro de los 30 días calendario siguientes a tu
            solicitud (artículo 47 de la Ley 1480 de 2011).
          </li>
          <li>
            Los pagos de renovación y las diferencias por subir de plan no
            tienen reembolso.
          </li>
        </List>
      </Section>

      <Section id="sin-internet" title={h("sin-internet")}>
        <P>
          Si se cae el internet, BILLIFY guarda las ventas en tu dispositivo y
          las envía cuando vuelve la conexión. Ten en cuenta que:
        </P>
        <List>
          <li>
            Mientras no se envíen, esas ventas solo existen en ese dispositivo.
            Si borras los datos del navegador o pierdes el equipo antes de
            sincronizar, se pueden perder.
          </li>
          <li>
            Si tu cuenta pasa a solo lectura, solo se aceptan las ventas sin
            conexión hechas antes de ese momento, con una tolerancia de 24
            horas.
          </li>
        </List>
      </Section>

      <Section id="fin" title={h("fin")}>
        <P>
          En todos los planes puedes descargar tus productos y clientes (con sus
          fiados pendientes) en JSON o Excel, y desde el plan {EXPORTS_FROM}
          también tus ventas y movimientos de caja en CSV. Si cancelas, tu
          cuenta queda en solo lectura y conservamos tus datos durante{" "}
          <Info field="retentionAfterCancel" />; después los eliminamos, salvo
          lo que la ley nos obligue a guardar. Puedes pedir que los eliminemos
          antes, como explica la{" "}
          <DocLink href="/legal/privacidad">
            Política de Tratamiento de Datos
          </DocLink>
          .
        </P>
      </Section>

      <Section id="propiedad" title={h("propiedad")}>
        <P>
          El software, la marca BILLIFY, el logo, el diseño y los contenidos de
          la plataforma pertenecen a <Info field="ownerName" />.{" "}
          <B>Todos los derechos reservados.</B> Está prohibido copiar,
          reproducir, distribuir, modificar, descompilar o explotar
          comercialmente el software o cualquiera de sus partes sin autorización
          escrita. Mientras tu cuenta esté activa te damos una licencia
          limitada, no exclusiva e intransferible para usar BILLIFY en tu
          negocio. Los datos que ingresas siguen siendo tuyos.
        </P>
      </Section>

      <Section id="disponibilidad" title={h("disponibilidad")}>
        <P>
          Trabajamos para que BILLIFY esté disponible siempre, pero puede haber
          interrupciones por mantenimiento, fallas de proveedores de
          infraestructura o causas fuera de nuestro control. Podemos mejorar,
          cambiar o retirar funciones; si un cambio te afecta de forma
          importante, te avisaremos con anticipación.
        </P>
      </Section>

      <Section id="responsabilidad" title={h("responsabilidad")}>
        <P>
          En la medida que lo permita la ley, BILLIFY no responde por lucro
          cesante ni por daños indirectos, ni por pérdidas causadas por
          información incorrecta que registres, por el uso indebido de tu
          cuenta, por ventas sin conexión que no se hayan sincronizado, o por
          fallas de conectividad o de terceros fuera de nuestro control
          razonable. Nuestra responsabilidad total frente a ti no superará lo
          que nos pagaste en los 12 meses anteriores al hecho que la origine.
          Nada de esto limita los derechos que la ley no permite renunciar.
        </P>
      </Section>

      <Section id="suspension" title={h("suspension")}>
        <P>
          Podemos suspender o cerrar una cuenta que incumpla estos términos o
          que se use para fraude, avisándote antes, salvo que haya un riesgo
          grave e inmediato para la plataforma o para otros negocios. La falta
          de pago no cierra tu cuenta: la deja en solo lectura, como se explica
          arriba.
        </P>
      </Section>

      <Section id="modificaciones" title={h("modificaciones")}>
        <P>
          Podemos actualizar estos términos. Si el cambio es importante, te
          avisaremos por correo antes de que aplique. Si no estás de acuerdo,
          puedes cancelar sin penalidad; si sigues usando BILLIFY después de esa
          fecha, entendemos que aceptas la nueva versión.
        </P>
      </Section>

      <Section id="ley" title={h("ley")}>
        <P>
          Estos términos se rigen por las leyes de Colombia. Si tienes una
          queja, escríbenos primero a <Info field="contactEmail" /> y te
          responderemos dentro de los 15 días hábiles siguientes. Si no se
          resuelve, puedes acudir a la Superintendencia de Industria y Comercio
          o a {courts()}.
        </P>
      </Section>

      <Section id="contacto" title={h("contacto")}>
        <ContactBlock />
      </Section>
    </>
  );
}

import type { Metadata } from "next";

import {
  ContactBlock,
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

export const metadata: Metadata = {
  title: "Política de Tratamiento de Datos Personales — BILLIFY",
};

const TOC = [
  ["responsable", "Responsable"],
  ["roles", "Tus datos y los de tus clientes"],
  ["datos", "Qué datos tratamos"],
  ["finalidades", "Para qué los usamos"],
  ["autorizacion", "Tu autorización"],
  ["terceros", "Proveedores y transferencias"],
  ["derechos", "Tus derechos"],
  ["procedimiento", "Cómo ejercerlos"],
  ["conservacion", "Cuánto tiempo los guardamos"],
  ["seguridad", "Seguridad"],
  ["menores", "Menores de edad"],
  ["vigencia", "Vigencia y cambios"],
  ["contacto", "Contacto"],
] as const;

const h = (id: (typeof TOC)[number][0]) => numbered(TOC, id);

export default function PrivacyPolicyPage() {
  return (
    <>
      <DocHeader
        title="Política de Tratamiento de Datos Personales"
        intro="Aquí explicamos qué datos personales trata BILLIFY, para qué, con quién los compartimos y cómo puedes conocerlos, corregirlos o pedir que se borren. Cumple la Ley 1581 de 2012 y el Decreto 1074 de 2015 (Habeas Data)."
      />
      <Toc items={TOC} />

      <Section id="responsable" title={h("responsable")}>
        <P>
          El responsable del tratamiento es <Provider />, con domicilio en{" "}
          {domicile()}. Correo para temas de datos personales:{" "}
          <Info field="privacyEmail" />.
        </P>
      </Section>

      <Section id="roles" title={h("roles")}>
        <P>
          Muchos negocios usan BILLIFY, cada uno con sus propios datos. Por eso
          hay dos papeles distintos:
        </P>
        <List>
          <li>
            <B>BILLIFY es Responsable</B> de los datos de las cuentas: los del
            propietario que registra el negocio y los de los usuarios que entran
            a la plataforma.
          </li>
          <li>
            <B>BILLIFY es Encargado</B> de los datos que cada negocio registra
            sobre <B>sus clientes y sus empleados</B>. El negocio es el
            Responsable de esos datos: debe tener la autorización de sus
            clientes y empleados y atender sus solicitudes. BILLIFY solo trata
            esos datos siguiendo las instrucciones del negocio y para prestarle
            el servicio.
          </li>
        </List>
      </Section>

      <Section id="datos" title={h("datos")}>
        <P>Tratamos solo lo necesario para prestar el servicio:</P>
        <List>
          <li>
            <B>Registro del negocio:</B> nombre y documento del negocio; nombre,
            cédula y correo del propietario; contraseña (guardada cifrada, nadie
            puede leerla). La cédula sirve para identificar a la persona
            responsable de la cuenta y verificar su identidad cuando hace
            solicitudes sobre ella.
          </li>
          <li>
            <B>Usuarios y empleados</B> (los registra el propietario): nombre,
            cédula, correo, teléfono si se agrega, rol y permisos.
          </li>
          <li>
            <B>Clientes del negocio</B> (los registra el negocio): nombre o
            alias, y si el negocio los agrega, documento, correo y teléfono; sus
            compras, fiados y abonos.
          </li>
          <li>
            <B>Operación del negocio:</B> productos, ventas, mesas, caja,
            inventario, el logo y las fotos de comprobantes de pago que se
            suban.
          </li>
          <li>
            <B>Pagos de la suscripción:</B> plan, valores, fechas y estado de
            cada pago. Los datos de tarjeta o de cuenta bancaria los recibe
            directamente la pasarela de pagos; BILLIFY no los guarda.
          </li>
          <li>
            <B>Seguridad:</B> dirección IP, navegador, intentos de inicio de
            sesión y un registro de qué usuario hizo cada acción importante
            (ventas, anulaciones, movimientos de caja).
          </li>
          <li>
            <B>En tu dispositivo:</B> la sesión, preferencias y ventas
            pendientes de enviar; lo detallamos en la{" "}
            <DocLink href="/legal/cookies">Política de Cookies</DocLink>.
          </li>
        </List>
        <P>
          No pedimos datos sensibles (salud, orientación, datos biométricos,
          etc.). Te pedimos no registrarlos en campos de notas o descripciones.
        </P>
      </Section>

      <Section id="finalidades" title={h("finalidades")}>
        <List>
          <li>
            Crear y administrar tu cuenta, la de tu negocio y las de tus
            usuarios.
          </li>
          <li>
            Prestar las funciones de la plataforma: ventas, mesas, caja, fiados,
            inventario y reportes.
          </li>
          <li>
            Enviar por correo las facturas en PDF a los clientes del negocio,
            cuando el negocio lo pide.
          </li>
          <li>
            Enviarte correos del servicio: códigos de verificación, cambio de
            contraseña, bienvenida, avisos de la prueba y recordatorios de pago.
          </li>
          <li>Cobrar la suscripción y llevar el registro de pagos.</li>
          <li>Darte soporte cuando lo pidas.</li>
          <li>
            Detectar accesos sospechosos, prevenir fraude y proteger la
            plataforma.
          </li>
          <li>
            Cumplir obligaciones legales y atender requerimientos de autoridades
            competentes.
          </li>
        </List>
        <P>
          No vendemos ni alquilamos datos personales, no los usamos para
          publicidad y no te enviaremos publicidad sin pedirte una autorización
          aparte.
        </P>
      </Section>

      <Section id="autorizacion" title={h("autorizacion")}>
        <P>
          Nos das tu autorización al marcar la casilla de aceptación en el
          registro, de forma previa, expresa e informada. Como prueba guardamos
          la fecha y hora, la versión de los documentos que aceptaste, la
          dirección IP y el navegador desde los que lo hiciste, y te enviamos
          una constancia a tu correo. Puedes revocarla en
          cualquier momento (sección{" "}
          {TOC.findIndex(([id]) => id === "procedimiento") + 1}), salvo cuando
          debamos conservar los datos por una obligación legal o contractual
          vigente, como mientras tengas la cuenta activa.
        </P>
      </Section>

      <Section id="terceros" title={h("terceros")}>
        <P>
          Para operar usamos proveedores que tratan datos por nuestra cuenta,
          con obligaciones de confidencialidad y seguridad, y solo para lo que
          les encargamos:
        </P>
        <List>
          <li>
            <B>Vercel</B> (Estados Unidos): aloja la aplicación.
          </li>
          <li>
            <B>Supabase</B> (Estados Unidos): base de datos y almacenamiento de
            archivos (logos y comprobantes).
          </li>
          <li>
            <B>Brevo</B> (Unión Europea): envío de correos.
          </li>
          <li>
            <B>Wompi</B> (Colombia): pasarela para pagar la suscripción.
          </li>
        </List>
        <P>
          Algunos de estos proveedores están fuera de Colombia. Al aceptar esta
          política autorizas esa transmisión internacional, que se hace solo
          para prestarte el servicio y a países con niveles adecuados de
          protección o con garantías contractuales.
        </P>
        <P>
          El personal autorizado de BILLIFY solo accede a los datos de un
          negocio cuando hace falta para darle soporte, gestionar su suscripción
          o atender un problema de seguridad, y esos accesos quedan registrados.
        </P>
      </Section>

      <Section id="derechos" title={h("derechos")}>
        <P>Como titular de tus datos tienes derecho a:</P>
        <List>
          <li>Conocerlos, actualizarlos y corregirlos.</li>
          <li>Pedir prueba de la autorización que nos diste.</li>
          <li>Saber qué uso les hemos dado.</li>
          <li>
            Revocar la autorización o pedir que los borremos, cuando no haya un
            deber legal o contractual de guardarlos.
          </li>
          <li>Consultarlos gratis.</li>
          <li>
            Quejarte ante la Superintendencia de Industria y Comercio (SIC),
            después de haber hecho tu consulta o reclamo ante nosotros.
          </li>
        </List>
        <P>
          Si eres cliente o empleado de un negocio que usa BILLIFY, dirige tu
          solicitud primero a ese negocio, que es el responsable de tus datos.
          Si nos escribes a nosotros, se la haremos llegar.
        </P>
      </Section>

      <Section id="procedimiento" title={h("procedimiento")}>
        <P>
          Escríbenos a <Info field="privacyEmail" /> con tu nombre, tu
          documento, lo que pides y un correo de respuesta. Si actúas en nombre
          de otra persona, adjunta el poder o documento que te autoriza.
        </P>
        <List>
          <li>
            <B>Consultas</B> (conocer tus datos): respondemos en máximo 10 días
            hábiles. Si no alcanzamos, te avisamos el motivo y respondemos en
            máximo 5 días hábiles más.
          </li>
          <li>
            <B>Reclamos</B> (corregir, actualizar, borrar o revocar):
            respondemos en máximo 15 días hábiles, prorrogables 8 días hábiles
            más avisándote el motivo. Si al reclamo le falta información, te
            pedimos completarla dentro de los 5 días siguientes; si pasan 2
            meses sin respuesta, entendemos que desististe.
          </li>
        </List>
      </Section>

      <Section id="conservacion" title={h("conservacion")}>
        <P>
          Guardamos los datos mientras tu cuenta esté activa. Si cancelas, los
          conservamos durante <Info field="retentionAfterCancel" /> para que
          puedas volver o descargarlos, y después los eliminamos, salvo lo que
          debamos guardar por obligaciones legales, contables o tributarias. Los
          registros de seguridad se guardan solo el tiempo necesario para
          proteger la plataforma.
        </P>
      </Section>

      <Section id="seguridad" title={h("seguridad")}>
        <P>
          Protegemos los datos con conexiones cifradas, contraseñas guardadas
          con cifrado de una sola vía, separación de los datos de cada negocio,
          permisos por rol, bloqueo tras varios intentos fallidos de inicio de
          sesión, sesiones que se cierran solas a las 24 horas y registro de
          auditoría. Ningún sistema es infalible: si ocurre un incidente que
          afecte tus datos, te avisaremos y lo informaremos a la SIC como exige
          la ley.
        </P>
      </Section>

      <Section id="menores" title={h("menores")}>
        <P>
          BILLIFY es para negocios y para personas mayores de edad que los
          representan o trabajan en ellos. No tratamos a sabiendas datos de
          menores de edad.
        </P>
      </Section>

      <Section id="vigencia" title={h("vigencia")}>
        <P>
          Esta política rige desde la fecha de actualización indicada arriba.
          Nuestras bases de datos estarán vigentes mientras prestemos el
          servicio y durante los plazos de conservación descritos. Si hacemos
          cambios importantes, te avisaremos por correo antes de que apliquen.
        </P>
      </Section>

      <Section id="contacto" title={h("contacto")}>
        <ContactBlock />
      </Section>
    </>
  );
}

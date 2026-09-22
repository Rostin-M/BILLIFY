import type { Metadata } from "next";
import Link from "next/link";
import { Placeholder } from "../_components/Placeholder";

export const metadata: Metadata = { title: "Política de Privacidad — BILLIFY" };

export default function PrivacyPolicyPage() {
  return (
    <>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Política de Privacidad</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Última actualización: <Placeholder>[fecha de publicación]</Placeholder>
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">1. Quiénes somos</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          BILLIFY (&quot;BILLIFY&quot;, &quot;nosotros&quot;) es un software como servicio (SaaS) de punto
          de venta y facturación para pequeños negocios en Colombia, operado por{" "}
          <Placeholder>[razón social de BILLIFY]</Placeholder>, identificada con NIT{" "}
          <Placeholder>[NIT de BILLIFY]</Placeholder>, con domicilio en{" "}
          <Placeholder>[dirección de BILLIFY]</Placeholder>. Esta política explica qué datos
          personales recopilamos, para qué los usamos y qué derechos tienes sobre ellos, en
          cumplimiento de la Ley 1581 de 2012 y el Decreto 1074 de 2015 (Habeas Data) de Colombia.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. Dos roles distintos: BILLIFY y tu negocio</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          BILLIFY es un producto multi-negocio: distintas empresas usan la misma plataforma, cada
          una con sus propios clientes y datos. Por eso existen dos roles separados frente a la ley:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <li>
            <span className="font-medium text-slate-800 dark:text-slate-100">BILLIFY como Responsable del Tratamiento</span>{" "}
            de los datos de la cuenta: el nombre y documento del negocio que se registra, el nombre
            y cédula del propietario, su correo y su actividad dentro de la plataforma.
          </li>
          <li>
            <span className="font-medium text-slate-800 dark:text-slate-100">BILLIFY como Encargado del Tratamiento</span>{" "}
            de los datos que cada negocio ingresa sobre sus propios clientes (por ejemplo, nombres
            de clientes en mesas, fiados o ventas facturadas). El negocio que usa BILLIFY es el{" "}
            <span className="font-medium text-slate-800 dark:text-slate-100">Responsable</span> de
            esos datos y es quien debe contar con la autorización de sus propios clientes para
            tratarlos.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. Qué datos recopilamos</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Recopilamos únicamente los datos necesarios para prestar el servicio:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <li>
            <span className="font-medium text-slate-800 dark:text-slate-100">Datos de registro del negocio:</span>{" "}
            nombre del negocio, NIT/documento del negocio, nombre y cédula del propietario, correo
            electrónico y contraseña (almacenada cifrada, nunca en texto plano). La cédula del
            propietario se solicita porque el negocio queda identificado como responsable ante la
            DIAN en la facturación que genera desde la plataforma.
          </li>
          <li>
            <span className="font-medium text-slate-800 dark:text-slate-100">Datos operativos que tu negocio ingresa:</span>{" "}
            productos, precios, inventario, ventas, clientes (fiados, mesas), empleados que
            autorices y movimientos de caja. Estos datos son tuyos y los tratamos por tu cuenta.
          </li>
          <li>
            <span className="font-medium text-slate-800 dark:text-slate-100">Datos técnicos mínimos:</span>{" "}
            una cookie de sesión para mantenerte autenticado y registros de auditoría (qué usuario
            hizo qué acción y cuándo) para seguridad y trazabilidad de tu propio negocio. No usamos
            cookies de analítica ni de publicidad — ver la{" "}
            <Link href="/legal/cookies" className="text-violet-600 underline underline-offset-2 dark:text-violet-400">
              Política de Cookies
            </Link>.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">4. Para qué usamos tus datos</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <li>Crear y administrar tu cuenta y la de tu negocio.</li>
          <li>Prestar las funciones de la plataforma (ventas, inventario, mesas, caja, facturación).</li>
          <li>Generar facturas electrónicas ante la DIAN cuando tu negocio lo requiera.</li>
          <li>Enviarte comunicaciones operativas (verificación de correo, restablecimiento de contraseña).</li>
          <li>Dar soporte técnico cuando lo solicites.</li>
          <li>Prevenir fraude y proteger la seguridad de la plataforma.</li>
          <li>Cumplir obligaciones legales y tributarias aplicables.</li>
        </ul>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          No vendemos ni alquilamos tus datos personales ni los de tus clientes a terceros, y no los
          usamos con fines publicitarios.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">5. Base legal</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Tratamos tus datos con base en la autorización que otorgas al crear tu cuenta (aceptando
          esta política y los{" "}
          <Link href="/legal/terminos" className="text-violet-600 underline underline-offset-2 dark:text-violet-400">
            Términos y Condiciones
          </Link>
          ) y en la ejecución del servicio que contrataste con nosotros.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">6. Con quién compartimos datos</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Solo compartimos datos con proveedores estrictamente necesarios para operar la plataforma
          (por ejemplo, nuestro proveedor de base de datos y almacenamiento en la nube, y la DIAN
          cuando generas una factura electrónica), bajo obligaciones contractuales de
          confidencialidad y seguridad. Parte de esta infraestructura puede estar ubicada fuera de
          Colombia (por ejemplo, en Estados Unidos), lo que implica una transferencia internacional
          de datos necesaria para prestarte el servicio; en ese caso adoptamos medidas contractuales
          razonables para proteger tu información.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">7. Conservación de los datos</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Conservamos tus datos mientras tu cuenta esté activa y por el tiempo adicional que exijan
          las normas contables, tributarias o de archivo aplicables en Colombia. Si cierras tu
          cuenta, puedes solicitar la eliminación de tus datos conforme a la sección 9, salvo la
          información que debamos conservar por obligación legal.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">8. Seguridad</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Aplicamos medidas técnicas y administrativas razonables (cifrado de contraseñas, control
          de acceso por rol, conexiones cifradas) para proteger tus datos. Ningún sistema es
          completamente infalible; si detectamos un incidente de seguridad que te afecte, te lo
          informaremos conforme a la normativa aplicable.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">9. Tus derechos (Habeas Data)</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Como titular de tus datos personales, tienes derecho a:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <li>Conocer, actualizar y rectificar tus datos personales.</li>
          <li>Solicitar prueba de la autorización que nos otorgaste.</li>
          <li>Ser informado sobre el uso que le hemos dado a tus datos.</li>
          <li>Revocar tu autorización y/o solicitar la supresión de tus datos, cuando no exista un deber legal de conservarlos.</li>
          <li>Presentar quejas ante la Superintendencia de Industria y Comercio (SIC) por infracciones a la ley.</li>
          <li>Acceder de forma gratuita a tus datos personales.</li>
        </ul>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Para ejercer estos derechos escríbenos a{" "}
          <Placeholder>[correo de contacto para datos personales]</Placeholder>. Responderemos tu
          solicitud dentro de los plazos que establece la ley.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">10. Menores de edad</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          BILLIFY está dirigido a negocios y a personas mayores de edad que los representan. No
          recopilamos intencionalmente datos de menores de edad.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">11. Cambios a esta política</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Podemos actualizar esta política para reflejar cambios en el servicio o en la normativa
          aplicable. Publicaremos la fecha de la última actualización al inicio de este documento.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">12. Contacto</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <Placeholder>[razón social de BILLIFY]</Placeholder> · NIT{" "}
          <Placeholder>[NIT de BILLIFY]</Placeholder> ·{" "}
          <Placeholder>[dirección de BILLIFY]</Placeholder> ·{" "}
          <Placeholder>[correo de contacto]</Placeholder>
        </p>
      </section>
    </>
  );
}

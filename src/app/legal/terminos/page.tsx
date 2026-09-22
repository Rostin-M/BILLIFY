import type { Metadata } from "next";
import Link from "next/link";
import { Placeholder } from "../_components/Placeholder";

export const metadata: Metadata = { title: "Términos y Condiciones — BILLIFY" };

export default function TermsPage() {
  return (
    <>
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Términos y Condiciones</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Última actualización: <Placeholder>[fecha de publicación]</Placeholder>
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">1. Aceptación</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Al registrar un negocio o usar BILLIFY aceptas estos Términos y Condiciones y nuestra{" "}
          <Link href="/legal/privacidad" className="text-violet-600 underline underline-offset-2 dark:text-violet-400">
            Política de Privacidad
          </Link>
          . Si no estás de acuerdo, no debes usar la plataforma.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">2. Qué es BILLIFY</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          BILLIFY es un software como servicio (SaaS) para gestionar ventas, inventario, mesas,
          caja y facturación de pequeños negocios en Colombia, operado por{" "}
          <Placeholder>[razón social de BILLIFY]</Placeholder>, NIT{" "}
          <Placeholder>[NIT de BILLIFY]</Placeholder>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">3. Registro y responsabilidad de la cuenta</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <li>Debes registrarte con información veraz sobre tu negocio y tu identidad.</li>
          <li>Eres responsable de mantener la confidencialidad de tu contraseña y de toda actividad realizada desde tu cuenta.</li>
          <li>Debes notificarnos de inmediato si sospechas un uso no autorizado de tu cuenta.</li>
          <li>Solo personas mayores de edad, autorizadas para representar el negocio, pueden registrar una cuenta.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">4. Responsabilidad sobre los datos que ingresas</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Los datos que registras dentro de BILLIFY (productos, ventas, clientes, empleados) son de
          tu negocio. Eres responsable de que esa información sea correcta, de contar con la
          autorización de tus propios clientes para tratar sus datos personales, y de usar la
          plataforma conforme a la ley colombiana aplicable, incluida la normativa tributaria y de
          protección de datos.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">5. Uso permitido</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          BILLIFY debe usarse para la operación legítima de tu negocio. No está permitido:
        </p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <li>Usar la plataforma para actividades ilegales o fraudulentas.</li>
          <li>Intentar vulnerar la seguridad de la plataforma o acceder a datos de otros negocios.</li>
          <li>Revender, sublicenciar o distribuir el acceso a BILLIFY sin autorización.</li>
          <li>Introducir código malicioso o sobrecargar deliberadamente el servicio.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">6. Planes y pagos</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          <Placeholder>
            [Describir aquí los planes disponibles, precios, periodicidad de facturación y política
            de reembolsos vigentes]
          </Placeholder>
          .
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">7. Propiedad intelectual</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          El software, marca, diseño y contenido de BILLIFY son propiedad de{" "}
          <Placeholder>[razón social de BILLIFY]</Placeholder> y están protegidos por las leyes de
          propiedad intelectual aplicables. Te otorgamos una licencia limitada, no exclusiva e
          intransferible para usar la plataforma mientras tu cuenta esté activa. Los datos que tú
          ingreses (tu inventario, tus ventas, tu información de negocio) siguen siendo tuyos.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">8. Disponibilidad y cambios en el servicio</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Trabajamos para mantener BILLIFY disponible, pero no garantizamos un servicio libre de
          interrupciones. Podemos actualizar, modificar o descontinuar funciones, notificándote con
          antelación razonable cuando el cambio te afecte de forma significativa.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">9. Limitación de responsabilidad</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          BILLIFY se ofrece &quot;tal cual&quot;. En la medida permitida por la ley, no somos
          responsables por pérdidas indirectas, lucro cesante o daños derivados del uso indebido de
          la plataforma, de errores en la información que tú ingresas, o de fallas de terceros
          (conectividad, proveedores de infraestructura) fuera de nuestro control razonable.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">10. Suspensión y terminación</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Puedes dejar de usar BILLIFY en cualquier momento. Podemos suspender o cerrar tu cuenta si
          incumples estos términos, si detectamos uso fraudulento, o por falta de pago cuando
          corresponda, previa notificación razonable salvo en casos de riesgo grave e inmediato.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">11. Modificaciones a estos términos</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Podemos actualizar estos términos. Si el cambio es sustancial, te lo notificaremos por los
          medios de contacto que registraste. El uso continuado de BILLIFY después de una
          actualización implica tu aceptación de los nuevos términos.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">12. Ley aplicable y jurisdicción</h2>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Estos términos se rigen por las leyes de la República de Colombia. Cualquier controversia
          se someterá a los jueces competentes de{" "}
          <Placeholder>[ciudad de domicilio de BILLIFY]</Placeholder>, Colombia.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">13. Contacto</h2>
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

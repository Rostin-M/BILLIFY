import { Compass } from "lucide-react";
import Link from "next/link";

import { buttonClass, cardClass, EmptyBlock } from "./_components/ui";

export default function AdminNotFound() {
  return (
    <div className={cardClass}>
      <EmptyBlock
        icon={Compass}
        title="Esta página del panel no existe"
        description="Puede que el enlace esté mal escrito o que la sección haya cambiado de lugar."
        action={
          <Link href="/admin" className={buttonClass.secondary}>
            Ir al resumen
          </Link>
        }
      />
    </div>
  );
}

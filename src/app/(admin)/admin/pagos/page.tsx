import { Suspense } from "react";

import { PaymentsScreen } from "../_screens/PaymentsScreen";

export default function AdminPaymentsPage() {
  // Suspense: la pantalla lee sus filtros de la URL con useSearchParams.
  return (
    <Suspense>
      <PaymentsScreen />
    </Suspense>
  );
}

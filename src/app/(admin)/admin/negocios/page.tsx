import { Suspense } from "react";

import { BusinessesScreen } from "../_screens/BusinessesScreen";

export default function AdminBusinessesPage() {
  // Suspense: la pantalla lee sus filtros de la URL con useSearchParams.
  return (
    <Suspense>
      <BusinessesScreen />
    </Suspense>
  );
}

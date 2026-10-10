import { BusinessDetailScreen } from "../../_screens/BusinessDetailScreen";

export default async function AdminBusinessDetailPage({
  params,
}: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params;
  // `key`: al pasar de un negocio a otro se descarta el estado del anterior.
  return <BusinessDetailScreen key={id} businessId={id} />;
}

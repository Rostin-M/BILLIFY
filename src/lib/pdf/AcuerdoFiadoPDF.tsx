import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { creditLimitLabel } from "~/lib/creditTerms";

const s = StyleSheet.create({
  page: { fontSize: 10, paddingVertical: 40, paddingHorizontal: 44, fontFamily: "Helvetica", color: "#1e293b" },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 16 },
  logo: { width: 48, height: 48, objectFit: "contain" },
  bizName: { fontSize: 14, fontWeight: "bold", marginBottom: 3 },
  bizSub: { fontSize: 8.5, color: "#64748b", marginBottom: 1.5 },
  title: { fontSize: 15, fontWeight: "bold", color: "#7c3aed", marginBottom: 4 },
  subtitle: { fontSize: 9, color: "#64748b", marginBottom: 14 },
  infoRow: { flexDirection: "row", gap: 16, marginBottom: 12 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 7.5, color: "#94a3b8", fontWeight: "bold", textTransform: "uppercase", marginBottom: 2 },
  infoValue: { fontSize: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginVertical: 12 },
  sectionLabel: { fontSize: 8, color: "#64748b", fontWeight: "bold", textTransform: "uppercase", marginBottom: 6 },
  paragraph: { fontSize: 9.5, lineHeight: 1.5, marginBottom: 5 },
  signatureArea: { marginTop: 22, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  signatureBox: { width: 240 },
  signatureImage: { width: 220, height: 90, objectFit: "contain" },
  signatureLine: { borderTopWidth: 1, borderTopColor: "#334155", paddingTop: 4 },
  signatureName: { fontSize: 9.5, fontWeight: "bold" },
  signatureSub: { fontSize: 8, color: "#64748b" },
  noSignature: { fontSize: 9, color: "#94a3b8", marginBottom: 8 },
  footer: { marginTop: "auto", paddingTop: 16, borderTopWidth: 0.5, borderTopColor: "#e2e8f0", alignItems: "center" },
  footerLine: { fontSize: 7.5, color: "#94a3b8", marginBottom: 2, textAlign: "center" },
});

const formatDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

export type CreditAgreementForPdf = {
  id: string;
  createdAt: Date | string;
  creditLimit: number | null;
  creditTermDays: number | null;
  terms: string;
  signerName: string;
  signerDocument: string | null;
  signature: string | null;
  customer: { name: string; document: string | null; phone: string | null; email: string | null };
  registeredBy: string | null;
};

export type BusinessForAgreementPdf = {
  name: string;
  document: string;
  address: string | null;
  phone: string | null;
  logoUrl?: string | null;
};

export function AcuerdoFiadoPDF({ business, agreement }: Readonly<{ business: BusinessForAgreementPdf; agreement: CreditAgreementForPdf }>) {
  // Cada párrafo lleva su posición en la clave: dos párrafos pueden tener el mismo texto.
  const paragraphs = agreement.terms
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text, n) => ({ key: `${n}-${text.slice(0, 24)}`, text }));
  const termLabel = agreement.creditTermDays ? `${agreement.creditTermDays} días` : "Sin fecha fija";

  return (
    <Document title={`Acuerdo de fiado - ${agreement.customer.name}`} author={business.name}>
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          {business.logoUrl ? <Image src={business.logoUrl} style={s.logo} /> : null}
          <View>
            <Text style={s.bizName}>{business.name}</Text>
            <Text style={s.bizSub}>NIT/CC: {business.document}</Text>
            {business.address ? <Text style={s.bizSub}>{business.address}</Text> : null}
            {business.phone ? <Text style={s.bizSub}>Tel. {business.phone}</Text> : null}
          </View>
        </View>

        <Text style={s.title}>Acuerdo de cuenta de fiado</Text>
        <Text style={s.subtitle}>Aceptado el {formatDateTime(agreement.createdAt)} · Ref. {agreement.id}</Text>

        <View style={s.infoRow}>
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Cliente</Text>
            <Text style={s.infoValue}>{agreement.customer.name}</Text>
            {agreement.customer.document ? <Text style={s.bizSub}>Doc. {agreement.customer.document}</Text> : null}
            {agreement.customer.phone ? <Text style={s.bizSub}>Tel. {agreement.customer.phone}</Text> : null}
          </View>
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Monto máximo</Text>
            <Text style={s.infoValue}>{creditLimitLabel(agreement.creditLimit)}</Text>
          </View>
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Plazo de pago</Text>
            <Text style={s.infoValue}>{termLabel}</Text>
          </View>
        </View>

        <View style={s.divider} />
        <Text style={s.sectionLabel}>Condiciones</Text>
        {paragraphs.map((p) => (
          <Text key={p.key} style={s.paragraph}>{p.text}</Text>
        ))}

        <View style={s.signatureArea} wrap={false}>
          <View style={s.signatureBox}>
            {agreement.signature ? (
              <Image src={agreement.signature} style={s.signatureImage} />
            ) : (
              <Text style={s.noSignature}>Aceptado sin firma.</Text>
            )}
            <View style={s.signatureLine}>
              <Text style={s.signatureName}>{agreement.signerName}</Text>
              {agreement.signerDocument ? <Text style={s.signatureSub}>Doc. {agreement.signerDocument}</Text> : null}
              <Text style={s.signatureSub}>Firma del cliente</Text>
            </View>
          </View>
          {agreement.registeredBy ? (
            <Text style={s.signatureSub}>Registrado por {agreement.registeredBy}</Text>
          ) : null}
        </View>

        <View style={s.footer}>
          <Text style={s.footerLine}>
            Documento generado con BILLIFY como constancia de la aceptación de las condiciones de fiado.
          </Text>
          <Text style={s.footerLine}>No es un título valor.</Text>
        </View>
      </Page>
    </Document>
  );
}

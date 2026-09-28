import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  CREDIT: "Crédito",
};

const s = StyleSheet.create({
  page: { fontSize: 10, paddingVertical: 40, paddingHorizontal: 44, fontFamily: "Helvetica", color: "#1e293b" },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  headerLeft: { flexDirection: "row", alignItems: "flex-start", gap: 10, flex: 1 },
  logo: { width: 52, height: 52, objectFit: "contain" },
  bizBlock: { flex: 1 },
  bizName: { fontSize: 14, fontWeight: "bold", marginBottom: 3 },
  bizSub: { fontSize: 8.5, color: "#64748b", marginBottom: 1.5 },
  headerRight: { alignItems: "flex-end", minWidth: 140 },
  docTitle: { fontSize: 11, fontWeight: "bold", color: "#7c3aed", marginBottom: 3 },
  docNumber: { fontSize: 10, fontWeight: "bold", marginBottom: 2 },
  docDate: { fontSize: 8, color: "#64748b" },

  divider: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginVertical: 12 },
  dividerLight: { borderBottomWidth: 0.5, borderBottomColor: "#f1f5f9", marginVertical: 8 },

  // Info row
  infoRow: { flexDirection: "row", gap: 16, marginBottom: 14 },
  infoBlock: { flex: 1 },
  infoLabel: { fontSize: 7.5, color: "#94a3b8", fontWeight: "bold", textTransform: "uppercase", marginBottom: 2 },
  infoValue: { fontSize: 9.5 },
  infoSub: { fontSize: 8.5, color: "#64748b", marginTop: 1 },

  // Table
  tableHeader: { flexDirection: "row", backgroundColor: "#f8fafc", paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  tableRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: "#f1f5f9" },
  tableRowAlt: { backgroundColor: "#fafafa" },
  thText: { fontSize: 7.5, fontWeight: "bold", color: "#64748b" },
  tdText: { fontSize: 9.5 },
  colQty: { width: "8%", textAlign: "right" },
  colUnit: { width: "10%", textAlign: "center" },
  colName: { flex: 1 },
  colPrice: { width: "18%", textAlign: "right" },
  colTax: { width: "14%", textAlign: "right" },
  colSub: { width: "18%", textAlign: "right" },
  itemTaxLabel: { fontSize: 7, color: "#94a3b8", marginTop: 1 },

  // Totals
  totalsArea: { marginTop: 14, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", width: 210, marginBottom: 3 },
  totalLabel: { fontSize: 9, color: "#475569" },
  totalValue: { fontSize: 9 },
  grandRow: { flexDirection: "row", justifyContent: "space-between", width: 210, borderTopWidth: 1.5, borderTopColor: "#7c3aed", paddingTop: 6, marginTop: 4 },
  grandLabel: { fontSize: 12, fontWeight: "bold" },
  grandValue: { fontSize: 12, fontWeight: "bold", color: "#7c3aed" },

  // Note
  noteBox: { marginTop: 14, padding: 8, backgroundColor: "#f8fafc", borderRadius: 4, borderLeftWidth: 3, borderLeftColor: "#e2e8f0" },
  noteLabel: { fontSize: 7.5, color: "#94a3b8", fontWeight: "bold", textTransform: "uppercase", marginBottom: 2 },
  noteText: { fontSize: 9, color: "#475569" },

  // Footer
  footer: { marginTop: "auto", paddingTop: 20, borderTopWidth: 0.5, borderTopColor: "#e2e8f0", alignItems: "center" },
  footerLine: { fontSize: 7.5, color: "#94a3b8", marginBottom: 2, textAlign: "center" },
  footerCopy: { fontSize: 7, color: "#cbd5e1", marginTop: 2, textAlign: "center" },
});

const formatCOP = (v: number) =>
  v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

const formatDateTime = (d: Date | string) =>
  new Date(d).toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

export type BusinessInfoForPdf = {
  name: string;
  document: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  invoiceTaxDetail?: "SUMMARY" | "PER_ITEM";
  logoUrl?: string | null;
};

export type TaxLine = { name: string; rate: number; amount: number };

export type SaleForPdf = {
  invoiceNumber: string;
  createdAt: Date | string;
  customer: { name: string; document?: string | null } | null;
  user: { name: string | null } | null;
  items: {
    name: string;
    unit: string;
    quantity: number;
    price: number;
    subtotal: number;
    taxLines?: TaxLine[] | null;
  }[];
  subtotal: number;
  taxAmount: number;
  taxLines: TaxLine[] | null;
  total: number;
  paymentMethod: string;
  note: string | null;
};

export function FacturaPDF({ business, sale }: Readonly<{ business: BusinessInfoForPdf; sale: SaleForPdf }>) {
  let totalsSection: React.ReactNode = null;
  if ((sale.taxLines?.length ?? 0) > 0) {
    totalsSection = (
      <>
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Subtotal</Text>
          <Text style={s.totalValue}>{formatCOP(sale.subtotal)}</Text>
        </View>
        {(sale.taxLines ?? []).map((tax, i) => (
          <View key={i} style={s.totalRow}>
            <Text style={s.totalLabel}>{tax.name} ({tax.rate}%)</Text>
            <Text style={s.totalValue}>{formatCOP(tax.amount)}</Text>
          </View>
        ))}
      </>
    );
  } else if (sale.taxAmount > 0) {
    totalsSection = (
      <>
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Subtotal</Text>
          <Text style={s.totalValue}>{formatCOP(sale.subtotal)}</Text>
        </View>
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Impuesto</Text>
          <Text style={s.totalValue}>{formatCOP(sale.taxAmount)}</Text>
        </View>
      </>
    );
  }

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {business.logoUrl ? (
              <Image src={business.logoUrl} style={s.logo} />
            ) : null}
            <View style={s.bizBlock}>
              <Text style={s.bizName}>{business.name}</Text>
              <Text style={s.bizSub}>NIT: {business.document}</Text>
              {business.address ? <Text style={s.bizSub}>{business.address}</Text> : null}
              {business.phone ? <Text style={s.bizSub}>Tel: {business.phone}</Text> : null}
              {business.email ? <Text style={s.bizSub}>{business.email}</Text> : null}
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>FACTURA DE VENTA</Text>
            <Text style={s.docNumber}>{sale.invoiceNumber}</Text>
            <Text style={s.docDate}>{formatDateTime(sale.createdAt)}</Text>
          </View>
        </View>

        <View style={s.divider} />

        {/* Info cliente / pago / cajero */}
        <View style={s.infoRow}>
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Cliente</Text>
            <Text style={s.infoValue}>{sale.customer?.name ?? "Consumidor Final"}</Text>
            {sale.customer?.document ? (
              <Text style={s.infoSub}>Doc: {sale.customer.document}</Text>
            ) : null}
          </View>
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Método de pago</Text>
            <Text style={s.infoValue}>{PAYMENT_LABELS[sale.paymentMethod] ?? sale.paymentMethod}</Text>
          </View>
          {sale.user?.name ? (
            <View style={s.infoBlock}>
              <Text style={s.infoLabel}>Cajero</Text>
              <Text style={s.infoValue}>{sale.user.name}</Text>
            </View>
          ) : null}
        </View>

        {/* Tabla de ítems */}
        {(() => {
          const perItemTax = business.invoiceTaxDetail === "PER_ITEM";
          return (
            <>
              <View style={s.tableHeader}>
                <Text style={[s.colQty, s.thText]}>Cant.</Text>
                <Text style={[s.colUnit, s.thText]}>Und.</Text>
                <Text style={[s.colName, s.thText]}>Producto</Text>
                <Text style={[s.colPrice, s.thText]}>Precio unit.</Text>
                {perItemTax ? <Text style={[s.colTax, s.thText]}>Impuesto</Text> : null}
                <Text style={[s.colSub, s.thText]}>Subtotal</Text>
              </View>
              {sale.items.map((item, i) => {
                const itemTaxLines = perItemTax ? (item.taxLines ?? []) : [];
                const itemTaxAmount = itemTaxLines.reduce((sum, t) => sum + t.amount, 0);
                const taxLabel = itemTaxLines.map((t) => `${t.name} ${t.rate}%`).join(", ");
                return (
                  <View key={i} style={[s.tableRow, i % 2 !== 0 ? s.tableRowAlt : {}]}>
                    <Text style={[s.colQty, s.tdText]}>{item.quantity}</Text>
                    <Text style={[s.colUnit, s.tdText]}>{item.unit}</Text>
                    <View style={s.colName}>
                      <Text style={s.tdText}>{item.name}</Text>
                      {taxLabel ? <Text style={s.itemTaxLabel}>{taxLabel}</Text> : null}
                    </View>
                    <Text style={[s.colPrice, s.tdText]}>{formatCOP(item.price)}</Text>
                    {perItemTax ? (
                      <Text style={[s.colTax, s.tdText]}>
                        {itemTaxAmount > 0 ? formatCOP(itemTaxAmount) : "-"}
                      </Text>
                    ) : null}
                    <Text style={[s.colSub, s.tdText]}>{formatCOP(item.subtotal)}</Text>
                  </View>
                );
              })}
            </>
          );
        })()}

        {/* Totales */}
        <View style={s.totalsArea}>
          {totalsSection}
          <View style={s.grandRow}>
            <Text style={s.grandLabel}>TOTAL</Text>
            <Text style={s.grandValue}>{formatCOP(sale.total)}</Text>
          </View>
        </View>

        {sale.note ? (
          <View style={s.noteBox}>
            <Text style={s.noteLabel}>Nota</Text>
            <Text style={s.noteText}>{sale.note}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerLine}>
            Este documento es una factura operativa · No tiene validez tributaria ante la DIAN
          </Text>
          <Text style={s.footerLine}>Generado con BILLIFY · Software de punto de venta para pequeños negocios</Text>
          <Text style={s.footerCopy}>© 2026 BILLIFY. Todos los derechos reservados.</Text>
        </View>
      </Page>
    </Document>
  );
}

import { Document, Image, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

const s = StyleSheet.create({
  page: { fontSize: 10, paddingVertical: 40, paddingHorizontal: 44, fontFamily: "Helvetica", color: "#1e293b" },

  // Header
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  headerLeft: { flexDirection: "row", alignItems: "flex-start", gap: 10, flex: 1 },
  logo: { width: 52, height: 52, objectFit: "contain" },
  bizBlock: { flex: 1 },
  bizName: { fontSize: 14, fontWeight: "bold", marginBottom: 3 },
  bizSub: { fontSize: 8.5, color: "#64748b", marginBottom: 1.5 },
  headerRight: { alignItems: "flex-end", minWidth: 150 },
  docTitle: { fontSize: 11, fontWeight: "bold", color: "#1e293b", marginBottom: 3, textAlign: "right" },
  docSub: { fontSize: 8.5, color: "#64748b", textAlign: "right", marginBottom: 1.5 },

  divider: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginVertical: 12 },

  // Guest
  guestHeader: { fontSize: 11, fontWeight: "bold", marginBottom: 4, marginTop: 6, backgroundColor: "#f8fafc", padding: 5, borderRadius: 3 },
  roundLabel: { fontSize: 8.5, color: "#64748b", marginBottom: 4, marginTop: 2 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2.5 },
  itemName: { flex: 1, fontSize: 9, color: "#334155" },
  itemAmt: { fontSize: 9, color: "#334155" },
  roundTotRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 3, borderTopWidth: 0.5, borderTopColor: "#cbd5e1" },
  roundTotLabel: { fontSize: 8.5, color: "#64748b" },
  roundTotValue: { fontSize: 8.5, color: "#334155" },
  guestTotalRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 5, borderTopWidth: 1, borderTopColor: "#94a3b8" },
  guestTotalLabel: { fontSize: 10, fontWeight: "bold" },
  guestTotalValue: { fontSize: 10, fontWeight: "bold" },

  grandRow: { flexDirection: "row", justifyContent: "space-between", paddingTop: 8, marginTop: 4, borderTopWidth: 1.5, borderTopColor: "#1e293b" },
  grandLabel: { fontSize: 13, fontWeight: "bold" },
  grandValue: { fontSize: 13, fontWeight: "bold" },

  footer: { marginTop: "auto", paddingTop: 20, borderTopWidth: 0.5, borderTopColor: "#e2e8f0", alignItems: "center" },
  footerLine: { fontSize: 7.5, color: "#94a3b8", marginBottom: 2, textAlign: "center" },
  footerCopy: { fontSize: 7, color: "#cbd5e1", marginTop: 2, textAlign: "center" },
});

const fmt = (v: number) =>
  v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

export type TaxLineForPdf = { name: string; rate: number; amount: number };

export type TableOrderForPdf = {
  createdAt: Date | string;
  note: string | null;
  servedBy: string | null;
  subtotal: number;
  taxAmount: number;
  taxLines: TaxLineForPdf[] | null;
  total: number;
  items: { name: string; unit: string; quantity: number; price: number; subtotal: number }[];
};

export type TableGuestForPdf = {
  name: string;
  description: string | null;
  orders: TableOrderForPdf[];
};

export type MesaForPdf = {
  name: string;
  openedAt: Date | string;
  closedAt: Date | string | null;
  openedBy: string | null;
  guests: TableGuestForPdf[];
};

type Props = {
  business: { name: string; document: string; logoUrl?: string | null };
  mesa: MesaForPdf;
};

export function MesaPDF({ business, mesa }: Readonly<Props>) {
  const grandTotal = mesa.guests.reduce((sum, g) => sum + g.orders.reduce((s, o) => s + o.total, 0), 0);

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
              <Text style={s.bizSub}>NIT / CC: {business.document}</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>REPORTE DE MESA</Text>
            <Text style={s.docSub}>{mesa.name}</Text>
            <Text style={s.docSub}>Apertura: {fmtDate(mesa.openedAt)} · {fmtTime(mesa.openedAt)}</Text>
            {mesa.closedAt ? (
              <Text style={s.docSub}>Cierre: {fmtTime(mesa.closedAt)}</Text>
            ) : null}
            {mesa.openedBy ? (
              <Text style={s.docSub}>Atendida por: {mesa.openedBy}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.divider} />

        {/* Comensales */}
        {mesa.guests.map((guest, gi) => {
          const guestTotal = guest.orders.reduce((s, o) => s + o.total, 0);
          return (
            <View key={gi}>
              <Text style={s.guestHeader}>
                {guest.name}{guest.description ? ` · ${guest.description}` : ""}
              </Text>

              {guest.orders.map((order, oi) => (
                <View key={oi} style={{ marginBottom: 6, paddingLeft: 8 }}>
                  <Text style={s.roundLabel}>
                    Ronda #{oi + 1} · {fmtTime(order.createdAt)}
                    {order.note ? ` · ${order.note}` : ""}
                    {order.servedBy ? ` · Atendido por: ${order.servedBy}` : ""}
                  </Text>
                  {order.items.map((item, ii) => (
                    <View key={ii} style={s.itemRow}>
                      <Text style={s.itemName}>{item.name} × {item.quantity}</Text>
                      <Text style={s.itemAmt}>{fmt(item.subtotal)}</Text>
                    </View>
                  ))}
                  {order.taxAmount > 0 && (
                    <>
                      <View style={s.roundTotRow}>
                        <Text style={s.roundTotLabel}>Subtotal</Text>
                        <Text style={s.roundTotValue}>{fmt(order.subtotal)}</Text>
                      </View>
                      {(order.taxLines ?? []).map((tl, ti) => (
                        <View key={ti} style={s.roundTotRow}>
                          <Text style={s.roundTotLabel}>{tl.name} ({tl.rate}%)</Text>
                          <Text style={s.roundTotValue}>{fmt(tl.amount)}</Text>
                        </View>
                      ))}
                    </>
                  )}
                  <View style={s.roundTotRow}>
                    <Text style={{ ...s.roundTotLabel, fontWeight: "bold" }}>Total ronda</Text>
                    <Text style={{ ...s.roundTotValue, fontWeight: "bold" }}>{fmt(order.total)}</Text>
                  </View>
                </View>
              ))}

              <View style={s.guestTotalRow}>
                <Text style={s.guestTotalLabel}>Total {guest.name}</Text>
                <Text style={s.guestTotalValue}>{fmt(guestTotal)}</Text>
              </View>

              {gi < mesa.guests.length - 1 && <View style={{ ...s.divider, marginTop: 8 }} />}
            </View>
          );
        })}

        <View style={s.divider} />

        <View style={s.grandRow}>
          <Text style={s.grandLabel}>TOTAL MESA</Text>
          <Text style={s.grandValue}>{fmt(grandTotal)}</Text>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerLine}>BILLIFY · Cuenta de mesa · Documento de uso interno</Text>
          <Text style={s.footerLine}>Generado con BILLIFY · Software de punto de venta para pequeños negocios</Text>
          <Text style={s.footerCopy}>© 2026 BILLIFY. Todos los derechos reservados.</Text>
        </View>
      </Page>
    </Document>
  );
}

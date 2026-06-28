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
  headerRight: { alignItems: "flex-end", minWidth: 160 },
  docTitle: { fontSize: 10, fontWeight: "bold", color: "#1e293b", marginBottom: 3, textAlign: "right" },
  docSub: { fontSize: 8.5, color: "#64748b", textAlign: "right", marginBottom: 1.5 },

  divider: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginVertical: 14 },
  dividerLight: { borderBottomWidth: 0.5, borderBottomColor: "#f1f5f9", marginVertical: 10 },

  sectionTitle: { fontSize: 10, fontWeight: "bold", marginBottom: 8, marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  label: { fontSize: 9.5, color: "#475569" },
  value: { fontSize: 9.5 },
  valueGreen: { fontSize: 9.5, color: "#059669" },
  valueRed: { fontSize: 9.5, color: "#dc2626" },
  grandRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1.5, borderTopColor: "#1e293b", paddingTop: 8, marginTop: 6 },
  grandLabel: { fontSize: 12, fontWeight: "bold" },
  grandValue: { fontSize: 12, fontWeight: "bold" },

  movHeader: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  movRow: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#f1f5f9" },
  movTime: { width: 42, fontSize: 8.5, color: "#94a3b8" },
  movType: { width: 55, fontSize: 8.5 },
  movDesc: { flex: 1, fontSize: 8.5 },
  movAmount: { width: 85, textAlign: "right", fontSize: 8.5 },
  movThText: { fontSize: 8, fontWeight: "bold", color: "#64748b" },

  noteBox: { marginTop: 14, padding: 8, backgroundColor: "#f8fafc", borderRadius: 4, borderLeftWidth: 3, borderLeftColor: "#e2e8f0" },
  noteLabel: { fontSize: 7.5, color: "#94a3b8", fontWeight: "bold", textTransform: "uppercase", marginBottom: 2 },
  noteText: { fontSize: 9, color: "#475569" },

  footer: { marginTop: "auto", paddingTop: 20, borderTopWidth: 0.5, borderTopColor: "#e2e8f0", alignItems: "center" },
  footerLine: { fontSize: 7.5, color: "#94a3b8", marginBottom: 2, textAlign: "center" },
  footerCopy: { fontSize: 7, color: "#cbd5e1", marginTop: 2, textAlign: "center" },
});

const formatCOP = (v: number) =>
  v.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 });

const formatDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("es-CO", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

const formatTime = (d: Date | string) =>
  new Date(d).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

const MOV_LABELS: Record<string, string> = {
  OPENING: "Apertura",
  INCOME: "Entrada",
  EXPENSE: "Salida",
};

const PAYMENT_LABELS: Record<string, string> = {
  CARD: "Tarjeta",
  CREDIT: "Crédito",
  TRANSFER: "Transferencia",
};

export type RegisterForPdf = {
  openingBalance: number;
  closingBalance: number | null;
  closingNote: string | null;
  openedAt: Date | string;
  closedAt: Date | string | null;
  cashSalesTotal: number;
  cashSalesCount: number;
  nonCashSales: { paymentMethod: string; total: number; count: number }[];
  manualIncome: number;
  manualExpense: number;
  totalBalance: number;
  user: { name: string | null } | null;
  movements: {
    id: string;
    type: string;
    amount: number;
    description: string;
    createdAt: Date | string;
    user: { name: string | null } | null;
  }[];
};

export function CierreCajaPDF({
  business,
  register,
}: {
  business: { name: string; document: string; logoUrl?: string | null };
  register: RegisterForPdf;
}) {
  const manualMovements = register.movements.filter((m) => m.type !== "OPENING");

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
            </View>
          </View>
          <View style={s.headerRight}>
            <Text style={s.docTitle}>REPORTE DE CIERRE DE CAJA</Text>
            <Text style={s.docSub}>{formatDate(register.openedAt)}</Text>
            <Text style={s.docSub}>
              Apertura: {formatTime(register.openedAt)}
              {register.closedAt ? `  →  Cierre: ${formatTime(register.closedAt)}` : "  (en curso)"}
            </Text>
            {register.user?.name ? (
              <Text style={s.docSub}>Responsable: {register.user.name}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.divider} />

        {/* Resumen */}
        <Text style={s.sectionTitle}>Resumen de caja</Text>

        <View style={s.row}>
          <Text style={s.label}>Fondo inicial</Text>
          <Text style={s.value}>{formatCOP(register.openingBalance)}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.label}>
            Ventas en efectivo ({register.cashSalesCount}{" "}
            {register.cashSalesCount === 1 ? "venta" : "ventas"})
          </Text>
          <Text style={s.valueGreen}>+{formatCOP(register.cashSalesTotal)}</Text>
        </View>
        {register.manualIncome > 0 ? (
          <View style={s.row}>
            <Text style={s.label}>Entradas manuales</Text>
            <Text style={s.valueGreen}>+{formatCOP(register.manualIncome)}</Text>
          </View>
        ) : null}
        {register.manualExpense > 0 ? (
          <View style={s.row}>
            <Text style={s.label}>Salidas manuales</Text>
            <Text style={s.valueRed}>−{formatCOP(register.manualExpense)}</Text>
          </View>
        ) : null}

        <View style={s.grandRow}>
          <Text style={s.grandLabel}>Total en caja</Text>
          <Text style={s.grandValue}>{formatCOP(register.totalBalance)}</Text>
        </View>

        {/* Otros medios de pago */}
        {register.nonCashSales.length > 0 ? (
          <>
            <View style={[s.divider, { marginTop: 16 }]} />
            <Text style={s.sectionTitle}>Otros medios de pago (no incluidos en caja)</Text>
            {register.nonCashSales.map((entry, i) => (
              <View key={i} style={s.row}>
                <Text style={s.label}>
                  {PAYMENT_LABELS[entry.paymentMethod] ?? entry.paymentMethod}
                  {" "}({entry.count} {entry.count === 1 ? "venta" : "ventas"})
                </Text>
                <Text style={s.value}>{formatCOP(entry.total)}</Text>
              </View>
            ))}
          </>
        ) : null}

        {/* Movimientos manuales */}
        {manualMovements.length > 0 ? (
          <>
            <View style={[s.divider, { marginTop: 20 }]} />
            <Text style={s.sectionTitle}>Movimientos manuales</Text>
            <View style={s.movHeader}>
              <Text style={[s.movTime, s.movThText]}>Hora</Text>
              <Text style={[s.movType, s.movThText]}>Tipo</Text>
              <Text style={[s.movDesc, s.movThText]}>Descripción</Text>
              <Text style={[s.movAmount, s.movThText]}>Monto</Text>
            </View>
            {manualMovements.map((m, i) => (
              <View key={i} style={s.movRow}>
                <Text style={s.movTime}>{formatTime(m.createdAt)}</Text>
                <Text style={[s.movType, { color: m.type === "EXPENSE" ? "#dc2626" : "#059669" }]}>
                  {MOV_LABELS[m.type] ?? m.type}
                </Text>
                <Text style={s.movDesc}>{m.description}</Text>
                <Text style={[s.movAmount, { color: m.type === "EXPENSE" ? "#dc2626" : "#059669" }]}>
                  {m.type === "EXPENSE" ? "−" : "+"}
                  {formatCOP(m.amount)}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        {register.closingNote ? (
          <View style={s.noteBox}>
            <Text style={s.noteLabel}>Nota de cierre</Text>
            <Text style={s.noteText}>{register.closingNote}</Text>
          </View>
        ) : null}

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerLine}>BILLIFY · Reporte de caja · Documento de uso interno</Text>
          <Text style={s.footerLine}>Generado con BILLIFY · Software de punto de venta para pequeños negocios</Text>
          <Text style={s.footerCopy}>© 2026 BILLIFY. Todos los derechos reservados.</Text>
        </View>
      </Page>
    </Document>
  );
}

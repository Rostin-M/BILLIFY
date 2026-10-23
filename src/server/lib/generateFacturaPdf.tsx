import { renderToBuffer, type Document } from "@react-pdf/renderer";
import React from "react";

import { AcuerdoFiadoPDF, type BusinessForAgreementPdf, type CreditAgreementForPdf } from "~/lib/pdf/AcuerdoFiadoPDF";
import { FacturaPDF, type BusinessInfoForPdf, type SaleForPdf } from "~/lib/pdf/FacturaPDF";

export async function generateFacturaPdfBuffer(
  business: BusinessInfoForPdf,
  sale: SaleForPdf,
): Promise<Buffer> {
  // renderToBuffer requires a Document as its root element
  const element = React.createElement(FacturaPDF, { business, sale }) as React.ReactElement<
    React.ComponentProps<typeof Document>
  >;
  const buffer = await renderToBuffer(element);
  return Buffer.from(buffer);
}

export async function generateAcuerdoFiadoPdfBuffer(
  business: BusinessForAgreementPdf,
  agreement: CreditAgreementForPdf,
): Promise<Buffer> {
  const element = React.createElement(AcuerdoFiadoPDF, { business, agreement }) as React.ReactElement<
    React.ComponentProps<typeof Document>
  >;
  return Buffer.from(await renderToBuffer(element));
}

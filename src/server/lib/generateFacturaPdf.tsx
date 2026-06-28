import { renderToBuffer, Document } from "@react-pdf/renderer";
import React from "react";

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

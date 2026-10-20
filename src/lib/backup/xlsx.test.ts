import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { buildXlsx } from "./xlsx";

describe("buildXlsx", () => {
  it("arma un libro con una hoja por tabla, encabezado en negrita y texto escapado", () => {
    const files = unzipSync(
      buildXlsx([
        {
          name: "Productos",
          header: ["Nombre", "Precio"],
          rows: [
            ["Café & <pan>", 2500],
            [null, 0],
          ],
        },
        { name: "Clientes", header: ["Nombre"], rows: [] },
      ]),
    );

    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "[Content_Types].xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
      ]),
    );
    expect(strFromU8(files["xl/workbook.xml"]!)).toContain(
      '<sheet name="Clientes" sheetId="2" r:id="rId2"/>',
    );
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain(
      '<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Nombre</t></is></c>',
    );
    expect(sheet).toContain("Café &amp; &lt;pan&gt;");
    expect(sheet).toContain('<c r="B2"><v>2500</v></c>');
    expect(sheet).toContain('<c r="B3"><v>0</v></c>');
  });
});

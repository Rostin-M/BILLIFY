import { Bricolage_Grotesque, Kalam } from "next/font/google";

/** Titulares de la landing: grotesca con carácter, se ve bien en tamaños grandes. */
export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display-face",
  display: "swap",
});

/** Letra a mano para el cuaderno ("antes de BILLIFY"). */
export const handFont = Kalam({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-hand-face",
  display: "swap",
});

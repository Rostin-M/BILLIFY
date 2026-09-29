import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import { Toaster } from "sonner";

import { Providers } from "./_components/Providers";
import { ServiceWorkerRegistrar } from "./_components/ServiceWorkerRegistrar";
import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "BILLIFY",
  description: "Punto de venta y facturación para pequeños negocios",
  manifest: "/manifest.webmanifest",
  icons: [
    { rel: "icon", url: "/favicon.ico" },
    { rel: "apple-touch-icon", url: "/apple-touch-icon.png" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BILLIFY",
  },
};

export const viewport: Viewport = {
  themeColor: "#020617",
  viewportFit: "cover",
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Nonce de la CSP generado en el middleware. Leer headers() hace que todas las
  // páginas se rendericen por petición (requisito de la CSP con nonce, según la
  // documentación de Next.js): una página prerenderizada no tendría el nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="es" className={`${geist.variable}`} suppressHydrationWarning>
      <body>
        <TRPCReactProvider>
          <Providers nonce={nonce}>{children}</Providers>
          <Toaster richColors position="top-right" />
          <ServiceWorkerRegistrar />
        </TRPCReactProvider>
      </body>
    </html>
  );
}

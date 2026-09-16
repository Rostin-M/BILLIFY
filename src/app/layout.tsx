import "~/styles/globals.css";

import { type Metadata, type Viewport } from "next";
import { Geist } from "next/font/google";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geist.variable}`} suppressHydrationWarning>
      <body>
        <TRPCReactProvider>
          <Providers>{children}</Providers>
          <Toaster richColors position="top-right" />
          <ServiceWorkerRegistrar />
        </TRPCReactProvider>
      </body>
    </html>
  );
}

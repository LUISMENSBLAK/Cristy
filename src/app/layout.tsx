import type { Metadata, Viewport } from "next";
import { Playfair_Display, Montserrat } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cristi's Coffe & Snack POS",
  description: "Sistema de Punto de Venta para Cristi's Coffe & Snack",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Cristi's POS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false, // Evita zoom accidental al tocar botones rápido
  viewportFit: "cover", // Permite usar todo el espacio de pantalla (Safe Area)
  themeColor: "#7A5A32", // Color Bronce para la barra de estado
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${playfair.variable} ${montserrat.variable} font-sans antialiased bg-crema text-negro min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}

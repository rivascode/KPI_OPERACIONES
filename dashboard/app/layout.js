import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "KPI Control Operaciones",
  description: "Dashboard de visualización y control de KPIs de operaciones logísticas",
};

export default function RootLayout({ children }) {
  // El tema por defecto lo resuelve CSS (prefers-color-scheme); la preferencia
  // manual guardada se aplica en el mount del dashboard (data-theme).
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}

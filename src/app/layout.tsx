import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "Villa San Juan · Clínica Dental", template: "%s · Villa San Juan" },
  description: "Sistema de gestión de la Clínica Dental Villa San Juan",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#a0449a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}

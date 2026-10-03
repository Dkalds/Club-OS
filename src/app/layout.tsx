import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./globals.css";

// Los nombres de variable (--font-barlow*) son distintos de los públicos
// (--font-display, --font-text): ver el bloque de fuentes de globals.css.
const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CLUB OS",
  description: "Plataforma para clubes de baloncesto de formación.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${barlow.variable} ${barlowCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-ink font-text text-body">
        {children}
      </body>
    </html>
  );
}

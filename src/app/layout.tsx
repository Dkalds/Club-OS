import type { Metadata, Viewport } from "next";
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

// La CSP lleva un nonce por petición (`src/lib/security-headers.ts`) y Next solo se lo pone a
// sus scripts al renderizar en esa petición: una página prerenderizada en el build saldría
// sin nonce y el navegador bloquearía sus scripts. Por eso nada se prerenderiza.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CLUB OS",
  description: "Plataforma para clubes de baloncesto de formación.",
};

// `viewport-fit=cover`: sin él, `env(safe-area-inset-*)` vale siempre 0 y la navegación
// inferior quedaría debajo de la barra de gestos del teléfono.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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

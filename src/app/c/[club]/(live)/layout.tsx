import type { ReactNode } from "react";

// La pantalla de Live no usa AppShell: va a pantalla completa, sin navegación inferior.
// Los colores del club los pone el layout padre `/c/[club]/layout.tsx`.
export default function LiveLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

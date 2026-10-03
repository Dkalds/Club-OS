import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Las rutas que exigen sesión, siempre: tampoco se libran si acaban en `.png`.
    "/c/:path*",
    "/select-club/:path*",
    // El resto, salvo los estáticos de Next, el favicon y las imágenes: ahí solo se
    // refresca la sesión. El punto va escapado dos veces (cadena y expresión regular):
    // con una sola barra sería «cualquier carácter» y /musico se libraría del proxy.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};

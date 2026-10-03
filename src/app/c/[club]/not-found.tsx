// Mismo contenido que el 404 de toda la app (`src/app/not-found.tsx`): su `<main>`, su
// marca de plataforma y el enlace de salida. Se repite aquí porque Next busca el 404 más
// cercano al segmento que lo lanza.
//
// Recoge el `notFound()` de lo que cuelga de `/c/[club]` fuera de la app móvil: quien no
// administra y abre una página de Gestión, y las páginas de Gestión que no existen. Se
// pinta bajo la marca del club, pero sin el marco de ninguna área, por eso lleva su propio
// `<main>`. No recibe datos: no distingue «no existe» de «no tienes acceso».
export { default } from "@/app/not-found";

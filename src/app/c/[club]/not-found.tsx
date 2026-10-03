// Mismo contenido que el 404 de toda la app (`src/app/not-found.tsx`): su `<main>`, su
// marca de plataforma y el enlace de salida. Se repite aquí porque Next busca el 404 más
// cercano al segmento que lo lanza.
//
// Recoge el `notFound()` del layout de Gestión: quien no administra y abre una página de
// Gestión. Se pinta bajo la marca del club, pero sin el marco de ninguna área, por eso
// lleva su propio `<main>`. Lo que lanza una página de Gestión ya con el marco puesto (un
// editor con un id que no existe) lo recoge `admin/not-found.tsx`, dentro de él. No recibe
// datos: no distingue «no existe» de «no tienes acceso».
export { default } from "@/app/not-found";

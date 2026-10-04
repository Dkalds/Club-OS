// Las rutas que revalidan las acciones de más de un módulo. Son patrones de ruta, no URLs: las
// carpetas de `src/app/c/[club]/` tal cual, con el segmento dinámico `[club]` y el grupo `(app)`
// (el porqué está en `MutateConfig.routes`, de `@/lib/mutate`). Siguen esas carpetas: `(app)` es
// el grupo al que se mueven las pestañas del entrenador (convención C3). Si se renombran o se
// mueven, se cambian aquí.
//
// Solo están aquí las que comparten varios módulos. La de un módulo (`DRILLS_ROUTE`,
// `ADMIN_ROUTE`) se queda en sus acciones.

/**
 * The Way: el índice, cada sección y la página de los Standards. La revalidan Gestión (que lo
 * edita) y la biblioteca (cada principio enseña los ejercicios que lo trabajan).
 */
export const WAY_ROUTE = "/c/[club]/(app)/way";

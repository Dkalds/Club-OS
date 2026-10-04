/**
 * El `id` del `<h1>` de la ficha: el sitio al que `DrillAdminActions` lleva el foco tras
 * publicar o archivar con éxito. Vive en su propio archivo y no en `drill-admin-actions.tsx`:
 * lo que exporta un módulo de cliente llega a una página de servidor como una referencia, no
 * como el texto.
 */
export const DRILL_TITLE_ID = "drill-title";

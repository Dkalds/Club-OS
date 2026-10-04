// Lo que comparten los formularios largos para no perder lo escrito en silencio: el texto con
// el que preguntan al salir y el aviso del navegador al cerrar o recargar la pestaña. Quien lo
// usa decide cuándo hay cambios (`dirty`) y cuándo poner y quitar el aviso. La protección
// completa —también la cabecera y la navegación inferior— llegará con `ConfirmDialog`: App
// Router no tiene gancho para bloquear la navegación interna.

/** Lo que dice `window.confirm` al salir con cambios sin guardar (hasta que llegue `ConfirmDialog`). */
export const UNSAVED_CHANGES = "Tienes cambios sin guardar. Si sales ahora, se pierden.";

/**
 * Pide al navegador que confirme antes de cerrar o recargar la pestaña. Es una función suelta,
 * y no una dentro del componente, para que quien la pone y quien la quita (`Recargar`) hablen
 * de la misma. Los navegadores enseñan su propio texto, no el nuestro.
 */
export function warnBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Los navegadores antiguos solo preguntan si se asigna `returnValue`.
  event.returnValue = "";
}

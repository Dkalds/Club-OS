/**
 * Variable de entorno con la que `e2e/global-setup.ts` pasa a los tests el instante con el
 * que acaba de sembrar la base de datos. Los workers de Playwright arrancan después del
 * arranque global y heredan su entorno.
 */
export const SEED_NOW_ENV = "E2E_SEED_NOW";

/**
 * El instante con el que se sembró la base de datos de esta ejecución.
 *
 * Las fechas del seed son relativas a ese instante (`seedSchedule(now, zona)`): con él, un
 * test calcula exactamente el calendario que hay en la base de datos, tarde lo que tarde
 * en llegarle el turno. Con `new Date()` calcularía el de «ahora», que deja de coincidir en
 * cuanto entre la siembra y el test empieza un entrenamiento o un partido.
 *
 * Hay que llamarla dentro de un test, no al cargar el archivo: Playwright lee los specs
 * antes de ejecutar el arranque global.
 */
export function seedNow(): Date {
  const iso = process.env[SEED_NOW_ENV];
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) {
    throw new Error(
      `Falta el instante de la siembra (${SEED_NOW_ENV}). Lo deja e2e/global-setup.ts al ` +
        "sembrar: ejecuta los e2e con `pnpm test:e2e`, con la configuración del repo.",
    );
  }
  return at;
}

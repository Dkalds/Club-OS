import { test as base, expect, type ConsoleMessage } from "@playwright/test";

/** Lo que el navegador ha dejado en su consola durante un test. */
export type BrowserErrors = {
  /** Cada `console.error` y cada excepción sin capturar vistos hasta ahora, con su página. */
  readonly seen: readonly string[];
  /**
   * Declara las rutas que el test abre a propósito sabiendo que responden 404. Hay que
   * llamarla antes de abrirlas. El porqué, en el fixture.
   */
  allowNotFound(...paths: string[]): void;
};

/** El aviso que Chromium escribe en la consola por cada recurso que responde 404. */
const NOT_FOUND_NOTICE = /^Failed to load resource: the server responded with a status of 404/;

/**
 * El `test` de todos los specs: el de Playwright más un vigilante de la consola.
 *
 * Cualquier test falla si el navegador registra un `console.error` o una excepción sin
 * capturar, en cualquier página de su contexto, mire lo que mire el test. Los specs importan
 * `test` y `expect` de aquí, no de `@playwright/test`.
 *
 * Solo cuenta lo que pasa en el navegador: las líneas que el servidor escribe en su log
 * (por ejemplo, Auth rechazando un email sin invitación) no son errores de consola.
 *
 * Vigila el contexto que Playwright crea para el test. Un contexto abierto a mano con
 * `browser.newContext()` queda fuera.
 */
export const test = base.extend<{ browserErrors: BrowserErrors }>({
  browserErrors: [
    async ({ context }, use) => {
      const seen: string[] = [];
      const expectedNotFound = new Set<string>();

      // Única excepción, y solo para quien la pide: al abrir una página que responde 404,
      // Chromium escribe por su cuenta un error en la consola («Failed to load resource…»).
      // No es un fallo de la app cuando el 404 es justo lo que el test comprueba. Se
      // permite ese aviso y solo para las rutas que el test ha declarado; un 404 de
      // cualquier otro recurso (un icono, un script) sigue haciendo fallar el test.
      const isExpectedNotFound = (message: ConsoleMessage): boolean => {
        if (!NOT_FOUND_NOTICE.test(message.text())) return false;
        const { url } = message.location();
        return URL.canParse(url) && expectedNotFound.has(new URL(url).pathname);
      };

      context.on("console", (message) => {
        if (message.type() !== "error" || isExpectedNotFound(message)) return;
        // El aviso de un recurso que no carga no dice cuál: lo dice su `location`.
        const { url } = message.location();
        const page = message.page()?.url() ?? "(sin página)";
        const source = url && url !== page ? ` (${url})` : "";
        seen.push(`console.error en ${page}: ${message.text()}${source}`);
      });
      context.on("weberror", (webError) => {
        seen.push(
          `excepción en ${webError.page()?.url() ?? "(sin página)"}: ${webError.error().message}`,
        );
      });

      await use({
        seen,
        allowNotFound: (...paths) => {
          for (const path of paths) expectedNotFound.add(path);
        },
      });

      expect(seen, "el navegador no debe registrar errores de consola ni excepciones").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

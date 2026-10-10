import type { BrowserContext, Locator, Page } from "@playwright/test";
import { readSupabaseEnv } from "../../scripts/lib/admin-client";
import { ARCANGEL } from "../../scripts/seed/data";
import { isLocalSupabaseUrl } from "../../scripts/seed/guard";
import { addLocalDays, isoToLocalInputs } from "../../src/lib/time";
import { openAs } from "./sessions";
import { expect } from "./test";

// Lo que comparten los specs de Sesiones (`train`, `practice-session` y `practice-builder`):
// esperar a React, medir la pantalla del móvil y crear una sesión desde su formulario. Antes
// cada spec llevaba su copia.

/** El club en el que se crean las sesiones de los e2e, y su zona horaria. */
export const CLUB = `/c/${ARCANGEL.slug}`;
export const TZ = ARCANGEL.timezone;

/**
 * Los datos solo se escriben en un Supabase local: lanzar unos tests nunca escribe en una base
 * de datos remota (ver `e2e/global-setup.ts`). Sin `.env.local` tampoco se escribe: el arranque
 * global ya falla antes con su propio mensaje.
 */
function targetIsLocal(): boolean {
  try {
    return isLocalSupabaseUrl(readSupabaseEnv().url);
  } catch {
    return false;
  }
}

/** Si los tests pueden escribir. Los que escriben se saltan cuando no: `test.skip(!CAN_WRITE, …)`. */
export const CAN_WRITE = targetIsLocal();

/**
 * Espera a que React haya tomado el control de un elemento que llegó ya pintado por el
 * servidor. Tras una carga completa, el botón existe antes de tener su manejador: un clic
 * en ese rato no hace nada, y un envío enviaría el formulario a mano (un GET con lo escrito
 * en la URL). Los campos se rellenan después: antes, React los repondría al hidratar. React
 * marca los nodos que hidrata con una propiedad `__reactProps$…`.
 */
export async function hydrated(target: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        target.evaluate((element) =>
          Object.keys(element).some((key) => key.startsWith("__reactProps$")),
        ),
      { message: "React no ha hidratado la página" },
    )
    .toBe(true);
}

/** Cómo se nombra un elemento en el mensaje de un fallo: lo que dice, o cómo se llama. */
async function labelOf(target: Locator): Promise<string> {
  const text = (await target.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  return text || (await target.getAttribute("aria-label")) || (await target.getAttribute("name")) || "un campo";
}

/**
 * Cada elemento mide al menos 44 px de alto y de ancho y cabe en los 375 px de la pantalla, con
 * su nombre en el mensaje. Los elementos tienen que estar a la vista: uno oculto no tiene caja
 * y falla (quien llama filtra con `:visible` si la pantalla tiene partes plegadas).
 */
export async function expectTouchTargets(targets: Locator): Promise<void> {
  const all = await targets.all();
  expect(all.length).toBeGreaterThan(0);
  for (const target of all) {
    const box = await target.boundingBox();
    const label = await labelOf(target);
    expect(box, `caja de «${label}»`).not.toBeNull();
    expect(box!.height, `alto de «${label}»`).toBeGreaterThanOrEqual(44);
    expect(box!.width, `ancho de «${label}»`).toBeGreaterThanOrEqual(44);
    expect(box!.x, `«${label}» no se sale por la izquierda`).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, `«${label}» cabe en 375 px`).toBeLessThanOrEqual(375);
  }
}

/** La pantalla mide 375 px y nada la ensancha (con las fuentes ya cargadas). */
export async function expectFitsMobile(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  expect(page.viewportSize()?.width).toBe(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
}

/**
 * Lo que un contexto de navegador abierto a mano (`browser.newContext()`, otra persona a la
 * vez) deja en su consola: el vigilante de `helpers/test.ts` solo mira el contexto del test.
 * Quien lo abre comprueba al final que la lista está vacía.
 */
export function watchConsole(context: BrowserContext): string[] {
  const seen: string[] = [];
  context.on("console", (message) => {
    if (message.type() === "error") seen.push(`console.error: ${message.text()}`);
  });
  context.on("weberror", (webError) => {
    seen.push(`excepción: ${webError.error().message}`);
  });
  return seen;
}

/** Un `<h1>`: toda pantalla tiene uno solo, y es lo que dice dónde se está. */
export function title(page: Page): Locator {
  return page.getByRole("heading", { level: 1 });
}

/** El campo de una etiqueta, con el nombre entero, en la página o dentro de una parte de ella. */
export function field(scope: Page | Locator, label: string): Locator {
  return scope.getByLabel(label, { exact: true });
}

/** El día `days` días después de hoy, en el reloj del club, como lo escribe un campo de fecha. */
export function inDays(days: number): string {
  return isoToLocalInputs(addLocalDays(new Date().toISOString(), days, TZ), TZ).date;
}

/** El constructor de una sesión: `/c/{club}/train/{uuid}/edit`. */
const EDIT_URL = new RegExp(`${CLUB}/train/([0-9a-f-]{36})/edit$`);

/**
 * Entra como `email`, abre «Preparar sesión» desde Sesiones, la rellena y la crea. Al volver, la
 * página es el constructor de la sesión nueva, que aún no tiene ejercicios. Devuelve su id.
 */
export async function createSession(
  page: Page,
  email: string,
  session: { title: string; date: string; time: string; minutes: string; focus?: string },
): Promise<string> {
  await openAs(page, email);
  await page.goto(`${CLUB}/train`);
  await page.getByRole("link", { name: "Preparar sesión" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/new$`));
  await expect(title(page)).toHaveText("Nueva sesión");
  await hydrated(page.getByRole("button", { name: "Crear sesión" }));

  await field(page, "Título").fill(session.title);
  await field(page, "Fecha").fill(session.date);
  await field(page, "Hora").fill(session.time);
  await field(page, "Duración (min)").fill(session.minutes);
  if (session.focus) await field(page, "Objetivo principal").selectOption({ label: session.focus });
  await page.getByRole("button", { name: "Crear sesión" }).click();

  await expect(page).toHaveURL(EDIT_URL);
  await expect(title(page)).toHaveText(session.title);
  const eventId = EDIT_URL.exec(page.url())?.[1];
  if (!eventId) throw new Error(`No se pudo leer el id de la sesión de ${page.url()}`);
  return eventId;
}

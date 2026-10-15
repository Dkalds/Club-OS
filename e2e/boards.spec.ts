import type { Locator, Page } from "@playwright/test";
import { ARCANGEL } from "../scripts/seed/data";
import { seedId } from "../scripts/seed/ids";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";
import { CLUB, expectFitsMobile, expectTouchTargets, title } from "./helpers/train";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login.
//
// Este archivo solo LEE: las pizarras son las del seed (`scripts/seed/boards.ts`) y nadie las
// escribe todavía. Por eso corre en `mobile`, en paralelo. La pizarra en el directo, que
// necesita iniciar una sesión, la prueba `live.spec.ts`.

// La pantalla se revisa siempre a 375 px, sea cual sea el proyecto de Playwright.
test.use({ viewport: { width: 375, height: 812 } });

const ALEX = "alex@arcangel.test"; // entrenador de Alevín A

const LIBRARY = `${CLUB}/drills`;
/** La próxima sesión de Alevín A: lleva «3 calles», «Rebote + outlet» y «2x2 presión», que tienen pizarra. */
const SESSION = `${CLUB}/train/${seedId(ARCANGEL.slug, "event:alevin-a:upcoming-0")}`;

/** La fila de un ejercicio en la biblioteca. */
function libraryRow(page: Page, name: string): Locator {
  return page.locator(`main a[href^="${CLUB}/drills/"]`).filter({ hasText: name });
}

/** Abre la ficha de un ejercicio desde la biblioteca, por su título. */
async function openDrill(page: Page, name: string): Promise<void> {
  await openAs(page, ALEX);
  await page.goto(LIBRARY);
  await libraryRow(page, name).first().click();
  await expect(title(page)).toHaveText(name);
}

function board(page: Page, name: string): Locator {
  return page.getByRole("img", { name });
}

function control(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

test("la ficha de un ejercicio enseña su pizarra por pasos, y se recorre a mano", async ({ page }) => {
  await openDrill(page, "Pase y corte");

  await expect(board(page, "Pizarra de Pase y corte, paso 1 de 4")).toBeVisible();
  await expect(page.getByText("Paso 1 de 4", { exact: true })).toBeVisible();
  await expect(page.getByText("El 1 pasa al 2.", { exact: true })).toBeVisible();
  await expect(control(page, "Paso anterior")).toBeDisabled();
  await expect(control(page, "Reiniciar la pizarra")).toBeDisabled();

  await control(page, "Paso siguiente").click();
  await expect(board(page, "Pizarra de Pase y corte, paso 2 de 4")).toBeVisible();
  await expect(page.getByText("El 1 corta al aro.", { exact: true })).toBeVisible();

  await control(page, "Paso anterior").click();
  await expect(page.getByText("Paso 1 de 4", { exact: true })).toBeVisible();

  // Los cuatro controles, a un dedo, y nada ensancha el móvil.
  await expectTouchTargets(page.getByRole("main").getByRole("button", { name: /^(Reiniciar la pizarra|Paso anterior|Reproducir la pizarra|Paso siguiente)$/ }));
  await expectFitsMobile(page);
});

test("reproducir recorre la secuencia hasta el final, se pausa y se reinicia", async ({ page }) => {
  await openDrill(page, "Pase y corte");

  await control(page, "Reproducir la pizarra").click();
  await expect(control(page, "Pausar la pizarra")).toBeVisible();
  // Avanza sola: llega al segundo paso sin tocar nada.
  await expect(page.getByText("Paso 2 de 4", { exact: true })).toBeVisible({ timeout: 10_000 });

  await control(page, "Pausar la pizarra").click();
  await expect(control(page, "Reproducir la pizarra")).toBeVisible();
  const paused = await page.getByText(/^Paso \d de 4$/).innerText();
  await page.waitForTimeout(2_500);
  await expect(page.getByText(paused, { exact: true })).toBeVisible();

  // De nuevo en marcha, hasta el final: cada ficha donde acaba y el botón otra vez en «Reproducir».
  await control(page, "Reproducir la pizarra").click();
  await expect(page.getByText("Final", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(board(page, "Pizarra de Pase y corte, final")).toBeVisible();
  await expect(control(page, "Reproducir la pizarra")).toBeVisible();
  await expect(control(page, "Paso siguiente")).toBeDisabled();

  await control(page, "Reiniciar la pizarra").click();
  await expect(page.getByText("Paso 1 de 4", { exact: true })).toBeVisible();
});

test.describe("con «reducir movimiento»", () => {
  test.use({ reducedMotion: "reduce" });

  test("reproducir avanza de paso en paso, sin desplazamiento, y llega al final", async ({ page }) => {
    await openDrill(page, "3x3 a 5 puntos");

    await control(page, "Reproducir la pizarra").click();
    await expect(page.getByText("Final", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(board(page, "Pizarra de 3x3 a 5 puntos, final")).toBeVisible();
  });
});

test("una pizarra de pista completa cabe en el móvil", async ({ page }) => {
  await openDrill(page, "3 calles");

  await expect(board(page, "Pizarra de 3 calles, paso 1 de 3")).toBeVisible();
  const box = await board(page, "Pizarra de 3 calles, paso 1 de 3").boundingBox();
  // Apaisada: más ancha que alta.
  expect(box!.width).toBeGreaterThan(box!.height);
  await expectFitsMobile(page);
});

test("una pizarra sin pasos es una foto fija, sin controles", async ({ page }) => {
  await openDrill(page, "Bote y control");

  await expect(board(page, "Pizarra de Bote y control")).toBeVisible();
  await expect(control(page, "Reproducir la pizarra")).toHaveCount(0);
  await expect(page.getByText(/^Paso \d/)).toHaveCount(0);
});

test("un ejercicio sin pizarra no enseña una pista vacía", async ({ page }) => {
  await openDrill(page, "Defensa individual");

  await expect(page.getByRole("main").getByRole("img")).toHaveCount(0);
  await expect(control(page, "Reproducir la pizarra")).toHaveCount(0);
});

test("la biblioteca enseña la miniatura de la pizarra, y la pista vacía donde no hay", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(LIBRARY);

  await expect(libraryRow(page, "3 calles").first().locator("[data-board-thumb]")).toHaveCount(1);
  await expect(libraryRow(page, "Pase y corte").first().locator("[data-board-thumb]")).toHaveCount(1);
  await expect(libraryRow(page, "Defensa individual").first().locator("[data-board-thumb]")).toHaveCount(0);
  await expectFitsMobile(page);
});

test("la ficha de una sesión lleva la miniatura de cada ejercicio con pizarra", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(SESSION);
  await expect(title(page)).toHaveText("Transición + rebote defensivo");

  const row = (name: string) => page.getByRole("main").getByRole("listitem").filter({ hasText: name });
  await expect(row("3 calles").locator("[data-board-thumb]")).toHaveCount(1);
  await expect(row("Rebote + outlet").locator("[data-board-thumb]")).toHaveCount(1);
  await expect(row("2x2 presión").locator("[data-board-thumb]")).toHaveCount(1);
  await expect(row("3x2 continuo").locator("[data-board-thumb]")).toHaveCount(0);
  await expectFitsMobile(page);
});

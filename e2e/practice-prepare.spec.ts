import type { Locator, Page } from "@playwright/test";
import { restoreSeed, seedNow } from "./helpers/seed";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";
import {
  CAN_WRITE,
  CLUB,
  createSession,
  expectFitsMobile,
  expectTouchTargets,
  field,
  hydrated,
  inDays,
  title,
} from "./helpers/train";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login, cada
// test abre la app con `openAs`.
//
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts): prepara
// sesiones por los dos caminos de «Nueva sesión» (proponer o desde cero) y guarda, usa y borra
// plantillas, en serie. Cada test crea lo suyo (`E2E preparar {ts}`) y ninguno afirma recuentos
// totales. `restoreSeed` deja la base de datos como la dejó el arranque global, al empezar y al
// acabar. Con un Supabase que no es local nada se escribe: los tests se saltan.
test.describe.configure({ mode: "serial" });

const ALEX = "alex@arcangel.test"; // entrenador de Alevín A
const IRENE = "irene@arcangel.test"; // ayudante de Alevín A, con Álex

const NEEDS_LOCAL_DB = "Escribe en la base de datos (crea sesiones y plantillas): solo con un Supabase local.";

const PROPOSAL_NOTICE = "Propuesta sin guardar. Revísala, cámbiala y guarda.";

// Mismo instante que el arranque global: la base de datos queda como la dejó él.
async function restore(): Promise<void> {
  if (!CAN_WRITE) return;
  await restoreSeed(seedNow());
}

test.beforeAll(restore);
test.afterAll(restore);

/** Un título que no se repite entre tests ni entre ejecuciones. */
function sessionTitle(): string {
  return `E2E preparar ${Date.now()}`;
}

/** Las filas del constructor (la cabecera tiene su propia lista, la de objetivos). */
function rows(page: Page): Locator {
  return page.getByRole("main").locator("li[data-row]");
}

/** La suma de la barra de guardado: «Total» y sus minutos. */
function total(page: Page): Locator {
  return page.getByRole("main").getByText("Total", { exact: true }).locator("..");
}

function saveButton(page: Page): Locator {
  return page.getByRole("button", { name: "Guardar sesión" });
}

/** Rellena «Nueva sesión» como Álex, con el objetivo «Transición», y la deja sin enviar. */
async function fillNewSession(page: Page, name: string, minutes: string): Promise<void> {
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/train/new`);
  await expect(title(page)).toHaveText("Nueva sesión");
  await hydrated(page.getByRole("button", { name: "Proponer entrenamiento" }));

  await field(page, "Título").fill(name);
  await field(page, "Fecha").fill(inDays(4));
  await field(page, "Hora").fill("18:00");
  await field(page, "Duración (min)").fill(minutes);
  await field(page, "Objetivo principal").selectOption({ label: "Transición" });
}

test("«Nueva sesión» acaba con dos caminos, a un dedo y sin ensanchar el móvil", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/train/new`);
  await hydrated(page.getByRole("button", { name: "Proponer entrenamiento" }));

  await expectTouchTargets(page.getByRole("main").getByRole("button"));
  await expect(page.getByRole("button", { name: "Empezar desde cero" })).toBeVisible();
  await expectFitsMobile(page);
});

test("proponer un entrenamiento, cambiarlo y guardarlo", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const name = sessionTitle();
  await fillNewSession(page, name, "75");
  await page.getByRole("button", { name: "Proponer entrenamiento" }).click();

  // El constructor de la sesión nueva, con la propuesta ya cargada y sin guardar.
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/[0-9a-f-]{36}/edit$`));
  await expect(title(page)).toHaveText(name);
  await expect(page.getByText(PROPOSAL_NOTICE)).toBeVisible();
  // Al menos los cinco huecos de una sesión; con los rangos de la biblioteca, alguno más.
  const proposed = await rows(page).count();
  expect(proposed).toBeGreaterThanOrEqual(5);
  expect(proposed).toBeLessThanOrEqual(8);
  await expect(saveButton(page)).toBeEnabled();

  // Las fases de una sesión: activación, el objetivo elegido y competición.
  await expect(rows(page).first()).toContainText("Activación");
  await expect(rows(page).nth(1)).toContainText("Transición");
  await expect(rows(page).last()).toContainText("Competición");
  // Cubre la franja entera: 75 minutos, y no hay nada que avisar.
  await expect(total(page)).toContainText("75'");
  await expect(page.getByText(/Te (sobran?|pasas) /)).toHaveCount(0);
  await expectFitsMobile(page);

  // Se cambia antes de guardar: cinco minutos más al primero, y el encaje lo dice.
  await rows(page).first().getByRole("button", { name: /^Más minutos/ }).click();
  await expect(total(page)).toContainText("80'");
  await expect(page.getByText("Te pasas 5 min")).toBeVisible();
  await rows(page).first().getByRole("button", { name: /^Menos minutos/ }).click();
  await expect(page.getByText("Te pasas 5 min")).toHaveCount(0);

  // Y se quita el último.
  await rows(page).last().locator('[data-control="toggle"]').click();
  await page.getByRole("button", { name: /^Quitar/ }).click();
  await expect(rows(page)).toHaveCount(proposed - 1);

  await saveButton(page).click();
  await expect(page.getByText("Sesión guardada.")).toBeVisible();
  await expect(page.getByText(PROPOSAL_NOTICE)).toHaveCount(0);

  // Guardada de verdad: al volver a pedirla siguen sus ejercicios, y no propone otra vez.
  await page.reload();
  await hydrated(page.getByRole("button", { name: "Añadir bloque libre" }));
  await expect(rows(page)).toHaveCount(proposed - 1);
  await expect(page.getByRole("button", { name: "Proponer entrenamiento" })).toHaveCount(0);
});

test("salir sin guardar la propuesta deja la sesión vacía, y se puede proponer otra vez", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const name = sessionTitle();
  await fillNewSession(page, name, "60");
  await page.getByRole("button", { name: "Proponer entrenamiento" }).click();
  await expect(page.getByText(PROPOSAL_NOTICE)).toBeVisible();
  const editUrl = page.url();

  // Salir pregunta, como con cualquier cambio sin guardar.
  await page.getByRole("link", { name: "Volver a la sesión" }).click();
  await page.getByRole("button", { name: "Salir sin guardar" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Esta sesión aún no tiene ejercicios" })).toBeVisible();

  // De vuelta en el constructor no hay nada montado ni se propone solo: se pide con su botón.
  await page.goto(editUrl);
  await hydrated(page.getByRole("button", { name: "Añadir bloque libre" }));
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText(PROPOSAL_NOTICE)).toHaveCount(0);

  await page.getByRole("button", { name: "Proponer entrenamiento" }).click();
  await expect(page.getByText(PROPOSAL_NOTICE)).toBeVisible();
  await expect(rows(page).first()).toBeVisible();
  await expect(total(page)).toContainText("60'");
});

test("desde cero: el constructor vacío ofrece proponer y dice si lo montado encaja", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const name = sessionTitle();
  await createSession(page, ALEX, { title: name, date: inDays(5), time: "18:00", minutes: "60" });

  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Proponer entrenamiento" })).toBeVisible();
  await expect(page.getByText(/Te (sobran?|pasas) /)).toHaveCount(0);

  // Un bloque de 10 minutos en una franja de 60.
  await page.getByRole("button", { name: "Añadir bloque libre" }).click();
  await page.keyboard.type("Rueda de pases");
  await expect(page.getByText("Te sobran 50 min")).toBeVisible();
  // Con algo montado ya no se ofrece proponer encima.
  await expect(page.getByRole("button", { name: "Proponer entrenamiento" })).toHaveCount(0);
  await expectFitsMobile(page);
});

test("guardar una sesión como plantilla, usarla y borrarla", async ({ page, browser }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const name = sessionTitle();
  const fromTemplate = `${name} bis`;

  // Una sesión con dos bloques, guardada.
  await createSession(page, ALEX, { title: name, date: inDays(6), time: "18:00", minutes: "60" });
  await page.getByRole("button", { name: "Añadir bloque libre" }).click();
  await page.keyboard.type("Rueda de pases");
  await page.getByRole("button", { name: "Añadir bloque libre" }).click();
  await page.keyboard.type("Tres calles");
  await saveButton(page).click();
  await expect(page.getByText("Sesión guardada.")).toBeVisible();

  // En su ficha, «Guardar como plantilla».
  await page.getByRole("link", { name: "Volver a la sesión" }).click();
  await expect(title(page)).toHaveText(name);
  const saveTemplate = page.getByRole("button", { name: "Guardar como plantilla" });
  await hydrated(saveTemplate);
  await saveTemplate.click();
  await expect(page.getByText("Plantilla guardada.")).toBeVisible();
  await expect(saveTemplate).toBeDisabled();

  // Está en «Plantillas», con lo que dura y sus ejercicios.
  await page.getByRole("link", { name: "Ver plantillas" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train\\?scope=templates$`));
  const templateRow = page.getByRole("main").getByRole("link").filter({ hasText: name });
  await expect(templateRow).toHaveCount(1);
  await expect(templateRow).toContainText("20 min · 2 ejercicios");
  await expectFitsMobile(page);

  // Irene, del mismo cuerpo técnico, no la ve: es de quien la guarda.
  const other = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const irene = await other.newPage();
  await openAs(irene, IRENE);
  await irene.goto(`${CLUB}/train?scope=templates`);
  await expect(irene.getByRole("heading", { level: 2, name: "Aún no tienes plantillas" })).toBeVisible();
  await expect(irene.getByText(name)).toHaveCount(0);
  // Ni la abre por su dirección.
  const templateHref = await templateRow.getAttribute("href");
  await irene.goto(templateHref ?? "");
  await expect(irene.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
  await expect(irene.getByRole("button", { name: "Crear sesión" })).toHaveCount(0);
  await other.close();

  // Álex la usa: el formulario trae su título y un solo botón.
  await templateRow.click();
  await expect(title(page)).toHaveText("Nueva sesión");
  const createButton = page.getByRole("button", { name: "Crear sesión" });
  await hydrated(createButton);
  await expect(field(page, "Título")).toHaveValue(name);
  await expect(page.getByRole("button", { name: "Proponer entrenamiento" })).toHaveCount(0);
  await expectTouchTargets(page.getByRole("main").getByRole("button"));

  await field(page, "Título").fill(fromTemplate);
  await field(page, "Fecha").fill(inDays(8));
  await createButton.click();

  // La sesión nace con los ejercicios de la plantilla, ya guardados: se abre su ficha.
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/[0-9a-f-]{36}$`));
  await expect(title(page)).toHaveText(fromTemplate);
  await expect(page.getByRole("main")).toContainText("Rueda de pases");
  await expect(page.getByRole("main")).toContainText("Tres calles");

  // Y la borra: desaparece de «Plantillas», y la sesión creada con ella sigue.
  const sessionUrl = page.url();
  await page.goto(`${CLUB}/train?scope=templates`);
  await page.getByRole("main").getByRole("link").filter({ hasText: name }).first().click();
  const deleteButton = page.getByRole("button", { name: "Borrar plantilla" });
  await hydrated(deleteButton);
  await deleteButton.click();
  await page
    .getByRole("alertdialog", { name: "¿Borrar esta plantilla?" })
    .getByRole("button", { name: "Borrar plantilla" })
    .click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train\\?scope=templates$`));
  await expect(page.getByRole("heading", { level: 2, name: "Aún no tienes plantillas" })).toBeVisible();

  await page.goto(sessionUrl);
  await expect(page.getByRole("main")).toContainText("Rueda de pases");
});

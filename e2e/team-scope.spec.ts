import type { Page } from "@playwright/test";
import { ARCANGEL, CLUB_DEMO, seedId } from "../scripts/seed/data";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";
import { expectFitsMobile, expectTouchTargets, hydrated } from "./helpers/train";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` lo siembra justo antes de los
// tests y guarda una sesión por usuario: aquí nadie pasa por el login.
//
// Este archivo no escribe en la base de datos: el equipo activo es una cookie del navegador, y
// cada test tiene su propio contexto. Por eso corre en `mobile`, en paralelo con los demás.

// La pantalla se revisa siempre a 375 px, sea cual sea el proyecto de Playwright.
test.use({ viewport: { width: 375, height: 812 } });

const ALEX = "alex@arcangel.test"; // entrenador de Alevín A: un solo equipo
const RAUL = "raul@arcangel.test"; // dirección: sus equipos son los dos del club

const CLUB = `/c/${ARCANGEL.slug}`;
const ALEVIN_A = seedId(ARCANGEL.slug, "team:alevin-a");
/** Un equipo del otro club: no es de Raúl. */
const FOREIGN_TEAM = seedId(CLUB_DEMO.slug, "team:infantil-a");

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Principal" });
}

function title(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

/** El selector del equipo activo, en la cabecera. */
function switcher(page: Page) {
  return page.getByRole("banner").getByRole("button", { name: /Cambiar de equipo$/ });
}

/** Elige una opción en la hoja del selector y espera a que la pantalla se haya vuelto a pedir. */
async function choose(page: Page, option: string, shown: string): Promise<void> {
  await hydrated(switcher(page));
  await switcher(page).click();
  const sheet = page.getByRole("dialog", { name: "Equipo" });
  await sheet.getByRole("button", { name: option, exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(switcher(page)).toHaveAccessibleName(`${shown}. Cambiar de equipo`);
}

async function goTo(page: Page, tab: string, path: string): Promise<void> {
  await mainNav(page).getByRole("link", { name: tab }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}${path}$`));
}

test("quien tiene un solo equipo no ve el selector", async ({ page }) => {
  await openAs(page, ALEX);
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));
  await expect(page.getByRole("button", { name: "Abrir menú de cuenta" })).toBeVisible();
  await expect(switcher(page)).toHaveCount(0);
});

test("dirección elige un equipo y lo ven Inicio, Agenda, Sesiones y Equipo", async ({ page }) => {
  await openAs(page, RAUL);
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));

  // Sin elegir, todos: es lo que se ve por defecto.
  await expect(switcher(page)).toHaveAccessibleName("Todos. Cambiar de equipo");
  await expect(page.getByText("2 equipos · Temporada 2026/27")).toBeVisible();

  // La hoja ofrece «Todos mis equipos» y cada equipo, por nombre, con el actual marcado.
  await hydrated(switcher(page));
  await switcher(page).click();
  const sheet = page.getByRole("dialog", { name: "Equipo" });
  const options = sheet.locator("button[aria-pressed]");
  await expect(options).toHaveText(["Todos mis equipos", "Alevín A", "Benjamín A"]);
  await expect(options.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expectTouchTargets(options);
  await sheet.getByRole("button", { name: "Cerrar" }).click();
  await expect(sheet).toHaveCount(0);

  await choose(page, "Alevín A", "Alevín A");

  // Inicio: solo ese equipo.
  await expect(page.getByText("Alevín A · Temporada 2026/27")).toBeVisible();
  await expect(page.getByText("2 equipos · Temporada 2026/27")).toHaveCount(0);

  // Agenda: nada de Benjamín A y, con un solo equipo a la vista, las filas no repiten su nombre.
  await goTo(page, "Agenda", "/agenda");
  await expect(switcher(page)).toHaveAccessibleName("Alevín A. Cambiar de equipo");
  await expect(page.getByRole("main").getByRole("link", { name: /Transición \+ rebote defensivo/ })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("Benjamín A");
  await expect(page.getByRole("main")).not.toContainText("Alevín A ·");
  await page.goto(`${CLUB}/agenda?scope=past`);
  await expect(title(page)).toHaveText("Agenda");
  await expect(page.getByRole("main")).not.toContainText("Benjamín A");

  // Sesiones: las de Alevín A, y ninguna de Benjamín A, ni próxima ni pasada.
  await goTo(page, "Sesiones", "/train");
  await expect(page.getByRole("main").getByRole("link", { name: /Transición \+ rebote defensivo/ })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("Bote y control");
  await page.goto(`${CLUB}/train?scope=history`);
  await expect(title(page)).toHaveText("Sesiones");
  await expect(page.getByRole("main")).not.toContainText("Bote y control");

  // «Preparar sesión» lo trae elegido.
  await page.goto(`${CLUB}/train/new`);
  await expect(page.getByLabel("Equipo", { exact: true })).toHaveValue(ALEVIN_A);

  // Equipo: su plantilla directamente, no la lista de equipos.
  await goTo(page, "Equipo", "/team");
  await expect(title(page)).toHaveText("Alevín A");
  await expectFitsMobile(page);

  // «Todos mis equipos» lo quita: Equipo vuelve a ser la lista de los dos.
  await choose(page, "Todos mis equipos", "Todos");
  await expect(title(page)).toHaveText("Equipo");
  await expect(page.getByRole("main").getByRole("link")).toHaveText([/Alevín A/, /Benjamín A/]);
});

test("la elección se recuerda al volver a abrir la app", async ({ page }) => {
  await openAs(page, RAUL);
  await choose(page, "Benjamín A", "Benjamín A");

  await page.goto(CLUB);
  await expect(switcher(page)).toHaveAccessibleName("Benjamín A. Cambiar de equipo");
  await expect(page.getByText("Benjamín A · Temporada 2026/27")).toBeVisible();
  // Nada de Alevín A en Inicio.
  await expect(page.getByRole("main")).not.toContainText("Transición + rebote defensivo");
});

test("una cookie con un equipo que no es mío se ignora: no deja la app vacía ni enseña lo ajeno", async ({ page }) => {
  await openAs(page, RAUL);
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));

  const { hostname } = new URL(page.url());
  await page.context().addCookies([{ name: "active-team", value: FOREIGN_TEAM, domain: hostname, path: CLUB }]);

  await page.goto(CLUB);
  await expect(switcher(page)).toHaveAccessibleName("Todos. Cambiar de equipo");
  await expect(page.getByText("2 equipos · Temporada 2026/27")).toBeVisible();

  await page.goto(`${CLUB}/team`);
  await expect(title(page)).toHaveText("Equipo");
  await expect(page.getByRole("main").getByRole("link")).toHaveText([/Alevín A/, /Benjamín A/]);
  await expect(page.getByRole("main")).not.toContainText("Infantil A");

  // Un valor que ni siquiera es un id tampoco rompe nada.
  await page.context().addCookies([{ name: "active-team", value: "todos", domain: hostname, path: CLUB }]);
  await page.goto(`${CLUB}/agenda`);
  await expect(title(page)).toHaveText("Agenda");
  await expect(switcher(page)).toHaveAccessibleName("Todos. Cambiar de equipo");
});

test("el selector cabe en la cabecera a 375 px, junto a la marca y el avatar", async ({ page }) => {
  await openAs(page, RAUL);
  await expect(switcher(page)).toBeVisible();

  await expectFitsMobile(page);
  await expectTouchTargets(switcher(page));
  await expectTouchTargets(page.getByRole("button", { name: "Abrir menú de cuenta" }));
  // La marca sigue a la vista: es la que cede el sitio, pero no desaparece.
  await expect(page.getByRole("banner").getByText(ARCANGEL.branding.display_name, { exact: true })).toBeVisible();

  // Con el nombre de un equipo, que es más largo que «Todos», también.
  await choose(page, "Benjamín A", "Benjamín A");
  await expectFitsMobile(page);
  await expectTouchTargets(switcher(page));
  await page.screenshot({ path: "test-results/team-switcher-375.png" });
});

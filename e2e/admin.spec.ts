import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth";

// Necesita Supabase local con `pnpm seed` (Arcángel y Club Demo).
//
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts): los
// specs de Gestión de las fases siguientes modifican el seed y van aquí, en serie. Los de
// esta tarea todavía no escriben nada.
test.describe.configure({ mode: "serial" });

const ALEX = "alex@arcangel.test"; // entrenador de Arcángel
const RAUL = "raul@arcangel.test"; // dirección de Arcángel

const CLUB = "/c/arcangel";
const ADMIN = `${CLUB}/admin`;

/** El botón de la cabecera que abre el menú de cuenta: el avatar de quien ha entrado. */
function accountButton(page: Page) {
  return page.getByRole("button", { name: "Abrir menú de cuenta" });
}

function adminNav(page: Page) {
  return page.getByRole("navigation", { name: "Gestión" });
}

test("un entrenador no entra en Gestión", async ({ page }) => {
  await loginAs(page, ALEX);
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));

  // Ni la raíz ni ninguno de los apartados: el mismo 404 que un club ajeno, con su `<main>`
  // y sin el marco de Gestión.
  const paths = [ADMIN, `${ADMIN}/way`, `${ADMIN}/values`, `${ADMIN}/principles`, `${ADMIN}/standards`];
  for (const path of paths) {
    const response = await page.goto(path);

    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
    await expect(page.locator("main").getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(adminNav(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Volver a la app" })).toHaveCount(0);
  }

  // Y su salida lleva a su club, donde el menú de cuenta ofrece Salir y no Gestión.
  await page.getByRole("link", { name: "Volver a tus clubes" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));
  await accountButton(page).click();
  await expect(accountButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Gestión" })).toHaveCount(0);

  // Salir cierra la sesión: es el POST de la cuenta, y sin sesión no se vuelve a entrar.
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(CLUB);
  await expect(page).toHaveURL(/\/login$/);
});

test("dirección entra desde el avatar", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error en ${page.url()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    errors.push(`excepción en ${page.url()}: ${error.message}`);
  });

  await loginAs(page, RAUL);
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));

  // El menú está cerrado hasta que se pulsa; con él abierto, Escape lo cierra y devuelve el foco.
  await expect(accountButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("link", { name: "Gestión" })).toHaveCount(0);
  await accountButton(page).click();
  await expect(page.getByRole("link", { name: "Gestión" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(accountButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(accountButton(page)).toBeFocused();
  await expect(page.getByRole("link", { name: "Gestión" })).toHaveCount(0);

  await accountButton(page).click();
  await page.getByRole("link", { name: "Gestión" }).click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/way$`));

  // El marco de Gestión: nombre del club, kicker y salida; sin la navegación de la app.
  const banner = page.getByRole("banner");
  await expect(banner).toContainText("Arcángel");
  await expect(banner).toContainText("Gestión");
  await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "The Way" })).toBeVisible();

  // Sus apartados, con los nombres que da el club, y el actual marcado.
  const links = adminNav(page).getByRole("link");
  await expect(links).toHaveText(["The Way", "Valores", "Principios", "Arcángel Standards"]);
  await expect(links.first()).toHaveAttribute("aria-current", "page");
  await expect(adminNav(page).locator('[aria-current="page"]')).toHaveCount(1);
  await links.filter({ hasText: "Valores" }).click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/values$`));
  await expect(page.getByRole("heading", { level: 1, name: "Valores" })).toBeVisible();
  await expect(links.filter({ hasText: "Valores" })).toHaveAttribute("aria-current", "page");
  await expect(adminNav(page).locator('[aria-current="page"]')).toHaveCount(1);

  // La raíz de Gestión redirige a la metodología.
  await page.goto(ADMIN);
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/way$`));
  await expect(page.getByRole("heading", { level: 1, name: "The Way" })).toBeVisible();

  // Y «Volver a la app» lleva de vuelta a Inicio.
  await page.getByRole("link", { name: "Volver a la app" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));
  await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("Gestión se adapta al escritorio", async ({ page }) => {
  await loginAs(page, RAUL);
  await page.goto(`${ADMIN}/way`);
  await expect(page.getByRole("heading", { level: 1, name: "The Way" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const nav = adminNav(page);
  const main = page.getByRole("main");

  // A 375 px las pestañas van encima del contenido, se desplazan por dentro y la página no.
  expect(page.viewportSize()?.width).toBe(375);
  const phoneNav = await nav.boundingBox();
  const phoneMain = await main.boundingBox();
  expect(phoneNav).not.toBeNull();
  expect(phoneMain).not.toBeNull();
  expect(phoneNav!.y + phoneNav!.height).toBeLessThanOrEqual(phoneMain!.y + 1);
  expect(await nav.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  // Áreas táctiles de 44 px: pestañas y salida.
  for (const target of [...(await nav.getByRole("link").all()), page.getByRole("link", { name: "Volver a la app" })]) {
    const box = await target.boundingBox();
    const label = (await target.innerText()).replace(/\s+/g, " ").trim();
    expect(box?.height, `alto de «${label}»`).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: "test-results/admin-375.png" });

  // A 1280×800 son una columna a la izquierda del contenido, que no pasa de su ancho máximo.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(nav).toBeVisible();
  const deskNav = await nav.boundingBox();
  const deskMain = await main.boundingBox();
  expect(deskNav).not.toBeNull();
  expect(deskMain).not.toBeNull();
  expect(deskNav!.x + deskNav!.width).toBeLessThanOrEqual(deskMain!.x + 1);
  expect(deskNav!.width).toBeCloseTo(240, 0);
  expect(deskMain!.width).toBeLessThanOrEqual(960);
  expect(await nav.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/admin-1280.png" });
});

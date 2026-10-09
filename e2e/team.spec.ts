import type { Page } from "@playwright/test";
import { ARCANGEL } from "../scripts/seed/data";
import { seedId } from "../scripts/seed/ids";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";

// Equipo, jugadores, objetivos y notas, solo lectura (proyecto `mobile`). Lo que se escribe está
// en `games.spec.ts`, en el proyecto `admin`. Datos del seed (`scripts/seed/data.ts`):
//   · Alevín A: Álex (principal) e Irene (ayudante); doce jugadores.
//   · Hugo Serrano: dos objetivos activos y uno logrado; una nota privada de Álex y una del
//     cuerpo técnico de Irene. Leo Ortega: tres objetivos activos.
//   · Benjamín B, de la temporada pasada, lo entrenaba Álex: no es de «mis equipos».
// Review Focus 1 (una nota privada es privada), 4 (nada de un menor donde no toca) y 5 («mis
// equipos» es esta temporada).

const ALEX = "alex@arcangel.test";
const IRENE = "irene@arcangel.test";
const RAUL = "raul@arcangel.test";
const NORA = "nora@arcangel.test";
const MARTA = "marta@demo.test";

const CLUB = `/c/${ARCANGEL.slug}`;
const ALEVIN_A = seedId(ARCANGEL.slug, "team:alevin-a");
const BENJAMIN_B = seedId(ARCANGEL.slug, "team:2025-26:benjamin-b");
const HUGO = seedId(ARCANGEL.slug, "person:alevin-a:hugo-serrano");
const LEO = seedId(ARCANGEL.slug, "person:alevin-a:leo-ortega");
const hugoUrl = `${CLUB}/team/${ALEVIN_A}/players/${HUGO}`;

const PRIVATE_NOTE = "Muy atento en las ayudas.";
const STAFF_NOTE = "Mejora clara en el pase con la izquierda.";
const NOT_FOUND = "No encontramos esta página";

function title(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

test("Álex ve la plantilla de Alevín A de esta temporada, por dorsal, y entra en la ficha", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/team`);

  await expect(title(page)).toHaveText("Alevín A");
  await expect(page.getByRole("heading", { name: "Plantilla · 12 jugadores" })).toBeVisible();
  await expect(page.getByText("Benjamín B")).toHaveCount(0);

  const players = page.getByRole("main").getByRole("listitem").getByRole("link");
  await expect(players).toHaveCount(12);
  await expect(players.first()).toHaveAccessibleName("Dorsal 4 Hugo Serrano Base");

  await players.first().click();
  await expect(page).toHaveURL(new RegExp(`${hugoUrl}$`));
  await expect(title(page)).toHaveText("Hugo Serrano");
  await expect(page.getByRole("heading", { name: "Objetivos · 2 de 3" })).toBeVisible();
  await expect(page.getByText("Mirar adelante antes de botar")).toBeVisible();
  await expect(page.getByText("Historial · 1")).toBeVisible();
  // Las dos notas: la suya privada y la del cuerpo técnico de Irene.
  await expect(page.getByText(PRIVATE_NOTE)).toBeVisible();
  await expect(page.getByText(STAFF_NOTE)).toBeVisible();
});

test("nada de un menor donde no toca: ni nombres en URLs ni en el título, ni año de nacimiento", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/team`);

  const hrefs = await page.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  for (const href of hrefs) expect(href).not.toMatch(/hugo|serrano|ortega|leo-/i);

  await page.goto(hugoUrl);
  await expect(title(page)).toHaveText("Hugo Serrano");
  await expect(page).not.toHaveTitle(/Hugo|Serrano/);
  await expect(page.getByRole("main")).not.toContainText(/20(1[0-9]|0[0-9])/);
});

test("el equipo de la temporada pasada no se abre, ni para quien lo entrenó", async ({ page, browserErrors }) => {
  browserErrors.allowNotFound(`${CLUB}/team/${BENJAMIN_B}`);
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/team/${BENJAMIN_B}`);

  await expect(title(page)).toHaveText(NOT_FOUND);
});

test("Irene, del mismo cuerpo técnico, no lee la nota privada de Álex; sí la compartida", async ({ page }) => {
  await openAs(page, IRENE);
  await page.goto(hugoUrl);

  await expect(page.getByText(STAFF_NOTE)).toBeVisible();
  await expect(page.getByText(PRIVATE_NOTE)).toHaveCount(0);
});

test("Raúl, dirección, tampoco lee la privada; sí la compartida", async ({ page }) => {
  await openAs(page, RAUL);
  await page.goto(hugoUrl);

  await expect(page.getByText(STAFF_NOTE)).toBeVisible();
  await expect(page.getByText(PRIVATE_NOTE)).toHaveCount(0);
});

test("Nora, de otro equipo, recibe un 404 en la ficha y en la plantilla de Alevín A", async ({ page, browserErrors }) => {
  browserErrors.allowNotFound(hugoUrl, `${CLUB}/team/${ALEVIN_A}`);
  await openAs(page, NORA);

  await page.goto(hugoUrl);
  await expect(title(page)).toHaveText(NOT_FOUND);
  await expect(page.getByText(STAFF_NOTE)).toHaveCount(0);

  await page.goto(`${CLUB}/team/${ALEVIN_A}`);
  await expect(title(page)).toHaveText(NOT_FOUND);
});

test("Marta, de otro club, no ve nada de este", async ({ page, browserErrors }) => {
  browserErrors.allowNotFound(hugoUrl);
  await openAs(page, MARTA);
  await page.goto(hugoUrl);

  await expect(title(page)).toHaveText(NOT_FOUND);
});

test("con tres objetivos activos, «Añadir objetivo» se desactiva y explica por qué", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/team/${ALEVIN_A}/players/${LEO}`);

  await expect(page.getByRole("heading", { name: "Objetivos · 3 de 3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Añadir objetivo" })).toBeDisabled();
  await expect(page.getByText(/ya tiene 3 objetivos activos/)).toBeVisible();
});

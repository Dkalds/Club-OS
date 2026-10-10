import type { Page } from "@playwright/test";
import { ARCANGEL, CLUB_DEMO, seedId } from "../scripts/seed/data";
import { seedSchedule } from "../scripts/seed/dates";
import { localTime } from "../src/lib/time";
import { seedNow } from "./helpers/seed";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";
import { expectFitsMobile, expectTouchTargets, hydrated } from "./helpers/train";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` lo siembra justo antes de los
// tests (Arcángel y Club Demo), deja el instante de esa siembra en `seedNow()` y guarda una
// sesión por usuario: aquí nadie pasa por el login, cada test abre la app con `openAs`.
//
// Este archivo solo LEE: la Agenda enseña los entrenos y los partidos del seed. Crear un
// partido desde ella está en `games.spec.ts`, del proyecto `admin`.
//
// Qué hay en la base de datos lo decide el instante de la SIEMBRA (`seedSchedule(seedNow())`),
// y qué enseña la pantalla de ello, el «ahora» del servidor al pintarla. El primer
// entrenamiento sembrado de Alevín A y su partido empiezan después de sembrar y siguen siendo
// «próximos» hasta que terminan; en qué semana caen depende del día en que se siembre, así que
// los tests no fijan el nombre de la semana, solo que cada una tiene uno válido.

// La pantalla se revisa siempre a 375 px, sea cual sea el proyecto de Playwright.
test.use({ viewport: { width: 375, height: 812 } });

const ALEX = "alex@arcangel.test"; // entrenador de Alevín A
const NORA = "nora@arcangel.test"; // entrenadora de Benjamín A, mismo club
const RAUL = "raul@arcangel.test"; // dirección: ve los dos equipos del club
const MARTA = "marta@demo.test"; // entrenadora del otro club

const CLUB = `/c/${ARCANGEL.slug}`;
const DEMO = `/c/${CLUB_DEMO.slug}`;
const AGENDA = `${CLUB}/agenda`;
const TZ = ARCANGEL.timezone;

const FIRST_PRACTICE = seedId(ARCANGEL.slug, "event:alevin-a:upcoming-0");
const NEXT_GAME = seedId(ARCANGEL.slug, "event:alevin-a:game");
const PLAYED_GAME = seedId(ARCANGEL.slug, "event:alevin-a:past-game");

const WEEK_LABEL = /^(Esta semana|Semana que viene|Semana pasada|Semana del \d{1,2} [a-z]{3})$/;

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Principal" });
}

/** Las pestañas «Próximos» y «Anteriores»: la navegación «Agenda» de dentro de la pantalla. */
function scopeTabs(page: Page) {
  return page.getByRole("main").getByRole("navigation", { name: "Agenda" });
}

function kindChips(page: Page) {
  return page.getByRole("main").getByRole("navigation", { name: "Tipo" });
}

function title(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

/** Las filas de la agenda: los enlaces a una sesión o a un partido. «Añadir» no es una fila. */
function rows(page: Page, club = CLUB) {
  return page.locator(
    `main li > a[href^="${club}/train/"]:not([href$="/new"]), main li > a[href^="${club}/games/"]:not([href$="/new"])`,
  );
}

function row(page: Page, text: string, club = CLUB) {
  return rows(page, club).filter({ hasText: text });
}

function weekHeadings(page: Page) {
  return page.getByRole("main").getByRole("heading", { level: 2 });
}

async function openAgenda(page: Page, email: string, url = AGENDA): Promise<void> {
  await openAs(page, email);
  await page.goto(url);
  await expect(title(page)).toHaveCount(1);
  await expect(title(page)).toHaveText("Agenda");
}

test("Álex ve en la Agenda sus entrenos y sus partidos, por semanas", async ({ page }) => {
  const { upcoming: [first] } = seedSchedule(seedNow(), TZ);

  // Desde la barra, como lo haría una persona.
  await openAs(page, ALEX);
  await mainNav(page).getByRole("link", { name: "Agenda" }).click();
  await expect(page).toHaveURL(new RegExp(`${AGENDA}$`));
  await expect(title(page)).toHaveText("Agenda");
  await expect(mainNav(page).getByRole("link", { name: "Agenda" })).toHaveAttribute("aria-current", "page");
  await expect(mainNav(page).locator('[aria-current="page"]')).toHaveCount(1);

  // Por defecto, los próximos y todo.
  await expect(scopeTabs(page).getByRole("link", { name: "Próximos" })).toHaveAttribute("aria-current", "page");
  await expect(scopeTabs(page).getByRole("link", { name: "Anteriores" })).not.toHaveAttribute("aria-current");
  await expect(kindChips(page).getByRole("link", { name: "Todo" })).toHaveAttribute("aria-current", "true");

  // Cada semana lleva su nombre.
  const headings = await weekHeadings(page).allTextContents();
  expect(headings.length).toBeGreaterThan(0);
  for (const heading of headings) expect(heading).toMatch(WEEK_LABEL);
  expect(new Set(headings).size).toBe(headings.length);

  // Un entreno: su título, qué es, lo que dura y dónde, y la hora en la zona del club (regla 7).
  const practice = row(page, "Transición + rebote defensivo");
  await expect(practice).toHaveCount(1);
  await expect(practice).toHaveAttribute("href", `${CLUB}/train/${FIRST_PRACTICE}`);
  await expect(practice).toContainText("Entrenamiento · 75 min · Pabellón 2");
  await expect(practice).toContainText(localTime(first.startsAt, TZ));

  // Un partido: el rival, que es un partido y su competición.
  const game = row(page, "vs CB Ribera");
  await expect(game).toHaveCount(1);
  await expect(game).toHaveAttribute("href", `${CLUB}/games/${NEXT_GAME}`);
  await expect(game).toContainText("Partido");
  await expect(game).toContainText("Liga Alevín");

  // Lo que no es suyo, o no es de lo próximo. Con un solo equipo, las filas no repiten su nombre.
  const main = page.getByRole("main");
  await expect(main).not.toContainText("Bote y control");
  await expect(main).not.toContainText("CD Almendros");
  await expect(main).not.toContainText("Alevín A ·");

  // Solo los partidos.
  await kindChips(page).getByRole("link", { name: "Partidos" }).click();
  await expect(page).toHaveURL(new RegExp(`${AGENDA}\\?kind=game$`));
  await expect(kindChips(page).getByRole("link", { name: "Partidos" })).toHaveAttribute("aria-current", "true");
  await expect(rows(page)).toHaveCount(1);
  await expect(row(page, "vs CB Ribera")).toBeVisible();

  // Los anteriores conservan el filtro: el partido jugado, con su marcador.
  await scopeTabs(page).getByRole("link", { name: "Anteriores" }).click();
  await expect(page).toHaveURL(new RegExp(`${AGENDA}\\?scope=past&kind=game$`));
  const played = row(page, "vs CD Almendros");
  await expect(played).toHaveAttribute("href", `${CLUB}/games/${PLAYED_GAME}`);
  await expect(played).toContainText("54–49");
  await expect(row(page, "vs CB Ribera")).toHaveCount(0);

  // Y todo lo anterior: las sesiones hechas y la cancelada, cada una diciendo cómo acabó.
  await kindChips(page).getByRole("link", { name: "Todo" }).click();
  await expect(page).toHaveURL(new RegExp(`${AGENDA}\\?scope=past$`));
  await expect(row(page, "Tiro libre y finalizaciones")).toContainText("Cancelada");
  await expect(rows(page).filter({ hasText: "Hecho" }).first()).toBeVisible();
  await expect(row(page, "vs CD Almendros")).toBeVisible();
});

test("una fila lleva a la pantalla de su evento, y la pestaña sigue siendo Agenda en un partido", async ({ page }) => {
  await openAgenda(page, ALEX);

  await row(page, "vs CB Ribera").click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/games/${NEXT_GAME}$`));
  await expect(mainNav(page).getByRole("link", { name: "Agenda" })).toHaveAttribute("aria-current", "page");
  // La vuelta del partido es a la Agenda.
  await page.getByRole("main").getByRole("link", { name: "Agenda", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${AGENDA}$`));

  // Un entreno abre su sesión, que es de la pestaña Sesiones.
  await row(page, "Transición + rebote defensivo").click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/${FIRST_PRACTICE}$`));
  await expect(mainNav(page).getByRole("link", { name: "Sesiones" })).toHaveAttribute("aria-current", "page");
});

test("«Añadir» ofrece una sesión o un partido a quien puede gestionarlos", async ({ page }) => {
  await openAgenda(page, ALEX);

  const add = page.getByRole("button", { name: "Añadir" });
  await hydrated(add);
  await add.click();
  const sheet = page.getByRole("dialog", { name: "Añadir" });
  await expect(sheet.getByRole("link")).toHaveText(["Sesión de entrenamiento", "Partido"]);
  await expect(sheet.getByRole("link", { name: "Sesión de entrenamiento" })).toHaveAttribute("href", `${CLUB}/train/new`);
  await expect(sheet.getByRole("link", { name: "Partido" })).toHaveAttribute("href", `${CLUB}/games/new`);
  await expectTouchTargets(sheet.getByRole("link"));
});

test.describe("cada uno lo suyo", () => {
  test("Nora no ve nada de Alevín A en su agenda", async ({ page }) => {
    await openAgenda(page, NORA);
    const main = page.getByRole("main");
    await expect(main).not.toContainText("Transición + rebote defensivo");
    await expect(main).not.toContainText("CB Ribera");

    await page.goto(`${AGENDA}?scope=past`);
    await expect(title(page)).toHaveText("Agenda");
    await expect(main).not.toContainText("CD Almendros");
    await expect(main).not.toContainText("Tiro libre y finalizaciones");
  });

  test("Raúl ve los de los dos equipos, cada fila con el suyo", async ({ page }) => {
    await openAgenda(page, RAUL);

    await expect(row(page, "Transición + rebote defensivo")).toContainText("Alevín A · Entrenamiento");
    await expect(row(page, "vs CB Ribera")).toContainText("Alevín A · Partido");

    // Lo de Benjamín A, que no es de Álex, sí es de dirección. Su sesión es de una hora de la
    // tarde del día del primer entrenamiento: si ya ha pasado, está entre lo anterior.
    if ((await row(page, "Bote y control").count()) === 0) {
      await page.goto(`${AGENDA}?scope=past`);
      await expect(title(page)).toHaveText("Agenda");
    }
    await expect(row(page, "Bote y control")).toContainText("Benjamín A · Entrenamiento");
  });

  test("Marta ve la agenda de su club y nada de Arcángel", async ({ page, browserErrors }) => {
    await openAgenda(page, MARTA, `${DEMO}/agenda`);
    const main = page.getByRole("main");
    await expect(main).not.toContainText("Transición + rebote defensivo");
    await expect(main).not.toContainText("CB Ribera");
    for (const link of await rows(page, DEMO).all()) {
      await expect(link).toHaveAttribute("href", new RegExp(`^${DEMO}/`));
    }

    // La agenda del otro club, por su URL, es un club ajeno: el mismo 404 de siempre.
    browserErrors.allowNotFound(AGENDA);
    await page.goto(AGENDA);
    await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Transición + rebote defensivo");
  });
});

test("cabe en el móvil, con áreas táctiles de 44 px y sin errores de consola", async ({ page, browserErrors }) => {
  // La pantalla más llena: la dirección, con los dos equipos y el nombre del equipo delante.
  await openAgenda(page, RAUL);
  await expect(rows(page).first()).toBeVisible();
  await expectFitsMobile(page);
  await expectTouchTargets(rows(page));
  await expectTouchTargets(scopeTabs(page).getByRole("link"));
  await expectTouchTargets(kindChips(page).getByRole("link"));
  await expectTouchTargets(page.getByRole("button", { name: "Añadir" }));
  await expect(mainNav(page)).toBeInViewport();
  await page.screenshot({ path: "test-results/agenda-375.png" });

  // Lo anterior, con cómo acabó cada cosa a la derecha.
  await scopeTabs(page).getByRole("link", { name: "Anteriores" }).click();
  await expect(page).toHaveURL(new RegExp(`${AGENDA}\\?scope=past$`));
  await expect(rows(page).first()).toBeVisible();
  await expectFitsMobile(page);
  await expectTouchTargets(rows(page));

  expect(browserErrors.seen).toEqual([]);
});

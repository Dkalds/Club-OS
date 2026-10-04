import type { Locator, Page } from "@playwright/test";
import { ARCANGEL, CLUB_DEMO, seedId } from "../scripts/seed/data";
import { seedSchedule } from "../scripts/seed/dates";
import { dayChip, localTime } from "../src/lib/time";
import { seedNow } from "./helpers/seed";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` lo siembra justo antes de los
// tests (Arcángel y Club Demo), deja el instante de esa siembra en `seedNow()` y guarda una
// sesión por usuario: aquí nadie pasa por el login, cada test abre la app con `openAs`.
//
// Este archivo solo LEE: no crea ni cancela sesiones, así que sus tests corren en paralelo con
// el resto de `mobile`. No abre ninguna sesión (`/train/{id}`) ni `/train/new`: esas pantallas
// son de la tarea siguiente y aquí solo se comprueba a dónde llevan los enlaces.
//
// Qué hay en la base de datos lo decide el instante de la SIEMBRA (`seedSchedule(seedNow())`),
// y qué enseña la pantalla de ello, el «ahora» del servidor al pintarla. La sesión de
// Benjamín A es de 17:00 a 18:00 del mismo día que el próximo entrenamiento de Alevín A: si la
// ejecución cruza el final de esa hora, pasa al histórico, y los tests que la miran lo tienen
// en cuenta (`ownSessionIsUpcoming`).

// La pantalla se revisa siempre a 375 px, sea cual sea el proyecto de Playwright.
test.use({ viewport: { width: 375, height: 812 } });

const ALEX = "alex@arcangel.test"; // entrenador de Alevín A
const NORA = "nora@arcangel.test"; // entrenadora de Benjamín A, mismo club
const RAUL = "raul@arcangel.test"; // dirección, sin equipo
const MARTA = "marta@demo.test"; // entrenadora del otro club

const CLUB = `/c/${ARCANGEL.slug}`;
const DEMO = `/c/${CLUB_DEMO.slug}`;
const TZ = ARCANGEL.timezone;

const ALEVIN_META = "75 min · 5 ejercicios · Pabellón 2";
const PRESSING_META = "75 min · 6 ejercicios · Pabellón 2";
const BENJAMIN_META = "60 min · 4 ejercicios · Pabellón 1";

/** El equipo del seed con esa clave, o un error claro si el seed ya no lo tiene. */
function teamOf(key: string) {
  const team = ARCANGEL.teams.find((candidate) => candidate.key === key);
  if (!team) throw new Error(`El seed ya no tiene el equipo «${key}».`);
  return team;
}

function sessionTabs(page: Page) {
  return page.getByRole("navigation", { name: "Sesiones" });
}

function tab(page: Page, name: "Próximas" | "Histórico") {
  return sessionTabs(page).getByRole("link", { name });
}

/**
 * Las filas de la lista: los enlaces a una sesión (`/train/{id}`). «Nueva sesión» también
 * cuelga de `/train/`, pero lleva a `/new`, que no es una sesión.
 */
function rows(page: Page, club = CLUB) {
  return page.locator(`main a[href^="${club}/train/"]:not([href$="/new"])`);
}

function row(page: Page, title: string, club = CLUB) {
  return rows(page, club).filter({ hasText: title });
}

/** Un `<h1>`: toda pantalla tiene uno solo, y es lo que dice dónde se está. */
function title(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

/** Entra y espera a que Entrenar esté pintado. */
async function openTrain(page: Page, email: string, club = CLUB, search = ""): Promise<void> {
  await openAs(page, email);
  await page.goto(`${club}/train${search}`);
  await expect(title(page)).toHaveCount(1);
  await expect(title(page)).toHaveText("Entrenar");
}

/**
 * ¿Sigue la sesión de Benjamín A entre las próximas? Se pregunta DESPUÉS de pintar la
 * pantalla: si ni entonces había terminado, tenía que estar al pintarla.
 */
function ownSessionIsUpcoming(): boolean {
  const [session] = teamOf("benjamin-a").sessions;
  return Date.now() < Date.parse(session.slot(seedSchedule(seedNow(), TZ), TZ).endsAt);
}

test("el seed tiene lo que estos tests suponen", () => {
  // Sin esto, una prueba de «no ve lo de otro equipo» pasaría aunque no hubiera nada que ver.
  const alevin = teamOf("alevin-a");
  expect(alevin.sessions.filter((session) => session.status === "scheduled").map((session) => session.title)).toEqual([
    "Transición + rebote defensivo",
    "Defensa presionante",
  ]);
  expect(alevin.sessions.filter((session) => session.status === "done")).toHaveLength(4);
  expect(alevin.sessions.filter((session) => session.status === "cancelled").map((session) => session.title)).toEqual([
    "Tiro libre y finalizaciones",
  ]);
  expect(teamOf("benjamin-a").sessions.map((session) => session.title)).toEqual(["Bote y control"]);
});

test("Álex ve sus próximas sesiones", async ({ page }) => {
  // Reloj de la siembra: los dos primeros martes/jueves tras sembrar, que siguen siendo
  // «próximos» hasta que terminan.
  const [first, second] = seedSchedule(seedNow(), TZ).upcoming;

  await openTrain(page, ALEX);

  await expect(tab(page, "Próximas")).toHaveAttribute("aria-current", "page");
  await expect(tab(page, "Histórico")).not.toHaveAttribute("aria-current");
  await expect(rows(page)).toHaveCount(2);

  const transition = row(page, "Transición + rebote defensivo");
  await expect(transition).toHaveCount(1);
  await expect(transition).toHaveAttribute("href", `${CLUB}/train/${seedId(ARCANGEL.slug, "event:alevin-a:upcoming-0")}`);
  await expect(transition).toContainText(ALEVIN_META);
  // El día y la hora, en la zona del club (regla 7), no en la del navegador ni en la del servidor.
  const firstChip = dayChip(first.startsAt, TZ);
  await expect(transition).toContainText(`${firstChip.dow}${firstChip.day}`);
  await expect(transition).toContainText(localTime(first.startsAt, TZ));

  const pressing = row(page, "Defensa presionante");
  await expect(pressing).toHaveCount(1);
  await expect(pressing).toHaveAttribute("href", `${CLUB}/train/${seedId(ARCANGEL.slug, "event:alevin-a:upcoming-1")}`);
  await expect(pressing).toContainText(PRESSING_META);
  await expect(pressing).toContainText(localTime(second.startsAt, TZ));

  // Lo que no es suyo, o no es de las próximas.
  const main = page.locator("main");
  await expect(main).not.toContainText("Bote y control");
  await expect(main).not.toContainText("Tiro libre y finalizaciones");
  // Con un solo equipo, las filas no repiten su nombre.
  await expect(main).not.toContainText("Alevín A ·");

  // Quien entrena puede crear; el botón lleva a la pantalla de crear (no se abre aquí).
  await expect(page.getByRole("link", { name: "Nueva sesión" })).toHaveAttribute("href", `${CLUB}/train/new`);
  // La biblioteca sigue debajo de las sesiones.
  const library = page.getByRole("link", { name: "Biblioteca de ejercicios" });
  await expect(library).toHaveAttribute("href", `${CLUB}/drills`);
  const [lastRow, libraryBox] = await Promise.all([rows(page).last().boundingBox(), library.boundingBox()]);
  expect(libraryBox?.y).toBeGreaterThan(lastRow?.y ?? Number.POSITIVE_INFINITY);
});

test("el histórico: las hechas con «Hecho» y la cancelada con «Cancelada»", async ({ page }) => {
  const alevin = teamOf("alevin-a");
  const done = alevin.sessions.filter((session) => session.status === "done").map((session) => session.title);
  const [cancelled] = alevin.sessions.filter((session) => session.status === "cancelled").map((session) => session.title);

  await openTrain(page, ALEX);
  await tab(page, "Histórico").click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train\\?scope=history$`));
  await expect(title(page)).toHaveText("Entrenar");

  await expect(tab(page, "Histórico")).toHaveAttribute("aria-current", "page");
  await expect(tab(page, "Próximas")).not.toHaveAttribute("aria-current");

  // Del más reciente al más antiguo: la cancelada es del día de la segunda próxima.
  await expect(rows(page)).toHaveCount(5);
  await expect(rows(page)).toContainText([cancelled, ...done]);
  for (const sessionTitle of done) {
    await expect(row(page, sessionTitle)).toContainText("Hecho");
    await expect(row(page, sessionTitle)).not.toContainText("Cancelada");
  }
  await expect(row(page, cancelled)).toContainText("Cancelada");
  await expect(row(page, cancelled)).not.toContainText("Hecho");

  // Las que aún no se han entrenado no son histórico.
  await expect(page.locator("main")).not.toContainText("Transición + rebote defensivo");
  await expect(page.locator("main")).not.toContainText("Defensa presionante");

  // Y de vuelta a las próximas.
  await tab(page, "Próximas").click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train$`));
  await expect(tab(page, "Próximas")).toHaveAttribute("aria-current", "page");
  await expect(row(page, "Transición + rebote defensivo")).toBeVisible();
});

test.describe("cada uno lo suyo", () => {
  test("Nora ve solo la sesión de Benjamín A", async ({ page }) => {
    // `openTrain` carga el documento entero: el HTML trae también los datos que Next manda
    // al navegador sin pintarlos, y se revisan los dos.
    await openTrain(page, NORA);
    const html = await page.content();

    if (ownSessionIsUpcoming()) {
      await expect(rows(page)).toHaveCount(1);
      await expect(rows(page).first()).toContainText("Bote y control");
      await expect(rows(page).first()).toContainText(BENJAMIN_META);
      // Con un solo equipo no repite su nombre.
      await expect(page.locator("main")).not.toContainText("Benjamín A ·");
    }

    const alevin = teamOf("alevin-a");
    const foreign = [
      alevin.name,
      ...alevin.sessions.flatMap((session) => [session.title, ...session.items.map((item) => item.title)]),
    ];
    expect(foreign).toContain("Transición + rebote defensivo");
    for (const text of foreign) {
      expect(html, `«${text}» es de Alevín A y no debería llegar a Nora`).not.toContain(text);
    }
  });

  test("Nora no tiene histórico: no ve el de Alevín A", async ({ page }) => {
    await openTrain(page, NORA, CLUB, "?scope=history");

    await expect(tab(page, "Histórico")).toHaveAttribute("aria-current", "page");
    for (const session of teamOf("alevin-a").sessions) {
      await expect(page.locator("main")).not.toContainText(session.title);
    }
    if (ownSessionIsUpcoming()) {
      await expect(rows(page)).toHaveCount(0);
      await expect(page.getByRole("heading", { level: 2, name: "Aún no hay sesiones pasadas" })).toBeVisible();
      await expect(page.getByText("Las sesiones que termines aparecerán aquí.")).toBeVisible();
      await expect(page.getByRole("link", { name: "Ver próximas" })).toHaveAttribute("href", `${CLUB}/train`);
    }
  });

  test("Raúl ve las sesiones de los dos equipos, cada una con el suyo", async ({ page }) => {
    await openTrain(page, RAUL);

    await expect(row(page, "Transición + rebote defensivo")).toContainText(`Alevín A · ${ALEVIN_META}`);
    await expect(row(page, "Defensa presionante")).toContainText("Alevín A · ");
    if (ownSessionIsUpcoming()) {
      await expect(rows(page)).toHaveCount(3);
      await expect(row(page, "Bote y control")).toContainText(`Benjamín A · ${BENJAMIN_META}`);
    }
    // Quien dirige puede crear, aunque no tenga equipo propio.
    await expect(page.getByRole("link", { name: "Nueva sesión" })).toHaveAttribute("href", `${CLUB}/train/new`);
  });

  test("Marta ve la sesión de su club y nada de Arcángel", async ({ page }) => {
    await openTrain(page, MARTA, DEMO);
    const html = await page.content();

    await expect(rows(page, DEMO)).toHaveCount(1);
    await expect(rows(page, DEMO).first()).toContainText("Defensa individual");
    await expect(rows(page, DEMO).first()).toHaveAttribute("href", new RegExp(`^${DEMO}/train/[0-9a-f-]{36}$`));
    // Ninguna fila ni enlace lleva al otro club.
    await expect(page.locator(`main a[href*="${CLUB}/"]`)).toHaveCount(0);

    const foreign = ARCANGEL.teams.flatMap((team) => [
      team.name,
      ...team.sessions.flatMap((session) => [session.title, ...session.items.map((item) => item.title)]),
    ]);
    expect(foreign.length).toBeGreaterThan(10);
    for (const text of foreign) {
      expect(html, `«${text}» es de Arcángel y no debería llegar a Marta`).not.toContain(text);
    }
  });
});

/** Alto y ancho de cada elemento, con su nombre en el mensaje, de al menos 44 px. */
async function expectTouchTargets(targets: Locator): Promise<void> {
  const all = await targets.all();
  expect(all.length).toBeGreaterThan(0);
  for (const target of all) {
    const box = await target.boundingBox();
    const label = (await target.innerText()).replace(/\s+/g, " ").trim();
    expect(box?.height, `alto de «${label}»`).toBeGreaterThanOrEqual(44);
    expect(box?.width, `ancho de «${label}»`).toBeGreaterThanOrEqual(44);
  }
}

async function expectFitsMobile(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  expect(page.viewportSize()?.width).toBe(375);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);
}

test("cabe en el móvil, con áreas táctiles de 44 px y sin errores de consola", async ({ page, browserErrors }) => {
  // La pantalla más llena: la dirección, con las sesiones de dos equipos y el nombre del equipo
  // delante de cada metadato.
  await openTrain(page, RAUL);
  await expect(rows(page).first()).toBeVisible();
  await expectFitsMobile(page);
  await expectTouchTargets(rows(page));
  await expectTouchTargets(sessionTabs(page).getByRole("link"));
  await expectTouchTargets(page.getByRole("link", { name: "Nueva sesión" }));
  await expect(page.getByRole("navigation", { name: "Principal" })).toBeInViewport();
  await page.screenshot({ path: "test-results/train-375.png" });

  // El histórico, con el estado de cada sesión a la derecha.
  await tab(page, "Histórico").click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train\\?scope=history$`));
  await expect(rows(page).first()).toBeVisible();
  await expectFitsMobile(page);
  await expectTouchTargets(rows(page));

  expect(browserErrors.seen).toEqual([]);
});

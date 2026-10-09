import type { Page } from "@playwright/test";
import { ARCANGEL, CLUB_DEMO, seedId } from "../scripts/seed/data";
import { seedSchedule } from "../scripts/seed/dates";
import { dayChip, formatEventSlot, localTime } from "../src/lib/time";
import { seedNow } from "./helpers/seed";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";
import { expectFitsMobile, expectTouchTargets } from "./helpers/train";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` lo siembra justo antes de los
// tests (Arcángel y Club Demo), deja el instante de esa siembra en `seedNow()` y guarda una
// sesión por usuario: aquí nadie pasa por el login, cada test abre la app con `openAs`.
//
// Este archivo solo LEE: no crea, duplica ni cancela sesiones, así que sus tests corren en
// paralelo con el resto de `mobile`. Abre el detalle de una sesión (`/train/{id}`), que solo se
// mira; `/train/new` y lo que escribe (crear, duplicar, cancelar) está en
// `practice-session.spec.ts`, del proyecto `admin`.
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
const TODAY_LIVE_META = "70 min · 4 ejercicios · Pabellón 2";

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

function todayLiveIsUpcoming(): boolean {
  return Date.now() < Date.parse(seedSchedule(seedNow(), TZ).todayLive.endsAt);
}

test("el seed tiene lo que estos tests suponen", () => {
  // Sin esto, una prueba de «no ve lo de otro equipo» pasaría aunque no hubiera nada que ver.
  const alevin = teamOf("alevin-a");
  expect(alevin.sessions.filter((session) => session.status === "scheduled").map((session) => session.title)).toEqual([
    "Transición + rebote defensivo",
    "Defensa presionante",
    "Bloqueo directo y continuación",
  ]);
  expect(alevin.sessions.filter((session) => session.status === "done")).toHaveLength(4);
  expect(alevin.sessions.filter((session) => session.status === "cancelled").map((session) => session.title)).toEqual([
    "Tiro libre y finalizaciones",
  ]);
  expect(teamOf("benjamin-a").sessions.map((session) => session.title)).toEqual(["Bote y control"]);
});

test("Álex ve sus próximas sesiones", async ({ page }) => {
  // Reloj de la siembra: los dos primeros martes/jueves tras sembrar, que siguen siendo
  // «próximos» hasta que terminan. todayLive (18:00 del día de siembra) también aparece
  // mientras no haya terminado (`ends_at > now`).
  const { upcoming: [first, second], todayLive: todayLiveSlot } = seedSchedule(seedNow(), TZ);
  const hasTodayLive = todayLiveIsUpcoming();

  await openTrain(page, ALEX);

  await expect(tab(page, "Próximas")).toHaveAttribute("aria-current", "page");
  await expect(tab(page, "Histórico")).not.toHaveAttribute("aria-current");
  await expect(rows(page)).toHaveCount(hasTodayLive ? 3 : 2);

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

  if (hasTodayLive) {
    const todayLiveRow = row(page, "Bloqueo directo y continuación");
    await expect(todayLiveRow).toHaveCount(1);
    await expect(todayLiveRow).toHaveAttribute("href", `${CLUB}/train/${seedId(ARCANGEL.slug, "event:alevin-a:today-live")}`);
    await expect(todayLiveRow).toContainText(TODAY_LIVE_META);
    await expect(todayLiveRow).toContainText(localTime(todayLiveSlot.startsAt, TZ));
  }

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

  // Del más reciente al más antiguo: la cancelada es del día de la segunda próxima. La de
  // hoy (todayLive) pasa al histórico en cuanto termina, sin «Hecho» ni «Cancelada».
  const endedToday = todayLiveIsUpcoming() ? [] : ["Bloqueo directo y continuación"];
  await expect(rows(page)).toHaveCount(5 + endedToday.length);
  await expect(rows(page)).toContainText([cancelled, ...endedToday, ...done]);
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
    if (todayLiveIsUpcoming()) {
      await expect(row(page, "Bloqueo directo y continuación")).toContainText("Alevín A · ");
    }
    if (ownSessionIsUpcoming()) {
      await expect(rows(page)).toHaveCount(todayLiveIsUpcoming() ? 4 : 3);
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

/** La sesión del seed con ese título en ese equipo, o un error claro si el seed ya no la tiene. */
function sessionOf(teamKey: string, title: string) {
  const session = teamOf(teamKey).sessions.find((candidate) => candidate.title === title);
  if (!session) throw new Error(`El seed ya no tiene la sesión «${title}» de ${teamKey}.`);
  return session;
}

test.describe("el detalle de una sesión", () => {
  test("Álex abre su próximo entrenamiento desde Inicio y ve qué se trabaja, por fases", async ({ page }) => {
    const { upcoming: [first], todayLive: todayLiveSlot } = seedSchedule(seedNow(), TZ);
    const isTodayLive = todayLiveIsUpcoming();
    const sessionTitle = isTodayLive ? "Bloqueo directo y continuación" : "Transición + rebote defensivo";
    const eventId = seedId(ARCANGEL.slug, isTodayLive ? "event:alevin-a:today-live" : "event:alevin-a:upcoming-0");
    const slot = isTodayLive ? todayLiveSlot : first;
    const meta = isTodayLive ? TODAY_LIVE_META : ALEVIN_META;
    const total = isTodayLive ? "70'" : "75'";
    const objectives = isTodayLive ? ["Ataque", "Técnica"] : ["Transición", "Rebote"];
    const { items } = sessionOf("alevin-a", sessionTitle);

    await openAs(page, ALEX);
    await expect(page).toHaveURL(new RegExp(`${CLUB}$`));
    await page
      .getByRole("article")
      .filter({ hasText: "Próximo entrenamiento" })
      .getByRole("link", { name: "Abrir entrenamiento" })
      .click();
    await expect(page).toHaveURL(new RegExp(`${CLUB}/train/${eventId}$`));

    // El título es el único `<h1>`; debajo, la franja en la zona del club y sus metadatos.
    await expect(title(page)).toHaveCount(1);
    await expect(title(page)).toHaveText(sessionTitle);
    const main = page.getByRole("main");
    await expect(main).toContainText(formatEventSlot(slot.startsAt, slot.endsAt, TZ));
    await expect(main).toContainText(meta);
    await expect(main.getByRole("list", { name: "Objetivos" }).getByRole("listitem")).toHaveText(objectives);
    await expect(main.getByRole("link", { name: "Entrenar", exact: true })).toHaveAttribute("href", `${CLUB}/train`);

    // Los ejercicios, en bloques de fase, numerados de 01 a n a lo largo de toda la sesión.
    for (const { phase } of items) {
      await expect(main.getByRole("heading", { level: 2, name: phase, exact: true }).first()).toBeVisible();
    }
    // Las filas son las de las listas de bloques (`role="list"` explícito de `Card as="ul"`), que
    // llevan el texto solo para lectores de pantalla de sus minutos («15 minutos»): la lista de
    // Standards también tiene el rol pero sus filas no lo llevan, y la de objetivos de la cabecera no
    // tiene el rol. No por no llevar enlaces: un ejercicio de la biblioteca enlaza a su ficha.
    const listRows = main.locator('ul[role="list"] > li:has(.sr-only)');
    await expect(listRows).toHaveCount(items.length);
    for (const [index, item] of items.entries()) {
      const number = String(index + 1).padStart(2, "0");
      await expect(listRows.nth(index)).toContainText(number);
      await expect(listRows.nth(index)).toContainText(item.title);
      await expect(listRows.nth(index)).toContainText(`${item.minutes}'`);
    }
    await expect(main.getByText("Total", { exact: true }).locator("..")).toContainText(total);

    // Quien entrena puede editarla (el constructor escribe: lo abre `practice-builder.spec.ts`).
    await expect(page.getByRole("link", { name: "Editar sesión" })).toHaveAttribute("href", `${CLUB}/train/${eventId}/edit`);
    await expect(page.getByRole("button", { name: "Duplicar" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancelar sesión" })).toBeVisible();
  });

  test("una sesión hecha o cancelada no se edita ni se cancela: solo se duplica", async ({ page }) => {
    await openAs(page, ALEX);

    for (const [key, sessionTitle, state] of [
      ["past-0", "Tiro tras bote", "Hecho"],
      ["cancelled-0", "Tiro libre y finalizaciones", "Cancelada"],
    ] as const) {
      await page.goto(`${CLUB}/train/${seedId(ARCANGEL.slug, `event:alevin-a:${key}`)}`);

      await expect(title(page)).toHaveText(sessionTitle);
      await expect(page.getByRole("main")).toContainText(state);
      await expect(page.getByRole("link", { name: "Editar sesión" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Cancelar sesión" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Duplicar" })).toBeVisible();
    }
  });

  test("cabe en el móvil, con áreas táctiles de 44 px y sin errores de consola", async ({ page, browserErrors }) => {
    await openAs(page, ALEX);
    await page.goto(`${CLUB}/train/${seedId(ARCANGEL.slug, "event:alevin-a:upcoming-0")}`);
    await expect(title(page)).toHaveText("Transición + rebote defensivo");
    await expect(page.getByRole("button", { name: "Duplicar" })).toBeVisible();

    await expectFitsMobile(page);
    await expectTouchTargets(page.getByRole("main").locator("a, button"));
    await page.screenshot({ path: "test-results/train-detail-375.png", fullPage: true });

    expect(browserErrors.seen).toEqual([]);
  });
});

import type { Page } from "@playwright/test";
import { ARCANGEL, CLUB_DEMO, seedId } from "../scripts/seed/data";
import { seedSchedule, type SlotIso } from "../scripts/seed/dates";
import { addLocalDays, formatEventSlot, startOfLocalDay } from "../src/lib/time";
import { seedNow } from "./helpers/seed";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` lo siembra justo antes de los
// tests (Arcángel y Club Demo), deja el instante de esa siembra en `seedNow()` y guarda una
// sesión por usuario: aquí nadie pasa por el login, cada test abre la app con `openAs`.
//
// Contra un Supabase que no es local el arranque global no siembra (ver su cabecera):
// `seedNow()` sigue definido, pero estos tests solo aciertan si ese destino se sembró hace
// poco y `E2E_SEED_NOW` dice cuándo.
//
// Aquí cuentan dos relojes, y cada test dice cuál usa:
//  - Qué hay en la base de datos lo decide el instante de la SIEMBRA: el calendario
//    esperado es `seedSchedule(seedNow(), zona del club)`, nunca `seedSchedule(new Date())`.
//    Así da igual cuánto tarde la ejecución en llegar a cada test, o que entre medias
//    empiece un entrenamiento.
//  - Qué enseña la pantalla de ese calendario lo decide el «ahora» del SERVIDOR al
//    pintarla: «próximo» es lo que aún no ha terminado y «esta semana» empieza hoy. Donde
//    eso importa, el test acota ese «ahora» con su propio reloj de antes y de después.
//
// Lo único que queda expuesto al reloj es la propia ejecución, y solo si dura más que un
// entrenamiento (75 min): para entonces lo sembrado como «próximo» ya habría terminado.
// Puede pasar con el modo interactivo de Playwright abierto mucho rato; se arregla
// relanzándolo, que vuelve a sembrar.

// La pantalla se revisa siempre a 375 px, sea cual sea el proyecto de Playwright.
test.use({ viewport: { width: 375, height: 812 } });

const ALEX = "alex@arcangel.test"; // entrenador de Alevín A
const NORA = "nora@arcangel.test"; // entrenadora de Benjamín A, mismo club
const RAUL = "raul@arcangel.test"; // dirección, sin equipo
const MARTA = "marta@demo.test"; // entrenadora del otro club

const CLUB = `/c/${ARCANGEL.slug}`;
const DEMO = `/c/${CLUB_DEMO.slug}`;
const TZ = ARCANGEL.timezone;

const GREETING = "(Buenos días|Buenas tardes|Buenas noches)";

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Principal" });
}

/** La card destacada del próximo entrenamiento. */
function practiceCard(page: Page) {
  return page.getByRole("article").filter({ hasText: "Próximo entrenamiento" });
}

function gameCard(page: Page) {
  return page.getByRole("article").filter({ hasText: "Próximo partido" });
}

/** El bloque «Esta semana»: su título y sus filas. */
function weekSection(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { level: 2, name: "Esta semana" }) });
}

/**
 * ¿Empieza `slot` dentro de «Esta semana», vista en el instante `now`? La semana va de las
 * 00:00 de ese día a las 00:00 de siete días después, en la zona del club.
 */
function startsThisWeek(slot: SlotIso, now: Date): boolean {
  const weekStart = startOfLocalDay(now.toISOString(), TZ);
  const weekEnd = addLocalDays(weekStart, 7, TZ);
  const start = Date.parse(slot.startsAt);
  return start >= Date.parse(weekStart) && start < Date.parse(weekEnd);
}

/** Entra y espera a que Inicio esté pintado: el saludo, con su nombre, es el único `<h1>`. */
async function openHome(page: Page, email: string, club: string, firstName: string): Promise<void> {
  await openAs(page, email);
  await expect(page).toHaveURL(new RegExp(`${club}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    new RegExp(`^${GREETING}, ${firstName}\\.$`),
  );
}

test("el entrenador ve su próximo entrenamiento", async ({ page }) => {
  // Reloj de la siembra. El primer entrenamiento sembrado empieza después de sembrar y
  // sigue siendo «el próximo» hasta que termina, aunque empiece durante la ejecución.
  // todayLive (18:00 del día de siembra) sale antes que upcoming-0 mientras no haya terminado.
  const { upcoming: [next], todayLive: todayLiveSlot } = seedSchedule(seedNow(), TZ);
  const isTodayLive = Date.now() < Date.parse(todayLiveSlot.endsAt);
  const sessionTitle = isTodayLive ? "Bloqueo directo y continuación" : "Transición + rebote defensivo";
  const sessionMeta = isTodayLive ? "70 min · 4 ejercicios · Pabellón 2" : "75 min · 5 ejercicios · Pabellón 2";
  const sessionSlot = isTodayLive ? todayLiveSlot : next;
  const sessionKey = isTodayLive ? "event:alevin-a:today-live" : "event:alevin-a:upcoming-0";

  await openHome(page, ALEX, CLUB, "Álex");

  // Encima del saludo, su equipo y la temporada.
  await expect(page.getByText("Alevín A · Temporada 2026/27")).toBeVisible();

  const card = practiceCard(page);
  await expect(card).toHaveCount(1);
  // El kicker dice también a qué equipo toca.
  await expect(card.getByText("Próximo entrenamiento · Alevín A")).toBeVisible();
  await expect(card.getByRole("heading", { level: 2, name: sessionTitle })).toBeVisible();
  await expect(card.getByText(sessionMeta)).toBeVisible();
  // La hora, en la zona del club (regla 7), no en la del navegador ni en la del servidor.
  await expect(card.getByText(formatEventSlot(sessionSlot.startsAt, sessionSlot.endsAt, TZ))).toBeVisible();
  // El entrenamiento se abre en su sesión, no en la pestaña Entrenar.
  await expect(card.getByRole("link", { name: "Abrir entrenamiento" })).toHaveAttribute(
    "href",
    `${CLUB}/train/${seedId(ARCANGEL.slug, sessionKey)}`,
  );
});

test("ve el próximo partido y su semana", async ({ page }) => {
  // Reloj de la siembra: el partido sembrado es el del sábado siguiente a la siembra, y el
  // primer entrenamiento, el del siguiente martes o jueves. Los dos están por jugar.
  const { game } = seedSchedule(seedNow(), TZ);

  // Reloj del servidor: pinta Inicio en algún momento entre estos dos instantes.
  const before = new Date();
  await openHome(page, ALEX, CLUB, "Álex");

  await expect(gameCard(page)).toHaveCount(1);
  await expect(gameCard(page)).toContainText("Ribera");

  const week = weekSection(page);
  await expect(week).toBeVisible();
  // El próximo entrenamiento es dentro de cinco días como mucho: siempre cae en la semana.
  const firstPractice = week.getByRole("link").filter({ hasText: "Entrenamiento" }).first();
  await expect(firstPractice).toBeVisible();
  // La fila de un entrenamiento lleva a su sesión; la del partido, a Partidos.
  // todayLive (18:00 del día de siembra) aparece antes que upcoming-0 mientras no haya terminado.
  const { todayLive: todayLiveSlot } = seedSchedule(seedNow(), TZ);
  const firstPracticeKey = Date.now() < Date.parse(todayLiveSlot.endsAt)
    ? "event:alevin-a:today-live"
    : "event:alevin-a:upcoming-0";
  await expect(firstPractice).toHaveAttribute(
    "href",
    `${CLUB}/train/${seedId(ARCANGEL.slug, firstPracticeKey)}`,
  );
  const after = new Date();

  // El partido no siempre: sembrado un sábado después de las 10:30, es el del sábado
  // siguiente y queda fuera de «Esta semana»; entonces solo sale en su card. La semana se
  // cuenta desde el «ahora» del servidor, así que la fila solo se exige si el partido cae
  // dentro tanto con el reloj de antes de pintar como con el de después (solo difieren si
  // la medianoche del club pasa justo en medio).
  if (startsThisWeek(game, before) && startsThisWeek(game, after)) {
    const gameRow = week.getByRole("link").filter({ hasText: "Partido" }).first();
    await expect(gameRow).toBeVisible();
    await expect(gameRow).toContainText("Ribera");
    await expect(gameRow).toHaveAttribute("href", `${CLUB}/games`);
  }
});

test("la entrenadora de Benjamín A solo ve lo suyo", async ({ page }) => {
  // Review Focus 3: mismo club, otro equipo. Ni la plantilla, ni los eventos, ni los planes
  // de Alevín A llegan a su Inicio.
  const alevinA = ARCANGEL.teams.find((team) => team.key === "alevin-a");
  const [ownSession] = ARCANGEL.teams.find((team) => team.key === "benjamin-a")?.sessions ?? [];
  if (!alevinA?.game || !ownSession) {
    throw new Error("El seed ya no tiene a Alevín A con su partido y a Benjamín A con su sesión.");
  }
  expect(ownSession.title).toBe("Bote y control");
  // Reloj de la siembra: las horas de su única sesión, tal como quedaron sembradas.
  const ownSlot = ownSession.slot(seedSchedule(seedNow(), TZ), TZ);

  await openHome(page, NORA, CLUB, "Nora");
  // Carga completa del documento: así el HTML trae también los datos que Next manda al
  // navegador sin pintarlos, y se revisan los dos.
  await page.goto(CLUB);
  await expect(page.getByText("Benjamín A · Temporada 2026/27")).toBeVisible();
  const html = await page.content();
  const painted = Date.now();

  // Reloj del servidor. Su sesión es la hora anterior al próximo entrenamiento de Alevín A
  // y puede estar ya empezada al sembrar: sale como «próximo entrenamiento» mientras no
  // haya terminado. `painted` es posterior al momento en que el servidor pintó la pantalla:
  // si ni siquiera entonces había terminado, tenía que estar. (Si la ejecución cruza justo
  // el final de esa hora, esto no se exige; el aislamiento de abajo, siempre.)
  if (painted < Date.parse(ownSlot.endsAt)) {
    await expect(
      practiceCard(page).getByRole("heading", { level: 2, name: "Bote y control" }),
    ).toBeVisible();
    expect(html).toContain("Bote y control");
  }
  // Benjamín A no tiene partido: el de Alevín A no es suyo.
  await expect(gameCard(page)).toHaveCount(0);

  await expect(page.locator("body")).not.toContainText("Transición + rebote defensivo");

  const foreign = [
    alevinA.name,
    alevinA.game.opponent,
    alevinA.game.competition,
    ...alevinA.sessions.flatMap((session) => [session.title, ...session.items.map((item) => item.title)]),
    ...alevinA.players.map((player) => `${player.firstName} ${player.lastName}`),
  ];
  expect(foreign).toContain("Transición + rebote defensivo");

  for (const text of foreign) {
    expect(html, `«${text}» es de Alevín A y no debería llegar a Nora`).not.toContain(text);
  }
});

test("dirección sin equipo ve el estado vacío", async ({ page }) => {
  await openHome(page, RAUL, CLUB, "Raúl");

  await expect(
    page.getByRole("heading", { level: 2, name: "Aún no estás en ningún equipo" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Cuando dirección te asigne un equipo, aquí verás tus entrenamientos y partidos.",
    ),
  ).toBeVisible();

  // Sin equipo no hay nada más: ni entrenamiento, ni partido, ni semana. Quien administra
  // puede leer todos los eventos del club, pero Inicio solo enseña los de sus equipos.
  await expect(practiceCard(page)).toHaveCount(0);
  await expect(gameCard(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Esta semana" })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Transición + rebote defensivo");
});

test("cabe en el móvil", async ({ page }) => {
  // La pantalla más llena: entrenamiento, partido y semana.
  await openHome(page, ALEX, CLUB, "Álex");
  await expect(practiceCard(page)).toBeVisible();
  await expect(gameCard(page)).toBeVisible();
  await expect(weekSection(page)).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  expect(page.viewportSize()?.width).toBe(375);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(375);

  await expect(mainNav(page)).toBeVisible();
  await expect(mainNav(page)).toBeInViewport();

  // Lo que se ve al abrir la app, sin desplazar: el próximo entrenamiento cabe entero.
  await expect(practiceCard(page).getByRole("link", { name: "Abrir entrenamiento" })).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({ path: "test-results/home-375.png" });
});

test("áreas táctiles de 44 px", async ({ page }) => {
  // En el otro club: su pestaña de metodología tiene el nombre más largo.
  await openHome(page, MARTA, DEMO, "Marta");

  const tabs = mainNav(page).getByRole("link");
  await expect(tabs).toHaveCount(5);
  const cta = practiceCard(page).getByRole("link", { name: "Abrir entrenamiento" });
  await expect(cta).toBeVisible();
  const rows = weekSection(page).getByRole("link");
  await expect(rows.first()).toBeVisible();

  const targets = [...(await tabs.all()), cta, ...(await rows.all())];
  expect(targets.length).toBeGreaterThanOrEqual(7);
  for (const target of targets) {
    const box = await target.boundingBox();
    const label = (await target.innerText()).replace(/\s+/g, " ").trim();
    expect(box?.height, `alto de «${label}»`).toBeGreaterThanOrEqual(44);
    expect(box?.width, `ancho de «${label}»`).toBeGreaterThanOrEqual(44);
  }
});

test("sin errores de consola", async ({ page, browserErrors }) => {
  // La consola la vigila `helpers/test.ts` en TODOS los tests de los e2e: cualquiera falla
  // con un `console.error` o una excepción del navegador (el acceso en /login y el selector
  // sin clubes, en `auth.spec.ts`; el Inicio de cada persona, en este archivo). Este test
  // añade el recorrido que ningún otro hace: todas las pestañas, la vuelta y una recarga.

  // La entrada (la raíz y el selector, que con un solo club salta a él) e Inicio.
  await openHome(page, MARTA, DEMO, "Marta");
  await expect(practiceCard(page)).toBeVisible();

  // Cada pestaña, y de vuelta a Inicio.
  const tabs = mainNav(page).getByRole("link");
  await expect(tabs).toHaveText(["Inicio", "Nuestra forma", "Entrenar", "Partidos", "Equipo"]);
  for (const [label, path, heading] of [
    ["Nuestra forma", "/way", "The Demo Way"],
    ["Entrenar", "/train", "Entrenar"],
    ["Partidos", "/games", "Partidos llega en una próxima fase"],
    ["Equipo", "/team", "Equipo llega en una próxima fase"],
  ]) {
    await tabs.filter({ hasText: label }).click();
    await expect(page).toHaveURL(new RegExp(`${DEMO}${path}$`));
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(tabs.filter({ hasText: label })).toHaveAttribute("aria-current", "page");
  }

  await tabs.filter({ hasText: "Inicio" }).click();
  await expect(page).toHaveURL(new RegExp(`${DEMO}$`));
  await expect(practiceCard(page)).toBeVisible();

  // Y una carga completa de Inicio, como al abrir la app desde el icono.
  await page.reload();
  await expect(practiceCard(page)).toBeVisible();

  expect(browserErrors.seen).toEqual([]);
});

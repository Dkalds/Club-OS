import { expect, test, type Page } from "@playwright/test";
import { ARCANGEL, CLUB_DEMO } from "../scripts/seed/data";
import { seedSchedule } from "../scripts/seed/dates";
import { addLocalDays, formatEventSlot, startOfLocalDay } from "../src/lib/time";
import { loginAs } from "./helpers/auth";

// Necesita Supabase local con `pnpm seed` (Arcángel y Club Demo).
//
// Lo esperado se calcula igual que lo calculó el seed: `seedSchedule(ahora, zona del club)`.
// El seed corre unos minutos antes que estos tests; si entre los dos cae el inicio de un
// entrenamiento (martes o jueves a las 18:00 de Madrid) o el final del de Benjamín A (18:00
// de ese mismo día), el calendario sembrado y el esperado difieren en una sesión y el test
// del próximo entrenamiento o el de Nora fallan. Volver a sembrar lo arregla.

// La pantalla se revisa siempre a 375 px, sea cual sea el proyecto de Playwright.
test.use({ viewport: { width: 375, height: 812 } });

// Cada test entra por su cuenta. Auth guarda un solo código por usuario, así que `loginAs`
// hace cola por email: en paralelo, los tests de este archivo se pasarían el tiempo
// esperando turno (y, con muchos workers, agotándolo). Van uno detrás de otro, en un mismo
// worker, y repartidos entre personas; siguen siendo independientes entre sí.
test.describe.configure({ mode: "default" });

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

/** Entra y espera a que Inicio esté pintado: el saludo, con su nombre, es el único `<h1>`. */
async function openHome(page: Page, email: string, club: string, firstName: string): Promise<void> {
  await loginAs(page, email);
  await expect(page).toHaveURL(new RegExp(`${club}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    new RegExp(`^${GREETING}, ${firstName}\\.$`),
  );
}

test("el entrenador ve su próximo entrenamiento", async ({ page }) => {
  const [next] = seedSchedule(new Date(), TZ).upcoming;

  await openHome(page, ALEX, CLUB, "Álex");

  // Encima del saludo, su equipo y la temporada.
  await expect(page.getByText("Alevín A · Temporada 2026/27")).toBeVisible();

  const card = practiceCard(page);
  await expect(card).toHaveCount(1);
  await expect(card.getByText("Próximo entrenamiento")).toBeVisible();
  await expect(
    card.getByRole("heading", { level: 2, name: "Transición + rebote defensivo" }),
  ).toBeVisible();
  await expect(card.getByText("75 min · 5 ejercicios · Pabellón 2")).toBeVisible();
  // La hora, en la zona del club (regla 7), no en la del navegador ni en la del servidor.
  await expect(card.getByText(formatEventSlot(next.startsAt, next.endsAt, TZ))).toBeVisible();
  // Hasta la Fase 4, el entrenamiento se abre en la pestaña Entrenar.
  await expect(card.getByRole("link", { name: "Abrir entrenamiento" })).toHaveAttribute(
    "href",
    `${CLUB}/train`,
  );
});

test("ve el próximo partido y su semana", async ({ page }) => {
  const now = new Date();
  const { game } = seedSchedule(now, TZ);

  await openHome(page, ALEX, CLUB, "Álex");

  await expect(gameCard(page)).toHaveCount(1);
  await expect(gameCard(page)).toContainText("Ribera");

  const week = weekSection(page);
  await expect(week).toBeVisible();
  await expect(week.getByRole("link").filter({ hasText: "Entrenamiento" }).first()).toBeVisible();

  // «Esta semana» va de las 00:00 de hoy a las 00:00 de dentro de siete días, en la zona
  // del club. El partido del seed es el sábado siguiente: sembrado un sábado después de las
  // 10:30 cae fuera, y entonces solo sale en su card.
  const weekStart = startOfLocalDay(now.toISOString(), TZ);
  const weekEnd = addLocalDays(weekStart, 7, TZ);
  const gameStart = Date.parse(game.startsAt);
  if (gameStart >= Date.parse(weekStart) && gameStart < Date.parse(weekEnd)) {
    const gameRow = week.getByRole("link").filter({ hasText: "Partido" }).first();
    await expect(gameRow).toBeVisible();
    await expect(gameRow).toContainText("Ribera");
  }
});

test("la entrenadora de Benjamín A solo ve lo suyo", async ({ page }) => {
  // Review Focus 3: mismo club, otro equipo. Ni la plantilla, ni los eventos, ni los planes
  // de Alevín A llegan a su Inicio.
  await openHome(page, NORA, CLUB, "Nora");
  // Carga completa del documento: así el HTML trae también los datos que Next manda al
  // navegador sin pintarlos, y se revisan los dos.
  await page.goto(CLUB);

  await expect(page.getByText("Benjamín A · Temporada 2026/27")).toBeVisible();
  await expect(
    practiceCard(page).getByRole("heading", { level: 2, name: "Bote y control" }),
  ).toBeVisible();
  // Benjamín A no tiene partido: el de Alevín A no es suyo.
  await expect(gameCard(page)).toHaveCount(0);

  await expect(page.locator("body")).not.toContainText("Transición + rebote defensivo");

  const alevinA = ARCANGEL.teams.find((team) => team.key === "alevin-a");
  if (!alevinA?.game) throw new Error("El seed ya no tiene a Alevín A con su partido.");
  const foreign = [
    alevinA.name,
    alevinA.game.opponent,
    alevinA.game.competition,
    ...alevinA.sessions.flatMap((session) => [session.title, ...session.items.map((item) => item.title)]),
    ...alevinA.players.map((player) => `${player.firstName} ${player.lastName}`),
  ];
  expect(foreign).toContain("Transición + rebote defensivo");

  const html = await page.content();
  expect(html).toContain("Bote y control");
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

test("sin errores de consola", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console.error en ${page.url()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    errors.push(`excepción en ${page.url()}: ${error.message}`);
  });

  // Acceso (/login), selector (/select-club, que con un solo club salta a él) e Inicio.
  await openHome(page, MARTA, DEMO, "Marta");
  await expect(practiceCard(page)).toBeVisible();

  // Cada pestaña, y de vuelta a Inicio.
  const tabs = mainNav(page).getByRole("link");
  await expect(tabs).toHaveText(["Inicio", "Nuestra forma", "Entrenar", "Partidos", "Equipo"]);
  for (const [label, path] of [
    ["Nuestra forma", "/way"],
    ["Entrenar", "/train"],
    ["Partidos", "/games"],
    ["Equipo", "/team"],
  ]) {
    await tabs.filter({ hasText: label }).click();
    await expect(page).toHaveURL(new RegExp(`${DEMO}${path}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: `${label} llega en una próxima fase` }),
    ).toBeVisible();
    await expect(tabs.filter({ hasText: label })).toHaveAttribute("aria-current", "page");
  }

  await tabs.filter({ hasText: "Inicio" }).click();
  await expect(page).toHaveURL(new RegExp(`${DEMO}$`));
  await expect(practiceCard(page)).toBeVisible();

  // Y una carga completa de Inicio, como al abrir la app desde el icono.
  await page.reload();
  await expect(practiceCard(page)).toBeVisible();

  expect(errors).toEqual([]);
});

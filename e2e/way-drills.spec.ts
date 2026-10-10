import type { Locator, Page } from "@playwright/test";
import { ARCANGEL } from "../scripts/seed/data";
import { slugify } from "../scripts/seed/ids";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login, cada
// test abre la app con `openAs`.
//
// Este archivo solo LEE el seed: no crea ni borra nada, así que va en el proyecto `mobile` y
// sus tests corren en paralelo con los demás. Por eso tampoco afirma recuentos totales de la
// biblioteca (otros specs de la fase crean ejercicios de prueba mientras corre), sino qué
// ejercicios del seed salen y cuáles no. Los ejercicios de prueba de los demás specs llevan el
// objetivo `tiro` y ningún principio: no entran en «Ejercicios relacionados».
//
// El orden de los títulos lo da la base de datos (su colación). Los tests solo afirman órdenes
// que no dependen de ella: títulos que difieren en su primer carácter.

// La pantalla se revisa siempre a 375 px, sea cual sea el proyecto de Playwright.
test.use({ viewport: { width: 375, height: 812 } });

const ALEX = "alex@arcangel.test"; // entrenador de Arcángel
const IRENE = "irene@arcangel.test"; // entrenadora de Arcángel, autora del único borrador
const RAUL = "raul@arcangel.test"; // dirección de Arcángel

const CLUB = `/c/${ARCANGEL.slug}`;
const LIBRARY = `${CLUB}/drills`;
const SECTION = `${CLUB}/way/como-jugamos`;

/** Cuántos ejercicios enseña como mucho cada principio. */
const PER_PRINCIPLE = 3;

const PUBLISHED = ARCANGEL.drills.filter((drill) => drill.status === "published");
const DRAFT = ARCANGEL.drills.find((drill) => drill.status === "draft");

/** Los tres primeros publicados de «Transición» por título, y los otros dos que tiene. */
const TRANSITION_SHOWN = ["3 calles", "3x2 continuo", "4x4 transición"];
const TRANSITION_REST = ["Contraataque 2x1", "Rebote + outlet"];

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Principal" });
}

/** Un `<h1>`: toda pantalla tiene uno solo, y es lo que dice dónde se está. */
function title(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

/** La tarjeta de un principio de la sección «Cómo jugamos». */
function principle(page: Page, slug: string) {
  return page.locator(`#principle-${slug}`);
}

/**
 * Las filas de ejercicio de una tarjeta: los enlaces a una ficha. «Ver todos en la biblioteca»
 * también cuelga de `/drills`, pero con una consulta, no con un id.
 */
function drillRows(scope: Locator) {
  return scope.locator(`a[href^="${LIBRARY}/"]`);
}

/** Las filas de la lista de la biblioteca. «Nuevo» lleva a `/new`, que no es una ficha. */
function libraryRows(page: Page) {
  return page.locator(`main a[href^="${LIBRARY}/"]:not([href$="/new"])`);
}

function libraryRow(page: Page, drillTitle: string) {
  return libraryRows(page).filter({ hasText: drillTitle });
}

/** Entra como `email` y abre «Cómo jugamos» desde Inicio, como lo haría una persona. */
async function openSection(page: Page, email: string): Promise<void> {
  await openAs(page, email);
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));

  await page.getByRole("main").getByRole("link", { name: /^Identidad/ }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/way$`));
  await page.getByRole("main").getByRole("link", { name: /Cómo jugamos/ }).click();
  await expect(page).toHaveURL(new RegExp(`${SECTION}$`));
  await expect(title(page)).toHaveText("Cómo jugamos");
}

/**
 * Una ventana de 375×400: lo bastante baja como para que el destino de un ancla haya de subir
 * hasta arriba de la pantalla, que es justo donde la cabecera fija lo taparía si el destino no
 * dejara su margen de scroll (`anchor-below-header`). Con los 812 px de referencia el destino
 * queda a la vista sin que la página se mueva y la comprobación pasaría igual sin ese margen.
 */
const SHORT_VIEWPORT = { width: 375, height: 400 };

/**
 * El navegador ha saltado al ancla y su destino queda por debajo de la cabecera fija: dentro
 * de la pantalla y sin que la cabecera esté encima de él. `elementFromPoint` dice qué
 * recibiría el toque en su primera línea. (Es la comprobación de `way.spec.ts`.)
 */
async function expectClearOfHeader(page: Page, target: Locator): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(target).toBeVisible();
  await expect(target).toBeInViewport();

  const header = await page.getByRole("banner").boundingBox();
  const box = await target.boundingBox();
  if (!header || !box) throw new Error("No se pudo medir la cabecera o el destino del ancla.");
  expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);

  const topmostIsTarget = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 4);
    return hit !== null && element.contains(hit);
  });
  expect(topmostIsTarget, "la cabecera no debe tapar el destino del ancla").toBe(true);
}

test("el seed tiene lo que estos tests suponen", () => {
  // Sin esto, una prueba de «no ve el borrador» pasaría aunque el borrador no existiera, y una
  // de «tres de cinco» aunque el seed ya no tuviera cinco.
  expect(DRAFT?.title).toBe("Bloqueo de rebote");
  expect(DRAFT?.author).toBe(IRENE);
  expect(DRAFT?.principles).toContain("rebote");

  const transition = PUBLISHED.filter((drill) => drill.principles.includes("transicion")).map(
    (drill) => drill.title,
  );
  expect([...transition].sort()).toEqual([...TRANSITION_SHOWN, ...TRANSITION_REST].sort());

  const outlet = PUBLISHED.find((drill) => drill.title === "Rebote + outlet");
  expect(outlet?.standards).toEqual([3, 4, 5]);
  expect(outlet?.principles).toEqual(expect.arrayContaining(["rebote", "transicion"]));
});

test("del principio al ejercicio", async ({ page }) => {
  await openSection(page, ALEX);

  // «Transición» enseña sus tres primeros ejercicios por título, no los cinco que tiene.
  const card = principle(page, "transicion");
  await expect(card.getByRole("heading", { level: 2, name: "Transición" })).toBeVisible();
  await expect(card.getByRole("heading", { level: 3, name: "Ejercicios relacionados" })).toBeVisible();
  const shown = drillRows(card);
  await expect(shown).toHaveCount(TRANSITION_SHOWN.length);
  for (const [index, drillTitle] of TRANSITION_SHOWN.entries()) {
    await expect(shown.nth(index)).toContainText(drillTitle);
    await expect(shown.nth(index)).toHaveAttribute("href", /^\/c\/arcangel\/drills\/[0-9a-f-]{36}$/);
  }
  for (const drillTitle of TRANSITION_REST) await expect(card).not.toContainText(drillTitle);

  // «Ver todos en la biblioteca»: la lista filtrada por ese principio, con el filtro a la vista
  // y con los cinco ejercicios, también los que la tarjeta no enseña.
  await card.getByRole("link", { name: "Ver todos en la biblioteca" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?principle=transicion$`));
  await expect(page.getByRole("button", { name: "Quitar filtro de principio" })).toHaveText(
    "Principio: Transición",
  );
  for (const drillTitle of [...TRANSITION_SHOWN, ...TRANSITION_REST]) {
    await expect(libraryRow(page, drillTitle)).toBeVisible();
  }
  // Solo los de ese principio.
  await expect(libraryRow(page, "Rebote ofensivo")).toHaveCount(0);

  // Un ejercicio abre su ficha.
  await libraryRow(page, "Rebote + outlet").click();
  await expect(title(page)).toHaveText("Rebote + outlet");

  // Y su Standard «03» lleva a su bloque en la página de Standards, a la vista bajo la
  // cabecera fija aunque la ventana sea baja.
  await page.setViewportSize(SHORT_VIEWPORT);
  await page.getByRole("link", { name: /^03 / }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/way/standards#standard-03$`));
  await expectClearOfHeader(page, page.locator("#standard-03"));
});

test("cada principio enlaza a su parte de la biblioteca", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(SECTION);

  const principles = ARCANGEL.methodology.principles.map((def) => ({
    slug: slugify(def.title),
    title: def.title,
  }));
  expect(principles.length).toBeGreaterThan(0);

  for (const { slug, title: principleTitle } of principles) {
    const card = principle(page, slug);
    await expect(card.getByRole("heading", { level: 2, name: principleTitle })).toBeVisible();

    // Cuántos publicados tiene en el seed, con el tope de la tarjeta.
    const published = PUBLISHED.filter((drill) => drill.principles.includes(slug)).length;
    expect(published, `el seed tiene ejercicios publicados de «${principleTitle}»`).toBeGreaterThan(0);
    await expect(drillRows(card), principleTitle).toHaveCount(Math.min(published, PER_PRINCIPLE));
    await expect(card.getByRole("link", { name: "Ver todos en la biblioteca" }), principleTitle).toHaveAttribute(
      "href",
      `${LIBRARY}?principle=${slug}`,
    );
  }

  // Los puntos de cada principio siguen ahí, y el bloque de ejercicios no es una lista de puntos.
  await expect(principle(page, "ataque").getByRole("listitem")).toHaveCount(6);
});

test("sin borradores", async ({ page }) => {
  expect(DRAFT).toBeDefined();
  const draftTitle = DRAFT?.title ?? "";

  // Irene escribió el borrador y dirección lo ve todo: RLS les da la fila a las dos. En «Cómo
  // jugamos» solo cuenta lo publicado, sea quien sea quien mira.
  for (const email of [IRENE, RAUL]) {
    await openAs(page, email);

    // La biblioteca sí lo enseña, con su etiqueta: sin esto el test pasaría aunque el borrador
    // no existiera o la persona no pudiera verlo.
    await page.goto(`${LIBRARY}?principle=rebote`);
    await expect(libraryRow(page, draftTitle), email).toBeVisible();
    await expect(libraryRow(page, draftTitle)).toContainText("Borrador");
    await expect(libraryRow(page, "Rebote + outlet"), email).toBeVisible();

    await page.goto(SECTION);
    const card = principle(page, "rebote");
    await expect(card.getByRole("heading", { level: 3, name: "Ejercicios relacionados" }), email).toBeVisible();
    await expect(drillRows(card).filter({ hasText: "Rebote + outlet" }), email).toBeVisible();
    await expect(card, email).not.toContainText(draftTitle);

    // Ni visible ni en lo que Next manda al navegador sin pintarlo.
    await expect(page.locator("body"), email).not.toContainText(draftTitle);
    expect(await page.content(), email).not.toContain(draftTitle);
  }
});

test("cabe en el móvil", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(SECTION);
  await expect(title(page)).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);

  // Ni la página ni ninguna fila desbordan los 375 px.
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.viewport).toBe(375);
  expect(widths.scroll).toBeLessThanOrEqual(375);

  // Cada fila y cada enlace de las tarjetas se puede tocar con el dedo: 44 px como mínimo.
  const links = page.getByRole("main").getByRole("article").getByRole("link");
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const box = await links.nth(index).boundingBox();
    expect(box?.height ?? 0, `enlace ${index + 1} de las tarjetas`).toBeGreaterThanOrEqual(44);
  }

  // La lista de ejercicios sale a los bordes de su tarjeta y su contenido queda alineado con el
  // del principio: ni un doble relleno ni una caja dentro de la caja.
  const card = principle(page, "transicion");
  const cardBox = await card.locator(":scope > div").boundingBox();
  const first = drillRows(card).first();
  const firstBox = await first.boundingBox();
  const titleBox = await card.getByRole("heading", { level: 2 }).boundingBox();
  const thumbBox = await first.locator("svg").first().boundingBox();
  if (!cardBox || !firstBox || !titleBox || !thumbBox) throw new Error("No se pudo medir la tarjeta.");

  // La fila cubre el ancho útil de la tarjeta (todo menos su borde de 1 px).
  expect(Math.abs(firstBox.x - (cardBox.x + 1))).toBeLessThanOrEqual(1);
  expect(Math.abs(firstBox.width - (cardBox.width - 2))).toBeLessThanOrEqual(1);
  // Y la miniatura empieza donde el título del principio.
  expect(Math.abs(thumbBox.x - titleBox.x)).toBeLessThanOrEqual(1);
});

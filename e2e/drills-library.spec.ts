import type { Locator, Page } from "@playwright/test";
import { ARCANGEL, CLUB_DEMO } from "../scripts/seed/data";
import { slugify } from "../scripts/seed/ids";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login, cada
// test abre la app con `openAs`.
//
// Este archivo solo LEE: no crea ni borra ejercicios, así que sus tests corren en paralelo y
// no estorban a los demás. Por eso tampoco afirma recuentos totales: otros specs de la fase
// crean ejercicios de prueba en Arcángel mientras este corre. Lo que sí afirma es qué
// ejercicios del seed salen y cuáles no, y que la línea de recuento diga lo mismo que las
// filas pintadas.

// La pantalla se revisa siempre a 375 px, sea cual sea el proyecto de Playwright.
test.use({ viewport: { width: 375, height: 812 } });

const ALEX = "alex@arcangel.test"; // entrenador de Arcángel
const IRENE = "irene@arcangel.test"; // entrenadora de Arcángel, autora del único borrador
const MARTA = "marta@demo.test"; // entrenadora del otro club

const CLUB = `/c/${ARCANGEL.slug}`;
const DEMO = `/c/${CLUB_DEMO.slug}`;
const LIBRARY = `${CLUB}/drills`;

/** Lo que dice la fila del seed «Rebote + outlet» (la edad abierta, y rangos con raya corta). */
const REBOUND_OUTLET_META = "U12+ · 6–12 jug. · 10–15 min";

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Principal" });
}

/**
 * Las filas de la lista: los enlaces a la ficha de un ejercicio. «Nuevo ejercicio» también cuelga de
 * `/drills/`, pero lleva a `/new`, que no es una ficha.
 */
function rows(page: Page, club = CLUB) {
  return page.locator(`main a[href^="${club}/drills/"]:not([href$="/new"])`);
}

function row(page: Page, title: string, club = CLUB) {
  return rows(page, club).filter({ hasText: title });
}

function search(page: Page) {
  return page.getByRole("searchbox", { name: "Buscar ejercicios" });
}

function focusFilter(page: Page) {
  return page.getByRole("group", { name: "Objetivo" });
}

/** El chip de una hoja («Edad», «Jugadores», «Duración» o el valor elegido) y su hoja. */
function sheetChip(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

/** Elige `option` en la hoja que abre el chip `chip`. */
async function chooseInSheet(page: Page, chip: string, title: string, option: string): Promise<void> {
  await sheetChip(page, chip).click();
  const sheet = page.getByRole("dialog", { name: title });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: option, exact: true }).click();
  await expect(sheet).toBeHidden();
}

/** La cabecera de marca del marco (la de inicio) y la de detalle de la pantalla. */
function brandHeader(page: Page) {
  return page.locator('header[data-topnav="home"]');
}

function detailHeader(page: Page) {
  return page.locator('header[data-topnav="detail"]');
}

/** «{n} ejercicios»: lo que dice la línea de recuento ha de ser lo que se ve en la lista. */
async function expectCountToMatchRows(page: Page, club = CLUB): Promise<number> {
  const line = page.getByText(/^\d+ ejercicios?$/);
  await expect(line).toBeVisible();
  const count = Number.parseInt(await line.innerText(), 10);
  await expect(rows(page, club)).toHaveCount(count);
  expect(await line.innerText()).toBe(count === 1 ? "1 ejercicio" : `${count} ejercicios`);
  return count;
}

/** Un `<h1>`: toda pantalla tiene uno solo, y es lo que dice dónde se está. */
function title(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

const PUBLISHED = ARCANGEL.drills.filter((drill) => drill.status === "published");
const DRAFT = ARCANGEL.drills.find((drill) => drill.status === "draft");

/**
 * Los filtros de una URL que, con el objetivo `rebote`, solo encuentran el borrador de Irene:
 * «canasta» está en su organización y en la de ningún otro ejercicio de rebote. Los filtros de
 * edad, jugadores y minutos ya no lo separan de «Bloqueo y rebote 3x3», que tiene los mismos
 * rangos.
 */
const ONLY_THE_DRAFT = "focus=rebote&q=canasta";

test("el seed tiene lo que estos tests suponen", () => {
  // Sin esto, una prueba de «no ve el borrador» pasaría aunque el borrador no existiera.
  expect(DRAFT?.title).toBe("Bloqueo de rebote");
  expect(DRAFT?.author).toBe(IRENE);
  expect(PUBLISHED.map((drill) => drill.title)).toContain("Rebote + outlet");
  // Lo que supone `ONLY_THE_DRAFT`: ningún otro ejercicio de rebote, publicado o no, dice «canasta».
  const saysBasket = ARCANGEL.drills.filter(
    (drill) =>
      drill.focus.includes("rebote") &&
      [drill.title, drill.objective, drill.setupMd].join(" ").toLowerCase().includes("canasta"),
  );
  expect(saysBasket.map((drill) => drill.title)).toEqual(["Bloqueo de rebote"]);
});

test("la biblioteca tiene su pestaña", async ({ page }) => {
  await openAs(page, ALEX);
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));

  await mainNav(page).getByRole("link", { name: "Biblioteca" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}$`));

  // Es el inicio de una sección: manda la cabecera de marca del club y el título es el suyo.
  await expect(brandHeader(page)).toBeVisible();
  await expect(page.getByText(ARCANGEL.branding.display_name, { exact: true })).toBeVisible();
  await expect(detailHeader(page)).toHaveCount(0);
  await expect(title(page)).toHaveCount(1);
  await expect(title(page)).toHaveText("Biblioteca");

  // Su pestaña es la activa, y solo ella; Sesiones es otro espacio.
  await expect(mainNav(page).getByRole("link", { name: "Biblioteca" })).toHaveAttribute("aria-current", "page");
  await expect(mainNav(page).getByRole("link", { name: "Sesiones" })).not.toHaveAttribute("aria-current");

  // «Nuevo ejercicio», que puede el entrenador, lleva a la ficha en blanco.
  await expect(page.getByRole("link", { name: "Nuevo ejercicio" })).toHaveAttribute("href", `${LIBRARY}/new`);

  // Los ejercicios publicados, con su ficha de datos; el borrador de Irene no es de Álex.
  const outlet = row(page, "Rebote + outlet");
  await expect(outlet).toBeVisible();
  await expect(outlet).toContainText(REBOUND_OUTLET_META);
  await expect(outlet).toHaveAttribute("href", /^\/c\/arcangel\/drills\/[0-9a-f-]{36}$/);
  await expect(row(page, "Bloqueo de rebote")).toHaveCount(0);
  await expect(page.getByText("Borrador", { exact: true })).toHaveCount(0);
  await expectCountToMatchRows(page);
});

test("en la ficha de un ejercicio, la cabecera de detalle sustituye a la de marca", async ({ page }) => {
  await openAs(page, ALEX);
  await mainNav(page).getByRole("link", { name: "Biblioteca" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}$`));
  await expect(brandHeader(page)).toBeVisible();

  await row(page, "Rebote + outlet").click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}/[0-9a-f-]{36}$`));
  await expect(detailHeader(page)).toBeVisible();

  // La cabecera de marca sigue en el árbol (la pinta el marco), pero el navegador no la
  // enseña: es el efecto de `:has()` que ninguna prueba de componentes puede comprobar. Se
  // mira lo que se ve, no un atributo: ni la marca ni el menú de cuenta, y una sola cabecera.
  await expect(brandHeader(page)).toHaveCount(1);
  await expect(brandHeader(page)).toBeHidden();
  await expect(page.getByText(ARCANGEL.branding.display_name, { exact: true })).toBeHidden();
  await expect(page.locator("header:visible")).toHaveCount(1);

  // La de detalle está arriba del todo y se queda ahí al desplazar la ficha.
  const box = await detailHeader(page).boundingBox();
  expect(box?.y).toBe(0);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(detailHeader(page)).toBeInViewport({ ratio: 1 });

  // La pestaña sigue siendo Biblioteca, y «Volver» lleva a ella, con la cabecera de marca otra vez.
  await expect(mainNav(page).getByRole("link", { name: "Biblioteca" })).toHaveAttribute("aria-current", "page");
  const back = detailHeader(page).getByRole("link", { name: "Volver" });
  await expect(back).toHaveAttribute("href", LIBRARY);
  await back.click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}$`));
  await expect(brandHeader(page)).toBeVisible();
  await expect(detailHeader(page)).toHaveCount(0);
});

test("buscar sin tilde", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(LIBRARY);
  await expect(row(page, "Rebote + outlet")).toBeVisible();

  // Marca el campo para saber, después, si es el mismo elemento: nada debe remontarlo al
  // buscar (ni el `loading.tsx`, ni una `key`), o quien teclea perdería el foco.
  await search(page).evaluate((field) => Object.assign(window, { searchField: field }));

  await search(page).fill("transicion");
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?q=transicion$`));

  await expect(row(page, "4x4 transición")).toBeVisible();
  await expect(row(page, "Tiro tras bote")).toHaveCount(0);
  await expectCountToMatchRows(page);
  // El campo conserva lo escrito, y es el mismo.
  await expect(search(page)).toHaveValue("transicion");
  const sameField = await search(page).evaluate(
    (field) => field === (window as unknown as { searchField: Element }).searchField,
  );
  expect(sameField).toBe(true);

  // Vaciar el campo restablece la lista y la URL.
  await page.getByRole("button", { name: "Borrar búsqueda" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}$`));
  await expect(row(page, "Tiro tras bote")).toBeVisible();
  await expect(search(page)).toHaveValue("");
  await expect(search(page)).toBeFocused();
});

test("seguir escribiendo mientras llega la búsqueda no pisa lo escrito", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(LIBRARY);
  await expect(row(page, "Rebote + outlet")).toBeVisible();

  await search(page).click();
  await page.keyboard.type("tr");
  // La pausa del campo (250 ms) lanza la búsqueda de «tr» y su respuesta tarda en volver; se
  // sigue tecleando sin esperarla, que es lo que hace quien escribe sin mirar la lista.
  await page.waitForTimeout(300);
  await page.keyboard.type("ansicion", { delay: 40 });

  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?q=transicion$`));
  await expect(search(page)).toHaveValue("transicion");
  await expect(search(page)).toBeFocused();
  await expect(row(page, "4x4 transición")).toBeVisible();
});

test("la búsqueda de la URL llena el campo", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(`${LIBRARY}?q=transicion`);

  await expect(search(page)).toHaveValue("transicion");
  await expect(row(page, "4x4 transición")).toBeVisible();
  await expect(row(page, "Tiro tras bote")).toHaveCount(0);
});

test("filtros combinados", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(LIBRARY);
  await expect(row(page, "Rebote + outlet")).toBeVisible();

  // «Todos» arranca activo.
  await expect(focusFilter(page).getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "true");

  await focusFilter(page).getByRole("button", { name: "Transición" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?focus=transicion$`));
  await expect(focusFilter(page).getByRole("button", { name: "Transición" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await chooseInSheet(page, "Edad", "Edad", "U10");
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?focus=transicion&age=10$`));

  await expect(row(page, "3 calles")).toBeVisible();
  await expect(row(page, "Contraataque 2x1")).toBeVisible();
  await expect(row(page, "3x2 continuo")).toHaveCount(0);
  await expectCountToMatchRows(page);

  // El chip enseña el valor elegido y sigue activo.
  await expect(sheetChip(page, "U10")).toHaveAttribute("aria-pressed", "true");
  await expect(sheetChip(page, "Edad")).toHaveCount(0);

  // Jugadores y duración se suman a los anteriores sin soltarlos.
  await chooseInSheet(page, "Jugadores", "Jugadores", "10 jug.");
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?focus=transicion&age=10&players=10$`));
  await chooseInSheet(page, "Duración", "Duración", "15 min");
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?focus=transicion&age=10&players=10&minutes=15$`));
  // «3 calles» dura 10 minutos justos: con 15 ya no sale; «Contraataque 2x1» (10–15) sí.
  await expect(row(page, "Contraataque 2x1")).toBeVisible();
  await expect(row(page, "3 calles")).toHaveCount(0);

  // «Cualquiera» quita un filtro; «Todos», el del objetivo.
  await chooseInSheet(page, "15 min", "Duración", "Cualquiera");
  await chooseInSheet(page, "10 jug.", "Jugadores", "Cualquiera");
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?focus=transicion&age=10$`));
  await focusFilter(page).getByRole("button", { name: "Todos" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?age=10$`));
  await chooseInSheet(page, "U10", "Edad", "Cualquiera");
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}$`));
  await expect(row(page, "Rebote + outlet")).toBeVisible();
});

/** Lo que lleva desplazada una fila de chips y lo que lleva desplazada la página. */
async function scrolls(row: Locator, page: Page) {
  return { row: await row.evaluate((element) => element.scrollLeft), page: await page.evaluate(() => window.scrollY) };
}

/**
 * El chip se ve entero dentro de su fila: ni asoma por un lado ni queda tapado por el borde.
 * Se deja un píxel de margen: el navegador redondea lo que una fila puede desplazarse, y el
 * último chip puede quedar a una fracción de píxel del borde sin que nadie lo note.
 */
async function expectFullyInRow(chip: Locator, row: Locator) {
  await expect(chip).toBeInViewport();
  await expect
    .poll(
      async () => {
        const [c, r] = [await chip.boundingBox(), await row.boundingBox()];
        if (!c || !r) return Number.POSITIVE_INFINITY;
        return Math.max(r.x - c.x, c.x + c.width - (r.x + r.width));
      },
      { message: "lo que el chip sobresale de su fila, en píxeles" },
    )
    .toBeLessThanOrEqual(1);
}

test("el objetivo activo queda a la vista al cargar", async ({ page }) => {
  await openAs(page, ALEX);

  // Sin filtro, los últimos objetivos asoman fuera de la fila (a 375 px solo caben «Todos» y los
  // tres o cuatro primeros): es lo que hace falta para que el resto de la prueba signifique algo.
  await page.goto(LIBRARY);
  await expect(row(page, "Rebote + outlet")).toBeVisible();
  for (const late of ["Rebote", "Ataque"]) {
    await expect(focusFilter(page).getByRole("button", { name: late })).not.toBeInViewport();
  }

  // Con ese objetivo en la URL (recarga, enlace, Atrás) se ve pulsado, entero y sin que la
  // página se mueva. Un objetivo que el club no tiene va el último y también.
  for (const [slug, name] of [
    ["rebote", "Rebote"],
    ["ataque", "Ataque"],
    ["no-existe", "no-existe"],
  ]) {
    await page.goto(`${LIBRARY}?focus=${slug}`);
    const chip = focusFilter(page).getByRole("button", { name, exact: true });
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expectFullyInRow(chip, focusFilter(page));
    expect((await scrolls(focusFilter(page), page)).page, "la página no se mueve").toBe(0);
  }
});

test("la fila sigue al objetivo al volver atrás y no salta al tocar uno que ya se ve", async ({ page }) => {
  await openAs(page, ALEX);
  // Sin resultados para Álex, con el enlace «Quitar filtros» que sí deja una entrada en el historial.
  await page.goto(`${LIBRARY}?${ONLY_THE_DRAFT}`);
  const rebound = focusFilter(page).getByRole("button", { name: "Rebote", exact: true });
  await expectFullyInRow(rebound, focusFilter(page));

  // «Quitar filtros» deja «Todos» pulsado, y la fila lo recoge.
  await page.getByRole("link", { name: "Quitar filtros" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}$`));
  await expectFullyInRow(focusFilter(page).getByRole("button", { name: "Todos" }), focusFilter(page));

  // Atrás vuelve a esa misma dirección sin recargar la página: «Rebote» vuelve a la vista.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?${ONLY_THE_DRAFT}$`));
  await expect(rebound).toHaveAttribute("aria-pressed", "true");
  await expectFullyInRow(rebound, focusFilter(page));

  // Tocar un chip que ya se ve no mueve la fila: «Técnica» está entero desde el principio.
  await page.goto(LIBRARY);
  await expect(row(page, "Rebote + outlet")).toBeVisible();
  const technique = focusFilter(page).getByRole("button", { name: "Técnica", exact: true });
  await expectFullyInRow(technique, focusFilter(page));
  await technique.click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?focus=tecnica$`));
  await expect(technique).toHaveAttribute("aria-pressed", "true");
  expect(await scrolls(focusFilter(page), page)).toEqual({ row: 0, page: 0 });
});

test("el chip de hoja activo queda a la vista en una pantalla estrecha", async ({ page }) => {
  await openAs(page, ALEX);
  // A 300 px la fila de «Edad», «Jugadores» y «Duración» ya no cabe entera.
  await page.setViewportSize({ width: 300, height: 700 });
  const sheetRow = page.getByRole("group", { name: "Edad, jugadores y duración" });

  await page.goto(LIBRARY);
  await expect(row(page, "Rebote + outlet")).toBeVisible();
  const box = { chip: await sheetChip(page, "Duración").boundingBox(), row: await sheetRow.boundingBox() };
  expect((box.chip?.x ?? 0) + (box.chip?.width ?? 0), "sin filtro «Duración» sobresale").toBeGreaterThan(
    (box.row?.x ?? 0) + (box.row?.width ?? 0) + 1,
  );

  await page.goto(`${LIBRARY}?minutes=15`);
  const chip = sheetChip(page, "15 min");
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expectFullyInRow(chip, sheetRow);
  expect(await page.evaluate(() => window.scrollY), "la página no se mueve").toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth), "sin desbordar").toBeLessThanOrEqual(300);
});

test("los filtros de la URL se pueden quitar aunque no sean opciones", async ({ page }) => {
  await openAs(page, ALEX);

  // Una edad que ningún chip ofrece sigue siendo un filtro: se ve y se quita.
  await page.goto(`${LIBRARY}?age=13`);
  await expect(sheetChip(page, "U13")).toHaveAttribute("aria-pressed", "true");
  await chooseInSheet(page, "U13", "Edad", "Cualquiera");
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}$`));
  await expect(sheetChip(page, "Edad")).toHaveAttribute("aria-pressed", "false");

  // Un objetivo que el club no tiene: nada lo marca en la fila y la lista queda vacía, pero
  // el filtro se ve y «Todos» lo quita.
  await page.goto(`${LIBRARY}?focus=no-existe`);
  await expect(page.getByRole("heading", { level: 2, name: "No hay ejercicios con estos filtros" })).toBeVisible();
  await expect(focusFilter(page).getByRole("button", { name: "no-existe" })).toHaveAttribute("aria-pressed", "true");
  await focusFilter(page).getByRole("button", { name: "Todos" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}$`));
  await expect(row(page, "Rebote + outlet")).toBeVisible();
});

test("el principio filtra y se quita sin tocar el resto", async ({ page }) => {
  const rebound = ARCANGEL.methodology.principles.find((principle) => slugify(principle.title) === "rebote");
  expect(rebound).toBeDefined();
  const withPrinciple = PUBLISHED.filter((drill) => drill.principles.includes("rebote")).map((drill) => drill.title);
  const without = PUBLISHED.filter((drill) => !drill.principles.includes("rebote")).map((drill) => drill.title);
  // Un ejercicio sin ese principio que sí cumple la edad del enlace (12): sale al quitarlo.
  const other = PUBLISHED.find(
    (drill) => !drill.principles.includes("rebote") && drill.age[0] <= 12 && (drill.age[1] === null || drill.age[1] >= 12),
  );
  expect(withPrinciple.length).toBeGreaterThan(0);
  expect(other).toBeDefined();

  await openAs(page, ALEX);
  await page.goto(`${LIBRARY}?principle=rebote&age=12`);

  const chip = page.getByRole("button", { name: "Quitar filtro de principio" });
  await expect(chip).toHaveText(`Principio: ${rebound?.title}`);
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  for (const drill of withPrinciple) await expect(row(page, drill)).toBeVisible();
  for (const drill of without) await expect(row(page, drill)).toHaveCount(0);
  await expectCountToMatchRows(page);

  // Quita solo el principio: la edad se queda.
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?age=12$`));
  await expect(chip).toHaveCount(0);
  await expect(sheetChip(page, "U12")).toHaveAttribute("aria-pressed", "true");
  await expect(row(page, other?.title ?? "")).toBeVisible();
});

test("un principio que no existe se ve y se quita", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(`${LIBRARY}?principle=no-existe`);

  // Sin título que enseñar, el chip dice el principio como viene en la URL: así se entiende
  // por qué la lista está vacía y se puede quitar.
  const chip = page.getByRole("button", { name: "Quitar filtro de principio" });
  await expect(chip).toHaveText("Principio: no-existe");
  await expect(page.getByRole("heading", { level: 2, name: "No hay ejercicios con estos filtros" })).toBeVisible();

  await chip.click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}$`));
  await expect(chip).toHaveCount(0);
  await expect(row(page, "Rebote + outlet")).toBeVisible();
});

test("sin resultados", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(`${LIBRARY}?${ONLY_THE_DRAFT}`);

  // Con los filtros del enlace no hay nada para Álex: lo único que encuentran es el borrador de
  // Irene.
  await expect(page.getByRole("heading", { level: 2, name: "No hay ejercicios con estos filtros" })).toBeVisible();
  await expect(page.getByText("Prueba con otra búsqueda o con menos filtros.")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  // Sin lista no hay recuento a la vista: el aviso existe solo para los lectores de pantalla.
  const status = page.getByRole("status");
  await expect(status).toHaveText("0 ejercicios");
  expect((await status.boundingBox())?.width).toBeLessThanOrEqual(1);
  await expect(title(page)).toHaveCount(1);

  await page.getByRole("link", { name: "Quitar filtros" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}$`));
  await expect(row(page, "Rebote + outlet")).toBeVisible();
  await expect(focusFilter(page).getByRole("button", { name: "Todos" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheetChip(page, "Edad")).toHaveAttribute("aria-pressed", "false");
});

test("«Quitar filtros» también vacía el campo de búsqueda", async ({ page }) => {
  await openAs(page, ALEX);
  await page.goto(LIBRARY);

  await search(page).fill("zzzz");
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?q=zzzz$`));
  await expect(page.getByRole("heading", { level: 2, name: "No hay ejercicios con estos filtros" })).toBeVisible();

  await page.getByRole("link", { name: "Quitar filtros" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}$`));
  await expect(search(page)).toHaveValue("");
  await expect(row(page, "Rebote + outlet")).toBeVisible();
});

test("el borrador solo lo ve su autora", async ({ page }) => {
  await openAs(page, IRENE);
  await page.goto(`${LIBRARY}?focus=rebote&age=10`);

  const draft = row(page, "Bloqueo de rebote");
  await expect(draft).toBeVisible();
  await expect(draft).toContainText("Borrador");
  await expect(page.getByText("No hay ejercicios con estos filtros")).toHaveCount(0);

  // Y en la lista entera, junto a los publicados.
  await page.goto(LIBRARY);
  await expect(row(page, "Bloqueo de rebote")).toContainText("Borrador");
  await expect(row(page, "Rebote + outlet")).toBeVisible();
  await expect(row(page, "Rebote + outlet")).not.toContainText("Borrador");
  await expectCountToMatchRows(page);
});

test("cada club su biblioteca", async ({ page, browserErrors }) => {
  await openAs(page, MARTA);
  await expect(page).toHaveURL(new RegExp(`${DEMO}$`));

  await page.goto(`${DEMO}/drills`);
  await expect(title(page)).toHaveText("Biblioteca");
  await expect(row(page, "Tiro en carrera", DEMO)).toBeVisible();
  await expect(row(page, "Defensa individual", DEMO)).toBeVisible();
  // Nada del otro club.
  await expect(row(page, "Rebote + outlet", DEMO)).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Rebote + outlet");
  await expectCountToMatchRows(page, DEMO);

  await search(page).fill("outlet");
  await expect(page).toHaveURL(new RegExp(`${DEMO}/drills\\?q=outlet$`));
  await expect(page.getByRole("heading", { level: 2, name: "No hay ejercicios con estos filtros" })).toBeVisible();
  await expect(rows(page, DEMO)).toHaveCount(0);

  // La biblioteca del otro club, por su URL, es un club ajeno: el mismo 404 de siempre. Lo
  // responde el layout del club y Chromium deja el aviso en la consola (ver `helpers/test.ts`).
  browserErrors.allowNotFound(LIBRARY);
  await page.goto(LIBRARY);
  await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Rebote + outlet");

  // Y el mismo texto, en Arcángel, sí encuentra su ejercicio, y no el de Club Demo.
  await openAs(page, ALEX);
  await page.goto(`${LIBRARY}?q=outlet`);
  await expect(row(page, "Rebote + outlet")).toBeVisible();
  await expect(row(page, "Tiro en carrera")).toHaveCount(0);
});

test("cabe en el móvil", async ({ page }) => {
  await openAs(page, ALEX);

  // Con filtros puestos para que estén todos los controles: buscador con su botón de borrar,
  // chips con valor y el chip del principio.
  for (const path of [LIBRARY, `${LIBRARY}?q=rebote&principle=rebote&age=12`, `${LIBRARY}?focus=no-existe`]) {
    await page.goto(path);
    await expect(title(page)).toHaveCount(1);
    await expect(search(page)).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    expect(page.viewportSize()?.width, path).toBe(375);
    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(widths.viewport, path).toBe(375);
    expect(widths.scroll, path).toBeLessThanOrEqual(375);

    // Todo lo que se toca mide 44 px como mínimo: lo que RECIBE el toque (el botón del chip,
    // no su píldora de 36 px; el enlace de la fila entera; el campo; «Volver», «Nuevo»).
    const targets = page.locator("main").locator("a, button, input");
    const count = await targets.count();
    expect(count, path).toBeGreaterThan(6);
    for (let index = 0; index < count; index += 1) {
      const target = targets.nth(index);
      const box = await target.boundingBox();
      const label = (await target.innerText().catch(() => "")).replace(/\s+/g, " ").trim() || (await describe(target));
      expect(box?.height ?? 0, `${path}: alto de «${label}»`).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0, `${path}: ancho de «${label}»`).toBeGreaterThanOrEqual(44);
    }
  }

  // Los chips que se ven de primeras, uno a uno por su nombre, para que el recorrido anterior
  // no pueda pasar sin ellos.
  await page.goto(LIBRARY);
  for (const name of ["Todos", "Edad", "Jugadores", "Duración"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box?.height ?? 0, `chip «${name}»`).toBeGreaterThanOrEqual(44);
  }
  const field = await search(page).boundingBox();
  expect(field?.height ?? 0, "campo de búsqueda").toBeGreaterThanOrEqual(44);
  const first = await rows(page).first().boundingBox();
  expect(first?.height ?? 0, "primera fila").toBeGreaterThanOrEqual(44);
});

/** Nombre de un elemento sin texto (el campo, el botón de volver): su aria-label o su tipo. */
async function describe(target: Locator): Promise<string> {
  return (await target.getAttribute("aria-label")) ?? (await target.evaluate((element) => element.tagName.toLowerCase()));
}

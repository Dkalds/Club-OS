import type { Locator, Page } from "@playwright/test";
import { ARCANGEL } from "../scripts/seed/data";
import { drillId, type SeedDrill } from "../scripts/seed/drills";
import { seedId } from "../scripts/seed/ids";
import { restoreSeed, seedNow } from "./helpers/seed";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";
import {
  CAN_WRITE,
  CLUB,
  createSession,
  expectFitsMobile,
  expectTouchTargets,
  field,
  hydrated,
  inDays,
  title,
} from "./helpers/train";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login, cada
// test abre la app con `openAs`.
//
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts): monta sesiones
// con ejercicios de la biblioteca y las guarda, en serie. Cada test que escribe crea la suya
// (`E2E drills {ts}`) y ninguno afirma recuentos totales de filas de Entrenar ni de la
// biblioteca. `restoreSeed` deja la base de datos como la dejó el arranque global, al empezar y
// al acabar. Con un Supabase que no es local nada se escribe: esos tests se saltan.
test.describe.configure({ mode: "serial" });

const ALEX = "alex@arcangel.test"; // entrenador de Alevín A
const IRENE = "irene@arcangel.test"; // ayudante de Alevín A, autora del único borrador del seed
const RAUL = "raul@arcangel.test"; // dirección: ve todos los borradores en la biblioteca

const NEEDS_LOCAL_DB = "Escribe en la base de datos (crea sesiones y les añade ejercicios): solo con un Supabase local.";

// Mismo instante que el arranque global: la base de datos queda como la dejó él.
async function restore(): Promise<void> {
  if (!CAN_WRITE) return;
  await restoreSeed(seedNow());
}

test.beforeAll(restore);
test.afterAll(restore);

/** Un título que no se repite entre tests ni entre ejecuciones. */
function sessionTitle(): string {
  return `E2E drills ${Date.now()}`;
}

/** Álex crea una sesión de una hora dentro de tres días y queda en su constructor. Devuelve su id. */
function newSession(page: Page, name: string): Promise<string> {
  return createSession(page, ALEX, { title: name, date: inDays(3), time: "18:00", minutes: "60" });
}

/** El ejercicio del seed de Arcángel con ese título. */
function drillOf(drillTitle: string): SeedDrill {
  const found = ARCANGEL.drills.find((drill) => drill.title === drillTitle);
  if (!found) throw new Error(`El seed ya no tiene el ejercicio «${drillTitle}».`);
  return found;
}

/** Los minutos con los que entra un ejercicio en una sesión: los mínimos del suyo. */
const minutesOf = (drillTitle: string): number => drillOf(drillTitle).minutes[0];

/** La sesión de Alevín A del seed con ese título. */
function seedSession(sessionTitle_: string) {
  const session = ARCANGEL.teams
    .find((team) => team.key === "alevin-a")
    ?.sessions.find((candidate) => candidate.title === sessionTitle_);
  if (!session) throw new Error(`El seed ya no tiene la sesión «${sessionTitle_}» de Alevín A.`);
  return session;
}

/** Los ítems de una sesión del seed que son un ejercicio publicado de la biblioteca, en su orden. */
function linkedItems(session: ReturnType<typeof seedSession>) {
  return session.items.flatMap((item) => {
    const drill = ARCANGEL.drills.find((candidate) => candidate.title === item.title);
    return drill && drill.status === "published" ? [{ title: item.title, drill }] : [];
  });
}

/** Las filas del constructor (la cabecera tiene su propia lista, la de objetivos). */
function rows(page: Page): Locator {
  return page.getByRole("main").locator("li[data-row]");
}

function saveButton(page: Page): Locator {
  return page.getByRole("button", { name: "Guardar sesión" });
}

function addBlockButton(page: Page): Locator {
  return page.getByRole("button", { name: "Añadir bloque libre" });
}

/** Añade un bloque libre con su título y lo deja guardado. */
async function addSavedBlock(page: Page, name: string): Promise<void> {
  await addBlockButton(page).click();
  await expect(field(page.getByRole("group", { name: "Editar Sin título", exact: true }), "Título")).toBeFocused();
  await page.keyboard.type(name);
  await saveButton(page).click();
  await expect(page.getByText("Sesión guardada.")).toBeVisible();
}

/** Un texto como expresión regular que lo busca tal cual: un título con «+» o «.» no es un patrón. */
function literally(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

/** El botón de una fila del selector que añade el ejercicio, y el mismo ya añadido. */
function addButton(picker: Locator, drillTitle: string): Locator {
  return picker.getByRole("button", { name: `Añadir ${drillTitle}`, exact: true });
}

function addedButton(picker: Locator, drillTitle: string): Locator {
  return picker.getByRole("button", { name: `Añadido. Volver a añadir ${drillTitle}`, exact: true });
}

/** La hoja de una pantalla, por su título. */
function sheet(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name, exact: true });
}

/** El `href` de una ficha de ejercicio del seed, en este club. */
const drillHref = (drill: SeedDrill) => `${CLUB}/drills/${drillId(ARCANGEL.slug, drill.key)}`;

test("el seed tiene lo que estos tests suponen", () => {
  // Sin esto, una prueba de «no se cuela el borrador» pasaría aunque el borrador no existiera,
  // y la de «qué y por qué», aunque ninguna sesión llevara ejercicios enlazados.
  const draft = ARCANGEL.drills.find((drill) => drill.status === "draft");
  expect(draft?.title).toBe("Bloqueo de rebote");
  expect(draft?.author).toBe(IRENE);
  expect(linkedItems(seedSession("Transición + rebote defensivo"))).toHaveLength(5);
  expect(linkedItems(seedSession("Defensa presionante")).map((item) => item.title)).toEqual([
    "Ayuda y recuperación 3x3",
    "Presión al balón en medio campo",
    "Bloqueo y rebote 3x3",
  ]);
});

test("del principio al ejercicio y a la sesión", async ({ page }) => {
  // El flujo de la spec: The Way → Cómo jugamos → Transición → ejercicios relacionados → ficha del
  // ejercicio → Añadir a sesión → elegir la sesión → abrirla: el ejercicio es lo último que hay.
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const name = sessionTitle();
  const eventId = await newSession(page, name);
  // Con un ítem ya guardado, que el ejercicio llegue al final se ve.
  await addSavedBlock(page, "Calentamiento");

  // La identidad del club no es una pestaña para quien entrena: se entra desde Inicio.
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Inicio" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));
  await page.getByRole("main").getByRole("link", { name: /^Identidad/ }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/way$`));
  await page.getByRole("main").getByRole("link", { name: /Cómo jugamos/ }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/way/como-jugamos$`));

  const card = page.locator("#principle-transicion");
  const related = card.locator(`a[href^="${CLUB}/drills/"]`);
  await expect(related.first()).toBeVisible();
  await related.first().click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/drills/[0-9a-f-]{36}$`));
  const drillTitle = ((await title(page).textContent()) ?? "").trim();
  expect(drillTitle.length).toBeGreaterThan(0);
  const drill = drillOf(drillTitle);

  // «Añadir a sesión», debajo de la ficha: secondary, y ningún primary en esta pantalla.
  const add = page.getByRole("button", { name: "Añadir a sesión" });
  await hydrated(add);
  await expect(add).toHaveClass(/border-line-strong/);
  await expect(page.getByRole("main").locator(".bg-brand-accent")).toHaveCount(0);
  await add.click();

  const choose = sheet(page, "Añadir a una sesión");
  await expect(choose).toBeVisible();
  const mine = choose.getByRole("button", { name: literally(name) });
  await expect(mine).toBeVisible();
  await expect(mine).toContainText("1 ejercicio");
  // El aviso de «Añadido» se anuncia solo si su región de estado ya estaba en el árbol de
  // accesibilidad antes de que llegara el texto: aquí, vacía y sin `display: none` (el selector por
  // rol deja fuera lo que está en el árbol oculto, y jsdom no aplica CSS: solo un navegador lo ve).
  const status = choose.getByRole("status");
  await expect(status).toBeAttached();
  await expect(status).toBeEmpty();
  expect(await status.evaluate((element) => getComputedStyle(element).display)).not.toBe("none");
  await expectFitsMobile(page);
  await expectTouchTargets(choose.getByRole("button", { name: /E2E drills|Transición|Defensa/ }));
  expect(await choose.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  await mine.click();
  await expect(choose.getByText(`Añadido a ${name}.`)).toBeVisible();
  // Es la misma región de estado que había al abrir la hoja, ahora con su texto.
  await expect(status).toHaveText(`Añadido a ${name}.`);
  const open = choose.getByRole("link", { name: "Abrir sesión" });
  await expect(open).toBeFocused();
  await expect(open).toHaveAttribute("href", `${CLUB}/train/${eventId}/edit`);
  await open.click();

  // En el constructor, el ejercicio es el último ítem, con sus minutos mínimos y sin guardar nada más.
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/${eventId}/edit$`));
  await hydrated(addBlockButton(page));
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText("Calentamiento");
  await expect(rows(page).last()).toContainText("02");
  await expect(rows(page).last()).toContainText(drillTitle);
  await expect(rows(page).last()).toContainText(`${drill.minutes[0]}'`);
  await expect(saveButton(page)).toBeDisabled();

  // Y el detalle de la sesión enlaza ese ítem a su ficha, y el bloque libre no.
  await page.getByRole("link", { name: "Volver a la sesión" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/${eventId}$`));
  const item = page.getByRole("main").getByRole("link", { name: literally(drillTitle) });
  await expect(item).toHaveAttribute("href", drillHref(drill));
  await expect(page.getByRole("main").getByRole("link", { name: /Calentamiento/ })).toHaveCount(0);
  await item.click();
  await expect(page).toHaveURL(drillHref(drill));
  await expect(title(page)).toHaveText(drillTitle);
});

test("cinco ejercicios desde el selector", async ({ page }) => {
  // El objetivo del constructor: una sesión de cinco ejercicios sin salir de la pantalla y sin
  // cerrar la hoja entre uno y otro.
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const eventId = await newSession(page, sessionTitle());
  await hydrated(addBlockButton(page));
  const first = "Rebote + outlet";
  const others = ["3 calles", "3x2 continuo", "2x2 presión", "Contraataque 2x1"];
  const five = [first, ...others];

  await page.getByRole("button", { name: "Añadir ejercicio" }).click();
  const picker = sheet(page, "Añadir ejercicio");
  await expect(picker).toBeVisible();
  await expectFitsMobile(page);

  // Buscar «outlet»: solo lo trae «Rebote + outlet».
  await picker.getByRole("searchbox", { name: "Buscar ejercicios" }).fill("outlet");
  await expect(picker.getByRole("link")).toHaveCount(1);
  await expectTouchTargets(picker.getByRole("button", { name: /^Añadir / }));
  await addButton(picker, first).click();
  // Sigue abierta, y la fila dice «Añadido».
  await expect(addedButton(picker, first)).toContainText("Añadido");
  await expect(picker).toBeVisible();

  // Sin la búsqueda, cuatro más; lo añadido sigue marcado.
  await picker.getByRole("button", { name: "Borrar búsqueda" }).click();
  for (const drillTitle of others) {
    await addButton(picker, drillTitle).click();
    await expect(addedButton(picker, drillTitle)).toBeVisible();
  }
  await expect(addedButton(picker, first)).toBeVisible();
  await expect(picker).toBeVisible();
  expect(await picker.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  // Al cerrarla: cinco filas, cada una con sus minutos, y la suma de la barra.
  await picker.getByRole("button", { name: "Cerrar" }).click();
  await expect(picker).toBeHidden();
  await expect(rows(page)).toHaveCount(5);
  for (const [index, drillTitle] of five.entries()) {
    await expect(rows(page).nth(index)).toContainText(String(index + 1).padStart(2, "0"));
    await expect(rows(page).nth(index)).toContainText(drillTitle);
    await expect(rows(page).nth(index)).toContainText(`${minutesOf(drillTitle)}'`);
  }
  const sum = five.reduce((total, drillTitle) => total + minutesOf(drillTitle), 0);
  await expect(page.getByRole("main").getByText("Total", { exact: true }).locator("..")).toContainText(`${sum}'`);

  // Guardar sesión, y tras recargar siguen ahí, en su orden.
  await saveButton(page).click();
  await expect(page.getByText("Sesión guardada.")).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
  await page.reload();
  await hydrated(addBlockButton(page));
  await expect(rows(page)).toHaveCount(5);
  for (const [index, drillTitle] of five.entries()) {
    await expect(rows(page).nth(index)).toContainText(drillTitle);
  }

  // En el detalle, los cinco enlazan a su ficha.
  await page.getByRole("link", { name: "Volver a la sesión" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/${eventId}$`));
  const links = page.getByRole("main").locator(`a[href^="${CLUB}/drills/"]`);
  await expect(links).toHaveCount(5);
  for (const [index, drillTitle] of five.entries()) {
    await expect(links.nth(index)).toHaveAttribute("href", drillHref(drillOf(drillTitle)));
  }
});

test("qué y por qué", async ({ page }) => {
  // La regla 8: la sesión enseña los Standards que trabaja, y cada ejercicio, su ficha. Solo
  // lee el seed, y cuenta con él: los Standards salen de los ejercicios enlazados.
  await openAs(page, ALEX);

  async function check(sessionName: string, key: string) {
    const linked = linkedItems(seedSession(sessionName));
    const numbers = [...new Set(linked.flatMap((item) => item.drill.standards))].sort((a, b) => a - b);
    expect(numbers.length, `la sesión «${sessionName}» tiene Standards`).toBeGreaterThan(0);

    await page.goto(`${CLUB}/train/${seedId(ARCANGEL.slug, key)}`);
    await expect(title(page)).toHaveText(sessionName);

    // Los tres primeros, por número, y «+N» con los demás.
    const standards = page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: "Standards" }) });
    const badges = standards.getByRole("link");
    const shown = numbers.slice(0, 3);
    await expect(badges).toHaveCount(shown.length);
    for (const [index, number] of shown.entries()) {
      await expect(badges.nth(index)).toHaveText(new RegExp(`^${String(number).padStart(2, "0")}\\s`));
    }
    if (numbers.length > shown.length) await expect(standards).toContainText(`+${numbers.length - shown.length}`);

    // Cada ejercicio de la biblioteca enlaza a su ficha, en su orden; lo demás es texto.
    const links = page.getByRole("main").locator(`a[href^="${CLUB}/drills/"]`);
    await expect(links).toHaveCount(linked.length);
    for (const [index, item] of linked.entries()) {
      await expect(links.nth(index)).toHaveAttribute("href", drillHref(item.drill));
      await expect(links.nth(index)).toContainText(item.title);
    }
    for (const item of seedSession(sessionName).items) {
      if (linked.some((entry) => entry.title === item.title)) continue;
      await expect(page.getByText(item.title, { exact: true })).toBeVisible();
      await expect(page.getByRole("main").getByRole("link", { name: literally(item.title) })).toHaveCount(0);
    }
    return { numbers, linked, links };
  }

  const transition = await check("Transición + rebote defensivo", "event:alevin-a:upcoming-0");
  expect(transition.linked).toHaveLength(5);

  // «Defensa presionante»: «01», «02» y «03», con tres ejercicios enlazados de seis.
  const pressure = await check("Defensa presionante", "event:alevin-a:upcoming-1");
  expect(pressure.numbers).toEqual([1, 2, 3]);
  expect(pressure.linked).toHaveLength(3);
  await expect(page.getByRole("main").locator("ul[role='list'] > li").filter({ hasText: "minutos" })).toHaveCount(6);

  // Y entrar en uno lleva a la ficha de verdad.
  await pressure.links.first().click();
  await expect(page).toHaveURL(drillHref(pressure.linked[0].drill));
  await expect(title(page)).toHaveText(pressure.linked[0].title);
});

test("un borrador ajeno no se cuela", async ({ page }) => {
  // El selector solo ofrece ejercicios publicados: ni el borrador de otro entrenador, ni el
  // propio, ni siquiera a la dirección, que sí los ve todos en la biblioteca. Solo lee: abre
  // el constructor de una sesión del seed y no guarda nada.
  const draft = ARCANGEL.drills.find((drill) => drill.status === "draft");
  if (!draft) throw new Error("El seed ya no tiene ningún borrador.");
  const url = `${CLUB}/train/${seedId(ARCANGEL.slug, "event:alevin-a:upcoming-0")}/edit`;

  for (const email of [ALEX, IRENE, RAUL]) {
    await openAs(page, email);
    // La biblioteca sí lo enseña a su autora y a dirección: sin esto el test pasaría aunque el
    // borrador no existiera o la persona no pudiera verlo.
    if (email !== ALEX) {
      await page.goto(`${CLUB}/drills?q=${encodeURIComponent(draft.title)}`);
      await expect(page.getByRole("main").locator(`a[href^="${CLUB}/drills/"]`).filter({ hasText: draft.title }), email).toBeVisible();
    }

    await page.goto(url);
    await hydrated(addBlockButton(page));
    await page.getByRole("button", { name: "Añadir ejercicio" }).click();
    const picker = sheet(page, "Añadir ejercicio");
    await expect(picker).toBeVisible();
    // La lista entera ya cargada, y con ella los publicados.
    await expect(addButton(picker, "Rebote + outlet"), email).toBeVisible();
    await expect(addButton(picker, draft.title), email).toHaveCount(0);
    await expect(picker, email).not.toContainText(draft.title);

    // Buscándolo por su título tampoco aparece. Intro busca al momento, y se espera a que la lista
    // nueva haya llegado: sin esperar, la comprobación pasaría con la lista de antes.
    const search = picker.getByRole("searchbox", { name: "Buscar ejercicios" });
    await search.fill(draft.title);
    await search.press("Enter");
    await expect(picker.getByRole("status", { name: "Cargando" }), email).toHaveCount(0);
    await expect(addButton(picker, draft.title), email).toHaveCount(0);
    await expect(picker, email).not.toContainText(draft.title);
    // Y con su objetivo, salen los publicados de «Rebote», sin el borrador.
    await picker.getByRole("button", { name: "Borrar búsqueda" }).click();
    await picker.getByRole("group", { name: "Objetivo" }).getByRole("button", { name: "Rebote", exact: true }).click();
    await expect(addButton(picker, "Rebote + outlet"), email).toBeVisible();
    await expect(picker.getByRole("status", { name: "Cargando" }), email).toHaveCount(0);
    await expect(picker, email).not.toContainText(draft.title);
  }
});

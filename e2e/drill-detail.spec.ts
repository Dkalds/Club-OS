import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locator, Page } from "@playwright/test";
import type { Database } from "@/lib/database.types";
import { createAdminClient, readSupabaseEnv } from "../scripts/lib/admin-client";
import { ARCANGEL, CLUB_DEMO } from "../scripts/seed/data";
import { drillId } from "../scripts/seed/drills";
import { isLocalSupabaseUrl } from "../scripts/seed/guard";
import { slugify } from "../scripts/seed/ids";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login, cada
// test abre la app con `openAs`.
//
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts) porque
// ESCRIBE: «archivar» y «publicar» crean un ejercicio propio, `E2E … {Date.now()}`, con la
// clave de servicio, y lo cambian desde la interfaz. Lo borran al acabar, también si el test
// falla (`afterEach`). Si la ejecución se aborta, lo que queda lo borra `restoreSeed` en el
// arranque de la siguiente. Los ejercicios de prueba llevan el objetivo `tiro` y 12 años: no
// son del objetivo `rebote` ni de `focus=rebote&age=10`, que es lo que supone la biblioteca
// (`drills-library.spec.ts`). Ningún test afirma recuentos totales.
//
// El resto de tests solo lee el seed. Con un Supabase que no es local no se escribe nada: los
// que escriben se saltan.

// La pantalla se revisa siempre a 375 px, sea cual sea el proyecto de Playwright.
test.use({ viewport: { width: 375, height: 812 } });

const ALEX = "alex@arcangel.test"; // entrenador de Arcángel
const IRENE = "irene@arcangel.test"; // entrenadora de Arcángel, autora del único borrador
const RAUL = "raul@arcangel.test"; // dirección de Arcángel
const MARTA = "marta@demo.test"; // entrenadora del otro club

const CLUB = `/c/${ARCANGEL.slug}`;
const LIBRARY = `${CLUB}/drills`;

const NOT_FOUND = "No encontramos esta página";
const DRAFT_NOTICE = "Solo lo ven su autor y dirección hasta que se publique.";
const ARCHIVED_NOTICE = "Este ejercicio está archivado y no sale en la biblioteca.";

/** El nombre que Arcángel da a sus Standards (`terminology.standards` del seed). */
const STANDARDS_TERM = "Arcángel Standards";

const OUTLET = ARCANGEL.drills.find((drill) => drill.title === "Rebote + outlet");
const DRAFT = ARCANGEL.drills.find((drill) => drill.status === "draft");

const NEEDS_LOCAL_DB = "Escribe en la base de datos (crea y cambia un ejercicio): solo con un Supabase local.";

/**
 * Los datos solo se escriben en un Supabase local: lanzar unos tests nunca escribe en una base
 * de datos remota (ver `e2e/global-setup.ts`).
 */
function targetIsLocal(): boolean {
  try {
    return isLocalSupabaseUrl(readSupabaseEnv().url);
  } catch {
    return false;
  }
}

const CAN_WRITE = targetIsLocal();

// ── Ejercicios de prueba ─────────────────────────────────────────────────────────────

/** Los ejercicios que ha creado el test en curso: `afterEach` los borra pase lo que pase. */
const created: string[] = [];

test.afterEach(async () => {
  const ids = created.splice(0);
  if (ids.length === 0) return;

  // Sus puntos, variantes y vínculos se van con ellos (`on delete cascade`).
  const { error } = await createAdminClient().from("drills").delete().in("id", ids);
  if (error) throw new Error(`No se pudieron borrar los ejercicios de prueba: ${error.message}`);
});

/**
 * Crea un ejercicio de Arcángel con la clave de servicio, sin autor (`created_by` a null: lo
 * ven los admins y, publicado, todo el cuerpo técnico), con el objetivo `tiro`, y lo apunta
 * para borrarlo. Devuelve su id.
 */
async function createDrill(
  db: SupabaseClient<Database>,
  drill: { title: string; status: "draft" | "published"; standards?: number },
): Promise<string> {
  const org = await db.from("organizations").select("id").eq("slug", ARCANGEL.slug).single();
  if (org.error) throw new Error(`No se pudo leer el club: ${org.error.message}`);
  const focus = await db
    .from("focus_areas")
    .select("id")
    .eq("organization_id", org.data.id)
    .eq("slug", "tiro")
    .single();
  if (focus.error) throw new Error(`No se pudo leer el objetivo «tiro»: ${focus.error.message}`);

  const inserted = await db
    .from("drills")
    .insert({
      organization_id: org.data.id,
      title: drill.title,
      objective: "Un ejercicio de prueba de los e2e.",
      min_players: 6,
      max_players: 10,
      min_minutes: 10,
      max_minutes: 15,
      min_age: 12,
      status: drill.status,
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(`No se pudo crear el ejercicio de prueba: ${inserted.error.message}`);
  created.push(inserted.data.id);

  const link = await db.from("drill_focus_areas").insert({
    organization_id: org.data.id,
    drill_id: inserted.data.id,
    focus_area_id: focus.data.id,
  });
  if (link.error) throw new Error(`No se pudo vincular el objetivo: ${link.error.message}`);

  // Los primeros `standards` Standards del club, por número (los publicados del seed).
  if (drill.standards) {
    const standards = await db
      .from("standards")
      .select("id")
      .eq("organization_id", org.data.id)
      .order("number", { ascending: true })
      .limit(drill.standards);
    if (standards.error) throw new Error(`No se pudieron leer los Standards: ${standards.error.message}`);
    expect(standards.data, "el club tiene Standards de sobra para el ejercicio").toHaveLength(drill.standards);
    const rows = standards.data.map((standard) => ({
      organization_id: org.data.id,
      drill_id: inserted.data.id,
      standard_id: standard.id,
    }));
    const linked = await db.from("drill_standards").insert(rows);
    if (linked.error) throw new Error(`No se pudieron vincular los Standards: ${linked.error.message}`);
  }

  return inserted.data.id;
}

// ── Ayudas ───────────────────────────────────────────────────────────────────────────

/** Un `<h1>`: toda pantalla tiene uno solo, y es lo que dice dónde se está. */
function title(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

function brandHeader(page: Page) {
  return page.locator('header[data-topnav="home"]');
}

function detailHeader(page: Page) {
  return page.locator('header[data-topnav="detail"]');
}

/**
 * Las filas de la lista de la biblioteca: los enlaces a la ficha de un ejercicio. «Nuevo»
 * también cuelga de `/drills/`, pero lleva a `/new`, que no es una ficha.
 */
function rows(page: Page) {
  return page.locator(`main a[href^="${CLUB}/drills/"]:not([href$="/new"])`);
}

function row(page: Page, drillTitle: string) {
  return rows(page).filter({ hasText: drillTitle });
}

function focusFilter(page: Page) {
  return page.getByRole("group", { name: "Objetivo" });
}

/**
 * Lo que dice el `<main>` (el 404 de una ficha vive dentro del marco del club). `textContent` y
 * no `innerText`: este aplica las mayúsculas del título y compararía lo pintado, no lo escrito.
 */
async function mainText(page: Page): Promise<string> {
  return (await page.locator("main").textContent()) ?? "";
}

/**
 * La ficha cabe en 375 px y todo lo que se toca mide 44 px como mínimo: lo que recibe el
 * toque (los chips de Standard, los enlaces de principio, los botones y los de la cabecera).
 */
async function expectFitsMobile(page: Page, where: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);

  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.viewport, where).toBe(375);
  expect(widths.scroll, `${where}: la página no desborda`).toBeLessThanOrEqual(375);

  // La cabecera de detalle es lo primero del `<main>`: «Volver» y «Editar» entran aquí.
  const targets = page.locator("main a, main button");
  const count = await targets.count();
  expect(count, where).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const target = targets.nth(index);
    const box = await target.boundingBox();
    const label =
      (await target.innerText().catch(() => "")).replace(/\s+/g, " ").trim() ||
      (await target.getAttribute("aria-label")) ||
      "(sin texto)";
    expect(box?.height ?? 0, `${where}: alto de «${label}»`).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, `${where}: ancho de «${label}»`).toBeGreaterThanOrEqual(44);
  }
}

/**
 * El chip se ve entero dentro de su fila: ni asoma por un lado ni queda tapado por el borde.
 * Se deja un píxel de margen: el navegador redondea lo que una fila puede desplazarse.
 * (Es la comprobación de `drills-library.spec.ts`; allí no se exporta.)
 */
async function expectFullyInRow(chip: Locator, rowOfChips: Locator): Promise<void> {
  await expect(chip).toBeInViewport();
  await expect
    .poll(
      async () => {
        const [c, r] = [await chip.boundingBox(), await rowOfChips.boundingBox()];
        if (!c || !r) return Number.POSITIVE_INFINITY;
        return Math.max(r.x - c.x, c.x + c.width - (r.x + r.width));
      },
      { message: "lo que el chip sobresale de su fila, en píxeles" },
    )
    .toBeLessThanOrEqual(1);
}

// ── Tests ────────────────────────────────────────────────────────────────────────────

test("el seed tiene lo que estos tests suponen", () => {
  // Sin esto, una prueba de «no ve el borrador» pasaría aunque el borrador no existiera.
  expect(DRAFT?.title).toBe("Bloqueo de rebote");
  expect(DRAFT?.author).toBe(IRENE);
  expect(OUTLET?.standards).toEqual([3, 4, 5]);
  expect(OUTLET?.points).toHaveLength(5);
  expect(OUTLET?.points.filter((point) => point.key)).toHaveLength(3);
  expect(OUTLET?.equipment).toEqual(["Balones", "Conos", "Petos"]);
  expect(ARCANGEL.branding.terminology).toMatchObject({ standards: STANDARDS_TERM });
});

test("ficha completa", async ({ page }) => {
  if (!OUTLET) throw new Error("Falta «Rebote + outlet» en el seed.");
  await openAs(page, ALEX);

  // Se llega desde la lista de la biblioteca, como lo hace quien entrena.
  await page.goto(LIBRARY);
  await row(page, OUTLET.title).click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}/[0-9a-f-]{36}$`));

  // Un solo <h1>, el del ejercicio; la cabecera de detalle sustituye a la de marca.
  await expect(title(page)).toHaveCount(1);
  await expect(title(page)).toHaveText(OUTLET.title);
  await expect(detailHeader(page)).toBeVisible();
  await expect(detailHeader(page).getByText("Ejercicio", { exact: true })).toBeVisible();
  await expect(brandHeader(page)).toBeHidden();
  await expect(page.locator("header:visible")).toHaveCount(1);
  await expect(detailHeader(page).getByRole("link", { name: "Volver" })).toHaveAttribute("href", LIBRARY);

  // Edad, jugadores y minutos, con sus unidades.
  for (const pill of ["U12+", "6–12 jugadores", "10–15 minutos"]) {
    await expect(page.getByText(pill, { exact: true })).toBeVisible();
  }

  // Sin diagrama sale la pista vacía.
  await expect(page.getByRole("img", { name: "Pista sin diagrama" })).toBeVisible();

  // Las secciones, en su orden, con el nombre que el club da a sus Standards. No hay vídeo.
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Objetivo",
    "Organización",
    "Coaching points",
    STANDARDS_TERM,
    "Principios",
    "Variantes",
    "Material",
  ]);
  await expect(page.getByText(OUTLET.objective, { exact: true })).toBeVisible();
  await expect(page.getByText(OUTLET.setupMd, { exact: true })).toBeVisible();

  // Cinco coaching points, tres con «Clave».
  const points = page.getByRole("list").filter({ hasText: "Outlet rápido" }).getByRole("listitem");
  await expect(points).toHaveCount(5);
  await expect(points.filter({ hasText: "Clave" })).toHaveCount(3);
  await expect(page.getByText("Clave", { exact: true })).toHaveCount(3);

  // Los Standards, como chips que enlazan a su sitio en The Way.
  for (const number of ["03", "04", "05"]) {
    const badge = page.getByRole("link", { name: new RegExp(`^${number} `) });
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute("href", new RegExp(`/way/standards#standard-${number}$`));
  }
  await expect(page.getByRole("link", { name: /^0[12] / })).toHaveCount(0);

  // Los principios, a la sección de principios de The Way.
  const principles = slugify("Cómo jugamos");
  await expect(page.getByRole("link", { name: "Rebote", exact: true })).toHaveAttribute(
    "href",
    `${CLUB}/way/${principles}#principle-rebote`,
  );
  await expect(page.getByRole("link", { name: "Transición", exact: true })).toHaveAttribute(
    "href",
    `${CLUB}/way/${principles}#principle-transicion`,
  );

  // Las variantes y el material.
  for (const variant of OUTLET.variants ?? []) {
    await expect(page.getByRole("heading", { level: 3, name: variant.title })).toBeVisible();
    await expect(page.getByText(variant.description, { exact: true })).toBeVisible();
  }
  for (const item of ["Balones", "Conos", "Petos"]) {
    await expect(page.getByRole("listitem").filter({ hasText: new RegExp(`^${item}$`) })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Ver vídeo" })).toHaveCount(0);

  // Publicado y de otro: nada que gestionar, y nada de sesiones (es de otra fase).
  for (const name of ["Editar", "Publicar", "Archivar", "Añadir a sesión"]) {
    await expect(page.getByRole("link", { name })).toHaveCount(0);
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(page.getByText("Borrador", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Archivado", { exact: true })).toHaveCount(0);

  await expectFitsMobile(page, "ficha completa");
});

test("los enlaces de la ficha llevan a su sitio en The Way", async ({ page }) => {
  if (!OUTLET) throw new Error("Falta «Rebote + outlet» en el seed.");
  await openAs(page, ALEX);
  await page.goto(LIBRARY);
  await row(page, OUTLET.title).click();
  await expect(title(page)).toHaveText(OUTLET.title);
  const ficha = page.url();

  // Un Standard lleva a su bloque de la página de Standards, a la vista bajo la cabecera.
  await page.getByRole("link", { name: /^03 / }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/way/standards#standard-03$`));
  await expect(title(page)).toHaveText(STANDARDS_TERM);
  await expect(page.locator("#standard-03")).toBeInViewport();

  // Y un principio, a su bloque de la sección de principios.
  await page.goto(ficha);
  await page.getByRole("link", { name: "Rebote", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/way/${slugify("Cómo jugamos")}#principle-rebote$`));
  await expect(page.locator("#principle-rebote")).toBeInViewport();
});

test("el borrador de otro es un 404", async ({ page, browserErrors }) => {
  if (!DRAFT || !OUTLET) throw new Error("Falta el borrador o «Rebote + outlet» en el seed.");
  const draft = `${LIBRARY}/${drillId(ARCANGEL.slug, DRAFT.key)}`;
  const random = `${LIBRARY}/${randomUUID()}`;
  const notAnId = `${LIBRARY}/no-es-un-uuid`;
  // Un ejercicio que existe, pero en Club Demo, pedido con la URL de Arcángel.
  const demoDrill = CLUB_DEMO.drills[0];
  if (!demoDrill) throw new Error("Falta un ejercicio en Club Demo.");
  const otherClub = `${LIBRARY}/${drillId(CLUB_DEMO.slug, demoDrill.key)}`;
  // Chromium escribe un aviso en la consola por cada documento que responde 404 (ver `helpers/test.ts`).
  browserErrors.allowNotFound(draft, random, notAnId, otherClub);

  // Álex no es la autora ni dirección: el borrador de Irene, un uuid cualquiera, algo que ni
  // es un id y el ejercicio de otro club dan EXACTAMENTE la misma página. Nada distingue el
  // «existe pero no es tuyo» del «no existe».
  await openAs(page, ALEX);
  const texts: string[] = [];
  for (const path of [draft, random, notAnId, otherClub]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();
    await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
    texts.push(await mainText(page));
  }
  expect(texts[0]).toContain(NOT_FOUND);
  expect(new Set(texts).size, "las cuatro respuestas son idénticas").toBe(1);
  await expect(page.locator("body")).not.toContainText(DRAFT.title);
  await expect(page.locator("body")).not.toContainText(demoDrill.title);

  // Quien no es del club tampoco ve nada del ejercicio de Arcángel, ni siquiera uno publicado.
  const outletPath = `${LIBRARY}/${drillId(ARCANGEL.slug, OUTLET.key)}`;
  browserErrors.allowNotFound(outletPath);
  await openAs(page, MARTA);
  await page.goto(outletPath);
  await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(OUTLET.title);

  // Irene, su autora, lo ve como borrador y puede editarlo; no publicarlo ni archivarlo.
  await openAs(page, IRENE);
  await page.goto(draft);
  await expect(title(page)).toHaveText(DRAFT.title);
  await expect(page.getByText("Borrador", { exact: true })).toBeVisible();
  await expect(page.getByText(DRAFT_NOTICE)).toBeVisible();
  await expect(detailHeader(page).getByRole("link", { name: "Editar" })).toHaveAttribute("href", `${draft}/edit`);
  await expect(page.getByRole("button", { name: "Publicar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archivar" })).toHaveCount(0);

  // Raúl, dirección, lo ve, lo puede editar y publicar.
  await openAs(page, RAUL);
  await page.goto(draft);
  await expect(title(page)).toHaveText(DRAFT.title);
  await expect(page.getByText("Borrador", { exact: true })).toBeVisible();
  await expect(detailHeader(page).getByRole("link", { name: "Editar" })).toHaveAttribute("href", `${draft}/edit`);
  await expect(page.getByRole("button", { name: "Publicar" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Archivar" })).toBeVisible();
  await expectFitsMobile(page, "borrador de Irene, visto por dirección");
});

test("archivar", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const name = `E2E archivado ${Date.now()}`;
  const id = await createDrill(createAdminClient(), { title: name, status: "published" });
  const path = `${LIBRARY}/${id}`;
  const search = `${LIBRARY}?q=${encodeURIComponent(name)}`;

  await openAs(page, RAUL);

  // Publicado, sale al buscarlo: por eso el vacío de después significa algo.
  await page.goto(search);
  await expect(row(page, name)).toBeVisible();

  await page.goto(path);
  await expect(title(page)).toHaveText(name);
  await expect(page.getByText("Archivado", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publicar" })).toHaveCount(0);

  // Pide confirmación, y cancelar no cambia nada.
  await page.getByRole("button", { name: "Archivar" }).click();
  const sheet = page.getByRole("dialog", { name: "¿Archivar este ejercicio?" });
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByText("Dejará de salir en la biblioteca. Las sesiones que ya lo usan lo conservan."),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Cancelar" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Archivado", { exact: true })).toHaveCount(0);

  // Confirmar lo archiva, y la ficha enseña su nuevo estado sin recargar a mano.
  await page.getByRole("button", { name: "Archivar" }).click();
  await sheet.getByRole("button", { name: "Archivar" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("Archivado", { exact: true })).toBeVisible();
  await expect(page.getByText(ARCHIVED_NOTICE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Archivar" })).toHaveCount(0);
  // Un archivado puede volver: dirección ve «Publicar».
  await expect(page.getByRole("button", { name: "Publicar" })).toBeVisible();
  // El botón pulsado ya no existe: el foco va al título, que dice dónde se está, y el resultado
  // se anuncia (la hoja modal ya está cerrada, así que el aviso se oye).
  await expect(title(page)).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Ejercicio archivado.");

  // Buscándolo ya no sale…
  await page.goto(search);
  await expect(page.getByRole("heading", { level: 2, name: "No hay ejercicios con estos filtros" })).toBeVisible();
  await expect(row(page, name)).toHaveCount(0);

  // …pero su ficha sigue ahí, para quien tenga el enlace.
  await openAs(page, ALEX);
  await page.goto(path);
  await expect(title(page)).toHaveText(name);
  await expect(page.getByText("Archivado", { exact: true })).toBeVisible();
  await expect(page.getByText(ARCHIVED_NOTICE)).toBeVisible();
  for (const control of ["Editar", "Publicar", "Archivar"]) {
    await expect(page.getByRole("link", { name: control })).toHaveCount(0);
    await expect(page.getByRole("button", { name: control })).toHaveCount(0);
  }
  await expectFitsMobile(page, "archivado");
});

test("publicar", async ({ page, browserErrors }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  // El título más largo que admite la base de datos (80), acabado en una palabra sin espacios
  // que no cabe en 375 px: la ficha tiene que partirla en vez de ensancharse.
  const stem = `E2E borrador ${Date.now()}`;
  const name = `${stem} ${"W".repeat(80 - stem.length - 1)}`;
  expect(name).toHaveLength(80);
  const id = await createDrill(createAdminClient(), { title: name, status: "draft", standards: 5 });
  const path = `${LIBRARY}/${id}`;
  const search = `${LIBRARY}?q=${encodeURIComponent(stem)}`;

  // Sin autor, un borrador solo lo ve la dirección: el entrenador recibe el 404.
  browserErrors.allowNotFound(path);
  await openAs(page, ALEX);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();

  await openAs(page, RAUL);
  await page.goto(path);
  await expect(title(page)).toHaveText(name);
  await expect(page.getByText("Borrador", { exact: true })).toBeVisible();
  await expect(page.getByText(DRAFT_NOTICE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Archivar" })).toBeVisible();

  // Con cinco Standards salen tres y «+2», que lleva a la página de los Standards del club.
  const standards = page.getByRole("heading", { level: 2, name: STANDARDS_TERM }).locator("xpath=ancestor::section");
  await expect(standards.getByRole("link", { name: /^0\d / })).toHaveCount(3);
  const more = standards.getByRole("link", { name: `Ver 2 más en ${STANDARDS_TERM}` });
  await expect(more).toHaveText("+2");
  await expect(more).toHaveAttribute("href", `${CLUB}/way/standards`);

  await expectFitsMobile(page, "borrador largo");

  await page.getByRole("button", { name: "Publicar" }).click();

  // Sin confirmación: la ficha pasa a publicada y deja de decir «Borrador».
  await expect(page.getByText("Borrador", { exact: true })).toHaveCount(0);
  await expect(page.getByText(DRAFT_NOTICE)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publicar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archivar" })).toBeVisible();
  // El botón pulsado ya no existe: el foco va al título y el resultado se anuncia.
  await expect(title(page)).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Ejercicio publicado.");

  // Y ya lo ve todo el cuerpo técnico, en la lista y en su ficha.
  await openAs(page, ALEX);
  await page.goto(search);
  await expect(row(page, stem)).toBeVisible();
  await page.goto(path);
  await expect(title(page)).toHaveText(name);
  await expect(page.getByText("Borrador", { exact: true })).toHaveCount(0);
  await expectFitsMobile(page, "publicado");
});

test("al volver atrás, la biblioteca conserva el filtro a la vista y la misma lista", async ({ page }) => {
  await openAs(page, ALEX);

  // «Rebote» es de los últimos chips: a 375 px no cabe en la fila sin desplazarla.
  await page.goto(`${LIBRARY}?focus=rebote`);
  const chip = focusFilter(page).getByRole("button", { name: "Rebote", exact: true });
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expectFullyInRow(chip, focusFilter(page));
  await expect(rows(page).first()).toBeVisible();
  const before = await rows(page).allInnerTexts();
  expect(before.length).toBeGreaterThan(0);

  // Abre un ejercicio de la lista y vuelve con el botón de atrás del navegador.
  await rows(page).first().click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}/[0-9a-f-]{36}$`));
  await expect(title(page)).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}\\?focus=rebote$`));
  await expect(chip).toHaveAttribute("aria-pressed", "true");
  await expectFullyInRow(chip, focusFilter(page));
  await expect(rows(page).first()).toBeVisible();
  expect(await rows(page).allInnerTexts(), "la misma lista").toEqual(before);
});

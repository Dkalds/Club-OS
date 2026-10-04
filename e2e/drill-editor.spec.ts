import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import type { Database } from "@/lib/database.types";
import { createAdminClient, readSupabaseEnv } from "../scripts/lib/admin-client";
import { ARCANGEL } from "../scripts/seed/data";
import { drillId } from "../scripts/seed/drills";
import { isLocalSupabaseUrl } from "../scripts/seed/guard";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login, cada
// test abre la app con `openAs`.
//
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts) porque
// ESCRIBE: crea ejercicios `E2E … {Date.now()}` desde el formulario o con la clave de servicio,
// sube diagramas a Storage y publica. Todo lo que crea lo borra al acabar, también si el test
// falla (`afterEach`): los ejercicios, las fichas de `media_assets` y los objetos de Storage de
// su carpeta. Si la ejecución se aborta, lo que queda lo borra `restoreSeed` en el arranque de la
// siguiente. Los ejercicios de prueba llevan el objetivo `tiro`: no son del objetivo `rebote` ni
// de `focus=rebote&age=10`, que es lo que supone la biblioteca (`drills-library.spec.ts`).
// Ningún test afirma recuentos totales.
//
// Es la primera vez que la acción que sube el diagrama corre de verdad dentro de Next: los
// tests de la acción la prueban con un Supabase falso, y el de integración, contra Storage pero
// sin Next. Aquí el fichero viaja por el navegador, la Server Action y Storage reales.
//
// Con un Supabase que no es local no se escribe nada: los que escriben se saltan.

// La pantalla se revisa siempre a 375 px, sea cual sea el proyecto de Playwright.
test.use({ viewport: { width: 375, height: 812 } });

const ALEX = "alex@arcangel.test"; // entrenador de Arcángel
const IRENE = "irene@arcangel.test"; // entrenadora de Arcángel, autora del único borrador
const RAUL = "raul@arcangel.test"; // dirección de Arcángel
const MARTA = "marta@demo.test"; // entrenadora del otro club

const CLUB = `/c/${ARCANGEL.slug}`;
const LIBRARY = `${CLUB}/drills`;
const BUCKET = "club-media";

const NOT_FOUND = "No encontramos esta página";
const DRAFT_NOTICE = "Solo lo ven su autor y dirección hasta que se publique.";
const INVALID = "Revisa los campos marcados.";
const STALE = "Alguien ha cambiado esto mientras editabas. Recarga para ver la última versión.";
const VIDEO_ERROR = "Pega un enlace de YouTube o Vimeo que empiece por https://.";
const DIAGRAM_ERROR = "Sube una imagen PNG, JPEG o WebP de hasta 2 MB.";
const UPLOAD_FAILED = "No se pudo subir el diagrama. Inténtalo de nuevo.";
const PHOTOS_HINT = "Sube solo el dibujo de la pista. No subas fotos en las que salgan jugadores.";
const SIGNED_URL = "/storage/v1/object/sign/club-media/org/";

const FIXTURES = path.resolve(import.meta.dirname, "fixtures");
const DIAGRAM_PNG = path.join(FIXTURES, "diagram.png");
const DIAGRAM_SVG = path.join(FIXTURES, "diagram.svg");

const DRAFT = ARCANGEL.drills.find((drill) => drill.status === "draft");
const OUTLET = ARCANGEL.drills.find((drill) => drill.title === "Rebote + outlet");

const NEEDS_LOCAL_DB = "Escribe en la base de datos (crea ejercicios y sube ficheros): solo con un Supabase local.";

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

type Db = SupabaseClient<Database>;

/** Los ejercicios que ha creado el test en curso con la clave de servicio o que ha visto nacer. */
const created: string[] = [];
/** Los títulos de los que crea desde el formulario: si el test falla antes de ver su id, se barren por título. */
const titles: string[] = [];

test.afterEach(async () => {
  const ids = created.splice(0);
  const names = titles.splice(0);
  if (ids.length === 0 && names.length === 0) return;

  await removeDrills(createAdminClient(), ids, names);
});

async function arcangelId(db: Db): Promise<string> {
  const org = await db.from("organizations").select("id").eq("slug", ARCANGEL.slug).single();
  if (org.error) throw new Error(`No se pudo leer el club: ${org.error.message}`);
  return org.data.id;
}

async function userIdOf(db: Db, email: string): Promise<string> {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`No se pudieron leer los usuarios: ${error.message}`);
  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (!user) throw new Error(`No hay usuario de Auth para ${email}`);
  return user.id;
}

/** Lo que hay en la carpeta de Storage de un ejercicio, por nombre de objeto. */
async function folderOf(db: Db, orgId: string, id: string): Promise<string[]> {
  const folder = `org/${orgId}/drills/${id}`;
  const { data, error } = await db.storage.from(BUCKET).list(folder, { limit: 100 });
  if (error) throw new Error(`No se pudo listar ${folder}: ${error.message}`);
  // Un objeto tiene `id`; una subcarpeta, no.
  return data.filter((entry) => entry.id !== null).map((entry) => entry.name);
}

/** Las fichas de `media_assets` cuya ruta está en la carpeta de un ejercicio. */
async function mediaOf(db: Db, orgId: string, id: string) {
  const { data, error } = await db
    .from("media_assets")
    .select("id, path, mime, bytes")
    .eq("organization_id", orgId)
    .like("path", `org/${orgId}/drills/${id}/%`);
  if (error) throw new Error(`No se pudieron leer las fichas de ${id}: ${error.message}`);
  return data;
}

/**
 * Borra ejercicios de prueba y todo lo que subieron: primero el ejercicio (sus puntos, variantes
 * y vínculos se van con él), después sus fichas de `media_assets` y por último sus objetos de
 * Storage, por la API de Storage (no se borra de `storage.objects` con SQL). `names` son
 * títulos de ejercicios creados desde el formulario cuyo id el test aún no conocía.
 */
async function removeDrills(db: Db, ids: string[], names: string[]): Promise<void> {
  const orgId = await arcangelId(db);
  const all = new Set(ids);
  if (names.length > 0) {
    const found = await db.from("drills").select("id").eq("organization_id", orgId).in("title", names);
    if (found.error) throw new Error(`No se pudieron buscar los ejercicios de prueba: ${found.error.message}`);
    for (const row of found.data) all.add(row.id);
  }
  if (all.size === 0) return;

  const removed = await db.from("drills").delete().in("id", [...all]);
  if (removed.error) throw new Error(`No se pudieron borrar los ejercicios de prueba: ${removed.error.message}`);

  for (const id of all) {
    const media = await db
      .from("media_assets")
      .delete()
      .eq("organization_id", orgId)
      .like("path", `org/${orgId}/drills/${id}/%`);
    if (media.error) throw new Error(`No se pudieron borrar las fichas de ${id}: ${media.error.message}`);

    const names = await folderOf(db, orgId, id);
    if (names.length > 0) {
      const objects = await db.storage.from(BUCKET).remove(names.map((name) => `org/${orgId}/drills/${id}/${name}`));
      if (objects.error) throw new Error(`No se pudieron borrar los diagramas de ${id}: ${objects.error.message}`);
    }
  }
}

/**
 * Crea un ejercicio de Arcángel con la clave de servicio, con el objetivo `tiro`, a nombre de
 * `author` (o sin autor, que solo ve dirección), y lo apunta para borrarlo. Devuelve su id.
 */
async function createDraft(
  db: Db,
  drill: { title: string; author: string | null; status?: "draft" | "published" },
): Promise<string> {
  const orgId = await arcangelId(db);
  const focus = await db
    .from("focus_areas")
    .select("id")
    .eq("organization_id", orgId)
    .eq("slug", "tiro")
    .single();
  if (focus.error) throw new Error(`No se pudo leer el objetivo «tiro»: ${focus.error.message}`);
  const createdBy = drill.author ? await userIdOf(db, drill.author) : null;

  const inserted = await db
    .from("drills")
    .insert({
      organization_id: orgId,
      title: drill.title,
      objective: "Un ejercicio de prueba de los e2e.",
      min_players: 6,
      max_players: 10,
      min_minutes: 10,
      max_minutes: 15,
      min_age: 12,
      status: drill.status ?? "draft",
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(`No se pudo crear el ejercicio de prueba: ${inserted.error.message}`);
  created.push(inserted.data.id);

  const link = await db.from("drill_focus_areas").insert({
    organization_id: orgId,
    drill_id: inserted.data.id,
    focus_area_id: focus.data.id,
  });
  if (link.error) throw new Error(`No se pudo vincular el objetivo: ${link.error.message}`);

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

function row(page: Page, drillTitle: string) {
  return page.locator(`main a[href^="${LIBRARY}/"]:not([href$="/new"])`).filter({ hasText: drillTitle });
}

function field(page: Page, label: string) {
  return page.getByLabel(label, { exact: true });
}

function save(page: Page, label: "Guardar borrador" | "Guardar cambios") {
  return page.getByRole("button", { name: label });
}

/** La alerta (`role="alert"`) que dice `text`: el aviso general o el mensaje de un campo. */
function alert(page: Page, text: string) {
  return page.getByRole("alert").filter({ hasText: text });
}

/** El id de la ficha a la que ha llevado la página: la última parte de su URL. */
function idOf(page: Page): string {
  const id = new URL(page.url()).pathname.split("/").at(-1);
  if (!id) throw new Error(`La URL no acaba en un id: ${page.url()}`);
  return id;
}

/**
 * Rellena lo mínimo para guardar un borrador válido: título, 4–8 jugadores, 10–10 minutos,
 * U10 y el objetivo «Tiro».
 */
async function fillBasics(page: Page, drillTitle: string): Promise<void> {
  await field(page, "Título").fill(drillTitle);
  const players = page.getByRole("group", { name: "Jugadores" });
  await players.getByLabel("Mín.").fill("4");
  await players.getByLabel("Máx.").fill("8");
  const minutes = page.getByRole("group", { name: "Duración (min)" });
  await minutes.getByLabel("Mín.").fill("10");
  await minutes.getByLabel("Máx.").fill("10");
  await field(page, "Edad mínima").selectOption({ label: "U10" });
  await page.getByRole("group", { name: "Objetivos" }).getByRole("button", { name: "Tiro", exact: true }).click();
}

/**
 * Elige un fichero con el botón «Subir diagrama» o «Cambiar diagrama», como lo hace quien usa la
 * pantalla, y espera a que el formulario haya atendido la elección: lo hace vaciando el campo de
 * fichero, para poder elegir el mismo otra vez. Sin esa espera, una elección que acaba mostrando
 * lo mismo que la anterior (el mismo error) no se distinguiría de una que aún no se ha procesado.
 */
async function chooseDiagram(
  page: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
  button: "Subir diagrama" | "Cambiar diagrama" = "Subir diagrama",
): Promise<void> {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles(file);
  await expect
    .poll(() => page.locator('input[type="file"]').evaluate((input: HTMLInputElement) => input.files?.length ?? 0))
    .toBe(0);
}

/** Las peticiones POST de la página: cada llamada a una Server Action es una. */
function watchActionCalls(page: Page): string[] {
  const calls: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") calls.push(request.url());
  });
  return calls;
}

/**
 * La pantalla cabe en 375 px y todo lo que se toca mide 44 px como mínimo (botones, chips y
 * enlaces; los campos miden `target-min` por su propio estilo).
 */
async function expectFitsMobile(page: Page, where: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);

  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.viewport, where).toBe(375);
  expect(widths.scroll, `${where}: la página no desborda`).toBeLessThanOrEqual(375);

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

// ── Tests ────────────────────────────────────────────────────────────────────────────

test("el seed tiene lo que estos tests suponen", () => {
  // Sin esto, una prueba de «no edita lo ajeno» pasaría aunque el borrador no existiera.
  expect(DRAFT?.title).toBe("Bloqueo de rebote");
  expect(DRAFT?.author).toBe(IRENE);
  expect(OUTLET?.title).toBe("Rebote + outlet");
});

test("crea un borrador", async ({ page, browserErrors }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const name = `E2E borrador ${Date.now()}`;
  titles.push(name);
  await openAs(page, ALEX);

  // Se llega desde la biblioteca, con «Nuevo» de su cabecera.
  await page.goto(LIBRARY);
  await detailHeader(page).getByRole("link", { name: "Nuevo" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}/new$`));

  // Un solo <h1>; la cabecera de detalle sustituye a la de marca y vuelve a la biblioteca.
  await expect(title(page)).toHaveCount(1);
  await expect(title(page)).toHaveText("Nuevo ejercicio");
  await expect(detailHeader(page).getByText("Nuevo ejercicio", { exact: true })).toBeVisible();
  await expect(brandHeader(page)).toBeHidden();
  await expect(detailHeader(page).getByRole("link", { name: "Volver" })).toHaveAttribute("href", LIBRARY);

  // En alta no hay diagrama: se explica por qué y cómo.
  await expect(page.getByText("Guarda el borrador para añadir un diagrama.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Subir diagrama" })).toHaveCount(0);

  // Los grupos de chips, con el nombre que el club da a los Standards.
  await expect(page.getByRole("group", { name: "Objetivos" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Arcángel Standards" })).toBeVisible();

  await fillBasics(page, name);
  await expect(
    page.getByRole("group", { name: "Objetivos" }).getByRole("button", { name: "Tiro", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // Dos coaching points: el segundo sube al primer puesto y se marca como clave.
  await page.getByRole("button", { name: "Añadir punto" }).click();
  await expect(field(page, "Punto 1")).toBeFocused();
  await field(page, "Punto 1").fill("Primer punto");
  await page.getByRole("button", { name: "Añadir punto" }).click();
  await expect(field(page, "Punto 2")).toBeFocused();
  await field(page, "Punto 2").fill("Segundo punto");

  await page.getByRole("button", { name: "Subir punto 2" }).click();
  await expect(field(page, "Punto 1")).toHaveValue("Segundo punto");
  await expect(field(page, "Punto 2")).toHaveValue("Primer punto");
  // El foco se queda en la fila que se movió: «Subir» ya no se puede usar, pasa a «Bajar».
  await expect(page.getByRole("button", { name: "Bajar punto 1" })).toBeFocused();
  const key = page.getByRole("button", { name: "Clave punto 1" });
  await key.click();
  await expect(key).toHaveAttribute("aria-pressed", "true");

  await expectFitsMobile(page, "formulario de alta");

  await save(page, "Guardar borrador").click();

  // Lleva a la ficha del borrador nuevo, con su orden.
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}/[0-9a-f-]{36}$`));
  const path = new URL(page.url()).pathname;
  created.push(idOf(page));
  await expect(title(page)).toHaveText(name);
  await expect(page.getByText("Borrador", { exact: true })).toBeVisible();
  await expect(page.getByText(DRAFT_NOTICE)).toBeVisible();
  for (const pill of ["U10+", "4–8 jugadores", "10 minutos"]) {
    await expect(page.getByText(pill, { exact: true })).toBeVisible();
  }
  const points = page.getByRole("list").filter({ hasText: "Primer punto" }).getByRole("listitem");
  await expect(points).toHaveText([/^\s*Clave\s*Segundo punto$/, /^\s*Primer punto$/]);
  await expect(points.filter({ hasText: "Clave" })).toHaveCount(1);

  // Irene, otra entrenadora, no ve el borrador de Álex.
  browserErrors.allowNotFound(path);
  await openAs(page, IRENE);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();
});

test("un formulario vacío señala cada campo y lleva el foco al primero", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await openAs(page, ALEX);
  await page.goto(`${LIBRARY}/new`);

  await save(page, "Guardar borrador").click();

  // Los números vacíos no son un 0 ni un NaN: son un error en su campo, con el mensaje del servidor.
  await expect(alert(page, INVALID)).toBeVisible();
  await expect(alert(page, "Escribe un título de 3 a 80 caracteres.")).toBeVisible();
  await expect(alert(page, "Elige entre 1 y 40 jugadores.")).toHaveCount(2);
  await expect(alert(page, "Elige entre 1 y 120 minutos.")).toHaveCount(2);
  await expect(alert(page, "Elige una edad entre 8 y 18.")).toHaveCount(1);
  await expect(alert(page, "Elige al menos un objetivo.")).toBeVisible();
  // El primero del formulario recibe el foco, y apunta a su mensaje.
  await expect(field(page, "Título")).toBeFocused();
  await expect(field(page, "Título")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}/new$`));

  // Escribir un título bueno y volver a guardar quita su error y pasa al siguiente campo con error.
  await field(page, "Título").fill("E2E sin guardar");
  await save(page, "Guardar borrador").click();
  await expect(alert(page, "Escribe un título de 3 a 80 caracteres.")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Jugadores" }).getByLabel("Mín.")).toBeFocused();
});

test("vídeo no permitido", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const name = `E2E vídeo ${Date.now()}`;
  titles.push(name);
  await openAs(page, ALEX);
  await page.goto(`${LIBRARY}/new`);
  await fillBasics(page, name);

  await field(page, "Vídeo (YouTube o Vimeo)").fill("https://example.com/v");
  await save(page, "Guardar borrador").click();

  await expect(alert(page, INVALID)).toBeVisible();
  await expect(alert(page, VIDEO_ERROR)).toBeVisible();
  await expect(field(page, "Vídeo (YouTube o Vimeo)")).toBeFocused();
  await expect(field(page, "Vídeo (YouTube o Vimeo)")).toHaveAttribute("aria-invalid", "true");
  // No se ha perdido nada de lo escrito, y no se ha creado nada.
  await expect(field(page, "Título")).toHaveValue(name);
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}/new$`));

  // Con un enlace de YouTube, el mismo formulario guarda.
  await field(page, "Vídeo (YouTube o Vimeo)").fill("https://www.youtube.com/watch?v=abc123");
  await save(page, "Guardar borrador").click();
  await expect(page).toHaveURL(new RegExp(`${LIBRARY}/[0-9a-f-]{36}$`));
  created.push(idOf(page));
  await expect(title(page)).toHaveText(name);
  await expect(page.getByRole("link", { name: "Ver vídeo" })).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=abc123",
  );
});

test("sube un diagrama", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const db = createAdminClient();
  const name = `E2E diagrama ${Date.now()}`;
  const id = await createDraft(db, { title: name, author: ALEX });
  const orgId = await arcangelId(db);
  const ficha = `${LIBRARY}/${id}`;
  await openAs(page, ALEX);

  // Se llega a la edición desde la ficha, con «Editar» de su cabecera.
  await page.goto(ficha);
  await expect(page.getByRole("img", { name: "Pista sin diagrama" })).toBeVisible();
  await detailHeader(page).getByRole("link", { name: "Editar" }).click();
  await expect(page).toHaveURL(new RegExp(`${ficha}/edit$`));
  await expect(title(page)).toHaveCount(1);
  await expect(detailHeader(page).getByText("Editar ejercicio", { exact: true })).toBeVisible();
  await expect(detailHeader(page).getByRole("link", { name: "Volver" })).toHaveAttribute("href", ficha);
  await expect(field(page, "Título")).toHaveValue(name);
  await expect(page.getByText(PHOTOS_HINT)).toBeVisible();
  await expect(page.getByText("Guarda el borrador para añadir un diagrama.")).toHaveCount(0);

  // Sube el PNG por la pantalla: la vista previa sale de la URL firmada y la imagen carga.
  await chooseDiagram(page, DIAGRAM_PNG);
  const preview = page.getByRole("img", { name: "Vista previa del diagrama" });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("src", new RegExp(SIGNED_URL));
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Cambiar diagrama" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Quitar diagrama" })).toBeVisible();
  // El foco vuelve al botón que se usó.
  await expect(page.getByRole("button", { name: "Cambiar diagrama" })).toBeFocused();
  await expect(alert(page, UPLOAD_FAILED)).toHaveCount(0);
  await expect(alert(page, DIAGRAM_ERROR)).toHaveCount(0);

  // Subir no liga el diagrama al ejercicio: eso lo hace «Guardar cambios».
  const uploaded = await mediaOf(db, orgId, id);
  expect(uploaded).toHaveLength(1);
  expect(uploaded[0]).toMatchObject({ mime: "image/png" });
  const before = await db.from("drills").select("diagram_media_id").eq("id", id).single();
  expect(before.data?.diagram_media_id).toBeNull();

  await save(page, "Guardar cambios").click();
  await expect(page).toHaveURL(new RegExp(`${ficha}$`));
  await expect(title(page)).toHaveText(name);

  // La ficha enseña el diagrama: una URL firmada del bucket privado, y la imagen carga.
  const diagram = page.locator(`main img[src*="${SIGNED_URL}"]`);
  await expect(diagram).toHaveCount(1);
  await expect(diagram).toHaveAttribute("alt", `Diagrama de ${name}`);
  await expect.poll(() => diagram.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  const linked = await db.from("drills").select("diagram_media_id").eq("id", id).single();
  expect(linked.data?.diagram_media_id).toBe(uploaded[0].id);
  expect(await folderOf(db, orgId, id)).toHaveLength(1);

  // Guardar otros cambios no quita el diagrama: el formulario reenvía el que tiene.
  await detailHeader(page).getByRole("link", { name: "Editar" }).click();
  await expect(page.getByRole("img", { name: "Vista previa del diagrama" })).toBeVisible();
  await field(page, "Resumen").fill("Solo cambia el resumen.");
  await save(page, "Guardar cambios").click();
  await expect(page).toHaveURL(new RegExp(`${ficha}$`));
  await expect(page.locator(`main img[src*="${SIGNED_URL}"]`)).toHaveCount(1);
  const kept = await db.from("drills").select("diagram_media_id").eq("id", id).single();
  expect(kept.data?.diagram_media_id).toBe(uploaded[0].id);

  // «Quitar diagrama» lo desliga al guardar; el objeto no se borra (nada se borra en esta fase).
  await detailHeader(page).getByRole("link", { name: "Editar" }).click();
  await page.getByRole("button", { name: "Quitar diagrama" }).click();
  await expect(page.getByRole("img", { name: "Vista previa del diagrama" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Subir diagrama" })).toBeFocused();
  await save(page, "Guardar cambios").click();
  await expect(page).toHaveURL(new RegExp(`${ficha}$`));
  await expect(page.getByRole("img", { name: "Pista sin diagrama" })).toBeVisible();
  await expect(page.locator(`main img[src*="${SIGNED_URL}"]`)).toHaveCount(0);
  const removed = await db.from("drills").select("diagram_media_id").eq("id", id).single();
  expect(removed.data?.diagram_media_id).toBeNull();
  expect(await mediaOf(db, orgId, id)).toHaveLength(1);
});

test("sube un diagrama de justo 2 MiB: el límite de Next no lo corta", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const db = createAdminClient();
  const id = await createDraft(db, { title: `E2E tope ${Date.now()}`, author: ALEX });
  const orgId = await arcangelId(db);
  await openAs(page, ALEX);
  await page.goto(`${LIBRARY}/${id}/edit`);

  // Un PNG de verdad con ceros detrás hasta los 2 MiB exactos (2 097 152 bytes): lo más grande
  // que admite el bucket. Con el multipart que añade la Server Action, la petición pasa del MB
  // que Next admite por defecto (`next.config.ts` lo sube a 3 MB): sería un fallo de la subida.
  const png = readFileSync(DIAGRAM_PNG);
  const buffer = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024 - png.length)]);
  expect(buffer).toHaveLength(2_097_152);

  await chooseDiagram(page, { name: "grande.png", mimeType: "image/png", buffer });

  const preview = page.getByRole("img", { name: "Vista previa del diagrama" });
  await expect(preview).toHaveAttribute("src", new RegExp(SIGNED_URL));
  await expect(alert(page, UPLOAD_FAILED)).toHaveCount(0);
  await expect(alert(page, DIAGRAM_ERROR)).toHaveCount(0);
  const [stored] = await mediaOf(db, orgId, id);
  expect(stored).toMatchObject({ mime: "image/png", bytes: 2_097_152 });

  // Un byte más lo para el navegador, sin enviar nada.
  const calls = watchActionCalls(page);
  await chooseDiagram(page, { name: "pasado.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) }, "Cambiar diagrama");
  await expect(alert(page, DIAGRAM_ERROR)).toBeVisible();
  expect(calls).toHaveLength(0);
});

test("rechaza SVG y ficheros grandes", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const db = createAdminClient();
  const name = `E2E rechazos ${Date.now()}`;
  const id = await createDraft(db, { title: name, author: ALEX });
  const orgId = await arcangelId(db);
  await openAs(page, ALEX);
  await page.goto(`${LIBRARY}/${id}/edit`);
  await expect(field(page, "Título")).toHaveValue(name);
  const calls = watchActionCalls(page);

  // Un SVG tal cual: lo para el navegador por su tipo, y no se envía nada.
  await chooseDiagram(page, DIAGRAM_SVG);
  await expect(alert(page, DIAGRAM_ERROR)).toBeVisible();
  expect(calls, "el SVG no sale del navegador").toHaveLength(0);

  // Un PNG de 20 MB: lo para el navegador por su tamaño.
  await chooseDiagram(page, { name: "big.png", mimeType: "image/png", buffer: Buffer.alloc(20 * 1024 * 1024) });
  await expect(alert(page, DIAGRAM_ERROR)).toBeVisible();
  expect(calls, "el fichero grande no sale del navegador").toHaveLength(0);

  // Los bytes de un SVG con nombre y tipo de PNG pasan la comprobación del navegador; el
  // servidor mira los bytes y lo rechaza con el mismo mensaje.
  await chooseDiagram(page, { name: "x.png", mimeType: "image/png", buffer: readFileSync(DIAGRAM_SVG) });
  await expect.poll(() => calls.length).toBe(1);
  await expect(alert(page, DIAGRAM_ERROR)).toBeVisible();
  await expect(alert(page, UPLOAD_FAILED)).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Vista previa del diagrama" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Subir diagrama" })).toBeVisible();

  // Ningún intento dejó rastro: ni ficha en `media_assets` ni objeto en la carpeta del ejercicio.
  expect(await mediaOf(db, orgId, id)).toHaveLength(0);
  expect(await folderOf(db, orgId, id)).toHaveLength(0);

  // Lo escrito sigue en el formulario y se puede guardar.
  await expect(field(page, "Título")).toHaveValue(name);
  await expect(save(page, "Guardar cambios")).toBeEnabled();
});

test("copia antigua", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const db = createAdminClient();
  const name = `E2E copia ${Date.now()}`;
  const id = await createDraft(db, { title: name, author: ALEX });
  const ficha = `${LIBRARY}/${id}`;
  await openAs(page, ALEX);

  // Dos pestañas de Álex con la misma copia del borrador.
  const other = await page.context().newPage();
  await page.goto(`${ficha}/edit`);
  await other.goto(`${ficha}/edit`);
  await expect(field(page, "Título")).toHaveValue(name);
  await expect(field(other, "Título")).toHaveValue(name);

  // La primera guarda y llega a la ficha.
  await field(page, "Título").fill(`${name} A`);
  await save(page, "Guardar cambios").click();
  await expect(page).toHaveURL(new RegExp(`${ficha}$`));
  await expect(title(page)).toHaveText(`${name} A`);

  // La segunda guarda sobre una copia vieja: no pisa nada, lo dice y conserva lo escrito.
  await field(other, "Título").fill(`${name} B`);
  await save(other, "Guardar cambios").click();
  await expect(alert(other, STALE)).toBeVisible();
  await expect(alert(other, STALE)).toBeFocused();
  await expect(field(other, "Título")).toHaveValue(`${name} B`);
  await expect(other).toHaveURL(new RegExp(`${ficha}/edit$`));
  const saved = await db.from("drills").select("title").eq("id", id).single();
  expect(saved.data?.title).toBe(`${name} A`);

  // «Recargar» trae la versión guardada por la otra.
  await other.getByRole("button", { name: "Recargar" }).click();
  await expect(field(other, "Título")).toHaveValue(`${name} A`);
  await expect(alert(other, STALE)).toHaveCount(0);
});

test("dirección publica", async ({ page, browserErrors }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const db = createAdminClient();
  const name = `E2E publicar ${Date.now()}`;
  const id = await createDraft(db, { title: name, author: ALEX });
  const ficha = `${LIBRARY}/${id}`;
  const search = `${LIBRARY}?q=${encodeURIComponent(name)}`;
  browserErrors.allowNotFound(`${ficha}/edit`);

  // Mientras es borrador, Álex lo ve en la biblioteca y puede editarlo.
  await openAs(page, ALEX);
  await page.goto(search);
  await expect(row(page, name)).toBeVisible();
  await page.goto(ficha);
  await expect(detailHeader(page).getByRole("link", { name: "Editar" })).toHaveAttribute("href", `${ficha}/edit`);

  // Raúl, dirección, lo publica.
  await openAs(page, RAUL);
  await page.goto(ficha);
  await page.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Ejercicio publicado." })).toBeAttached();
  await expect(page.getByText("Borrador", { exact: true })).toHaveCount(0);

  // Álex lo encuentra en la biblioteca, ya publicado, y no ve «Editar»: ya no es suyo para editarlo.
  await openAs(page, ALEX);
  await page.goto(search);
  await expect(row(page, name)).toBeVisible();
  await row(page, name).click();
  await expect(title(page)).toHaveText(name);
  await expect(page.getByRole("link", { name: "Editar" })).toHaveCount(0);
  await page.goto(`${ficha}/edit`);
  await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();

  // Raúl sí edita un ejercicio publicado con el mismo formulario, y guardar no cambia su estado.
  await openAs(page, RAUL);
  await page.goto(`${ficha}/edit`);
  await field(page, "Título").fill(`${name} v2`);
  await save(page, "Guardar cambios").click();
  await expect(page).toHaveURL(new RegExp(`${ficha}$`));
  await expect(title(page)).toHaveText(`${name} v2`);
  await expect(page.getByText("Borrador", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publicar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archivar" })).toBeVisible();
  const after = await db.from("drills").select("status, title").eq("id", id).single();
  expect(after.data).toEqual({ status: "published", title: `${name} v2` });
});

test("no se edita lo que no es de uno", async ({ page, browserErrors }) => {
  if (!DRAFT || !OUTLET) throw new Error("Falta el borrador o «Rebote + outlet» en el seed.");
  const draft = `${LIBRARY}/${drillId(ARCANGEL.slug, DRAFT.key)}`;
  const published = `${LIBRARY}/${drillId(ARCANGEL.slug, OUTLET.key)}`;
  const random = `${LIBRARY}/${randomUUID()}`;
  const notAnId = `${LIBRARY}/no-es-un-uuid`;
  browserErrors.allowNotFound(`${draft}/edit`, `${published}/edit`, `${random}/edit`, `${notAnId}/edit`);
  browserErrors.allowNotFound(`${LIBRARY}/new`);

  // Álex no es el autor del borrador de Irene ni dirección, y un publicado no lo edita un
  // entrenador: las cuatro respuestas son EXACTAMENTE la misma página.
  await openAs(page, ALEX);
  const texts: string[] = [];
  for (const edit of [`${draft}/edit`, `${published}/edit`, `${random}/edit`, `${notAnId}/edit`]) {
    await page.goto(edit);
    await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();
    await expect(field(page, "Título")).toHaveCount(0);
    texts.push((await page.locator("main").textContent()) ?? "");
  }
  expect(new Set(texts).size, "las cuatro respuestas son idénticas").toBe(1);
  await expect(page.locator("body")).not.toContainText(DRAFT.title);

  // Quien no es del club no entra ni al formulario de alta ni a la edición.
  await openAs(page, MARTA);
  for (const url of [`${LIBRARY}/new`, `${published}/edit`]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();
  }

  // Irene, su autora, sí edita su borrador: el formulario parte de lo guardado.
  await openAs(page, IRENE);
  await page.goto(`${draft}/edit`);
  await expect(title(page)).toHaveText("Editar ejercicio");
  await expect(field(page, "Título")).toHaveValue(DRAFT.title);
  await expect(save(page, "Guardar cambios")).toBeVisible();
  await expect(page.getByRole("link", { name: "Cancelar" })).toHaveAttribute("href", draft);
});

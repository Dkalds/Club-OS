import type { BrowserContext, Locator, Page } from "@playwright/test";
import { createAdminClient, readSupabaseEnv } from "../scripts/lib/admin-client";
import { ARCANGEL } from "../scripts/seed/data";
import { isLocalSupabaseUrl } from "../scripts/seed/guard";
import { seedId } from "../scripts/seed/ids";
import { runSeed } from "../scripts/seed/run";
import { seedNow } from "./helpers/seed";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login, cada
// test abre la app con `openAs`.
//
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts): los
// specs de Gestión de las fases siguientes modifican el seed y van aquí, en serie.
//
// Los tests de Gestión de The Way escriben: crean la sección «Plan de temporada» y la
// reordenan, lo que renumera las del seed. `restoreSeed` deja la base de datos como la dejó
// el arranque global: borra esa sección y vuelve a sembrar, que devuelve su número a las
// demás. Corre al empezar (una ejecución anterior matada a medias no puede dejar una sección
// que estorbe: la nueva se llamaría `plan-de-temporada-2`) y al acabar. Los dos toleran que
// la sección ya no esté. Con un Supabase que no es local nada se escribe: los tests que
// escriben se saltan, como en `way.spec.ts`.
test.describe.configure({ mode: "serial" });

const ALEX = "alex@arcangel.test"; // entrenador de Arcángel
const RAUL = "raul@arcangel.test"; // dirección de Arcángel

const CLUB = `/c/${ARCANGEL.slug}`;
const ADMIN = `${CLUB}/admin`;

const SECTION_TITLE = "Plan de temporada";
const SECTION_SLUG = "plan-de-temporada";

const STALE_COPY = "Alguien ha cambiado esto mientras editabas. Recarga para ver la última versión.";

const NEEDS_LOCAL_DB =
  "Escribe en la base de datos (crea y reordena secciones): solo con un Supabase local.";

/**
 * Los datos solo se escriben en un Supabase local: lanzar unos tests nunca escribe en una base
 * de datos remota (ver `e2e/global-setup.ts`). Sin `.env.local` tampoco se escribe: el arranque
 * global ya falla antes con su propio mensaje.
 */
function targetIsLocal(): boolean {
  try {
    return isLocalSupabaseUrl(readSupabaseEnv().url);
  } catch {
    return false;
  }
}

const CAN_WRITE = targetIsLocal();

async function restoreSeed(): Promise<void> {
  if (!CAN_WRITE) return;

  // Borrar no falla si la sección ya no está. Solo las de Arcángel: nunca las de otro club.
  const removed = await createAdminClient()
    .from("way_sections")
    .delete()
    .eq("organization_id", seedId(ARCANGEL.slug, "organization"))
    .like("slug", `${SECTION_SLUG}%`);
  if (removed.error) {
    throw new Error(`No se pudo borrar la sección de prueba: ${removed.error.message}`);
  }

  // Mismo instante que el arranque global: la base de datos queda como la dejó él.
  await runSeed(seedNow());
}

test.beforeAll(restoreSeed);
test.afterAll(restoreSeed);

/** El botón de la cabecera que abre el menú de cuenta: el avatar de quien ha entrado. */
function accountButton(page: Page) {
  return page.getByRole("button", { name: "Abrir menú de cuenta" });
}

function adminNav(page: Page) {
  return page.getByRole("navigation", { name: "Gestión" });
}

/** Un `<h1>`: toda pantalla tiene uno solo, y es lo que dice dónde se está. */
function title(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

/** Las filas de la lista de secciones de Gestión: un `<li>` por sección. */
function sectionRow(page: Page, sectionTitle: string) {
  return page.getByRole("main").getByRole("listitem").filter({ hasText: sectionTitle });
}

/** La fila de una sección en el índice de The Way del entrenador: un enlace. */
function indexRow(page: Page, sectionTitle: string) {
  return page.getByRole("main").getByRole("link").filter({ hasText: sectionTitle });
}

/** El campo de una etiqueta, con el nombre entero: «Título» no es «Subir Título…». */
function field(page: Page, label: string) {
  return page.getByLabel(label, { exact: true });
}

/**
 * Espera a que React haya tomado el control de un elemento que llegó ya pintado por el
 * servidor. Tras una carga completa, el botón existe antes de tener su manejador: un clic
 * en ese rato no hace nada (un envío, en cambio, enviaría el formulario a mano). React
 * marca los nodos que hidrata con una propiedad `__reactProps$…`.
 */
async function hydrated(target: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        target.evaluate((element) =>
          Object.keys(element).some((key) => key.startsWith("__reactProps$")),
        ),
      { message: "React no ha hidratado la página" },
    )
    .toBe(true);
}

/** Entra como `email` y abre la lista de secciones de Gestión, lista para usarse. */
async function openWayList(page: Page, email = RAUL): Promise<void> {
  await openAs(page, email);
  await page.goto(`${ADMIN}/way`);
  await expect(title(page)).toHaveText("The Way");
  await hydrated(page.getByRole("button", { name: "Crear sección" }));
}

/** Abre el editor de una sección por su URL, listo para usarse. */
async function openEditor(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await expect(title(page)).toHaveText("Editar sección");
  await hydrated(page.getByRole("button", { name: "Guardar cambios" }));
}

/** Anota los `console.error` y las excepciones de un contexto abierto a mano, que `test` no vigila. */
function watchConsole(context: BrowserContext): string[] {
  const seen: string[] = [];
  context.on("console", (message) => {
    if (message.type() === "error") seen.push(`console.error: ${message.text()}`);
  });
  context.on("weberror", (webError) => {
    seen.push(`excepción: ${webError.error().message}`);
  });
  return seen;
}

test("un entrenador no entra en Gestión", async ({ page, browserErrors }) => {
  await openAs(page, ALEX);
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));

  // Ni la raíz ni ninguno de los apartados, ni un editor por su id: el mismo 404 que un club
  // ajeno, con su `<main>` y sin el marco de Gestión. Chromium deja en la consola el aviso de
  // cada 404: no cuenta como error (ver `helpers/test.ts`).
  const paths = [
    ADMIN,
    `${ADMIN}/way`,
    `${ADMIN}/way/00000000-0000-4000-8000-000000000001`,
    `${ADMIN}/values`,
    `${ADMIN}/principles`,
    `${ADMIN}/standards`,
  ];
  browserErrors.allowNotFound(...paths);
  for (const path of paths) {
    const response = await page.goto(path);

    expect(response?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
    await expect(page.locator("main").getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(adminNav(page)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Volver a la app" })).toHaveCount(0);
  }

  // Y su salida lleva a su club, donde el menú de cuenta ofrece Salir y no Gestión.
  //
  // «Salir» no se pulsa aquí: con `openAs` la sesión de Álex es la guardada por el arranque
  // global, y cerrarla la dejaría muerta para el resto de la ejecución. Que «Salir» cierra la
  // sesión lo prueba `auth.spec.ts`, con un login propio.
  await page.getByRole("link", { name: "Volver a tus clubes" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));
  await accountButton(page).click();
  await expect(accountButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Gestión" })).toHaveCount(0);
});

test("dirección entra desde el avatar", async ({ page }) => {
  // El navegador no registra ningún `console.error` ni excepción en todo el recorrido: lo
  // vigila el `test` de `helpers/test.ts` en cada test.
  await openAs(page, RAUL);
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));

  // El menú está cerrado hasta que se pulsa; con él abierto, Escape lo cierra y devuelve el foco.
  await expect(accountButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("link", { name: "Gestión" })).toHaveCount(0);
  await accountButton(page).click();
  await expect(page.getByRole("link", { name: "Gestión" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(accountButton(page)).toHaveAttribute("aria-expanded", "false");
  await expect(accountButton(page)).toBeFocused();
  await expect(page.getByRole("link", { name: "Gestión" })).toHaveCount(0);

  await accountButton(page).click();
  await page.getByRole("link", { name: "Gestión" }).click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/way$`));

  // El marco de Gestión: nombre del club, kicker y salida; sin la navegación de la app.
  const banner = page.getByRole("banner");
  await expect(banner).toContainText("Arcángel");
  await expect(banner).toContainText("Gestión");
  await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "The Way" })).toBeVisible();

  // Sus apartados, con los nombres que da el club, y el actual marcado.
  const links = adminNav(page).getByRole("link");
  await expect(links).toHaveText(["The Way", "Valores", "Principios", "Arcángel Standards"]);
  await expect(links.first()).toHaveAttribute("aria-current", "page");
  await expect(adminNav(page).locator('[aria-current="page"]')).toHaveCount(1);
  await links.filter({ hasText: "Valores" }).click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/values$`));
  await expect(page.getByRole("heading", { level: 1, name: "Valores" })).toBeVisible();
  await expect(links.filter({ hasText: "Valores" })).toHaveAttribute("aria-current", "page");
  await expect(adminNav(page).locator('[aria-current="page"]')).toHaveCount(1);

  // La raíz de Gestión redirige a la metodología.
  await page.goto(ADMIN);
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/way$`));
  await expect(page.getByRole("heading", { level: 1, name: "The Way" })).toBeVisible();

  // Y «Volver a la app» lleva de vuelta a Inicio.
  await page.getByRole("link", { name: "Volver a la app" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));
  await expect(page.getByRole("navigation", { name: "Principal" })).toBeVisible();
});

test("Gestión se adapta al escritorio", async ({ page }) => {
  await openAs(page, RAUL);
  await page.goto(`${ADMIN}/way`);
  await expect(page.getByRole("heading", { level: 1, name: "The Way" })).toBeVisible();
  // La lista de las cinco secciones del seed y el formulario de debajo, ya pintados.
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "Crear sección" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const nav = adminNav(page);
  const main = page.getByRole("main");

  // A 375 px las pestañas van encima del contenido, se desplazan por dentro y la página no.
  expect(page.viewportSize()?.width).toBe(375);
  const phoneNav = await nav.boundingBox();
  const phoneMain = await main.boundingBox();
  expect(phoneNav).not.toBeNull();
  expect(phoneMain).not.toBeNull();
  expect(phoneNav!.y + phoneNav!.height).toBeLessThanOrEqual(phoneMain!.y + 1);
  expect(await nav.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  // Áreas táctiles de 44 px: pestañas y salida, y lo que se toca en la lista: sus botones y
  // enlaces y los campos del formulario de debajo.
  for (const target of [
    ...(await nav.getByRole("link").all()),
    page.getByRole("link", { name: "Volver a la app" }),
    ...(await main.getByRole("button").all()),
    ...(await main.getByRole("link").all()),
    field(page, "Título"),
    field(page, "Tipo"),
  ]) {
    const box = await target.boundingBox();
    const label = (await target.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
    expect(box?.height, `alto de «${label}»`).toBeGreaterThanOrEqual(44);
  }
  // Cada fila cabe: sus controles no se salen de la tarjeta ni de la pantalla.
  for (const row of await main.getByRole("listitem").all()) {
    const box = await row.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    for (const control of await row.getByRole("button").all()) {
      const controlBox = await control.boundingBox();
      expect(controlBox!.x + controlBox!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
    }
  }
  await page.screenshot({ path: "test-results/admin-375.png", fullPage: true });

  // A 1280×800 son una columna a la izquierda del contenido, que no pasa de su ancho máximo.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(nav).toBeVisible();
  const deskNav = await nav.boundingBox();
  const deskMain = await main.boundingBox();
  expect(deskNav).not.toBeNull();
  expect(deskMain).not.toBeNull();
  expect(deskNav!.x + deskNav!.width).toBeLessThanOrEqual(deskMain!.x + 1);
  expect(deskNav!.width).toBeCloseTo(240, 0);
  expect(deskMain!.width).toBeLessThanOrEqual(960);
  expect(await nav.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  await expect(page.getByRole("navigation", { name: "Principal" })).toHaveCount(0);
  // Y cada fila de la lista es una sola línea: lo que es y lo que se le puede hacer, lado a lado.
  for (const row of await main.getByRole("listitem").all()) {
    const box = await row.boundingBox();
    expect(box!.height, "una fila ocupa una línea").toBeLessThan(100);
    expect(box!.x + box!.width).toBeLessThanOrEqual(deskMain!.x + deskMain!.width + 1);
  }
  await page.screenshot({ path: "test-results/admin-1280.png", fullPage: true });
});

test("el editor de una sección cabe en el móvil y en el escritorio", async ({ page }) => {
  // Sin guardar nada: solo se abre una sección del seed y se mide.
  await openWayList(page);
  await sectionRow(page, "El jugador Arcángel").getByRole("link", { name: /^Editar/ }).click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/way/[0-9a-f-]{36}$`));
  await expect(title(page)).toHaveText("Editar sección");
  await expect(field(page, "Título")).toHaveValue("El jugador Arcángel");
  await expect(field(page, "Contenido")).not.toHaveValue("");
  await page.evaluate(() => document.fonts.ready);

  const main = page.getByRole("main");
  const targets = [
    field(page, "Título"),
    field(page, "Tipo"),
    page.getByRole("tab", { name: "Escribir" }),
    page.getByRole("tab", { name: "Vista previa" }),
    page.getByRole("button", { name: "Guardar cambios" }),
    page.getByRole("link", { name: "Volver", exact: true }),
  ];

  expect(page.viewportSize()?.width).toBe(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.height, `alto de ${await target.innerText().catch(() => "un campo")}`).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }

  // La vista previa pinta el Markdown con su `###` como subtítulo y deja el texto montado.
  await page.getByRole("tab", { name: "Vista previa" }).click();
  await expect(page.getByRole("tab", { name: "Vista previa" })).toHaveAttribute("aria-selected", "true");
  await expect(main.getByRole("heading", { level: 3, name: "Lo que esperamos" })).toBeVisible();
  await expect(field(page, "Contenido")).toBeHidden();
  await expect(field(page, "Contenido")).toHaveValue(/### Lo que esperamos/);
  await page.screenshot({ path: "test-results/admin-editor-preview-375.png", fullPage: true });
  await page.getByRole("tab", { name: "Escribir" }).click();
  await expect(field(page, "Contenido")).toBeVisible();
  await page.screenshot({ path: "test-results/admin-editor-375.png", fullPage: true });

  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  const box = await main.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(960);
  await page.screenshot({ path: "test-results/admin-editor-1280.png", fullPage: true });
});

test("un editor que no existe da el 404 dentro del marco de Gestión", async ({ page, browserErrors }) => {
  // Un id que no es de ninguna sección y uno que ni siquiera es un uuid: el mismo 404, pintado
  // por `admin/not-found.tsx` dentro del marco, sin quitarle a quien administra su navegación.
  // La página ya está en streaming por `loading.tsx` y responde 200; si algún día respondiera
  // 404, Chromium deja su aviso en la consola y no cuenta como error.
  const missing = [`${ADMIN}/way/00000000-0000-4000-8000-0000000000ff`, `${ADMIN}/way/no-es-un-uuid`];
  browserErrors.allowNotFound(...missing);
  await openAs(page, RAUL);

  for (const path of missing) {
    await page.goto(path);

    await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(adminNav(page)).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver a la app" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver a tus clubes" })).toHaveAttribute("href", "/select-club");
  }
  await page.screenshot({ path: "test-results/admin-404-375.png", fullPage: true });
});

test("un borrador no llega al entrenador hasta publicarlo", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);

  // Raúl crea la sección: su título y su tipo (Texto es el de por defecto).
  await openWayList(page);
  await field(page, "Título").fill(SECTION_TITLE);
  await expect(field(page, "Tipo")).toHaveValue("text");
  await page.getByRole("button", { name: "Crear sección" }).click();

  // Y se abre su editor, ya con el título.
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/way/[0-9a-f-]{36}$`));
  await expect(title(page)).toHaveText("Editar sección");
  await expect(field(page, "Título")).toHaveValue(SECTION_TITLE);

  // Guarda un cuerpo dos veces seguidas: las dos salen bien. Al tocar el texto, el aviso del
  // guardado anterior se quita, así que el segundo «Cambios guardados.» es del segundo guardado.
  const saved = page.getByText("Cambios guardados.");
  const body = field(page, "Contenido");
  await body.fill("Primera versión del plan.");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(saved).toBeVisible();

  await body.fill("Segunda versión del plan.");
  await expect(saved).toBeHidden();
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(saved).toBeVisible();

  const stored = await createAdminClient()
    .from("way_sections")
    .select("body_md, status")
    .eq("slug", SECTION_SLUG)
    .single();
  expect(stored.error).toBeNull();
  expect(stored.data).toEqual({ body_md: "Segunda versión del plan.", status: "draft" });

  // Álex no la ve: es un borrador, y su URL da el mismo 404 opaco que una que no existe.
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/way/${SECTION_SLUG}`);
  await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
  await page.goto(`${CLUB}/way`);
  await expect(title(page)).toHaveText("The Arcángel Way");
  await expect(indexRow(page, SECTION_TITLE)).toHaveCount(0);

  // Raúl la publica desde la lista, sin recargar: su estado cambia al terminar.
  await openWayList(page);
  const row = sectionRow(page, SECTION_TITLE);
  await expect(row.getByText("Borrador", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: `Publicar ${SECTION_TITLE}` }).click();
  await expect(row.getByText("Publicado", { exact: true })).toBeVisible();
  await expect(row.getByRole("button", { name: `Pasar a borrador ${SECTION_TITLE}` })).toBeVisible();

  // Ahora Álex la ve: con su número, su título y el texto que Raúl guardó.
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/way/${SECTION_SLUG}`);
  await expect(title(page)).toHaveText(SECTION_TITLE);
  await expect(page.getByRole("main").getByText("06", { exact: true })).toBeVisible();
  await expect(page.getByText("Segunda versión del plan.")).toBeVisible();
});

test("reordenar cambia el número", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);

  // «Plan de temporada» es la sexta, publicada, detrás de «Cómo competimos».
  await openWayList(page);
  const plan = sectionRow(page, SECTION_TITLE);
  const competing = sectionRow(page, "Cómo competimos");
  await expect(plan.getByText("06", { exact: true })).toBeVisible();
  await expect(competing.getByText("05", { exact: true })).toBeVisible();

  // Sube un puesto. Gestión muestra los números nuevos sin recargar la página: es lo que
  // prueba que la acción revalida la lista.
  await plan.getByRole("button", { name: `Subir ${SECTION_TITLE}` }).click();
  await expect(plan.getByText("05", { exact: true })).toBeVisible();
  await expect(competing.getByText("06", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem").nth(4)).toContainText(SECTION_TITLE);
  await expect(page.getByRole("main").getByRole("listitem").nth(5)).toContainText("Cómo competimos");

  // Y Álex ve lo mismo: el número que pinta el entrenador es el de esta posición.
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/way`);
  await expect(indexRow(page, SECTION_TITLE).getByText("05", { exact: true })).toBeVisible();
  await expect(indexRow(page, "Cómo competimos").getByText("06", { exact: true })).toBeVisible();
});

test("dos pestañas editan a la vez", async ({ page, browser }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  // Review Focus 4: dos sesiones de dirección abren el mismo editor. La que guarda segunda lo
  // hace sobre una copia vieja: se le avisa, y la base de datos se queda con el texto de la primera.
  await openWayList(page);
  await sectionRow(page, SECTION_TITLE).getByRole("link", { name: `Editar ${SECTION_TITLE}` }).click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/way/[0-9a-f-]{36}$`));
  const editor = page.url();
  await openEditor(page, editor);

  // Una segunda sesión de Raúl, en su propio contexto de navegador.
  const other = await browser.newContext();
  const otherErrors = watchConsole(other);
  try {
    const second = await other.newPage();
    await openAs(second, RAUL);
    await openEditor(second, editor);
    await expect(field(second, "Título")).toHaveValue(SECTION_TITLE);

    // La primera guarda «Versión A».
    await field(page, "Título").fill("Versión A");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Cambios guardados.")).toBeVisible();

    // La segunda guarda «Versión B» sobre la copia con que se abrió, que ya no es la última.
    await field(second, "Título").fill("Versión B");
    await second.getByRole("button", { name: "Guardar cambios" }).click();
    // `role="alert"` también lo lleva el anunciador de rutas de Next: se filtra por el texto.
    const warning = second.getByRole("alert").filter({ hasText: STALE_COPY });
    await expect(warning).toBeVisible();
    await second.screenshot({ path: "test-results/admin-stale-375.png" });
    await expect(second.getByText("Cambios guardados.")).toHaveCount(0);
    await expect(field(second, "Título")).toHaveValue("Versión B");

    // En la base de datos queda el texto de la primera.
    const stored = await createAdminClient()
      .from("way_sections")
      .select("title")
      .eq("slug", SECTION_SLUG)
      .single();
    expect(stored.error).toBeNull();
    expect(stored.data?.title).toBe("Versión A");

    // «Recargar» trae la última versión: «Versión A».
    await second.getByRole("button", { name: "Recargar" }).click();
    await expect(field(second, "Título")).toHaveValue("Versión A");
    await expect(warning).toHaveCount(0);

    // Y desde ahí se puede guardar: la copia ya es la última.
    await hydrated(second.getByRole("button", { name: "Guardar cambios" }));
    await field(second, "Título").fill("Versión C");
    await second.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(second.getByText("Cambios guardados.")).toBeVisible();
  } finally {
    await other.close();
  }
  expect(otherErrors, "la segunda sesión no debe registrar errores de consola").toEqual([]);
});

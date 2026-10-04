import type { BrowserContext, Locator, Page } from "@playwright/test";
import { createAdminClient, readSupabaseEnv } from "../scripts/lib/admin-client";
import { ARCANGEL } from "../scripts/seed/data";
import { isLocalSupabaseUrl } from "../scripts/seed/guard";
import { seedId } from "../scripts/seed/ids";
import { restoreSeed, seedNow } from "./helpers/seed";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login, cada
// test abre la app con `openAs`.
//
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts): los
// specs de Gestión de las fases siguientes modifican el seed y van aquí, en serie.
//
// Los tests de Gestión escriben. Los de The Way crean la sección «Plan de temporada» y la
// reordenan, lo que renumera las del seed; los de valores, principios y Standards editan lo
// del seed (la descripción de «RESPECT», el estado de «EFFORT», un punto más en «Defensa») y
// crean el Standard 6. `restoreSeed` (`helpers/seed.ts`) deja la base de datos como la dejó el
// arranque global: borra todo lo de la metodología que el seed no conoce (esa sección, ese
// Standard y lo que deje cualquier otro spec) y vuelve a sembrar, que devuelve su texto, su
// estado, su orden y su número a lo que el seed sí posee y quita los puntos que sobran de sus
// principios. Corre al empezar (una ejecución anterior matada a medias no puede dejar una
// sección que estorbe: la nueva se llamaría `plan-de-temporada-2`) y al acabar. Con un Supabase
// que no es local nada se escribe: los tests que escriben se saltan, como en `way.spec.ts`.
test.describe.configure({ mode: "serial" });

const ALEX = "alex@arcangel.test"; // entrenador de Arcángel
const RAUL = "raul@arcangel.test"; // dirección de Arcángel

const CLUB = `/c/${ARCANGEL.slug}`;
const ADMIN = `${CLUB}/admin`;

const ORGANIZATION_ID = seedId(ARCANGEL.slug, "organization");
/** La membresía de Raúl en su club: la que un test revoca y repone. */
const RAUL_MEMBERSHIP_ID = seedId(ARCANGEL.slug, "membership:raul");

const SECTION_TITLE = "Plan de temporada";
const SECTION_SLUG = "plan-de-temporada";

// El Standard que crean los tests: el siguiente a los cinco del seed.
const NEW_STANDARD = {
  number: 6,
  title: "TALK ON DEFENSE",
  description: "Hablamos en cada defensa.",
};

const STALE_COPY = "Alguien ha cambiado esto mientras editabas. Recarga para ver la última versión.";

const NEEDS_LOCAL_DB =
  "Escribe en la base de datos (crea, edita y reordena contenido): solo con un Supabase local.";

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

// Mismo instante que el arranque global: la base de datos queda como la dejó él.
async function restore(): Promise<void> {
  if (!CAN_WRITE) return;
  await restoreSeed(seedNow());
}

test.beforeAll(restore);
test.afterAll(restore);

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

/**
 * El campo de una etiqueta, con el nombre entero: «Título» no es «Subir Título…». Sobre una
 * página o, cuando varias cards repiten las mismas etiquetas, sobre la card o el alta que lo lleva.
 */
function field(scope: Page | Locator, label: string) {
  return scope.getByLabel(label, { exact: true });
}

/**
 * La card de un elemento de las listas de Gestión (valores, principios, Standards): el `<li>`
 * que lleva su nombre en un `<h2>`. Los puntos de un principio también son `<li>`, pero no
 * llevan ese encabezado.
 */
function itemCard(page: Page, name: string) {
  return page
    .getByRole("main")
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { level: 2, name, exact: true }) });
}

/** El alta de una lista de Gestión: su formulario, que se llama como su título («Nuevo valor»). */
function createForm(page: Page, name: string) {
  return page.getByRole("form", { name, exact: true });
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

/**
 * Entra como Raúl y abre una lista de Gestión (`values`, `principles`, `standards`), lista para
 * usarse: con su título y con el botón de alta, el último de la página, ya hidratado.
 */
async function openList(
  page: Page,
  list: "values" | "principles" | "standards",
  heading: string,
  createLabel: string,
): Promise<void> {
  await openAs(page, RAUL);
  await page.goto(`${ADMIN}/${list}`);
  await expect(title(page)).toHaveText(heading);
  await hydrated(page.getByRole("button", { name: createLabel, exact: true }));
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

/**
 * Todo lo que se toca en una lista de Gestión mide al menos 44 px de alto y cabe dentro de la
 * pantalla: botones, enlaces y campos de `<main>`. `width` es el de la ventana.
 */
async function expectTargetsFit(page: Page, width: number): Promise<void> {
  const main = page.getByRole("main");
  const targets = [
    ...(await main.getByRole("button").all()),
    ...(await main.getByRole("link").all()),
    ...(await main.locator("input, textarea, select").all()),
  ];
  expect(targets.length).toBeGreaterThan(0);

  for (const target of targets) {
    const box = await target.boundingBox();
    const label =
      (await target.innerText().catch(() => "")).replace(/\s+/g, " ").trim() ||
      (await target.getAttribute("name")) ||
      "un campo";
    expect(box, `caja de «${label}»`).not.toBeNull();
    expect(box!.height, `alto de «${label}»`).toBeGreaterThanOrEqual(44);
    expect(box!.x + box!.width, `«${label}» cabe en ${width} px`).toBeLessThanOrEqual(width + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
}

test("valores, principios y Standards caben en el móvil y en el escritorio", async ({ page }) => {
  // Solo se mide: lo que se añade a «Ataque» no se guarda.
  const lists = [
    ["values", "Valores", "Crear valor", 3],
    ["principles", "Principios", "Crear principio", 4],
    ["standards", "Arcángel Standards", "Crear Standard", 5],
  ] as const;

  for (const [list, heading, createLabel, items] of lists) {
    await openList(page, list, heading, createLabel);
    await expect(page.getByRole("main").getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("main").getByRole("listitem").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    // La lista de «Ataque» con sus puntos hasta el tope de 12: es la card más larga de Gestión.
    if (list === "principles") {
      const attack = itemCard(page, "Ataque");
      const add = attack.getByRole("button", { name: "Añadir punto", exact: true });
      await expect(attack.getByRole("listitem")).toHaveCount(6);
      for (let point = 7; point <= 12; point += 1) await add.click();
      await expect(attack.getByRole("listitem")).toHaveCount(12);
      // Con 12 ya no se ofrece otro.
      await expect(add).toHaveCount(0);
    }

    expect(page.viewportSize()?.width).toBe(375);
    await expectTargetsFit(page, 375);
    // Una card por elemento del seed, y el alta debajo, ya pintada.
    await expect(
      page.getByRole("main").getByRole("heading", { level: 2 }),
    ).toHaveCount(items + 1);
    await page.screenshot({ path: `test-results/admin-${list}-375.png`, fullPage: true });

    await page.setViewportSize({ width: 1280, height: 800 });
    const main = await page.getByRole("main").boundingBox();
    expect(main!.width).toBeLessThanOrEqual(960);
    await expectTargetsFit(page, 1280);
    await page.screenshot({ path: `test-results/admin-${list}-1280.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
  }
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

  // La confirmación se anuncia: un lector de pantalla solo lee lo que cambia dentro de una región
  // `status` que ya estaba en el árbol de accesibilidad. Antes de guardar tiene que estar ahí, vacía
  // y sin `display: none` (no cuenta cuánto mida), y seguir siendo la misma región al guardar.
  const status = page.getByRole("status");
  await expect(status).toBeAttached();
  await expect(status).toBeEmpty();
  expect(await status.evaluate((element) => getComputedStyle(element).display)).not.toBe("none");
  expect(await status.evaluate((element) => getComputedStyle(element).visibility)).toBe("visible");
  const region = await status.elementHandle();

  await body.fill("Primera versión del plan.");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(saved).toBeVisible();
  await expect(status).toContainText("Cambios guardados.");
  expect(await region!.evaluate((element, current) => element === current, await status.elementHandle())).toBe(true);

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
  // El foco no se pierde con el cambio de botón: queda en el que ocupa su lugar.
  await expect(row.getByRole("button", { name: `Pasar a borrador ${SECTION_TITLE}` })).toBeFocused();

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
  // La fila ha cambiado de sitio y quien usa el teclado sigue en su botón: puede volver a subirla.
  await expect(plan.getByRole("button", { name: `Subir ${SECTION_TITLE}` })).toBeFocused();

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

test("un número de Standard repetido se explica", async ({ page }) => {
  // No guarda nada si todo va bien, pero lo intenta: contra una base de datos que no fuera la
  // del seed crearía el Standard 3.
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);

  await openList(page, "standards", "Arcángel Standards", "Crear Standard");
  const create = createForm(page, "Nuevo Standard");
  // El alta propone el siguiente al mayor: los cinco del seed llegan al 5.
  await expect(field(create, "Número")).toHaveValue("6");

  await field(create, "Número").fill("3");
  await field(create, "Título").fill("NÚMERO REPETIDO");
  await field(create, "Descripción").fill("Esto no debe guardarse.");
  await create.getByRole("button", { name: "Crear Standard", exact: true }).click();

  // El error sale bajo «Número» y el campo lo señala; arriba, el aviso general de siempre.
  const repeated = "Ya existe un Standard con ese número.";
  await expect(create.getByText(repeated)).toBeVisible();
  await expect(field(create, "Número")).toHaveAttribute("aria-invalid", "true");
  await expect(field(create, "Número")).toHaveAccessibleDescription(repeated);
  await expect(create.getByText("Revisa los campos marcados.")).toBeVisible();
  await expect(field(create, "Título")).not.toHaveAttribute("aria-invalid");
  await page.screenshot({ path: "test-results/admin-standard-repeated-375.png", fullPage: true });

  // Lo escrito se queda para corregirlo, y no hay alta: ni en la lista ni en la base de datos.
  await expect(field(create, "Título")).toHaveValue("NÚMERO REPETIDO");
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(5);
  const stored = await createAdminClient()
    .from("standards")
    .select("number")
    .eq("organization_id", ORGANIZATION_ID);
  expect(stored.error).toBeNull();
  expect(stored.data).toHaveLength(5);
});

test("un Standard nuevo se publica", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);

  // Raúl lo crea sin tocar el número, que ya es el 6.
  await openList(page, "standards", "Arcángel Standards", "Crear Standard");
  const create = createForm(page, "Nuevo Standard");
  await field(create, "Título").fill(NEW_STANDARD.title);
  await field(create, "Descripción").fill(NEW_STANDARD.description);
  await create.getByRole("button", { name: "Crear Standard", exact: true }).click();

  // Aparece en la lista sin recargar, en borrador y con su número; y el alta queda lista para
  // el siguiente: vacía y proponiendo el 7.
  const card = itemCard(page, NEW_STANDARD.title);
  await expect(card).toBeVisible();
  await expect(card.getByText("Borrador", { exact: true })).toBeVisible();
  await expect(card.getByText("06", { exact: true })).toBeVisible();
  await expect(field(card, "Descripción")).toHaveValue(NEW_STANDARD.description);
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(6);
  await expect(field(create, "Título")).toHaveValue("");
  await expect(field(create, "Descripción")).toHaveValue("");
  await expect(field(create, "Número")).toHaveValue("7");
  await expect(create.getByRole("status")).toHaveText("Standard creado.");
  // El foco no se pierde al desactivarse el botón mientras se crea: sigue en el alta, en el
  // título, que es por donde se empieza el siguiente.
  await expect(field(create, "Título")).toBeFocused();

  // Álex no lo ve: es un borrador. Sigue con sus cinco Standards, y el índice cuenta cinco.
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/way/standards`);
  await expect(title(page)).toHaveText("Arcángel Standards");
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.locator("#standard-06")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(NEW_STANDARD.title);
  await page.goto(`${CLUB}/way`);
  await expect(indexRow(page, "Cómo competimos")).toContainText("5 Standards");

  // Raúl lo publica desde su card.
  await openList(page, "standards", "Arcángel Standards", "Crear Standard");
  await itemCard(page, NEW_STANDARD.title)
    .getByRole("button", { name: `Publicar ${NEW_STANDARD.title}` })
    .click();
  await expect(itemCard(page, NEW_STANDARD.title).getByText("Publicado", { exact: true })).toBeVisible();

  // Ahora Álex lo ve con su número y su ancla, y el índice cuenta seis.
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/way/standards#standard-06`);
  await expect(page.getByRole("article")).toHaveCount(6);
  const standard = page.locator("#standard-06");
  await expect(standard).toBeVisible();
  await expect(standard).toContainText(NEW_STANDARD.title);
  await expect(standard).toContainText(NEW_STANDARD.description);
  await page.goto(`${CLUB}/way`);
  await expect(indexRow(page, "Cómo competimos")).toContainText("6 Standards");
});

test("un punto nuevo llega a Cómo jugamos", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);

  // «Defensa» no tiene puntos en el seed: se añade el primero y se guarda.
  await openList(page, "principles", "Principios", "Crear principio");
  const card = itemCard(page, "Defensa");
  await expect(card.getByRole("group", { name: "Puntos" })).toBeVisible();
  await expect(card.getByRole("listitem")).toHaveCount(0);

  await card.getByRole("button", { name: "Añadir punto", exact: true }).click();
  // La fila nueva recibe el foco: quien escribe sigue en ella.
  const point = field(card, "Punto 1");
  await expect(point).toBeFocused();
  await point.fill("Ayuda y recupera");
  await card.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(card.getByText("Cambios guardados.")).toBeVisible();

  // Álex lo ve en la card de Defensa de Cómo jugamos, y los puntos de las demás siguen como estaban.
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/way/como-jugamos`);
  await expect(title(page)).toHaveText("Cómo jugamos");
  const defense = page.locator("#principle-defensa");
  await expect(defense).toContainText("Ayuda y recupera");
  await expect(defense.getByRole("listitem")).toHaveCount(1);
  await expect(page.locator("#principle-ataque").getByRole("listitem")).toHaveCount(6);
  await expect(page.locator("#principle-transicion").getByRole("listitem")).toHaveCount(1);
});

test("editar y archivar un valor", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);

  // Raúl cambia la descripción de «RESPECT».
  await openList(page, "values", "Valores", "Crear valor");
  const respect = itemCard(page, "RESPECT");
  await field(respect, "Descripción").fill("Respeto a todos, siempre.");
  await respect.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(respect.getByText("Cambios guardados.")).toBeVisible();

  // Álex ve la descripción nueva y no la antigua, con los tres valores.
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/way/nuestra-cultura`);
  await expect(page.getByText("Respeto a todos, siempre.")).toBeVisible();
  await expect(
    page.getByText("Respeto a compañeros, entrenadores, rivales, árbitros y mesa."),
  ).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(3);

  // Raúl pasa «EFFORT» a borrador desde su card, sin recargar: nada se borra.
  await openList(page, "values", "Valores", "Crear valor");
  const effort = itemCard(page, "EFFORT");
  await effort.getByRole("button", { name: "Pasar a borrador EFFORT" }).click();
  await expect(effort.getByText("Borrador", { exact: true })).toBeVisible();
  // El foco no se pierde con el cambio de botón.
  await expect(effort.getByRole("button", { name: "Publicar EFFORT" })).toBeFocused();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveCount(3);

  // Álex ya no ve «EFFORT» y el índice cuenta dos valores.
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/way/nuestra-cultura`);
  await expect(page.getByRole("heading", { level: 2, name: "EFFORT" })).toHaveCount(0);
  await expect(page.getByRole("main").getByRole("heading", { level: 2 })).toHaveCount(2);
  await page.goto(`${CLUB}/way`);
  await expect(indexRow(page, "Nuestra cultura")).toContainText("2 valores");
});

test("si a quien edita le quitan el acceso, al guardar ve el 404", async ({ page, browserErrors }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  // Raúl tiene un editor abierto y, mientras, deja de ser miembro del club. Al guardar, la
  // acción responde con `notFound()`: se ve el 404, no un «No se pudo guardar. Inténtalo de
  // nuevo.» que invitaría a reintentar algo que ya no va a funcionar.
  await openWayList(page);
  await page.getByRole("link", { name: /^Editar / }).first().click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/way/[0-9a-f-]{36}$`));
  const editor = new URL(page.url()).pathname;
  await openEditor(page, editor);
  // El guardado es una petición a la URL del editor y responde 404: Chromium lo anota.
  browserErrors.allowNotFound(editor);

  const db = createAdminClient();
  const setStatus = (status: "active" | "revoked") =>
    db.from("memberships").update({ status }).eq("id", RAUL_MEMBERSHIP_ID).select("id");

  const revoked = await setStatus("revoked");
  expect(revoked.error).toBeNull();
  expect(revoked.data).toHaveLength(1);
  try {
    await field(page, "Título").fill("Ya sin acceso");
    await page.getByRole("button", { name: "Guardar cambios" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
    await expect(page.getByText("No se pudo guardar. Inténtalo de nuevo.")).toHaveCount(0);
    await expect(page.getByText("Cambios guardados.")).toHaveCount(0);
  } finally {
    // Pase lo que pase, Raúl vuelve a ser miembro: el resto de specs entra con él. Si el
    // proceso muere antes de llegar aquí, el siguiente arranque global lo repone al sembrar.
    const restored = await setStatus("active");
    expect(restored.error).toBeNull();
  }
});

import type { Locator, Page } from "@playwright/test";
import { createAdminClient, readSupabaseEnv } from "../scripts/lib/admin-client";
import { readE2eTarget } from "../scripts/lib/e2e-target";
import { ARCANGEL, CLUB_DEMO } from "../scripts/seed/data";
import { isLocalSupabaseUrl } from "../scripts/seed/guard";
import { seedId } from "../scripts/seed/ids";
import { openAs } from "./helpers/sessions";
import { startSlowContentProxy } from "./helpers/slow-content";
import { expect, test } from "./helpers/test";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login, cada
// test abre la app con `openAs`.
//
// Un borrador de The Way (una sección y un Standard de Arcángel) tiene que estar en la base
// de datos para que dos de los tests signifiquen algo: RLS ya esconde los borradores a un
// entrenador, así que sin ellos «el entrenador no los ve» pasaría aunque la consulta dejara
// de filtrar por `status = 'published'`. Los crea `beforeAll` con la clave de servicio y
// los borra `afterAll`: la base de datos queda como estaba.
//
// Cada worker de Playwright ejecuta su propio `beforeAll`/`afterAll`, y con tests en
// paralelo el `afterAll` de uno borraría los borradores bajo los pies de otro (y su test
// pasaría sin comprobar nada). Por eso este archivo va en serie: un solo worker, un solo
// `beforeAll` y un solo `afterAll`, y los demás specs corren a la vez en otros workers sin
// verlos (son borradores de Arcángel y ninguno los lee). Aun así los dos son idempotentes
// (ids fijos, `upsert`, borrado por id) y toleran que las filas ya no estén: una ejecución
// anterior interrumpida no deja nada que estorbe.
test.describe.configure({ mode: "serial" });

// La pantalla se revisa siempre a 375 px, sea cual sea el proyecto de Playwright.
test.use({ viewport: { width: 375, height: 812 } });

const ALEX = "alex@arcangel.test"; // entrenador de Arcángel
const RAUL = "raul@arcangel.test"; // dirección de Arcángel
const MARTA = "marta@demo.test"; // entrenadora del otro club

const CLUB = `/c/${ARCANGEL.slug}`;
const DEMO = `/c/${CLUB_DEMO.slug}`;

// Los borradores del test: ids fijos, para que varias ejecuciones (o un `beforeAll` repetido)
// escriban siempre las mismas filas. El número de la sección y el del Standard son los más
// altos que admite la base de datos y no chocan con los del seed (1–5).
const DRAFT_SECTION = {
  id: seedId(ARCANGEL.slug, "e2e:way-draft-section"),
  slug: "borrador-e2e",
  title: "Borrador E2E",
  summary: "Resumen que un entrenador no debe ver.",
  number: 99,
};
const DRAFT_STANDARD = {
  id: seedId(ARCANGEL.slug, "e2e:way-draft-standard"),
  title: "BORRADOR E2E",
  description: "Descripción que un entrenador no debe ver.",
  number: 98,
};

/**
 * Los borradores solo se escriben en un Supabase local: lanzar unos tests nunca escribe en una
 * base de datos remota (ver `e2e/global-setup.ts`). Contra uno remoto los tests que los
 * necesitan se saltan. Sin `.env.local` tampoco se escribe: el arranque global ya falla
 * antes con su propio mensaje.
 */
function targetIsLocal(): boolean {
  try {
    return isLocalSupabaseUrl(readSupabaseEnv().url);
  } catch {
    return false;
  }
}

const CAN_WRITE_DRAFTS = targetIsLocal();

test.beforeAll(async () => {
  if (!CAN_WRITE_DRAFTS) return;

  const db = createAdminClient();
  const organizationId = seedId(ARCANGEL.slug, "organization");

  const section = await db.from("way_sections").upsert(
    {
      id: DRAFT_SECTION.id,
      organization_id: organizationId,
      number: DRAFT_SECTION.number,
      slug: DRAFT_SECTION.slug,
      title: DRAFT_SECTION.title,
      summary: DRAFT_SECTION.summary,
      body_md: "Contenido que un entrenador no debe ver.",
      content_kind: "text",
      status: "draft",
      sort: DRAFT_SECTION.number,
    },
    { onConflict: "id" },
  );
  if (section.error) throw new Error(`No se pudo crear la sección en borrador: ${section.error.message}`);

  const standard = await db.from("standards").upsert(
    {
      id: DRAFT_STANDARD.id,
      organization_id: organizationId,
      number: DRAFT_STANDARD.number,
      title: DRAFT_STANDARD.title,
      description: DRAFT_STANDARD.description,
      status: "draft",
      sort: DRAFT_STANDARD.number,
    },
    { onConflict: "id" },
  );
  if (standard.error) throw new Error(`No se pudo crear el Standard en borrador: ${standard.error.message}`);
});

test.afterAll(async () => {
  if (!CAN_WRITE_DRAFTS) return;

  // Borrar por id no falla si la fila ya no está.
  const db = createAdminClient();
  const section = await db.from("way_sections").delete().eq("id", DRAFT_SECTION.id);
  const standard = await db.from("standards").delete().eq("id", DRAFT_STANDARD.id);
  if (section.error) throw new Error(`No se pudo borrar la sección en borrador: ${section.error.message}`);
  if (standard.error) throw new Error(`No se pudo borrar el Standard en borrador: ${standard.error.message}`);
});

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Principal" });
}

/** Las filas del índice de The Way: los enlaces de `<main>`. */
function indexRows(page: Page) {
  return page.getByRole("main").getByRole("link");
}

/** Un `<h1>`: toda pantalla tiene uno solo, y es lo que dice dónde se está. */
function title(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

/** Entra como `email` y abre The Way desde la navegación, como lo haría una persona. */
async function openWay(page: Page, email: string, tab: string, club: string): Promise<void> {
  await openAs(page, email);
  await expect(page).toHaveURL(new RegExp(`${club}$`));

  await mainNav(page).getByRole("link", { name: tab }).click();
  await expect(page).toHaveURL(new RegExp(`${club}/way$`));
}

/**
 * Lo que hay en la base de datos como borrador, leído con la clave de servicio: sin esto, un
 * test de «no ve el borrador» podría pasar sin que el borrador exista.
 */
async function expectDraftsExist(): Promise<void> {
  const db = createAdminClient();
  const section = await db.from("way_sections").select("status").eq("id", DRAFT_SECTION.id);
  const standard = await db.from("standards").select("status").eq("id", DRAFT_STANDARD.id);

  expect(section.error).toBeNull();
  expect(standard.error).toBeNull();
  expect(section.data).toEqual([{ status: "draft" }]);
  expect(standard.data).toEqual([{ status: "draft" }]);
}

/** Nada del borrador, ni visible ni en lo que Next manda al navegador sin pintarlo. */
async function expectNoDraft(page: Page): Promise<void> {
  await expect(page.locator("body")).not.toContainText(/borrador e2e/i);
  await expect(page.locator("body")).not.toContainText("no debe ver");
  const html = await page.content();
  expect(html).not.toMatch(/borrador e2e/i);
  expect(html).not.toContain("no debe ver");
}

/**
 * Una ventana de 375×400: lo bastante baja como para que la página, que con los 812 px de
 * referencia casi no se desplaza, tenga que subir el destino de un ancla hasta arriba. Es
 * justo donde la cabecera fija lo taparía si el destino no dejara su margen de scroll
 * (`anchor-below-header`): con la ventana de referencia el destino queda lejos de ella y la
 * comprobación pasaría igual sin ese margen.
 */
const SHORT_VIEWPORT = { width: 375, height: 400 };

/**
 * Abre `url` con una carga completa del documento, como al recargar o abrirla en otra pestaña.
 * Ir directamente a una URL que solo se diferencia de la actual en el fragmento no recarga nada:
 * el navegador salta al ancla dentro del mismo documento, y no es lo que se quiere probar.
 */
async function hardLoad(page: Page, url: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(url);
}

/**
 * El navegador ha saltado al ancla y su destino queda por debajo de la cabecera fija: dentro
 * de la pantalla y sin que la cabecera esté encima de él. `elementFromPoint` dice qué
 * recibiría el toque en su primera línea.
 */
async function expectClearOfHeader(page: Page, target: Locator): Promise<void> {
  // Con la ventana baja el destino no puede estar a la vista sin que la página se desplace.
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

test("el entrenador recorre The Way", async ({ page }) => {
  await openWay(page, ALEX, "The Way", CLUB);

  // El Hero: el nombre de la metodología del club y, encima, su lema.
  await expect(title(page)).toHaveCount(1);
  await expect(title(page)).toHaveText("The Arcángel Way");
  await expect(page.getByText("One club. One identity. One way.")).toBeVisible();

  // Una fila por sección publicada, con su número y lo que lleva dentro.
  const rows = indexRows(page);
  await expect(rows).toHaveCount(5);
  const expected = [
    ["01", "Nuestra cultura", "3 valores"],
    ["02", "El jugador Arcángel", "Qué esperamos de cada jugador."],
    ["03", "Cómo jugamos", "4 principios"],
    ["04", "Cómo entrenamos", "Cómo son nuestras sesiones."],
    ["05", "Cómo competimos", "5 Standards"],
  ];
  for (const [index, texts] of expected.entries()) {
    for (const text of texts) await expect(rows.nth(index)).toContainText(text);
  }

  // Una sección: su número, su título, su resumen y su texto en Markdown.
  await rows.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/way/el-jugador-arcangel$`));
  await expect(title(page)).toHaveText("El jugador Arcángel");
  await expect(page.getByRole("main").getByText("02", { exact: true })).toBeVisible();
  await expect(page.getByText("Qué esperamos de cada jugador.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Lo que esperamos" })).toBeVisible();
  await expect(page.getByText("Llega puntual.")).toBeVisible();

  // Y la vuelta al índice, con el nombre que el club da a su metodología.
  await page.getByRole("main").getByRole("link", { name: "The Way", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/way$`));
  await expect(title(page)).toHaveText("The Arcángel Way");
});

test("principios y Standards", async ({ page }) => {
  await openAs(page, ALEX);

  // Una sección de principios: cada principio con sus puntos y su ancla.
  await page.goto(`${CLUB}/way/como-jugamos`);
  await expect(title(page)).toHaveText("Cómo jugamos");
  await expect(page.getByText("El balón busca al jugador más adelantado.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Transición" })).toBeVisible();
  await expect(page.locator("#principle-transicion")).toBeVisible();
  await expect(page.locator("#principle-ataque").getByRole("listitem")).toHaveCount(6);

  // La página de los Standards, con el nombre que el club les da, y su ancla `#standard-03`.
  await page.goto(`${CLUB}/way/standards#standard-03`);
  await expect(title(page)).toHaveText("Arcángel Standards");
  await expect(page.getByRole("article")).toHaveCount(5);
  const standard = page.locator("#standard-03");
  await expect(standard).toBeVisible();
  await expect(standard).toContainText("FINISH THE POSSESSION");
  // Los borradores no están entre ellos.
  await expect(page.locator("body")).not.toContainText("BORRADOR E2E");
  await expect(page.locator("#standard-98")).toHaveCount(0);

  // Y los destinos de los anclas, `#standard-NN` y `#principle-{slug}`, no los tapa la
  // cabecera fija. Se abren las URLs con el ancla puesta, con una carga completa (recargar,
  // otra pestaña, un enlace compartido): el contenido puede llegar después de que el navegador
  // haya dejado de buscar el fragmento, y es `ScrollToHash` quien lleva la página al destino.
  // Se comprueba el resultado (a la vista y bajo la cabecera), no cuándo ocurre.
  await page.setViewportSize(SHORT_VIEWPORT);
  await hardLoad(page, `${CLUB}/way/standards#standard-03`);
  await expectClearOfHeader(page, page.locator("#standard-03"));
  await hardLoad(page, `${CLUB}/way/como-jugamos#principle-transicion`);
  await expectClearOfHeader(page, page.locator("#principle-transicion"));

  // Y también se llega al ancla con la página ya pintada, como al pulsar un enlace dentro de
  // ella: ahí el salto lo hace el propio navegador y el margen de scroll deja libre la cabecera.
  await page.goto(`${CLUB}/way/como-jugamos`);
  await expect(page.locator("#principle-ataque")).toBeVisible();
  await page.goto(`${CLUB}/way/como-jugamos#principle-ataque`);
  await expectClearOfHeader(page, page.locator("#principle-ataque"));
});

test("la URL de un ancla lleva al destino aunque el contenido llegue después del esqueleto", async ({
  page,
  baseURL,
}) => {
  test.skip(readE2eTarget(process.env).remote, "Necesita un proxy delante de la app: solo con la app local.");

  // Una base de datos lenta, hecha a mano: el esqueleto de `loading.tsx` sale enseguida y el
  // contenido de la sección llega 200 ms después, ya pintado el esqueleto y antes de los 300 ms
  // con que React retrasa destapar un límite de Suspense. Es decir, con la carga ya terminada
  // cuando el contenido se ve: el navegador no vuelve a buscar el fragmento por su cuenta. Sin
  // `ScrollToHash`, la página se queda arriba.
  const proxy = await startSlowContentProxy(baseURL ?? "", {
    path: `${CLUB}/way/como-jugamos`,
    holdMs: 200,
  });
  try {
    await openAs(page, ALEX);
    await page.setViewportSize(SHORT_VIEWPORT);

    // Desde una página en blanco, para que sea una carga completa.
    await page.goto("about:blank");
    await page.goto(`${proxy.origin}${CLUB}/way/como-jugamos#principle-transicion`, {
      waitUntil: "commit",
    });

    // Primero solo el esqueleto: el contenido todavía no ha llegado.
    await expect(page.getByRole("status", { name: "Cargando" })).toBeVisible();
    await expect(page.locator("#principle-transicion")).toHaveCount(0);

    // Y cuando llega, la página está en el principio, bajo la cabecera fija.
    await expectClearOfHeader(page, page.locator("#principle-transicion"));
    await expect(page.getByRole("status", { name: "Cargando" })).toHaveCount(0);
    expect(proxy.splits(), "el proxy ha partido la respuesta de la sección").toBe(1);
  } finally {
    await proxy.close();
  }
});

test("un borrador por URL directa da el 404 opaco", async ({ page }) => {
  test.skip(!CAN_WRITE_DRAFTS, "Escribe un borrador en la base de datos: solo con un Supabase local.");
  // Review Focus 2: la base de datos ya no le da la fila a un entrenador, y aun así la
  // página no distingue un borrador de un slug que no existe.
  await expectDraftsExist();
  await openAs(page, ALEX);

  // La sección se lee dentro de la página, ya con su `loading.tsx` en camino: Next responde
  // 200 con el 404 dentro (no puede cambiar el estado de una respuesta que ya empezó a salir).
  // Lo que importa es que las dos respuestas sean la misma.
  const paths = [`${CLUB}/way/${DRAFT_SECTION.slug}`, `${CLUB}/way/no-existe`];

  const seen: Array<{ status: number | undefined; main: string }> = [];
  for (const path of paths) {
    const response = await page.goto(path);

    await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver a tus clubes" })).toHaveAttribute(
      "href",
      "/select-club",
    );
    await expectNoDraft(page);

    const main = page.getByRole("main");
    await expect(main).toContainText("No encontramos esta página");
    seen.push({ status: response?.status(), main: await main.innerText() });
  }

  // El borrador y el slug inexistente no se distinguen: mismo estado, mismo texto.
  expect(seen[0]).toEqual(seen[1]);
});

test("dirección tampoco ve los borradores en la app del entrenador", async ({ page }) => {
  test.skip(!CAN_WRITE_DRAFTS, "Escribe un borrador en la base de datos: solo con un Supabase local.");
  // Raúl administra Arcángel: RLS sí le devuelve los borradores (los edita en Gestión). The Way
  // es la vista del entrenador y solo enseña lo publicado, así que esto es lo único que falla
  // si la consulta del entrenador deja de filtrar por `status = 'published'`.
  await expectDraftsExist();
  await openAs(page, RAUL);
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));

  // El índice: sus cinco secciones, y ninguna fila para la 99.
  await page.goto(`${CLUB}/way`);
  await expect(title(page)).toHaveText("The Arcángel Way");
  await expect(indexRows(page)).toHaveCount(5);
  await expect(indexRows(page).filter({ hasText: "99" })).toHaveCount(0);
  await expectNoDraft(page);

  // Los Standards: cinco bloques, sin el 98.
  await page.goto(`${CLUB}/way/standards`);
  await expect(title(page)).toHaveText("Arcángel Standards");
  await expect(page.getByRole("article")).toHaveCount(5);
  await expect(page.locator("#standard-98")).toHaveCount(0);
  await expectNoDraft(page);

  // La sección que sí es un Standard, la de «Cómo competimos», tampoco los incluye.
  await page.goto(`${CLUB}/way/como-competimos`);
  await expect(page.getByRole("article")).toHaveCount(5);
  await expectNoDraft(page);

  // El borrador por su URL: el mismo 404 que recibe un entrenador.
  await page.goto(`${CLUB}/way/${DRAFT_SECTION.slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
  await expectNoDraft(page);
});

test("cada club ve lo suyo con su terminología", async ({ page, browserErrors }) => {
  // En Club Demo la pestaña no se llama «The Way».
  await openWay(page, MARTA, "Nuestra forma", DEMO);
  await expect(mainNav(page).getByRole("link", { name: "The Way", exact: true })).toHaveCount(0);

  await expect(title(page)).toHaveText("The Demo Way");
  await expect(indexRows(page)).toHaveCount(2);
  await expect(indexRows(page).first()).toContainText("Quiénes somos");
  // Nada del otro club: ni su metodología ni su nombre.
  await expect(page.locator("body")).not.toContainText("Nuestra cultura");
  await expect(page.locator("body")).not.toContainText("The Arcángel Way");

  // Su sección, y la vuelta con el nombre que su club le da.
  await indexRows(page).first().click();
  await expect(title(page)).toHaveText("Quiénes somos");
  await expect(page.getByText("Somos un club de barrio que")).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Nuestra forma", exact: true }),
  ).toHaveAttribute("href", `${DEMO}/way`);

  // Sus Standards, y no los del otro club.
  await page.goto(`${DEMO}/way/nuestros-standards`);
  await expect(title(page)).toHaveText("Nuestros Standards");
  await expect(page.getByText("DEFENDER JUNTOS")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("TEAM FIRST");
  // Su club no ha puesto nombre a los Standards: su página de Standards se llama «Standards»
  // y enlaza de vuelta con el nombre de su metodología.
  await page.goto(`${DEMO}/way/standards`);
  await expect(title(page)).toHaveText("Standards");
  await expect(page.getByRole("article")).toHaveCount(2);
  await expect(page.getByText("DEFENDER JUNTOS")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("TEAM FIRST");
  await expect(
    page.getByRole("main").getByRole("link", { name: "Nuestra forma", exact: true }),
  ).toHaveAttribute("href", `${DEMO}/way`);

  // Y la metodología del otro club, por su URL, es un club ajeno: el mismo 404 de siempre. Lo
  // responde el layout del club, antes de que nada salga, y Chromium deja en la consola el
  // aviso de que la página es un 404: no cuenta como error (ver `helpers/test.ts`).
  const foreign = `${CLUB}/way/como-jugamos`;
  browserErrors.allowNotFound(foreign);
  await page.goto(foreign);
  await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("El balón busca al jugador más adelantado.");
});

test("cabe en el móvil", async ({ page }) => {
  await openAs(page, ALEX);

  // El navegador no registra ningún `console.error` ni excepción en todo el recorrido: lo
  // vigila el `test` de `helpers/test.ts` en cada test.
  for (const path of [`${CLUB}/way`, `${CLUB}/way/el-jugador-arcangel`]) {
    await page.goto(path);
    await expect(title(page)).toHaveCount(1);

    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(widths.viewport, path).toBe(375);
    expect(widths.scroll, path).toBeLessThanOrEqual(375);

    // Cada fila o enlace de la pantalla se puede tocar con el dedo: 44 px como mínimo.
    const links = page.getByRole("main").getByRole("link");
    const count = await links.count();
    expect(count, path).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await links.nth(index).boundingBox();
      expect(box?.height ?? 0, `${path}: enlace ${index + 1}`).toBeGreaterThanOrEqual(44);
    }
  }
});

import type { Locator, Page } from "@playwright/test";
import { createAdminClient } from "../scripts/lib/admin-client";
import { ARCANGEL, CLUB_DEMO } from "../scripts/seed/data";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";
import { CAN_WRITE, CLUB, expectFitsMobile, expectTouchTargets, field, hydrated, title } from "./helpers/train";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login.
//
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts) porque
// ESCRIBE: desde Gestión crea una categoría, un equipo, personas y temporadas, todo con «E2E»
// en el nombre. `cleanUp` borra con la clave de servicio lo que lleve esa marca, al empezar (una
// ejecución anterior matada a medias no estorba) y al acabar: `restoreSeed` no conoce estas
// tablas. Un test marca otra temporada como actual y vuelve a marcar la del seed; por si se
// queda a medias, `cleanUp` le devuelve la marca antes de borrar nada: los demás specs cuentan
// con ella. Con un Supabase que no es local nada se escribe: los tests que escriben se saltan.
test.describe.configure({ mode: "serial" });

const ALEX = "alex@arcangel.test"; // entrenador de Arcángel
const RAUL = "raul@arcangel.test"; // dirección de Arcángel
const MARTA = "marta@demo.test"; // entrenadora de Club Demo

const ADMIN = `${CLUB}/admin`;
const NEEDS_LOCAL_DB = "Escribe en la base de datos (crea equipos, personas y temporadas): solo con un Supabase local.";
const NOT_FOUND = "No encontramos esta página";

const CATEGORY = "E2E Cadete";
const TEAM = "E2E Cadete A";
const LAST_NAME = "E2E Uno";
const PLAYER = `${LAST_NAME}, Prueba`;
const SEED_SEASON = "2026/27";
const SEASON_COPY = "E2E 2031/32";
const SEASON_EMPTY = "E2E 2032/33";

/** Borra todo lo que estos tests crean: lo que lleva «E2E» en el nombre, en el club del seed. */
async function cleanUp(): Promise<void> {
  if (!CAN_WRITE) return;

  const db = createAdminClient();
  const org = await db.from("organizations").select("id").eq("slug", ARCANGEL.slug).single();
  if (org.error) throw org.error;
  const orgId = org.data.id;

  const seasons = await db.from("seasons").select("id").eq("organization_id", orgId).like("name", "E2E%");
  if (seasons.error) throw seasons.error;
  const seasonIds = seasons.data.map((season) => season.id);

  // La temporada actual vuelve a ser la del seed, pase lo que pase en el test que la cambia.
  const unmark = await db.from("seasons").update({ is_current: false }).in("id", seasonIds);
  if (unmark.error) throw unmark.error;
  const mark = await db
    .from("seasons")
    .update({ is_current: true })
    .eq("organization_id", orgId)
    .eq("name", SEED_SEASON);
  if (mark.error) throw mark.error;

  // Los equipos con la marca y los que se copiaron a una temporada con la marca.
  const named = await db.from("teams").select("id").eq("organization_id", orgId).like("name", "E2E%");
  if (named.error) throw named.error;
  const copied = await db.from("teams").select("id").eq("organization_id", orgId).in("season_id", seasonIds);
  if (copied.error) throw copied.error;
  const teamIds = [...named.data, ...copied.data].map((team) => team.id);

  const people = await db.from("people").select("id").eq("organization_id", orgId).like("last_name", "E2E%");
  if (people.error) throw people.error;
  const personIds = people.data.map((person) => person.id);

  const steps = [
    db.from("team_players").delete().in("team_id", teamIds),
    db.from("team_staff").delete().in("team_id", teamIds),
    db.from("team_players").delete().in("person_id", personIds),
    db.from("team_staff").delete().in("person_id", personIds),
    db.from("teams").delete().in("id", teamIds),
    db.from("seasons").delete().in("id", seasonIds),
    db.from("categories").delete().eq("organization_id", orgId).like("name", "E2E%"),
    db.from("people").delete().in("id", personIds),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) throw error;
  }
}

test.beforeAll(cleanUp);
test.afterAll(cleanUp);

function button(scope: Page | Locator, name: string): Locator {
  return scope.getByRole("button", { name, exact: true });
}

/** El formulario de un alta de Gestión, que se llama como su encabezado. */
function form(page: Page, name: string): Locator {
  return page.getByRole("form", { name });
}

/** El bloque que encabeza un `<h3>`: el alta de la plantilla o del cuerpo técnico. */
function block(page: Page, heading: string): Locator {
  return page.getByRole("heading", { level: 3, name: heading, exact: true }).locator("xpath=..");
}

test("la raíz de Gestión es la temporada actual, con sus equipos", async ({ page }) => {
  await openAs(page, RAUL);
  await page.goto(ADMIN);

  await expect(page).toHaveURL(new RegExp(`${ADMIN}/season$`));
  await expect(title(page)).toHaveText("Temporada");
  const nav = page.getByRole("navigation", { name: "Gestión" });
  await expect(nav.getByRole("link", { name: "Temporada" })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Personas" })).toBeVisible();

  // La temporada actual del seed, marcada, con sus equipos y lo que tiene cada uno.
  const season = page.getByRole("region", { name: "Temporada 2026/27" });
  await expect(season.getByText("Actual", { exact: true })).toBeVisible();
  await expect(season.getByText("1 sep 2026 – 30 jun 2027")).toBeVisible();
  // A la actual no se le ofrece ni marcarla ni borrarla.
  await expect(button(page, "Marcar como actual")).toHaveCount(0);
  await expect(button(page, "Borrar temporada")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Alevín A/ })).toBeVisible();

  await expectTouchTargets(page.getByRole("main").locator("a:visible, button:visible"));
  await expectFitsMobile(page);
});

test("la dirección crea una categoría y un equipo, y le monta la plantilla y el cuerpo técnico", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await openAs(page, RAUL);
  await page.goto(`${ADMIN}/season/categories`);
  await expect(title(page)).toHaveText("Categorías");

  // Una categoría: «Sub 16» se guarda como U16.
  const newCategory = form(page, "Nueva categoría");
  await hydrated(button(newCategory, "Crear categoría"));
  await field(newCategory, "Nombre").fill(CATEGORY);
  await field(newCategory, "Edad (sub)").fill("16");
  await button(newCategory, "Crear categoría").click();
  await expect(newCategory.getByRole("status")).toHaveText("Categoría creada.");
  await expect(page.getByRole("heading", { level: 2, name: CATEGORY, exact: true })).toBeVisible();

  // Otra con el mismo nombre, en mayúsculas: no entra, y lo dice su campo.
  await field(newCategory, "Nombre").fill(CATEGORY.toUpperCase());
  await field(newCategory, "Edad (sub)").fill("16");
  await button(newCategory, "Crear categoría").click();
  await expect(newCategory.getByText("Ya hay una categoría con ese nombre.")).toBeVisible();

  // Un equipo de esa categoría en la temporada actual: lleva a su página.
  await page.getByRole("link", { name: "Temporada", exact: true }).first().click();
  const newTeam = form(page, "Nuevo equipo");
  await hydrated(button(newTeam, "Crear equipo"));
  await field(newTeam, "Nombre").fill(TEAM);
  await field(newTeam, "Categoría").selectOption({ label: CATEGORY });
  await button(newTeam, "Crear equipo").click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/teams/[0-9a-f-]{36}$`));
  await expect(title(page)).toHaveText(TEAM);
  await expect(page.getByText("Aún no hay nadie en la plantilla.")).toBeVisible();

  // Un jugador nuevo, dado de alta aquí mismo: solo su año de nacimiento.
  const addNew = block(page, "Dar de alta a alguien nuevo");
  await hydrated(button(addNew, "Dar de alta y añadir"));
  await field(addNew, "Nombre").fill("Prueba");
  await field(addNew, "Apellidos").fill(LAST_NAME);
  await field(addNew, "Año de nacimiento (opcional)").fill("2011");
  await field(addNew, "Dorsal (opcional)").fill("7");
  await field(addNew, "Posición (opcional)").fill("Base");
  await button(addNew, "Dar de alta y añadir").click();
  await expect(addNew.getByRole("status")).toHaveText("Dado de alta y añadido a la plantilla.");
  const row = page.locator("summary", { hasText: PLAYER });
  await expect(row).toContainText("7");
  await expect(row).toContainText("Base · 2011");

  // Otro con el mismo dorsal: no entra, y no queda una persona suelta.
  await field(addNew, "Nombre").fill("Prueba");
  await field(addNew, "Apellidos").fill("E2E Dos");
  await field(addNew, "Dorsal (opcional)").fill("7");
  await button(addNew, "Dar de alta y añadir").click();
  await expect(addNew.getByText("Ese dorsal ya lo lleva otra persona del equipo.")).toBeVisible();
  const loose = await createAdminClient().from("people").select("id").eq("last_name", "E2E Dos");
  expect(loose.data).toHaveLength(0);

  // Una entrenadora del club, al cuerpo técnico: se busca sin tildes.
  const addStaff = block(page, "Añadir al cuerpo técnico");
  await button(addStaff, "Añadir").click();
  await expect(addStaff.getByText("Elige a una persona.")).toBeVisible();
  await field(addStaff, "Persona").fill("nora gil");
  await button(addStaff, "Gil, Nora").click();
  await field(addStaff, "Papel").selectOption({ label: "Ayudante" });
  await button(addStaff, "Añadir").click();
  await expect(addStaff.getByRole("status")).toHaveText("Añadido al cuerpo técnico.");
  await expect(field(page, "Papel de Nora Gil")).toHaveValue("assistant");

  // Su papel se cambia al elegir otro, sin botón, y lo dice.
  await field(page, "Papel de Nora Gil").selectOption({ label: "Entrenador principal" });
  await expect(page.getByText("Papel guardado.")).toBeVisible();

  // Alguien que ya está en el club (juega en otro equipo), a la plantilla; y luego se le cambia
  // la posición.
  const addExisting = block(page, "Añadir a alguien del club");
  await field(addExisting, "Persona").fill("serrano");
  // El resultado lleva también su año de nacimiento.
  await addExisting.getByRole("button", { name: /^Serrano, Hugo/ }).click();
  // Elegida la persona, el foco no se pierde: queda en «Cambiar».
  await expect(button(addExisting, "Cambiar")).toBeFocused();
  await field(addExisting, "Dorsal (opcional)").fill("9");
  await button(addExisting, "Añadir a la plantilla").click();
  await expect(addExisting.getByRole("status")).toHaveText("Añadido a la plantilla.");
  const hugo = page.locator("li", { has: page.locator("summary", { hasText: "Serrano, Hugo" }) });
  await hugo.locator("summary").click();
  await field(hugo, "Posición (opcional)").fill("Escolta");
  await button(hugo, "Guardar").click();
  await expect(hugo.getByRole("status")).toHaveText("Cambios guardados.");
  await expect(hugo.locator("summary")).toContainText("Escolta");

  // Todo a un dedo y sin ensanchar el móvil, con la plantilla desplegada.
  await row.click();
  await expectTouchTargets(page.getByRole("main").locator("a:visible, button:visible, summary:visible"));
  await expectFitsMobile(page);

  // En la temporada, el equipo dice lo que tiene.
  await page.getByRole("link", { name: "Temporada 2026/27" }).click();
  await expect(page.getByRole("link", { name: new RegExp(`^${TEAM}`) })).toContainText(
    "2 jugadores · 1 técnico",
  );
});

test("personas: buscar, editar, y archivar solo a quien ya no está en un equipo", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await openAs(page, RAUL);
  await page.goto(`${ADMIN}/people`);
  await expect(title(page)).toHaveText("Personas");

  // El buscador no distingue tildes ni mayúsculas.
  const search = field(page, "Buscar");
  await hydrated(button(page, "Archivadas"));
  await search.fill("alex prieto");
  await expect(page.getByRole("link", { name: /^Prieto, Álex/ })).toBeVisible();
  await search.fill("e2e uno");
  await expect(page.getByText("1 persona", { exact: true })).toBeVisible();
  const person = page.getByRole("link", { name: new RegExp(`^${PLAYER}`) });
  await expect(person).toContainText(TEAM);
  await expectFitsMobile(page);

  await person.click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/people/[0-9a-f-]{36}$`));
  await expect(title(page)).toHaveText("Prueba E2E Uno");
  await expect(page.getByText("No tiene acceso a la app.")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`^${TEAM}`) })).toContainText("En la plantilla · 2026/27");

  const personUrl = page.url();

  // Editar: solo el año, nunca la fecha completa.
  await hydrated(button(page, "Guardar"));
  await field(page, "Año de nacimiento (opcional)").fill("2010");
  await button(page, "Guardar").click();
  await expect(page.getByText("Cambios guardados.")).toBeVisible();

  // Sigue en un equipo de esta temporada: no se archiva.
  await button(page, "Archivar").click();
  await page.getByRole("alertdialog", { name: "¿Archivar a Prueba E2E Uno?" }).getByRole("button", { name: "Archivar" }).click();
  await expect(
    page.getByText("Sigue en un equipo de la temporada actual o de una que no ha acabado. Quítala antes de ese equipo."),
  ).toBeVisible();

  // Se la quita del equipo, y entonces sí.
  await page.getByRole("link", { name: new RegExp(`^${TEAM}`) }).click();
  await expect(title(page)).toHaveText(TEAM);
  await page.locator("summary", { hasText: PLAYER }).click();
  await button(page, "Quitar a Prueba E2E Uno de la plantilla").click();
  await page
    .getByRole("alertdialog", { name: "¿Quitar a Prueba E2E Uno de la plantilla?" })
    .getByRole("button", { name: "Quitar" })
    .click();
  await expect(page.locator("summary", { hasText: PLAYER })).toHaveCount(0);
  await expect(page.locator("summary", { hasText: "Serrano, Hugo" })).toBeVisible();

  await page.goto(personUrl);
  await expect(title(page)).toHaveText("Prueba E2E Uno");
  await hydrated(button(page, "Archivar"));
  await button(page, "Archivar").click();
  await page.getByRole("alertdialog", { name: "¿Archivar a Prueba E2E Uno?" }).getByRole("button", { name: "Archivar" }).click();
  await expect(page.getByText("Archivada", { exact: true })).toBeVisible();
  await expect(button(page, "Recuperar")).toBeVisible();

  // Sale de la lista del club y está en las archivadas.
  await page.getByRole("link", { name: "Personas", exact: true }).first().click();
  await hydrated(button(page, "Archivadas"));
  await field(page, "Buscar").fill("e2e uno");
  await expect(page.getByText("Nadie con ese nombre.")).toBeVisible();
  await button(page, "Archivadas").click();
  await expect(page.getByRole("link", { name: new RegExp(`^${PLAYER}`) })).toBeVisible();

  // Una persona nueva, desde Personas: lleva a su ficha. Sin equipo se archiva, y se recupera.
  const newPerson = form(page, "Nueva persona");
  await field(newPerson, "Nombre").fill("Prueba");
  await field(newPerson, "Apellidos").fill("E2E Tres");
  await button(newPerson, "Dar de alta").click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/people/[0-9a-f-]{36}$`));
  await expect(title(page)).toHaveText("Prueba E2E Tres");
  await expect(page.getByText("No está en ningún equipo.", { exact: false })).toBeVisible();
  await hydrated(button(page, "Archivar"));
  await button(page, "Archivar").click();
  await page.getByRole("alertdialog", { name: "¿Archivar a Prueba E2E Tres?" }).getByRole("button", { name: "Archivar" }).click();
  await expect(page.getByText("Archivada", { exact: true })).toBeVisible();
  await button(page, "Recuperar").click();
  await expect(page.getByText("Archivada", { exact: true })).toHaveCount(0);
  await expect(button(page, "Archivar")).toBeVisible();
});

test("un equipo sin actividad se borra; uno con sesiones, no", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await openAs(page, RAUL);
  await page.goto(`${ADMIN}/season`);

  // El del seed tiene sesiones y partidos: no se borra, y dice por qué.
  await page.getByRole("link", { name: /^Alevín A/ }).click();
  await expect(title(page)).toHaveText("Alevín A");
  await hydrated(button(page, "Borrar equipo"));
  await button(page, "Borrar equipo").click();
  await page.getByRole("alertdialog", { name: "¿Borrar el equipo Alevín A?" }).getByRole("button", { name: "Borrar equipo" }).click();
  await expect(page.getByText(/ya tiene actividad .* y no se puede borrar/)).toBeVisible();
  // Su plantilla sigue entera.
  await expect(page.locator("summary", { hasText: "Serrano, Hugo" })).toBeVisible();

  // El de estos tests, con su entrenadora dentro, sí: vuelve a su temporada y ya no está.
  await page.getByRole("link", { name: "Temporada 2026/27" }).click();
  await page.getByRole("link", { name: new RegExp(`^${TEAM}`) }).click();
  await hydrated(button(page, "Borrar equipo"));
  await button(page, "Borrar equipo").click();
  await page.getByRole("alertdialog", { name: `¿Borrar el equipo ${TEAM}?` }).getByRole("button", { name: "Borrar equipo" }).click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/season/[0-9a-f-]{36}$`));
  await expect(page.getByRole("link", { name: new RegExp(`^${TEAM}`) })).toHaveCount(0);

  // La entrenadora sigue en el club.
  const nora = await createAdminClient().from("people").select("id").eq("first_name", "Nora").eq("last_name", "Gil");
  expect(nora.data).toHaveLength(1);

  // Su categoría ya no la lleva ningún equipo: se edita y, ahora sí, se borra.
  await page.getByRole("link", { name: "Categorías" }).click();
  await expect(title(page)).toHaveText("Categorías");
  const card = page.locator("li", { has: page.getByRole("heading", { level: 2, name: CATEGORY, exact: true }) });
  await hydrated(button(card, "Guardar"));
  await field(card, "Edad (sub)").fill("17");
  await button(card, "Guardar").click();
  await expect(card.getByRole("status")).toHaveText("Cambios guardados.");
  await expect(card.getByText("Sub 17")).toBeVisible();
  await button(card, "Borrar categoría").click();
  await page
    .getByRole("alertdialog", { name: `¿Borrar la categoría ${CATEGORY}?` })
    .getByRole("button", { name: "Borrar categoría" })
    .click();
  await expect(page.getByRole("heading", { level: 2, name: CATEGORY, exact: true })).toHaveCount(0);
  // Una que sí lleva algún equipo no ofrece borrarla.
  const used = page.locator("li", { has: page.getByRole("heading", { level: 2, name: "Alevín", exact: true }) });
  await expect(used.getByText("La lleva algún equipo: no se puede borrar.")).toBeVisible();
  await expect(button(used, "Borrar categoría")).toHaveCount(0);
});

test("una temporada nueva puede nacer con los equipos de otra; vacía, se borra", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await openAs(page, RAUL);
  await page.goto(`${ADMIN}/season`);

  // Con los equipos de la actual: mismo nombre y categoría, vacíos. No nace actual.
  const newSeason = form(page, "Nueva temporada");
  await hydrated(button(newSeason, "Crear temporada"));
  await field(newSeason, "Nombre").fill(SEASON_COPY);
  await field(newSeason, "Inicio").fill("2031-09-01");
  await field(newSeason, "Fin").fill("2031-06-30");
  await button(newSeason, "Crear temporada").click();
  await expect(newSeason.getByText("El fin tiene que ser posterior al inicio.")).toBeVisible();
  await field(newSeason, "Fin").fill("2032-06-30");
  await field(newSeason, "Copiar equipos de").selectOption({ label: "2026/27" });
  await button(newSeason, "Crear temporada").click();

  await expect(page).toHaveURL(new RegExp(`${ADMIN}/season/[0-9a-f-]{36}$`));
  const season = page.getByRole("region", { name: `Temporada ${SEASON_COPY}` });
  await expect(season.getByText("1 sep 2031 – 30 jun 2032")).toBeVisible();
  await expect(season.getByText("Actual", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Alevín A/ })).toContainText("0 jugadores · 0 técnicos");
  // Con equipos se puede marcar como actual, no borrar.
  await expect(button(page, "Marcar como actual")).toBeVisible();
  await expect(button(page, "Borrar temporada")).toHaveCount(0);
  // La app sigue en la temporada de siempre.
  const seasons = page.getByRole("navigation", { name: "Temporadas" });
  await expect(seasons.getByRole("link", { name: /^2026\/27/ })).toContainText("Actual");
  await expectFitsMobile(page);

  // «Marcar como actual», con su confirmación: pasa a serlo, lo dice, y la otra deja de serlo.
  await hydrated(button(page, "Marcar como actual"));
  await button(page, "Marcar como actual").click();
  await page
    .getByRole("alertdialog", { name: `¿Marcar ${SEASON_COPY} como la temporada actual?` })
    .getByRole("button", { name: "Marcar como actual" })
    .click();
  await expect(page.getByText("Ya es la temporada actual.")).toBeVisible();
  await expect(season.getByText("Actual", { exact: true })).toBeVisible();
  await expect(seasons.getByRole("link", { name: /^2026\/27/ })).not.toContainText("Actual");
  // Y lo que ve el club en la app son ya sus equipos: los copiados, vacíos.
  const current = await createAdminClient().from("seasons").select("name").eq("is_current", true).like("name", "E2E%");
  expect(current.data).toEqual([{ name: SEASON_COPY }]);

  // De vuelta a la del seed, que es con la que cuentan los demás tests.
  await seasons.getByRole("link", { name: /^2026\/27/ }).click();
  await expect(page.getByRole("region", { name: `Temporada ${SEED_SEASON}` })).toBeVisible();
  await hydrated(button(page, "Marcar como actual"));
  await button(page, "Marcar como actual").click();
  await page
    .getByRole("alertdialog", { name: `¿Marcar ${SEED_SEASON} como la temporada actual?` })
    .getByRole("button", { name: "Marcar como actual" })
    .click();
  await expect(page.getByText("Ya es la temporada actual.")).toBeVisible();
  await page.getByRole("navigation", { name: "Temporadas" }).getByRole("link", { name: new RegExp(`^${SEASON_COPY}`) }).click();
  await expect(page.getByRole("region", { name: `Temporada ${SEASON_COPY}` })).toBeVisible();

  // Una vacía: se borra, y vuelve a la actual.
  const another = form(page, "Nueva temporada");
  await hydrated(button(another, "Crear temporada"));
  await field(another, "Nombre").fill(SEASON_EMPTY);
  await field(another, "Inicio").fill("2032-09-01");
  await field(another, "Fin").fill("2033-06-30");
  await button(another, "Crear temporada").click();
  await expect(page.getByRole("region", { name: `Temporada ${SEASON_EMPTY}` })).toBeVisible();
  await expect(page.getByText("Esta temporada aún no tiene equipos.")).toBeVisible();

  await hydrated(button(page, "Borrar temporada"));
  await button(page, "Borrar temporada").click();
  await page
    .getByRole("alertdialog", { name: `¿Borrar la temporada ${SEASON_EMPTY}?` })
    .getByRole("button", { name: "Borrar temporada" })
    .click();
  await expect(page).toHaveURL(new RegExp(`${ADMIN}/season$`));
  await expect(page.getByRole("region", { name: "Temporada 2026/27" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Temporadas" }).getByRole("link", { name: SEASON_EMPTY })).toHaveCount(0);
});

test("solo la dirección de un club entra en su estructura", async ({ page, browserErrors }) => {
  const db = createAdminClient();
  const arcangel = await db.from("organizations").select("id").eq("slug", ARCANGEL.slug).single();
  const demo = await db.from("organizations").select("id").eq("slug", CLUB_DEMO.slug).single();
  if (arcangel.error) throw arcangel.error;
  if (demo.error) throw demo.error;
  const ours = await db.from("teams").select("id").eq("organization_id", arcangel.data.id).eq("name", "Alevín A").limit(1).single();
  const theirs = await db.from("teams").select("id").eq("organization_id", demo.data.id).limit(1).single();
  const person = await db.from("people").select("id").eq("organization_id", demo.data.id).limit(1).single();
  if (ours.error) throw ours.error;
  if (theirs.error) throw theirs.error;
  if (person.error) throw person.error;

  // Chromium deja en la consola el aviso de cada 404: aquí es lo que se comprueba.
  const closed = ["season", "season/categories", "people", `teams/${ours.data.id}`].map((path) => `${ADMIN}/${path}`);
  const foreign = [`${ADMIN}/teams/${theirs.data.id}`, `${ADMIN}/people/${person.data.id}`];
  browserErrors.allowNotFound(...closed, ...foreign);

  // Quien entrena en el club, ni en su propio equipo.
  await openAs(page, ALEX);
  for (const path of closed) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();
  }

  // Alguien de otro club.
  await openAs(page, MARTA);
  await page.goto(`${ADMIN}/people`);
  await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();

  // La dirección, con un equipo y una persona de otro club bajo la URL del suyo.
  await openAs(page, RAUL);
  for (const path of foreign) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();
  }
  await page.goto(`${ADMIN}/teams/${ours.data.id}`);
  await expect(title(page)).toHaveText("Alevín A");
});

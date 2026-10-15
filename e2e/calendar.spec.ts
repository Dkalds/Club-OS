import type { Locator, Page } from "@playwright/test";
import { createAdminClient } from "../scripts/lib/admin-client";
import { ARCANGEL } from "../scripts/seed/data";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";
import { CAN_WRITE, CLUB, expectFitsMobile, expectTouchTargets, field, hydrated, title, TZ } from "./helpers/train";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login.
//
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts) porque
// ESCRIBE: desde Gestión crea una pista y un horario semanal, que crea decenas de
// entrenamientos; los mueve, cancela uno y quita el horario. Para no tocar los equipos del
// seed, todo pasa en un equipo propio, «E2E Calendario», que `setUp` crea con la clave de
// servicio en la temporada actual y con Álex de entrenador. `cleanUp` borra el equipo con todo
// lo suyo y las pistas con «E2E» en el nombre, al empezar (una ejecución anterior matada a
// medias no estorba) y al acabar. Con un Supabase que no es local nada se escribe: los tests que
// escriben se saltan.
test.describe.configure({ mode: "serial" });

const ALEX = "alex@arcangel.test"; // entrenador de Arcángel: cuerpo técnico del equipo de estos tests
const RAUL = "raul@arcangel.test"; // dirección de Arcángel

const ADMIN = `${CLUB}/admin`;
const NEEDS_LOCAL_DB = "Escribe en la base de datos (crea pistas, horarios y entrenamientos): solo con un Supabase local.";
const NOT_FOUND = "No encontramos esta página";

const CATEGORY = "E2E Calendario";
const TEAM = "E2E Calendario";
const VENUE = "E2E Pista";

let teamId = "";

async function arcangelId(): Promise<string> {
  const org = await createAdminClient().from("organizations").select("id").eq("slug", ARCANGEL.slug).single();
  if (org.error) throw org.error;
  return org.data.id;
}

/** Borra el equipo de estos tests con todo lo suyo, su categoría y las pistas con la marca. */
async function cleanUp(): Promise<void> {
  if (!CAN_WRITE) return;

  const db = createAdminClient();
  const orgId = await arcangelId();

  const teams = await db.from("teams").select("id").eq("organization_id", orgId).eq("name", TEAM);
  if (teams.error) throw teams.error;
  const teamIds = teams.data.map((team) => team.id);
  const events = await db.from("events").select("id").in("team_id", teamIds);
  if (events.error) throw events.error;
  const eventIds = events.data.map((event) => event.id);
  const plans = await db.from("practice_plans").select("id").in("event_id", eventIds);
  if (plans.error) throw plans.error;

  const steps = [
    db.from("practice_items").delete().in(
      "plan_id",
      plans.data.map((plan) => plan.id),
    ),
    db.from("practice_plans").delete().in("event_id", eventIds),
    // Sus cambios (`event_changes`) se van con cada evento.
    db.from("events").delete().in("id", eventIds),
    db.from("team_schedules").delete().in("team_id", teamIds),
    db.from("team_staff").delete().in("team_id", teamIds),
    db.from("teams").delete().in("id", teamIds),
    db.from("categories").delete().eq("organization_id", orgId).eq("name", CATEGORY),
    db.from("venues").delete().eq("organization_id", orgId).like("name", "E2E%"),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) throw error;
  }
}

/** El equipo de estos tests: en la temporada actual, sin eventos, con Álex de entrenador principal. */
async function setUp(): Promise<void> {
  await cleanUp();
  if (!CAN_WRITE) return;

  const db = createAdminClient();
  const orgId = await arcangelId();
  const season = await db.from("seasons").select("id").eq("organization_id", orgId).eq("is_current", true).single();
  if (season.error) throw season.error;
  const alex = await db
    .from("people")
    .select("id")
    .eq("organization_id", orgId)
    .eq("first_name", "Álex")
    .eq("last_name", "Prieto")
    .single();
  if (alex.error) throw alex.error;

  const category = await db
    .from("categories")
    .insert({ organization_id: orgId, name: CATEGORY, age_band: "U16", sort: 900 })
    .select("id")
    .single();
  if (category.error) throw category.error;
  const team = await db
    .from("teams")
    .insert({ organization_id: orgId, season_id: season.data.id, category_id: category.data.id, name: TEAM })
    .select("id")
    .single();
  if (team.error) throw team.error;
  teamId = team.data.id;

  const staff = await db
    .from("team_staff")
    .insert({ organization_id: orgId, team_id: teamId, person_id: alex.data.id, staff_role: "head_coach" });
  if (staff.error) throw staff.error;
}

test.beforeAll(setUp);
test.afterAll(cleanUp);

function button(scope: Page | Locator, name: string): Locator {
  return scope.getByRole("button", { name, exact: true });
}

/** El bloque que encabeza un `<h3>`: el alta de un horario. */
function block(page: Page, heading: string): Locator {
  return page.getByRole("heading", { level: 3, name: heading, exact: true }).locator("xpath=..");
}

/** La hora del reloj del club de un instante: «17:30». */
function clubTime(iso: string): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );
}

/** Los entrenamientos del equipo de estos tests, por inicio. */
async function teamEvents() {
  const events = await createAdminClient()
    .from("events")
    .select("id, starts_at, ends_at, status, location, venue_id, schedule_id")
    .eq("team_id", teamId)
    .order("starts_at");
  if (events.error) throw events.error;
  return events.data;
}

let created = 0;

test("la dirección crea una pista y un horario, y se crean los entrenamientos de la temporada", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await openAs(page, RAUL);
  await page.goto(`${ADMIN}/calendar`);
  await expect(title(page)).toHaveText("Calendario");
  await expect(page.getByRole("navigation", { name: "Gestión" }).getByRole("link", { name: "Calendario" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Una pista del club.
  const newVenue = page.getByRole("form", { name: "Nueva pista" });
  await hydrated(button(newVenue, "Crear pista"));
  await field(newVenue, "Nombre").fill(VENUE);
  await button(newVenue, "Crear pista").click();
  await expect(newVenue.getByRole("status")).toHaveText("Pista creada.");
  await expect(page.getByRole("heading", { level: 3, name: VENUE, exact: true })).toBeVisible();

  // El equipo aún no tiene horario: se le pone en su página.
  const row = page.getByRole("link", { name: new RegExp(`^${TEAM}`) });
  await expect(row).toContainText("Sin horario");
  await expectTouchTargets(page.getByRole("main").locator("a:visible, button:visible"));
  await expectFitsMobile(page);
  await row.click();
  await expect(title(page)).toHaveText(TEAM);
  await expect(page.getByText("Aún no tiene horarios.", { exact: false })).toBeVisible();

  // Los miércoles a las 17:30, una hora, en esa pista.
  const add = block(page, "Añadir un horario");
  await hydrated(button(add, "Añadir horario"));
  await field(add, "Día").selectOption({ label: "Miércoles" });
  await field(add, "Hora").fill("17:30");
  await field(add, "Duración (min)").fill("60");
  await field(add, "Pista").selectOption({ label: VENUE });
  await button(add, "Añadir horario").click();
  const said = add.getByRole("status");
  await expect(said).toContainText(/^Horario creado: \d+ entrenamientos hasta el final de la temporada\.$/);
  created = Number((await said.textContent())?.match(/\d+/)?.[0]);
  await expect(page.locator("summary", { hasText: `Miércoles · 17:30–18:30 · ${VENUE}` })).toBeVisible();

  // Uno por semana, todos a las 17:30 del club (a cada lado del cambio de hora), de una hora, en
  // miércoles, en esa pista y vinculados a ella.
  const events = await teamEvents();
  expect(events).toHaveLength(created);
  expect(created).toBeGreaterThan(20);
  for (const event of events) {
    expect(clubTime(event.starts_at)).toBe("17:30");
    expect(clubTime(event.ends_at)).toBe("18:30");
    expect(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long" }).format(new Date(event.starts_at))).toBe(
      "Wednesday",
    );
    expect(event.location).toBe(VENUE);
    expect(event.venue_id).not.toBeNull();
    expect(event.schedule_id).not.toBeNull();
    expect(event.status).toBe("scheduled");
  }
  // El mismo otra vez no entra: lo dice su campo.
  await field(add, "Día").selectOption({ label: "Miércoles" });
  await field(add, "Hora").fill("17:30");
  await button(add, "Añadir horario").click();
  await expect(add.getByText("Ese equipo ya entrena ese día a esa hora.")).toBeVisible();
  expect(await teamEvents()).toHaveLength(created);

  // Todo a un dedo y sin ensanchar el móvil, con el horario desplegado.
  await page.locator("summary", { hasText: "Miércoles · 17:30–18:30" }).click();
  await expectTouchTargets(page.getByRole("main").locator("a:visible, button:visible, summary:visible"));
  await expectFitsMobile(page);

  // En Calendario, el equipo dice su horario.
  await page.goto(`${ADMIN}/calendar`);
  await expect(page.getByRole("link", { name: new RegExp(`^${TEAM}`) })).toContainText("Miércoles · 17:30–18:30");
});

test("quien entrena encuentra los entrenamientos en su Agenda, listos para preparar", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/agenda`);
  await expect(title(page)).toHaveText("Agenda");
  // Aún no ha cambiado nada: no hay aviso.
  await expect(page.getByRole("heading", { name: "Cambios recientes" })).toHaveCount(0);

  // Su fila empieza por el día; con varios equipos, el subtítulo dice de cuál es.
  const first = page.getByRole("main").getByRole("link").filter({ hasText: TEAM }).first();
  await expect(first).toContainText("Entrenamiento");
  await expect(first).toContainText(VENUE);
  await first.click();
  await expect(title(page)).toHaveText("Entrenamiento");
  await expect(page.getByRole("main")).toContainText(VENUE);
  // Quién lo puede cambiar, y que aún no ha cambiado nada.
  await expect(page.getByText(`Lo pueden cambiar o cancelar el cuerpo técnico de ${TEAM} y la dirección.`)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cambios", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Editar sesión" })).toBeVisible();
  await expectFitsMobile(page);

  // Al preparar una sesión, «Lugar» sugiere las pistas del club.
  await page.goto(`${CLUB}/train/new`);
  const place = field(page, "Lugar");
  const listId = await place.getAttribute("list");
  expect(listId).toBeTruthy();
  await expect(page.locator(`datalist[id="${listId}"] option[value="${VENUE}"]`)).toHaveCount(1);
});

test("la dirección cambia la hora del horario y el equipo ve el cambio", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);

  // Quien entrena ya ha preparado una: la primera lleva notas.
  const [prepared] = await teamEvents();
  const noted = await createAdminClient().from("practice_plans").update({ notes: "Preparada." }).eq("event_id", prepared.id);
  if (noted.error) throw noted.error;

  await openAs(page, RAUL);
  await page.goto(`${ADMIN}/teams/${teamId}`);
  // Por el día y no por la hora: al guardar, la fila pasa a decir la hora nueva.
  const slot = page.locator("li", { has: page.locator("summary", { hasText: "Miércoles" }) });
  await expect(slot.locator("summary")).toContainText("17:30–18:30");
  await slot.locator("summary").click();
  await hydrated(button(slot, "Guardar"));
  await field(slot, "Hora").fill("18:30");
  await button(slot, "Guardar").click();
  await expect(slot.getByRole("status")).toHaveText(`Horario cambiado: ${created} entrenamientos actualizados.`);
  await expect(page.locator("summary", { hasText: `Miércoles · 18:30–19:30 · ${VENUE}` })).toBeVisible();

  for (const event of await teamEvents()) expect(clubTime(event.starts_at)).toBe("18:30");

  // Quien entrena lo ve lo primero en Inicio: qué ha cambiado y cuándo es ahora.
  await openAs(page, ALEX);
  await page.goto(CLUB);
  const home = page.locator("section", { has: page.getByRole("heading", { name: "Cambios recientes" }) });
  await expect(home.getByRole("listitem")).toHaveCount(3);
  await expect(home.getByRole("listitem").first()).toContainText("Cambio de hora");
  // El día y la hora nuevos van delante: es lo que la fila no puede cortar.
  await expect(home.getByRole("listitem").first()).toContainText(/Miércoles \d+ \w+ · 18:30–19:30 · /);
  await expect(home.getByRole("link", { name: `Ver ${created - 3} más` })).toHaveAttribute("href", `${CLUB}/agenda`);
  await expectFitsMobile(page);

  // Y en la Agenda, encima de lo que viene.
  await page.goto(`${CLUB}/agenda`);
  const agenda = page.locator("section", { has: page.getByRole("heading", { name: "Cambios recientes" }) });
  await expect(agenda.getByRole("listitem")).toHaveCount(5);
  await expectFitsMobile(page);

  // En la ficha, lo que había antes.
  await agenda.getByRole("link").first().click();
  await expect(title(page)).toHaveText("Entrenamiento");
  const log = page.locator("section", { has: page.getByRole("heading", { name: "Cambios", exact: true }) });
  await expect(log).toContainText("Cambio de hora");
  await expect(log).toContainText(/Antes: Miércoles \d+ \w+ · 17:30–18:30/);
  await expectFitsMobile(page);
});

test("quien entrena cancela una sesión: sigue en «Próximos» como cancelada, con su cambio", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const events = await teamEvents();
  const second = events[1];

  await openAs(page, ALEX);
  await page.goto(`${CLUB}/train/${second.id}`);
  const cancel = page.getByRole("button", { name: "Cancelar sesión" });
  await hydrated(cancel);
  await cancel.click();
  const dialog = page.getByRole("alertdialog", { name: "¿Cancelar esta sesión?" });
  await expect(dialog).toContainText("En la Agenda se verá como cancelada hasta que pase su fecha.");
  await dialog.getByRole("button", { name: "Cancelar sesión" }).click();
  await expect(dialog).toHaveCount(0);
  const log = page.locator("section", { has: page.getByRole("heading", { name: "Cambios", exact: true }) });
  await expect(log).toContainText("Sesión cancelada");

  // En la Agenda sigue entre lo que viene, dicho como cancelada; y en el aviso.
  await page.goto(`${CLUB}/agenda`);
  const cancelled = page.locator(`a[href="${CLUB}/train/${second.id}"]`);
  await expect(cancelled).toHaveCount(2);
  await expect(cancelled.first()).toContainText("Cancelada");
  await expect(cancelled.last()).toContainText("Cancelada");
});

test("quitar el horario borra los entrenamientos que nadie tocó y deja los demás", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const before = await teamEvents();

  await openAs(page, RAUL);
  await page.goto(`${ADMIN}/teams/${teamId}`);
  const slot = page.locator("li", { has: page.locator("summary", { hasText: "Miércoles · 18:30–19:30" }) });
  await slot.locator("summary").click();
  await hydrated(button(slot, "Quitar horario"));
  await button(slot, "Quitar horario").click();
  const removing = page.getByRole("alertdialog", { name: "¿Quitar este horario?" });
  await removing.getByRole("button", { name: "Quitar horario" }).click();
  await expect(removing).toHaveCount(0);
  // Dice cuántos ha borrado: todos menos la preparada y la cancelada.
  await expect(page.getByText(`Horario quitado: ${created - 2} entrenamientos borrados.`)).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Horario semanal" })).toBeFocused();
  await expect(page.getByText("Aún no tiene horarios.", { exact: false })).toBeVisible();

  // Quedan la que quien entrena había preparado y la cancelada, ya como sesiones sueltas.
  const after = await teamEvents();
  expect(after.map((event) => event.id)).toEqual([before[0].id, before[1].id]);
  expect(after.map((event) => event.status)).toEqual(["scheduled", "cancelled"]);
  expect(after.every((event) => event.schedule_id === null)).toBe(true);

  // Y la pista, que ya no la usa ningún horario, se puede borrar: sus eventos conservan el lugar.
  await page.goto(`${ADMIN}/calendar`);
  const venue = page.locator("li", { has: page.getByRole("heading", { level: 3, name: VENUE, exact: true }) });
  await hydrated(button(venue, "Borrar pista"));
  await button(venue, "Borrar pista").click();
  const confirm = page.getByRole("alertdialog", { name: `¿Borrar la pista ${VENUE}?` });
  await confirm.getByRole("button", { name: "Borrar pista" }).click();
  // Primero se cierra el diálogo (con él abierto, el resto de la página no cuenta) y después
  // la pista ya no está.
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 3, name: VENUE, exact: true })).toHaveCount(0);
  const kept = await teamEvents();
  expect(kept.map((event) => [event.location, event.venue_id])).toEqual([
    [VENUE, null],
    [VENUE, null],
  ]);
});

test("quien entrena no entra en el calendario de Gestión", async ({ page, browserErrors }) => {
  browserErrors.allowNotFound(`${ADMIN}/calendar`);

  await openAs(page, ALEX);
  await page.goto(`${ADMIN}/calendar`);
  await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();
});

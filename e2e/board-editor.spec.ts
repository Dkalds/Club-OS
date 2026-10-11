import type { Locator, Page } from "@playwright/test";
import { createAdminClient } from "../scripts/lib/admin-client";
import { ARCANGEL } from "../scripts/seed/data";
import { drillId } from "../scripts/seed/drills";
import { restoreSeed, seedNow } from "./helpers/seed";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";
import { CAN_WRITE, CLUB, expectFitsMobile, expectTouchTargets, hydrated, title } from "./helpers/train";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login.
//
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts) porque
// ESCRIBE: crea un borrador `E2E pizarra {ts}` con la clave de servicio y le dibuja, cambia y
// quita la pizarra desde el editor, en serie. `restoreSeed` deja la base de datos como la dejó
// el arranque global, al empezar y al acabar. Con un Supabase que no es local nada se escribe:
// los tests que escriben se saltan.
test.describe.configure({ mode: "serial" });

const ALEX = "alex@arcangel.test"; // entrenador de Arcángel: dueño del borrador
const NORA = "nora@arcangel.test"; // entrenadora del mismo club
const RAUL = "raul@arcangel.test"; // dirección

const NEEDS_LOCAL_DB = "Escribe en la base de datos (crea un ejercicio y guarda su pizarra): solo con un Supabase local.";
const NOT_FOUND = "No encontramos esta página";

/** Un ejercicio publicado del seed, con pizarra: un entrenador no lo edita; la dirección, sí. */
const PUBLISHED = `${CLUB}/drills/${drillId(ARCANGEL.slug, "pase-y-corte")}`;

const NAME = `E2E pizarra ${Date.now()}`;
let draft = "";

async function restore(): Promise<void> {
  if (!CAN_WRITE) return;
  await restoreSeed(seedNow());
}

test.beforeAll(async () => {
  await restore();
  if (!CAN_WRITE) return;

  // El borrador de Álex, sin pizarra: lo que el editor va a dibujar.
  const db = createAdminClient();
  const org = await db.from("organizations").select("id").eq("slug", ARCANGEL.slug).single();
  if (org.error) throw org.error;
  const users = await db.auth.admin.listUsers({ perPage: 200 });
  if (users.error) throw users.error;
  const alex = users.data.users.find((user) => user.email === ALEX);
  if (!alex) throw new Error(`Falta ${ALEX} en el seed.`);
  const inserted = await db
    .from("drills")
    .insert({
      organization_id: org.data.id,
      title: NAME,
      objective: "Un ejercicio de prueba de los e2e.",
      min_players: 6,
      max_players: 10,
      min_minutes: 10,
      max_minutes: 15,
      min_age: 12,
      status: "draft",
      created_by: alex.id,
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  draft = `${CLUB}/drills/${inserted.data.id}`;
});
test.afterAll(restore);

function token(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

function button(page: Page, name: string): Locator {
  return page.getByRole("button", { name, exact: true });
}

/** La pista del editor. */
function court(page: Page): Locator {
  return page.getByRole("group", { name: /^Pizarra de / });
}

/** Arrastra una ficha con el ratón hasta un punto de la pantalla. */
async function drag(page: Page, source: Locator, to: { x: number; y: number }): Promise<void> {
  const box = await source.boundingBox();
  if (!box) throw new Error("La ficha no está a la vista.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

async function center(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("El elemento no está a la vista.");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test("dibujar una pizarra desde cero, previsualizarla y guardarla", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await openAs(page, ALEX);
  await page.goto(draft);
  await expect(title(page)).toHaveText(NAME);

  // Sin pizarra, la ficha ofrece dibujarla.
  await page.getByRole("link", { name: "Dibujar pizarra" }).click();
  await expect(page).toHaveURL(new RegExp(`${draft}/board$`));
  await hydrated(button(page, "Añadir atacante"));
  await expect(page.getByText("Añade fichas y arrástralas a su sitio.")).toBeVisible();
  await expect(button(page, "Guardar pizarra")).toBeDisabled();

  // Dos atacantes y el balón: cada ficha nueva queda elegida, y se numeran solas.
  await button(page, "Añadir atacante").click();
  await expect(token(page, "Atacante 1")).toHaveAttribute("aria-pressed", "true");
  await button(page, "Listo").click();
  await button(page, "Añadir atacante").click();
  await expect(token(page, "Atacante 2")).toBeVisible();
  await button(page, "Listo").click();
  await button(page, "Añadir balón").click();
  await button(page, "Listo").click();

  // El balón, arrastrado junto al 1: lo lleva él.
  const one = await center(token(page, "Atacante 1"));
  await drag(page, token(page, "Balón"), { x: one.x + 12, y: one.y });
  const ball = await center(token(page, "Balón"));
  expect(Math.hypot(ball.x - one.x, ball.y - one.y)).toBeLessThan(40);

  // Un paso: el 1 pasa al 2 tocándole, y corta hacia el aro.
  await button(page, "Añadir paso").click();
  await expect(button(page, "Paso 1")).toHaveAttribute("aria-pressed", "true");
  // A quien lleva el balón se le ofrece pasarlo: no hace falta acertarle al balón.
  await token(page, "Atacante 1").click();
  await button(page, "Pasar").click();
  await expect(page.getByText("Pasar: toca la pista donde acaba.")).toBeVisible();
  await token(page, "Atacante 2").click();
  await expect(court(page).locator('[data-move="pass"]')).toHaveCount(1);

  await token(page, "Atacante 1").click();
  await button(page, "Cortar").click();
  const box = await court(page).boundingBox();
  await page.mouse.click(box!.x + box!.width * 0.5, box!.y + box!.height * 0.22);
  await expect(court(page).locator('[data-move="cut"]')).toHaveCount(1);
  // Ya se mueve en este paso: se puede quitar su movimiento.
  await expect(button(page, "Quitar movimiento")).toBeVisible();

  // Sin ficha elegida, la nota del paso.
  await page.mouse.click(box!.x + box!.width * 0.9, box!.y + box!.height * 0.9);
  await page.getByLabel("Nota del paso", { exact: true }).fill("El 1 pasa al 2 y corta.");

  // Todo a un dedo, y nada ensancha el móvil. La excepción es el balón que lleva un jugador: se
  // pinta pegado a él y su área es solo el balón, para no tapar la del jugador; para pasarlo se
  // toca a quien lo lleva.
  await expectTouchTargets(page.getByRole("main").locator('button:visible, [data-token^="a"]'));
  await expectFitsMobile(page);

  // La vista previa es el visor, con la pizarra tal como se verá.
  await button(page, "Vista previa").click();
  await expect(page.getByRole("img", { name: `Pizarra de ${NAME}, paso 1 de 1` })).toBeVisible();
  await expect(page.getByText("El 1 pasa al 2 y corta.", { exact: true })).toBeVisible();
  await button(page, "Seguir editando").click();

  await button(page, "Guardar pizarra").click();
  await expect(page).toHaveURL(new RegExp(`${draft}$`));
  await expect(page.getByRole("img", { name: `Pizarra de ${NAME}, paso 1 de 1` })).toBeVisible();
  await expect(page.getByRole("link", { name: "Editar pizarra" })).toBeVisible();

  // Guardada de verdad, con lo dibujado.
  const saved = await createAdminClient().from("drills").select("board").eq("title", NAME).single();
  expect(saved.data?.board).toMatchObject({
    version: 1,
    court: "half",
    tokens: [{ id: "a1" }, { id: "a2" }, { id: "b1" }],
    steps: [{ note: "El 1 pasa al 2 y corta.", moves: [{ token: "b1", kind: "pass" }, { token: "a1", kind: "cut" }] }],
  });
});

test("deshacer, rehacer y salir con cambios sin guardar", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await openAs(page, ALEX);
  await page.goto(`${draft}/board`);
  await hydrated(button(page, "Añadir atacante"));
  await expect(token(page, "Atacante 2")).toBeVisible();
  await expect(button(page, "Deshacer")).toBeDisabled();

  await button(page, "Añadir cono").click();
  await expect(token(page, "Cono 1")).toBeVisible();
  await button(page, "Deshacer").click();
  await expect(token(page, "Cono 1")).toHaveCount(0);
  await button(page, "Rehacer").click();
  await expect(token(page, "Cono 1")).toBeVisible();

  // Con cambios sin guardar, salir pregunta; quedarse los conserva.
  await page.getByRole("link", { name: "Volver" }).click();
  const leave = page.getByRole("alertdialog", { name: "¿Salir sin guardar?" });
  await expect(leave).toBeVisible();
  await leave.getByRole("button", { name: "Seguir editando" }).click();
  await expect(token(page, "Cono 1")).toBeVisible();

  await page.getByRole("link", { name: "Volver" }).click();
  await leave.getByRole("button", { name: "Salir sin guardar" }).click();
  await expect(page).toHaveURL(new RegExp(`${draft}$`));
});

test("con teclado, el foco sigue en el editor cuando cambia el panel", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await openAs(page, ALEX);
  await page.goto(`${draft}/board`);
  await hydrated(button(page, "Añadir cono"));

  // Añadir una ficha la elige, y el botón desaparece: el foco pasa a la ficha.
  await button(page, "Añadir cono").focus();
  await page.keyboard.press("Enter");
  await expect(token(page, "Cono 1")).toBeFocused();

  // «Listo» la suelta: el foco va al primer control de lo que queda.
  await button(page, "Listo").focus();
  await page.keyboard.press("Enter");
  await expect(button(page, "Añadir atacante")).toBeFocused();

  // En un paso: elegir la acción lleva el foco a las flechas del destino, y confirmar, a la ficha.
  await button(page, "Paso 1").click();
  await token(page, "Atacante 2").focus();
  await page.keyboard.press("Enter");
  await expect(token(page, "Atacante 2")).toHaveAttribute("aria-pressed", "true");
  await button(page, "Botar").focus();
  await page.keyboard.press("Enter");
  await expect(button(page, "Mover el destino a la izquierda")).toBeFocused();
  await button(page, "Confirmar").focus();
  await page.keyboard.press("Enter");
  await expect(court(page).locator('[data-move="dribble"]')).toHaveCount(1);
  await expect(token(page, "Atacante 2")).toBeFocused();
});

test("si alguien cambia el ejercicio mientras se dibuja, guardar avisa y no pisa nada", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await openAs(page, ALEX);
  await page.goto(`${draft}/board`);
  await hydrated(button(page, "Añadir cono"));

  await button(page, "Añadir cono").click();
  await expect(token(page, "Cono 1")).toBeVisible();

  // Otra persona guarda la ficha del ejercicio: la copia con la que se abrió el editor ya no vale.
  const db = createAdminClient();
  const changed = await db.from("drills").update({ objective: "Cambiado desde otro móvil." }).eq("title", NAME);
  if (changed.error) throw changed.error;

  await button(page, "Guardar pizarra").click();
  const alert = page.getByRole("alert").filter({ hasText: "Alguien ha cambiado esto mientras editabas." });
  await expect(alert).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${draft}/board$`));

  // Nada se ha guardado: la pizarra sigue sin el cono.
  const saved = await db.from("drills").select("board, objective").eq("title", NAME).single();
  expect(saved.data?.objective).toBe("Cambiado desde otro móvil.");
  expect((saved.data?.board as { tokens: unknown[] }).tokens).toHaveLength(3);

  // «Recargar» trae la copia nueva, sin lo dibujado y sin preguntar por los cambios.
  await alert.getByRole("button", { name: "Recargar" }).click();
  await hydrated(button(page, "Añadir cono"));
  await expect(token(page, "Cono 1")).toHaveCount(0);
  await expect(token(page, "Atacante 2")).toBeVisible();
  await expect(button(page, "Guardar pizarra")).toBeDisabled();
});

test("quitar la pizarra", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await openAs(page, ALEX);
  await page.goto(draft);
  await page.getByRole("link", { name: "Editar pizarra" }).click();
  await hydrated(button(page, "Quitar pizarra"));

  await button(page, "Quitar pizarra").click();
  await page.getByRole("alertdialog", { name: "¿Quitar la pizarra?" }).getByRole("button", { name: "Quitar pizarra" }).click();

  await expect(page).toHaveURL(new RegExp(`${draft}$`));
  await expect(page.getByRole("main").getByRole("img")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Dibujar pizarra" })).toBeVisible();
});

test("solo quien puede editar el ejercicio abre su editor", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);

  // Otra entrenadora del club: el borrador de Álex ni lo ve.
  await openAs(page, NORA);
  await page.goto(`${draft}/board`);
  await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();

  // Álex en un publicado: lo ve, pero no lo edita, ni se le ofrece.
  await openAs(page, ALEX);
  await page.goto(PUBLISHED);
  await expect(title(page)).toHaveText("Pase y corte");
  await expect(page.getByRole("link", { name: "Editar pizarra" })).toHaveCount(0);
  await page.goto(`${PUBLISHED}/board`);
  await expect(page.getByRole("heading", { level: 1, name: NOT_FOUND })).toBeVisible();

  // La dirección sí: el editor abre con la pizarra que hay, en «Inicio» y con sus cuatro pasos.
  await openAs(page, RAUL);
  await page.goto(`${PUBLISHED}/board`);
  await hydrated(button(page, "Inicio"));
  await expect(button(page, "Paso 4")).toBeVisible();
  await expect(token(page, "Atacante 1")).toBeVisible();
  await expect(button(page, "Guardar pizarra")).toBeDisabled();
});

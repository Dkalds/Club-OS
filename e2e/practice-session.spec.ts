import type { Page } from "@playwright/test";
import { ARCANGEL } from "../scripts/seed/data";
import { seedSchedule } from "../scripts/seed/dates";
import { seedId } from "../scripts/seed/ids";
import { addLocalDays, dayChip, formatEventSlot, isoToLocalInputs, nextWeeklySlot } from "../src/lib/time";
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
  TZ,
} from "./helpers/train";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login, cada
// test abre la app con `openAs`.
//
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts): crea,
// duplica y cancela sesiones de entrenamiento, y lo hace en serie. Cada test crea la suya
// (`E2E sesión {ts}`) y ninguno afirma recuentos totales de filas. `restoreSeed` deja la base
// de datos como la dejó el arranque global: al empezar (una ejecución anterior matada a medias
// no puede dejar sesiones que estorben) y al acabar (el duplicado de una sesión del seed no
// debe verse en los specs que vienen detrás). Con un Supabase que no es local nada se
// escribe: los tests se saltan, como en `admin.spec.ts`.
//
// El detalle de solo lectura (sesiones hechas y canceladas, la forma de la pantalla) lo
// prueba `train.spec.ts`, en `mobile`. Crear una sesión deja en su constructor (`…/edit`), que
// aquí solo se mira recién abierto, vacío, y para comprobar su 404: montar la sesión, ordenarla
// y guardarla es de `practice-builder.spec.ts`.
test.describe.configure({ mode: "serial" });

const ALEX = "alex@arcangel.test"; // entrenador de Alevín A
const NORA = "nora@arcangel.test"; // entrenadora de Benjamín A, mismo club
const RAUL = "raul@arcangel.test"; // dirección, con los dos equipos
const MARTA = "marta@demo.test"; // entrenadora del otro club

/** El próximo entrenamiento de Alevín A, el que Nora y Marta no pueden abrir. */
const ALEVIN_UPCOMING = seedId(ARCANGEL.slug, "event:alevin-a:upcoming-0");

const NEEDS_LOCAL_DB =
  "Escribe en la base de datos (crea, duplica y cancela sesiones): solo con un Supabase local.";

// Mismo instante que el arranque global: la base de datos queda como la dejó él.
async function restore(): Promise<void> {
  if (!CAN_WRITE) return;
  await restoreSeed(seedNow());
}

test.beforeAll(restore);
test.afterAll(restore);

/** Un título que no se repite entre tests ni entre ejecuciones. */
function sessionTitle(): string {
  return `E2E sesión ${Date.now()}`;
}

const DETAIL_URL = new RegExp(`${CLUB}/train/[0-9a-f-]{36}$`);

/**
 * Las filas de ejercicios del detalle: las de las listas de bloques (`role="list"` explícito de
 * `Card as="ul"`). Se reconocen por llevar el texto solo para lectores de pantalla de sus minutos
 * («15 minutos»), que no llevan las filas de la lista de Standards (también un `ul` con
 * `role="list"`); la de objetivos de la cabecera no lleva el rol. No por no llevar enlaces: un
 * ejercicio de la biblioteca enlaza a su ficha.
 */
const ITEM_ROWS = 'ul[role="list"] > li:has(.sr-only)';

/** La fila de una sesión en la lista de Entrenar: el enlace que lleva su título. */
function row(page: Page, sessionName: string) {
  return page.locator(`main a[href^="${CLUB}/train/"]:not([href$="/new"])`).filter({ hasText: sessionName });
}

test("otro equipo y otro club reciben el 404", async ({ page, browserErrors }) => {
  // Review Focus 1: ni por la URL de su detalle ni por la de su constructor. El mismo 404 que
  // una sesión que no existe: no dice si es de otro equipo, de otro club o inventada.
  const paths = [`${CLUB}/train/${ALEVIN_UPCOMING}`, `${CLUB}/train/${ALEVIN_UPCOMING}/edit`];
  browserErrors.allowNotFound(...paths);

  for (const email of [NORA, MARTA]) {
    await openAs(page, email);
    for (const path of paths) {
      await page.goto(path);

      await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Editar sesión" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Duplicar" })).toHaveCount(0);
      await expect(page.locator("body")).not.toContainText("Transición + rebote defensivo");
    }
  }

  // Quien entrena a un solo equipo no tiene nada que elegir: no ve el campo «Equipo».
  await openAs(page, NORA);
  await page.goto(`${CLUB}/train/new`);
  await expect(title(page)).toHaveText("Nueva sesión");
  await expect(field(page, "Título")).toBeVisible();
  await expect(field(page, "Equipo")).toHaveCount(0);

  // Dirección, que gestiona los dos, elige entre ellos.
  await openAs(page, RAUL);
  await page.goto(`${CLUB}/train/new`);
  await expect(title(page)).toHaveText("Nueva sesión");
  await expect(field(page, "Equipo").getByRole("option")).toHaveText(["Alevín A", "Benjamín A"]);
});

test("crear una sesión", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const name = sessionTitle();

  const eventId = await createSession(page, ALEX, {
    title: name,
    date: inDays(3),
    time: "18:00",
    minutes: "60",
    focus: "Defensa",
  });

  // Crear deja en el constructor de la sesión nueva, vacío: lo siguiente es añadirle ejercicios.
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/${eventId}/edit$`));
  const main = page.getByRole("main");
  await expect(main).toContainText("Alevín A");
  await expect(main).toContainText("18:00–19:00");
  await expect(page.getByRole("heading", { level: 2, name: "Esta sesión aún no tiene ejercicios" })).toBeVisible();
  await expect(page.getByText("Añade ejercicios para prepararla.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Añadir bloque libre" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar sesión" })).toBeDisabled();
  await page.screenshot({ path: "test-results/train-builder-empty-375.png", fullPage: true });

  // Su detalle: sin ejercicios todavía, con lo que se eligió.
  await page.getByRole("link", { name: "Volver a la sesión" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/${eventId}$`));
  await expect(title(page)).toHaveText(name);
  await expect(page.getByRole("heading", { level: 2, name: "Esta sesión aún no tiene ejercicios" })).toBeVisible();
  await expect(page.getByText("Añade ejercicios para prepararla.")).toBeVisible();
  await expect(main).toContainText("Alevín A");
  await expect(main).toContainText("18:00–19:00");
  // Sin ejercicios dura su franja (60 min), no 0; y el único «Editar sesión» es el de las acciones.
  await expect(main.getByText("60 min · Sin ejercicios todavía", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Editar sesión" })).toHaveCount(1);
  await expect(main.getByRole("list", { name: "Objetivos" })).toContainText("Defensa");
  await page.screenshot({ path: "test-results/train-empty-375.png", fullPage: true });

  // Y en Próximas, a su día, con sus 60 min y sin ejercicios.
  await page.goto(`${CLUB}/train`);
  const created = row(page, name);
  await expect(created).toHaveCount(1);
  await expect(created).toContainText("60 min · Sin ejercicios todavía");
  const chip = dayChip(addLocalDays(new Date().toISOString(), 3, TZ), TZ);
  await expect(created).toContainText(`${chip.dow}${chip.day}`);
  await expect(created).toContainText("18:00");
});

test("un formulario con errores los dice bajo cada campo y no pierde lo escrito", async ({ page }) => {
  // No escribe: la acción rechaza la entrada antes de llegar a la base de datos.
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/train/new`);
  await hydrated(page.getByRole("button", { name: "Empezar desde cero" }));

  // Sin título y con una duración fuera de rango.
  await field(page, "Duración (min)").fill("500");
  await field(page, "Lugar").fill("Pabellón 3");
  await page.getByRole("button", { name: "Empezar desde cero" }).click();

  await expect(page.getByRole("alert").filter({ hasText: "Revisa los campos marcados." })).toBeVisible();
  await expect(field(page, "Título")).toHaveAccessibleDescription("Escribe un título.");
  await expect(field(page, "Duración (min)")).toHaveAccessibleDescription(
    "La duración tiene que estar entre 15 y 240 minutos.",
  );
  // Nada de lo escrito se ha perdido, y seguimos en el formulario.
  await expect(field(page, "Duración (min)")).toHaveValue("500");
  await expect(field(page, "Lugar")).toHaveValue("Pabellón 3");
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/new$`));
  await expect(page.getByRole("button", { name: "Empezar desde cero" })).toBeEnabled();
});

test.describe("con el móvil en otra zona horaria", () => {
  test.use({ timezoneId: "America/New_York" });

  test("la hora es la del club", async ({ page }) => {
    // Review Focus 3: las 18:00 son las 18:00 de Madrid, esté donde esté el móvil.
    test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
    const name = sessionTitle();

    const eventId = await createSession(page, ALEX, { title: name, date: inDays(3), time: "18:00", minutes: "60" });

    await expect(page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).resolves.toBe(
      "America/New_York",
    );
    // En el constructor, y en su formulario de «Fecha y datos», que vuelve a enseñar la hora.
    await expect(page.getByRole("main")).toContainText("18:00–19:00");
    await page.getByRole("button", { name: "Fecha y datos" }).click();
    const data = page.getByRole("group", { name: "Fecha y datos" });
    await expect(field(data, "Fecha")).toHaveValue(inDays(3));
    await expect(field(data, "Hora")).toHaveValue("18:00");
    // En el detalle y en la lista.
    await page.goto(`${CLUB}/train/${eventId}`);
    await expect(title(page)).toHaveText(name);
    await expect(page.getByRole("main")).toContainText("18:00–19:00");
    await page.goto(`${CLUB}/train`);
    await expect(row(page, name)).toContainText("18:00");
  });
});

test("duplicar", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const [first] = seedSchedule(seedNow(), TZ).upcoming;
  const original = `${CLUB}/train/${ALEVIN_UPCOMING}`;
  const originalTitle = "Transición + rebote defensivo";

  // La franja de la original, en la zona del club: la copia tiene que enseñar otra.
  const slot = formatEventSlot(first.startsAt, first.endsAt, TZ);

  await openAs(page, ALEX);
  await page.goto(original);
  await expect(title(page)).toHaveText(originalTitle);
  await expect(page.getByRole("main")).toContainText(slot);
  await hydrated(page.getByRole("button", { name: "Duplicar" }));

  // «Duplicar» abre un panel (no un diálogo) que propone el mismo día de la semana siguiente, a
  // las 18:00 del club: lo calcula el servidor con la hora de ahora.
  const toggle = page.getByRole("button", { name: "Duplicar" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const proposed = isoToLocalInputs(nextWeeklySlot(first.startsAt, new Date().toISOString(), TZ), TZ);
  expect(proposed.time).toBe("18:00");
  await expect(field(page, "Fecha")).toHaveValue(proposed.date);
  await expect(field(page, "Hora")).toHaveValue("18:00");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Crear copia" }).click();

  // La copia: otra sesión, con el mismo título, sus cinco ejercicios y los mismos 75 minutos.
  await expect(page).toHaveURL(DETAIL_URL);
  await expect(page).not.toHaveURL(new RegExp(`${ALEVIN_UPCOMING}$`));
  await expect(title(page)).toHaveText(originalTitle);
  const main = page.getByRole("main");
  await expect(main.locator(ITEM_ROWS)).toHaveCount(5);
  await expect(main.getByText("Total", { exact: true }).locator("..")).toContainText("75'");
  // Con su día: el de la propuesta, que no es el de la original.
  await expect(main).toContainText("18:00–19:15");
  await expect(main).not.toContainText(slot);

  // La original no ha cambiado.
  await page.goto(original);
  await expect(title(page)).toHaveText(originalTitle);
  await expect(main).toContainText(slot);
  await expect(main.locator(ITEM_ROWS)).toHaveCount(5);
  await expect(main.getByText("Total", { exact: true }).locator("..")).toContainText("75'");
});

test("cancelar", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const name = sessionTitle();

  const eventId = await createSession(page, ALEX, { title: name, date: inDays(3), time: "18:00", minutes: "60" });
  const detail = `${CLUB}/train/${eventId}`;
  await page.goto(detail);
  await expect(title(page)).toHaveText(name);
  const cancel = page.getByRole("button", { name: "Cancelar sesión" });
  await hydrated(cancel);

  // «Volver» no hace nada: la sesión sigue programada y editable.
  await cancel.click();
  const dialog = page.getByRole("alertdialog", { name: "¿Cancelar esta sesión?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Dejará de salir en Inicio y en Próximas. Seguirá en el histórico.");
  await dialog.getByRole("button", { name: "Volver" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Editar sesión" })).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("Cancelada");
  await page.goto(`${CLUB}/train`);
  await expect(row(page, name)).toHaveCount(1);

  // Otra vez, y esta con confirmación.
  await page.goto(detail);
  await hydrated(cancel);
  await cancel.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar sesión" }).click();

  // El detalle ya no la ofrece como editable ni cancelable, y lo dice.
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("main")).toContainText("Cancelada");
  await expect(page.getByRole("link", { name: "Editar sesión" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancelar sesión" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Duplicar" })).toBeVisible();

  // Sale de Próximas y está en el histórico, como cancelada.
  await page.goto(`${CLUB}/train`);
  await expect(page.getByRole("link", { name: "Preparar sesión" })).toBeVisible();
  await expect(row(page, name)).toHaveCount(0);
  await page.goto(`${CLUB}/train?scope=history`);
  await expect(row(page, name)).toHaveCount(1);
  await expect(row(page, name)).toContainText("Cancelada");
});

test("el formulario y el panel de duplicar caben en el móvil, con áreas táctiles de 44 px", async ({
  page,
  browserErrors,
}) => {
  // Solo se mide: no se guarda nada. Dirección, que ve también el selector de equipo.
  await openAs(page, RAUL);
  await page.goto(`${CLUB}/train/new`);
  await expect(title(page)).toHaveText("Nueva sesión");
  await expect(field(page, "Equipo")).toBeVisible();
  await expectFitsMobile(page);
  const main = page.getByRole("main");
  await expectTouchTargets(main.locator("input, select, textarea, button, a"));
  await page.screenshot({ path: "test-results/train-new-375.png", fullPage: true });

  await page.goto(`${CLUB}/train/${ALEVIN_UPCOMING}`);
  await expect(title(page)).toHaveText("Transición + rebote defensivo");
  await hydrated(page.getByRole("button", { name: "Duplicar" }));
  await page.getByRole("button", { name: "Duplicar" }).click();
  await expect(field(page, "Fecha")).toBeVisible();
  await expectFitsMobile(page);
  await expectTouchTargets(main.locator("input, select, textarea, button, a"));
  await page.screenshot({ path: "test-results/train-duplicate-375.png", fullPage: true });

  await page.getByRole("button", { name: "Cancelar sesión" }).click();
  const dialog = page.getByRole("alertdialog", { name: "¿Cancelar esta sesión?" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  await expectTouchTargets(dialog.getByRole("button"));
  await page.screenshot({ path: "test-results/train-cancel-dialog-375.png" });
  await dialog.getByRole("button", { name: "Volver" }).click();
  await expect(dialog).toHaveCount(0);

  expect(browserErrors.seen).toEqual([]);
});

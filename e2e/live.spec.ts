import type { Page } from "@playwright/test";
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
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts): los tests
// pasan por Live, que escribe progreso en la base de datos y el localStorage. `restoreSeed`
// deja la base de datos como la dejó el arranque global —la sesión de hoy vuelve a
// `scheduled`, sin iniciar y con sus ítems sin `completed`— antes y después de la suite.
//
// Si una sesión está empezada y por dónde va lo guarda el servidor: los tests van en serie y
// cada uno deja la sesión de hoy como la necesita el siguiente (o la reinicia al acabar).
//
// `page.clock` fija el reloj del navegador antes de abrir la pantalla Live para que el
// cronómetro sea predecible. Cada test crea su propio contexto de navegador (Playwright crea
// uno por test) y clearLiveData solo afecta al localStorage de ese contexto: los tests no se
// pisan entre sí.
test.describe.configure({ mode: "serial" });

const ALEX = "alex@arcangel.test"; // entrenador de Alevín A
const NORA = "nora@arcangel.test"; // entrenadora de Benjamín A, mismo club

const CLUB = `/c/${ARCANGEL.slug}`;
const TODAY_LIVE_ID = seedId(ARCANGEL.slug, "event:alevin-a:today-live");
const TODAY_LIVE_PLAN_ID = seedId(ARCANGEL.slug, "plan:alevin-a:today-live");
const LIVE_URL = `${CLUB}/train/${TODAY_LIVE_ID}/live`;
const DETAIL_URL = `${CLUB}/train/${TODAY_LIVE_ID}`;

const NEEDS_LOCAL_DB =
  "Escribe en la base de datos (avanza en Live, termina sesión): solo con un Supabase local.";

function canWrite(): boolean {
  try {
    return isLocalSupabaseUrl(readSupabaseEnv().url);
  } catch {
    return false;
  }
}

async function restore(): Promise<void> {
  if (!canWrite()) return;
  await restoreSeed(seedNow());
}

test.beforeAll(restore);
test.afterAll(restore);

/** Vuelve la sesión de hoy a `scheduled`, sin iniciar, y borra su progreso en la BD. */
async function resetTodayLive(): Promise<void> {
  if (!canWrite()) return;
  const db = createAdminClient();
  await db.from("practice_items").update({ completed: null, actual_minutes: null }).eq("plan_id", TODAY_LIVE_PLAN_ID);
  await db
    .from("practice_plans")
    .update({ actual_minutes: null, status: "ready", live_started_at: null, live_position: null })
    .eq("id", TODAY_LIVE_PLAN_ID);
  await db.from("events").update({ status: "scheduled" }).eq("id", TODAY_LIVE_ID);
}

/** Deja sin iniciar el directo de cualquier sesión programada, y sin progreso sus ejercicios. */
async function resetLive(eventId: string): Promise<void> {
  const db = createAdminClient();
  const { data: plan, error } = await db.from("practice_plans").select("id").eq("event_id", eventId).single();
  if (error) throw error;
  await db.from("practice_items").update({ completed: null, actual_minutes: null }).eq("plan_id", plan.id);
  await db.from("practice_plans").update({ live_started_at: null, live_position: null }).eq("id", plan.id);
}

/** Lo que el servidor guarda del directo de la sesión de hoy. */
async function liveStateInDb(): Promise<{ live_started_at: string | null; live_position: number | null }> {
  const { data, error } = await createAdminClient()
    .from("practice_plans")
    .select("live_started_at, live_position")
    .eq("id", TODAY_LIVE_PLAN_ID)
    .single();
  if (error) throw error;
  return data;
}

/** «Guardado»: el servidor ya tiene lo último. Hasta entonces la BD no lo sabe. */
async function expectSaved(page: Page): Promise<void> {
  await expect(page.getByText("Guardado", { exact: true })).toBeVisible({ timeout: 15000 });
}

test("Álex inicia desde la ficha, avanza, sale y continúa donde iba", async ({ page }) => {
  test.skip(!canWrite(), NEEDS_LOCAL_DB);

  // Fija el reloj del navegador antes de que React hidrate: así el cronómetro arranca
  // desde un instante predecible y sus aserciones no son flaky.
  await page.clock.install({ time: new Date("2026-10-08T16:00:00Z") });

  await openAs(page, ALEX);
  await page.goto(DETAIL_URL);

  // Sin iniciar: «Iniciar entrenamiento», sin decir por dónde va ni ofrecer empezar de nuevo.
  await expect(page.getByRole("link", { name: "Iniciar entrenamiento" })).toBeVisible();
  await expect(page.getByText(/^Ejercicio \d+ de \d+$/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Empezar de nuevo" })).toHaveCount(0);
  await page.getByRole("link", { name: "Iniciar entrenamiento" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIVE_URL}$`));

  // La portada: el título, lo que dura y «Iniciar». Abrirla no marca la sesión como empezada.
  await expect(page.getByRole("heading", { level: 1, name: "Bloqueo directo y continuación" })).toBeVisible();
  await expect(page.getByText("4 ejercicios · 70 min")).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar" })).toBeVisible();
  expect(await liveStateInDb()).toEqual({ live_started_at: null, live_position: null });

  // Inicia: empieza siempre en el primer ejercicio.
  await page.getByRole("button", { name: "Iniciar" }).click();
  await expect(page.getByText("1 / 4")).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.getByText("Activación")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Movilidad articular + pases en movimiento" })).toBeVisible();

  // Avanza dos ejercicios.
  await page.getByRole("button", { name: "Siguiente ejercicio" }).click();
  await expect(page.getByText("2 / 4")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Posición de tirador y salida del bloqueo" })).toBeVisible();
  await page.getByRole("button", { name: "Siguiente ejercicio" }).click();
  await expect(page.getByText("3 / 4")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Bloqueo directo 2x2 con continuación" })).toBeVisible();

  // El servidor sabe que está empezada y por dónde va (el tercero es la posición 2).
  await expectSaved(page);
  const saved = await liveStateInDb();
  expect(saved.live_started_at).not.toBeNull();
  expect(saved.live_position).toBe(2);

  // Sale: vuelve a la ficha, que ahora ofrece continuar y dice por qué ejercicio va.
  await page.getByRole("link", { name: "Salir" }).click();
  await expect(page).toHaveURL(new RegExp(`${DETAIL_URL}$`));
  await expect(page.getByRole("link", { name: "Continuar entrenamiento" })).toBeVisible();
  await expect(page.getByText("Ejercicio 3 de 4")).toBeVisible();
  await expect(page.getByRole("link", { name: "Iniciar entrenamiento" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Empezar de nuevo" })).toBeVisible();

  // Como en otro dispositivo: sin nada guardado en este, continuar abre el ejercicio del servidor.
  await page.evaluate(() => localStorage.clear());
  await page.getByRole("link", { name: "Continuar entrenamiento" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIVE_URL}$`));
  await expect(page.getByText("3 / 4")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Bloqueo directo 2x2 con continuación" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar" })).toHaveCount(0);

  // Y al recargar sigue ahí.
  await page.reload();
  await expect(page.getByText("3 / 4")).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
});

test("«Empezar de nuevo» deja la sesión sin iniciar, también en un móvil que la tenía a medias", async ({ page }) => {
  test.skip(!canWrite(), NEEDS_LOCAL_DB);

  await page.clock.install({ time: new Date("2026-10-08T16:00:00Z") });
  await openAs(page, ALEX);

  // La sesión sigue en curso, por el tercer ejercicio (la dejó el test anterior). Este
  // navegador la abre y se queda con su estado guardado.
  await page.goto(LIVE_URL);
  await expect(page.getByText("3 / 4")).toBeVisible();
  await expectSaved(page);

  await page.getByRole("link", { name: "Salir" }).click();
  await expect(page).toHaveURL(new RegExp(`${DETAIL_URL}$`));

  // Pregunta antes; «Volver» no cambia nada.
  await page.getByRole("button", { name: "Empezar de nuevo" }).click();
  const dialog = page.getByRole("alertdialog", { name: "¿Empezar de nuevo?" });
  await expect(dialog).toContainText("Se borra el progreso de esta sesión. No se puede deshacer.");
  await dialog.getByRole("button", { name: "Volver" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await liveStateInDb()).live_position).toBe(2);

  // Confirma: la ficha vuelve a «Iniciar entrenamiento» y el servidor no guarda nada.
  await page.getByRole("button", { name: "Empezar de nuevo" }).click();
  await dialog.getByRole("button", { name: "Empezar de nuevo" }).click();
  await expect(page.getByRole("link", { name: "Iniciar entrenamiento" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continuar entrenamiento" })).toHaveCount(0);
  await expect(page.getByText(/^Ejercicio \d+ de \d+$/)).toHaveCount(0);
  expect(await liveStateInDb()).toEqual({ live_started_at: null, live_position: null });

  // Al entrar otra vez, la portada con «Iniciar»: no el tercer ejercicio que este móvil guardaba.
  await page.getByRole("link", { name: "Iniciar entrenamiento" }).click();
  await expect(page.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await page.getByRole("button", { name: "Iniciar" }).click();
  await expect(page.getByText("1 / 4")).toBeVisible();
  await expectSaved(page);

  await resetTodayLive();
});

test("Inicio dice si el próximo entrenamiento está sin iniciar o en curso", async ({ page }) => {
  test.skip(!canWrite(), NEEDS_LOCAL_DB);

  await page.clock.install({ time: new Date("2026-10-08T16:00:00Z") });
  await openAs(page, ALEX);
  await expect(page).toHaveURL(new RegExp(`${CLUB}$`));

  // El próximo entrenamiento de Inicio es el primero que aún no ha terminado: la sesión de hoy
  // o, si ya pasó su hora, la siguiente. Sea cual sea, nadie la ha iniciado.
  const start = page.getByRole("link", { name: "Iniciar entrenamiento" });
  await expect(start).toBeVisible();
  await expect(page.getByText(/^Ejercicio \d+ de \d+$/)).toHaveCount(0);
  const liveHref = await start.getAttribute("href");
  const eventId = /\/train\/([0-9a-f-]{36})\/live$/.exec(liveHref ?? "")?.[1];
  expect(eventId, "el enlace de Inicio lleva al directo de una sesión").toBeDefined();

  try {
    await start.click();
    await expect(page).toHaveURL(new RegExp(`${liveHref}$`));
    await page.getByRole("button", { name: "Iniciar" }).click();
    await page.getByRole("button", { name: "Siguiente ejercicio" }).click();
    await expect(page.getByText(/^2 \/ \d+$/)).toBeVisible();
    await expectSaved(page);

    // De vuelta en Inicio: el mismo enlace dice «Continuar» y por qué ejercicio va.
    await page.goto(CLUB);
    await expect(page.getByRole("link", { name: "Continuar entrenamiento" })).toHaveAttribute("href", liveHref ?? "");
    await expect(page.getByText(/^Ejercicio 2 de \d+$/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Iniciar entrenamiento" })).toHaveCount(0);
  } finally {
    if (eventId) await resetLive(eventId);
  }
});

test("sin conexión avanza, la BD lo recibe al volver la red", async ({ page, browserErrors }) => {
  test.skip(!canWrite(), NEEDS_LOCAL_DB);
  browserErrors.allowOffline();

  await page.clock.install({ time: new Date("2026-10-08T16:00:00Z") });

  await openAs(page, ALEX);
  await page.goto(LIVE_URL);
  await page.getByRole("button", { name: "Iniciar" }).click();
  await expect(page.getByText("1 / 4")).toBeVisible();

  // Corta la conexión.
  await page.context().setOffline(true);

  // Un ejercicio de 0 min no cuenta como hecho (D5): pasan 2 min antes de avanzar.
  await page.clock.fastForward("02:00");
  await page.getByRole("button", { name: "Siguiente ejercicio" }).click();
  await expect(page.getByText("2 / 4")).toBeVisible();

  // El aviso de sin conexión aparece.
  await expect(page.getByText("Sin conexión: se enviará al volver")).toBeVisible();

  // Sin red la pantalla sigue en Live. Recargar sin red no se prueba: la caché offline de
  // la página llega en una fase posterior (spec, «la caché offline, después»).
  await expect(page).toHaveURL(new RegExp(`${LIVE_URL}$`));
  await expect(page.getByRole("timer")).toBeVisible();

  // Vuelve la conexión: el envío pendiente se reintenta solo, sin recargar.
  await page.context().setOffline(false);
  // «Guardado» solo aparece cuando el servidor ha respondido: hasta entonces la BD no lo tiene.
  await expectSaved(page);
  await expect(page.getByText("Sin conexión: se enviará al volver")).toHaveCount(0);

  // Review Focus 1: la BD registra el ítem completado, y por dónde va la sesión.
  const db = createAdminClient();
  const { data: items } = await db
    .from("practice_items")
    .select("sort, completed")
    .eq("plan_id", TODAY_LIVE_PLAN_ID)
    .order("sort");
  expect(items?.find((item) => item.sort === 1)?.completed).toBe(true);
  expect((await liveStateInDb()).live_position).toBe(1);

  await resetTodayLive();
});

test("terminar → confirmación → la ficha es el resumen y la sesión está en Histórico", async ({ page }) => {
  test.skip(!canWrite(), NEEDS_LOCAL_DB);

  await page.clock.install({ time: new Date("2026-10-08T16:00:00Z") });

  await openAs(page, ALEX);
  await page.goto(LIVE_URL);
  await page.getByRole("button", { name: "Iniciar" }).click();
  await expect(page.getByText("1 / 4")).toBeVisible();

  // El primero dura 2 min de reloj; los demás se pasan sin tiempo (no cuentan como hechos, D5).
  await page.clock.fastForward("02:00");
  await page.getByRole("button", { name: "Siguiente ejercicio" }).click();
  await page.getByRole("button", { name: "Siguiente ejercicio" }).click();
  await page.getByRole("button", { name: "Siguiente ejercicio" }).click();
  await expect(page.getByText("4 / 4")).toBeVisible();
  await expect(page.getByText("Último ejercicio")).toBeVisible();

  // En el último, el control de la derecha ya no pasa al siguiente: termina, y pregunta antes.
  await expect(page.getByRole("button", { name: "Siguiente ejercicio" })).toHaveCount(0);
  await page.getByRole("button", { name: "Terminar entrenamiento" }).click();
  const dialog = page.getByRole("alertdialog", { name: "¿Terminar el entrenamiento?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Seguir entrenando" })).toBeVisible();

  // Confirma.
  await dialog.getByRole("button", { name: "Terminar", exact: true }).click();

  // Vuelve a la ficha. La sesión ya no ofrece Live ni Editar, ni empezar de nuevo.
  await expect(page).toHaveURL(new RegExp(`${DETAIL_URL}$`));
  await expect(page.getByRole("link", { name: "Iniciar entrenamiento" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Continuar entrenamiento" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Editar sesión" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Empezar de nuevo" })).toHaveCount(0);

  // La ficha es su resumen: cada ejercicio dice si se hizo y cuánto duró, y hay un total real.
  const main = page.getByRole("main");
  await expect(main.getByText("Hecho · 2 min")).toHaveCount(1);
  await expect(main.getByText("Sin hacer")).toHaveCount(3);
  await expect(main.getByText("Real", { exact: true })).toBeVisible();

  // El directo de una sesión hecha lleva a su ficha, no a un 404.
  await page.goto(LIVE_URL);
  await expect(page).toHaveURL(new RegExp(`${DETAIL_URL}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Bloqueo directo y continuación" })).toBeVisible();

  // Sale de Próximas y aparece en Histórico como hecha.
  await page.goto(`${CLUB}/train`);
  await expect(page.getByRole("link", { name: "Bloqueo directo y continuación" })).toHaveCount(0);
  await page.goto(`${CLUB}/train?scope=history`);
  const row = page.getByRole("link").filter({ hasText: "Bloqueo directo y continuación" }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Hecho");

  await resetTodayLive();
});

test("Nora no accede al Live de Alevín A (Review Focus 2)", async ({ page }) => {
  // No escribe: comprueba el aislamiento entre equipos. Va en admin por serial.
  await openAs(page, NORA);

  // La URL de Live del equipo ajeno devuelve 404.
  await page.goto(LIVE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
  await expect(page.getByText("Bloqueo directo")).toHaveCount(0);

  // POST /api/live-progress con una sesión de Alevín A → 404, también si intenta iniciarla.
  const response = await page.request.post("/api/live-progress", {
    data: {
      clubSlug: ARCANGEL.slug,
      eventId: TODAY_LIVE_ID,
      items: [],
      finished: false,
      startedAt: new Date().toISOString(),
      position: 0,
    },
    headers: { Origin: page.url().split("/").slice(0, 3).join("/") },
  });
  expect(response.status()).toBe(404);
  if (canWrite()) expect(await liveStateInDb()).toEqual({ live_started_at: null, live_position: null });
});

test("sin navigator.wakeLock Live funciona y avisa", async ({ page }) => {
  // Elimina la API de Wake Lock antes de que la página cargue. Es un getter del prototipo:
  // borrarla de `navigator` no hace nada.
  await page.addInitScript(() => {
    delete (Navigator.prototype as unknown as Record<string, unknown>)["wakeLock"];
  });

  await page.clock.install({ time: new Date("2026-10-08T16:00:00Z") });
  await openAs(page, ALEX);
  await page.goto(LIVE_URL);

  // La pantalla pre-inicio muestra el aviso.
  await expect(page.getByRole("button", { name: "Iniciar" })).toBeVisible();
  await expect(page.getByText("Este navegador puede apagar la pantalla")).toBeVisible();

  // Puede iniciar igualmente.
  await page.getByRole("button", { name: "Iniciar" }).click();
  await expect(page.getByText("1 / 4")).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
});

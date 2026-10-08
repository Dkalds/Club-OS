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
// `scheduled` y sus ítems sin `completed`— antes y después de la suite.
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

/** Vuelve la sesión de hoy a `scheduled` y borra su progreso en la BD. */
async function resetTodayLive(): Promise<void> {
  if (!canWrite()) return;
  const db = createAdminClient();
  await db.from("practice_items").update({ completed: null, actual_minutes: null }).eq("plan_id", TODAY_LIVE_PLAN_ID);
  await db.from("practice_plans").update({ actual_minutes: null }).eq("id", TODAY_LIVE_PLAN_ID);
  await db.from("events").update({ status: "scheduled" }).eq("id", TODAY_LIVE_ID);
}

test("Álex inicia Live, avanza y recarga con el estado correcto", async ({ page }) => {
  test.skip(!canWrite(), NEEDS_LOCAL_DB);

  // Fija el reloj del navegador antes de que React hidrate: así el cronómetro arranca
  // desde un instante predecible y sus aserciones no son flaky.
  await page.clock.install({ time: new Date("2026-10-08T16:00:00Z") });

  await openAs(page, ALEX);
  await page.goto(DETAIL_URL);

  // El botón primario «Iniciar entrenamiento» es visible en el detalle.
  await expect(page.getByRole("link", { name: "Iniciar entrenamiento" })).toBeVisible();
  await page.getByRole("link", { name: "Iniciar entrenamiento" }).click();
  await expect(page).toHaveURL(new RegExp(`${LIVE_URL}$`));

  // Pantalla pre-inicio: título, 4 ejercicios, botón «Iniciar».
  await expect(page.getByRole("heading", { level: 1, name: "Bloqueo directo y continuación" })).toBeVisible();
  await expect(page.getByText("4 ejercicios")).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar" })).toBeVisible();

  // Inicia.
  await page.getByRole("button", { name: "Iniciar" }).click();

  // Pantalla en directo: «1 / 4», cronómetro y fase del primer ejercicio.
  await expect(page.getByText("1 / 4")).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.getByText("Activación")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Movilidad articular + pases en movimiento" })).toBeVisible();

  // Avanza al ejercicio 2.
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("2 / 4")).toBeVisible();
  await expect(page.getByText("Técnica")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Posición de tirador y salida del bloqueo" })).toBeVisible();

  // Avanza al ejercicio 3.
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("3 / 4")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Bloqueo directo 2x2 con continuación" })).toBeVisible();

  // Recarga. El estado se recupera del localStorage: sigue en 3 / 4.
  await page.reload();
  await expect(page.getByText("3 / 4")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Bloqueo directo 2x2 con continuación" })).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();

  await resetTodayLive();
});

test("sin conexión avanza, la BD lo recibe al volver la red", async ({ page }) => {
  test.skip(!canWrite(), NEEDS_LOCAL_DB);

  await page.clock.install({ time: new Date("2026-10-08T16:00:00Z") });

  await openAs(page, ALEX);
  await page.goto(LIVE_URL);
  await page.getByRole("button", { name: "Iniciar" }).click();
  await expect(page.getByText("1 / 4")).toBeVisible();

  // Corta la conexión.
  await page.context().setOffline(true);

  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("2 / 4")).toBeVisible();

  // El aviso de sin conexión aparece.
  await expect(page.getByText("Sin conexión: se enviará al volver")).toBeVisible();

  // Recarga en offline: el diagrama sigue visible (precachado por el SW) o la pantalla
  // sigue activa (el SW no está activo en test, así que basta con que la app no rompa).
  await page.reload();
  // Sigue dentro de Live, no en 404 ni en error.
  await expect(page).toHaveURL(new RegExp(`${LIVE_URL}$`));

  // Vuelve la conexión.
  await page.context().setOffline(false);
  // Tras enviar, aparece «Guardado» o desaparece el aviso.
  await expect(page.getByText("Sin conexión: se enviará al volver")).toHaveCount(0, { timeout: 10000 });

  // Review Focus 1: la BD registra el ítem completado.
  const db = createAdminClient();
  const { data: items } = await db
    .from("practice_items")
    .select("sort, completed")
    .eq("plan_id", TODAY_LIVE_PLAN_ID)
    .order("sort");
  expect(items?.find((item) => item.sort === 1)?.completed).toBe(true);

  await resetTodayLive();
});

test("terminar → confirmación → sesión en Histórico como hecha", async ({ page }) => {
  test.skip(!canWrite(), NEEDS_LOCAL_DB);

  await page.clock.install({ time: new Date("2026-10-08T16:00:00Z") });

  await openAs(page, ALEX);
  await page.goto(LIVE_URL);
  await page.getByRole("button", { name: "Iniciar" }).click();
  await expect(page.getByText("1 / 4")).toBeVisible();

  // Avanza hasta el último ítem.
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByText("4 / 4")).toBeVisible();

  // En el último «Siguiente» abre el diálogo de confirmación.
  await page.getByRole("button", { name: "Siguiente" }).click();
  const dialog = page.getByRole("dialog", { name: "Terminar entrenamiento" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeVisible();

  // Confirma.
  await dialog.getByRole("button", { name: "Terminar" }).click();

  // Vuelve al detalle. La sesión ya no ofrece Live ni Editar.
  await expect(page).toHaveURL(new RegExp(`${DETAIL_URL}$`));
  await expect(page.getByRole("link", { name: "Iniciar entrenamiento" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Continuar entrenamiento" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Editar sesión" })).toHaveCount(0);

  // Sale de Próximas y aparece en Histórico como hecha.
  await page.goto(`${CLUB}/train`);
  await expect(page.getByRole("link", { name: "Bloqueo directo y continuación" })).toHaveCount(0);
  await page.goto(`${CLUB}/train?scope=history`);
  const row = page.getByRole("link").filter({ hasText: "Bloqueo directo y continuación" }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("Hecha");

  await resetTodayLive();
});

test("Nora no accede al Live de Alevín A (Review Focus 2)", async ({ page }) => {
  // No escribe: comprueba el aislamiento entre equipos. Va en admin por serial.
  await openAs(page, NORA);

  // La URL de Live del equipo ajeno devuelve 404.
  await page.goto(LIVE_URL);
  await expect(page.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeVisible();
  await expect(page.getByText("Bloqueo directo")).toHaveCount(0);

  // POST /api/live-progress con una sesión de Alevín A → 404.
  const response = await page.request.post("/api/live-progress", {
    data: {
      clubSlug: ARCANGEL.slug,
      eventId: TODAY_LIVE_ID,
      items: [],
      finished: false,
    },
    headers: { Origin: page.url().split("/").slice(0, 3).join("/") },
  });
  expect(response.status()).toBe(404);
});

test("sin navigator.wakeLock Live funciona y avisa", async ({ page }) => {
  // Elimina la API de Wake Lock antes de que la página cargue.
  await page.addInitScript(() => {
    delete (navigator as unknown as Record<string, unknown>)["wakeLock"];
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

import type { Page } from "@playwright/test";
import { readSupabaseEnv } from "../scripts/lib/admin-client";
import { ARCANGEL } from "../scripts/seed/data";
import { isLocalSupabaseUrl } from "../scripts/seed/guard";
import { seedId } from "../scripts/seed/ids";
import { restoreSeed, seedNow } from "./helpers/seed";
import { openAs } from "./helpers/sessions";
import { expect, test } from "./helpers/test";

// Lo que se escribe en Partidos y en la ficha de un jugador (proyecto `admin`, en serie). Antes y
// después, `restoreSeed`: borra lo que estos tests crean (partidos, objetivos, notas) y devuelve
// el seed a su estado. Solo con un Supabase local.

test.describe.configure({ mode: "serial" });

const ALEX = "alex@arcangel.test";
const NORA = "nora@arcangel.test";
const CLUB = `/c/${ARCANGEL.slug}`;
const ALEVIN_A = seedId(ARCANGEL.slug, "team:alevin-a");
const MARCO = seedId(ARCANGEL.slug, "person:alevin-a:marco-vidal");
const PLAYED = seedId(ARCANGEL.slug, "event:alevin-a:past-game");

const NEEDS_LOCAL_DB = "Escribe en la base de datos: solo con un Supabase local.";

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

function title(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

test("Álex crea un partido de su equipo, lo ve en Próximos y lo cancela", async ({ page }) => {
  test.skip(!canWrite(), NEEDS_LOCAL_DB);
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/games`);

  await page.getByRole("link", { name: "Nuevo partido" }).click();
  await expect(title(page)).toHaveText("Nuevo partido");
  await page.getByLabel("Rival").fill("CB E2E Rival");
  await page.getByLabel("Local o visitante").selectOption("away");
  await page.getByLabel("Competición").fill("Amistoso");
  await page.getByRole("button", { name: "Crear partido" }).click();

  await expect(page).toHaveURL(new RegExp(`${CLUB}/games/[0-9a-f-]{36}$`));
  await expect(page.getByText("CB E2E Rival", { exact: true })).toBeVisible();
  // No ha empezado: no hay resultado que apuntar.
  await expect(page.getByRole("button", { name: /resultado/ })).toHaveCount(0);

  await page.goto(`${CLUB}/games`);
  await expect(page.getByRole("link", { name: /CB E2E Rival/ })).toContainText("Visitante · Amistoso");

  await page.getByRole("link", { name: /CB E2E Rival/ }).click();
  await page.getByRole("button", { name: "Cancelar partido" }).click();
  const dialog = page.getByRole("alertdialog", { name: "¿Cancelar este partido?" });
  await dialog.getByRole("button", { name: "Cancelar partido" }).click();
  await expect(page.getByText("Partido cancelado")).toBeVisible();
  await expect(page.getByRole("main").getByRole("button")).toHaveCount(0);

  await page.goto(`${CLUB}/games`);
  await expect(page.getByRole("link", { name: /CB E2E Rival/ })).toHaveCount(0);
  await page.goto(`${CLUB}/games?scope=played`);
  await expect(page.getByRole("link", { name: /CB E2E Rival/ })).toContainText("Cancelado");
});

test("el partido jugado sale en Jugados con su marcador, y el resultado se corrige", async ({ page }) => {
  test.skip(!canWrite(), NEEDS_LOCAL_DB);
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/games?scope=played`);

  const row = page.getByRole("link", { name: /CD Almendros/ });
  await expect(row).toContainText("54–49");
  await row.click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/games/${PLAYED}$`));

  await page.getByRole("button", { name: "Corregir resultado" }).click();
  const sheet = page.getByRole("dialog", { name: "Resultado" });
  await sheet.getByLabel("Alevín A").fill("56");
  await sheet.getByRole("button", { name: "Guardar resultado" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByText("56 a 49")).toBeAttached();
});

test("Nora no ve los partidos de Alevín A ni puede abrirlos", async ({ page, browserErrors }) => {
  browserErrors.allowNotFound(`${CLUB}/games/${PLAYED}`);
  await openAs(page, NORA);

  await page.goto(`${CLUB}/games?scope=played`);
  await expect(page.getByRole("link", { name: /CD Almendros/ })).toHaveCount(0);
  await page.goto(`${CLUB}/games/${PLAYED}`);
  await expect(title(page)).toHaveText("No encontramos esta página");
});

test("objetivos y notas en la ficha: añadir, lograr, editar y borrar", async ({ page }) => {
  test.skip(!canWrite(), NEEDS_LOCAL_DB);
  await openAs(page, ALEX);
  await page.goto(`${CLUB}/team/${ALEVIN_A}/players/${MARCO}`);
  await expect(page.getByRole("heading", { name: "Objetivos · 0 de 3" })).toBeVisible();

  // Añadir un objetivo ligado a un Standard.
  await page.getByRole("button", { name: "Añadir objetivo" }).click();
  const goalSheet = page.getByRole("dialog", { name: "Nuevo objetivo" });
  await goalSheet.getByLabel("Objetivo").fill("E2E Ver el pase al poste");
  await goalSheet.getByLabel("Standard").selectOption({ index: 1 });
  await goalSheet.getByRole("button", { name: "Guardar objetivo" }).click();
  await expect(goalSheet).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Objetivos · 1 de 3" })).toBeVisible();
  await expect(page.getByText("E2E Ver el pase al poste")).toBeVisible();

  // Lograrlo (pide confirmación) y verlo en el historial con su fecha.
  await page.getByRole("button", { name: "Logrado" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Marcar como logrado" }).click();
  await expect(page.getByRole("heading", { name: "Objetivos · 0 de 3" })).toBeVisible();
  await page.getByText("Historial · 1").click();
  await expect(page.getByText(/^Logrado el /)).toBeVisible();

  // Una nota, nace «Solo yo»; editarla para el cuerpo técnico; borrarla.
  await page.getByRole("button", { name: "Añadir nota" }).click();
  const noteSheet = page.getByRole("dialog", { name: "Nueva nota" });
  await expect(noteSheet.getByLabel("Quién la lee")).toHaveValue("private");
  await noteSheet.getByLabel("Nota").fill("E2E Buena actitud en el calentamiento.");
  await noteSheet.getByRole("button", { name: "Guardar nota" }).click();
  await expect(noteSheet).toHaveCount(0);
  const note = page.getByRole("listitem").filter({ hasText: "E2E Buena actitud" });
  await expect(note).toContainText("Solo yo");

  await note.getByRole("button", { name: "Editar" }).click();
  const editSheet = page.getByRole("dialog", { name: "Editar nota" });
  await editSheet.getByLabel("Quién la lee").selectOption("staff");
  await editSheet.getByRole("button", { name: "Guardar nota" }).click();
  await expect(editSheet).toHaveCount(0);
  await expect(note).toContainText("Cuerpo técnico");
  await expect(note).toContainText("Editada");

  await note.getByRole("button", { name: "Borrar" }).click();
  await page.getByRole("alertdialog", { name: "¿Borrar esta nota?" }).getByRole("button", { name: "Borrar" }).click();
  await expect(page.getByText("E2E Buena actitud")).toHaveCount(0);
});

import type { Locator, Page } from "@playwright/test";
import { ARCANGEL } from "../scripts/seed/data";
import { seedId } from "../scripts/seed/ids";
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
  watchConsole,
} from "./helpers/train";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra Arcángel y Club Demo
// antes de los tests y guarda una sesión por usuario: aquí nadie pasa por el login, cada
// test abre la app con `openAs`.
//
// Este archivo va en el proyecto `admin` de Playwright (ver playwright.config.ts): monta
// sesiones en el constructor (`/train/{id}/edit`) y las guarda, en serie. Cada test crea la
// suya (`E2E builder {ts}`) desde «Nueva sesión» y ninguno afirma recuentos totales de filas
// de Entrenar. `restoreSeed` deja la base de datos como la dejó el arranque global, al empezar
// y al acabar. Con un Supabase que no es local nada se escribe: los tests se saltan.
//
// Que otro equipo y otro club reciben el 404 en `…/edit` lo prueba `practice-session.spec.ts`.
//
// Arrastrar se prueba con el ratón y con el teclado y, aparte, con el dedo: Playwright no tiene
// gesto de arrastre táctil, así que los toques se envían por CDP (solo Chromium, que es el
// navegador de los dos proyectos).
test.describe.configure({ mode: "serial" });

const ALEX = "alex@arcangel.test"; // entrenador de Alevín A
const IRENE = "irene@arcangel.test"; // ayudante de Alevín A, con Álex

const NEEDS_LOCAL_DB = "Escribe en la base de datos (crea sesiones y guarda sus ejercicios): solo con un Supabase local.";

const STALE_COPY = "Alguien ha cambiado esto mientras editabas. Recarga para ver la última versión.";

// Mismo instante que el arranque global: la base de datos queda como la dejó él.
async function restore(): Promise<void> {
  if (!CAN_WRITE) return;
  await restoreSeed(seedNow());
}

test.beforeAll(restore);
test.afterAll(restore);

/** Un título que no se repite entre tests ni entre ejecuciones. */
function sessionTitle(): string {
  return `E2E builder ${Date.now()}`;
}

/** Álex crea una sesión de una hora dentro de tres días y queda en su constructor. Devuelve su id. */
function newSession(page: Page, name: string): Promise<string> {
  return createSession(page, ALEX, { title: name, date: inDays(3), time: "18:00", minutes: "60" });
}

/** Las filas del constructor (la cabecera tiene su propia lista, la de objetivos). */
function rows(page: Page): Locator {
  return page.getByRole("main").locator("li[data-row]");
}

/** El orden de la lista, por los títulos que se ven en las filas. */
async function expectOrder(page: Page, titles: string[]): Promise<void> {
  await expect(rows(page).locator('[data-control="toggle"] > span:last-child')).toHaveText(titles);
}

/** La suma de la barra de guardado: «Total» y sus minutos. */
function total(page: Page): Locator {
  return page.getByRole("main").getByText("Total", { exact: true }).locator("..");
}

function saveButton(page: Page): Locator {
  return page.getByRole("button", { name: "Guardar sesión" });
}

function addButton(page: Page): Locator {
  return page.getByRole("button", { name: "Añadir bloque libre" });
}

/** El editor de la fila abierta de `name`: sus campos «Fase», «Título» y «Notas». */
function rowEditor(page: Page, name: string): Locator {
  return page.getByRole("group", { name: `Editar ${name}`, exact: true });
}

/** Añade un bloque libre al final, con su título y, si se da, su fase. Queda abierto. */
async function addBlock(page: Page, name: string, phase?: string): Promise<void> {
  await addButton(page).click();
  // Nace abierto, con el foco en «Título»: se escribe sin tocar nada más.
  await expect(field(rowEditor(page, "Sin título"), "Título")).toBeFocused();
  await page.keyboard.type(name);
  await expect(field(rowEditor(page, name), "Título")).toHaveValue(name);
  if (phase) await field(rowEditor(page, name), "Fase").selectOption({ label: phase });
}

/** Guarda la lista y espera a que la pantalla lo diga. */
async function save(page: Page): Promise<void> {
  await saveButton(page).click();
  await expect(page.getByText("Sesión guardada.")).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
}

/**
 * Espera a que dnd-kit escuche el teclado tras coger una fila con Espacio. Engancha sus teclas
 * un turno después (un temporizador a cero), y una tecla enviada antes se pierde: una persona
 * no llega a tiempo, Playwright sí. Un temporizador puesto ahora corre detrás del suyo.
 */
async function keyboardDragReady(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

/** Vuelve a pedir el constructor al servidor y espera a que React lo tenga. */
async function reloadBuilder(page: Page): Promise<void> {
  await page.reload();
  await hydrated(addButton(page));
}

const A = "Rueda de pases";
const B = "Tres calles";
const C = "Dos contra dos";

test("montar una sesión", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const name = sessionTitle();
  const eventId = await newSession(page, name);

  // Recién creada: sin ejercicios, con el total a cero y nada que guardar.
  await expect(page.getByRole("heading", { level: 2, name: "Esta sesión aún no tiene ejercicios" })).toBeVisible();
  await expect(total(page)).toContainText("0'");
  await expect(saveButton(page)).toBeDisabled();

  await addBlock(page, A, "Activación");
  await addBlock(page, B, "Técnica");
  await addBlock(page, C, "Competición");
  await expectOrder(page, [A, B, C]);
  await expect(rows(page)).toContainText(["01", "02", "03"]);
  await expect(total(page)).toContainText("30'");

  await page.getByRole("button", { name: `Más minutos, ${B}` }).click();
  await expect(rows(page).nth(1)).toContainText("15'");
  await expect(total(page)).toContainText("35'");

  await save(page);
  await page.screenshot({ path: "test-results/train-builder-saved-375.png" });

  // Tras recargar siguen ahí, en su orden, con su fase y sus minutos.
  await reloadBuilder(page);
  await expectOrder(page, [A, B, C]);
  await expect(rows(page).nth(0)).toContainText("Activación");
  await expect(rows(page).nth(1)).toContainText("Técnica");
  await expect(rows(page).nth(1)).toContainText("15'");
  await expect(rows(page).nth(2)).toContainText("Competición");
  await expect(total(page)).toContainText("35'");
  await expect(saveButton(page)).toBeDisabled();

  // Y el detalle muestra el total.
  await page.getByRole("link", { name: "Volver a la sesión" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/${eventId}$`));
  const main = page.getByRole("main");
  await expect(title(page)).toHaveText(name);
  await expect(main.getByText("Total", { exact: true }).locator("..")).toContainText("35'");
  await expect(main).toContainText("35 min · 3 ejercicios");
});

test("reordenar de tres maneras", async ({ page }) => {
  // Review Focus 4: arrastrar con el dedo falla o no se puede, y «Subir» y «Bajar» y el teclado
  // reordenan igual.
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await newSession(page, sessionTitle());
  await addBlock(page, A);
  await addBlock(page, B);
  await addBlock(page, C);
  // Se cierra la fila abierta: las tres miden lo mismo.
  await page.getByRole("button", { name: C, exact: true }).click();
  await expectOrder(page, [A, B, C]);

  // 1. Con el botón: «Bajar» en la fila abierta.
  await page.getByRole("button", { name: A, exact: true }).click();
  await page.getByRole("button", { name: `Bajar ${A}` }).click();
  await expectOrder(page, [B, A, C]);
  await expect(rows(page)).toContainText(["01", "02", "03"]);
  await page.getByRole("button", { name: A, exact: true }).click();

  // 2. Con el ratón, por el asa: la última fila sube a la primera posición. El arrastre no
  // empieza hasta pasar de 8 px, así que el ratón se mueve en varios pasos.
  const handle = page.getByRole("button", { name: `Mover ${C}` });
  const from = await handle.boundingBox();
  const target = await rows(page).first().boundingBox();
  if (!from || !target) throw new Error("No se pudieron medir el asa y la primera fila.");
  const x = from.x + from.width / 2;
  await page.mouse.move(x, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, from.y + from.height / 2 - 12, { steps: 4 });
  await page.mouse.move(x, target.y + target.height / 2 - 4, { steps: 12 });
  await expect(page.getByText(`${C} está en la posición 1 de 3.`)).toBeAttached();
  await page.mouse.up();
  await expectOrder(page, [C, B, A]);

  // 3. Con el teclado, desde el asa: Espacio la coge, flecha abajo la baja y Espacio la suelta.
  await handle.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText(`Has cogido ${C}.`)).toBeAttached();
  await keyboardDragReady(page);
  await page.keyboard.press("ArrowDown");
  await expect(page.getByText(`${C} está en la posición 2 de 3.`)).toBeAttached();
  await page.keyboard.press("Space");
  await expect(page.getByText(`Has soltado ${C} en la posición 2.`)).toBeAttached();
  await expectOrder(page, [B, C, A]);
  await expect(rows(page)).toContainText(["01", "02", "03"]);
  // El foco sigue en el asa: se puede seguir moviendo sin volver a buscarla.
  await expect(handle).toBeFocused();

  // Tras guardar y recargar, el orden se mantiene.
  await save(page);
  await reloadBuilder(page);
  await expectOrder(page, [B, C, A]);
});

test.describe("con el dedo", () => {
  test.use({ hasTouch: true });

  test("el asa arrastra y el resto de la fila desplaza la página", async ({ page }) => {
    // Review Focus 4. No guarda nada: mueve una fila de una sesión del seed y la deja sin guardar.
    const session = ARCANGEL.teams
      .find((team) => team.key === "alevin-a")
      ?.sessions.find((candidate) => candidate.title === "Transición + rebote defensivo");
    if (!session) throw new Error("El seed ya no tiene la sesión «Transición + rebote defensivo» de Alevín A.");
    const [first, second, ...others] = session.items.map((item) => item.title);

    await openAs(page, ALEX);
    await page.goto(`${CLUB}/train/${seedId(ARCANGEL.slug, "event:alevin-a:upcoming-0")}/edit`);
    await hydrated(addButton(page));
    await expectOrder(page, [first, second, ...others]);

    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0) =>
      cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
    /** Un dedo que se posa en `from`, espera `holdMs` y se desliza en vertical hasta `toY`. */
    async function swipe(from: { x: number; y: number }, toY: number, holdMs: number): Promise<void> {
      await touch("touchStart", from.x, from.y);
      await page.waitForTimeout(holdMs);
      const steps = 12;
      for (let step = 1; step <= steps; step += 1) {
        await touch("touchMove", from.x, from.y + ((toY - from.y) * step) / steps);
        await page.waitForTimeout(16);
      }
      await touch("touchEnd");
    }
    const centre = (box: { x: number; y: number; width: number; height: number } | null) => {
      if (!box) throw new Error("No se pudo medir la fila.");
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };

    // Sobre el título de la fila, el dedo desplaza la página y no mueve nada, aunque se quede
    // quieto un momento antes de deslizar.
    const body = centre(await rows(page).first().locator('[data-control="toggle"]').boundingBox());
    await swipe(body, body.y - 200, 250);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    await expectOrder(page, [first, second, ...others]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

    // Sobre el asa, un deslizamiento rápido no arrastra (ni desplaza): hay que mantener el dedo.
    const handle = page.getByRole("button", { name: `Mover ${first}` });
    const below = centre(await rows(page).nth(1).boundingBox()).y + 10;
    await swipe(centre(await handle.boundingBox()), below, 0);
    await expectOrder(page, [first, second, ...others]);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // Con el dedo quieto 150 ms en el asa, la fila se coge y se arrastra: baja un puesto.
    await swipe(centre(await handle.boundingBox()), below, 250);
    await expectOrder(page, [second, first, ...others]);
    await expect(rows(page)).toContainText(["01", "02", "03", "04", "05"]);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(saveButton(page)).toBeEnabled();
  });
});

test("dos entrenadores a la vez", async ({ page, browser }) => {
  // Review Focus 2: Álex e Irene, del mismo equipo, guardan la misma sesión a la vez. El
  // segundo guarda sobre una copia vieja: se le avisa, queda lo del primero y «Recargar» lo enseña.
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const eventId = await newSession(page, sessionTitle());
  await addBlock(page, A);
  await save(page);

  // Irene, en su propio contexto de navegador, abre el mismo constructor.
  const other = await browser.newContext();
  const otherErrors = watchConsole(other);
  const dialogs: string[] = [];
  try {
    const irene = await other.newPage();
    irene.on("dialog", (dialog) => {
      dialogs.push(dialog.type());
      void dialog.accept();
    });
    await openAs(irene, IRENE);
    await irene.goto(`${CLUB}/train/${eventId}/edit`);
    await hydrated(addButton(irene));
    await expectOrder(irene, [A]);

    // Álex añade un bloque y guarda.
    await addBlock(page, B);
    await save(page);

    // Irene, con la copia con la que abrió, cambia los minutos y guarda.
    await irene.getByRole("button", { name: `Más minutos, ${A}` }).click();
    await saveButton(irene).click();
    // `role="alert"` también lo lleva el anunciador de rutas de Next: se filtra por el texto.
    const warning = irene.getByRole("alert").filter({ hasText: STALE_COPY });
    await expect(warning).toBeVisible();
    await irene.screenshot({ path: "test-results/train-builder-stale-375.png" });
    // No se ha guardado, y lo suyo sigue en pantalla hasta que decide recargar.
    await expect(irene.getByText("Sesión guardada.")).toHaveCount(0);
    await expect(rows(irene).first()).toContainText("15'");
    await expectOrder(irene, [A]);

    // «Recargar» enseña lo de Álex, sin que el navegador pregunte por los cambios que se tiran.
    await warning.getByRole("button", { name: "Recargar" }).click();
    await expectOrder(irene, [A, B]);
    await expect(rows(irene).first()).toContainText("10'");
    await expect(warning).toHaveCount(0);
    expect(dialogs, "«Recargar» no debe abrir el aviso de la pestaña").toEqual([]);

    // Y desde ahí Irene puede guardar: su copia ya es la última.
    await hydrated(addButton(irene));
    await irene.getByRole("button", { name: `Más minutos, ${A}` }).click();
    await save(irene);
  } finally {
    await other.close();
  }
  expect(otherErrors, "la sesión de Irene no debe registrar errores de consola").toEqual([]);

  // Álex, al recargar, ve lo que guardó Irene.
  await reloadBuilder(page);
  await expectOrder(page, [A, B]);
  await expect(rows(page).first()).toContainText("15'");
});

test("salir sin guardar", async ({ page }) => {
  // Review Focus 5: se sale con cambios sin guardar.
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const eventId = await newSession(page, sessionTitle());
  await addBlock(page, A);
  await save(page);
  const edit = new RegExp(`${CLUB}/train/${eventId}/edit$`);
  const back = page.getByRole("link", { name: "Volver a la sesión" });
  const dialog = page.getByRole("alertdialog", { name: "¿Salir sin guardar?" });

  await page.getByRole("button", { name: `Más minutos, ${A}` }).click();
  await expect(rows(page).first()).toContainText("15'");

  // «Seguir editando» conserva el cambio.
  await back.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Tienes cambios sin guardar. Si sales, se pierden.");
  await dialog.getByRole("button", { name: "Seguir editando" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(edit);
  await expect(rows(page).first()).toContainText("15'");
  await expect(saveButton(page)).toBeEnabled();

  // «Salir sin guardar» lleva al detalle, sin el cambio.
  await back.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Salir sin guardar" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/${eventId}$`));
  const main = page.getByRole("main");
  await expect(main.getByText("Total", { exact: true }).locator("..")).toContainText("10'");
  await expect(main).toContainText("10 min · 1 ejercicio");
});

test("editar los datos", async ({ page }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  const name = sessionTitle();
  const eventId = await newSession(page, name);
  const main = page.getByRole("main");
  await expect(main).toContainText("18:00–19:00");

  // «Fecha y datos» empieza cerrado; abierto, es el formulario de la sesión.
  const toggle = page.getByRole("button", { name: "Fecha y datos" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const data = page.getByRole("group", { name: "Fecha y datos" });
  await expect(field(data, "Título")).toHaveValue(name);
  await expect(field(data, "Fecha")).toHaveValue(inDays(3));
  await expect(field(data, "Hora")).toHaveValue("18:00");
  await expect(field(data, "Duración (min)")).toHaveValue("60");

  await field(data, "Hora").fill("19:00");
  await field(data, "Lugar").fill("Pabellón 3");
  await data.getByRole("button", { name: "Guardar datos" }).click();
  await expect(data.getByText("Datos guardados.")).toBeVisible();
  // La cabecera del constructor ya dice la franja nueva, sin recargar.
  await expect(main).toContainText("19:00–20:00");
  await expect(main).not.toContainText("18:00–19:00");

  // «Guardar sesión» sigue funcionando sin recargar: la copia es una sola para los datos y
  // para los ejercicios.
  await addBlock(page, A);
  await save(page);
  await expect(page.getByRole("alert").filter({ hasText: STALE_COPY })).toHaveCount(0);

  // El detalle muestra la franja nueva, el lugar y el ejercicio.
  await page.getByRole("link", { name: "Volver a la sesión" }).click();
  await expect(page).toHaveURL(new RegExp(`${CLUB}/train/${eventId}$`));
  await expect(main).toContainText("19:00–20:00");
  await expect(main).toContainText("10 min · 1 ejercicio · Pabellón 3");
});

test("una sesión hecha no se edita", async ({ page }) => {
  // Review Focus 5: una sesión hecha o cancelada es de solo lectura. No escribe nada.
  await openAs(page, ALEX);

  for (const [key, sessionName, state] of [
    ["past-0", "Tiro tras bote", "Hecho"],
    ["cancelled-0", "Tiro libre y finalizaciones", "Cancelada"],
  ] as const) {
    const detail = `${CLUB}/train/${seedId(ARCANGEL.slug, `event:alevin-a:${key}`)}`;
    await page.goto(`${detail}/edit`);

    await expect(page).toHaveURL(new RegExp(`${detail}$`));
    await expect(title(page)).toHaveText(sessionName);
    await expect(page.getByRole("main")).toContainText(state);
    await expect(saveButton(page)).toHaveCount(0);
    await expect(addButton(page)).toHaveCount(0);
  }
});

test("cabe en el móvil", async ({ page, browserErrors }) => {
  test.skip(!CAN_WRITE, NEEDS_LOCAL_DB);
  await newSession(page, sessionTitle());
  await addBlock(page, "Movilidad articular con balón y rueda de pases en dos filas", "Vuelta a la calma");
  await addBlock(page, B, "Técnica");
  await addBlock(page, C);
  const main = page.getByRole("main");
  // Todo lo que se puede tocar y está a la vista: el asa, los minutos, la fila abierta con sus
  // campos y «Subir», «Bajar» y «Quitar», los botones de añadir y de guardar.
  const targets = main.locator("button:visible, a:visible, input:visible, select:visible, textarea:visible");

  await expectFitsMobile(page);
  await expectTouchTargets(targets);
  for (const name of [`Mover ${C}`, `Más minutos, ${C}`, `Menos minutos, ${C}`, `Subir ${C}`, `Bajar ${C}`, `Quitar ${C}`]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
  await page.screenshot({ path: "test-results/train-builder-375.png" });

  // La barra de guardado queda justo encima de la navegación, y con la página al final no tapa
  // ni la última fila ni el botón de añadir.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const [bar, nav, add, last] = await Promise.all([
    saveButton(page).locator("..").boundingBox(),
    page.getByRole("navigation", { name: "Principal" }).boundingBox(),
    addButton(page).boundingBox(),
    rows(page).last().boundingBox(),
  ]);
  if (!bar || !nav || !add || !last) throw new Error("No se pudo medir la barra de guardado.");
  expect(bar.y + bar.height, "la barra no tapa la navegación").toBeLessThanOrEqual(nav.y + 1);
  expect(add.y + add.height, "la barra no tapa «Añadir bloque libre»").toBeLessThanOrEqual(bar.y);
  expect(last.y + last.height, "la barra no tapa la última fila").toBeLessThanOrEqual(bar.y);
  await page.screenshot({ path: "test-results/train-builder-bottom-375.png" });

  // Con «Fecha y datos» abierto, lo mismo.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole("button", { name: "Fecha y datos" }).click();
  await expect(field(page.getByRole("group", { name: "Fecha y datos" }), "Lugar")).toBeVisible();
  await expectFitsMobile(page);
  await expectTouchTargets(targets);
  await page.screenshot({ path: "test-results/train-builder-data-375.png", fullPage: true });

  expect(browserErrors.seen).toEqual([]);
});

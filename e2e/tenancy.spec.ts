import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers/auth";

// Necesita Supabase local con `pnpm seed` (Arcángel y Club Demo).

const ALEX = "alex@arcangel.test"; // entrenador de Arcángel
const MARTA = "marta@demo.test"; // entrenadora de Club Demo

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Principal" });
}

/** El acento que el layout del club deja en su contenedor, tal como llega al navegador. */
async function brandAccent(page: Page): Promise<string> {
  return page
    .locator("[data-club]")
    .evaluate((element) => getComputedStyle(element).getPropertyValue("--brand-accent").trim());
}

test("un club ajeno y uno inexistente dan el mismo 404", async ({ page }) => {
  // Review Focus 1: Álex es de Arcángel; Club Demo existe, pero no es su club.
  await loginAs(page, ALEX);
  await expect(page).toHaveURL(/\/c\/arcangel$/);

  const seen: Array<{ path: string; status: number | undefined; text: string; html: string }> = [];
  for (const path of ["/c/club-demo", "/c/no-existe", "/c/club-demo/way"]) {
    const response = await page.goto(path);

    await expect(
      page.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Volver a tus clubes" })).toHaveAttribute(
      "href",
      "/select-club",
    );

    // Nada del club ajeno: ni su nombre, ni su marca, ni su navegación. Tampoco en lo
    // que viaja en el HTML sin verse (los datos que Next manda al navegador).
    await expect(page.locator("body")).not.toContainText("Club Demo");
    await expect(page.locator("[data-club]")).toHaveCount(0);
    await expect(mainNav(page)).toHaveCount(0);
    const pageHtml = await page.content();
    expect(pageHtml).not.toContain("Club Demo");
    expect(pageHtml).not.toContain("Nuestra forma");
    expect(pageHtml.toLowerCase()).not.toContain("#3fb8af");

    const main = page.locator("main");
    await expect(main).toContainText("No encontramos esta página");
    seen.push({
      path,
      status: response?.status(),
      text: await main.innerText(),
      html: await main.innerHTML(),
    });
  }

  const [foreign, missing, foreignTab] = seen;
  expect(missing.text).toBe(foreign.text);
  expect(missing.html).toBe(foreign.html);
  expect(foreignTab.html).toBe(foreign.html);
  // Tampoco el código de respuesta distingue un caso del otro.
  expect(foreign.status).toBe(404);
  expect(missing.status).toBe(404);
  expect(foreignTab.status).toBe(404);

  // La salida funciona: de vuelta a su club.
  await page.getByRole("link", { name: "Volver a tus clubes" }).click();
  await expect(page).toHaveURL(/\/c\/arcangel$/);
});

test("cada club pinta su acento", async ({ page }) => {
  await loginAs(page, ALEX);
  await expect(page).toHaveURL(/\/c\/arcangel$/);
  await expect(page.locator("[data-club]")).toHaveAttribute("data-club", "arcangel");
  expect(await brandAccent(page)).toBe("#c9a45c");
  // Y se ve: la pestaña activa va en el acento del club.
  await expect(mainNav(page).getByRole("link", { name: "Inicio" })).toHaveCSS(
    "color",
    "rgb(201, 164, 92)",
  );

  await loginAs(page, MARTA);
  await expect(page).toHaveURL(/\/c\/club-demo$/);
  await expect(page.locator("[data-club]")).toHaveAttribute("data-club", "club-demo");
  expect(await brandAccent(page)).toBe("#3fb8af");
  await expect(mainNav(page).getByRole("link", { name: "Inicio" })).toHaveCSS(
    "color",
    "rgb(63, 184, 175)",
  );
});

test("la terminología llega a la navegación", async ({ page }) => {
  await loginAs(page, MARTA);
  await expect(page).toHaveURL(/\/c\/club-demo$/);
  await expect(mainNav(page).getByRole("link")).toHaveText([
    "Inicio",
    "Nuestra forma",
    "Entrenar",
    "Partidos",
    "Equipo",
  ]);
  await expect(mainNav(page).getByRole("link", { name: "Inicio" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // La pestaña lleva a su sección, con el nombre que le da el club, y pasa a ser la activa.
  await mainNav(page).getByRole("link", { name: "Nuestra forma" }).click();
  await expect(page).toHaveURL(/\/c\/club-demo\/way$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Nuestra forma llega en una próxima fase" }),
  ).toBeVisible();
  await expect(page.getByText("Estamos preparando esta sección.")).toBeVisible();
  await expect(mainNav(page).getByRole("link", { name: "Nuestra forma" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(mainNav(page).locator('[aria-current="page"]')).toHaveCount(1);

  await loginAs(page, ALEX);
  await expect(page).toHaveURL(/\/c\/arcangel$/);
  await expect(mainNav(page).getByRole("link")).toHaveText([
    "Inicio",
    "The Way",
    "Entrenar",
    "Partidos",
    "Equipo",
  ]);
});

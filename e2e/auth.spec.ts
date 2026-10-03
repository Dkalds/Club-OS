import { expect, test } from "@playwright/test";
import { createAdminClient } from "../scripts/lib/admin-client";
import { loginAs, requestCodeFor } from "./helpers/auth";

// Necesita Supabase local con `pnpm seed` (usuarios y clubes de ejemplo).

test("el entrenador entra y aterriza en su club", async ({ page }) => {
  await loginAs(page, "alex@arcangel.test");

  await expect(page).toHaveURL(/\/c\/arcangel$/);
});

test("quien administra un club también aterriza en él", async ({ page }) => {
  // Un admin puede leer las membresías de todo su club; el selector solo cuenta la suya.
  await loginAs(page, "raul@arcangel.test");

  await expect(page).toHaveURL(/\/c\/arcangel$/);
});

test("un usuario sin club ve el aviso", async ({ page }) => {
  await loginAs(page, "sin.club@clubos.test");

  await expect(page).toHaveURL(/\/select-club$/);
  await expect(
    page.getByRole("heading", { name: "Tu cuenta no tiene acceso a ningún club" }),
  ).toBeVisible();
  await expect(
    page.getByText("Si crees que es un error, pide una nueva invitación a tu club."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
});

test("salir cierra la sesión", async ({ page }) => {
  await loginAs(page, "sin.club@clubos.test");

  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/select-club");
  await expect(page).toHaveURL(/\/login$/);
});

test("sin sesión no se entra en un club", async ({ page }) => {
  await page.goto("/c/arcangel");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entra en tu club" })).toBeVisible();
});

test("un email sin invitación ve lo mismo que uno invitado y no crea usuario", async ({
  page,
  context,
}) => {
  const invited = "irene@arcangel.test";
  const stranger = "nadie@clubos.test";

  const screens: string[] = [];
  for (const email of [invited, stranger]) {
    await requestCodeFor(page, email);

    await expect(
      page.getByText("Si tu email tiene acceso, te hemos enviado un código de 6 dígitos."),
    ).toBeVisible();
    screens.push((await page.locator("main").innerText()).replace(email, "<email>"));
    // Tampoco las cookies delatan si la cuenta existe: pedir el código no deja ninguna.
    expect(await context.cookies()).toEqual([]);
  }
  expect(screens[1]).toBe(screens[0]);

  const { data, error } = await createAdminClient().auth.admin.listUsers({ perPage: 200 });
  expect(error).toBeNull();
  expect(data.users.map((user) => user.email)).not.toContain(stranger);
});

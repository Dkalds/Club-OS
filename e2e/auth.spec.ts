import { findAuthUser } from "../scripts/lib/login-code";
import { lastCodeSentAt, loginAs, requestCodeFor } from "./helpers/auth";
import { expect, test } from "./helpers/test";

// Necesita el Supabase local arrancado. `e2e/global-setup.ts` siembra los usuarios y los
// clubes de ejemplo antes de los tests.
//
// Este archivo prueba el acceso en sí, así que aquí cada test entra de verdad con
// `loginAs` (una verificación de código por login). Los demás specs reutilizan la sesión
// guardada en el arranque global (`openAs`).

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
  // Con su propio login: la sesión que se cierra aquí no es ninguna de las guardadas que
  // comparten los demás tests (y «Salir» solo cierra la de este navegador).
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
  const startedAt = Date.now();

  const screens: string[] = [];
  for (const email of [stranger, invited]) {
    await requestCodeFor(page, email);

    await expect(
      page.getByText("Si tu email tiene acceso, te hemos enviado un código de 6 dígitos."),
    ).toBeVisible();
    screens.push((await page.locator("main").innerText()).replace(email, "<email>"));
    // Tampoco las cookies delatan si la cuenta existe: pedir el código no deja ninguna.
    expect(await context.cookies()).toEqual([]);
  }
  expect(screens[1]).toBe(screens[0]);

  // La app pide el código a Auth después de responder (`after()`). Para la invitada, esa
  // petición tiene que llegar: `loginAs` genera sus propios códigos y no lo notaría.
  await expect
    .poll(async () => (await lastCodeSentAt(invited)) ?? 0, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(startedAt - 1_000);

  // La del email sin invitación salió antes; a estas alturas Auth ya la ha rechazado. La
  // búsqueda recorre todas las páginas de usuarios: con la primera sola, un proyecto con más
  // de 200 usuarios habría pasado esta comprobación sin mirar de verdad.
  expect(await findAuthUser(stranger)).toBeUndefined();
});

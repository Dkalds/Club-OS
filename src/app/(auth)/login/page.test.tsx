import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/auth/actions", () => ({
  requestLoginCode: vi.fn(),
  verifyLoginCode: vi.fn(),
  demoLogin: vi.fn(),
}));

import LoginPage from "./page";

function buttonNames(): Array<string | null> {
  return screen.getAllByRole("button").map((button) => button.textContent);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LoginPage", () => {
  it("sin variables de demo solo ofrece el acceso por código", () => {
    vi.stubEnv("DEMO_LOGIN_COACH_EMAIL", undefined);
    vi.stubEnv("DEMO_LOGIN_ADMIN_EMAIL", undefined);
    vi.stubEnv("DEMO_LOGIN_PASSWORD", undefined);

    render(<LoginPage />);

    expect(buttonNames()).toEqual(["Enviar código"]);
    expect(screen.queryByRole("heading", { name: "Demo" })).toBeNull();
  });

  it("con las variables de demo, sus botones van debajo del acceso por código", () => {
    // Emails neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
    vi.stubEnv("DEMO_LOGIN_COACH_EMAIL", "coach@club-a.test");
    vi.stubEnv("DEMO_LOGIN_ADMIN_EMAIL", "admin@club-a.test");
    vi.stubEnv("DEMO_LOGIN_PASSWORD", "una-clave-larga-de-demo");

    render(<LoginPage />);

    expect(buttonNames()).toEqual([
      "Enviar código",
      "Probar como entrenador",
      "Probar como dirección",
    ]);
  });

  it("la contraseña y los emails de demo no salen en la página", () => {
    vi.stubEnv("DEMO_LOGIN_COACH_EMAIL", "coach@club-a.test");
    vi.stubEnv("DEMO_LOGIN_ADMIN_EMAIL", "admin@club-a.test");
    vi.stubEnv("DEMO_LOGIN_PASSWORD", "una-clave-larga-de-demo");

    const { container } = render(<LoginPage />);

    expect(container.innerHTML).not.toContain("una-clave-larga-de-demo");
    expect(container.innerHTML).not.toContain("club-a.test");
  });
});

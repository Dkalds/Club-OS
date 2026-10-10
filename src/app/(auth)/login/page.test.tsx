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
  it("el título es el <h1> y la pizarra, que va delante, es decorativa", () => {
    const { container } = render(<LoginPage />);

    const title = screen.getByRole("heading", { level: 1, name: "Entra en tu club" });
    const board = container.querySelector("svg");
    expect(board).toHaveAttribute("aria-hidden", "true");
    expect(board?.compareDocumentPosition(title)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("la pizarra y el formulario comparten ámbito: la jugada sigue al paso del acceso", () => {
    const { container } = render(<LoginPage />);

    const scope = container.querySelector("[data-court-scope]");
    expect(scope).toContainElement(container.querySelector("svg"));
    expect(scope).toContainElement(screen.getByRole("button", { name: "Enviar código" }));
  });

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

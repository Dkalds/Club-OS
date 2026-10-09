import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ demoLogin: vi.fn() }));

vi.mock("@/modules/auth/actions", () => ({ demoLogin: mocks.demoLogin }));

import { DemoLogin } from "./demo-login";

const COACH = "Probar como entrenador";
const ADMIN = "Probar como dirección";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.demoLogin.mockResolvedValue({});
});

describe("DemoLogin", () => {
  it("sin ningún rol con demo no pinta nada", () => {
    const { container } = render(<DemoLogin roles={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("un botón por rol con demo", () => {
    render(<DemoLogin roles={["coach", "admin"]} />);

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      COACH,
      ADMIN,
    ]);
  });

  it("solo el botón del rol que tiene demo", () => {
    render(<DemoLogin roles={["admin"]} />);

    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([ADMIN]);
  });

  it.each([
    [COACH, "coach"],
    [ADMIN, "admin"],
  ])("«%s» envía su rol y nada más", async (name, role) => {
    render(<DemoLogin roles={["coach", "admin"]} />);

    fireEvent.click(screen.getByRole("button", { name }));

    await waitFor(() => expect(mocks.demoLogin).toHaveBeenCalledTimes(1));
    const formData = mocks.demoLogin.mock.calls[0][1] as FormData;
    expect([...formData.entries()]).toEqual([["role", role]]);
  });

  it("si no se puede entrar, enseña el aviso de la acción", async () => {
    mocks.demoLogin.mockResolvedValue({ error: "No se ha podido entrar. Inténtalo de nuevo." });
    render(<DemoLogin roles={["coach"]} />);

    fireEvent.click(screen.getByRole("button", { name: COACH }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se ha podido entrar. Inténtalo de nuevo.",
    );
  });

  // Los e2e buscan el botón del código con `getByRole("button", { name: "Entrar" })`, que
  // acierta con cualquier nombre que contenga «entrar». Un botón de demo que lo contuviera
  // rompería el login de los e2e contra un entorno con la demo encendida.
  it("ningún botón contiene «entrar» ni «enviar código» en su nombre", () => {
    render(<DemoLogin roles={["coach", "admin"]} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button.textContent).not.toMatch(/entrar|enviar código/i);
    }
  });
});

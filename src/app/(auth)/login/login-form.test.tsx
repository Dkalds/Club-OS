import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requestLoginCode: vi.fn(), verifyLoginCode: vi.fn() }));

vi.mock("@/modules/auth/actions", () => ({
  requestLoginCode: mocks.requestLoginCode,
  verifyLoginCode: mocks.verifyLoginCode,
}));

import { LoginForm } from "./login-form";

const EMAIL = "coach@club-a.test";

async function reachCodeStep(): Promise<HTMLElement> {
  render(<LoginForm />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: EMAIL } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar código" }));
  return screen.findByLabelText("Código");
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requestLoginCode.mockResolvedValue({ step: "code", email: EMAIL });
});

// La pizarra del login (`CourtPlay`) sigue al formulario por `data-court-stage`.
describe("LoginForm: fase de la jugada", () => {
  it("en el paso del email no hay fase: la jugada espera", () => {
    const { container } = render(<LoginForm />);

    expect(container.querySelector("[data-court-stage]")).toBeNull();
  });

  it("al pedir el código, la fase es el pase", async () => {
    const code = await reachCodeStep();

    expect(code.closest("form")).toHaveAttribute("data-court-stage", "pass");
  });

  it("mientras se comprueba el código, la fase es la canasta", async () => {
    // La comprobación se queda a medias hasta que el test la suelta. Hay que soltarla: las
    // acciones de React van en cola, y una que no termina dejaría esperando a las de los
    // tests siguientes.
    let finish: (state: { step: "code"; email: string }) => void = () => {};
    mocks.verifyLoginCode.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const code = await reachCodeStep();

    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    const submit = screen.getByRole("button", { name: "Entrar" });
    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit.closest("form")).toHaveAttribute("data-court-stage", "score");

    finish({ step: "code", email: EMAIL });
    await waitFor(() => expect(submit).toBeEnabled());
  });

  it("si el código no vale, la jugada vuelve al pase", async () => {
    mocks.verifyLoginCode.mockResolvedValue({
      step: "code",
      email: EMAIL,
      error: "El código no es válido o ha caducado. Pide uno nuevo.",
    });
    const code = await reachCodeStep();

    fireEvent.change(code, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.closest("form")).toHaveAttribute("data-court-stage", "pass");
  });

  it("«Usar otro email» devuelve la jugada al principio", async () => {
    await reachCodeStep();

    fireEvent.click(screen.getByRole("button", { name: "Usar otro email" }));

    expect(document.querySelector("[data-court-stage]")).toBeNull();
    expect(screen.getByLabelText("Email")).toHaveValue(EMAIL);
  });
});

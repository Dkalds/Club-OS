import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppError from "./error";

// Lo que Next le pasa a un `error.tsx`. El mensaje y el `digest` llevan a propósito algo
// que no puede acabar en pantalla.
function failure(): Error & { digest?: string } {
  return Object.assign(new Error("no se pudo leer la fila de coach@club-a.test"), { digest: "DIGEST-4821" });
}

function renderError(retry = vi.fn(), reset = vi.fn()) {
  const view = render(<AppError error={failure()} reset={reset} retry={retry} />);
  return { ...view, retry, reset };
}

describe("error de la app (src/app/error.tsx)", () => {
  it("avisa de que la página no se pudo cargar, con un único <h1> dentro de <main>", () => {
    renderError();

    const main = screen.getByRole("main");
    const alert = within(main).getByRole("alert");
    expect(within(alert).getByRole("heading", { level: 1, name: "No se pudo cargar la página" })).toBeInTheDocument();
    expect(within(alert).getByText("Revisa la conexión y vuelve a intentarlo.")).toBeInTheDocument();
    expect(screen.getAllByRole("heading")).toHaveLength(1);
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

  it("«Reintentar» vuelve a pedir la página al servidor (retry), no solo repinta (reset)", () => {
    const { retry, reset } = renderError();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("no enseña ni el mensaje del error ni su identificador", () => {
    const { container } = renderError();

    expect(container).not.toHaveTextContent("coach@club-a.test");
    expect(container).not.toHaveTextContent("no se pudo leer");
    expect(container).not.toHaveTextContent("DIGEST-4821");
    expect(container.innerHTML).not.toContain("DIGEST-4821");
  });

  it("es de plataforma: la marca es «CLUB OS» y no lleva nada de ningún club", () => {
    const { container } = renderError();

    expect(screen.getByText("CLUB OS")).toBeInTheDocument();
    expect(container.querySelector("[data-club]")).toBeNull();
    expect(container.querySelector("[style]")).toBeNull();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

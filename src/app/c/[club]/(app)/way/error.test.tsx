import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WayError from "./error";

// Lo que Next le pasa a un `error.tsx`. El mensaje y el `digest` llevan a propósito algo
// que no puede acabar en pantalla.
function failure(): Error & { digest?: string } {
  return Object.assign(new Error("methodology.index: fallo leyendo a coach@club-a.test"), {
    digest: "DIGEST-4417",
  });
}

function renderError(retry = vi.fn(), reset = vi.fn()) {
  render(<WayError error={failure()} reset={reset} retry={retry} />);
  return { retry, reset };
}

describe("error de The Way (src/app/c/[club]/(app)/way/error.tsx)", () => {
  it("dice que no se pudo cargar la metodología, como alerta y con un único <h1>", () => {
    renderError();

    const alert = screen.getByRole("alert");
    expect(alert).toContainElement(
      screen.getByRole("heading", { level: 1, name: "No se pudo cargar la metodología" }),
    );
    expect(alert).toHaveTextContent("Revisa la conexión y vuelve a intentarlo.");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("«Reintentar» vuelve a pedir la página al servidor (retry), no solo repinta (reset)", () => {
    const { retry, reset } = renderError();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("no enseña el mensaje del error ni su digest", () => {
    renderError();

    expect(document.body).not.toHaveTextContent("coach@club-a.test");
    expect(document.body).not.toHaveTextContent("DIGEST-4417");
  });
});

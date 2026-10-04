import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PracticeError from "./error";

// Lo que Next le pasa a un `error.tsx`. El mensaje y el `digest` llevan a propósito algo
// que no puede acabar en pantalla.
function failure(): Error & { digest?: string } {
  return Object.assign(new Error("practice.detail: fallo leyendo a coach@club-a.test"), {
    digest: "DIGEST-4417",
  });
}

function renderError(retry = vi.fn(), reset = vi.fn()) {
  const view = render(<PracticeError error={failure()} reset={reset} retry={retry} />);
  return { ...view, retry, reset };
}

describe("error de la sesión (src/app/c/[club]/(app)/train/[eventId]/error.tsx)", () => {
  it("dice que no se pudo cargar la sesión, como alerta y con un único <h1>", () => {
    renderError();

    const alert = screen.getByRole("alert");
    expect(alert).toContainElement(
      screen.getByRole("heading", { level: 1, name: "No se pudo cargar la sesión" }),
    );
    expect(alert).toHaveTextContent("Revisa la conexión y vuelve a intentarlo.");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("lleva el margen lateral de la pantalla, como el contenido al que sustituye", () => {
    const { container } = renderError();

    expect(container.firstElementChild).toHaveClass("px-(--space-4)");
  });

  it("«Reintentar» vuelve a pedir la página al servidor (retry), no solo repinta (reset)", () => {
    const { retry, reset } = renderError();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("no enseña el mensaje del error ni su digest", () => {
    const { container } = renderError();

    expect(container).not.toHaveTextContent("coach@club-a.test");
    expect(container).not.toHaveTextContent("practice.detail");
    expect(container.innerHTML).not.toContain("DIGEST-4417");
  });

  it("no pone su propio <main>: va dentro del marco del club", () => {
    const { container } = renderError();

    expect(container.querySelector("main")).toBeNull();
  });
});

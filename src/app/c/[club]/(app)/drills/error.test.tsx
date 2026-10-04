import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const params = vi.hoisted(() => ({ club: "club-a" }));

vi.mock("next/navigation", () => ({ useParams: () => ({ club: params.club }) }));

import DrillsError from "./error";

// Lo que Next le pasa a un `error.tsx`. El mensaje y el `digest` llevan a propósito algo
// que no puede acabar en pantalla.
function failure(): Error & { digest?: string } {
  return Object.assign(new Error("drills.search: fallo leyendo a coach@club-a.test"), {
    digest: "DIGEST-5521",
  });
}

function renderError(retry = vi.fn(), reset = vi.fn()) {
  const view = render(<DrillsError error={failure()} reset={reset} retry={retry} />);
  return { ...view, retry, reset };
}

beforeEach(() => {
  params.club = "club-a";
});

describe("error de la biblioteca (src/app/c/[club]/(app)/drills/error.tsx)", () => {
  it("dice que no se pudo cargar la biblioteca, como alerta y con un único <h1>", () => {
    renderError();

    const alert = screen.getByRole("alert");
    expect(alert).toContainElement(
      screen.getByRole("heading", { level: 1, name: "No se pudo cargar la biblioteca" }),
    );
    expect(alert).toHaveTextContent("Revisa la conexión y vuelve a intentarlo.");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("conserva la cabecera de detalle de la página, con su vuelta a Entrenar", () => {
    const { container } = renderError();

    expect(container.firstElementChild).toHaveAttribute("data-topnav", "detail");
    expect(container.firstElementChild).toHaveTextContent("Biblioteca");
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/c/club-a/train");
  });

  it("vuelve a Entrenar del club de la URL", () => {
    params.club = "club-b";

    renderError();

    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/c/club-b/train");
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
    expect(container).not.toHaveTextContent("drills.search");
    expect(container.innerHTML).not.toContain("DIGEST-5521");
  });

  it("no pone su propio <main>: va dentro del marco del club", () => {
    const { container } = renderError();

    expect(container.querySelector("main")).toBeNull();
  });
});

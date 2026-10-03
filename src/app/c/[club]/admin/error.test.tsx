import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AdminError from "./error";

// Lo que Next le pasa a un `error.tsx`. El mensaje y el `digest` llevan a propósito algo
// que no puede acabar en pantalla.
function failure(): Error & { digest?: string } {
  return Object.assign(new Error("admin.sections: fallo leyendo a admin@club-a.test"), {
    digest: "DIGEST-4410",
  });
}

function renderError(retry = vi.fn(), reset = vi.fn()) {
  const view = render(<AdminError error={failure()} reset={reset} retry={retry} />);
  return { ...view, retry, reset };
}

describe("error de Gestión (src/app/c/[club]/admin/error.tsx)", () => {
  it("dice que no se pudo cargar Gestión, como único <h1>", () => {
    renderError();

    const alert = screen.getByRole("alert");
    expect(alert).toContainElement(
      screen.getByRole("heading", { level: 1, name: "No se pudo cargar Gestión" }),
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

  it("no enseña ni el mensaje del error ni su identificador", () => {
    const { container } = renderError();

    expect(container).not.toHaveTextContent("admin@club-a.test");
    expect(container).not.toHaveTextContent("admin.sections");
    expect(container.innerHTML).not.toContain("DIGEST-4410");
  });

  it("no pone su propio <main>: va dentro del marco de Gestión, que ya lo tiene", () => {
    const { container } = renderError();

    expect(container.querySelector("main")).toBeNull();
  });
});

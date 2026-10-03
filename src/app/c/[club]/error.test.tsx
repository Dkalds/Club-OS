import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ pathname: "/c/club-a" }));

vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

import ClubError from "./error";

// Lo que Next le pasa a un `error.tsx`. El mensaje y el `digest` llevan a propósito algo
// que no puede acabar en pantalla.
function failure(): Error & { digest?: string } {
  return Object.assign(new Error("home.events: fallo leyendo a coach@club-a.test"), { digest: "DIGEST-7730" });
}

function renderError(retry = vi.fn(), reset = vi.fn()) {
  const view = render(<ClubError error={failure()} reset={reset} retry={retry} />);
  return { ...view, retry, reset };
}

beforeEach(() => {
  navigation.pathname = "/c/club-a";
});

describe("error dentro de un club (src/app/c/[club]/error.tsx)", () => {
  it("en Inicio dice que no se pudo cargar tu inicio", () => {
    renderError();

    const alert = screen.getByRole("alert");
    expect(alert).toContainElement(
      screen.getByRole("heading", { level: 1, name: "No se pudo cargar tu inicio" }),
    );
    expect(alert).toHaveTextContent("Revisa la conexión y vuelve a intentarlo.");
    expect(screen.getAllByRole("heading")).toHaveLength(1);
  });

  it("Inicio también es la ruta del club con la barra final", () => {
    navigation.pathname = "/c/club-a/";
    renderError();

    expect(screen.getByRole("heading", { level: 1, name: "No se pudo cargar tu inicio" })).toBeInTheDocument();
  });

  it.each(["/c/club-a/train", "/c/club-a/way", "/c/club-a/train/2f0c7a9e"])(
    "en otra pantalla del club (%s) no habla de Inicio",
    (pathname) => {
      navigation.pathname = pathname;
      renderError();

      expect(screen.getByRole("heading", { level: 1, name: "No se pudo cargar la página" })).toBeInTheDocument();
      expect(screen.queryByText("No se pudo cargar tu inicio")).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toHaveTextContent("Revisa la conexión y vuelve a intentarlo.");
    },
  );

  it("«Reintentar» vuelve a pedir la página al servidor (retry), no solo repinta (reset)", () => {
    const { retry, reset } = renderError();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(retry).toHaveBeenCalledTimes(1);
    expect(reset).not.toHaveBeenCalled();
  });

  it("no enseña ni el mensaje del error ni su identificador", () => {
    const { container } = renderError();

    expect(container).not.toHaveTextContent("coach@club-a.test");
    expect(container).not.toHaveTextContent("home.events");
    expect(container.innerHTML).not.toContain("DIGEST-7730");
  });

  it("no pone su propio <main>: va dentro del marco del club, que ya lo tiene", () => {
    const { container } = renderError();

    expect(container.querySelector("main")).toBeNull();
  });
});

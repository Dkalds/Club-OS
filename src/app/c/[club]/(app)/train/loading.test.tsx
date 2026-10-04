import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TrainLoading from "./loading";

describe("carga de Entrenar (src/app/c/[club]/(app)/train/loading.tsx)", () => {
  it("pinta el esqueleto de cuatro filas, como contenedor ocupado", () => {
    render(<TrainLoading />);

    const loading = screen.getByRole("status", { name: "Cargando" });
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading.querySelectorAll("li")).toHaveLength(4);
  });

  it("lleva el margen lateral de la pantalla, como el contenido al que sustituye", () => {
    const { container } = render(<TrainLoading />);

    expect(container.firstElementChild).toHaveClass("px-(--space-4)");
  });

  it("no pone su propio <h1> ni <main>: la pantalla aún no es nada", () => {
    const { container } = render(<TrainLoading />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("main")).toBeNull();
  });
});

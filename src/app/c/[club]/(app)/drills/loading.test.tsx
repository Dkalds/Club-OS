import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DrillsLoading from "./loading";

describe("carga de la biblioteca (src/app/c/[club]/(app)/drills/loading.tsx)", () => {
  it("pinta el esqueleto de seis filas, como contenedor ocupado", () => {
    render(<DrillsLoading />);

    const loading = screen.getByRole("status", { name: "Cargando" });
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading.querySelectorAll("li")).toHaveLength(6);
  });

  it("es el inicio de una sección, como la página: sin cabecera de detalle ni enlace de vuelta", () => {
    const { container } = render(<DrillsLoading />);

    expect(container.querySelector("[data-topnav]")).toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("no pone su propio <h1> ni <main>: la pantalla aún no es nada", () => {
    const { container } = render(<DrillsLoading />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("main")).toBeNull();
  });
});

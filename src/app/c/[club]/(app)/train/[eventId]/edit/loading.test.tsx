import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import EditPracticeLoading from "./loading";

describe("carga del constructor (src/app/c/[club]/(app)/train/[eventId]/edit/loading.tsx)", () => {
  it("pinta un esqueleto de filas, como contenedor ocupado", () => {
    render(<EditPracticeLoading />);

    const loading = screen.getByRole("status", { name: "Cargando" });
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading.querySelectorAll("li").length).toBeGreaterThan(0);
  });

  it("lleva el margen lateral de la pantalla, como el contenido al que sustituye", () => {
    const { container } = render(<EditPracticeLoading />);

    expect(container.firstElementChild).toHaveClass("px-(--space-4)");
  });

  it("no pone su propio <h1> ni <main>: la pantalla aún no es nada", () => {
    const { container } = render(<EditPracticeLoading />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("main")).toBeNull();
  });
});

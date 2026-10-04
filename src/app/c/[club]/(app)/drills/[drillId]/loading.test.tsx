import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const params = vi.hoisted(() => ({ club: "club-a" }));

vi.mock("next/navigation", () => ({ useParams: () => ({ club: params.club }) }));

import DrillLoading from "./loading";

beforeEach(() => {
  params.club = "club-a";
});

describe("carga de la ficha (src/app/c/[club]/(app)/drills/[drillId]/loading.tsx)", () => {
  it("pinta el esqueleto, como contenedor ocupado", () => {
    render(<DrillLoading />);

    expect(screen.getByRole("status", { name: "Cargando" })).toHaveAttribute("aria-busy", "true");
  });

  it("pinta la misma cabecera de detalle que la página, para que no cambie al llegar", () => {
    const { container } = render(<DrillLoading />);

    // Lo primero del contenido, igual que en la página: así el marco oculta la cabecera de marca.
    const header = container.firstElementChild;
    expect(header).toHaveAttribute("data-topnav", "detail");
    expect(header).toHaveTextContent("Ejercicio");
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/c/club-a/drills");
  });

  it("no lleva «Editar»: aún no se sabe si quien mira puede editar", () => {
    render(<DrillLoading />);

    expect(screen.queryByRole("link", { name: "Editar" })).not.toBeInTheDocument();
  });

  it("vuelve a la biblioteca del club de la URL", () => {
    params.club = "club-b";

    render(<DrillLoading />);

    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/c/club-b/drills");
  });

  it("no pone su propio <h1> ni <main>: la pantalla aún no es nada", () => {
    const { container } = render(<DrillLoading />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("main")).toBeNull();
  });
});

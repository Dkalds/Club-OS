import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const params = vi.hoisted(() => ({ club: "club-a" }));

vi.mock("next/navigation", () => ({ useParams: () => ({ club: params.club }) }));

import DrillsLoading from "./loading";

beforeEach(() => {
  params.club = "club-a";
});

describe("carga de la biblioteca (src/app/c/[club]/(app)/drills/loading.tsx)", () => {
  it("pinta el esqueleto de seis filas, como contenedor ocupado", () => {
    render(<DrillsLoading />);

    const loading = screen.getByRole("status", { name: "Cargando" });
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading.querySelectorAll("li")).toHaveLength(6);
  });

  it("pinta la misma cabecera de detalle que la página, para que no cambie al llegar", () => {
    const { container } = render(<DrillsLoading />);

    // Lo primero del contenido, igual que en la página: así el marco oculta la cabecera de marca.
    const header = container.firstElementChild;
    expect(header).toHaveAttribute("data-topnav", "detail");
    expect(header).toHaveTextContent("Biblioteca");
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/c/club-a/train");
  });

  it("vuelve a Entrenar del club de la URL", () => {
    params.club = "club-b";

    render(<DrillsLoading />);

    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/c/club-b/train");
  });

  it("no pone su propio <h1> ni <main>: la pantalla aún no es nada", () => {
    const { container } = render(<DrillsLoading />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("main")).toBeNull();
  });
});

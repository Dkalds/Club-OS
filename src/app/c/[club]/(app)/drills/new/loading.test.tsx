import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const params = vi.hoisted(() => ({ club: "club-a" }));

vi.mock("next/navigation", () => ({ useParams: () => ({ club: params.club }) }));

import NewDrillLoading from "./loading";

beforeEach(() => {
  params.club = "club-a";
});

describe("carga del formulario de alta (src/app/c/[club]/(app)/drills/new/loading.tsx)", () => {
  it("pinta el esqueleto de un formulario, como contenedor ocupado", () => {
    render(<NewDrillLoading />);

    expect(screen.getByRole("status", { name: "Cargando" })).toHaveAttribute("aria-busy", "true");
  });

  it("pinta la cabecera de detalle de su página, no la de la biblioteca de la que cuelga", () => {
    const { container } = render(<NewDrillLoading />);

    // Lo primero del contenido, igual que en la página: así el marco oculta la cabecera de marca.
    const header = container.firstElementChild;
    expect(header).toHaveAttribute("data-topnav", "detail");
    expect(header).toHaveTextContent("Nuevo ejercicio");
    expect(header).not.toHaveTextContent("Biblioteca");
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/c/club-a/drills");
  });

  it("vuelve a la biblioteca del club de la URL", () => {
    params.club = "club-b";

    render(<NewDrillLoading />);

    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/c/club-b/drills");
  });

  it("no pone su propio <h1> ni <main>: la pantalla aún no es nada", () => {
    const { container } = render(<NewDrillLoading />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("main")).toBeNull();
  });
});

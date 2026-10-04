import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const params = vi.hoisted(() => ({ club: "club-a", drillId: "00000000-0000-4000-8000-0000000000d1" }));

vi.mock("next/navigation", () => ({ useParams: () => ({ club: params.club, drillId: params.drillId }) }));

import EditDrillLoading from "./loading";

beforeEach(() => {
  params.club = "club-a";
  params.drillId = "00000000-0000-4000-8000-0000000000d1";
});

describe("carga del formulario de edición (src/app/c/[club]/(app)/drills/[drillId]/edit/loading.tsx)", () => {
  it("pinta el esqueleto de un formulario, como contenedor ocupado", () => {
    render(<EditDrillLoading />);

    expect(screen.getByRole("status", { name: "Cargando" })).toHaveAttribute("aria-busy", "true");
  });

  it("pinta la cabecera de detalle de su página, no la de la ficha de la que cuelga", () => {
    const { container } = render(<EditDrillLoading />);

    // Lo primero del contenido, igual que en la página: así el marco oculta la cabecera de marca.
    const header = container.firstElementChild;
    expect(header).toHaveAttribute("data-topnav", "detail");
    expect(header).toHaveTextContent("Editar ejercicio");
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute(
      "href",
      "/c/club-a/drills/00000000-0000-4000-8000-0000000000d1",
    );
  });

  it("vuelve a la ficha del ejercicio y del club de la URL", () => {
    params.club = "club-b";
    params.drillId = "00000000-0000-4000-8000-0000000000d9";

    render(<EditDrillLoading />);

    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute(
      "href",
      "/c/club-b/drills/00000000-0000-4000-8000-0000000000d9",
    );
  });

  it("no lleva acción en la cabecera ni su propio <h1> ni <main>: la pantalla aún no es nada", () => {
    const { container } = render(<EditDrillLoading />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("main")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });
});

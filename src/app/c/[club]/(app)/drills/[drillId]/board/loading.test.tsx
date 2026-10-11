import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOARD_VIEW } from "@/ui/board-drawing";

const params = vi.hoisted(() => ({ club: "club-a", drillId: "00000000-0000-4000-8000-0000000000d1" }));

vi.mock("next/navigation", () => ({ useParams: () => ({ club: params.club, drillId: params.drillId }) }));

import DrillBoardLoading from "./loading";

beforeEach(() => {
  params.club = "club-a";
  params.drillId = "00000000-0000-4000-8000-0000000000d1";
});

describe("carga del editor de la pizarra (src/app/c/[club]/(app)/drills/[drillId]/board/loading.tsx)", () => {
  it("pinta el hueco de la pista, como contenedor ocupado, y lo dice a quien no lo ve", () => {
    const { container } = render(<DrillBoardLoading />);

    const busy = container.querySelector("[aria-busy]");
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toContainElement(screen.getByText("Cargando la pizarra"));
    expect(screen.getByText("Cargando la pizarra")).toHaveClass("sr-only");
  });

  it("el hueco tiene la proporción de la media pista, la que se ve al abrir: no salta al llegar", () => {
    const { container } = render(<DrillBoardLoading />);

    const blocks = Array.from(container.querySelector("[aria-busy]")?.children ?? []);
    expect(blocks.filter((block) => block.classList.contains(BOARD_VIEW.half.aspect))).toHaveLength(1);
  });

  it("pinta la cabecera de detalle de su página, no la de la ficha de la que cuelga", () => {
    const { container } = render(<DrillBoardLoading />);

    // Lo primero del contenido, igual que en la página: así el marco oculta la cabecera de marca.
    const header = container.firstElementChild;
    expect(header).toHaveAttribute("data-topnav", "detail");
    expect(header).toHaveTextContent("Pizarra");
    expect(header).not.toHaveTextContent("Ejercicio");
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute(
      "href",
      "/c/club-a/drills/00000000-0000-4000-8000-0000000000d1",
    );
  });

  it("vuelve a la ficha del ejercicio y del club de la URL", () => {
    params.club = "club-b";
    params.drillId = "00000000-0000-4000-8000-0000000000d9";

    render(<DrillBoardLoading />);

    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute(
      "href",
      "/c/club-b/drills/00000000-0000-4000-8000-0000000000d9",
    );
  });

  it("no lleva acción en la cabecera ni su propio <h1> ni <main>: la pantalla aún no es nada", () => {
    const { container } = render(<DrillBoardLoading />);

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(container.querySelector("main")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

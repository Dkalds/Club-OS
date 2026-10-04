import { fireEvent, render, screen } from "@testing-library/react";
import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { BackLink } from "./back-link";

describe("BackLink", () => {
  it("es un enlace con la etiqueta como nombre y el destino dado", () => {
    render(<BackLink href="/c/club-a/way" label="El camino" />);

    expect(screen.getByRole("link", { name: "El camino" })).toHaveAttribute("href", "/c/club-a/way");
  });

  it("el chevron es decorativo: no se suma al nombre del enlace", () => {
    const { container } = render(<BackLink href="/c/club-a/way" label="El camino" />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link")).toHaveTextContent(/^El camino$/);
  });

  it("mide al menos el área táctil mínima", () => {
    render(<BackLink href="/c/club-a/way" label="El camino" />);

    expect(screen.getByRole("link")).toHaveClass("min-h-(--target-min)");
  });

  it("con `onClick`, el clic le llega con el enlace, y puede detenerlo", () => {
    // Lo que hace `guard` de `useLeaveGuard`: lee el destino del enlace y detiene la salida para
    // preguntar antes. `currentTarget` solo vale mientras dura el manejador.
    const clicked: Array<string | null> = [];
    const onClick = vi.fn((event: MouseEvent<HTMLAnchorElement>) => {
      clicked.push(event.currentTarget.getAttribute("href"));
      event.preventDefault();
    });
    render(<BackLink href="/c/club-a/train/e1" label="Volver a la sesión" onClick={onClick} />);
    const link = screen.getByRole("link", { name: "Volver a la sesión" });

    const notPrevented = fireEvent.click(link);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(clicked).toEqual(["/c/club-a/train/e1"]);
    expect(notPrevented).toBe(false);
    // Sigue siendo un enlace con su destino: abrirlo en otra pestaña funciona.
    expect(link).toHaveAttribute("href", "/c/club-a/train/e1");
  });
});

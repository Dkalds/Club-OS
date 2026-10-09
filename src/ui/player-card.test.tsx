import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerCard } from "./player-card";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
function renderCard(props: Partial<Parameters<typeof PlayerCard>[0]> = {}) {
  return render(
    <ul>
      <PlayerCard href="/c/club-a/team/t/players/p" firstName="Ana" lastName="Pino" jerseyNumber={7} position="Base" {...props} />
    </ul>,
  );
}

describe("PlayerCard", () => {
  it("toda la fila es un enlace a la ficha, que se lee con dorsal, nombre y posición", () => {
    renderCard();

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/c/club-a/team/t/players/p");
    expect(link).toHaveAccessibleName("Dorsal 7 Ana Pino Base");
  });

  it("el dorsal va en el acento, en la tipografía de display y alineado a la derecha", () => {
    renderCard();

    expect(screen.getByText("7").closest("span.text-brand-accent")).toHaveClass("font-display", "text-right");
  });

  it("sin dorsal ni posición no deja huecos con texto", () => {
    renderCard({ jerseyNumber: null, position: null });

    expect(screen.getByRole("link")).toHaveAccessibleName("Sin dorsal Ana Pino");
  });

  it("iniciales, nunca foto, y el avatar no se anuncia (el nombre ya se lee)", () => {
    const { container } = renderCard();

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("AP")).toHaveAttribute("aria-hidden", "true");
  });

  it("es un elemento de lista: va dentro de una lista de plantilla", () => {
    renderCard();

    expect(screen.getByRole("listitem")).toContainElement(screen.getByRole("link"));
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TopNavigation } from "./top-navigation";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
describe("TopNavigation", () => {
  it("muestra el nombre del club y su subtítulo", () => {
    render(<TopNavigation brand={{ displayName: "Club A", wordmarkSub: "Baloncesto" }} />);

    const header = screen.getByRole("banner");
    expect(header).toHaveTextContent("Club A");
    expect(header).toHaveTextContent("Baloncesto");
    // La marca, nombre y subtítulo, va en la fuente de títulos.
    expect(screen.getByText("Club A").closest(".font-display")).not.toBeNull();
    expect(screen.getByText("Baloncesto").closest(".font-display")).not.toBeNull();
  });

  it("sin subtítulo solo muestra el nombre", () => {
    render(<TopNavigation brand={{ displayName: "Club B", wordmarkSub: null }} />);

    expect(screen.getByRole("banner").textContent).toBe("Club B");
  });

  it("un subtítulo vacío no deja un hueco", () => {
    render(<TopNavigation brand={{ displayName: "Club B", wordmarkSub: "  " }} />);

    expect(screen.getByRole("banner").textContent).toBe("Club B");
  });
});

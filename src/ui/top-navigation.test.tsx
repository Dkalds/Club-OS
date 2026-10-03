import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("sin cuenta no pinta el menú de cuenta", () => {
    render(<TopNavigation brand={{ displayName: "Club B", wordmarkSub: null }} />);

    expect(screen.queryByRole("button", { name: "Abrir menú de cuenta" })).not.toBeInTheDocument();
  });

  it("con cuenta pinta el menú a la derecha de la marca, dentro de la cabecera", () => {
    render(
      <TopNavigation
        brand={{ displayName: "Club B", wordmarkSub: null }}
        account={{ name: "Ana Ruiz", adminHref: "/c/club-b/admin" }}
      />,
    );

    const header = screen.getByRole("banner");
    const toggle = within(header).getByRole("button", { name: "Abrir menú de cuenta" });
    expect(within(toggle).getByRole("img", { name: "Ana Ruiz" })).toBeInTheDocument();
    expect(header.firstElementChild?.textContent).toBe("Club B");

    fireEvent.click(toggle);
    expect(within(header).getByRole("link", { name: "Gestión" })).toHaveAttribute(
      "href",
      "/c/club-b/admin",
    );
    expect(within(header).getByRole("button", { name: "Salir" })).toBeInTheDocument();
  });

  it("con cuenta sin adminHref el menú solo ofrece Salir", () => {
    render(
      <TopNavigation
        brand={{ displayName: "Club B", wordmarkSub: null }}
        account={{ name: "Ana Ruiz", adminHref: null }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));
    expect(screen.queryByRole("link", { name: "Gestión" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
  });
});

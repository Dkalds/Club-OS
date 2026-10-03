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

  it("un nombre o un subtítulo larguísimos se truncan en vez de ensanchar la pantalla", () => {
    const displayName = "Club Deportivo de Baloncesto de Formación de la Comarca del Norte";
    const wordmarkSub = "Escueladebaloncestoyformacióndeportivadelacomarcadelnorte";
    render(<TopNavigation brand={{ displayName, wordmarkSub }} />);

    // El texto sigue entero en el documento (lo lee un lector de pantalla); lo que se
    // recorta es lo que se pinta, en una sola línea y con puntos suspensivos.
    const name = screen.getByText(displayName);
    const sub = screen.getByText(wordmarkSub);
    expect(name).toHaveClass("truncate");
    expect(sub).toHaveClass("truncate");

    // Para que el recorte funcione, la marca tiene que poder encoger dentro de la cabecera.
    const mark = name.parentElement;
    expect(mark).toBe(sub.parentElement);
    expect(mark).toHaveClass("min-w-0");
  });

  it("el recorte no se come los acentos de las mayúsculas", () => {
    render(<TopNavigation brand={{ displayName: "Águilas", wordmarkSub: "Cantera" }} />);

    // `truncate` oculta lo que sobresale de la caja y, con interlínea 1, el acento de una
    // mayúscula sobresale. Cada línea lleva un relleno vertical que le hace sitio y un
    // margen negativo igual que lo compensa: la marca ocupa lo mismo.
    for (const line of [screen.getByText("Águilas"), screen.getByText("Cantera")]) {
      expect(line).toHaveClass("truncate", "py-(--space-1)", "-my-(--space-1)");
    }
  });
});

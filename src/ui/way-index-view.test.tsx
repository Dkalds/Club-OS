import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { WayIndexEntry } from "@/modules/methodology/types";
import { WayIndexView } from "./way-index-view";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const SECTIONS: WayIndexEntry[] = [
  { id: "s-1", number: 1, slug: "quienes-somos", title: "Quiénes somos", subtitle: "3 valores" },
  { id: "s-2", number: 2, slug: "el-jugador", title: "El jugador", subtitle: "Qué esperamos." },
  { id: "s-3", number: 3, slug: "como-jugamos", title: "Cómo jugamos", subtitle: "4 principios" },
];

const GO_TO_ADMIN = { label: "Ir a Gestión", href: "/c/club-a/admin/way" };
const GO_HOME = { label: "Volver a Inicio", href: "/c/club-a" };

function renderIndex(overrides: Partial<Parameters<typeof WayIndexView>[0]> = {}) {
  return render(
    <WayIndexView
      wayName="El camino del Club A"
      tagline="Un club, una forma."
      sections={SECTIONS}
      clubSlug="club-a"
      emptyAction={GO_TO_ADMIN}
      {...overrides}
    />,
  );
}

/** Las filas del índice: los enlaces de la card, sin el botón del estado vacío. */
function rows(): HTMLElement[] {
  return screen.queryAllByRole("link");
}

describe("WayIndexView", () => {
  it("club sin contenido publicado: el Hero y el aviso, sin error (Review Focus 5)", () => {
    renderIndex({ sections: [] });

    // El Hero sigue ahí, con el nombre y el lema del club.
    expect(screen.getByRole("heading", { level: 1, name: "El camino del Club A" })).toBeInTheDocument();
    expect(screen.getByText("Un club, una forma.")).toBeInTheDocument();
    // Y el aviso, con su salida.
    expect(
      screen.getByRole("heading", { level: 2, name: "Tu club todavía no ha publicado su metodología" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Cuando dirección la publique, la verás aquí.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Gestión" })).toHaveAttribute("href", "/c/club-a/admin/way");
    // Ni filas ni error.
    expect(rows()).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("sin contenido, quien no administra vuelve a Inicio", () => {
    renderIndex({ sections: [], emptyAction: GO_HOME });

    expect(screen.getByRole("link", { name: "Volver a Inicio" })).toHaveAttribute("href", "/c/club-a");
    expect(screen.queryByRole("link", { name: "Ir a Gestión" })).not.toBeInTheDocument();
  });

  it("lista las secciones, una fila por sección y en su orden", () => {
    renderIndex();

    const found = rows();
    expect(found.map((row) => row.textContent)).toEqual([
      "01Quiénes somos3 valores",
      "02El jugadorQué esperamos.",
      "03Cómo jugamos4 principios",
    ]);
    expect(found.map((row) => row.getAttribute("href"))).toEqual([
      "/c/club-a/way/quienes-somos",
      "/c/club-a/way/el-jugador",
      "/c/club-a/way/como-jugamos",
    ]);
  });

  it("el número va con dos cifras y en el estilo de los números de bloque", () => {
    renderIndex({
      sections: [{ id: "s-9", number: 12, slug: "doce", title: "Doce", subtitle: null }, SECTIONS[0]],
    });

    expect(screen.getByText("12")).toHaveClass("font-display", "text-numeral", "tabular-nums");
    expect(screen.getByText("01")).toHaveClass("font-display", "text-numeral", "tabular-nums");
  });

  it("el número de una sección es el suyo, no su posición: un hueco se queda como hueco", () => {
    renderIndex({ sections: [SECTIONS[0], SECTIONS[2]] });

    expect(rows().map((row) => row.textContent)).toEqual([
      "01Quiénes somos3 valores",
      "03Cómo jugamos4 principios",
    ]);
  });

  it("las filas son hijas directas de una misma lista, la card que pinta sus separadores", () => {
    renderIndex();

    const list = screen.getByRole("list");
    expect(list).toHaveClass("overflow-hidden");
    for (const row of within(list).getAllByRole("listitem")) {
      expect(row.parentElement).toBe(list);
      expect(within(row).getAllByRole("link")).toHaveLength(1);
    }
  });

  it("una sección sin subtítulo no deja una línea vacía", () => {
    renderIndex({ sections: [{ ...SECTIONS[0], subtitle: null }] });

    expect(rows()[0].textContent).toBe("01Quiénes somos");
  });

  it("con secciones no pinta el aviso de vacío", () => {
    renderIndex();

    expect(
      screen.queryByText("Tu club todavía no ha publicado su metodología"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ir a Gestión" })).not.toBeInTheDocument();
  });

  it("el único <h1> es el nombre del club para su metodología, con el lema encima", () => {
    renderIndex();

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("El camino del Club A");
    expect(within(screen.getByRole("heading", { level: 1 }).closest("section")!).getByText("Un club, una forma.")).toBeInTheDocument();
  });

  it("sin lema, el Hero no pinta nada en su lugar", () => {
    const { container } = renderIndex({ tagline: null });

    expect(screen.getByRole("heading", { level: 1, name: "El camino del Club A" })).toBeInTheDocument();
    expect(container.querySelector("p")).toBeNull();
  });

  it("los enlaces llevan el slug del club que llega por props", () => {
    renderIndex({ clubSlug: "club-b" });

    expect(rows().map((row) => row.getAttribute("href"))).toEqual([
      "/c/club-b/way/quienes-somos",
      "/c/club-b/way/el-jugador",
      "/c/club-b/way/como-jugamos",
    ]);
  });
});

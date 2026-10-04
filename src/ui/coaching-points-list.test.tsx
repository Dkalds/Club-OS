import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoachingPointsList } from "./coaching-points-list";

// Puntos ficticios: 3 de 5 son clave.
const POINTS = [
  { text: "Caja al hombro antes del tiro", isKey: true },
  { text: "Primera mirada hacia delante", isKey: false },
  { text: "Pase de salida por el lado de la pelota", isKey: true },
  { text: "Hablar en cada cambio", isKey: false },
  { text: "Reaccionar al rebote largo", isKey: true },
];

describe("CoachingPointsList", () => {
  it("es una lista con un elemento por punto, en el orden dado", () => {
    render(<CoachingPointsList points={POINTS} />);

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items.map((item) => item.textContent?.replace("Clave", ""))).toEqual(
      POINTS.map((point) => point.text),
    );
  });

  it("marca con «Clave» los puntos clave y solo esos", () => {
    render(<CoachingPointsList points={POINTS} />);

    expect(screen.getAllByText("Clave")).toHaveLength(3);
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => within(item).queryByText("Clave") !== null)).toEqual([
      true,
      false,
      true,
      false,
      true,
    ]);
  });

  it("la marca va antes del texto, dentro del mismo elemento", () => {
    render(<CoachingPointsList points={[{ text: "Primera mirada hacia delante", isKey: true }]} />);

    expect(screen.getByRole("listitem")).toHaveTextContent("ClavePrimera mirada hacia delante");
  });

  it("sin ningún punto clave no pinta ninguna marca", () => {
    render(<CoachingPointsList points={[{ text: "Hablar en cada cambio", isKey: false }]} />);

    expect(screen.queryByText("Clave")).not.toBeInTheDocument();
  });

  it("sin puntos no pinta nada, ni una lista vacía", () => {
    const { container } = render(<CoachingPointsList points={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("la marca no depende solo del color: es la palabra, sobre brand-accent-soft", () => {
    render(<CoachingPointsList points={[{ text: "Hablar en cada cambio", isKey: true }]} />);

    expect(screen.getByText("Clave")).toHaveClass(
      "bg-brand-accent-soft",
      "text-brand-accent",
      "uppercase",
    );
  });

  it("un punto larguísimo se parte en vez de ensanchar la pantalla", () => {
    render(
      <CoachingPointsList
        points={[{ text: "Palabrotalargaquenotienenunsolohuecoparapartirseenlalineasiguiente", isKey: false }]}
      />,
    );

    expect(screen.getByRole("listitem")).toHaveClass("wrap-break-word");
  });
});

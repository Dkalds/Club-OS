import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BLOCK_HEADING_CLASS, countLabel, Pill, toNumber } from "./structure-shared";

describe("toNumber", () => {
  it("un campo vacío, o de solo espacios, es «sin valor»: null y no cero", () => {
    expect(toNumber("")).toBeNull();
    expect(toNumber("   ")).toBeNull();
  });

  it("un número escrito es ese número", () => {
    expect(toNumber("12")).toBe(12);
    expect(toNumber(" 7 ")).toBe(7);
    expect(toNumber("2014")).toBe(2014);
  });

  it("el cero es un valor, no «sin valor»", () => {
    expect(toNumber("0")).toBe(0);
  });

  it("los decimales y los negativos viajan tal cual: los rechaza el esquema, con su mensaje", () => {
    expect(toNumber("7.5")).toBe(7.5);
    expect(toNumber("-1")).toBe(-1);
  });

  it("un texto que no es un número viaja como NaN, que el esquema rechaza", () => {
    expect(toNumber("doce")).toBeNaN();
    expect(toNumber("12a")).toBeNaN();
  });
});

describe("countLabel", () => {
  it("uno va en singular", () => {
    expect(countLabel(1, "jugador", "jugadores")).toBe("1 jugador");
  });

  it("cero y varios van en plural", () => {
    expect(countLabel(0, "jugador", "jugadores")).toBe("0 jugadores");
    expect(countLabel(12, "jugador", "jugadores")).toBe("12 jugadores");
    expect(countLabel(2, "persona", "personas")).toBe("2 personas");
  });
});

describe("Pill", () => {
  it("lleva su palabra: nunca es solo color", () => {
    render(<Pill>Actual</Pill>);

    expect(screen.getByText("Actual")).toBeInTheDocument();
  });

  it("por defecto va con el acento del club", () => {
    render(<Pill>Actual</Pill>);

    expect(screen.getByText("Actual")).toHaveClass("bg-brand-accent-soft", "text-brand-accent");
  });

  it("apagada va en gris, sin acento", () => {
    render(<Pill tone="muted">Archivada</Pill>);

    const pill = screen.getByText("Archivada");
    expect(pill).toHaveClass("bg-surface-2", "text-ink-2");
    expect(pill).not.toHaveClass("text-brand-accent");
  });
});

describe("BLOCK_HEADING_CLASS", () => {
  it("un encabezado largo se parte en vez de desbordar", () => {
    expect(BLOCK_HEADING_CLASS).toContain("wrap-break-word");
    expect(BLOCK_HEADING_CLASS).toContain("min-w-0");
  });
});

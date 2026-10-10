import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CourtPlay } from "./court-play";

function board(): SVGElement {
  const { container } = render(<CourtPlay />);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("CourtPlay no ha pintado ningún <svg>");
  return svg;
}

function part(svg: SVGElement, name: string): Element {
  const found = svg.querySelector(`[data-play="${name}"]`);
  if (!found) throw new Error(`Falta la parte «${name}» de la jugada`);
  return found;
}

describe("CourtPlay", () => {
  it("es decorativa: se esconde a los lectores de pantalla, sin nombre ni rol", () => {
    const svg = board();

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
    expect(svg).not.toHaveAttribute("aria-label");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("a tamaño completo va en surface-1 y ocupa todo el ancho", () => {
    expect(board()).toHaveClass("w-full", "bg-surface-1");
  });

  it("pista en ink-3, ataque en ink, defensa y movimientos en el acento", () => {
    const svg = board();

    expect(part(svg, "court")).toHaveClass("stroke-ink-3");
    expect(part(svg, "attackers")).toHaveClass("stroke-ink");
    expect(part(svg, "defenders")).toHaveClass("stroke-brand-accent");
    expect(part(svg, "moves")).toHaveClass("stroke-brand-accent");
  });

  it("no lleva ningún color escrito a mano", () => {
    expect(board().outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("tres atacantes como círculos y tres defensores como X", () => {
    const svg = board();

    expect(part(svg, "attackers").querySelectorAll("circle")).toHaveLength(3);
    expect(part(svg, "defenders").querySelectorAll("path")).toHaveLength(3);
  });

  it("el corte es una línea continua y el pase una discontinua", () => {
    const svg = board();

    expect(part(svg, "cut")).not.toHaveAttribute("stroke-dasharray");
    expect(part(svg, "pass").querySelector("[stroke-dasharray]")).not.toBeNull();
  });

  it("solo se mueve si el dispositivo no pide menos movimiento", () => {
    const svg = board();

    const animated = Array.from(svg.querySelectorAll("[class*='court-draw'], [class*='court-pop']"));
    expect(animated.length).toBeGreaterThan(0);
    for (const element of animated) {
      const classes = (element.getAttribute("class") ?? "").split(/\s+/);
      for (const name of classes.filter((value) => /court-(draw|pop|delay)/.test(value))) {
        expect(name).toMatch(/^motion-safe:/);
      }
    }
  });

  it("lo que se traza mide 1 de largo, para que el trazo no dependa de su longitud", () => {
    const svg = board();

    const drawn = Array.from(svg.querySelectorAll("[class*='court-draw'], [class*='court-on-pass']"));
    expect(drawn.length).toBeGreaterThan(0);
    for (const element of drawn) expect(element).toHaveAttribute("pathLength", "1");
  });

  it("el pase espera a su fase y el aro a la de canasta", () => {
    const svg = board();

    // El pase se descubre con una máscara que se traza al llegar la fase.
    const pass = part(svg, "pass");
    const maskId = /^url\(#(.+)\)$/.exec(pass.getAttribute("mask") ?? "")?.[1];
    expect(maskId).toBeTruthy();
    const mask = svg.querySelector(`mask[id="${maskId}"]`);
    expect(mask?.querySelector(".court-on-pass")).not.toBeNull();

    expect(part(svg, "rim")).toHaveClass("court-on-score");
  });
});

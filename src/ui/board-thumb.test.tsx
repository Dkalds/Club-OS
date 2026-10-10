import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { boardFrames } from "@/modules/board/frames";
import type { Board, BoardPoint } from "@/modules/board/types";
import { BOARD_VIEW, toBox, tokenBox } from "./board-drawing";
import { BoardThumb } from "./board-thumb";
import { COURT_BOX } from "./court-thumb";

/** Una pizarra válida y pequeña, con pasos: la miniatura solo enseña cómo empieza. */
function board(overrides: Partial<Board> = {}): Board {
  return {
    version: 1,
    court: "half",
    tokens: [
      { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } },
      { id: "a2", kind: "attacker", label: "2", at: { x: 20, y: 60 } },
      { id: "d1", kind: "defender", label: "1", at: { x: 50, y: 70 } },
      { id: "ball", kind: "ball", at: { x: 53, y: 80 } },
      { id: "c1", kind: "cone", at: { x: 80, y: 40 } },
    ],
    steps: [
      {
        note: "El 1 pasa al 2 y corta",
        moves: [
          { token: "ball", kind: "pass", to: { x: 23, y: 60 } },
          { token: "a1", kind: "cut", to: { x: 50, y: 30 } },
        ],
      },
      { moves: [{ token: "a2", kind: "dribble", to: { x: 30, y: 25 } }] },
    ],
    ...overrides,
  };
}

function thumb(data: Board = board()): SVGSVGElement {
  const { container } = render(<BoardThumb board={data} />);
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("BoardThumb no ha pintado ningún <svg>");
  return svg;
}

/** Los grupos de las fichas: los que llevan `transform`, en el orden de la pizarra. */
function marks(svg: SVGSVGElement): Element[] {
  return Array.from(svg.querySelectorAll(":scope > g[transform]"));
}

/** El `transform` de una marca en un punto de la caja: con dos decimales como mucho. */
function translate(at: BoardPoint): string {
  return `translate(${Math.round(at.x * 100) / 100} ${Math.round(at.y * 100) / 100})`;
}

describe("BoardThumb", () => {
  it("es decorativa: se esconde a los lectores de pantalla, sin nombre ni rol", () => {
    const svg = thumb();

    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
    expect(svg).not.toHaveAttribute("aria-label");
    expect(svg).toHaveAttribute("focusable", "false");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("mide lo que la miniatura de pista: 80×60, radius-sm, en surface-2", () => {
    const svg = thumb();

    expect(svg).toHaveClass("h-15", "w-20", "rounded-sm", "bg-surface-2");
    expect(svg).toHaveClass(...COURT_BOX.thumb.split(" "));
  });

  it("pinta la pista y una marca por ficha", () => {
    const svg = thumb();

    expect(svg.querySelector("g.stroke-ink-3")).not.toBeNull();
    expect(marks(svg)).toHaveLength(board().tokens.length);
    for (const mark of marks(svg)) expect(mark.querySelector("circle, path")).not.toBeNull();
  });

  it.each(["half", "full"] as const)("%s: cada ficha está donde empieza, pasada a la caja del dibujo", (court) => {
    const data = board({ court });
    const svg = thumb(data);
    const [start] = boardFrames(data);

    expect(marks(svg).map((mark) => mark.getAttribute("transform"))).toEqual(
      data.tokens.map((token) => translate(tokenBox(court, token, start, data.tokens))),
    );
  });

  it.each(["half", "full"] as const)("%s: los jugadores y los conos, justo donde dice la pizarra", (court) => {
    const data = board({ court });
    const transforms = marks(thumb(data)).map((mark) => mark.getAttribute("transform"));
    const fixed = data.tokens.filter((token) => token.kind !== "ball");

    expect(fixed).toHaveLength(4);
    for (const token of fixed) {
      expect(transforms[data.tokens.indexOf(token)]).toBe(translate(toBox(court, token.at)));
    }
  });

  it("el balón que lleva un jugador va pegado a él, abajo a la derecha, y no encima", () => {
    const data = board();
    const [attacker, , , ball] = marks(thumb(data));
    const holder = toBox("half", data.tokens[0].at);
    const radius = Number(attacker.querySelector("circle")?.getAttribute("r"));
    const own = Number(ball.querySelector("circle")?.getAttribute("r"));

    // (50, 57) más (3,6 + 1,7)·√½ en cada eje.
    expect(ball).toHaveAttribute("transform", "translate(53.75 60.75)");
    expect(ball).not.toHaveAttribute("transform", translate(toBox("half", data.tokens[3].at)));
    // Tocando al jugador: un radio de cada uno entre los dos centros.
    expect(Math.hypot(53.75 - holder.x, 60.75 - holder.y)).toBeCloseTo(radius + own, 1);
  });

  it("un balón suelto, lejos de todos, va donde dice la pizarra", () => {
    const data = board({
      tokens: [
        { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } },
        { id: "ball", kind: "ball", at: { x: 20, y: 20 } },
      ],
      steps: [],
    });
    const [, ball] = marks(thumb(data));

    expect(ball).toHaveAttribute("transform", translate(toBox("half", { x: 20, y: 20 })));
  });

  it("las posiciones van con dos decimales como mucho", () => {
    for (const court of ["half", "full"] as const) {
      for (const mark of marks(thumb(board({ court })))) {
        expect(mark.getAttribute("transform")).toMatch(/^translate\(\d+(\.\d{1,2})? \d+(\.\d{1,2})?\)$/);
      }
    }
  });

  it("enseña cómo empieza aunque la pizarra tenga pasos: el 1 sigue abajo, antes de cortar", () => {
    const [first] = marks(thumb());

    // (50, 80) en media pista: 5 + 50·0,9 y 5 + 80·0,65.
    expect(first).toHaveAttribute("transform", "translate(50 57)");
  });

  it("cada tipo de ficha con su marca: círculos, X, balón relleno y cono", () => {
    const [attacker, , defender, ball, cone] = marks(thumb());

    expect(attacker.querySelector("circle")).toHaveClass("stroke-ink");
    expect(defender.querySelector("path")).toHaveClass("stroke-brand-accent");
    expect(ball.querySelector("circle")).toHaveClass("fill-ink");
    expect(cone.querySelector("path")).toHaveClass("stroke-ink-3");
  });

  it("no lleva textos: ni etiquetas ni la nota de ningún paso", () => {
    const svg = thumb();

    expect(svg.querySelector("text")).toBeNull();
    expect(svg).toHaveTextContent("");
  });

  it("no lleva movimientos ni controles", () => {
    const { container } = render(<BoardThumb board={board()} />);

    expect(container.querySelector("[data-move]")).toBeNull();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // Solo el dibujo: nada alrededor.
    expect(container.children).toHaveLength(1);
  });

  it("usa el viewBox de su pista", () => {
    expect(thumb(board({ court: "half" }))).toHaveAttribute("viewBox", BOARD_VIEW.half.viewBox);
    expect(thumb(board({ court: "full" }))).toHaveAttribute("viewBox", BOARD_VIEW.full.viewBox);
    expect(BOARD_VIEW.half.viewBox).not.toBe(BOARD_VIEW.full.viewBox);
  });

  it("una foto fija, sin pasos, se pinta igual", () => {
    const still = thumb(board({ steps: [] }));
    const sequence = thumb(board());

    expect(still.innerHTML).toBe(sequence.innerHTML);
  });

  it("no lleva ningún color escrito a mano", () => {
    expect(thumb().outerHTML).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

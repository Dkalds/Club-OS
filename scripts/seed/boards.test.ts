import { describe, expect, it } from "vitest";
import { boardFrames } from "../../src/modules/board/frames";
import { BALL_REACH } from "../../src/modules/board/limits";
import { parseBoard } from "../../src/modules/board/schema";
import { movePaths, toBox } from "../../src/ui/board-drawing";
import { SEED_BOARDS, seedBoard } from "./boards";
import { ARCANGEL, CLUB_DEMO } from "./data";

// Las pizarras del seed las dibuja la misma pantalla que las de un club: tienen que cumplir la
// forma que valida la app al leer, y contar lo que dicen (quien bota lleva el balón).

const CLUBS = [ARCANGEL, CLUB_DEMO];
const ALL = Object.entries(SEED_BOARDS).flatMap(([slug, boards]) =>
  Object.entries(boards).map(([title, board]) => ({ slug, title, board })),
);

describe("las pizarras del seed", () => {
  it("son de clubes y de ejercicios que existen", () => {
    for (const { slug, title } of ALL) {
      const club = CLUBS.find((candidate) => candidate.slug === slug);
      expect(club, `club «${slug}»`).toBeDefined();
      expect(
        club?.drills.some((drill) => drill.title === title),
        `«${title}» de ${slug}`,
      ).toBe(true);
    }
  });

  it.each(ALL)("«$title» cumple la forma que la app valida al leer", ({ board }) => {
    expect(parseBoard(board)).toEqual(board);
    // Y también después de pasar por la base, que la guarda como JSON.
    expect(parseBoard(JSON.parse(JSON.stringify(board)))).toEqual(board);
  });

  it.each(ALL)("en «$title», quien bota lleva el balón", ({ board }) => {
    const frames = boardFrames(board);

    board.steps.forEach((step, index) => {
      for (const move of step.moves.filter((candidate) => candidate.kind === "dribble")) {
        const player = frames[index][move.token];
        const hasBall = board.tokens
          .filter((token) => token.kind === "ball")
          .some((token) => {
            const at = frames[index][token.id];
            return Math.hypot(at.x - player.x, at.y - player.y) <= BALL_REACH;
          });
        expect(hasBall, `paso ${index + 1}: ${move.token} bota sin balón`).toBe(true);
      }
    });
  });

  it.each(ALL)("en «$title», todo movimiento es lo bastante largo para dibujarse", ({ board }) => {
    const frames = boardFrames(board);
    const scale = board.court === "half" ? 1 : 0.62;

    board.steps.forEach((step, index) => {
      for (const move of step.moves) {
        const from = toBox(board.court, frames[index][move.token]);
        const to = toBox(board.court, move.to);
        expect(movePaths(move.kind, from, to, scale), `paso ${index + 1}: ${move.token}`).not.toBeNull();
      }
    });
  });

  it("cubren los cuatro movimientos, las dos pistas, una foto fija y una secuencia de cuatro pasos", () => {
    const boards = ALL.map((entry) => entry.board);
    const kinds = new Set(boards.flatMap((board) => board.steps.flatMap((step) => step.moves.map((move) => move.kind))));

    expect([...kinds].sort()).toEqual(["cut", "dribble", "pass", "screen"]);
    expect(new Set(boards.map((board) => board.court))).toEqual(new Set(["half", "full"]));
    expect(boards.some((board) => board.steps.length === 0)).toBe(true);
    expect(boards.some((board) => board.steps.length === 4)).toBe(true);
  });

  it("no todos los ejercicios tienen pizarra: ese caso también se ve", () => {
    expect(Object.keys(SEED_BOARDS.arcangel).length).toBeLessThan(ARCANGEL.drills.length);
    expect(seedBoard("arcangel", "Un ejercicio que no existe")).toBeNull();
    expect(seedBoard("otro-club", "3 calles")).toBeNull();
  });
});

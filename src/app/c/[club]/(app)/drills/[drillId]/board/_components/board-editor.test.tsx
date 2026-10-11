import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Link from "next/link";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTION_ERROR_COPY, fail, ok, type ActionResult } from "@/lib/action-result";
import type { Board, BoardMoveKind, BoardPoint, BoardStep, BoardToken } from "@/modules/board/types";
import { BOARD_VIEW, movePaths, toBox, tokenBox } from "@/ui/board-drawing";

const mocks = vi.hoisted(() => ({
  saveDrillBoard: vi.fn(),
  push: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("@/modules/drills/actions", () => ({ saveDrillBoard: mocks.saveDrillBoard }));
// Solo el router es de pega: `useAction` usa el `unstable_rethrow` de verdad.
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: mocks.push }),
}));

import { BoardEditor } from "./board-editor";

// Datos neutros: los tests de `src/` no pueden nombrar a ningún club (pnpm check:guards).
const DRILL_ID = "00000000-0000-4000-8000-0000000000d1";
const TITLE = "Un ejercicio";
/** Un `updated_at` como lo devuelve PostgREST: con microsegundos. */
const LOADED = "2026-10-03T10:00:00.123456+00:00";
const DETAIL = `/c/club-a/drills/${DRILL_ID}`;

const A1: BoardToken = { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 80 } };
const A2: BoardToken = { id: "a2", kind: "attacker", label: "2", at: { x: 20, y: 60 } };
const D2: BoardToken = { id: "d2", kind: "defender", label: "2", at: { x: 70, y: 50 } };
/** En las manos del 1: a tres unidades de él. */
const BALL: BoardToken = { id: "b1", kind: "ball", at: { x: 53, y: 80 } };
const CONE: BoardToken = { id: "c1", kind: "cone", at: { x: 80, y: 30 } };

/** Una foto fija: dos atacantes (el 1, con el balón), un defensor y un cono. */
const STILL: Board = { version: 1, court: "half", tokens: [A1, A2, D2, BALL, CONE], steps: [] };

/** La misma, con dos pasos: el 1 pasa al 2 y corta; después el 2 bota hacia el aro. */
const PLAY: Board = {
  ...STILL,
  steps: [
    {
      note: "El 1 pasa al 2 y corta",
      moves: [
        { token: "b1", kind: "pass", to: { x: 23, y: 60 } },
        { token: "a1", kind: "cut", to: { x: 50, y: 30 } },
      ],
    },
    { moves: [{ token: "a2", kind: "dribble", to: { x: 30, y: 25 } }] },
  ],
};

function renderEditor(initialBoard: Board | null = null) {
  return render(
    <BoardEditor
      clubSlug="club-a"
      drillId={DRILL_ID}
      title={TITLE}
      initialBoard={initialBoard}
      expectedUpdatedAt={LOADED}
    />,
  );
}

// ── La pista ─────────────────────────────────────────────────────────────────────────
// jsdom no hace layout: la pista mide 0 × 0 y el editor no sabría qué punto hay bajo un toque.
// Aquí se le da un tamaño (400 px de ancho, con la proporción de su `viewBox`) y cada toque se
// calcula con `toBox`: el camino contrario al que hace el editor con `fromBox`.

/** Píxeles de pantalla por unidad de la caja del dibujo. */
const PX = 4;
/** El dedo (o el botón principal del ratón) con el que se toca: el único que arrastra. */
const FINGER = { pointerId: 1, isPrimary: true, button: 0 };

/** La pista del editor, ya con su tamaño en pantalla. */
function court(): SVGSVGElement {
  const svg = document.querySelector<SVGSVGElement>('svg[role="group"]');
  if (!svg) throw new Error("No hay pista: el editor no está a la vista");
  const [, , width, height] = (svg.getAttribute("viewBox") ?? "").split(" ").map(Number);
  svg.getBoundingClientRect = () => new DOMRect(0, 0, width * PX, height * PX);
  return svg;
}

/** Qué pista se está viendo. */
function courtKind(): Board["court"] {
  return court().getAttribute("viewBox") === BOARD_VIEW.full.viewBox ? "full" : "half";
}

/** Dónde cae en la pantalla un punto de la pista. */
function screenPoint(point: BoardPoint): { clientX: number; clientY: number } {
  const box = toBox(courtKind(), point);
  return { clientX: box.x * PX, clientY: box.y * PX };
}

/** El `transform` con el que el editor coloca una ficha en un punto de la caja. */
function translate(box: BoardPoint): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  return `translate(${round(box.x)} ${round(box.y)})`;
}

// ── Ayudas ───────────────────────────────────────────────────────────────────────────

const button = (name: string) => screen.getByRole("button", { name });
const press = (name: string) => fireEvent.click(button(name));
/** Una ficha de la pista, por su nombre: «Atacante 1», «Balón»… */
const token = (name: string) => within(court() as unknown as HTMLElement).getByRole("button", { name });
/** Las fichas que hay en la pista, por su nombre y en su orden. */
const tokenNames = () =>
  Array.from(court().querySelectorAll("[data-token]"), (item) => item.getAttribute("aria-label"));
/** Toca una ficha: la elige (o, con una acción a medias, es su destino). */
const choose = (name: string) => fireEvent.click(token(name));
/** Toca la pista en un punto. */
const tap = (point: BoardPoint) => fireEvent.click(court(), screenPoint(point));
/** Toca una ficha en un punto concreto de la pista (con una acción a medias, ese es el destino). */
const tapToken = (name: string, point: BoardPoint) => fireEvent.click(token(name), screenPoint(point));
/** Lleva el foco a un control y lo pulsa, como quien va con teclado. */
function focusAndPress(name: string) {
  button(name).focus();
  expect(button(name)).toHaveFocus();
  press(name);
}
const chips = () => within(screen.getByRole("group", { name: "Pasos" })).getAllByRole("button");
const chipNames = () => chips().map((chip) => chip.textContent);
const save = () => press("Guardar pizarra");

type TokenWord = "atacante" | "defensor" | "balón" | "cono";

/** Añade fichas en «Inicio» y suelta cada una: la recién añadida queda elegida. */
function add(...kinds: TokenWord[]) {
  for (const kind of kinds) {
    press(`Añadir ${kind}`);
    press("Listo");
  }
}

/** Comprueba que una ficha está pintada en ese punto de la pista. */
function expectAt(name: string, point: BoardPoint) {
  expect(token(name)).toHaveAttribute("transform", translate(toBox(courtKind(), point)));
}

/** Arrastra una ficha con el dedo por esos puntos de la pista y la suelta en el último. */
function drag(name: string, from: BoardPoint, ...path: BoardPoint[]) {
  const target = token(name);
  fireEvent.pointerDown(target, { ...FINGER, ...screenPoint(from) });
  for (const point of path) fireEvent.pointerMove(target, { ...FINGER, ...screenPoint(point) });
  fireEvent.pointerUp(target, { ...FINGER, ...screenPoint(path.at(-1) ?? from) });
}

/** Los movimientos dibujados en el paso que se ve, sin contar el que aún está a medias. */
function drawnMoves(): Element[] {
  return Array.from(court().querySelectorAll("[data-move]")).filter((mark) => !mark.closest("[data-pending]"));
}

const drawnKinds = () => drawnMoves().map((mark) => mark.getAttribute("data-move"));

/** El trazo que tendría un movimiento entre dos puntos de la pista, como lo calcula el dibujo. */
function lineOf(kind: BoardMoveKind, from: BoardPoint, to: BoardPoint): string {
  const paths = movePaths(kind, toBox(courtKind(), from), toBox(courtKind(), to), 1);
  if (!paths) throw new Error("Los dos puntos casi coinciden: no hay trazo");
  return paths.line;
}

/** Dónde está, en la caja del dibujo, el destino de la acción a medias. */
function pendingTarget(): BoardPoint {
  const circle = court().querySelector("[data-pending] circle");
  if (!circle) throw new Error("No hay ninguna acción a medias");
  return { x: Number(circle.getAttribute("cx")), y: Number(circle.getAttribute("cy")) };
}

/** Lo que se le mandó a la acción de guardar la última vez. */
function sent(): { drillId: string; expectedUpdatedAt: string; board: Board | null } {
  const call = mocks.saveDrillBoard.mock.calls.at(-1);
  if (!call) throw new Error("No se ha llamado a saveDrillBoard");
  return call[1];
}

/** Guarda, espera a que acabe y devuelve la pizarra que viajó. */
async function savedBoard(): Promise<Board | null> {
  save();
  await waitFor(() => expect(mocks.push).toHaveBeenCalled());
  return sent().board;
}

/** Una acción que no termina hasta que el test lo diga. */
function deferred<T>() {
  let finish: (result: ActionResult<T>) => void = () => {};
  const promise = new Promise<ActionResult<T>>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.saveDrillBoard.mockResolvedValue(ok({ updatedAt: "2026-10-03T10:05:00.654321+00:00" }));
  // `location.reload` no se puede sustituir en jsdom: se cambia todo `location`.
  vi.stubGlobal("location", { reload: mocks.reload });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Sin pizarra ──────────────────────────────────────────────────────────────────────

describe("BoardEditor · sin pizarra", () => {
  it("empieza en «Inicio», con media pista vacía, y dice qué hacer", () => {
    renderEditor();

    expect(button("Inicio")).toHaveAttribute("aria-pressed", "true");
    expect(chipNames()).toEqual(["Inicio", "Paso"]);
    expect(court()).toHaveAttribute("viewBox", BOARD_VIEW.half.viewBox);
    expect(button("Media pista")).toHaveAttribute("aria-pressed", "true");
    expect(tokenNames()).toEqual([]);
    expect(screen.getByText("Añade fichas y arrástralas a su sitio.")).toBeInTheDocument();
  });

  it("no hay nada que guardar ni que quitar", () => {
    renderEditor();

    expect(button("Guardar pizarra")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Quitar pizarra" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("no enseña ningún aviso de error", () => {
    renderEditor();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ── Añadir fichas ────────────────────────────────────────────────────────────────────

describe("BoardEditor · añadir fichas", () => {
  it("«Añadir atacante» pone «Atacante 1» en la pista y la deja elegida", () => {
    renderEditor();

    press("Añadir atacante");

    expect(tokenNames()).toEqual(["Atacante 1"]);
    expect(token("Atacante 1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Añade fichas y arrástralas a su sitio.")).not.toBeInTheDocument();
  });

  it("los jugadores se numeran solos por equipo; el balón y los conos llevan su nombre", () => {
    renderEditor();

    add("atacante", "atacante", "defensor", "balón", "cono");

    expect(tokenNames()).toEqual(["Atacante 1", "Atacante 2", "Defensor 1", "Balón", "Cono 1"]);
  });

  it("solo queda elegida la última que se añade", () => {
    renderEditor();
    add("atacante");

    press("Añadir atacante");

    expect(token("Atacante 2")).toHaveAttribute("aria-pressed", "true");
    expect(token("Atacante 1")).toHaveAttribute("aria-pressed", "false");
  });

  it("un segundo balón y un segundo cono se distinguen por su número", () => {
    renderEditor();

    add("balón", "balón", "cono", "cono");

    expect(tokenNames()).toEqual(["Balón", "Balón 2", "Cono 1", "Cono 2"]);
  });

  it("cada ficha nueva aparece en un sitio libre, no encima de otra", () => {
    renderEditor();

    add("atacante", "atacante", "defensor");

    expectAt("Atacante 1", { x: 50, y: 70 });
    expectAt("Atacante 2", { x: 25, y: 55 });
    expectAt("Defensor 1", { x: 75, y: 55 });
  });

  it("con una ficha elegida salen sus flechas, «Quitar ficha» y «Listo», y no los botones de añadir", () => {
    renderEditor();

    press("Añadir atacante");

    const arrows = screen.getByRole("group", { name: "Mover la ficha" });
    expect(within(arrows).getAllByRole("button").map((arrow) => arrow.getAttribute("aria-label"))).toEqual([
      "Mover la ficha a la izquierda",
      "Mover la ficha arriba",
      "Mover la ficha abajo",
      "Mover la ficha a la derecha",
    ]);
    expect(button("Quitar ficha")).toBeInTheDocument();
    expect(button("Listo")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Añadir ficha" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Pista" })).not.toBeInTheDocument();
  });

  it("«Listo» la suelta y vuelven los botones de añadir", () => {
    renderEditor();
    press("Añadir atacante");

    press("Listo");

    expect(token("Atacante 1")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("group", { name: "Añadir ficha" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar ficha" })).not.toBeInTheDocument();
  });

  it("tocar la pista también la suelta", () => {
    renderEditor();
    press("Añadir atacante");

    tap({ x: 10, y: 10 });

    expect(token("Atacante 1")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("group", { name: "Añadir ficha" })).toBeInTheDocument();
  });

  it("tocar una ficha la elige", () => {
    renderEditor();
    add("atacante", "defensor");

    choose("Defensor 1");

    expect(token("Defensor 1")).toHaveAttribute("aria-pressed", "true");
    expect(token("Atacante 1")).toHaveAttribute("aria-pressed", "false");
    expect(button("Quitar ficha")).toBeInTheDocument();
  });

  it("«Quitar ficha» se la lleva, y su número queda libre para la siguiente", () => {
    renderEditor();
    add("atacante", "atacante");
    choose("Atacante 1");

    press("Quitar ficha");

    expect(tokenNames()).toEqual(["Atacante 2"]);
    // Sin ficha elegida, vuelven los botones de añadir.
    press("Añadir atacante");
    expect(tokenNames()).toEqual(["Atacante 2", "Atacante 1"]);
  });

  it("al quitar una ficha se van con ella sus movimientos", async () => {
    renderEditor(PLAY);
    choose("Atacante 1");

    press("Quitar ficha");

    const board = await savedBoard();
    expect(board?.tokens.map((item) => item.id)).toEqual(["a2", "d2", "b1", "c1"]);
    expect(board?.steps[0].moves).toEqual([{ token: "b1", kind: "pass", to: { x: 23, y: 60 } }]);
  });
});

// ── Mover con las flechas ────────────────────────────────────────────────────────────

describe("BoardEditor · mover una ficha con las flechas", () => {
  it.each([
    ["Mover la ficha arriba", { x: 50, y: 68 }],
    ["Mover la ficha abajo", { x: 50, y: 72 }],
    ["Mover la ficha a la izquierda", { x: 48, y: 70 }],
    ["Mover la ficha a la derecha", { x: 52, y: 70 }],
  ])("media pista: «%s» la lleva dos unidades hacia ese lado de la pantalla (arriba es el aro)", (arrow, to) => {
    renderEditor();
    press("Añadir atacante");
    expectAt("Atacante 1", { x: 50, y: 70 });

    press(arrow);

    expectAt("Atacante 1", to);
  });

  it.each([
    // Apaisada: el aro de ataque (y = 0) queda a la izquierda y la banda derecha (x = 100), arriba.
    ["Mover la ficha arriba", { x: 52, y: 70 }],
    ["Mover la ficha abajo", { x: 48, y: 70 }],
    ["Mover la ficha a la izquierda", { x: 50, y: 68 }],
    ["Mover la ficha a la derecha", { x: 50, y: 72 }],
  ])("pista completa: «%s» sigue siendo ese lado de la pantalla", (arrow, to) => {
    renderEditor();
    add("atacante");
    press("Pista completa");
    choose("Atacante 1");
    expectAt("Atacante 1", { x: 50, y: 70 });

    press(arrow);

    expectAt("Atacante 1", to);
  });

  it("pista completa: la ficha se desplaza en pantalla hacia donde apunta la flecha", () => {
    renderEditor();
    add("atacante");
    press("Pista completa");
    choose("Atacante 1");
    const before = toBox("full", { x: 50, y: 70 });

    press("Mover la ficha a la izquierda");
    expect(token("Atacante 1")).toHaveAttribute("transform", translate({ x: before.x - 2 * 0.94, y: before.y }));

    press("Mover la ficha arriba");
    expect(token("Atacante 1")).toHaveAttribute(
      "transform",
      translate({ x: before.x - 2 * 0.94, y: before.y - 2 * 0.5 }),
    );
  });

  it("los toques se suman, y la ficha sigue elegida", () => {
    renderEditor();
    press("Añadir atacante");

    press("Mover la ficha arriba");
    press("Mover la ficha arriba");
    press("Mover la ficha a la derecha");

    expectAt("Atacante 1", { x: 52, y: 66 });
    expect(token("Atacante 1")).toHaveAttribute("aria-pressed", "true");
  });

  it("llevar una ficha a su sitio a toques es un solo paso atrás: «Deshacer» la devuelve a donde estaba", () => {
    renderEditor(STILL);
    choose("Atacante 2");
    press("Mover la ficha arriba");
    press("Mover la ficha arriba");
    press("Mover la ficha a la derecha");
    expectAt("Atacante 2", { x: 22, y: 56 });
    expect(button("Guardar pizarra")).toBeEnabled();

    press("Deshacer");

    expectAt("Atacante 2", { x: 20, y: 60 });
    expect(button("Deshacer")).toBeDisabled();
    expect(button("Guardar pizarra")).toBeDisabled();
  });

  it("los toques de otra ficha son otro paso atrás", () => {
    renderEditor(STILL);
    choose("Atacante 2");
    press("Mover la ficha arriba");
    choose("Defensor 2");
    press("Mover la ficha arriba");
    press("Mover la ficha arriba");

    press("Deshacer");
    expectAt("Defensor 2", { x: 70, y: 50 });
    expectAt("Atacante 2", { x: 20, y: 58 });

    press("Deshacer");
    expectAt("Atacante 2", { x: 20, y: 60 });
    expect(button("Deshacer")).toBeDisabled();
  });

  it("quien lleva el balón se lo lleva: el balón se mueve lo mismo que él", async () => {
    renderEditor(STILL);
    choose("Atacante 1");

    press("Mover la ficha arriba");
    press("Mover la ficha a la izquierda");

    expectAt("Atacante 1", { x: 48, y: 78 });
    const board = await savedBoard();
    expect(board?.tokens.find((item) => item.id === "b1")?.at).toEqual({ x: 51, y: 78 });
  });

  it("las flechas paran a dos unidades del borde: la ficha no queda a medias fuera", () => {
    renderEditor({ ...STILL, tokens: [{ ...A2, at: { x: 95, y: 5 } }] });
    choose("Atacante 2");

    for (let touch = 0; touch < 4; touch += 1) {
      press("Mover la ficha a la derecha");
      press("Mover la ficha arriba");
    }

    expectAt("Atacante 2", { x: 98, y: 2 });
  });

  it("una ficha que ya estaba en el borde vuelve hacia dentro con la flecha contraria", () => {
    renderEditor({ ...STILL, tokens: [{ ...A1, at: { x: 0, y: 100 } }] });
    choose("Atacante 1");

    press("Mover la ficha a la derecha");
    press("Mover la ficha arriba");

    expectAt("Atacante 1", { x: 2, y: 98 });
  });

  it("no saca la ficha de la pista ni la mueve de un borde en el que ya estaba: ahí la flecha no hace nada", () => {
    renderEditor({ ...STILL, tokens: [{ ...A1, at: { x: 0, y: 100 } }] });
    choose("Atacante 1");

    press("Mover la ficha a la izquierda");
    press("Mover la ficha abajo");

    expectAt("Atacante 1", { x: 0, y: 100 });
    // Nada ha cambiado: no hay nada que deshacer ni que guardar.
    expect(button("Deshacer")).toBeDisabled();
    expect(button("Guardar pizarra")).toBeDisabled();
  });
});

// ── Arrastrar ────────────────────────────────────────────────────────────────────────

describe("BoardEditor · arrastrar una ficha en «Inicio»", () => {
  it("la ficha sigue al dedo y se queda donde se suelta", () => {
    renderEditor(STILL);
    const target = token("Atacante 2");

    fireEvent.pointerDown(target, { ...FINGER, ...screenPoint({ x: 20, y: 60 }) });
    fireEvent.pointerMove(target, { ...FINGER, ...screenPoint({ x: 30, y: 50 }) });
    expectAt("Atacante 2", { x: 30, y: 50 });
    fireEvent.pointerMove(target, { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });
    expectAt("Atacante 2", { x: 40, y: 35 });
    fireEvent.pointerUp(target, { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });

    expectAt("Atacante 2", { x: 40, y: 35 });
    expect(token("Atacante 2")).toHaveAttribute("aria-pressed", "true");
  });

  it("lo arrastrado es lo que se guarda", async () => {
    renderEditor(STILL);

    drag("Atacante 2", { x: 20, y: 60 }, { x: 40, y: 35 });

    const board = await savedBoard();
    expect(board?.tokens.find((item) => item.id === "a2")?.at).toEqual({ x: 40, y: 35 });
  });

  it("mientras se arrastra la pizarra no cambia: no hay nada que deshacer hasta soltar", () => {
    renderEditor(STILL);
    const target = token("Atacante 2");

    fireEvent.pointerDown(target, { ...FINGER, ...screenPoint({ x: 20, y: 60 }) });
    fireEvent.pointerMove(target, { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });

    expect(button("Deshacer")).toBeDisabled();
    expect(button("Guardar pizarra")).toBeDisabled();

    fireEvent.pointerUp(target, { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });

    expect(button("Deshacer")).toBeEnabled();
    expect(button("Guardar pizarra")).toBeEnabled();
  });

  it("un arrastre entero es un solo paso atrás: «Deshacer» la devuelve a donde estaba", () => {
    renderEditor(STILL);

    drag("Atacante 2", { x: 20, y: 60 }, { x: 25, y: 55 }, { x: 30, y: 50 }, { x: 40, y: 35 });
    expectAt("Atacante 2", { x: 40, y: 35 });

    press("Deshacer");

    expectAt("Atacante 2", { x: 20, y: 60 });
    expect(button("Deshacer")).toBeDisabled();
  });

  it("tocarla sin moverla solo la elige: no hay nada que deshacer", () => {
    renderEditor(STILL);

    drag("Atacante 2", { x: 20, y: 60 });

    expect(token("Atacante 2")).toHaveAttribute("aria-pressed", "true");
    expectAt("Atacante 2", { x: 20, y: 60 });
    expect(button("Deshacer")).toBeDisabled();
    expect(button("Guardar pizarra")).toBeDisabled();
  });

  it("un temblor que no llega a otra unidad de pista tampoco cuenta", () => {
    renderEditor(STILL);
    const target = token("Atacante 2");
    const at = screenPoint({ x: 20, y: 60 });

    fireEvent.pointerDown(target, { ...FINGER, ...at });
    fireEvent.pointerMove(target, { ...FINGER, clientX: at.clientX + 1, clientY: at.clientY - 1 });
    fireEvent.pointerUp(target, { ...FINGER, clientX: at.clientX + 1, clientY: at.clientY - 1 });

    expectAt("Atacante 2", { x: 20, y: 60 });
    expect(button("Deshacer")).toBeDisabled();
  });

  it("volver al punto de partida antes de soltar no deja nada que deshacer", () => {
    renderEditor(STILL);

    drag("Atacante 2", { x: 20, y: 60 }, { x: 40, y: 35 }, { x: 20, y: 60 });

    expectAt("Atacante 2", { x: 20, y: 60 });
    expect(button("Deshacer")).toBeDisabled();
  });

  it("soltarla fuera de la pista la deja a dos unidades del borde: ni fuera ni a medias", () => {
    renderEditor(STILL);
    const target = token("Atacante 2");

    fireEvent.pointerDown(target, { ...FINGER, ...screenPoint({ x: 20, y: 60 }) });
    // La esquina de la caja, en el margen que rodea a la pista.
    fireEvent.pointerMove(target, { ...FINGER, clientX: 0, clientY: 0 });
    expectAt("Atacante 2", { x: 2, y: 2 });
    fireEvent.pointerUp(target, { ...FINGER, clientX: 0, clientY: 0 });

    expectAt("Atacante 2", { x: 2, y: 2 });

    // Y por el otro lado.
    drag("Atacante 2", { x: 2, y: 2 }, { x: 100, y: 100 });
    expectAt("Atacante 2", { x: 98, y: 98 });
  });

  it("la ficha se mueve lo que se mueve el dedo: no salta a él si se la toca fuera de su centro", () => {
    renderEditor(STILL);

    // El dedo cae dos unidades a un lado del centro de la ficha, que está en (20, 60).
    drag("Atacante 2", { x: 22, y: 63 }, { x: 42, y: 38 });

    expectAt("Atacante 2", { x: 40, y: 35 });
  });

  it("hasta mover el dedo seis píxeles es un toque, no un arrastre", () => {
    renderEditor(STILL);
    const target = token("Atacante 2");
    const at = screenPoint({ x: 20, y: 60 });

    fireEvent.pointerDown(target, { ...FINGER, ...at });
    fireEvent.pointerMove(target, { ...FINGER, clientX: at.clientX + 5, clientY: at.clientY });
    expectAt("Atacante 2", { x: 20, y: 60 });

    // Con seis, ya la lleva: 6 px son una unidad y media de la caja.
    fireEvent.pointerMove(target, { ...FINGER, clientX: at.clientX + 6, clientY: at.clientY });
    expectAt("Atacante 2", { x: 22, y: 60 });

    // Y una vez empezado, sigue al dedo aunque vuelva a estar cerca.
    fireEvent.pointerMove(target, { ...FINGER, clientX: at.clientX + 4, clientY: at.clientY });
    fireEvent.pointerUp(target, { ...FINGER, clientX: at.clientX + 4, clientY: at.clientY });
    expectAt("Atacante 2", { x: 21, y: 60 });
  });

  it("cuenta el punto donde se suelta, aunque el último movimiento no haya llegado", () => {
    renderEditor(STILL);
    const target = token("Atacante 2");

    fireEvent.pointerDown(target, { ...FINGER, ...screenPoint({ x: 20, y: 60 }) });
    fireEvent.pointerMove(target, { ...FINGER, ...screenPoint({ x: 30, y: 50 }) });
    fireEvent.pointerUp(target, { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });

    expectAt("Atacante 2", { x: 40, y: 35 });

    // También sin ningún movimiento de por medio.
    fireEvent.pointerDown(target, { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });
    fireEvent.pointerUp(target, { ...FINGER, ...screenPoint({ x: 60, y: 20 }) });

    expectAt("Atacante 2", { x: 60, y: 20 });
  });

  it("el botón derecho no arrastra ni elige", () => {
    renderEditor(STILL);
    const target = token("Atacante 2");

    fireEvent.pointerDown(target, { ...FINGER, button: 2, ...screenPoint({ x: 20, y: 60 }) });
    fireEvent.pointerMove(target, { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });
    fireEvent.pointerUp(target, { ...FINGER, button: 2, ...screenPoint({ x: 40, y: 35 }) });

    expectAt("Atacante 2", { x: 20, y: 60 });
    expect(token("Atacante 2")).toHaveAttribute("aria-pressed", "false");
    expect(button("Deshacer")).toBeDisabled();
  });

  it("un ratón que se mueve sin botón pulsado ya soltó: la ficha no le sigue", () => {
    renderEditor(STILL);
    const target = token("Atacante 2");
    const mouse = { ...FINGER, pointerType: "mouse" };

    // El `pointerup` no llegó (se soltó fuera de la ventana): lo dice el primer movimiento sin botón.
    fireEvent.pointerDown(target, { ...mouse, buttons: 1, ...screenPoint({ x: 20, y: 60 }) });
    fireEvent.pointerMove(target, { ...mouse, buttons: 0, ...screenPoint({ x: 40, y: 35 }) });
    fireEvent.pointerMove(target, { ...mouse, buttons: 0, ...screenPoint({ x: 60, y: 20 }) });

    expectAt("Atacante 2", { x: 20, y: 60 });
    expect(button("Deshacer")).toBeDisabled();
  });

  it("un segundo dedo sobre otra ficha no interrumpe el arrastre ni empieza otro", () => {
    renderEditor(STILL);
    const first = token("Atacante 2");
    const second = token("Defensor 2");

    fireEvent.pointerDown(first, { ...FINGER, ...screenPoint({ x: 20, y: 60 }) });
    fireEvent.pointerMove(first, { ...FINGER, ...screenPoint({ x: 30, y: 50 }) });
    fireEvent.pointerDown(second, { pointerId: 2, isPrimary: false, button: 0, ...screenPoint({ x: 70, y: 50 }) });
    fireEvent.pointerMove(second, { pointerId: 2, isPrimary: false, ...screenPoint({ x: 80, y: 80 }) });
    fireEvent.pointerUp(second, { pointerId: 2, isPrimary: false, ...screenPoint({ x: 80, y: 80 }) });
    fireEvent.pointerMove(first, { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });
    fireEvent.pointerUp(first, { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });

    expectAt("Atacante 2", { x: 40, y: 35 });
    expectAt("Defensor 2", { x: 70, y: 50 });
    expect(token("Atacante 2")).toHaveAttribute("aria-pressed", "true");
  });

  it("solo cuenta el dedo que la pulsó: otro puntero que pase por encima no la mueve ni la suelta", () => {
    renderEditor(STILL);
    const target = token("Atacante 2");

    fireEvent.pointerDown(target, { ...FINGER, ...screenPoint({ x: 20, y: 60 }) });
    fireEvent.pointerMove(target, { pointerId: 7, isPrimary: true, ...screenPoint({ x: 60, y: 20 }) });
    fireEvent.pointerUp(target, { pointerId: 7, isPrimary: true, ...screenPoint({ x: 60, y: 20 }) });
    expectAt("Atacante 2", { x: 20, y: 60 });

    // El arrastre del primero sigue en pie.
    fireEvent.pointerMove(target, { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });
    fireEvent.pointerUp(target, { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });
    expectAt("Atacante 2", { x: 40, y: 35 });
  });

  it("al arrastrar a quien lleva el balón, el balón va con él: mientras se arrastra y al soltar", async () => {
    renderEditor(STILL);
    const target = token("Atacante 1");

    fireEvent.pointerDown(target, { ...FINGER, ...screenPoint({ x: 50, y: 80 }) });
    fireEvent.pointerMove(target, { ...FINGER, ...screenPoint({ x: 30, y: 40 }) });

    const carried = translate(
      tokenBox("half", { ...BALL, at: { x: 33, y: 40 } }, {}, [{ ...A1, at: { x: 30, y: 40 } }]),
    );
    expect(token("Balón")).toHaveAttribute("transform", carried);

    fireEvent.pointerUp(target, { ...FINGER, ...screenPoint({ x: 30, y: 40 }) });

    expect(token("Balón")).toHaveAttribute("transform", carried);
    const board = await savedBoard();
    expect(board?.tokens.find((item) => item.id === "a1")?.at).toEqual({ x: 30, y: 40 });
    expect(board?.tokens.find((item) => item.id === "b1")?.at).toEqual({ x: 33, y: 40 });
  });

  it("arrastrar al jugador con su balón es un solo paso atrás, y devuelve a los dos", () => {
    renderEditor(STILL);

    drag("Atacante 1", { x: 50, y: 80 }, { x: 30, y: 40 });
    press("Deshacer");

    expectAt("Atacante 1", { x: 50, y: 80 });
    expect(token("Balón")).toHaveAttribute("transform", translate(tokenBox("half", BALL, {}, [A1])));
    expect(button("Deshacer")).toBeDisabled();
  });

  it("arrastrar el balón lo separa de quien lo llevaba; el jugador no se mueve", async () => {
    renderEditor(STILL);

    drag("Balón", { x: 53, y: 80 }, { x: 23, y: 60 });

    expectAt("Atacante 1", { x: 50, y: 80 });
    const board = await savedBoard();
    expect(board?.tokens.find((item) => item.id === "b1")?.at).toEqual({ x: 23, y: 60 });
  });

  it("si el gesto se cancela, la ficha vuelve a su sitio y no cambia nada", () => {
    renderEditor(STILL);
    const target = token("Atacante 2");

    fireEvent.pointerDown(target, { ...FINGER, ...screenPoint({ x: 20, y: 60 }) });
    fireEvent.pointerMove(target, { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });
    fireEvent.pointerCancel(target, FINGER);

    expectAt("Atacante 2", { x: 20, y: 60 });
    expect(button("Deshacer")).toBeDisabled();
  });

  it("mover el dedo sobre una ficha sin haberla pulsado no la mueve", () => {
    renderEditor(STILL);

    fireEvent.pointerMove(token("Atacante 2"), { ...FINGER, ...screenPoint({ x: 40, y: 35 }) });

    expectAt("Atacante 2", { x: 20, y: 60 });
  });

  it("solo se mueve la ficha pulsada, no las demás", () => {
    renderEditor(STILL);

    drag("Atacante 2", { x: 20, y: 60 }, { x: 40, y: 35 });

    expectAt("Atacante 1", { x: 50, y: 80 });
    expectAt("Defensor 2", { x: 70, y: 50 });
    expectAt("Cono 1", { x: 80, y: 30 });
  });

  it("con una pista sin tamaño (aún sin pintar) un arrastre no la mueve a ningún sitio", () => {
    renderEditor(STILL);
    // Sin `court()`: la pista mide lo que dice jsdom, 0 × 0.
    const target = screen.getByRole("button", { name: "Atacante 2" });

    fireEvent.pointerDown(target, { ...FINGER, clientX: 80, clientY: 160 });
    fireEvent.pointerMove(target, { ...FINGER, clientX: 200, clientY: 100 });
    fireEvent.pointerUp(target, { ...FINGER, clientX: 200, clientY: 100 });

    expect(target).toHaveAttribute("transform", translate(toBox("half", { x: 20, y: 60 })));
    expect(button("Deshacer")).toBeDisabled();
  });

  it("en pista completa, el punto bajo el dedo es el de la pista apaisada", () => {
    renderEditor({ ...STILL, court: "full" });

    drag("Atacante 2", { x: 20, y: 60 }, { x: 80, y: 10 });

    expectAt("Atacante 2", { x: 80, y: 10 });
  });

  it("en un paso, arrastrar no mueve la ficha: solo la elige", () => {
    renderEditor(PLAY);
    press("Paso 1");

    drag("Atacante 2", { x: 20, y: 60 }, { x: 40, y: 35 });

    expectAt("Atacante 2", { x: 20, y: 60 });
    expect(token("Atacante 2")).toHaveAttribute("aria-pressed", "true");
    expect(button("Deshacer")).toBeDisabled();
    expect(button("Guardar pizarra")).toBeDisabled();
  });
});

// ── Pasos ────────────────────────────────────────────────────────────────────────────

describe("BoardEditor · pasos", () => {
  it("«Paso» añade un paso y pasa a verlo", () => {
    renderEditor(STILL);

    press("Añadir paso");

    expect(chipNames()).toEqual(["Inicio", "Paso 1", "Paso"]);
    expect(button("Paso 1")).toHaveAttribute("aria-pressed", "true");
    expect(button("Inicio")).toHaveAttribute("aria-pressed", "false");
  });

  it("en un paso sin ficha elegida dice qué hacer y ofrece su nota, duplicarlo y quitarlo", () => {
    renderEditor(STILL);

    press("Añadir paso");

    expect(screen.getByText("Toca una ficha para decir qué hace en este paso.")).toBeInTheDocument();
    expect(screen.getByLabelText("Nota del paso")).toHaveValue("");
    expect(screen.getByLabelText("Nota del paso")).toHaveAttribute("maxlength", "140");
    expect(button("Duplicar paso")).toBeEnabled();
    expect(button("Quitar paso")).toBeInTheDocument();
    // En un paso no se añaden fichas ni se cambia de pista.
    expect(screen.queryByRole("group", { name: "Añadir ficha" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Pista" })).not.toBeInTheDocument();
  });

  it("añadir un paso suelta la ficha que estuviera elegida", () => {
    renderEditor(STILL);
    choose("Atacante 1");

    press("Añadir paso");

    expect(token("Atacante 1")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Toca una ficha para decir qué hace en este paso.")).toBeInTheDocument();
  });

  it("desde un paso, el nuevo va detrás del que se ve", () => {
    renderEditor(PLAY);
    press("Paso 1");

    press("Añadir paso");

    expect(chipNames()).toEqual(["Inicio", "Paso 1", "Paso 2", "Paso 3", "Paso"]);
    expect(button("Paso 2")).toHaveAttribute("aria-pressed", "true");
    // El nuevo está vacío; el que era el 2 es ahora el 3.
    expect(drawnKinds()).toEqual([]);
    press("Paso 3");
    expect(drawnKinds()).toEqual(["dribble"]);
  });

  it("desde «Inicio», el nuevo es el primero", () => {
    renderEditor(PLAY);

    press("Añadir paso");

    expect(chipNames()).toEqual(["Inicio", "Paso 1", "Paso 2", "Paso 3", "Paso"]);
    expect(button("Paso 1")).toHaveAttribute("aria-pressed", "true");
    expect(drawnKinds()).toEqual([]);
    press("Paso 2");
    expect(drawnKinds()).toEqual(["pass", "cut"]);
  });

  it("cada paso enseña sus movimientos; «Inicio», ninguno", () => {
    renderEditor(PLAY);
    expect(drawnKinds()).toEqual([]);

    press("Paso 1");
    expect(drawnKinds()).toEqual(["pass", "cut"]);

    press("Paso 2");
    expect(drawnKinds()).toEqual(["dribble"]);

    press("Inicio");
    expect(drawnKinds()).toEqual([]);
  });

  it("el trazo de un movimiento va de donde está la ficha a su destino", () => {
    renderEditor(PLAY);

    press("Paso 1");

    const cut = drawnMoves().find((mark) => mark.getAttribute("data-move") === "cut");
    expect(cut?.querySelector("path")).toHaveAttribute("d", lineOf("cut", { x: 50, y: 80 }, { x: 50, y: 30 }));
  });

  it("un paso enseña las fichas donde están al empezarlo", () => {
    renderEditor(PLAY);

    press("Paso 1");
    expectAt("Atacante 1", { x: 50, y: 80 });
    expectAt("Atacante 2", { x: 20, y: 60 });

    press("Paso 2");
    // El 1 ya ha cortado; el 2 aún no ha botado.
    expectAt("Atacante 1", { x: 50, y: 30 });
    expectAt("Atacante 2", { x: 20, y: 60 });

    press("Inicio");
    expectAt("Atacante 1", { x: 50, y: 80 });
  });

  it("el balón que alguien lleva se pinta pegado a él, como en el visor", () => {
    renderEditor(PLAY);

    expect(token("Balón")).toHaveAttribute("transform", translate(tokenBox("half", BALL, {}, [A1])));

    // Tras el pase lo lleva el 2.
    press("Paso 2");
    expect(token("Balón")).toHaveAttribute(
      "transform",
      translate(tokenBox("half", { ...BALL, at: { x: 23, y: 60 } }, {}, [A2])),
    );
  });

  it("cambiar de paso suelta la ficha elegida", () => {
    renderEditor(PLAY);
    press("Paso 1");
    choose("Atacante 1");

    press("Paso 2");

    expect(token("Atacante 1")).toHaveAttribute("aria-pressed", "false");
  });

  it("la nota del paso que se ve es la suya", () => {
    renderEditor(PLAY);

    press("Paso 1");
    expect(screen.getByLabelText("Nota del paso")).toHaveValue("El 1 pasa al 2 y corta");

    press("Paso 2");
    expect(screen.getByLabelText("Nota del paso")).toHaveValue("");
  });

  it("la nota que se escribe se guarda con su paso, sin espacios de sobra", async () => {
    renderEditor(PLAY);
    press("Paso 2");

    fireEvent.change(screen.getByLabelText("Nota del paso"), { target: { value: "  El 2 ataca el aro  " } });
    expect(screen.getByLabelText("Nota del paso")).toHaveValue("  El 2 ataca el aro  ");

    const board = await savedBoard();
    expect(board?.steps[1]).toEqual({
      note: "El 2 ataca el aro",
      moves: [{ token: "a2", kind: "dribble", to: { x: 30, y: 25 } }],
    });
  });

  it("vaciar la nota la quita del paso", async () => {
    renderEditor(PLAY);
    press("Paso 1");

    fireEvent.change(screen.getByLabelText("Nota del paso"), { target: { value: "" } });

    const board = await savedBoard();
    expect(board?.steps[0]).not.toHaveProperty("note");
  });

  it("escribir una nota letra a letra es un solo paso atrás", () => {
    renderEditor(PLAY);
    press("Paso 2");
    const note = () => screen.getByLabelText("Nota del paso");

    fireEvent.change(note(), { target: { value: "B" } });
    fireEvent.change(note(), { target: { value: "Bo" } });
    fireEvent.change(note(), { target: { value: "Bot" } });
    press("Deshacer");

    expect(note()).toHaveValue("");
    expect(button("Deshacer")).toBeDisabled();
  });

  it("«Duplicar paso» añade detrás una copia del que se ve, con su nota y lo que hace cada ficha, y pasa a verla", async () => {
    renderEditor(PLAY);
    press("Paso 1");

    press("Duplicar paso");

    expect(chipNames()).toEqual(["Inicio", "Paso 1", "Paso 2", "Paso 3", "Paso"]);
    expect(button("Paso 2")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Nota del paso")).toHaveValue("El 1 pasa al 2 y corta");
    const board = await savedBoard();
    // El original y el siguiente quedan como estaban, con la copia en medio.
    expect(board?.steps).toHaveLength(3);
    expect(board?.steps[0]).toEqual(PLAY.steps[0]);
    expect(board?.steps[2]).toEqual(PLAY.steps[1]);
    // De la copia, aquí solo qué ficha hace qué: hasta dónde llega cada una lo decide el reductor
    // (`editor.test.ts`).
    expect(board?.steps[1].note).toBe("El 1 pasa al 2 y corta");
    expect(board?.steps[1].moves.map((move) => [move.token, move.kind])).toEqual([
      ["b1", "pass"],
      ["a1", "cut"],
    ]);
  });

  it("duplicar un paso es un solo paso atrás", () => {
    renderEditor(PLAY);
    press("Paso 1");
    press("Duplicar paso");

    press("Deshacer");

    expect(chipNames()).toEqual(["Inicio", "Paso 1", "Paso 2", "Paso"]);
    expect(button("Deshacer")).toBeDisabled();
  });

  it("«Quitar paso» quita el que se ve y los siguientes se renumeran", async () => {
    renderEditor(PLAY);
    press("Paso 1");

    press("Quitar paso");

    expect(chipNames()).toEqual(["Inicio", "Paso 1", "Paso"]);
    // Se ve el que ocupa su sitio: el que era el 2.
    expect(button("Paso 1")).toHaveAttribute("aria-pressed", "true");
    expect(drawnKinds()).toEqual(["dribble"]);
    expect((await savedBoard())?.steps).toEqual([PLAY.steps[1]]);
  });

  it("al quitar el último paso se ve el anterior; sin pasos, «Inicio»", () => {
    renderEditor(PLAY);
    press("Paso 2");

    press("Quitar paso");
    expect(button("Paso 1")).toHaveAttribute("aria-pressed", "true");

    press("Quitar paso");
    expect(chipNames()).toEqual(["Inicio", "Paso"]);
    expect(button("Inicio")).toHaveAttribute("aria-pressed", "true");
  });

  it("al quitar un paso, las posiciones de los siguientes se recalculan solas", () => {
    renderEditor(PLAY);
    press("Paso 1");

    press("Quitar paso");

    // Sin el corte del paso quitado, el 1 sigue donde empezó.
    expectAt("Atacante 1", { x: 50, y: 80 });
  });
});

// ── Lo que puede hacer cada ficha ────────────────────────────────────────────────────

describe("BoardEditor · elegir una ficha en un paso", () => {
  /** Los botones de acción que se ofrecen para la ficha elegida, en su orden. */
  const offered = () =>
    ["Cortar", "Botar", "Bloquear", "Pasar", "Quitar movimiento", "Quitar pase"].filter(
      (name) => screen.queryByRole("button", { name }) !== null,
    );

  function renderStep(board: Board = STILL) {
    const view = renderEditor(board);
    press("Añadir paso");
    return view;
  }

  it("un atacante sin balón puede cortar, botar y bloquear; no pasar", () => {
    renderStep();

    choose("Atacante 2");

    expect(token("Atacante 2")).toHaveAttribute("aria-pressed", "true");
    expect(offered()).toEqual(["Cortar", "Botar", "Bloquear"]);
  });

  it("un defensor, lo mismo", () => {
    renderStep();

    choose("Defensor 2");

    expect(offered()).toEqual(["Cortar", "Botar", "Bloquear"]);
  });

  it("el jugador que lleva el balón también puede pasar", () => {
    renderStep();

    choose("Atacante 1");

    expect(offered()).toEqual(["Cortar", "Botar", "Bloquear", "Pasar"]);
  });

  it("el balón solo se pasa", () => {
    renderStep();

    choose("Balón");

    expect(offered()).toEqual(["Pasar"]);
  });

  it("un cono no hace nada, y se dice", () => {
    renderStep();

    choose("Cono 1");

    expect(screen.getByText("Los conos no se mueven.")).toBeInTheDocument();
    expect(offered()).toEqual([]);
  });

  it("quien lleva el balón depende del paso: tras el pase, es el otro quien puede pasar", () => {
    renderEditor(PLAY);
    press("Paso 2");

    choose("Atacante 2");
    expect(offered()).toContain("Pasar");

    choose("Atacante 1");
    expect(offered()).not.toContain("Pasar");
  });

  it("en un paso no se ofrece ni mover la ficha con las flechas ni quitarla", () => {
    renderStep();

    choose("Atacante 2");

    expect(screen.queryByRole("group", { name: "Mover la ficha" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar ficha" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nota del paso")).not.toBeInTheDocument();
  });

  it("tocar la pista suelta la ficha y vuelve a lo del paso", () => {
    renderStep();
    choose("Atacante 2");

    tap({ x: 90, y: 90 });

    expect(token("Atacante 2")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText("Nota del paso")).toBeInTheDocument();
    expect(drawnKinds()).toEqual([]);
  });
});

// ── Acción y destino ─────────────────────────────────────────────────────────────────

describe("BoardEditor · dibujar un movimiento", () => {
  function renderStep(board: Board = STILL) {
    const view = renderEditor(board);
    press("Añadir paso");
    return view;
  }

  const hint = (action: string) => screen.queryByText(`${action}: toca la pista donde acaba.`);

  it.each(["Cortar", "Botar", "Bloquear"])("«%s» pide el destino: lo dice, y ofrece sus flechas, «Confirmar» y «Cancelar»", (action) => {
    renderStep();
    choose("Atacante 2");

    press(action);

    expect(hint(action)).toHaveAttribute("role", "status");
    const arrows = screen.getByRole("group", { name: "Mover el destino" });
    expect(within(arrows).getAllByRole("button").map((arrow) => arrow.getAttribute("aria-label"))).toEqual([
      "Mover el destino a la izquierda",
      "Mover el destino arriba",
      "Mover el destino abajo",
      "Mover el destino a la derecha",
    ]);
    expect(button("Confirmar")).toBeInTheDocument();
    expect(button("Cancelar")).toBeInTheDocument();
    // Mientras tanto no se ofrece otra acción.
    expect(screen.queryByRole("button", { name: "Cortar" })).not.toBeInTheDocument();
    // Todavía no hay movimiento: solo el destino, a medias.
    expect(drawnKinds()).toEqual([]);
  });

  it.each([
    ["Cortar", "cut"],
    ["Botar", "dribble"],
    ["Bloquear", "screen"],
  ] as const)("«%s» y tocar la pista dibuja el movimiento hasta ahí y sale de ese modo", async (action, kind) => {
    renderStep();
    choose("Atacante 2");
    press(action);

    tap({ x: 40, y: 30 });

    expect(drawnKinds()).toEqual([kind]);
    expect(drawnMoves()[0].querySelector("path")).toHaveAttribute(
      "d",
      lineOf(kind, { x: 20, y: 60 }, { x: 40, y: 30 }),
    );
    expect(hint(action)).not.toBeInTheDocument();
    expect(court().querySelector("[data-pending]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirmar" })).not.toBeInTheDocument();
    // La ficha sigue elegida, y ahora su movimiento se puede quitar.
    expect(token("Atacante 2")).toHaveAttribute("aria-pressed", "true");
    expect(button("Quitar movimiento")).toBeInTheDocument();
    expect((await savedBoard())?.steps).toEqual([{ moves: [{ token: "a2", kind, to: { x: 40, y: 30 } }] }]);
  });

  it("en un paso la ficha no se mueve de sitio: lo que cambia es dónde empieza el siguiente", () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");
    tap({ x: 40, y: 30 });
    expectAt("Atacante 2", { x: 20, y: 60 });

    press("Añadir paso");

    expectAt("Atacante 2", { x: 40, y: 30 });
  });

  it("«Cancelar» no dibuja nada y vuelve a las acciones de la ficha", () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");

    press("Cancelar");

    expect(court().querySelectorAll("[data-move]")).toHaveLength(0);
    expect(hint("Cortar")).not.toBeInTheDocument();
    expect(token("Atacante 2")).toHaveAttribute("aria-pressed", "true");
    expect(button("Cortar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar movimiento" })).not.toBeInTheDocument();
    expect(button("Guardar pizarra")).toBeDisabled();
  });

  it("el destino nace un poco hacia el aro, y se ve a medias antes de confirmar", () => {
    renderStep();
    choose("Atacante 1");

    press("Cortar");

    expect(pendingTarget()).toEqual(toBox("half", { x: 50, y: 62 }));
    const pending = court().querySelector("[data-pending]");
    expect(pending).toHaveAttribute("pointer-events", "none");
    expect(pending?.querySelector("[data-move]")).toHaveAttribute("data-move", "cut");
  });

  it("«Confirmar» dibuja el movimiento en el destino que hay", async () => {
    renderStep();
    choose("Atacante 1");
    press("Cortar");

    press("Confirmar");

    expect(drawnKinds()).toEqual(["cut"]);
    expect(drawnMoves()[0].querySelector("path")).toHaveAttribute(
      "d",
      lineOf("cut", { x: 50, y: 80 }, { x: 50, y: 62 }),
    );
    expect(hint("Cortar")).not.toBeInTheDocument();
    expect((await savedBoard())?.steps).toEqual([
      { moves: [{ token: "a1", kind: "cut", to: { x: 50, y: 62 } }] },
    ]);
  });

  it("pegada al aro, el destino nace hacia el otro lado: nunca fuera de la pista", async () => {
    renderStep({ ...STILL, tokens: [{ ...A1, at: { x: 50, y: 10 } }] });
    choose("Atacante 1");
    press("Cortar");

    expect(pendingTarget()).toEqual(toBox("half", { x: 50, y: 28 }));
    press("Confirmar");

    expect((await savedBoard())?.steps[0].moves[0].to).toEqual({ x: 50, y: 28 });
  });

  it("las flechas llevan el destino antes de confirmar", async () => {
    renderStep();
    choose("Atacante 1");
    press("Cortar");

    press("Mover el destino a la derecha");
    press("Mover el destino a la derecha");
    press("Mover el destino arriba");
    expect(pendingTarget()).toEqual(toBox("half", { x: 54, y: 60 }));
    press("Mover el destino a la izquierda");
    press("Mover el destino abajo");
    press("Mover el destino abajo");
    expect(pendingTarget()).toEqual(toBox("half", { x: 52, y: 64 }));
    // Hasta confirmar no hay movimiento.
    expect(drawnKinds()).toEqual([]);
    expect(button("Deshacer")).toBeEnabled();

    press("Confirmar");

    expect((await savedBoard())?.steps[0].moves).toEqual([{ token: "a1", kind: "cut", to: { x: 52, y: 64 } }]);
  });

  it("en pista completa las flechas del destino siguen la pantalla: a la izquierda es hacia el aro", async () => {
    renderStep({ ...STILL, court: "full" });
    choose("Atacante 1");
    press("Cortar");
    expect(pendingTarget()).toEqual(toBox("full", { x: 50, y: 62 }));

    press("Mover el destino a la izquierda");
    press("Mover el destino arriba");

    expect(pendingTarget()).toEqual(toBox("full", { x: 52, y: 60 }));
    press("Confirmar");
    expect((await savedBoard())?.steps[0].moves[0].to).toEqual({ x: 52, y: 60 });
  });

  it("el destino para a dos unidades del borde con las flechas", async () => {
    renderStep({ ...STILL, tokens: [{ ...A1, at: { x: 95, y: 80 } }] });
    choose("Atacante 1");
    press("Cortar");

    press("Mover el destino a la derecha");
    press("Mover el destino a la derecha");
    press("Mover el destino a la derecha");

    expect(pendingTarget()).toEqual(toBox("half", { x: 98, y: 62 }));
    press("Confirmar");
    expect((await savedBoard())?.steps[0].moves[0].to).toEqual({ x: 98, y: 62 });
  });

  it("tocar el margen de la pista deja el destino a dos unidades del borde", async () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");

    fireEvent.click(court(), { clientX: 0, clientY: 0 });

    expect((await savedBoard())?.steps[0].moves[0].to).toEqual({ x: 2, y: 2 });
  });

  it("dibujar un movimiento es un paso atrás; mover el destino, ninguno", () => {
    renderEditor(PLAY);
    press("Paso 2");
    choose("Atacante 1");
    press("Cortar");
    press("Mover el destino arriba");
    expect(button("Deshacer")).toBeDisabled();

    press("Confirmar");
    expect(drawnKinds()).toEqual(["dribble", "cut"]);

    press("Deshacer");
    expect(drawnKinds()).toEqual(["dribble"]);
    expect(button("Deshacer")).toBeDisabled();
  });

  it("elegir otra acción sustituye el movimiento, y parte de donde ya acababa", async () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");
    tap({ x: 40, y: 30 });

    press("Botar");
    expect(pendingTarget()).toEqual(toBox("half", { x: 40, y: 30 }));
    press("Confirmar");

    expect(drawnKinds()).toEqual(["dribble"]);
    expect((await savedBoard())?.steps).toEqual([
      { moves: [{ token: "a2", kind: "dribble", to: { x: 40, y: 30 } }] },
    ]);
  });

  it("cada ficha lleva su movimiento: dos fichas, dos trazos", () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");
    tap({ x: 40, y: 30 });
    choose("Defensor 2");
    press("Bloquear");
    tap({ x: 60, y: 70 });

    expect(drawnKinds()).toEqual(["cut", "screen"]);
  });

  it("«Quitar movimiento» quita el de la ficha elegida, y no los demás", () => {
    renderEditor(PLAY);
    press("Paso 1");
    choose("Atacante 1");

    press("Quitar movimiento");

    expect(drawnKinds()).toEqual(["pass"]);
    expect(token("Atacante 1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "Quitar movimiento" })).not.toBeInTheDocument();
  });

  it("solo se ofrece «Quitar movimiento» a la ficha que se mueve en ese paso", () => {
    renderEditor(PLAY);
    press("Paso 1");

    choose("Atacante 2");
    expect(screen.queryByRole("button", { name: "Quitar movimiento" })).not.toBeInTheDocument();

    choose("Atacante 1");
    expect(button("Quitar movimiento")).toBeInTheDocument();
  });

  it.each([
    ["Cortar", "cut"],
    ["Botar", "dribble"],
    ["Bloquear", "screen"],
  ] as const)(
    "con «%s» a medias, tocar otra ficha es elegir el destino: el punto tocado, no encima de ella",
    async (action, kind) => {
      renderStep();
      choose("Atacante 2");
      press(action);

      // El defensor está en (70, 50): se le toca por un lado.
      tapToken("Defensor 2", { x: 67, y: 53 });

      expect(drawnKinds()).toEqual([kind]);
      // Sigue elegida la que se mueve, no la que se ha tocado.
      expect(token("Atacante 2")).toHaveAttribute("aria-pressed", "true");
      expect(token("Defensor 2")).toHaveAttribute("aria-pressed", "false");
      expect((await savedBoard())?.steps[0].moves).toEqual([{ token: "a2", kind, to: { x: 67, y: 53 } }]);
    },
  );

  it("con teclado no hay punto tocado: Enter sobre otra ficha lleva el movimiento a su centro", async () => {
    renderStep();
    choose("Atacante 2");
    press("Bloquear");

    fireEvent.keyDown(token("Defensor 2"), { key: "Enter" });

    expect((await savedBoard())?.steps[0].moves).toEqual([{ token: "a2", kind: "screen", to: { x: 70, y: 50 } }]);
  });

  it("un destino tan cerca que no se dibujaría no se guarda: lo dice y sigue pidiendo el destino", () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");

    tap({ x: 21, y: 61 });

    expect(screen.getByRole("status")).toHaveTextContent("Está demasiado cerca: toca más lejos de la ficha.");
    expect(hint("Cortar")).not.toBeInTheDocument();
    expect(drawnKinds()).toEqual([]);
    expect(button("Confirmar")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar movimiento" })).not.toBeInTheDocument();
    // No hay movimiento: nada que deshacer ni que guardar.
    expect(button("Deshacer")).toBeEnabled();
    expect(button("Guardar pizarra")).toBeDisabled();
  });

  it("tras el aviso, «Confirmar» en el mismo sitio sigue sin valer; mover el destino quita el aviso", () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");
    tap({ x: 21, y: 61 });

    press("Confirmar");
    expect(screen.getByRole("status")).toHaveTextContent("Está demasiado cerca: toca más lejos de la ficha.");
    expect(drawnKinds()).toEqual([]);

    press("Mover el destino arriba");
    expect(screen.getByRole("status")).toHaveTextContent("Cortar: toca la pista donde acaba.");
  });

  it("tras el aviso, tocar más lejos dibuja el movimiento", async () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");
    tap({ x: 21, y: 61 });

    tap({ x: 40, y: 30 });

    expect(drawnKinds()).toEqual(["cut"]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect((await savedBoard())?.steps).toEqual([{ moves: [{ token: "a2", kind: "cut", to: { x: 40, y: 30 } }] }]);
  });

  it("llevar el destino con las flechas hasta la propia ficha y confirmar tampoco guarda un movimiento que no se ve", () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");

    // El destino nace 18 unidades hacia el aro: nueve toques lo devuelven a la ficha.
    for (let touch = 0; touch < 9; touch += 1) press("Mover el destino abajo");
    press("Confirmar");

    expect(screen.getByRole("status")).toHaveTextContent("Está demasiado cerca: toca más lejos de la ficha.");
    expect(drawnKinds()).toEqual([]);
    expect(button("Guardar pizarra")).toBeDisabled();
  });

  it("cambiar un movimiento por un destino demasiado cercano no lo cambia: se queda el que había", async () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");
    tap({ x: 40, y: 30 });

    press("Botar");
    tap({ x: 21, y: 61 });
    press("Cancelar");

    expect(drawnKinds()).toEqual(["cut"]);
    expect((await savedBoard())?.steps).toEqual([{ moves: [{ token: "a2", kind: "cut", to: { x: 40, y: 30 } }] }]);
  });

  it("con una acción a medias, tocar la propia ficha no hace nada: sigue pidiendo el destino", () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");

    choose("Atacante 2");

    expect(hint("Cortar")).toBeInTheDocument();
    expect(drawnKinds()).toEqual([]);
  });

  it("con una acción a medias, pulsar sobre otra ficha no la elige ni cancela la acción", () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");

    fireEvent.pointerDown(token("Defensor 2"), { ...FINGER, ...screenPoint({ x: 70, y: 50 }) });

    expect(token("Atacante 2")).toHaveAttribute("aria-pressed", "true");
    expect(token("Defensor 2")).toHaveAttribute("aria-pressed", "false");
    expect(hint("Cortar")).toBeInTheDocument();
  });

  it.each(["Inicio", "Deshacer", "Vista previa", "Añadir paso"])(
    "«%s» deja la acción a medias sin dibujar",
    (control) => {
      renderEditor(PLAY);
      press("Paso 2");
      choose("Atacante 1");
      press("Cortar");
      // Para que haya algo que deshacer.
      if (control === "Deshacer") {
        press("Cancelar");
        press("Bloquear");
        tap({ x: 60, y: 20 });
        press("Cortar");
      }

      press(control);
      if (control === "Vista previa") press("Seguir editando");

      expect(hint("Cortar")).not.toBeInTheDocument();
      expect(court().querySelector("[data-pending]")).toBeNull();
      expect(drawnKinds()).not.toContain("cut");
    },
  );

  it("con una pista sin tamaño (aún sin pintar) un toque no confirma ningún destino", () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");
    // Sin `court()` de por medio tras este punto: la pista vuelve a medir 0 × 0.
    const svg = court();
    svg.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0);

    fireEvent.click(svg, { clientX: 100, clientY: 100 });

    expect(hint("Cortar")).toBeInTheDocument();
    expect(svg.querySelectorAll("[data-move]:not([data-pending] *)")).toHaveLength(0);
  });
});

// ── Pasar ────────────────────────────────────────────────────────────────────────────

describe("BoardEditor · pasar", () => {
  function renderStep(board: Board = STILL) {
    const view = renderEditor(board);
    press("Añadir paso");
    return view;
  }

  it("elegido el balón, «Pasar» y tocar la pista lo lleva hasta ahí", async () => {
    renderStep();
    choose("Balón");
    press("Pasar");
    expect(screen.getByText("Pasar: toca la pista donde acaba.")).toBeInTheDocument();

    tap({ x: 30, y: 20 });

    expect(drawnKinds()).toEqual(["pass"]);
    expect((await savedBoard())?.steps).toEqual([
      { moves: [{ token: "b1", kind: "pass", to: { x: 30, y: 20 } }] },
    ]);
  });

  it("tocar a otro jugador le deja el balón a él: a su lado, a tres unidades, se le toque donde se le toque", async () => {
    renderStep();
    choose("Balón");
    press("Pasar");

    tapToken("Atacante 2", { x: 18, y: 63 });

    expect(drawnKinds()).toEqual(["pass"]);
    expect((await savedBoard())?.steps).toEqual([
      { moves: [{ token: "b1", kind: "pass", to: { x: A2.at.x + 3, y: A2.at.y } }] },
    ]);
  });

  it("y en el paso siguiente el balón lo lleva quien lo recibió", () => {
    renderStep();
    choose("Balón");
    press("Pasar");
    choose("Atacante 2");

    press("Añadir paso");

    expect(token("Balón")).toHaveAttribute(
      "transform",
      translate(tokenBox("half", { ...BALL, at: { x: 23, y: 60 } }, {}, [A2])),
    );
    choose("Atacante 2");
    expect(button("Pasar")).toBeInTheDocument();
  });

  it("también vale un defensor", async () => {
    renderStep();
    choose("Balón");
    press("Pasar");

    choose("Defensor 2");

    expect((await savedBoard())?.steps[0].moves).toEqual([{ token: "b1", kind: "pass", to: { x: 73, y: 50 } }]);
  });

  it("pasar tocando un cono lo deja en el punto tocado: un cono no es un jugador", async () => {
    renderStep();
    choose("Balón");
    press("Pasar");

    tapToken("Cono 1", { x: 78, y: 32 });

    expect((await savedBoard())?.steps[0].moves).toEqual([{ token: "b1", kind: "pass", to: { x: 78, y: 32 } }]);
  });

  it("si quien recibe también se mueve en ese paso, el balón va a donde acaba, no a donde empieza", async () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");
    tap({ x: 20, y: 20 });
    choose("Balón");
    press("Pasar");

    choose("Atacante 2");

    expect((await savedBoard())?.steps).toEqual([
      {
        moves: [
          { token: "a2", kind: "cut", to: { x: 20, y: 20 } },
          { token: "b1", kind: "pass", to: { x: 23, y: 20 } },
        ],
      },
    ]);
  });

  it("y así, en el paso siguiente, es él quien lleva el balón", () => {
    renderStep();
    choose("Atacante 2");
    press("Cortar");
    tap({ x: 20, y: 20 });
    choose("Balón");
    press("Pasar");
    choose("Atacante 2");

    press("Añadir paso");
    choose("Atacante 2");

    expect(button("Pasar")).toBeInTheDocument();
  });

  it("pasárselo a quien ya lo lleva no es un pase: está demasiado cerca, y no se guarda", () => {
    renderStep();
    choose("Balón");
    press("Pasar");

    choose("Atacante 1");

    expect(screen.getByRole("status")).toHaveTextContent("Está demasiado cerca: toca más lejos de la ficha.");
    expect(drawnKinds()).toEqual([]);
    expect(button("Guardar pizarra")).toBeDisabled();
  });

  it("un pase corto desde quien lleva el balón tampoco se guarda: se mide desde donde se pinta el balón", () => {
    renderStep();
    choose("Atacante 1");
    press("Pasar");

    // Lejos del punto del balón, pero no de donde se pinta, pegado a su jugador: no habría trazo.
    tap({ x: 60, y: 89 });

    expect(screen.getByRole("status")).toHaveTextContent("Está demasiado cerca: toca más lejos de la ficha.");
    expect(drawnKinds()).toEqual([]);
    expect(button("Guardar pizarra")).toBeDisabled();
  });

  it("a un jugador pegado a la banda, el balón se queda en el borde de la pista", async () => {
    renderStep({ ...STILL, tokens: [A1, BALL, { ...A2, at: { x: 99, y: 40 } }] });
    choose("Balón");
    press("Pasar");

    choose("Atacante 2");

    expect((await savedBoard())?.steps[0].moves[0].to).toEqual({ x: 100, y: 40 });
  });

  it("con el jugador que lleva el balón, «Pasar» mueve el balón, no al jugador", async () => {
    renderStep();
    choose("Atacante 1");

    press("Pasar");
    // El destino nace desde el balón, no desde el jugador.
    expect(pendingTarget()).toEqual(toBox("half", { x: 53, y: 62 }));
    choose("Atacante 2");

    expect(drawnKinds()).toEqual(["pass"]);
    expect((await savedBoard())?.steps).toEqual([
      { moves: [{ token: "b1", kind: "pass", to: { x: 23, y: 60 } }] },
    ]);
  });

  it("después, a ese jugador se le ofrece «Quitar pase», y no «Quitar movimiento»", () => {
    renderStep();
    choose("Atacante 1");
    press("Pasar");
    tap({ x: 30, y: 20 });

    expect(token("Atacante 1")).toHaveAttribute("aria-pressed", "true");
    expect(button("Quitar pase")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quitar movimiento" })).not.toBeInTheDocument();
  });

  it("«Quitar pase» quita el pase del balón", () => {
    renderStep();
    choose("Atacante 1");
    press("Pasar");
    tap({ x: 30, y: 20 });

    press("Quitar pase");

    expect(drawnKinds()).toEqual([]);
    expect(screen.queryByRole("button", { name: "Quitar pase" })).not.toBeInTheDocument();
    expect(button("Pasar")).toBeInTheDocument();
  });

  it("quien lleva el balón puede pasar y cortar en el mismo paso: son dos movimientos", async () => {
    renderStep();
    choose("Atacante 1");
    press("Pasar");
    choose("Atacante 2");
    press("Cortar");
    tap({ x: 50, y: 30 });

    expect(drawnKinds()).toEqual(["pass", "cut"]);
    expect(button("Quitar movimiento")).toBeInTheDocument();
    expect(button("Quitar pase")).toBeInTheDocument();
    expect((await savedBoard())?.steps).toEqual([
      {
        moves: [
          { token: "b1", kind: "pass", to: { x: 23, y: 60 } },
          { token: "a1", kind: "cut", to: { x: 50, y: 30 } },
        ],
      },
    ]);
  });

  it("el trazo del pase sale de donde se pinta el balón, pegado a quien lo lleva", () => {
    renderStep();
    choose("Balón");
    press("Pasar");

    tap({ x: 30, y: 20 });

    const from = tokenBox("half", BALL, {}, [A1]);
    const paths = movePaths("pass", from, toBox("half", { x: 30, y: 20 }), 1);
    expect(drawnMoves()[0].querySelector("path")).toHaveAttribute("d", paths?.line);
  });
});

// ── La pista ─────────────────────────────────────────────────────────────────────────

describe("BoardEditor · media pista o pista completa", () => {
  it("«Pista completa» cambia la caja del dibujo y su proporción", () => {
    renderEditor();
    expect(court()).toHaveClass(BOARD_VIEW.half.aspect);

    press("Pista completa");

    expect(court()).toHaveAttribute("viewBox", BOARD_VIEW.full.viewBox);
    expect(court()).toHaveClass(BOARD_VIEW.full.aspect);
    expect(court()).not.toHaveClass(BOARD_VIEW.half.aspect);
    expect(button("Pista completa")).toHaveAttribute("aria-pressed", "true");
    expect(button("Media pista")).toHaveAttribute("aria-pressed", "false");
  });

  it("«Media pista» vuelve", () => {
    renderEditor();
    press("Pista completa");

    press("Media pista");

    expect(court()).toHaveAttribute("viewBox", BOARD_VIEW.half.viewBox);
    expect(court()).toHaveClass(BOARD_VIEW.half.aspect);
    expect(button("Media pista")).toHaveAttribute("aria-pressed", "true");
  });

  it("una pizarra de pista completa se abre en pista completa", () => {
    renderEditor({ ...STILL, court: "full" });

    expect(court()).toHaveAttribute("viewBox", BOARD_VIEW.full.viewBox);
    expect(button("Pista completa")).toHaveAttribute("aria-pressed", "true");
  });

  it("cambiar de pista no cambia las coordenadas de las fichas: se pintan donde les toca en la otra", () => {
    renderEditor(STILL);

    press("Pista completa");

    expect(token("Atacante 2")).toHaveAttribute("transform", translate(toBox("full", { x: 20, y: 60 })));
    expect(token("Cono 1")).toHaveAttribute("transform", translate(toBox("full", { x: 80, y: 30 })));
  });

  it("es un cambio que se guarda y que se deshace", async () => {
    renderEditor(STILL);

    press("Pista completa");
    expect(button("Guardar pizarra")).toBeEnabled();
    press("Deshacer");
    expect(court()).toHaveAttribute("viewBox", BOARD_VIEW.half.viewBox);
    expect(button("Guardar pizarra")).toBeDisabled();

    press("Rehacer");
    expect((await savedBoard())?.court).toBe("full");
  });

  it("pulsar la pista que ya está no cambia nada", () => {
    renderEditor(STILL);

    press("Media pista");

    expect(button("Deshacer")).toBeDisabled();
    expect(button("Guardar pizarra")).toBeDisabled();
  });
});

// ── Deshacer y rehacer ───────────────────────────────────────────────────────────────

describe("BoardEditor · deshacer y rehacer", () => {
  it.each([
    ["sin pizarra", null],
    ["con pizarra", PLAY],
  ])("%s, al abrir no hay nada que deshacer ni que rehacer", (_name, board) => {
    renderEditor(board);

    expect(button("Deshacer")).toBeDisabled();
    expect(button("Rehacer")).toBeDisabled();
  });

  it("deshacen y rehacen añadir una ficha", () => {
    renderEditor();
    press("Añadir atacante");
    expect(button("Deshacer")).toBeEnabled();
    expect(button("Rehacer")).toBeDisabled();

    press("Deshacer");

    expect(tokenNames()).toEqual([]);
    expect(button("Deshacer")).toBeDisabled();
    expect(button("Rehacer")).toBeEnabled();
    // Sin la ficha no hay ficha elegida: vuelven los botones de añadir.
    expect(screen.getByRole("group", { name: "Añadir ficha" })).toBeInTheDocument();

    press("Rehacer");

    expect(tokenNames()).toEqual(["Atacante 1"]);
    expectAt("Atacante 1", { x: 50, y: 70 });
    expect(button("Deshacer")).toBeEnabled();
    expect(button("Rehacer")).toBeDisabled();
  });

  it("deshacen de uno en uno, en orden inverso", () => {
    renderEditor();
    add("atacante", "defensor", "balón");

    press("Deshacer");
    expect(tokenNames()).toEqual(["Atacante 1", "Defensor 1"]);
    press("Deshacer");
    expect(tokenNames()).toEqual(["Atacante 1"]);
    press("Rehacer");
    press("Rehacer");
    expect(tokenNames()).toEqual(["Atacante 1", "Defensor 1", "Balón"]);
  });

  it("un cambio nuevo olvida lo deshecho", () => {
    renderEditor();
    add("atacante");
    press("Deshacer");

    press("Añadir defensor");

    expect(button("Rehacer")).toBeDisabled();
    expect(tokenNames()).toEqual(["Defensor 1"]);
  });

  it("elegir una ficha o cambiar de paso no son cambios: no se deshacen", () => {
    renderEditor(PLAY);

    choose("Atacante 1");
    press("Paso 1");
    choose("Atacante 2");
    press("Inicio");

    expect(button("Deshacer")).toBeDisabled();
  });

  it("deshacer un paso añadido devuelve la vista a uno que existe", () => {
    renderEditor(STILL);
    press("Añadir paso");
    expect(button("Paso 1")).toHaveAttribute("aria-pressed", "true");

    press("Deshacer");

    expect(chipNames()).toEqual(["Inicio", "Paso"]);
    expect(button("Inicio")).toHaveAttribute("aria-pressed", "true");
  });

  it("deshacer hasta dejarla como estaba quita los cambios sin guardar", () => {
    renderEditor(STILL);
    choose("Atacante 2");
    press("Mover la ficha arriba");
    expect(button("Guardar pizarra")).toBeEnabled();

    press("Deshacer");

    expect(button("Guardar pizarra")).toBeDisabled();
  });
});

// ── Vista previa ─────────────────────────────────────────────────────────────────────

describe("BoardEditor · vista previa", () => {
  it("enseña la pizarra en el visor y oculta el editor", () => {
    renderEditor(STILL);

    press("Vista previa");

    expect(screen.getByRole("img", { name: `Pizarra de ${TITLE}` })).toBeInTheDocument();
    expect(document.querySelector('svg[role="group"]')).toBeNull();
    expect(screen.queryByRole("group", { name: "Pasos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Añadir ficha" })).not.toBeInTheDocument();
    // El visor no tiene fichas que se puedan tocar.
    expect(screen.queryByRole("button", { name: "Atacante 1" })).not.toBeInTheDocument();
  });

  it("con pasos, el visor trae sus controles y la nota de cada paso", () => {
    renderEditor(PLAY);

    press("Vista previa");

    expect(screen.getByRole("img", { name: `Pizarra de ${TITLE}, paso 1 de 2` })).toBeInTheDocument();
    expect(button("Reproducir la pizarra")).toBeInTheDocument();
    expect(screen.getByText("El 1 pasa al 2 y corta")).toBeInTheDocument();
    fireEvent.click(button("Paso siguiente"));
    expect(screen.getByRole("img", { name: `Pizarra de ${TITLE}, paso 2 de 2` })).toBeInTheDocument();
  });

  it("enseña lo que se está dibujando, aún sin guardar", () => {
    renderEditor();
    add("atacante", "defensor");

    press("Vista previa");

    const viewer = screen.getByRole("img", { name: `Pizarra de ${TITLE}` });
    expect(viewer.querySelectorAll("[data-token]")).toHaveLength(2);
    expect(mocks.saveDrillBoard).not.toHaveBeenCalled();
  });

  it("es lo que se guardaría: un paso sin movimientos no sale", () => {
    renderEditor(STILL);
    press("Añadir paso");

    press("Vista previa");

    // Una foto fija: sin pasos, ni «paso 1 de 1» ni controles.
    expect(screen.getByRole("img", { name: `Pizarra de ${TITLE}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reproducir la pizarra" })).not.toBeInTheDocument();
  });

  it("mientras se ve, «Deshacer» y «Rehacer» no se pueden pulsar", () => {
    renderEditor();
    add("atacante", "defensor");
    press("Deshacer");
    expect(button("Deshacer")).toBeEnabled();
    expect(button("Rehacer")).toBeEnabled();

    press("Vista previa");

    expect(button("Deshacer")).toBeDisabled();
    expect(button("Rehacer")).toBeDisabled();
  });

  it("el botón pasa a ser «Seguir editando» y vuelve al editor donde estaba", () => {
    renderEditor(PLAY);
    press("Paso 2");
    // Cambia de nombre con lo que hace: no es un conmutador, no lleva `aria-pressed`.
    expect(button("Vista previa")).not.toHaveAttribute("aria-pressed");

    press("Vista previa");
    expect(button("Seguir editando")).not.toHaveAttribute("aria-pressed");
    expect(screen.queryByRole("button", { name: "Vista previa" })).not.toBeInTheDocument();

    press("Seguir editando");

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(court()).toBeInTheDocument();
    expect(button("Paso 2")).toHaveAttribute("aria-pressed", "true");
    expect(button("Vista previa")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Seguir editando" })).not.toBeInTheDocument();
  });

  it("sin fichas no hay nada que ver, y se dice", () => {
    renderEditor();

    press("Vista previa");

    expect(screen.getByText("Aún no hay nada que ver: añade alguna ficha.")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.querySelector('svg[role="group"]')).toBeNull();

    press("Seguir editando");

    expect(screen.queryByText("Aún no hay nada que ver: añade alguna ficha.")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Añadir ficha" })).toBeInTheDocument();
  });

  it("desde la vista previa también se guarda", async () => {
    renderEditor();
    add("atacante");
    press("Vista previa");

    const board = await savedBoard();

    expect(board?.tokens).toHaveLength(1);
  });
});

// ── Guardar ──────────────────────────────────────────────────────────────────────────

describe("BoardEditor · guardar", () => {
  it("«Guardar pizarra» es el botón principal y se activa con el primer cambio", () => {
    renderEditor();
    expect(button("Guardar pizarra")).toBeDisabled();
    expect(button("Guardar pizarra")).toHaveClass("bg-brand-accent", "w-full");

    press("Añadir atacante");

    expect(button("Guardar pizarra")).toBeEnabled();
  });

  it("quitar lo único que se había añadido lo vuelve a desactivar: no hay nada que guardar", () => {
    renderEditor();
    press("Añadir atacante");

    press("Quitar ficha");

    expect(button("Guardar pizarra")).toBeDisabled();
  });

  it("un paso vacío no es un cambio: solo, no deja guardar", () => {
    renderEditor(STILL);

    press("Añadir paso");
    fireEvent.change(screen.getByLabelText("Nota del paso"), { target: { value: "Una nota" } });

    expect(button("Guardar pizarra")).toBeDisabled();
  });

  it("manda el club, el ejercicio, la copia con la que se abrió y la pizarra, ya limpia", async () => {
    renderEditor();
    add("atacante", "balón");
    // Un paso sin movimientos, con su nota: no viaja.
    press("Añadir paso");
    fireEvent.change(screen.getByLabelText("Nota del paso"), { target: { value: "Aún sin dibujar" } });

    save();

    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(mocks.saveDrillBoard.mock.calls).toStrictEqual([
      [
        "club-a",
        {
          drillId: DRILL_ID,
          expectedUpdatedAt: LOADED,
          board: {
            version: 1,
            court: "half",
            tokens: [
              { id: "a1", kind: "attacker", label: "1", at: { x: 50, y: 70 } },
              { id: "b1", kind: "ball", at: { x: 25, y: 55 } },
            ],
            steps: [],
          },
        },
      ],
    ]);
  });

  it("de varios pasos solo viajan los que tienen movimientos, en su orden", async () => {
    renderEditor(STILL);
    press("Añadir paso");
    press("Añadir paso");
    choose("Atacante 2");
    press("Cortar");
    tap({ x: 40, y: 30 });
    press("Añadir paso");

    const board = await savedBoard();

    expect(chipNames()).toEqual(["Inicio", "Paso 1", "Paso 2", "Paso 3", "Paso"]);
    expect(board?.steps).toEqual([{ moves: [{ token: "a2", kind: "cut", to: { x: 40, y: 30 } }] }]);
  });

  it("al ir bien vuelve a la ficha del ejercicio", async () => {
    renderEditor();
    add("atacante");

    save();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1));
    expect(mocks.push).toHaveBeenCalledWith(DETAIL);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("mientras guarda, el botón espera: un segundo toque no guarda dos veces", async () => {
    const pending = deferred<{ updatedAt: string }>();
    mocks.saveDrillBoard.mockReturnValue(pending.promise);
    renderEditor(STILL);
    choose("Atacante 2");
    press("Mover la ficha arriba");

    save();

    await waitFor(() => expect(button("Guardar pizarra")).toBeDisabled());
    expect(button("Quitar pizarra")).toBeDisabled();
    save();
    expect(mocks.saveDrillBoard).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();

    pending.finish(ok({ updatedAt: "2026-10-03T10:05:00.654321+00:00" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DETAIL));
    // Ya se va: no se puede guardar otra vez mientras llega la ficha.
    expect(button("Guardar pizarra")).toBeDisabled();
    expect(button("Quitar pizarra")).toBeDisabled();
  });

  it("mientras guarda no se dibuja: la pista, los pasos, el panel y deshacer quedan inertes", async () => {
    const pending = deferred<{ updatedAt: string }>();
    mocks.saveDrillBoard.mockReturnValue(pending.promise);
    renderEditor(STILL);
    choose("Atacante 2");
    press("Mover la ficha arriba");
    const zone = () => court().closest("[inert]");
    expect(zone()).toBeNull();

    save();

    await waitFor(() => expect(zone()).not.toBeNull());
    expect(zone()).toContainElement(screen.getByRole("group", { name: "Pasos" }));
    expect(zone()).toContainElement(button("Mover la ficha arriba"));
    expect(zone()).toContainElement(button("Deshacer"));
    expect(zone()).toContainElement(button("Rehacer"));
    expect(zone()).toContainElement(button("Vista previa"));
    // Lo que no es dibujar queda fuera: el propio botón de guardar y el de quitar.
    expect(zone()).not.toContainElement(button("Guardar pizarra"));
    expect(zone()).not.toContainElement(button("Quitar pizarra"));

    pending.finish(fail("SAVE_FAILED"));

    // Si falla, se vuelve a poder dibujar.
    await screen.findByRole("alert");
    expect(zone()).toBeNull();
  });

  it("al ir bien sigue inerte mientras llega la ficha: ya se va", async () => {
    renderEditor(STILL);
    choose("Atacante 2");
    press("Mover la ficha arriba");

    save();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DETAIL));
    expect(court().closest("[inert]")).not.toBeNull();
  });

  it.each([
    ["SAVE_FAILED", ACTION_ERROR_COPY.SAVE_FAILED],
    ["NOT_FOUND", ACTION_ERROR_COPY.NOT_FOUND],
    // Aquí no hay campos marcados que revisar: el texto de `INVALID` es el de esta pantalla.
    ["INVALID", "No se puede guardar esta pizarra. Revisa las fichas y los pasos."],
  ] as const)(
    "si falla con %s enseña su texto, no navega y deja volver a intentarlo",
    async (error, copy) => {
      mocks.saveDrillBoard.mockResolvedValue(fail(error));
      renderEditor();
      add("atacante");

      save();

      expect(await screen.findByRole("alert")).toHaveTextContent(copy);
      expect(mocks.push).not.toHaveBeenCalled();
      expect(button("Guardar pizarra")).toBeEnabled();
      expect(screen.queryByRole("button", { name: "Recargar" })).not.toBeInTheDocument();
      // Lo dibujado sigue ahí.
      expect(tokenNames()).toEqual(["Atacante 1"]);
    },
  );

  it("el aviso se lleva el foco: el botón de guardar queda lejos de él", async () => {
    mocks.saveDrillBoard.mockResolvedValue(fail("SAVE_FAILED"));
    renderEditor();
    add("atacante");

    save();

    expect(await screen.findByRole("alert")).toHaveFocus();
  });

  it("si la llamada se cae (la red, el servidor) es un SAVE_FAILED, sin el mensaje del error", async () => {
    mocks.saveDrillBoard.mockRejectedValue(new Error("fallo de red con datos internos"));
    renderEditor();
    add("atacante");

    save();

    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.SAVE_FAILED);
    expect(screen.queryByText(/fallo de red/)).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("con una copia obsoleta lo dice y ofrece «Recargar», que recarga la página", async () => {
    mocks.saveDrillBoard.mockResolvedValue(fail("STALE_COPY"));
    renderEditor(STILL);
    choose("Atacante 2");
    press("Mover la ficha arriba");

    save();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(ACTION_ERROR_COPY.STALE_COPY);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.reload).not.toHaveBeenCalled();

    fireEvent.click(within(alert).getByRole("button", { name: "Recargar" }));

    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it("al volver a guardar se quita el aviso del intento anterior, y manda la misma copia", async () => {
    mocks.saveDrillBoard.mockResolvedValueOnce(fail("SAVE_FAILED"));
    renderEditor();
    add("atacante");
    save();
    await screen.findByRole("alert");

    save();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DETAIL));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.saveDrillBoard).toHaveBeenCalledTimes(2);
    expect(sent().expectedUpdatedAt).toBe(LOADED);
  });
});

// ── Con pizarra ──────────────────────────────────────────────────────────────────────

describe("BoardEditor · con pizarra", () => {
  /** El diálogo de confirmación, que tarda un turno en pintarse (busca dónde ir). */
  const dialog = () => screen.findByRole("alertdialog", { name: "¿Quitar la pizarra?" });

  it("se abre en «Inicio» con sus fichas y sus pasos", () => {
    renderEditor(PLAY);

    expect(tokenNames()).toEqual(["Atacante 1", "Atacante 2", "Defensor 2", "Balón", "Cono 1"]);
    expect(chipNames()).toEqual(["Inicio", "Paso 1", "Paso 2", "Paso"]);
    expect(button("Inicio")).toHaveAttribute("aria-pressed", "true");
    expectAt("Atacante 1", { x: 50, y: 80 });
    expectAt("Atacante 2", { x: 20, y: 60 });
    expectAt("Defensor 2", { x: 70, y: 50 });
    expectAt("Cono 1", { x: 80, y: 30 });
    expect(screen.queryByText("Añade fichas y arrástralas a su sitio.")).not.toBeInTheDocument();
  });

  it("sin cambios no hay nada que guardar, pero sí se puede quitar", () => {
    renderEditor(PLAY);

    expect(button("Guardar pizarra")).toBeDisabled();
    expect(button("Quitar pizarra")).toBeEnabled();
    expect(button("Quitar pizarra")).toHaveClass("border-danger", "text-danger", "w-full");
  });

  it("un cambio y su contrario la dejan como estaba: vuelve a no haber nada que guardar", () => {
    renderEditor(PLAY);
    choose("Atacante 2");

    press("Mover la ficha a la derecha");
    expect(button("Guardar pizarra")).toBeEnabled();
    press("Mover la ficha a la izquierda");

    expect(button("Guardar pizarra")).toBeDisabled();
  });

  it("guardar un cambio manda la pizarra entera, con lo que no se ha tocado", async () => {
    renderEditor(PLAY);
    choose("Atacante 2");
    press("Mover la ficha a la derecha");

    const board = await savedBoard();

    expect(board).toEqual({
      ...PLAY,
      tokens: PLAY.tokens.map((item) => (item.id === "a2" ? { ...item, at: { x: 22, y: 60 } } : item)),
    });
  });

  it("las fichas nuevas no repiten el número de las que ya hay", () => {
    renderEditor(PLAY);

    add("atacante", "defensor", "balón", "cono");

    expect(tokenNames().slice(5)).toEqual(["Atacante 3", "Defensor 1", "Balón 2", "Cono 2"]);
  });

  it("«Quitar pizarra» pregunta antes, con su título y su explicación, y no quita nada todavía", async () => {
    renderEditor(PLAY);

    press("Quitar pizarra");

    const confirmation = await dialog();
    expect(confirmation).toHaveAccessibleDescription("El ejercicio se queda sin pizarra. No se puede deshacer.");
    expect(within(confirmation).getByRole("button", { name: "Volver" })).toBeInTheDocument();
    // La confirmación es destructiva: `danger`, nunca el relleno del acento.
    expect(within(confirmation).getByRole("button", { name: "Quitar pizarra" })).toHaveClass(
      "border-danger",
      "text-danger",
    );
    expect(mocks.saveDrillBoard).not.toHaveBeenCalled();
  });

  it("«Volver» cierra el diálogo y no quita nada", async () => {
    renderEditor(PLAY);
    press("Quitar pizarra");

    fireEvent.click(within(await dialog()).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.saveDrillBoard).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(tokenNames()).toHaveLength(5);
  });

  it("al confirmar guarda `board: null` con la copia con la que se abrió, y vuelve a la ficha", async () => {
    renderEditor(PLAY);
    press("Quitar pizarra");

    fireEvent.click(within(await dialog()).getByRole("button", { name: "Quitar pizarra" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DETAIL));
    expect(mocks.saveDrillBoard.mock.calls).toStrictEqual([
      ["club-a", { drillId: DRILL_ID, expectedUpdatedAt: LOADED, board: null }],
    ]);
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });

  it("quita la pizarra aunque haya cambios sin guardar: no los guarda antes", async () => {
    renderEditor(PLAY);
    choose("Atacante 2");
    press("Mover la ficha arriba");
    press("Quitar pizarra");

    fireEvent.click(within(await dialog()).getByRole("button", { name: "Quitar pizarra" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalled());
    expect(mocks.saveDrillBoard).toHaveBeenCalledTimes(1);
    expect(sent().board).toBeNull();
  });

  it("mientras la quita, los botones del diálogo esperan", async () => {
    const pending = deferred<{ updatedAt: string }>();
    mocks.saveDrillBoard.mockReturnValue(pending.promise);
    renderEditor(PLAY);
    press("Quitar pizarra");
    const confirmation = await dialog();

    fireEvent.click(within(confirmation).getByRole("button", { name: "Quitar pizarra" }));

    await waitFor(() => expect(within(confirmation).getByRole("button", { name: "Quitar pizarra" })).toBeDisabled());
    expect(within(confirmation).getByRole("button", { name: "Volver" })).toBeDisabled();
    expect(mocks.saveDrillBoard).toHaveBeenCalledTimes(1);

    pending.finish(ok({ updatedAt: "2026-10-03T10:05:00.654321+00:00" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DETAIL));
  });

  it("si quitarla falla, el diálogo se cierra, se dice el error y no navega", async () => {
    mocks.saveDrillBoard.mockResolvedValue(fail("STALE_COPY"));
    renderEditor(PLAY);
    press("Quitar pizarra");

    fireEvent.click(within(await dialog()).getByRole("button", { name: "Quitar pizarra" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("alert")).toHaveTextContent(ACTION_ERROR_COPY.STALE_COPY);
    expect(button("Recargar")).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    // La pizarra sigue en el editor.
    expect(tokenNames()).toHaveLength(5);
  });

  it("guardarla sin fichas es quitarla, y eso se pregunta: no guarda nada hasta confirmar", async () => {
    renderEditor({ ...STILL, tokens: [A1] });
    choose("Atacante 1");
    press("Quitar ficha");
    expect(button("Guardar pizarra")).toBeEnabled();

    save();

    const confirmation = await dialog();
    expect(mocks.saveDrillBoard).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();

    fireEvent.click(within(confirmation).getByRole("button", { name: "Quitar pizarra" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DETAIL));
    expect(mocks.saveDrillBoard.mock.calls).toStrictEqual([
      ["club-a", { drillId: DRILL_ID, expectedUpdatedAt: LOADED, board: null }],
    ]);
  });

  it("y «Volver» la deja como estaba: sin fichas, sin guardar", async () => {
    renderEditor({ ...STILL, tokens: [A1] });
    choose("Atacante 1");
    press("Quitar ficha");
    save();

    fireEvent.click(within(await dialog()).getByRole("button", { name: "Volver" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(mocks.saveDrillBoard).not.toHaveBeenCalled();
    expect(tokenNames()).toEqual([]);
    expect(button("Guardar pizarra")).toBeEnabled();
  });

  it("sin pizarra previa, quedarse sin fichas no pregunta nada: no hay nada que guardar ni que quitar", () => {
    renderEditor();
    press("Añadir atacante");
    press("Quitar ficha");

    expect(button("Guardar pizarra")).toBeDisabled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

// ── Topes ────────────────────────────────────────────────────────────────────────────

describe("BoardEditor · topes", () => {
  /** `count` jugadores de un equipo, repartidos por la pista. */
  function players(kind: "attacker" | "defender", count: number): BoardToken[] {
    return Array.from({ length: count }, (_, index) => ({
      id: `${kind === "attacker" ? "a" : "d"}${index + 1}`,
      kind,
      label: String(index + 1),
      at: { x: 10 + index * 10, y: kind === "attacker" ? 80 : 40 },
    }));
  }

  const TWELVE_STEPS: BoardStep[] = Array.from({ length: 12 }, (_, index) => ({
    moves: [{ token: "a2", kind: "cut", to: { x: index % 2 === 0 ? 40 : 20, y: 40 } }],
  }));

  it("con doce pasos no deja añadir otro, y dice por qué", () => {
    renderEditor({ ...STILL, steps: TWELVE_STEPS });

    expect(chipNames()).toHaveLength(14);
    expect(button("Añadir paso")).toBeDisabled();
    expect(screen.getByText("Una pizarra tiene como máximo 12 pasos.")).toBeInTheDocument();
  });

  it("con doce pasos tampoco deja duplicar uno; quitar uno vuelve a dejar añadir", () => {
    renderEditor({ ...STILL, steps: TWELVE_STEPS });
    press("Paso 12");
    expect(button("Duplicar paso")).toBeDisabled();

    press("Quitar paso");

    expect(button("Añadir paso")).toBeEnabled();
    expect(button("Duplicar paso")).toBeEnabled();
    expect(screen.queryByText("Una pizarra tiene como máximo 12 pasos.")).not.toBeInTheDocument();
  });

  it("con once pasos deja añadir el duodécimo, y ahí se para", () => {
    renderEditor({ ...STILL, steps: TWELVE_STEPS.slice(0, 11) });
    expect(button("Añadir paso")).toBeEnabled();
    expect(screen.queryByText("Una pizarra tiene como máximo 12 pasos.")).not.toBeInTheDocument();

    press("Añadir paso");

    expect(button("Añadir paso")).toBeDisabled();
    expect(screen.getByText("Una pizarra tiene como máximo 12 pasos.")).toBeInTheDocument();
  });

  it("con veinticuatro fichas no deja añadir ninguna más, y dice por qué", () => {
    const cones: BoardToken[] = Array.from({ length: 5 }, (_, index) => ({
      id: `c${index + 1}`,
      kind: "cone",
      at: { x: 10 + index * 10, y: 10 },
    }));
    renderEditor({
      ...STILL,
      tokens: [...players("attacker", 9), ...players("defender", 9), { ...BALL, at: { x: 50, y: 60 } }, ...cones],
    });

    expect(tokenNames()).toHaveLength(24);
    for (const kind of ["atacante", "defensor", "balón", "cono"]) {
      expect(button(`Añadir ${kind}`)).toBeDisabled();
    }
    expect(screen.getByText("Una pizarra tiene como máximo 24 fichas.")).toBeInTheDocument();
  });

  it("con veintitrés deja añadir la que falta, y ahí se para", () => {
    const cones: BoardToken[] = Array.from({ length: 5 }, (_, index) => ({
      id: `c${index + 1}`,
      kind: "cone",
      at: { x: 10 + index * 10, y: 10 },
    }));
    renderEditor({ ...STILL, tokens: [...players("attacker", 9), ...players("defender", 9), ...cones] });
    expect(screen.queryByText("Una pizarra tiene como máximo 24 fichas.")).not.toBeInTheDocument();

    add("balón");

    expect(tokenNames()).toHaveLength(24);
    expect(button("Añadir cono")).toBeDisabled();
    expect(screen.getByText("Una pizarra tiene como máximo 24 fichas.")).toBeInTheDocument();
  });

  it("con nueve atacantes no deja añadir otro atacante, pero sí lo demás, y dice por qué", () => {
    renderEditor({ ...STILL, tokens: players("attacker", 9) });

    expect(button("Añadir atacante")).toBeDisabled();
    expect(button("Añadir defensor")).toBeEnabled();
    expect(button("Añadir balón")).toBeEnabled();
    expect(button("Añadir cono")).toBeEnabled();
    expect(screen.getByText("Como máximo, 9 atacantes y 9 defensores.")).toBeInTheDocument();
    // No es el tope de fichas: ese no se dice.
    expect(screen.queryByText("Una pizarra tiene como máximo 24 fichas.")).not.toBeInTheDocument();
  });

  it("con nueve defensores, lo mismo con los defensores", () => {
    renderEditor({ ...STILL, tokens: players("defender", 9) });

    expect(button("Añadir defensor")).toBeDisabled();
    expect(button("Añadir atacante")).toBeEnabled();
    expect(screen.getByText("Como máximo, 9 atacantes y 9 defensores.")).toBeInTheDocument();
  });

  it("con ocho de cada no se dice nada; al añadir el noveno, sí", () => {
    renderEditor({ ...STILL, tokens: [...players("attacker", 8), ...players("defender", 8)] });
    expect(screen.queryByText("Como máximo, 9 atacantes y 9 defensores.")).not.toBeInTheDocument();

    add("atacante");

    expect(tokenNames()).toContain("Atacante 9");
    expect(button("Añadir atacante")).toBeDisabled();
    expect(screen.getByText("Como máximo, 9 atacantes y 9 defensores.")).toBeInTheDocument();
  });

  it("con veinticuatro fichas el aviso es el de las fichas, no el de los equipos", () => {
    const cones: BoardToken[] = Array.from({ length: 6 }, (_, index) => ({
      id: `c${index + 1}`,
      kind: "cone",
      at: { x: 10 + index * 10, y: 10 },
    }));
    renderEditor({ ...STILL, tokens: [...players("attacker", 9), ...players("defender", 9), ...cones] });

    expect(screen.getByText("Una pizarra tiene como máximo 24 fichas.")).toBeInTheDocument();
    expect(screen.queryByText("Como máximo, 9 atacantes y 9 defensores.")).not.toBeInTheDocument();
  });

  it("con doce movimientos en un paso, otra ficha no puede moverse en él, y se dice", () => {
    const team = [...players("attacker", 9), ...players("defender", 4)];
    renderEditor({
      ...STILL,
      tokens: team,
      steps: [
        {
          moves: team.slice(0, 12).map((item) => ({
            token: item.id,
            kind: "cut" as const,
            to: { x: item.at.x, y: item.at.y - 20 },
          })),
        },
      ],
    });
    press("Paso 1");

    choose("Defensor 4");

    for (const action of ["Cortar", "Botar", "Bloquear"]) expect(button(action)).toBeDisabled();
    expect(screen.getByText("Un paso tiene como máximo 12 movimientos.")).toBeInTheDocument();

    // Cambiar un movimiento que ya está sí se puede.
    choose("Atacante 1");

    for (const action of ["Cortar", "Botar", "Bloquear"]) expect(button(action)).toBeEnabled();
    expect(screen.queryByText("Un paso tiene como máximo 12 movimientos.")).not.toBeInTheDocument();
  });
});

// ── Accesibilidad ────────────────────────────────────────────────────────────────────

describe("BoardEditor · accesibilidad", () => {
  it("la pista es un grupo con el nombre del ejercicio y de lo que se ve", () => {
    renderEditor(PLAY);

    expect(screen.getByRole("group", { name: `Pizarra de ${TITLE}, Inicio` })).toBe(court());

    press("Paso 1");
    expect(screen.getByRole("group", { name: `Pizarra de ${TITLE}, Paso 1` })).toBe(court());

    press("Paso 2");
    expect(screen.getByRole("group", { name: `Pizarra de ${TITLE}, Paso 2` })).toBe(court());
  });

  it("cada ficha es un botón con su nombre, dentro de la pista y en el orden del tabulador", () => {
    renderEditor(STILL);

    for (const name of ["Atacante 1", "Atacante 2", "Defensor 2", "Balón", "Cono 1"]) {
      const item = screen.getByRole("button", { name });
      expect(court()).toContainElement(item);
      expect(item).toHaveAttribute("tabindex", "0");
      expect(item).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("un jugador sin número se llama solo por lo que es", () => {
    renderEditor({
      ...STILL,
      tokens: [
        { id: "x", kind: "attacker", at: { x: 30, y: 30 } },
        { id: "y", kind: "defender", at: { x: 60, y: 60 } },
      ],
    });

    expect(tokenNames()).toEqual(["Atacante", "Defensor"]);
  });

  it.each([
    ["Enter", "Enter"],
    ["Espacio", " "],
  ])("una ficha se elige con %s", (_name, key) => {
    renderEditor(STILL);

    const handled = !fireEvent.keyDown(token("Defensor 2"), { key });

    expect(token("Defensor 2")).toHaveAttribute("aria-pressed", "true");
    // La tecla es suya: Espacio no desplaza la página.
    expect(handled).toBe(true);
    expect(button("Quitar ficha")).toBeInTheDocument();
  });

  it("las demás teclas no la eligen ni se las queda", () => {
    renderEditor(STILL);

    const passed = fireEvent.keyDown(token("Defensor 2"), { key: "Tab" });

    expect(token("Defensor 2")).toHaveAttribute("aria-pressed", "false");
    expect(passed).toBe(true);
  });

  it("con teclado se dibuja un movimiento entero: ficha, acción, flechas y «Confirmar»", async () => {
    renderEditor(STILL);
    press("Añadir paso");

    fireEvent.keyDown(token("Atacante 2"), { key: "Enter" });
    press("Botar");
    press("Mover el destino a la derecha");
    press("Confirmar");

    expect(drawnKinds()).toEqual(["dribble"]);
    expect((await savedBoard())?.steps[0].moves).toEqual([{ token: "a2", kind: "dribble", to: { x: 22, y: 42 } }]);
  });

  it("con teclado también se pasa a un jugador: Enter sobre quien recibe", async () => {
    renderEditor(STILL);
    press("Añadir paso");
    fireEvent.keyDown(token("Balón"), { key: " " });
    press("Pasar");

    fireEvent.keyDown(token("Atacante 2"), { key: "Enter" });

    expect((await savedBoard())?.steps[0].moves).toEqual([{ token: "b1", kind: "pass", to: { x: 23, y: 60 } }]);
  });

  it("los botones de añadir se nombran con «Añadir»: «Balón» a secas es la ficha", () => {
    renderEditor();

    const names = within(screen.getByRole("group", { name: "Añadir ficha" }))
      .getAllByRole("button")
      .map((item) => item.getAttribute("aria-label"));

    expect(names).toEqual(["Añadir atacante", "Añadir defensor", "Añadir balón", "Añadir cono"]);
    add("balón");
    expect(screen.getAllByRole("button", { name: "Balón" })).toHaveLength(1);
    expect(court()).toContainElement(screen.getByRole("button", { name: "Balón" }));
  });

  it("la píldora de añadir un paso se llama «Añadir paso», aunque a la vista diga «Paso»", () => {
    renderEditor(PLAY);

    const addStep = screen.getByRole("button", { name: "Añadir paso" });
    expect(addStep).toHaveTextContent(/^Paso$/);
    expect(screen.getByRole("group", { name: "Pasos" })).toContainElement(addStep);
    // «Paso» a secas ya no nombra a ningún botón: no se confunde con «Paso 1».
    expect(screen.queryByRole("button", { name: "Paso" })).not.toBeInTheDocument();
  });

  it("la fila de pasos y el panel llevan su marca", () => {
    renderEditor(PLAY);

    expect(screen.getByRole("group", { name: "Pasos" })).toHaveAttribute("data-steps");
    const panel = document.querySelector("[data-panel]");
    expect(panel).toContainElement(screen.getByRole("group", { name: "Añadir ficha" }));
    expect(panel).not.toContainElement(button("Deshacer"));
    expect(panel).not.toContainElement(button("Guardar pizarra"));
  });

  it("los pasos y la pista son grupos con nombre, y lo elegido se marca con aria-pressed", () => {
    renderEditor(PLAY);

    expect(
      within(screen.getByRole("group", { name: "Pasos" }))
        .getAllByRole("button")
        .map((chip) => chip.getAttribute("aria-pressed")),
    ).toEqual(["true", "false", "false", null]);
    expect(
      within(screen.getByRole("group", { name: "Pista" }))
        .getAllByRole("button")
        .map((chip) => [chip.textContent, chip.getAttribute("aria-pressed")]),
    ).toEqual([
      ["Media pista", "true"],
      ["Pista completa", "false"],
    ]);
  });

  it("ningún botón del editor envía un formulario", () => {
    renderEditor(PLAY);

    for (const item of screen.getAllByRole("button")) {
      if (item instanceof HTMLButtonElement) expect(item).toHaveAttribute("type", "button");
    }
  });
});

// ── El foco ──────────────────────────────────────────────────────────────────────────

describe("BoardEditor · el foco no se pierde cuando el control pulsado desaparece", () => {
  it("al añadir una ficha, el foco pasa a ella: ya no hay botón de añadir", () => {
    renderEditor();

    focusAndPress("Añadir atacante");

    expect(token("Atacante 1")).toHaveFocus();
  });

  it("«Listo» lo devuelve al primer control del panel", () => {
    renderEditor();
    press("Añadir atacante");

    focusAndPress("Listo");

    expect(button("Añadir atacante")).toHaveFocus();
  });

  it("«Quitar ficha», también: la ficha ya no está", () => {
    renderEditor(STILL);
    choose("Atacante 2");

    focusAndPress("Quitar ficha");

    expect(button("Añadir atacante")).toHaveFocus();
  });

  it("al elegir una acción, pasa al primer control del destino", () => {
    renderEditor(STILL);
    press("Añadir paso");
    choose("Atacante 2");

    focusAndPress("Cortar");

    expect(button("Mover el destino a la izquierda")).toHaveFocus();
  });

  it.each(["Confirmar", "Cancelar"])("«%s» lo devuelve a la ficha elegida", (control) => {
    renderEditor(STILL);
    press("Añadir paso");
    choose("Atacante 2");
    press("Cortar");

    focusAndPress(control);

    expect(token("Atacante 2")).toHaveFocus();
  });

  it("si el destino está demasiado cerca, «Confirmar» sigue ahí y conserva el foco", () => {
    renderEditor(STILL);
    press("Añadir paso");
    choose("Atacante 2");
    press("Cortar");
    for (let touch = 0; touch < 9; touch += 1) press("Mover el destino abajo");

    focusAndPress("Confirmar");

    expect(button("Confirmar")).toHaveFocus();
  });

  it("«Quitar movimiento» lo devuelve a la ficha", () => {
    renderEditor(PLAY);
    press("Paso 1");
    choose("Atacante 1");

    focusAndPress("Quitar movimiento");

    expect(token("Atacante 1")).toHaveFocus();
  });

  it("«Añadir paso» en el tope: el botón se desactiva y el foco pasa al panel del paso nuevo", () => {
    renderEditor({
      ...STILL,
      steps: Array.from({ length: 11 }, () => ({ moves: [{ token: "a2", kind: "cut" as const, to: { x: 40, y: 30 } }] })),
    });

    focusAndPress("Añadir paso");

    expect(button("Añadir paso")).toBeDisabled();
    expect(screen.getByLabelText("Nota del paso")).toHaveFocus();
  });

  it("«Quitar paso» en el último lo lleva al panel de lo que queda a la vista", () => {
    renderEditor({ ...STILL, steps: [{ moves: [{ token: "a2", kind: "cut", to: { x: 40, y: 30 } }] }] });
    press("Paso 1");

    focusAndPress("Quitar paso");

    expect(button("Inicio")).toHaveAttribute("aria-pressed", "true");
    expect(button("Añadir atacante")).toHaveFocus();
  });

  it("«Deshacer» hasta agotarlo: se desactiva y el foco pasa al panel", () => {
    renderEditor();
    add("atacante");

    focusAndPress("Deshacer");

    expect(button("Deshacer")).toBeDisabled();
    expect(button("Añadir atacante")).toHaveFocus();
  });

  it("un control que sigue ahí conserva el foco: las flechas se pulsan varias veces seguidas", () => {
    renderEditor(STILL);
    choose("Atacante 2");

    focusAndPress("Mover la ficha arriba");
    press("Mover la ficha arriba");

    expect(button("Mover la ficha arriba")).toHaveFocus();
  });

  it("no roba el foco a quien lo tiene fuera del editor", () => {
    render(
      <>
        <input aria-label="Fuera del editor" />
        <BoardEditor clubSlug="club-a" drillId={DRILL_ID} title={TITLE} initialBoard={null} expectedUpdatedAt={LOADED} />
      </>,
    );
    press("Añadir atacante");
    const outside = screen.getByLabelText("Fuera del editor");
    // «Listo» tuvo el foco, pero quien va con teclado ya está en otra parte cuando desaparece.
    button("Listo").focus();
    outside.focus();

    press("Listo");

    expect(screen.queryByRole("button", { name: "Listo" })).not.toBeInTheDocument();
    expect(outside).toHaveFocus();
  });

  it("sin haber tenido el foco (se toca con el dedo o el ratón) no lo pone en ningún sitio", () => {
    renderEditor();

    press("Añadir atacante");
    press("Listo");

    expect(document.body).toHaveFocus();
  });
});

// ── Cambios sin guardar ──────────────────────────────────────────────────────────────

describe("BoardEditor · cambios sin guardar", () => {
  /**
   * Lo que haría el navegador al cerrar o recargar la pestaña: lanza `beforeunload` y dice si
   * algo pidió confirmación (cancelando el evento).
   */
  function unloadAsks(): boolean {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  }

  /**
   * Pulsa un enlace y dice si el clic llegó a navegar. jsdom no implementa la navegación (la
   * registra como error): el clic se corta en `document`, ya después de que React y el
   * componente lo hayan visto, y se mira si el componente lo había cancelado.
   */
  function clickLink(link: HTMLElement): "navega" | "se queda" {
    let outcome: "navega" | "se queda" = "navega";
    const cut = (event: Event) => {
      outcome = event.defaultPrevented ? "se queda" : "navega";
      event.preventDefault();
    };
    document.addEventListener("click", cut);
    fireEvent.click(link);
    document.removeEventListener("click", cut);
    return outcome;
  }

  const leaveDialog = () => screen.queryByRole("alertdialog", { name: "¿Salir sin guardar?" });

  /** El editor junto a un enlace que no es suyo (la cabecera, la navegación de la app). */
  function renderWithNav(board: Board | null = PLAY): HTMLElement {
    render(
      <>
        <nav aria-label="Principal">
          <Link href={DETAIL} prefetch={false}>
            Volver
          </Link>
        </nav>
        <BoardEditor
          clubSlug="club-a"
          drillId={DRILL_ID}
          title={TITLE}
          initialBoard={board}
          expectedUpdatedAt={LOADED}
        />
      </>,
    );
    return screen.getByRole("link", { name: "Volver" });
  }

  it("sin cambios se sale sin preguntar: ni por un enlace ni al cerrar la pestaña", () => {
    const back = renderWithNav();

    expect(unloadAsks()).toBe(false);
    expect(clickLink(back)).toBe("navega");
    expect(leaveDialog()).not.toBeInTheDocument();
  });

  it("elegir una ficha, cambiar de paso o mirar la vista previa no son cambios", () => {
    const back = renderWithNav();
    choose("Atacante 1");
    press("Paso 1");
    press("Vista previa");

    expect(unloadAsks()).toBe(false);
    expect(clickLink(back)).toBe("navega");
  });

  it("con cambios, cerrar o recargar la pestaña pide confirmación", () => {
    renderWithNav();
    choose("Atacante 2");

    press("Mover la ficha arriba");

    expect(unloadAsks()).toBe(true);
  });

  it("con cambios, un enlace pregunta y no navega; «Salir sin guardar» lleva a su destino", () => {
    const back = renderWithNav(null);
    press("Añadir atacante");

    expect(clickLink(back)).toBe("se queda");

    expect(leaveDialog()).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();

    press("Salir sin guardar");

    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(DETAIL);
    expect(mocks.saveDrillBoard).not.toHaveBeenCalled();
  });

  it("«Seguir editando» deja la pizarra como estaba, y otro toque vuelve a preguntar", () => {
    const back = renderWithNav(null);
    press("Añadir atacante");
    clickLink(back);

    fireEvent.click(within(leaveDialog() as HTMLElement).getByRole("button", { name: "Seguir editando" }));

    expect(leaveDialog()).not.toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(tokenNames()).toEqual(["Atacante 1"]);
    expect(clickLink(back)).toBe("se queda");
  });

  it("volver a dejarla como estaba quita la pregunta", () => {
    const back = renderWithNav();
    choose("Atacante 2");
    press("Mover la ficha arriba");
    expect(unloadAsks()).toBe(true);

    press("Deshacer");

    expect(unloadAsks()).toBe(false);
    expect(clickLink(back)).toBe("navega");
  });

  it("tras guardar bien ya no pregunta: se va a propósito", async () => {
    const back = renderWithNav(null);
    press("Añadir atacante");

    save();

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DETAIL));
    expect(unloadAsks()).toBe(false);
    expect(clickLink(back)).toBe("navega");
    expect(leaveDialog()).not.toBeInTheDocument();
  });

  it("si guardar falla, lo dibujado sigue sin guardar y el aviso se queda", async () => {
    mocks.saveDrillBoard.mockResolvedValue(fail("SAVE_FAILED"));
    renderWithNav(null);
    press("Añadir atacante");

    save();

    await screen.findByRole("alert");
    expect(unloadAsks()).toBe(true);
  });

  it("«Recargar» tras una copia obsoleta se salta el aviso: quien recarga ya ha decidido", async () => {
    mocks.saveDrillBoard.mockResolvedValue(fail("STALE_COPY"));
    let askedWhileReloading: boolean | null = null;
    mocks.reload.mockImplementation(() => {
      askedWhileReloading = unloadAsks();
    });
    renderWithNav(null);
    press("Añadir atacante");
    save();
    await screen.findByRole("alert");
    expect(unloadAsks()).toBe(true);

    press("Recargar");

    expect(mocks.reload).toHaveBeenCalledTimes(1);
    expect(askedWhileReloading).toBe(false);
  });

  it("tras quitar la pizarra tampoco pregunta al salir", async () => {
    renderWithNav();
    choose("Atacante 2");
    press("Mover la ficha arriba");
    press("Quitar pizarra");

    fireEvent.click(
      within(await screen.findByRole("alertdialog", { name: "¿Quitar la pizarra?" })).getByRole("button", {
        name: "Quitar pizarra",
      }),
    );

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith(DETAIL));
    expect(unloadAsks()).toBe(false);
  });
});

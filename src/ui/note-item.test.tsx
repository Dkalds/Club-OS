import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CoachNote } from "@/modules/development/types";
import { NoteItem } from "./note-item";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const NOTE: CoachNote = {
  id: "n1",
  body: "Mejor en defensa.\nHablar con él del rebote.",
  visibility: "private",
  writtenOn: "Martes 6 oct",
  edited: false,
  authorName: "Eva Luz",
  isMine: true,
};

const renderItem = (note: CoachNote, actions?: React.ReactNode) =>
  render(
    <ul>
      <NoteItem note={note} actions={actions} />
    </ul>,
  );

describe("NoteItem", () => {
  it("el texto respeta sus saltos de línea; debajo, quién, cuándo y quién la lee", () => {
    renderItem(NOTE);

    expect(screen.getByText(/Mejor en defensa\./)).toHaveClass("whitespace-pre-line");
    expect(screen.getByText("Eva Luz · Martes 6 oct")).toBeInTheDocument();
    expect(screen.getByText("Solo yo")).toBeInTheDocument();
  });

  it("una del cuerpo técnico lo dice; una editada, también", () => {
    renderItem({ ...NOTE, visibility: "staff", edited: true, isMine: false });

    expect(screen.getByText("Cuerpo técnico")).toBeInTheDocument();
    expect(screen.getByText("Eva Luz · Martes 6 oct · Editada")).toBeInTheDocument();
  });

  it("sin ficha de autor, «Dirección»", () => {
    renderItem({ ...NOTE, authorName: null });

    expect(screen.getByText("Dirección · Martes 6 oct")).toBeInTheDocument();
  });

  it("pinta las acciones que le den", () => {
    renderItem(NOTE, <button type="button">Editar</button>);

    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
  });
});

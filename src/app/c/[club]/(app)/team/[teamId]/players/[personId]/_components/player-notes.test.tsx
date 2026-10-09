import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoachNote } from "@/modules/development/types";

const mocks = vi.hoisted(() => ({ createNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }));

vi.mock("@/modules/development/actions", () => mocks);

import { PlayerNotes } from "./player-notes";

// Datos neutros: los tests de `src/` no nombran a ningún club (pnpm check:guards).
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const note = (n: number, extra: Partial<CoachNote> = {}): CoachNote => ({
  id: uuid(200 + n),
  body: `Nota ${n}`,
  visibility: "private",
  writtenOn: "Martes 6 oct",
  edited: false,
  authorName: "Eva Luz",
  isMine: true,
  ...extra,
});

function renderNotes(notes: CoachNote[] = [note(1), note(2, { isMine: false, visibility: "staff", authorName: "Ana Ríos" })]) {
  return render(<PlayerNotes clubSlug="club-a" teamId={uuid(1)} personId={uuid(2)} notes={notes} canWrite />);
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const fn of Object.values(mocks)) fn.mockResolvedValue({ ok: true, data: null });
});

describe("PlayerNotes", () => {
  it("solo las notas propias se editan y se borran", () => {
    renderNotes();

    const [mine, theirs] = screen.getAllByRole("listitem");
    expect(within(mine!).getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(within(theirs!).queryByRole("button")).not.toBeInTheDocument();
  });

  it("una nota nueva nace «Solo yo»", async () => {
    renderNotes([]);

    expect(screen.getByText("Aún no hay notas.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Añadir nota" }));
    const sheet = screen.getByRole("dialog", { name: "Nueva nota" });
    expect(within(sheet).getByLabelText("Quién la lee")).toHaveValue("private");
    fireEvent.change(within(sheet).getByLabelText("Nota"), { target: { value: "Mejor en defensa" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Guardar nota" }));

    await waitFor(() => expect(mocks.createNote).toHaveBeenCalledWith("club-a", {
      teamId: uuid(1),
      personId: uuid(2),
      body: "Mejor en defensa",
      visibility: "private",
    }));
  });

  it("borrar pide confirmación y dice que es para siempre", async () => {
    renderNotes();

    fireEvent.click(screen.getByRole("button", { name: "Borrar" }));
    const dialog = screen.getByRole("alertdialog", { name: "¿Borrar esta nota?" });
    expect(within(dialog).getByText("Se borrará para siempre.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Borrar" }));

    await waitFor(() => expect(mocks.deleteNote).toHaveBeenCalledWith("club-a", { noteId: uuid(201) }));
  });

  it("editar parte del texto y la visibilidad de la nota", async () => {
    renderNotes();

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    const sheet = screen.getByRole("dialog", { name: "Editar nota" });
    expect(within(sheet).getByLabelText("Nota")).toHaveValue("Nota 1");
    fireEvent.change(within(sheet).getByLabelText("Quién la lee"), { target: { value: "staff" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Guardar nota" }));

    await waitFor(() => expect(mocks.updateNote).toHaveBeenCalledWith("club-a", { noteId: uuid(201), body: "Nota 1", visibility: "staff" }));
  });
});
